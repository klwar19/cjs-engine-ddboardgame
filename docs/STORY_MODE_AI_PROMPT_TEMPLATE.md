# Story Mode AI Prompt Template

Use this template when asking another AI to author a chapter part, story event, or route branch for Campaign Story Mode.

The AI must output:

1. One `_sequence_index.json` entry
2. One sequence JSON file
3. Optional scenario JSON
4. Optional map JSON
5. Optional reusable event/battle/minigame references only by id

Do not ask the AI to invent loader behavior. It should only use the schema below.

---

## Master Prompt

```text
You are authoring content for a JSON-driven campaign story engine.

Output strict JSON only, in fenced code blocks, with these sections in this order:
1. sequence_index_entry
2. sequence_file
3. scenario_file (only if this chapter part includes exploration)
4. map_file (only if the scenario uses a fixed map)
5. notes_for_integrator

Do not output prose outside those blocks.
Do not invent engine behavior.
Do not rename schema keys.

CAMPAIGN / WORLD
- worldId: <world_id>
- campaignId: <campaign_id>
- arcId: <arc_id>

STORY IDENTITY
- sequenceId: <stable_sequence_id>
- title: <chapter_title>
- chapterId: <chapter_id>
- chapterLabel: <visible_label such as 1.15 / 1.16a / E-03>
- orderKey: <sort_key such as 1.15 / 1.16.a / event.character.003>
- partId: <stable_part_id>
- partLabel: <short_part_label>
- scope: <story|event>
- kind: <main_story|character|special|side>

STORY PURPOSE
- player-facing goal: <what the player is trying to do>
- chapter summary short: <1 sentence shelf summary>
- chapter summary default: <1 sentence defaulted summary if player jumps ahead>
- route / branch role: <branch_start|branch_followup|merge|standalone>
- nextCandidates:
  - id: <next_sequence_id>
    chapterLabel: <visible_label>
    title: <title>
    hint: <short hint>
    visibility: <possible|hidden>

GATING
- requiresFlags: [ ... ]
- blocksFlags: [ ... ]
- requiresStoryParts: [ ... ]
- blocksStoryParts: [ ... ]

DIALOGUE / VN REQUIREMENTS
- required characters: [ ... ]
- required mood / tone: <tone>
- use sprite-aware line fields:
  - speaker
  - speakerId
  - text
  - optional portrait
  - optional sprite
  - optional expression
  - optional pose
  - optional variant
- include at least one node-level summary for every major beat

BRANCHING RULES
- important choices:
  - choice id
  - label
  - flags set
  - immediate result
  - downstream route meaning
- every choice node must include defaultChoiceId
- if a later merge exists, preserve branch identity through flags

BATTLE / MINIGAME / QTE RULES
- if combat appears:
  - use type: "combat"
  - include encounterId or battleSetId
  - include onWin and onLose
  - include winOps / loseOps when needed
- if a mini-game appears:
  - use type: "minigame"
  - include gameId
  - optional levelId / difficulty / theme
- if a quick reaction check appears inside VN dialogue:
  - use story-scene choice statCheck with type: "qte_or_dice"

MAP / SCENARIO RULES
- map mode: <none|node_map|grid_map|procedural_node|procedural_grid>
- if exploration exists, create a scenario node in the sequence file
- objective style:
  - type: <reach|find_person|find_item|defeat_boss|solve_puzzle|escort|survive|collect>
  - marker: true
  - target: <nodeId|cell|npcId|itemId|encounterId|customId>
- include one progress trigger at 60% exploration if exploration is substantial
- after objective completion, trigger follow-up dialogue and then end or branch the scenario cleanly

RANDOM / MANUAL TABLES
- when random content is used, provide explicit tables/weights
- when manual/fixed content is used, provide exact ids
- never mix "random" and "fixed" ambiguously; declare both separately when both are possible

VALUE TABLES TO FILL
- random battles:
  - label
  - battleSetId or encounterId
  - weight
- random events:
  - eventTableId or eventId
  - weight
- progress triggers:
  - id
  - when
  - action
- branch exits:
  - choice or outcome
  - flags set
  - next sequence id

OUTPUT REQUIREMENTS
- All JSON must be valid.
- Use ASCII ids and filenames.
- Keep filenames as stable slugs; ordering must rely on chapterLabel/orderKey metadata, not filename parsing.
- Sequence files should be small and readable.
```

