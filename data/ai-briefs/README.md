# AI authoring briefs

One brief per authorable content type. Each describes the contract its schema
enforces (required fields are pulled straight from the schema), a
guaranteed-valid example, and the `npm run author` commands to create it.

**These files are generated** by `tools/build-ai-briefs.mjs` from
`data/schemas/*` + the authoring registry — do not edit by hand; re-run
`npm run content:briefs` after a schema change.

An AI generator's context for a type = this brief + the matching compact index
in `data/ai-index/`. That is enough to produce a valid patch/entry without the
full multi-megabyte content tree.

## Briefs

- [`skills`](skills.md) — Skills (`skills`)
- [`passives`](passives.md) — Passives (`passives`)
- [`items`](items.md) — Items (`items`)
- [`materials`](materials.md) — Materials (`materials`)
- [`food`](food.md) — Food (`food`)
- [`characters`](characters.md) — Characters (`characters`)
- [`monsters`](monsters.md) — Monsters (`monsters`)
- [`encounters`](encounters.md) — Encounters (`encounters`)
- [`statuses`](statuses.md) — Statuses (`statuses`)
- [`campaignQuests`](campaignQuests.md) — Campaign quests (`campaignQuests`)
- [`campaignEvents`](campaignEvents.md) — Campaign event tables (`campaignEvents`)
- [`oracleTables`](oracleTables.md) — Oracle tables (`oracleTables`)
- [`travelMaps`](travelMaps.md) — Travel maps (`travelMaps`)
- [`worldActivityPacks`](worldActivityPacks.md) — World activity packs (`worldActivityPacks`)
- [`storyDirectorPacks`](storyDirectorPacks.md) — Story director packs (`storyDirectorPacks`)

## Shared conventions

- Every content file is `{ "_file": { version, format, scope, world?, category, status }, "entries": [ … ] }`.
- IDs are lowercase `snake_case` and unique within a file.
- `canonRisk` is `green` | `yellow` | `red` (how freely a result becomes canon).
- Campaign **ops** are `{ "op": "<verb>", ...payload }`; the engine's CampaignOps
  registry owns the verb list (see `data/schemas/README.md`).
- Validate anything with `npm run content:lint -- --patch <file>` or
  `npm run author -- <type> validate`.
