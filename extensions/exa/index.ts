/**
 * pi-exa — thin Exa MCP configuration helper
 *
 * The actual Exa tools (web_search_exa, web_fetch_exa, etc.) come from Exa's
 * official remote MCP server (https://mcp.exa.ai/mcp), exposed through
 * pi-mcp-adapter. This extension only manages the API key and the
 * `mcpServers.exa` entry in the user's pi-global MCP config so that the model
 * never pays the permanent context cost of Exa-specific tool definitions or
 * routing prose — they live on demand behind the `mcp` proxy and Exa's own
 * tool descriptions.
 *
 * Responsibilities:
 *  - Persist the API key in ~/.pi/exa.config.json (mode 0600)
 *  - Re-export it as process.env.EXA_API_KEY at module-load time so that
 *    pi-mcp-adapter's `${EXA_API_KEY}` interpolation resolves on first connect
 *  - Provision/maintain mcpServers.exa in ~/.pi/agent/mcp.json
 *  - Provide /exa-status, /exa-auth, /exa-config slash commands
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ─── constants & paths ────────────────────────────────────────────────

const HOME_DIR = process.env.HOME ?? process.cwd();
const EXA_KEY_PATH = path.join(HOME_DIR, ".pi", "exa.config.json");
const PI_GLOBAL_MCP_PATH = path.join(HOME_DIR, ".pi", "agent", "mcp.json");

const EXA_API_KEY_ENV = "EXA_API_KEY";
const EXA_MCP_URL = "https://mcp.exa.ai/mcp";
const DEFAULT_DIRECT_TOOLS: readonly string[] = ["web_search_exa", "web_fetch_exa"];

// pi-mcp-adapter discovery chain (later wins on whole-server merge)
function getMcpDiscoveryPaths(cwd: string = process.cwd()): Array<{ label: string; path: string }> {
  return [
    { label: "user-global standard MCP", path: path.join(HOME_DIR, ".config", "mcp", "mcp.json") },
    { label: "Pi global override", path: PI_GLOBAL_MCP_PATH },
    { label: "project standard MCP", path: path.resolve(cwd, ".mcp.json") },
    { label: "project Pi override", path: path.resolve(cwd, ".pi", "mcp.json") },
  ];
}

// ─── types ────────────────────────────────────────────────────────────

type ExaKeyFile = {
  apiKey?: string;
  // Older versions stored many more fields here. We ignore them on read and
  // never write them back, but we do not strip them (avoid clobbering data
  // we don't own).
  [key: string]: unknown;
};

type McpServerEntry = {
  url?: string;
  headers?: Record<string, string>;
  directTools?: boolean | string[];
  [key: string]: unknown;
};

type McpConfigFile = {
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
};

// ─── key file helpers ─────────────────────────────────────────────────

function readKeyFile(): ExaKeyFile {
  if (!existsSync(EXA_KEY_PATH)) return {};
  try {
    return JSON.parse(readFileSync(EXA_KEY_PATH, "utf-8")) as ExaKeyFile;
  } catch {
    return {};
  }
}

function writeKeyFile(file: ExaKeyFile): void {
  mkdirSync(path.dirname(EXA_KEY_PATH), { recursive: true });
  writeFileSync(EXA_KEY_PATH, JSON.stringify(file, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600,
  });
}

function maskApiKey(apiKey: string): string {
  if (!apiKey) return "(missing)";
  if (apiKey.length <= 8) return `${apiKey.slice(0, 2)}***${apiKey.slice(-1)}`;
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

// ─── early env injection ──────────────────────────────────────────────
// pi-mcp-adapter resolves `${EXA_API_KEY}` in `headers` lazily, on first
// server connect — but its module is imported at extension load time. As long
// as we set process.env before the first MCP tool call, the interpolation
// will succeed. Doing it at module top is the earliest, safest moment.

function applyKeyToEnv(): void {
  const file = readKeyFile();
  const saved = typeof file.apiKey === "string" ? file.apiKey : "";
  if (saved && !process.env[EXA_API_KEY_ENV]) {
    process.env[EXA_API_KEY_ENV] = saved;
  }
}

applyKeyToEnv();

// ─── mcp.json helpers ─────────────────────────────────────────────────

function readMcpFile(p: string): McpConfigFile {
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as McpConfigFile;
  } catch {
    return {};
  }
}

function writeMcpFile(p: string, file: McpConfigFile): void {
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(file, null, 2) + "\n", { encoding: "utf-8" });
}

function buildDefaultExaServerEntry(directTools: McpServerEntry["directTools"] = [...DEFAULT_DIRECT_TOOLS]): McpServerEntry {
  return {
    url: EXA_MCP_URL,
    headers: { "x-api-key": "${" + EXA_API_KEY_ENV + "}" },
    directTools,
  };
}

type LocatedEntry = {
  path: string;
  label: string;
  entry: McpServerEntry;
};

function locateExaServer(cwd: string = process.cwd()): LocatedEntry | null {
  // Walk the chain in pi-mcp-adapter's load order; return the LAST match
  // because that's the one mcp adapter would actually pick (later wins).
  let result: LocatedEntry | null = null;
  for (const source of getMcpDiscoveryPaths(cwd)) {
    const file = readMcpFile(source.path);
    const entry = file.mcpServers?.exa;
    if (entry) result = { path: source.path, label: source.label, entry };
  }
  return result;
}

type EnsureResult = {
  action: "created" | "updated" | "kept";
  path: string;
  entry: McpServerEntry;
};

function ensureExaServerInPiGlobal(directTools?: McpServerEntry["directTools"]): EnsureResult {
  const file = readMcpFile(PI_GLOBAL_MCP_PATH);
  const existing = file.mcpServers?.exa;

  if (!existing) {
    const created = buildDefaultExaServerEntry(directTools);
    file.mcpServers = { ...(file.mcpServers ?? {}), exa: created };
    writeMcpFile(PI_GLOBAL_MCP_PATH, file);
    return { action: "created", path: PI_GLOBAL_MCP_PATH, entry: created };
  }

  // Preserve any user customizations; only fill gaps and refresh directTools
  // when the caller explicitly asked for a change.
  const desired = buildDefaultExaServerEntry();
  const merged: McpServerEntry = {
    ...existing,
    url: existing.url ?? desired.url,
    headers: existing.headers ?? desired.headers,
    directTools: directTools ?? existing.directTools ?? desired.directTools,
  };

  if (JSON.stringify(merged) === JSON.stringify(existing)) {
    return { action: "kept", path: PI_GLOBAL_MCP_PATH, entry: existing };
  }

  file.mcpServers = { ...(file.mcpServers ?? {}), exa: merged };
  writeMcpFile(PI_GLOBAL_MCP_PATH, file);
  return { action: "updated", path: PI_GLOBAL_MCP_PATH, entry: merged };
}

function describeMcpEntry(entry: McpServerEntry): string {
  const directTools = Array.isArray(entry.directTools)
    ? entry.directTools.join(", ")
    : entry.directTools === true
      ? "all"
      : entry.directTools === false
        ? "none (proxy only)"
        : "(unset)";
  const headers = entry.headers
    ? Object.entries(entry.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
    : "(unset)";
  return [
    `url: ${entry.url ?? "(unset)"}`,
    `headers: ${headers}`,
    `directTools: ${directTools}`,
  ].join("\n");
}

// ─── extension entry point ────────────────────────────────────────────

export default function exaExtension(pi: ExtensionAPI) {
  // Re-apply on every load. Cheap, and recovers if process.env was cleared
  // by some other code between module init and now.
  applyKeyToEnv();

  pi.registerCommand("exa-status", {
    description: "Show Exa MCP key and config status",
    handler: async (_args, ctx) => {
      try {
        const keyFile = readKeyFile();
        const savedKey = typeof keyFile.apiKey === "string" ? keyFile.apiKey : "";
        const envKey = process.env[EXA_API_KEY_ENV] ?? "";
        const located = locateExaServer();

        const lines: string[] = [
          "Exa MCP status",
          "",
          `API key store: ${EXA_KEY_PATH}`,
          `  saved key:        ${maskApiKey(savedKey)}`,
          `  ${EXA_API_KEY_ENV}:    ${envKey ? maskApiKey(envKey) : "(missing in process.env)"}`,
          "",
        ];

        if (located) {
          lines.push(`mcpServers.exa is defined in: ${located.label}`);
          lines.push(`  ${located.path}`);
          for (const l of describeMcpEntry(located.entry).split("\n")) {
            lines.push(`  ${l}`);
          }
          lines.push("");
          lines.push("Tools come from the official Exa MCP. Run /mcp tools to see them.");
        } else {
          lines.push("mcpServers.exa: not configured anywhere on the discovery chain");
          lines.push(`  Run /exa-auth <key> to provision it in ${PI_GLOBAL_MCP_PATH}`);
        }

        const ok = located != null && (envKey || savedKey);
        ctx.ui.notify(lines.join("\n"), ok ? "info" : "warning");
      } catch (error) {
        ctx.ui.notify(`Exa status error: ${(error as Error).message}`, "error");
      }
    },
  });

  pi.registerCommand("exa-auth", {
    description: "Save (or --clear) the Exa API key and ensure the MCP entry exists",
    handler: async (args, ctx) => {
      try {
        const trimmed = args.trim();

        if (trimmed === "--clear") {
          const keyFile = readKeyFile();
          delete keyFile.apiKey;
          writeKeyFile(keyFile);
          delete process.env[EXA_API_KEY_ENV];
          ctx.ui.notify(
            `Cleared Exa API key from ${EXA_KEY_PATH}.\nMCP entry left in place. Run /reload for the change to take effect.`,
            "info",
          );
          return;
        }

        const providedKey =
          trimmed || (await ctx.ui.input("Exa API key:", ""))?.trim() || "";
        if (!providedKey) {
          ctx.ui.notify("No API key provided", "warning");
          return;
        }

        const keyFile = readKeyFile();
        keyFile.apiKey = providedKey;
        writeKeyFile(keyFile);
        process.env[EXA_API_KEY_ENV] = providedKey;

        const result = ensureExaServerInPiGlobal();
        const located = locateExaServer();

        const summary: string[] = [
          `Saved Exa API key to ${EXA_KEY_PATH} (${maskApiKey(providedKey)})`,
          `Set ${EXA_API_KEY_ENV} in process.env`,
        ];

        if (result.action === "created") {
          summary.push(`Added mcpServers.exa to ${PI_GLOBAL_MCP_PATH}`);
        } else if (result.action === "updated") {
          summary.push(`Refreshed mcpServers.exa in ${PI_GLOBAL_MCP_PATH}`);
        } else if (located && located.path !== PI_GLOBAL_MCP_PATH) {
          summary.push(
            `Note: mcpServers.exa is also defined in ${located.label} (${located.path}); it overrides the pi-global entry.`,
          );
        } else {
          summary.push(`mcpServers.exa already configured in ${PI_GLOBAL_MCP_PATH}; no change needed.`);
        }

        summary.push("Run /reload to apply.");
        ctx.ui.notify(summary.join("\n"), "info");
      } catch (error) {
        ctx.ui.notify(`Exa auth error: ${(error as Error).message}`, "error");
      }
    },
  });

  pi.registerCommand("exa-config", {
    description: "Edit the Exa MCP entry (directTools selection, restore defaults)",
    handler: async (_args, ctx) => {
      try {
        while (true) {
          const located = locateExaServer();

          if (!located) {
            const create = await ctx.ui.confirm(
              "No Exa MCP entry found",
              `Create mcpServers.exa in ${PI_GLOBAL_MCP_PATH} with default values?`,
            );
            if (!create) return;
            ensureExaServerInPiGlobal();
            ctx.ui.notify(`Created default Exa MCP entry in ${PI_GLOBAL_MCP_PATH}.`, "info");
            continue;
          }

          if (located.path !== PI_GLOBAL_MCP_PATH) {
            ctx.ui.notify(
              [
                `mcpServers.exa is currently defined in: ${located.label}`,
                `  ${located.path}`,
                "",
                `pi-exa only manages ${PI_GLOBAL_MCP_PATH}.`,
                "Edit the file above directly, or remove its `exa` entry and re-run /exa-auth.",
              ].join("\n"),
              "warning",
            );
            return;
          }

          const choice = await ctx.ui.select(
            `Exa MCP entry (${PI_GLOBAL_MCP_PATH})\n\n${describeMcpEntry(located.entry)}\n\nWhat would you like to change?`,
            [
              "Set directTools preset",
              "Reset entry to defaults",
              "Print path for manual edit",
              "Done",
            ],
          );

          if (!choice || choice === "Done") return;

          if (choice === "Set directTools preset") {
            const presets = [
              "lean: web_search_exa, web_fetch_exa (recommended)",
              "+ advanced: web_search_exa, web_fetch_exa, web_search_advanced_exa",
              "all (every Exa tool registered as direct)",
              "proxy only (no direct tools — discover via mcp() search)",
              "Cancel",
            ];
            const picked = await ctx.ui.select("Choose directTools preset:", presets);
            if (!picked || picked === "Cancel") continue;

            let directTools: McpServerEntry["directTools"];
            if (picked.startsWith("lean:")) {
              directTools = [...DEFAULT_DIRECT_TOOLS];
            } else if (picked.startsWith("+ advanced:")) {
              directTools = ["web_search_exa", "web_fetch_exa", "web_search_advanced_exa"];
            } else if (picked.startsWith("all")) {
              directTools = true;
            } else {
              directTools = false;
            }

            const file = readMcpFile(PI_GLOBAL_MCP_PATH);
            file.mcpServers = file.mcpServers ?? {};
            const current = (file.mcpServers.exa ?? {}) as McpServerEntry;
            file.mcpServers.exa = { ...current, directTools };
            writeMcpFile(PI_GLOBAL_MCP_PATH, file);
            ctx.ui.notify("Updated directTools. Run /reload to apply.", "info");
            continue;
          }

          if (choice === "Reset entry to defaults") {
            const ok = await ctx.ui.confirm(
              "Reset Exa MCP entry?",
              `Replace mcpServers.exa in ${PI_GLOBAL_MCP_PATH} with the default url, headers, and directTools list.`,
            );
            if (!ok) continue;
            const file = readMcpFile(PI_GLOBAL_MCP_PATH);
            file.mcpServers = { ...(file.mcpServers ?? {}), exa: buildDefaultExaServerEntry() };
            writeMcpFile(PI_GLOBAL_MCP_PATH, file);
            ctx.ui.notify("Reset Exa MCP entry to defaults. Run /reload to apply.", "info");
            continue;
          }

          if (choice === "Print path for manual edit") {
            ctx.ui.notify(
              `Open this file in your editor and edit mcpServers.exa freely:\n${PI_GLOBAL_MCP_PATH}\n\nRun /reload after saving.`,
              "info",
            );
            return;
          }
        }
      } catch (error) {
        ctx.ui.notify(`Exa config error: ${(error as Error).message}`, "error");
      }
    },
  });
}
