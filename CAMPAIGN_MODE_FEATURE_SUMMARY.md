# Campaign Mode Feature Summary

Use this file as the quick handoff for future chats. It summarizes the Campaign Mode and Side Content Forge work merged to `main` in PR #2.

## Status

- Branch merged: `codex/campaign-mode-side-content`
- Merge commit on `main`: `e34f411`
- PR: https://github.com/klwar19/cjs-engine-ddboardgame/pull/2
- Main entry page: `campaign.html`
- Existing apps linked: `index.html`, `editor.html`, `combat.html`

## What Was Added

Campaign Mode is now a GM dashboard above the tactical combat simulator. It supports:

- Campaign saves, party state, phase passing, logs, notes, GM override.
- Scenario runner and node-map play.
- Combat bridge from Campaign Mode into `combat.html`.
- Inventory, shops, rest, farming, cooking, crafting/forging, and Pocket Haven.
- Side Content Forge for living hubs, hub pulses, quest chains, battle cards, map seeds, oracle prompts, imported ideas, saved ideas, and canon-risk review.
- Editor support for campaign data categories.
- Frostbitten starter campaign content for Haven.

## Important Files

Core app:

```text
campaign.html
css/campaign.css
js/campaign/campaign-ui.js
js/campaign/campaign-state.js
js/campaign/campaign-ops.js
js/campaign/campaign-save.js
```

Scenario and combat integration:

```text
js/campaign/scenario-runner.js
js/campaign/campaign-map.js
js/campaign/campaign-combat-bridge.js
combat.html
js/combat/combat-manager.js
```

Side Content Forge:

```text
js/campaign/campaign-data-loader.js
js/campaign/campaign-side-content.js
js/campaign/campaign-hub.js
js/campaign/campaign-quest-chains.js
js/campaign/campaign-battle-set-forge.js
js/campaign/campaign-map-seed-forge.js
js/campaign/campaign-idea-forge.js
```

Economy and Pocket Haven:

```text
js/campaign/campaign-inventory.js
js/campaign/campaign-economy.js
js/campaign/pocket-haven.js
data/worlds/haven/items.json
data/worlds/haven/shops.json
data/worlds/haven/crafting.json
data/worlds/haven/crops.json
data/universal/food.json
```

Editor and browsing:

```text
editor.html
js/builders/campaign-editor.js
js/ui/data-browser.js
```

Data registry and schema support:

```text
data/_manifest.json
js/core/constants.js
js/core/content-manager.js
js/core/data-store.js
```

Starter campaign data:

```text
data/campaigns/haven/haven_free_campaign_test.campaign.json
data/campaigns/haven/scenarios/scn_frostwood_short_run.scenario.json
data/campaigns/haven/maps/frostwood_short_route.map.json
data/campaigns/haven/events/
data/campaigns/haven/quests/
data/campaigns/haven/hubs/
data/campaigns/haven/side_content/
data/campaigns/haven/quest_chains/
data/campaigns/haven/battle_sets/
data/campaigns/haven/map_seeds/
data/campaigns/haven/oracles/
data/campaigns/universal/
```

## Data Categories Added

These collections are now known to `DataStore`, `ContentManager`, manifest loading, validation, editor counts, and Data Browser:

```text
campaigns
scenarios
scenarioMaps
campaignEvents
campaignQuests
campaignHubs
sideContentPacks
questChains
battleSets
mapSeeds
oracleTables
carryoverProfiles
pocketHavenRules
```

## Save Shape Additions

Campaign saves now include:

```text
party
inventory
quests
flags
activeScenarioRun
scenarioHistory
mapState
worldArchive
pocketHaven
hubState
sideContent
clocks
memoryShards
bonds
pinnedNotes
log
settings
```

Side content lives under:

```text
save.sideContent.generatedIdeas
save.sideContent.activeQuestChains
save.sideContent.contentHistory
save.sideContent.reviewQueue
save.sideContent.importedPacks
```

All save writes should go through `CampaignOps` unless a module is only doing local UI rendering.

## Canon-Risk Rule

Side Content Forge must not force major story truth. Every generated or authored side card should have:

```text
canonRisk: green | yellow | red
status: idea | saved | active | resolved | rejected | archived
```

Red-risk content should be reviewed/approved by the GM before it affects the save.

## Frostbitten Starter Pack

The merged starter content includes:

- 20 hub events.
- 6 quest chains.
- 8 battle set cards.
- 4 map seeds.
- Frostbitten oracle prompts and keyword tables.
- Living hub definition with locations, NPCs, hub stats, services, problems, rumors, and moods.
- Basic Haven farming/cooking/forging support.

Main files:

