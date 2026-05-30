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

### Campaign collection schemas (resolved by `_file.category`)

Campaign-side content lives under `data/campaigns/<world>/<type>/` and all
declare `format: "cjs-collection"`, so they are matched on `_file.category`
(mirroring `CATEGORY_TO_TYPE` in `js/core/content-manager.js`):

| Schema | `_file.category` | Lives in |
| --- | --- | --- |
| `campaignQuests.schema.json` | `campaignQuests` | `campaigns/<world>/quests/*.json` |
| `campaignEvents.schema.json` | `campaignEvents` | `campaigns/<world>/events/*.table.json` |
| `oracleTables.schema.json` | `oracleTables` | `campaigns/<world>/oracles/*.json` |
| `travelMaps.schema.json` | `travelMaps` | `campaigns/<world>/travel_maps/*.json` |
| `worldActivityPacks.schema.json` | `worldActivityPacks` | `campaigns/<world>/activity_packs/*.json` |
| `storyDirectorPacks.schema.json` | `storyDirectorPacks` | `campaigns/<world>/story_director/*.json` |

The other campaign categories (`questChains`, `battleSets`, `mapSeeds`,
`sideContentPacks`, `campaignHubs`, `scenarios`, `scenarioMaps`,
`campaignProfiles`, `pocketHavenRules`) are not yet schematized; the lint
reports them as `info … no schema mapping (skipped)`.

`format` field aliases: schemas accept `cjs-collection` everywhere as the
generic catch-all the legacy `_legacy_bundle.json` and per-world files
sometimes use.

### Campaign ops

The `rewards` / `suggested` / `ops` / `failureConsequence` arrays in campaign
content hold **campaign ops** — `{ "op": "<verb>", ...payload }`. The schema
only requires a non-empty `op` string; the engine's `CampaignOps` registry is
the authority for which verbs exist and what payload each takes (so a new
engine op never has to wait on a schema bump). Common verbs:
`give_money`, `give_jp`, `give_item`, `give_material`, `unlock_recipe`,
`hub_stat_change`, `add_rumor`, `add_status`, `set_flag`, `log`,
`story_metric_change`, `story_clue_add`, `story_thread_status`,
`start_quest_chain`, `cross_pressure_change`, `journal_entry_add`.

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
npm run content:lint -- data/worlds/haven        # a subset (dir or file)
node tools/content-lint.mjs --patch some-generated-patch.json
node tools/content-lint.mjs --patch patch.json --json   # machine-readable report
```

The lint runs as part of `npm test` via `test_content_lint.js`, so CI
fails fast on a broken commit.

### Patches (AI generators)

A patch validates upserts/removes without mutating shipped data. It is
either a single op or a batch:

```jsonc
{ "target": { "file": "data/worlds/haven/skills.json", "world": "haven" },
  "format": "cjs-skills",            // a content format OR a campaign category
  "upserts": [ /* entries */ ],
  "removes": [ "old_skill_id" ] }
```

```jsonc
{ "patches": [ /* several single-file ops, validated + impact-analysed together */ ] }
```

Beyond schema validation, the patch flow reports **downstream impact**: which
entries reference an upserted id (the blast radius of a change) and — the key
safety net — which references a `removes` would leave **dangling**. `--json`
emits this as a structured report an agent can react to.

## How to add a new content type

1. Add the TypeScript shape in `src/content/types.ts`.
2. Add `data/schemas/<type>.schema.json` matching that shape.
3. Register the format and filename in
   `tools/content-lint.mjs` (`FORMAT_TO_SCHEMA` + `FILENAME_TO_FORMAT`).
4. Add a builder to `tools/build-ai-index.mjs` so AI generators see the
   new ids in their compact index.
5. Run `npm test` — the lint will pick up the new schema automatically.
