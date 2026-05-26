# AI Content Index

Compact, token-cheap indexes of the engine's content for AI generators.
Each file lists only `id`, `name`, and a short summary plus the few fields
an AI needs to refer to existing ids without parsing megabytes of JSON.

## Why

Full content files (`data/universal/skills.json`, `data/worlds/*/monsters.json`, …)
total several hundred KB. Feeding them to an AI prompt is expensive and
mostly wasted — the model only needs to know which ids exist and what
each one represents. The indexes here give that for typically 1–5 KB
total.

## Files

- `skills.compact.json` — every skill id with element/damage/ap/mp/range.
- `passives.compact.json` — every passive id with tags + 1-line summary.
- `statuses.compact.json` — every status with category + 1-line desc.
- `items.compact.json` — every item/material/food with slot/rarity/tags.
- `monsters.compact.json` — per-world monsters with rank/weak/resist/skills.
- `characters.compact.json` — player-side units with team/rank.
- `encounters.compact.json` — per-world encounter ids with grid size.
- `worlds.compact.json` — world ids, displayName, ceiling, content counts,
  and the first paragraph of `story_summary.md` if present.
- `index.json` — manifest with counts and `generatedAt` timestamp.

## How to regenerate

```
node tools/build-ai-index.mjs
```

Run this whenever the content tree changes — the indexes are generated,
not authored. They live under `data/` because they ship with the build
(so the running game can also load them for in-app AI features).

## How to use

When asking an AI to author or revise content, give it just the index it
needs. Example prompt fragments:

> Here are the existing skills as `(id, name, element, power)`:
> ```json
> [ ... contents of skills.compact.json ... ]
> ```
> Author a new skill **using only existing element names**. Output a
> ContentPatch JSON (see `src/content/types.ts` → `ContentPatch`).

Then run the generator's output through `node tools/content-lint.mjs --patch path/to/patch.json`
to validate shape before merging into the live files.

## Conventions

- Summaries are at most ~140 characters, single-sentence, no markdown.
- Tags are passed through unchanged from the source files.
- Missing/null fields are simply omitted (so generators see "this entry
  has no resistances declared", not `resist: null`).
