/**
 * pi-exa — minimal API key manager for the Exa web-research skill.
 *
 * Architecture (v0.3.x):
 *   - The actual Exa calls happen in skills/exa/scripts/exa.mjs, a small
 *     Node CLI that imports exa-js directly. No MCP server, no adapter.
 *   - The skill (skills/exa/SKILL.md) teaches the model how and when to
 *     invoke that CLI. Only the skill metadata (~120 tokens) sits in the
 *     system prompt; the body loads on demand. No registerTool here.
 *   - This extension only exposes two slash commands:
 *       /exa-auth <key>   save (or --clear) the API key
 *       /exa-status       show whether the key is in place
 *     The key lives at ~/.pi/exa.config.json (mode 0600), the same path
 *     the CLI reads from. Nothing else is touched: no mcp.json edits,
 *     no env injection, no global state.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const HOME_DIR = process.env.HOME ?? process.cwd();
const KEY_PATH = path.join(HOME_DIR, ".pi", "exa.config.json");

type KeyFile = {
	apiKey?: string;
	[key: string]: unknown;
};

function readKeyFile(): KeyFile {
	if (!existsSync(KEY_PATH)) return {};
	try {
		return JSON.parse(readFileSync(KEY_PATH, "utf-8")) as KeyFile;
	} catch {
		return {};
	}
}

function writeKeyFile(file: KeyFile): void {
	mkdirSync(path.dirname(KEY_PATH), { recursive: true });
	writeFileSync(KEY_PATH, JSON.stringify(file, null, 2) + "\n", {
		encoding: "utf-8",
		mode: 0o600,
	});
}

function maskKey(key: string): string {
	if (!key) return "(missing)";
	if (key.length <= 8) return `${key.slice(0, 2)}***${key.slice(-1)}`;
	return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export default function exaExtension(pi: ExtensionAPI) {
	pi.registerCommand("exa-status", {
		description: "Show whether an Exa API key is saved for the exa skill",
		handler: async (_args, ctx) => {
			try {
				const keyFile = readKeyFile();
				const saved = typeof keyFile.apiKey === "string" ? keyFile.apiKey : "";
				const envKey = process.env.EXA_API_KEY ?? "";

				const lines: string[] = [
					"Exa key status",
					"",
					`Key file: ${KEY_PATH}`,
					`  saved key:     ${saved ? maskKey(saved) : "(not set)"}`,
					`  EXA_API_KEY:   ${envKey ? maskKey(envKey) : "(not in env)"}`,
					"",
				];

				if (saved || envKey) {
					lines.push("Ready. The exa skill's CLI will pick this up automatically.");
					lines.push("Try it with: /skill:pi-exa  (or just ask the agent to search the web)");
				} else {
					lines.push("No key found.");
					lines.push("Get one from https://dashboard.exa.ai and run:");
					lines.push("  /exa-auth <your-key>");
				}

				ctx.ui.notify(lines.join("\n"), saved || envKey ? "info" : "warning");
			} catch (error) {
				ctx.ui.notify(`Exa status error: ${(error as Error).message}`, "error");
			}
		},
	});

	pi.registerCommand("exa-auth", {
		description: "Save the Exa API key for the exa skill (use --clear to forget)",
		handler: async (args, ctx) => {
			try {
				const trimmed = args.trim();

				if (trimmed === "--clear") {
					const keyFile = readKeyFile();
					delete keyFile.apiKey;
					writeKeyFile(keyFile);
					ctx.ui.notify(`Cleared Exa API key from ${KEY_PATH}.`, "info");
					return;
				}

				const provided =
					trimmed || (await ctx.ui.input("Exa API key:", ""))?.trim() || "";
				if (!provided) {
					ctx.ui.notify("No API key provided", "warning");
					return;
				}

				const keyFile = readKeyFile();
				keyFile.apiKey = provided;
				writeKeyFile(keyFile);

				ctx.ui.notify(
					[
						`Saved Exa API key to ${KEY_PATH} (${maskKey(provided)}).`,
						"The exa skill's CLI will read it from there on next call.",
						"No /reload needed — the CLI re-reads the file every time.",
					].join("\n"),
					"info",
				);
			} catch (error) {
				ctx.ui.notify(`Exa auth error: ${(error as Error).message}`, "error");
			}
		},
	});
}
