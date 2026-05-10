---
description: >-
  Exa web-research prompt with five comprehensive tools. exa_search: web search
  with date filtering (--days, --from/--to), domain/category filtering, search
  type selection (auto/neural/keyword/hybrid/deep-lite/deep/deep-reasoning),
  highlights or full-text retrieval, systemPrompt and outputSchema for
  structured JSON output. exa_similar: find semantically similar pages to a
  given URL, with optional source-domain exclusion. exa_fetch: fetch page
  contents (text/summary/highlights), with livecrawl (--livecrawl always for
  real-time content bypassing cache), subpage extraction (--subpages with
  --subpage-target for about/team/blog pages). exa_answer: synthesized answers
  with citations, custom systemPrompt, and location-aware mode.
  exa_research: deep multi-step automated research with planning, search,
  crawling, and synthesis; supports structured JSON output via outputSchema
  and tiered models (fast/research/research-pro). Loads when the user types /exa.
---
Use the `exa_search`, `exa_similar`, `exa_fetch`, `exa_answer`, or `exa_research` tool for this request.

User request: $ARGUMENTS

## Decision tree

| User intent | Tool to call |
|---|---|
| Search, discovery, find articles, recent news | `exa_search` |
| Find pages similar to a known URL | `exa_similar` |
| Read/summarize a known URL | `exa_fetch` |
| Short factual question | `exa_answer` |
| Deep investigation, comparison, report | `exa_research` |

## Tool quick reference

| Tool | Key parameters | When to use |
|---|---|---|
| `exa_search` | `query`, `num`, `days`, `domain`, `category`, `type`, `full` | Discovery, news, finding articles |
| `exa_similar` | `url`, `num`, `excludeSource`, `full` | Have one good URL, want more like it |
| `exa_fetch` | `urls`, `mode` (text/summary/highlights), `livecrawl`, `subpages`, `subpageTarget` | Already have URLs, need to read them |
| `exa_answer` | `question`, `location`, `systemPrompt` | Short factual questions |
| `exa_research` | `instructions`, `model`, `outputSchema`, `maxWaitMs` | Deep multi-step investigation |

## Tool guidelines

**`exa_search`:**
- Pass the user's query verbatim as `query`.
- For "recent / latest / current" intents, set `days` to a sensible window (7–30).
- For academic content, add `category: "research paper"` and/or `domain: ["arxiv.org"]`.
- Keep `num` small (3–5) unless the user explicitly asked for breadth.
- Use `full: true` only when you actually need to read every result in depth; otherwise use highlights (default) and `exa_fetch` the one or two URLs you care about.
- `systemPrompt` + `outputSchema` only work with deep search types (`deep-lite`, `deep`, `deep-reasoning`). Use `outputSchema` when you need structured JSON output from search results.

**`exa_similar`:**
- Pass the source URL as `url`.
- Use `excludeSource: true` when you want different sources, not the same domain.
- Same `num` / `full` guidelines as `exa_search`.

**`exa_fetch`:**
- Pass one or more URLs in `urls`.
- `mode: "text"` when you need to quote or analyze the page.
- `mode: "summary"` when a short distilled version is enough.
- `mode: "highlights"` when only key sentences matter.
- `livecrawl: "always"` for real-time content that changes frequently (prices, status, news). Bypasses Exa's cache.
- `subpages: 5` to also extract internal subpages (about, team, blog, etc.). Use with `subpageTarget: "about"` to target specific subpage types.

**`exa_answer`:**
- Pass the question verbatim as `question`.
- Use for short factual queries where you don't need to read sources yourself.
- For anything needing comparison, analysis, or quotation, prefer `exa_search`.
- `systemPrompt` to guide the answer style, e.g. "Answer concisely in Chinese".

**`exa_research`:**
- Pass detailed instructions as `instructions`. The more specific, the better the result.
- Default model `exa-research` is fine for most cases. Use `exa-research-pro` for thorough analysis.
- This takes 1–5 minutes. Warn the user if the topic is complex.
- Use for: multi-source comparison, trend analysis, "write a report on X", structured output needs.
- `outputSchema`: pass a JSON schema string when you need structured JSON output instead of free text.
- Do NOT use for: simple lookups that `exa_search` or `exa_answer` can handle in seconds.

## Errors

If the tool returns an error mentioning `EXA_KEY_MISSING`, stop and ask the user to run `/exa-auth <key>` (get one at https://dashboard.exa.ai).
