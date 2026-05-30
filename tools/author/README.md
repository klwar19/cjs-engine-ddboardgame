# Content authoring CLI

`node tools/author/index.mjs <type> <command> [flags]` (or `npm run author -- <type> <command>`)
scaffolds, validates, and writes authored content into the right place — and,
because the engine is **manifest-first**, registers any new file in
`data/_manifest.json` so the engine actually loads it.

It shares one validator with the linter (`tools/lib/content-schema.mjs`), so a
generator gets exactly the same verdict `npm run content:lint` does.

## Commands

| Command | What it does |
| --- | --- |
| `scaffold` | Print a schema-valid starter document (`{ _file, entries:[…] }`) to stdout. |
| `validate` | Read entry JSON (stdin or `--in`), validate against the schema, exit non-zero on errors. **No writes.** |
| `add` | Validate, then upsert each entry by `id` into the target file (creating + manifest-registering it if new). |

`scaffold | validate` round-trips for every type — the scaffold is always valid.

## Flags

| Flag | Meaning |
| --- | --- |
| `--world <id>` | World for world/campaign-scoped types. |
| `--file <name>` | Collection file basename. **Required for campaign types** (they have no single canonical file); optional override for core types (default `<type>.json`). |
| `--in <path>` | Read entry JSON from a file instead of stdin. |
| `--target <path>` | Write to an explicit path (testing / non-standard layout). |
| `--dry-run` | Validate and report the planned change without writing anything. |
| `--no-manifest` | Skip `data/_manifest.json` registration. |

Input may be a single entry object, an array of entries, or a
`{ "entries": [...] }` document.

## Types

Core (universal or per-world): `skills`, `passives`, `items`, `materials`,
`food`, `characters`. World-only: `monsters`, `encounters`. System:
`statuses`. Campaign (per-world, `--file` required): `campaignQuests`,
`campaignEvents`, `oracleTables`, `travelMaps`, `worldActivityPacks`,
`storyDirectorPacks`.

Run `node tools/author/index.mjs --list` for the live list.

## Examples

```bash
# See the shape, fill it in, write it:
npm run author -- skills scaffold > /tmp/skill.json
# ... edit /tmp/skill.json ...
npm run author -- skills add --world haven --in /tmp/skill.json

# AI generator flow — pipe an entry straight in (same validation a human gets):
echo '{ "id":"ice_lance", "name":"Ice Lance", "power":24, "ap":2, "mp":6,
        "element":"Ice", "damageType":"Magic", "range":3 }' \
  | npm run author -- skills add --world haven --file ai_generated

# Preview a campaign quest write without touching disk:
npm run author -- campaignQuests scaffold --world haven \
  | npm run author -- campaignQuests add --world haven --file wolf_arc --dry-run
```

## Why it writes the manifest

`data/_manifest.json` is the single source of truth for which files the engine
loads (it cross-checks each entry's `scope`/`world` against the file header).
A new content file the manifest doesn't list is invisible to the game, so
`add` appends the `{ path, scope, category, world? }` entry automatically
(idempotent — it verifies an existing entry instead of duplicating it). Because
the engine *merges* every file of a category, AI content can live in its own
`--file` (e.g. `skills.ai_generated.json`) without touching curated files.

> **Note:** `add` rewrites the target file with canonical 2-space JSON. For
> curated files with hand-formatted inline arrays this normalizes formatting;
> prefer a dedicated `--file` for generated batches to keep diffs clean.