```text
data/campaigns/haven/side_content/frostbitten_side_content_pack.json
data/campaigns/haven/hubs/hub_frostbitten.json
data/campaigns/haven/quest_chains/frostbitten_quest_chains.json
data/campaigns/haven/battle_sets/frostbitten_battle_sets.json
data/campaigns/haven/map_seeds/frostbitten_map_seeds.json
data/campaigns/haven/oracles/oracle_frostbitten.json
```

## Farming, Cooking, Forging

Pocket Haven handles the first version:

- Farm plots live in `save.pocketHaven.farm.plots`.
- Seeds/crops come from `data/worlds/haven/crops.json`.
- Food comes from `data/universal/food.json`.
- Crafting/forging recipes come from `data/worlds/haven/crafting.json`.
- Stations come from `data/campaigns/universal/pocket_haven_rules.json`.

Core operations:

```text
craft_basic
cook_basic
farm_tick
give_food / take_food
give_material / take_material
give_item / take_item
unlock_recipe
```

UI tabs:

```text
Forge
Cook
Farm
Pocket Haven
```

## Combat Bridge

Campaign battle flow:

1. Campaign queues a pending battle.
2. `campaign-combat-bridge.js` stores a session request.
3. `combat.html?campaignBattle=1` creates a runtime encounter.
4. Combat result is written back to session storage.
5. Campaign applies the result through `CampaignOps`.

Key files:

```text
js/campaign/campaign-combat-bridge.js
combat.html
js/combat/combat-manager.js
```

## How To Run Locally

This project has no `package.json`. Use a static server:

```powershell
py -3 -m http.server 8000 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8000/campaign.html
http://127.0.0.1:8000/editor.html
http://127.0.0.1:8000/combat.html
```

## Verification Already Done

Before merge, these checks passed:

```text
129 data JSON files parsed as UTF-8.
25 JavaScript files passed node --check.
node test_engine.js: 105 passed, 0 failed.
Campaign Mode headless Chrome smoke test passed.
Editor Campaign Data panel smoke test passed.
Combat bridge smoke test passed.
Pocket Haven farm/cook/craft smoke test passed.
```

## Best Read Sets For Future Chats

Use these targeted read sets to avoid wasting tokens.

Campaign UI or save bugs:

```text
docs/CAMPAIGN_MODE_FEATURE_SUMMARY.md
campaign.html
js/campaign/campaign-ui.js
js/campaign/campaign-state.js
js/campaign/campaign-ops.js
js/campaign/campaign-save.js
```

Side Forge / hub pulse:

```text
docs/CAMPAIGN_MODE_FEATURE_SUMMARY.md
js/campaign/campaign-side-content.js
js/campaign/campaign-hub.js
js/campaign/campaign-data-loader.js
data/campaigns/haven/side_content/frostbitten_side_content_pack.json
data/campaigns/haven/hubs/hub_frostbitten.json
```

Quest chains:

```text
js/campaign/campaign-quest-chains.js
js/campaign/campaign-ops.js
js/campaign/campaign-ui.js
data/campaigns/haven/quest_chains/frostbitten_quest_chains.json
```

Battle sets / combat bridge:

```text
js/campaign/campaign-battle-set-forge.js
js/campaign/campaign-combat-bridge.js
js/campaign/campaign-ui.js
combat.html
js/combat/combat-manager.js
data/campaigns/haven/battle_sets/frostbitten_battle_sets.json
```

Map seeds:

```text
js/campaign/campaign-map-seed-forge.js
js/campaign/campaign-map.js
js/campaign/scenario-runner.js
data/campaigns/haven/map_seeds/frostbitten_map_seeds.json
data/campaigns/haven/maps/frostwood_short_route.map.json
```

Oracle:

```text
js/campaign/campaign-idea-forge.js
js/campaign/campaign-oracle.js
data/campaigns/haven/oracles/oracle_frostbitten.json
```

Farming/cooking/forging:

```text
js/campaign/pocket-haven.js
js/campaign/campaign-ops.js
js/campaign/campaign-inventory.js
data/worlds/haven/crafting.json
data/worlds/haven/crops.json
data/universal/food.json
data/campaigns/universal/pocket_haven_rules.json
```

Editor/data loading:

```text
editor.html
js/builders/campaign-editor.js
js/ui/data-browser.js
data/_manifest.json
js/core/data-store.js
js/core/content-manager.js
```

## Good New-Chat Prompt

```text
We are working on klwar19/cjs-engine-ddboardgame.
First read docs/CAMPAIGN_MODE_FEATURE_SUMMARY.md.
Task: [specific task].
Use the read set listed in the summary for that task.
Keep changes small, preserve CampaignOps as the only save writer, and keep canon-risk review for red side content.
Run JSON parse checks, node --check, node test_engine.js, and a browser smoke test if UI changes.
```

