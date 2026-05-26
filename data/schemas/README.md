# Content Schemas

JSON Schemas (draft-07) for every authored content file shape under
`data/`. The schemas live with the data they validate so a content-only
contributor can pick up the rules without spelunking through TypeScript.

## Files

| Schema | Validates |
| --- | --- |
| `_envelope.schema.json` | The shared two-layer `{ _file, entries }` wrapper |
| `skills.schema.json` | `data/**/skills.json` |
| `monsters.schema.json` | `data/worlds/**/monsters.json`, `data/**/characters.json` |
| `encounters.schema.json` | `data/worlds/**/encounters.json` |
| `passives.schema.json` | `data/**/passives.json` |
| `items.schema.json` | `data/**/items.json`, `materials.json`, `food.json` |
| `statuses.schema.json` | `data/system/statuses.json` (envelope or keyed-map form) |

`format` field aliases: schemas accept `cjs-collection` everywhere as the
generic catch-all the legacy `_legacy_bundle.json` and per-world files
sometimes use.

## Effect shape

Both forms are accepted everywhere effects are listed:

```json
{ "effectId": "stat_mod_str", "overrides": { "value": 5 } }
```

```json
{ "type": "burn", "duration": 2, "amount": 3 }
```

The first form (a reference into `data/system/master-effects.json`) is
canonical going forward. The inline form is grandfathered in.

## How to validate

```
npm run content:lint               # validate the whole data/ tree
npm run content:lint -- data/worlds/haven
node tools/content-lint.mjs --patch some-generated-patch.json
```

The lint runs as part of `npm test` via `test_content_lint.js`, so CI
fails fast on a broken commit.

## How to add a new content type

1. Add the TypeScript shape in `src/content/types.ts`.
2. Add `data/schemas/<type>.schema.json` matching that shape.
3. Register the format and filename in
   `tools/content-lint.mjs` (`FORMAT_TO_SCHEMA` + `FILENAME_TO_FORMAT`).
4. Add a builder to `tools/build-ai-index.mjs` so AI generators see the
   new ids in their compact index.
5. Run `npm test` — the lint will pick up the new schema automatically.
