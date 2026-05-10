---
name: pi-exa
description: >-
  Live web research with the Exa search API. Use this whenever the user needs
  information from the open web that the model cannot reliably know on its
  own — current events, recent news, tech blog posts, papers, company info,
  product pages, anything time-sensitive or post-cutoff. Trigger on phrases
  like "search the web", "look up", "find articles about", "what's the
  latest", "any recent", "news on", "research X", "查一下", "搜一下", "搜索",
  "网上找", "最新的", "帮我查", "查最新", or whenever the user gives a topic
  and clearly expects current/external information instead of model
  knowledge. Also use when the user gives a URL and asks what's on it, what
  it says, or for a summary. Do not use for code/library API documentation
  (Context7 is better) or for repos and gists where `gh` CLI works fine.
---

# pi-exa — Exa web research via local CLI

Use the bundled `scripts/exa.mjs` CLI. It calls Exa directly through their
official Node SDK — no MCP server, no extra config beyond an API key.

## Prerequisite

The Exa API key lives at `~/.pi/exa.config.json`. If it's missing, ask the
user to run `/exa-auth <their-key>` in pi (gets one at
<https://dashboard.exa.ai>). You can verify with:

```bash
scripts/exa.mjs status
```

The CLI re-reads the file every call, so no `/reload` is ever needed after
auth changes.

## Three commands, three jobs

| You want… | Use |
| --- | --- |
| Discover URLs and read short snippets in one shot | `search` |
| Already have URL(s), need full text or a summary | `fetch` |
| One-shot factual answer with citations | `answer` |

Pick the leanest one for the task. Searching when you only needed a fetch
wastes both a request and tokens; fetching after a search whose highlights
already answered the question is redundant.

## search

```bash
scripts/exa.mjs search "<query>" [options]
```

Common options (run `scripts/exa.mjs search --help` for the full list):

- `--num N` — number of results (default 5, max 25). Each result is roughly
  150–400 tokens of context, so keep this small unless the user asked for
  breadth.
- `--days N` — restrict to results published in the last N days. Use this
  for "recent / latest / current / today / this week" intents.
- `--from YYYY-MM-DD` / `--to YYYY-MM-DD` — explicit date range.
- `--domain D` — restrict to a domain (repeatable: `--domain arxiv.org
  --domain nature.com`). Use for "find on X" intents.
- `--exclude D` — exclude a domain (repeatable).
- `--category C` — one of `news`, `research paper`, `company`, `pdf`,
  `personal site`, `tweet`, `github`.
- `--full` — return ~5000 chars of page text per result instead of short
  highlights. Expensive in tokens — only use when highlights aren't enough
  AND you actually need every result expanded. Otherwise, prefer the
  default and `fetch` the one or two URLs you actually want to read.

Default output is compact markdown:

```
1. Title here — example.com — 2024-08-12
   https://example.com/article
   • highlight one
   • highlight two
```

## fetch

```bash
scripts/exa.mjs fetch <url> [<url> ...] [options]
```

- `--mode text` (default) | `summary` | `highlights`
- `--max-chars N` — char budget per page when `--mode text` (default 5000)
- `--json` for raw response

Use `summary` when a short distilled version is enough, `text` when you
need to quote or analyze, `highlights` when only key sentences matter.

You can pass multiple URLs in one call — Exa fetches them in parallel and
the output blocks are separated by `---`.

## answer

```bash
scripts/exa.mjs answer "<question>" [--location US]
```

Returns a synthesized answer plus citation URLs. Good for short factual
queries where you don't need to read the sources yourself ("Who is the CEO
of X?", "What's the population of Y?"). For anything that needs comparison,
analysis, or quotation, prefer `search` so you can read the actual pages.

## Decision quickstart

- "What's the latest about X?" → `search "X" --days 30 --num 5`
- "Find recent papers on X" → `search "X" --category "research paper" --days 90`
- "What does this URL say?" → `fetch <url> --mode text`
- "Summarize this URL" → `fetch <url> --mode summary`
- "Who is the current Y?" → `answer "Who is the current Y?"`
- "Find arxiv papers about X" → `search "X" --domain arxiv.org`

## Errors you may see

The CLI exits non-zero with a clear `EXA_*` prefix on stderr:

- `EXA_KEY_MISSING` → ask the user to run `/exa-auth <key>`. Don't retry.
- `EXA_AUTH` → key is invalid or revoked. Same fix.
- `EXA_RATE_LIMIT` → back off; retry once after a short pause, otherwise
  stop and report.
- `EXA_HTTP_<code>` → surface the message; investigate before retrying.
- `EXA_NETWORK` → transient. One retry is fine; otherwise stop.
- `EXA_SDK_MISSING` → the package wasn't installed cleanly. Tell the user
  to run `pi update https://github.com/lulucatdev/pi-exa.git`.

## Advanced usage

For structured output (`outputSchema`), reasoning-heavy search variants
(`--type deep-reasoning`), or other less common patterns, see
[references/advanced.md](references/advanced.md). Don't load that file
unless you actually need one of those things — it's there to keep the
common path in this file lean.

## Why this skill exists (philosophy, optional reading)

Exa exposes a lot of knobs. The job of this skill is to keep the everyday
path small enough to fit in your head: three subcommands, sensible
defaults, markdown output, one place for the key. If you find yourself
wanting something the three subcommands can't do, that's the cue to read
`references/advanced.md`, not to fight the CLI.
