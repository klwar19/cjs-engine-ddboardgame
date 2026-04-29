# CJS Campaign Mode Layout

Campaign Mode is a GM control panel and campaign ledger that sits above the combat simulator. It tracks phase, party state, inventory, money, quests, scenario progress, map movement, events, traps, rewards, and battle results. It can send a battle to `combat.html`, but tabletop/manual results are always valid.

## Read This First

For future campaign changes, read only the narrow set you need:

- General campaign work: `docs/CAMPAIGN_MODE_LAYOUT.md`, `DEVELOPER_GUIDE.md`, `data/README.md`, `data/_manifest.json`.
- Campaign UI: `campaign.html`, `js/campaign/campaign-ui.js`, `js/campaign/campaign-state.js`, `js/campaign/campaign-ops.js`.
- Scenario and maps: `js/campaign/scenario-runner.js`, `js/campaign/campaign-map.js`, `data/campaigns/<world>/scenarios/`, `data/campaigns/<world>/maps/`.
- Events and oracle: `js/campaign/campaign-events.js`, `js/campaign/campaign-oracle.js`, `data/campaigns/<world>/events/`.
- Side Content Forge: `js/campaign/campaign-side-content.js`, `js/campaign/campaign-hub.js`, `js/campaign/campaign-quest-chains.js`, `js/campaign/campaign-battle-set-forge.js`, `js/campaign/campaign-map-seed-forge.js`, `js/campaign/campaign-idea-forge.js`, plus `data/campaigns/<world>/{side_content,hubs,quest_chains,battle_sets,map_seeds,oracles}/`.
- Combat handoff: `js/campaign/campaign-combat-bridge.js`, `combat.html`, `js/ui/combat-ui.js`, `js/combat/combat-manager.js`.
- Shops, inventory, Pocket Haven: `js/campaign/campaign-inventory.js`, `js/campaign/campaign-economy.js`, `js/campaign/pocket-haven.js`, and the one relevant `data/worlds/<world>/` file.
- Editor support: `editor.html`, `js/builders/campaign-editor.js`, `js/core/content-manager.js`, `js/core/data-store.js`.

Avoid scanning every world folder. Use `data/_manifest.json` to find the exact world/category file.

## Runtime Shape

Authored content lives in `data/campaigns/<world>/` and is loaded through `ContentManager` into `DataStore`:

- `DataStore.campaigns`
- `DataStore.scenarios`
- `DataStore.scenarioMaps`
- `DataStore.campaignEvents`
- `DataStore.campaignQuests`
- `DataStore.campaignProfiles`
- `DataStore.pocketHavenRules`
- `DataStore.sideContentPacks`
- `DataStore.campaignHubs`
- `DataStore.questChains`
- `DataStore.battleSets`
- `DataStore.mapSeeds`
- `DataStore.oracleTables`

Player progress lives in browser/export/GitHub campaign saves, not in character or scenario author files. The campaign save overlays current HP/MP, statuses, inventory, map visits, quest progress, flags, Pocket Haven state, and session log.

## Design Rules

- The GM has final control. Random events and traps are suggestions until applied.
- Campaign Mode logs every state change.
- Combat remains a battle resolver. Campaign Mode owns the ledger, scenario map, inventory, and quest progress.
- World-local state is archived under `worldArchive` when travelling. Universal JP and Pocket Haven carry across worlds.
- Use operations for changes so event tables, manual GM overrides, shops, rests, maps, and battle results all mutate state the same way.
- Side Forge never decides canon. Green cards can be applied directly, yellow cards should be treated as soft warnings, and red cards go through the review queue before affecting the save.

## File Layout

```text
campaign.html
css/campaign.css
js/campaign/
  campaign-state.js
  campaign-ops.js
  campaign-save.js
  campaign-ui.js
  scenario-runner.js
  campaign-map.js
  campaign-events.js
  campaign-oracle.js
  campaign-combat-bridge.js
  campaign-data-loader.js
  campaign-side-content.js
  campaign-hub.js
  campaign-quest-chains.js
  campaign-battle-set-forge.js
  campaign-map-seed-forge.js
  campaign-idea-forge.js
  campaign-inventory.js
  campaign-economy.js
  pocket-haven.js
data/campaigns/
  README.md
  universal/
  haven/
    haven_free_campaign_test.campaign.json
    scenarios/
    maps/
    events/
    quests/
    side_content/
    hubs/
    quest_chains/
    battle_sets/
    map_seeds/
    oracles/
data/campaign_saves/
```

## Operation Contract

Operations are plain objects with `op` plus arguments:

```json
{ "op": "give_material", "id": "haven_wolf_pelt", "qty": 2 }
```

Supported operation families include logging, flags, map movement, phase/scenario pass, battles, events, checks, currency, inventory, HP/MP, statuses, buffs, stats, XP/level, quests, hub state, side ideas, review queue, quest chains, clocks, reputation, bonds, danger, rests, shops, forging/crafting, cooking, farming, world/chapter transitions, reset, and carryover.

## Battle Handoff

Campaign writes a battle request to `sessionStorage`, then opens `combat.html?campaignBattle=1`. Combat creates a runtime encounter from the authored encounter and campaign party overlay. When combat reaches `battle_end`, it writes a campaign battle result back to `sessionStorage`. Campaign reads the result and offers to apply HP/MP/status/loot changes.

## Useful Test Path

1. Open `campaign.html`.
2. Create or reset the Haven Free Campaign Test save.
3. Start Frostwood Short Run.
4. Move to Wolf Tracks and trigger the wolf pack battle.
5. Either resolve manually or run the combat bridge.
6. Return to Campaign Mode, apply the result, finish at Old Shrine, and export/save.