---

## Fill-In Guide

### 1. Sequence Index Entry

Use this shape:

```json
{
  "id": "story_arc1_1_15_bridge_search",
  "scope": "story",
  "kind": "main_story",
  "arcId": "haven_arc1",
  "chapterId": "arc1_ch01_15",
  "chapterLabel": "1.15",
  "orderKey": "1.15",
  "partId": "part_1_15",
  "partLabel": "Bridge Search",
  "title": "Bridge Search",
  "file": "story/arc1/ch01/part_1_15_bridge_search.sequence.json",
  "summary": {
    "short": "Bin searches the bridge route for the missing scout.",
    "default": "Bin searches the bridge route and reaches the target cache."
  },
  "requiresFlags": [],
  "blocksFlags": [],
  "requiresStoryParts": [],
  "blocksStoryParts": [],
  "nextCandidates": [
    {
      "id": "story_arc1_1_16a_gate_followup",
      "chapterLabel": "1.16a",
      "title": "Gate Follow-up",
      "hint": "Press the gate route after the search resolves.",
      "visibility": "possible"
    }
  ],
  "tags": ["world:haven", "arc:1", "story", "route:bridge"]
}
```

### 2. Sequence File

Use this shape:

```json
{
  "id": "story_arc1_1_15_bridge_search",
  "version": 1,
  "scope": "story",
  "title": "Bridge Search",
  "arcId": "haven_arc1",
  "chapterId": "arc1_ch01_15",
  "chapterLabel": "1.15",
  "orderKey": "1.15",
  "partId": "part_1_15",
  "partLabel": "Bridge Search",
  "startNode": "open",
  "summary": {
    "short": "Bin searches the bridge route for the missing scout.",
    "default": "Bin searches the bridge route and reaches the target cache."
  },
  "tags": ["world:haven", "arc:1", "story", "route:bridge"],
  "nodes": [
    {
      "id": "open",
      "type": "narration",
      "text": "Bin reaches the bridge approach under a hard blue dusk.",
      "summary": "Bin arrives at the bridge approach.",
      "next": "vn_intro"
    },
    {
      "id": "vn_intro",
      "type": "ops",
      "summary": "A story scene introduces the search.",
      "ops": [
        { "op": "log", "text": "Bridge Search begins." }
      ],
      "next": "search_map"
    },
    {
      "id": "search_map",
      "type": "scenario",
      "scenarioId": "haven_scn_bridge_search",
      "text": "Search the lower and upper halls for the target cache.",
      "defaultResult": "success",
      "onSuccess": "after_target",
      "onFail": "after_failure",
      "onAbort": "after_abort"
    },
    {
      "id": "after_target",
      "type": "choice",
      "prompt": "What should Bin do with the recovered signal?",
      "defaultChoiceId": "gate",
      "choices": [
        {
          "id": "gate",
          "label": "Take it to the gate captain",
          "ops": [
            { "op": "set_flag", "flag": "route.bridge.gate", "value": true }
          ],
          "next": "end_gate"
        },
        {
          "id": "tavern",
          "label": "Hide it and go to the tavern",
          "ops": [
            { "op": "set_flag", "flag": "route.bridge.tavern", "value": true }
          ],
          "next": "end_tavern"
        }
      ]
    },
    {
      "id": "end_gate",
      "type": "end",
      "result": "complete"
    },
    {
      "id": "end_tavern",
      "type": "end",
      "result": "complete"
    },
    {
      "id": "after_failure",
      "type": "end",
      "result": "fail"
    },
    {
      "id": "after_abort",
      "type": "end",
      "result": "abort"
    }
  ]
}
```

### 3. Scenario File

Use this shape:

