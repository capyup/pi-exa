# pi-exa

Thin [Exa](https://exa.ai/) MCP configuration helper for [pi](https://github.com/badlogic/pi-mono).

> **Heads up — this is a breaking change vs. v0.1.x.** pi-exa no longer ships its own
> Exa tools or system-prompt section. Instead it provisions the official Exa MCP
> server (`https://mcp.exa.ai/mcp`) through [pi-mcp-adapter](https://www.npmjs.com/package/pi-mcp-adapter)
> and stays out of the model's context. See [Migration from v0.1.x](#migration-from-v01x).

## Why

The previous version registered nine bespoke Exa tools (`exa-search`, `exa-answer`,
`exa-contents`, `exa-code-context`, `exa-company-research`, `exa-linkedin-search`,
`exa-crawl`, `exa-deep-research-start`, `exa-deep-research-check`) plus a routing
system-prompt. That meant **~3 kB of Exa-specific instructions and JSON schemas
in the model's context on every turn** — including for sessions that never used
Exa at all.

Meanwhile:

- Exa runs an **official remote MCP server** at `https://mcp.exa.ai/mcp`.
- Their own docs **deprecate** `get_code_context_exa`, `company_research_exa`,
  `crawling_exa`, `people_search_exa`, `linkedin_search_exa`,
  `deep_researcher_start`, `deep_researcher_check`, `deep_search_exa` in favor
  of the unified `web_search_exa`, `web_fetch_exa`, and `web_search_advanced_exa`.
- pi already has [`pi-mcp-adapter`](https://www.npmjs.com/package/pi-mcp-adapter)
  which exposes MCP tools through one ~200-token `mcp` proxy and lets you
  promote selected tools to first-class via `directTools`.

So this package now does the smallest thing that's useful:

1. Persists your Exa API key in `~/.pi/exa.config.json` (mode `0600`).
2. Re-exports it as `process.env.EXA_API_KEY` at extension-load time.
3. Provisions `mcpServers.exa` in `~/.pi/agent/mcp.json` with the right URL,
   header, and a sensible default `directTools` list.
4. Provides three slash commands — `/exa-status`, `/exa-auth`, `/exa-config` —
   to manage the above.

Permanent context cost after install: **~400 tokens** for the two default
direct tools (`web_search_exa`, `web_fetch_exa`), plus pi-mcp-adapter's `mcp`
proxy. The rarely-used tools (advanced search, etc.) are still available via
`mcp({ search: "..." })` on demand.

## Prerequisites

You need [`pi-mcp-adapter`](https://www.npmjs.com/package/pi-mcp-adapter) installed:

```bash
pi install npm:pi-mcp-adapter
```

## Install

```bash
pi install git:github.com/lulucatdev/pi-exa
```

Then provision the API key and MCP entry:

```text
/exa-auth <your-exa-api-key>
/reload
```

That's it. After `/reload`, `web_search_exa` and `web_fetch_exa` show up as
direct tools the model can call. The first call wakes the Exa server up;
subsequent calls reuse the connection.

To verify:

```text
/exa-status
/mcp tools
```

## Update

```bash
pi update https://github.com/lulucatdev/pi-exa.git
```

## Slash commands

| Command | What it does |
| --- | --- |
| `/exa-status` | Show key state, where `mcpServers.exa` is defined, and the resolved entry. |
| `/exa-auth <key>` | Save the API key, set `process.env.EXA_API_KEY`, and ensure `mcpServers.exa` exists. |
| `/exa-auth --clear` | Forget the saved key. The MCP entry is left in place. |
| `/exa-config` | Pick a `directTools` preset (lean / + advanced / all / proxy-only) or reset the entry to defaults. |

`directTools` presets:

- **lean** *(default)*: `["web_search_exa", "web_fetch_exa"]` — the two tools
  Exa enables by default. ~400 tokens permanent.
- **+ advanced**: adds `web_search_advanced_exa` for date / domain / category
  filters and subpage extraction.
- **all**: every tool the Exa MCP server exposes is registered as a direct
  tool. Largest context footprint; mainly useful when you want the deprecated
  shapes available without going through the proxy.
- **proxy only**: no direct tools. Discover everything via
  `mcp({ search: "exa" })` and call via `mcp({ tool: "..." })`. Smallest
  footprint, slightly more friction at call time.

## Files this extension touches

- `~/.pi/exa.config.json` — owned by pi-exa. Holds `{ "apiKey": "..." }`,
  written with mode `0600`. Anything else in this file (e.g. settings from
  v0.1.x) is preserved on read but never written back.
- `~/.pi/agent/mcp.json` — managed jointly with pi-mcp-adapter. pi-exa only
  reads/writes the `mcpServers.exa` field; everything else (other servers,
  imports, settings) is preserved.
- It does **not** touch `~/.config/mcp/mcp.json`, `.mcp.json`, or
  `.pi/mcp.json`. If you've configured `mcpServers.exa` in any of those,
  `/exa-status` will tell you which file is winning, and `/exa-config` will
  refuse to edit other files for safety.

## How it stays out of the context

The actual tools come from Exa's MCP server, registered by pi-mcp-adapter.
Pi-exa itself registers **zero tools** and injects **no system prompt**. The
slash commands aren't visible to the model — they only run from your input.

The only model-visible surface this package contributes to is the direct-tool
descriptions Exa's server provides for `web_search_exa` and `web_fetch_exa`.
Those descriptions live with Exa, so they stay current automatically.

## Migration from v0.1.x

If you were on the previous version:

1. Install pi-mcp-adapter if you don't have it: `pi install npm:pi-mcp-adapter`.
2. `pi update https://github.com/lulucatdev/pi-exa.git`.
3. Run `/exa-auth <your-key>` once. Your existing key in
   `~/.pi/exa.config.json` is reused; you can also pass it explicitly.
4. `/reload`. The tools `web_search_exa` and `web_fetch_exa` will appear in
   place of the old `exa-*` tools.
5. **Tool name remap** — anything that called the old tools needs to switch:

   | v0.1.x | v0.2.x equivalent |
   | --- | --- |
   | `exa-search` | `web_search_exa` (or `web_search_advanced_exa` for filters) |
   | `exa-contents` | `web_fetch_exa` |
   | `exa-answer` | Use `web_search_exa` then summarize, or call Exa's answer endpoint via `web_search_advanced_exa` |
   | `exa-code-context` | `web_search_exa` (Exa deprecated the dedicated endpoint) |
   | `exa-company-research` | `web_search_advanced_exa` with `category: "company"` |
   | `exa-linkedin-search` | `web_search_advanced_exa` with `category: "people"` |
   | `exa-crawl` | `web_fetch_exa` with `subpages` |
   | `exa-deep-research-start` / `-check` | Not in the official MCP. Use Exa's HTTP Research API directly if you need async deep research. |

6. Old artifacts left behind that you can delete by hand if you want:
   - `~/.pi/exa.deep-research.jobs.json` — local job store from v0.1.x. No
     longer touched. Safe to remove.
   - Any extra fields in `~/.pi/exa.config.json` (`tools`, `defaults`,
     `baseUrl`, `headers`, `timeoutMs`, etc.) — ignored on read; safe to remove.

## Notes

- Exa is intended for live web research and structured extraction. GitHub
  repository content is still better served by `gh` CLI or generic page fetch,
  not by web search APIs.
- Your `EXA_API_KEY` env var, if you already exported it in your shell,
  takes precedence over the saved key — `applyKeyToEnv` only fills the env
  when it isn't already set.

## License

MIT
