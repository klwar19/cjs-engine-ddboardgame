# Campaign Data

Campaign files are authored content. They are loaded by `data/_manifest.json` through `ContentManager` into `DataStore`.

Progress saves are separate and belong in browser storage, exported JSON, or `data/campaign_saves/`.

Read `docs/CAMPAIGN_MODE_LAYOUT.md` before changing these schemas.

World folders use stable subfolders:

- `scenarios/`, `maps/`, `events/`, `quests/` for structured campaign runs.
- `side_content/`, `hubs/`, `quest_chains/`, `battle_sets/`, `map_seeds/`, `oracles/` for the Side Content Forge.

Generated side content is not canon until the GM applies or approves it. Red-risk cards should enter the review queue first.
