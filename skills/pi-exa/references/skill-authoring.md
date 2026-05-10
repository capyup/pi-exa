# Skill Authoring Guidelines

## Progressive Disclosure

A skill loads in three layers. Keep layer 1 tiny so the system prompt stays small:

1. **Metadata** (name + description) — always in context
2. **SKILL.md body** — loaded only when the skill triggers
3. **References / scripts** — loaded only when SKILL.md points to them

**Why this matters:** The system prompt has a token budget. Every skill's front matter
competes for space. If your description is 200 tokens, that's 200 tokens the model
cannot use for reasoning. Push detail into the body and references.

**Example — bad (front matter too heavy):**
```yaml
description: >-
  Use when the user says "search", "look up", "find articles",
  "what's the latest", "查一下", "搜一下", "搜索", "网上找"...
```

**Example — good (front matter minimal):**
```yaml
description: Exa web-research skill. Fallback for natural-language triggers.
```

The model understands intent from a short description. Lists of trigger words waste
tokens without improving hit rate.

## Trust the Model

Modern AI understands context. It does not need a phrase book.

**Example — bad:**
```
Trigger on: "search the web", "look up", "find articles about",
"what's the latest", "any recent", "news on", "research X"...
```

**Example — good:**
```
Use this whenever the user needs information from the open web.
```

The second version covers every variant of the first, plus edge cases you did not
think of. Describe what the skill does, not when to use it. The "when" is the
model's job.

## Keep the Prompt Lean

Remove parts that do not pull their weight. If the model repeatedly ignores a
section, delete it. If a guideline is redundant with another, merge them.

**Example:**
- Do not write "Prefer X over Y" followed by "Only use Y when X fails". Pick one.
- Do not explain tool parameters that are already visible in the system prompt's
tool schema. The schema is permanent context; repeating it in the skill body is
waste.

## Explain the Why

Use theory of mind. Tell the model *why* a pattern matters so it can generalize.

**Example — bad (rigid):**
```
ALWAYS set num to 5. NEVER set num higher than 10.
```

**Example — good (explained):**
```
Keep num small (3–5) unless the user explicitly asked for breadth. Each result
is 150–400 tokens of context, so a large num burns budget quickly.
```

The second version lets the model make the right tradeoff in novel situations.

## Description Optimization

The description is the primary trigger mechanism. If the skill under-triggers,
make the description more specific about what the skill delivers.

**Example — bad (too vague):**
```
A tool for working with files.
```

**Example — good (specific value):**
```
PDF text extraction skill. Use whenever the user needs to read, summarize,
or search inside a PDF file. Converts PDFs to markdown for easy processing.
```

The second version tells the model exactly what value the skill provides, making
the trigger decision easy.