```json
{
  "id": "haven_scn_bridge_search",
  "name": "Bridge Search",
  "world": "haven",
  "travelMode": "grid_map",
  "mapId": "haven_map_bridge_search",
  "startLevelId": "floor_1",
  "startCell": [0, 2],
  "danger": { "start": 1, "max": 10 },
  "limits": { "campRests": 0, "events": 3, "randomBattles": 3 },
  "objective": {
    "id": "find_cache",
    "kind": "reach",
    "label": "Reach the signal cache",
    "levelId": "floor_2",
    "cell": { "x": 4, "y": 1 },
    "marker": true
  },
  "progressTriggers": [
    {
      "id": "midpoint_scene",
      "when": { "type": "explore_percent", "gte": 60 },
      "storySceneId": "haven_story_bridge_midpoint",
      "setFlags": { "bridge.search.midpoint_seen": true }
    },
    {
      "id": "objective_scene",
      "when": { "type": "objective_completed" },
      "storySceneId": "haven_story_bridge_cache_found",
      "endScenario": "success"
    }
  ],
  "randomBattleTables": [
    {
      "id": "bridge_search_battles",
      "name": "Bridge Search Battles",
      "entries": [
        { "weight": 50, "battleSetId": "haven_bset_wolf_pack_bent_pine", "label": "Wolf Pack" },
        { "weight": 30, "battleSetId": "haven_bset_bandit_taxmen_snowblind", "label": "Bandit Taxmen" },
        { "weight": 20, "encounterId": "haven_enc_bridge_watcher", "label": "Bridge Watcher" }
      ]
    }
  ],
  "entryOps": [
    { "op": "log", "text": "The bridge search begins." }
  ],
  "exitOps": [
    { "op": "log", "text": "The bridge search is over." }
  ]
}
```

### 4. Fixed Map File

Use either node-map or grid-map.

#### Grid Example

```json
{
  "id": "haven_map_bridge_search",
  "name": "Bridge Search",
  "type": "grid_map",
  "defaultLevelId": "floor_1",
  "levels": [
    {
      "id": "floor_1",
      "name": "Lower Hall",
      "width": 5,
      "height": 4,
      "defaultStartCell": [0, 2],
      "terrain": [
        ["floor", "floor", "floor", "floor", "floor"]
      ],
      "cells": [
        {
          "id": "stairs_up",
          "x": 4,
          "y": 0,
          "kind": "stairs",
          "title": "Stairs Up",
          "nextLevelId": "floor_2",
          "nextCell": [0, 0]
        }
      ]
    },
    {
      "id": "floor_2",
      "name": "Upper Gallery",
      "width": 5,
      "height": 4,
      "defaultStartCell": [0, 0],
      "terrain": [
        ["floor", "floor", "floor", "floor", "floor"]
      ],
      "cells": [
        {
          "id": "target_cache",
          "x": 4,
          "y": 1,
          "kind": "event",
          "title": "Signal Cache"
        }
      ]
    }
  ]
}
```

---

## Random / Manual Value Table Template

Have the AI fill this compact table in `notes_for_integrator`:

```json
{
  "randomManualTable": {
    "battles": {
      "fixed": [
        { "label": "Boss Clash", "battleSetId": "haven_bset_bridge_boss" }
      ],
      "random": [
        { "label": "Wolf Pack", "battleSetId": "haven_bset_wolf_pack_bent_pine", "weight": 50 },
        { "label": "Bandit Taxmen", "battleSetId": "haven_bset_bandit_taxmen_snowblind", "weight": 30 }
      ]
    },
    "events": {
      "fixed": [
        { "label": "Midpoint Reveal", "storySceneId": "haven_story_bridge_midpoint" }
      ],
      "random": [
        { "label": "Cold Trail", "eventTableId": "haven_evt_bridge_cold_trail", "weight": 40 },
        { "label": "Broken Marker", "eventTableId": "haven_evt_bridge_broken_marker", "weight": 20 }
      ]
    },
    "minigames": {
      "fixed": [
        { "label": "Cache Lock", "gameId": "push_box", "levelId": "bridge_cache_lock", "difficulty": 2 }
      ]
    },
    "qteChecks": [
      { "label": "Grab the rope in time", "type": "qte_or_dice", "stat": "C", "dc": 12 }
    ]
  }
}
```

---

## Event-Only Prompt Variant

Use this when you want a standalone character/special/side event instead of a story chapter:

```text
Same rules as the master prompt, but:
- scope: event
- kind: <character|special|side>
- chapterLabel: leave blank unless UI needs a visible event code
- orderKey: use an event-local stable key such as event.character.peri.001
- sequence file may include narration, dialogue, choice, combat, minigame, and end
- do not require a scenario/map unless the event explicitly includes exploration
```
