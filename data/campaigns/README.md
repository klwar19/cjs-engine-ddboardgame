# Campaign Data

Campaign files are authored content. They are loaded by `data/_manifest.json` through `ContentManager` into `DataStore`.

Progress saves are separate and belong in browser storage, exported JSON, or `data/campaign_saves/`.

Read `docs/CAMPAIGN_MODE_LAYOUT.md` before changing these schemas.

World folders use stable subfolders:

- `scenarios/`, `maps/`, `events/`, `quests/` for structured campaign runs.
- `side_content/`, `hubs/`, `quest_chains/`, `battle_sets/`, `map_seeds/`, `oracles/` for the Side Content Forge.

Generated side content is not canon until the GM applies or approves it. Red-risk cards should enter the review queue first.

## Story Sequence Authoring

Story sequence files under `data/campaigns/<world>/sequences/` support insertable chapter parts without renumbering everything:

- Add `orderKey` on the sequence index entry and/or story JSON. Use dotted values such as `1`, `1.1`, `1.2`, `2`.
- Add `chapterLabel` and optional `partLabel` for UI display.
- Add `summary.short` for the chapter shelf and `summary.default` for the automatic story summary when the player jumps ahead.
- For `choice` nodes, set `defaultChoiceId`. When a later part is started first, earlier unrevealed parts are defaulted once by following those authored defaults.
- For `stat_check`, `combat`, or `minigame` nodes, set `defaultResult` when the ahead-of-time default path should resolve a specific branch.

Routes and branches should still be driven by normal flags/tags:

- Put major route splits inside a story sequence when possible.
- If two separate sequence files represent alternate routes, gate them with `conditions`, `requiresFlags`, `blocksFlags`, or `requiresStoryParts` in the sequence index.
- Let route choices set stable flags, then let later story files, events, maps, or mini-games read those flags instead of hard-coding chapter numbers.

## Scenario Beats Inside Story Chapters

Story sequence files can now hand off into authored exploration runs and then resume back into the chapter:

- Add a sequence node with `type: "scenario"` and `scenarioId`.
- Use `onSuccess`, `onFail`, and `onAbort` to decide which node the story resumes at after the run ends.
- Use `defaultResult` if this scenario node may be auto-defaulted when the player jumps ahead.

Example:

```json
{
  "id": "search_map",
  "type": "scenario",
  "scenarioId": "haven_scn_bridge_search",
  "text": "Search the map for the missing scout.",
  "onSuccess": "after_target_scene",
  "onFail": "after_failure_scene",
  "onAbort": "after_abort_scene",
  "defaultResult": "success"
}
```

## Scenario Objectives And Progress Triggers

Scenarios can expose one clear objective marker plus mid-run beats:

- Add `objective` to the scenario so the map UI knows what to mark.
- Add `progressTriggers` for beats such as "after 60% explored" or "after the target is reached".
- Trigger actions can:
  - apply `ops`
  - set flags with `setFlags`
  - open VN dialogue with `storySceneId`
  - roll an `eventTableId`
  - queue a battle with `battleSetId` / `encounterId`
  - open a mini-game with `minigame`
  - end the run with `endScenario`

Example:

```json
{
  "objective": {
    "id": "find_cache",
    "kind": "reach",
    "label": "Reach the signal cache",
    "levelId": "upper_gallery",
    "cell": { "x": 4, "y": 1 },
    "marker": true
  },
  "progressTriggers": [
    {
      "id": "midpoint_scene",
      "when": { "type": "explore_percent", "gte": 60 },
      "storySceneId": "haven_story_midpoint_reveal",
      "setFlags": { "bridge.search.midpoint_seen": true }
    },
    {
      "id": "objective_scene",
      "when": { "type": "objective_completed" },
      "storySceneId": "haven_story_cache_found",
      "endScenario": "success"
    }
  ]
}
```

## Multi-Level Grid Maps

Grid maps may now define multiple levels/floors:

- Use `levels[]` on a `grid_map`.
- Each level can define its own `width`, `height`, `terrain`, `cells`, and `defaultStartCell`.
- A transition square uses `nextLevelId` plus optional `nextCell`.
- The active level lives in scenario runtime; stepping on the transition square moves the player there automatically.

Example:

```json
{
  "id": "haven_map_upper_ruin",
  "type": "grid_map",
  "defaultLevelId": "floor_1",
  "levels": [
    {
      "id": "floor_1",
      "name": "Lower Hall",
      "width": 5,
      "height": 4,
      "defaultStartCell": [0, 3],
      "terrain": [["floor"]],
      "cells": [
        { "id": "stairs_up", "x": 4, "y": 0, "kind": "stairs", "nextLevelId": "floor_2", "nextCell": [0, 0] }
      ]
    }
  ]
}
```

## Dialogue, Battle, And Mini-Games

- VN-style portrait dialogue still lives best in `stories` data via `storySceneId`.
- Story-scene lines are forward-compatible with sprite variants. Recommended line fields:
  - `speaker`, `speakerId`, `text`
  - optional `portrait` for one-off direct paths
  - optional `sprite`, `expression`, `pose`, `variant` so other tools can swap art without rewriting the scene text
- Character records can provide reusable portrait maps such as `storySprites`, `dialogueSprites`, `expressionPortraits`, `portraits`, or `expressions`. The VN renderer will look there before falling back to the base `portrait`.
- Sequence `combat` nodes now auto-resume after real battle results are applied.
- Sequence `minigame` nodes still work, and scenario progress triggers can also launch a `minigame` block directly.
- If you want a simple authored check during dialogue, story-scene choices can still use `statCheck` with normal dice or `qte_or_dice`.
