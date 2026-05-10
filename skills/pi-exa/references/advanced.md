# pi-exa advanced usage

Read this only when the everyday `search` / `fetch` / `answer` flow in
SKILL.md isn't enough. Each section here costs context only if you load it.

## 1. Reasoning-heavy search (`--type`)

The `search` subcommand passes through `--type` to Exa's `type` parameter.
Defaults to `auto`, which is right for almost everything. Other useful values:

- `neural` — pure semantic search; better for conceptual queries where
  exact keywords don't appear in target pages.
- `keyword` — pure keyword search; better for proper nouns, error
  messages, or exact-phrase lookup.
- `hybrid` — blend of neural + keyword.
- `deep-lite` — low-latency reasoning search; Exa internally plans and
  refines queries. Slower than `auto` but more thorough.
- `deep` — heavier reasoning mode.
- `deep-reasoning` — base reasoning mode; best when the user wants
  research-style synthesis across many sources. Latency is highest.

Example:

```bash
scripts/exa.mjs search "evidence that GPU memory bandwidth bottlenecks LLM inference" --type deep-reasoning --num 8
```

Use these sparingly — they cost more and take longer. For most
"recent news on X" requests, `auto` plus `--days N` is faster and
just as good.

## 2. Structured output (outputSchema)

Exa's `/search` supports a JSON Schema for synthesized output, returned
in `output.content`. The CLI doesn't expose this directly because it's
rarely needed and the schema is verbose. When you do need it, drop into
a one-off Node invocation that imports `exa-js` from the skill's
`node_modules`:

```bash
cd "$SKILL_ROOT" && node --input-type=module -e '
import Exa from "exa-js";
import { readFileSync } from "node:fs";
import path from "node:path";
const key = JSON.parse(readFileSync(path.join(process.env.HOME, ".pi", "exa.config.json"), "utf-8")).apiKey;
const exa = new Exa(key);
const r = await exa.search("Who leads OpenAI safety?", {
  type: "deep",
  outputSchema: {
    type: "object",
    properties: {
      leader: { type: "string" },
      title: { type: "string" }
    },
    required: ["leader", "title"]
  },
  contents: { highlights: true }
});
console.log(JSON.stringify(r.output?.content, null, 2));
'
```

`$SKILL_ROOT` is the directory containing this file's parent (i.e. the
skill root). Resolve relative paths against the SKILL.md location.

Notes from Exa's docs:

- `outputSchema` works across all search types but pairs best with
  `deep-lite`, `deep`, or `deep-reasoning` for synthesis quality.
- Don't put `citations` or `confidence` fields in your schema — Exa
  returns grounding automatically in `output.grounding`. Including them
  duplicates data and reduces structure quality.
- Use `systemPrompt` (a string) to nudge the synthesized output without
  bloating the schema.

## 3. Streaming answers

`exa.streamAnswer(question)` yields chunks as Exa generates them. The CLI
doesn't expose this because the subagent loop typically reads the full
output anyway. If you do need to stream (e.g. piping into another tool),
write a one-off Node command similar to the structured-output example
and iterate `for await (const chunk of exa.streamAnswer(...))`.

## 4. Live-crawled freshness

For pages that change often (news, status, prices), `getContents` accepts
`livecrawl: "always"` to bypass Exa's cache. Not in the CLI; for one-off
needs, use `fetch` with `--json` and post-process, or write a one-off Node
command:

```bash
cd "$SKILL_ROOT" && node --input-type=module -e '
import Exa from "exa-js";
import { readFileSync } from "node:fs";
import path from "node:path";
const key = JSON.parse(readFileSync(path.join(process.env.HOME, ".pi", "exa.config.json"), "utf-8")).apiKey;
const exa = new Exa(key);
const r = await exa.getContents(["https://status.openai.com"], {
  text: { maxCharacters: 4000 },
  livecrawl: "always"
});
console.log(r.results[0].text);
'
```

## 5. When the CLI is the wrong tool entirely

- **GitHub repo content** → use `gh` CLI or `gh api`. Exa's web search
  on GitHub is shallower and costs more than a direct API call.
- **Library/API documentation** → use Context7 (`context7_resolve_library_id`
  → `context7_get_library_docs`). It's free, current, and structured.
- **A single known web page you trust** → plain `curl` / `fetch`. Exa is
  for discovery and content extraction at scale, not for one-off page
  reads where you already have the URL and don't need any extraction.
