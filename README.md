# pi-exa

Exa web research for [pi](https://github.com/badlogic/pi-mono). Calls Exa
directly through the official [`exa-js`](https://www.npmjs.com/package/exa-js)
SDK — no MCP server, no adapter, no `mcp.json` to provision.

## Architecture (v0.4)

v0.4 registers **five first-class tools** (`exa_search`, `exa_similar`,
`exa_fetch`, `exa_answer`, `exa_research`) plus a **prompt template** for
the `/exa` command. The agent can now invoke Exa directly as a tool call —
no bash parsing, no skill-body guessing, no "maybe the model decides to load
the skill" uncertainty.

The **skill** (`skills/pi-exa/SKILL.md`) and **CLI**
(`skills/pi-exa/scripts/exa.mjs`) are kept as a fallback: when the user
uses natural language ("search the web for ...") without `/exa`, the skill
still teaches the agent how to call the CLI via bash.

Layers:

| Layer | Role | Permanent context |
|---|---|---|
| **Tools** (`exa_search`, `exa_similar`, `exa_fetch`, `exa_answer`, `exa_research`) | Direct tool calls — highest hit rate | ~500 tokens (5 schemas, no promptSnippets) |
| **Prompt** (`prompts/exa.md` via `/exa`) | Explicit trigger, loads decision tree into context | ~15 tokens (minimal front matter) |
| **Skill** (`skills/pi-exa/SKILL.md`) | Natural-language fallback | ~15 tokens (minimal front matter) |
| **CLI** (`scripts/exa.mjs`) | Actual workhorse, shared by all paths | 0 |

## Install

```bash
pi install npm:@capyup/pi-exa
```

(Or `pi install git:github.com/capyup/pi-exa` if you want to track `main`
directly.)

Either form pulls `exa-js` and registers the extension, skill, and prompt.

Then save your API key (get one from <https://dashboard.exa.ai>):

```text
/exa-auth <your-exa-api-key>
```

The CLI and tools re-read the key file on every call, so no `/reload` is
needed after auth changes.

To verify:

```text
/exa-status
```

## Usage

### Fast path: `/exa` (recommended)

Type `/exa` followed by your request. The prompt template loads and instructs
the agent to call the right tool directly:

```text
/exa 最近关于 Claude Code 的新闻
/exa 找和这篇文章类似的 https://example.com/article
/exa 总结 https://exa.ai/docs
/exa 谁是 Anthropic 的 CEO
/exa 写一份关于 AI 编程助手市场的深度调研报告
```

Hit rate: **100%** — the prompt template explicitly says "call `exa_search`"
(or `exa_similar` / `exa_fetch` / `exa_answer` / `exa_research`), so the model never misses.

### Natural-language path

Just ask in plain language. The skill metadata (~15 tokens) sits in the
system prompt permanently; when the model decides the task matches, it loads
the skill body and learns the CLI syntax. This works but is slightly less
reliable than `/exa` because it depends on the model's intent classification.

```text
帮我搜一下最近的 AI 新闻
这个链接说了什么？https://example.com/article
```

### Direct tool calls (agent-driven)

The model can also invoke the tools on its own without `/exa` or skill
triggering, because the tool schemas are always in the system prompt. This
happens when the agent is confident a web search is needed.

### CLI (for humans or scripts)

```bash
# from the skill directory:
./scripts/exa.mjs status
./scripts/exa.mjs search "anthropic claude code release notes" --days 30 --num 5
./scripts/exa.mjs similar https://exa.ai/blog/introducing-exa --num 5
./scripts/exa.mjs fetch https://exa.ai/docs/sdks/javascript-sdk --mode summary
./scripts/exa.mjs answer "Who is the current CEO of Anthropic?"
./scripts/exa.mjs research "Compare the top 5 AI coding assistants in 2025, their pricing, and key differentiators"
```

Add `--help` to any subcommand for the full option list.

## Slash commands

| Command | What it does |
|---|---|
| `/exa <request>` | Load the Exa prompt template and trigger tool-based research. |
| `/exa-auth <key>` | Save the Exa API key to `~/.pi/exa.config.json` (mode `0600`). |
| `/exa-auth --clear` | Forget the saved key. |
| `/exa-status` | Show whether a key is in place and where it came from. |

## Files this package owns

- `~/.pi/exa.config.json` — stores `{ "apiKey": "..." }`. Mode `0600`.
  Other fields are preserved but not used.

This package does **not** touch `~/.pi/agent/mcp.json`,
`~/.config/mcp/mcp.json`, `.mcp.json`, or `.pi/mcp.json`.

## Migration from earlier versions

### v0.3.x → v0.4.x

1. `pi update npm:@capyup/pi-exa` (or `pi update https://github.com/capyup/pi-exa.git`)
2. Your existing key in `~/.pi/exa.config.json` is reused.
3. `/reload` or restart pi.
4. The five new tools (`exa_search`, `exa_similar`, `exa_fetch`, `exa_answer`, `exa_research`) will appear
   in your tool list. `/exa` will be available as a slash command.

### v0.2.x (MCP) → v0.4.x

Follow the v0.3 migration steps first if you skipped that version, then the
v0.4 steps above.

### v0.1.x (bespoke tools) → v0.4.x

The old tool names are gone. The new tools are `exa_search`, `exa_similar`, `exa_fetch`,
`exa_answer`, `exa_research`. No manual remap is needed — the agent uses them automatically.

## Token-cost comparison

| Version | Permanent context cost | Failure modes |
|---|---|---|
| v0.1.x (9 bespoke tools + routing prose) | ~750 tokens | tool name drift; you-pay-even-if-unused |
| v0.2.x (MCP, 2 direct tools) | ~400 tokens + MCP proxy overhead | mcp.json missing; remote MCP unreachable; adapter version mismatch |
| v0.3.x (skill + CLI) | ~120 tokens (skill metadata) | **hit rate depends on model guessing** |
| **v0.4.x (tools + skill + /exa prompt)** | **~500 tokens (5 tool schemas)** | **near-100% hit rate via `/exa`** |

v0.4 trades a moderate permanent-context increase (~380 tokens vs v0.3) for a
massive hit-rate improvement plus powerful tools (`exa_similar` for finding
related content and `exa_research` for deep investigation).
If you want the absolute minimum permanent cost, stay on v0.3.x; if you want
the agent to actually do web research when you ask, use v0.4.x.

## License

MIT
