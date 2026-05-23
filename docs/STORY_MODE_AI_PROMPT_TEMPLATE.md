# Story Mode AI Prompt Template

Use this template when asking another AI to author one gradual story part or one gradual event for Campaign Story Mode.

This version is for early-stage story building:

- Build story chapter parts slowly: `1.1`, `1.1a`, `1.2`, `1.2a`.
- Build events gradually between story parts, not as a giant side-library dump.
- After each new story/event delivery, propose only small quest, hub, rumor, and event-availability updates.
- If the next part cannot progress cleanly, mark it as `"in_update"` in `notes_for_integrator` instead of forcing placeholder canon.
- Keep scenes rich enough to test flow, flags, transitions, combat return, and summary behavior. Avoid decorative filler and late-arc lore dumping.

The AI must output:

1. One `_sequence_index.json` entry
2. One sequence JSON file
3. Optional scenario JSON file
4. Optional map JSON file
5. One `story_context_update` JSON block
6. One `notes_for_integrator` JSON block

Do not ask the AI to invent loader behavior. It should stay on the schema below and put unsupported wishes in `notes_for_integrator.deferredMechanics`.

---

## Master Prompt

```text
You are authoring content for a JSON-driven campaign story engine.

Output strict JSON only, in fenced code blocks, with these sections in this order:
1. sequence_index_entry
2. sequence_file
3. scenario_file (only if this story part or event includes exploration)
4. map_file (only if the scenario uses a fixed map)
5. story_context_update
6. notes_for_integrator

Do not output prose outside those blocks.
Do not invent engine behavior.
Do not rename schema keys that already exist in the live runtime.

If a requested mechanic does not have a stable schema yet, keep the content playable using existing keys and explain the future intent in notes_for_integrator.deferredMechanics.
Example: roaming grid enemies that move every step are not a stable authored schema yet, so represent them with fixed battle cells, randomBattle hooks, progress triggers, or other current content keys, then document the intended roaming behavior in notes_for_integrator.

DELIVERY CADENCE
- Write only one playable story part or one playable event per response.
- Default to early story only unless the request explicitly asks for a later chapter.
- Prefer chapter labels like 1.1 / 1.1a / 1.2 / 1.2a for story.
- If a branch follow-up exists, keep it small and local instead of jumping far ahead.
- If the next part is blocked by missing context, unresolved content, or unstable mechanics:
  - do not fake the missing part
  - set notes_for_integrator.deliveryStatus to "in_update"
  - list blockers and recommended next step

CONTENT WINDOW
- current scope target: early arc / early chapter only
- do not write whole-act summaries as replacement for playable content
- do not jump to late reveals, late boss phases, or late relationship payoffs unless explicitly requested
- keep current output rich but practical, aimed at checking smooth integration and flow

CAMPAIGN / WORLD
- worldId: <world_id>
- campaignId: <campaign_id>
- arcId: <arc_id>

STORY CONTEXT READ / WRITE RULES
- Before drafting, read:
  - `data/worlds/_ai_story_context_index.json`
  - `data/worlds/_all_world_story_flow_summary.md`
  - `data/worlds/<world_id>/story_context/index.json`
  - `data/worlds/<world_id>/story_summary.md` only if the compact context is not enough
  - exact target files only after choosing the arc/chapter/event/quest bucket
- Treat live GM notes, save-state manual branches, and table decisions as newer than static files.
- Use the world `story_context/index.json` to choose:
  - current arc
  - event suitability bucket
  - quest suitability bucket
  - previous arc carryover
  - possible consequence points and future branch gates
- Do not read whole old arcs just to draft a small future beat. Use the compact previousArcCarryover first.
- After drafting any story, event, quest, hub update, or branch, output `story_context_update` so the integrator can update the right world file without rereading everything.
- The update must be short: one to three sentences for the new content, one line for future branch meaning, and compact event/quest suitability deltas.
- Include both current and potential consequences: alignment, world alignment, relationship thresholds, flags, stats, reputation, heat, debt, noise, infection, and route identity where relevant.

STORY IDENTITY
- sequenceId: <stable_sequence_id>
- title: <chapter_title_or_event_title>
- chapterId: <chapter_id_or_blank_for_event>
- chapterLabel: <visible_label such as 1.1 / 1.1a / 1.2 / E-03>
- orderKey: <sort_key such as 1.1 / 1.1.a / 1.2 / event.character.003>
- partId: <stable_part_id_or_blank_for_event>
- partLabel: <short_part_label>
- scope: <story|event>
- kind: <main_story|character|special|side>

STORY PURPOSE
- player-facing goal: <what the player is trying to do right now>
- chapter summary short: <1 sentence shelf summary>
- chapter summary default: <1 sentence defaulted summary if player jumps ahead>
- route / branch role: <mainline|branch_start|branch_followup|merge|standalone>
- nextCandidates:
  - id: <next_sequence_id>
    chapterLabel: <visible_label_or_blank>
    title: <title_or_in_update>
    hint: <short hint>
    visibility: <possible|hidden>

GATING
- requiresFlags: [ ... ]
- blocksFlags: [ ... ]
- requiresStoryParts: [ ... ]
- blocksStoryParts: [ ... ]

SIDE-CONTENT SYNC RULES
- after each story part or event, include small downstream update notes for:
  - quests
  - hub changes
  - rumors
  - event availability
- keep those changes in notes_for_integrator, not in invented runtime keys
- keep updates local to the new content that was just authored
- if nothing changes, output empty arrays for that category

DEFAULT FLOW RULES
- default playable flow should usually look like:
  1. VN-style narration / dialogue opener
  2. one choice, flag gate, stat check, or QTE-like check if needed
  3. combat OR movement into a scenario/map
  4. map movement with small events, traps, rewards, or consequences
  5. urgent combat when a map encounter fires; it should interrupt play immediately
  6. aftermath dialogue / consequence / retry-or-end handling
  7. clean handoff to next part, event hook, or end node
- custom flow is allowed, but the default should feel like story -> decision/check -> action pressure -> aftermath

DIALOGUE / VN REQUIREMENTS
- required characters: [ ... ]
- required mood / tone: <tone>
- keep dialogue visual-novel friendly: short lines, readable reactions, scene pacing that works in a dialogue box
- use sprite-aware line fields when relevant:
  - speaker
  - speakerId
  - text
  - optional portrait
  - optional sprite
  - optional expression
  - optional pose
  - optional variant
- include at least one node-level summary for every major beat
- keep scenes rich, but not ornamental

BRANCHING RULES
- important choices:
  - choice id
  - label
  - flags set
  - small alignment deltas, if the choice should matter later
  - immediate result
  - downstream route meaning
- every choice node must include defaultChoiceId
- if a later merge exists, preserve branch identity through flags
- if a branch is not ready yet, do not fake it; mark the follow-up as "in_update" in notes_for_integrator
- Use the soft choice-consequence tracker for future branches:
  - choice fields may include `alignment`, `karma`, or `consequencePoints`
  - supported axes are `mercy`, `resolve`, `wit`, and `duty`
  - keep deltas small, usually `-1`, `0`, or `+1`; only use `+2` / `-2` for a major visible choice
  - branches and dialogue choices may gate with `conditions.alignmentMin`, `conditions.alignmentMax`, `conditions.worldAlignmentMin`, or `conditions.potentialAlignmentMin`
  - use `potentialAlignment` on an index entry or future choice when you want the GM prompt to know what points can still be reached on that path
  - optional `npcReactions` and `futureHooks` explain who should react later and what kind of branch/quest this choice can open
  - avoid good/evil framing; these are light story leanings, not a morality system

BATTLE / MINIGAME / QTE RULES
- if combat appears in the sequence:
  - use type: "combat"
  - include encounterId or battleSetId
  - include onWin and onLose
  - include winOps / loseOps when needed
- if a mini-game appears:
  - use type: "minigame"
  - include minigameId or gameId
  - optional levelId / difficulty / theme
- if a direct stat gate appears:
  - use type: "stat_check"
  - include actor, stat, difficulty or dc, pass, fail, and defaultResult when helpful
- if the moment should feel like a QTE:
  - keep the node playable through current stat_check or minigame contracts
  - describe the urgency in text, tags, and notes_for_integrator if needed
- losing should always have a declared handling rule:
  - penalty_then_continue
  - fail_and_retry_choice
  - fail_and_end
  - game_over_and_redo
- pick the simplest handling that keeps authoring easy for AI and humans

MAP / SCENARIO RULES
- map mode: <none|node_map|grid_map|procedural_node|procedural_grid>
- if exploration exists, create a scenario node in the sequence file
- scenario_file and map_file should use the live collection-wrapper style used in current campaign data:
  - include top-level _file metadata
  - put the authored scenario or map inside entries: [ ... ]
- grid maps should support:
  - movement-triggered small events
  - traps
  - rewards
  - immediate battle interrupts through randomBattle or battle cells
- if the design wants a roaming monster:
  - represent the current playable version with stable keys
  - explain the future roaming behavior in notes_for_integrator.deferredMechanics
- when map combat takes place, it should be treated as immediate pressure, not background flavor

DISCOVERY PACING RULES
- for small single-layer maps / grids:
  - at about 60% discovered, reveal or clearly point the player toward the final objective area
  - that final objective can lead to boss battle, chain battle, event, more VN, delivery goal, or another focused climax
- for large maps or multi-layer grids:
  - around 30% discovered, or on reaching layer 2, trigger another VN/event beat
  - on layer 3, or around 60% discovered, reveal the final objective area
- if dynamic reveal is not fully supported by current runtime behavior, keep the authored destination stable and use progressTriggers plus notes_for_integrator to express the reveal plan

SCENARIO TRIGGER RULES
- prefer current supported trigger styles such as:
  - explore_percent
  - enter_cell
  - enter_node
  - objective_completed
  - battle_won
  - battle_lost
- use explicit tables or exact ids for battles, events, and minigames

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
- Sequence files should stay small and readable.
- Current target output is early content only, but it should feel full enough to test implementation flow.
- `story_context_update` must be compact and must not repeat full scenes. It is for future AI continuity and branch planning.
```

---

## Fill-In Guide

### 1. Sequence Index Entry

Use this shape:

```json
{
  "id": "story_haven_arc1_1_1_frostwood_return",
  "scope": "story",
  "kind": "main_story",
  "arcId": "haven_arc1",
  "chapterId": "arc1_ch01",
  "chapterLabel": "1.1",
  "orderKey": "1.1",
  "partId": "ch01_part01",
  "partLabel": "1.1 Frostwood Return",
  "title": "Frostwood Return",
  "file": "story/arc1/ch01_return/part01_frostwood_return.json",
  "summary": {
    "short": "Bin reaches the Frostwood road and tries to get back into Frostbitten without losing control of the moment.",
    "default": "Bin takes the safer gate approach and reaches Frostbitten after a tense return route."
  },
  "requiresFlags": [],
  "blocksFlags": [],
  "requiresStoryParts": [],
  "blocksStoryParts": [],
  "nextCandidates": [
    {
      "id": "story_haven_arc1_1_1a_gate_reunion",
      "chapterLabel": "1.1a",
      "title": "Gate Reunion",
      "hint": "Resolve the first face-to-face reaction inside Frostbitten.",
      "visibility": "possible"
    },
    {
      "id": "story_haven_arc1_1_2_frosted_mug_rumors",
      "chapterLabel": "1.2",
      "title": "Frosted Mug Rumors",
      "hint": "Follow the town-talk route after the return settles.",
      "visibility": "hidden"
    }
  ],
  "tags": ["world:haven", "arc:1", "story", "chapter:return", "early_arc"]
}
```

### 2. Sequence File

Use this shape:

```json
{
  "id": "story_haven_arc1_1_1_frostwood_return",
  "version": 1,
  "scope": "story",
  "title": "Frostwood Return",
  "arcId": "haven_arc1",
  "chapterId": "arc1_ch01",
  "chapterLabel": "1.1",
  "orderKey": "1.1",
  "partId": "ch01_part01",
  "partLabel": "1.1 Frostwood Return",
  "startNode": "open",
  "summary": {
    "short": "Bin returns through the Frostwood and reaches Frostbitten under pressure.",
    "default": "Bin chooses the safer route, survives the return patrol, and makes it to the gate."
  },
  "tags": ["world:haven", "arc:1", "story", "chapter:return", "early_arc"],
  "nodes": [
    {
      "id": "open",
      "type": "narration",
      "text": "Snow folds over the Frostwood road like the world is trying to hide the paperwork. Bin lands badly, stands up worse, and hears Peri trying not to laugh.",
      "summary": "Bin returns to the Frostwood edge.",
      "next": "peri_intro"
    },
    {
      "id": "peri_intro",
      "type": "dialogue",
      "speaker": "Peri",
      "portrait": "peri",
      "text": "Welcome home. Try not to die before anyone can be emotionally inconvenient about it.",
      "summary": "Peri frames the return as both a joke and a warning.",
      "next": "route_choice"
    },
    {
      "id": "route_choice",
      "type": "choice",
      "prompt": "How does Bin approach Frostbitten?",
      "defaultChoiceId": "gate",
      "choices": [
        {
          "id": "gate",
          "label": "Take the gate road",
          "ops": [
            { "op": "set_flag", "flag": "story_return_route_gate", "value": true },
            { "op": "log", "text": "Story route: Bin takes the visible gate road." }
          ],
          "next": "nerve_check"
        },
        {
          "id": "tree_line",
          "label": "Skirt the tree line first",
          "ops": [
            { "op": "set_flag", "flag": "story_return_route_tree_line", "value": true },
            { "op": "log", "text": "Story route: Bin tries to manage the return from the edge of sight." }
          ],
          "next": "nerve_check"
        }
      ],
      "summary": "Bin chooses how visible his return will be."
    },
    {
      "id": "nerve_check",
      "type": "stat_check",
      "actor": "bin",
      "stat": "C",
      "difficulty": 11,
      "text": "Keep your voice steady before the rumor gets there first.",
      "defaultResult": "pass",
      "passOps": [
        { "op": "set_flag", "flag": "story_return_kept_composure", "value": true }
      ],
      "failOps": [
        { "op": "set_flag", "flag": "story_return_shaky_start", "value": true }
      ],
      "pass": "return_patrol",
      "fail": "return_patrol",
      "summary": "Bin either keeps control of the moment or lets nerves show."
    },
    {
      "id": "return_patrol",
      "type": "scenario",
      "scenarioId": "haven_scn_frostwood_return_patrol",
      "text": "Cross the Frostwood approach and reach Frostbitten Gate.",
      "defaultResult": "success",
      "onSuccess": "after_gate",
      "onFail": "after_failure",
      "onAbort": "after_abort"
    },
    {
      "id": "after_gate",
      "type": "dialogue",
      "speaker": "Gate Guard",
      "text": "We thought you were dead.",
      "summary": "Bin reaches the gate and the emotional truth lands immediately.",
      "next": "record_return"
    },
    {
      "id": "record_return",
      "type": "ops",
      "summary": "The return part records the chapter result and opens nearby side content hooks.",
      "ops": [
        { "op": "set_flag", "flag": "story_haven_return_seen", "value": true },
        { "op": "tag_add", "tag": "bin_returned_to_haven", "scope": "story", "source": "sequence" }
      ],
      "next": "end_complete"
    },
    {
      "id": "after_failure",
      "type": "choice",
      "prompt": "The road goes wrong before Bin reaches the gate.",
      "defaultChoiceId": "take_penalty",
      "choices": [
        {
          "id": "retry_route",
          "label": "Redo the route",
          "next": "return_patrol"
        },
        {
          "id": "take_penalty",
          "label": "Accept the setback and continue",
          "ops": [
            { "op": "set_flag", "flag": "story_haven_return_rough_entry", "value": true },
            { "op": "tag_add", "tag": "rumor:bin_staggered_in", "scope": "story", "source": "sequence" }
          ],
          "next": "end_penalty"
        }
      ],
      "summary": "Failure can lead to a retry or a penalty path."
    },
    {
      "id": "after_abort",
      "type": "end",
      "result": "abort"
    },
    {
      "id": "end_complete",
      "type": "end",
      "result": "complete"
    },
    {
      "id": "end_penalty",
      "type": "end",
      "result": "complete"
    }
  ]
}
```

### 3. Scenario File

Use the live collection-wrapper shape used in current campaign data:

```json
{
  "_file": {
    "version": 1,
    "format": "cjs-collection",
    "scope": "world",
    "world": "haven",
    "category": "scenarios",
    "status": "active"
  },
  "entries": [
    {
      "id": "haven_scn_frostwood_return_patrol",
      "name": "Frostwood Return Patrol",
      "world": "haven",
      "type": "field_run",
      "phaseCost": 1,
      "travelMode": "grid_map",
      "mapId": "haven_map_frostwood_return_patrol",
      "startCell": [1, 4],
      "setting": "outdoor",
      "size": "small",
      "tags": ["grid", "story", "return_route", "early_arc"],
      "notes": "Small early-story grid run. Start with tension, trigger small route hazards, then point the player at the final gate approach.",
      "limits": { "campRests": 0, "events": 4, "randomBattles": 3 },
      "danger": { "start": 0, "max": 9 },
      "setBattles": [
        {
          "id": "return_wolf_cutoff",
          "battleSetId": "haven_bset_wolf_pack_bent_pine",
          "label": "Wolf Cutoff"
        },
        {
          "id": "return_bandit_cutoff",
          "battleSetId": "haven_bset_bandit_taxmen_snowblind",
          "label": "Snowblind Roadblock"
        }
      ],
      "randomBattleTables": [
        {
          "id": "return_patrol_battles",
          "name": "Return Patrol Battles",
          "entries": [
            { "weight": 50, "battleSetId": "haven_bset_wolf_pack_bent_pine", "label": "Wolf Pack" },
            { "weight": 30, "battleSetId": "haven_bset_bandit_taxmen_snowblind", "label": "Taxmen" },
            { "weight": 20, "encounterId": "haven_enc_bridge_watcher", "label": "Road Watcher" }
          ]
        }
      ],
      "successConditions": [
        { "type": "reach_cell", "x": 5, "y": 1 }
      ],
      "failureConditions": [],
      "progressTriggers": [
        {
          "id": "return_mid_pressure",
          "when": { "type": "explore_percent", "gte": 60 },
          "log": "A clearer route to Frostbitten opens ahead.",
          "setFlags": { "story_return_final_route_revealed": true }
        },
        {
          "id": "return_objective_scene",
          "when": { "type": "objective_completed" },
          "storySceneId": "haven_story_return_gate_seen",
          "endScenario": "success"
        }
      ],
      "entryOps": [
        { "op": "log", "text": "The return patrol begins." },
        { "op": "log", "text": "Quest phase: cross the approach, survive the pressure, and reach the gate." }
      ],
      "exitOps": [
        { "op": "log", "text": "The return patrol ends." }
      ]
    }
  ]
}
```

### 4. Fixed Map File

Use the live collection-wrapper shape used in current campaign data.

#### Grid Example

```json
{
  "_file": {
    "version": 1,
    "format": "cjs-collection",
    "scope": "world",
    "world": "haven",
    "category": "scenarioMaps",
    "status": "active"
  },
  "entries": [
    {
      "id": "haven_map_frostwood_return_patrol",
      "name": "Frostwood Return Patrol",
      "type": "grid_map",
      "world": "haven",
      "setting": "outdoor",
      "size": "small",
      "width": 7,
      "height": 6,
      "defaultStartCell": [1, 4],
      "terrain": [
        ["wall", "wall", "floor", "floor", "floor", "wall", "wall"],
        ["wall", "floor", "floor", "obstacle", "floor", "floor", "wall"],
        ["floor", "floor", "floor", "floor", "floor", "floor", "floor"],
        ["floor", "obstacle", "floor", "floor", "obstacle", "floor", "floor"],
        ["wall", "floor", "floor", "floor", "floor", "floor", "wall"],
        ["wall", "wall", "floor", "floor", "floor", "wall", "wall"]
      ],
      "cells": [
        {
          "id": "tree_line_start",
          "title": "Tree Line",
          "x": 1,
          "y": 4,
          "kind": "entrance",
          "discoveredByDefault": true,
          "tags": ["start", "return_route"]
        },
        {
          "id": "cold_tracks",
          "title": "Cold Tracks",
          "x": 2,
          "y": 3,
          "kind": "event",
          "tags": ["tracks", "warning"],
          "notes": "A small story beat that builds pressure before the next clash.",
          "onEnter": [
            { "op": "log", "text": "Tracks split in two directions. Something is already moving." }
          ]
        },
        {
          "id": "thin_ice",
          "title": "Thin Ice",
          "x": 3,
          "y": 2,
          "kind": "trap",
          "tags": ["ice", "danger"],
          "onEnter": [
            { "op": "danger", "amount": 1 },
            { "op": "damage_party", "amount": 2 },
            { "op": "log", "text": "Thin Ice: the party loses footing and time." }
          ]
        },
        {
          "id": "watcher_lane",
          "title": "Watcher Lane",
          "x": 4,
          "y": 4,
          "kind": "battle",
          "tags": ["ambush", "roaming-threat-proxy"],
          "notes": "Current playable proxy for a future moving enemy.",
          "randomBattle": {
            "chance": 1,
            "encounterId": "haven_enc_bridge_watcher",
            "label": "Road Watcher Intercept"
          }
        },
        {
          "id": "wolf_cutoff",
          "title": "Wolf Cutoff",
          "x": 5,
          "y": 2,
          "kind": "battle",
          "tags": ["wolf", "ambush"],
          "battleSetIds": ["haven_bset_wolf_pack_bent_pine"],
          "randomBattle": {
            "chance": 1,
            "battleSetId": "haven_bset_wolf_pack_bent_pine"
          }
        },
        {
          "id": "road_cache",
          "title": "Road Cache",
          "x": 2,
          "y": 1,
          "kind": "reward",
          "tags": ["cache", "reward"],
          "onEnter": [
            { "op": "give_money", "currency": "haven_gold", "amount": 8 },
            { "op": "log", "text": "A frozen roadside cache still holds emergency coin." }
          ]
        },
        {
          "id": "frostbitten_gate",
          "title": "Frostbitten Gate",
          "x": 5,
          "y": 1,
          "kind": "exit",
          "tags": ["final_objective", "gate"],
          "notes": "Treat this as the final objective area once the route is revealed."
        }
      ]
    }
  ]
}
```

---

## Notes For Integrator Template

Have the AI fill this block every time, even if the arrays are empty:

```json
{
  "deliveryStatus": "ready",
  "implementedSlice": {
    "scope": "story",
    "chapterLabel": "1.1",
    "title": "Frostwood Return"
  },
  "blockers": [],
  "questUpdates": [
    {
      "id": "quest_frostwood_patrol_notice",
      "action": "unlock",
      "reason": "The return route establishes a safe early patrol loop."
    }
  ],
  "hubUpdates": [
    {
      "id": "hub_gate_reactions",
      "action": "add",
      "area": "frostbitten_gate",
      "reason": "The town now has an immediate reaction to Bin's return."
    }
  ],
  "rumorUpdates": [
    {
      "id": "rumor_bin_is_back",
      "priority": "early",
      "text": "Someone swears the ghost came back through the Frostwood.",
      "requiresFlags": ["story_haven_return_seen"]
    }
  ],
  "eventUpdates": [
    {
      "id": "event_bin_peri_luck_check",
      "action": "promote",
      "reason": "Peri now has a clean opening to test Bin after the return scene."
    }
  ],
  "deferredMechanics": [
    {
      "label": "Roaming road watcher",
      "currentPlayableForm": "fixed battle cell plus immediate randomBattle trigger",
      "futureIntent": "Make this enemy move randomly across the grid like a patrol shadow and interrupt the player on contact."
    }
  ],
  "nextSuggestedTargets": [
    {
      "id": "story_haven_arc1_1_1a_gate_reunion",
      "chapterLabel": "1.1a",
      "reason": "This is the smallest clean follow-up after the return route resolves."
    }
  ]
}
```

## Story Context Update Template

Have the AI fill this block every time. The integrator should apply it to `data/worlds/<world_id>/story_context/index.json`, then mirror only the most important prose in `story_summary.md` when useful.

```json
{
  "worldId": "haven",
  "targetContextFile": "data/worlds/haven/story_context/index.json",
  "arcId": "haven_arc1",
  "contentType": "story",
  "contentId": "story_haven_arc1_1_1_frostwood_return",
  "summaryDelta": {
    "newContentShort": "Bin returns through the Frostwood, reaches the road under pressure, and chooses whether to enter Frostbitten openly or through the tavern route.",
    "previousArcCarryoverIfArcClosed": "",
    "arcSummaryPatch": "Add this part as the opening return beat for Haven Arc 1. Preserve route identity for later gate/tavern reactions.",
    "branchMeaning": "Gate route leans duty and public trust. Tavern route leans wit and local warmth."
  },
  "eventSuitabilityDelta": [
    {
      "bucket": "return_reactions",
      "fitsAfter": ["1.1"],
      "summary": "Town reaction, Peri luck check, gate gossip, tavern rumor, or friendly rival comedy can now trigger.",
      "goodTrackers": ["wit", "duty", "frostbitten.reputation"]
    }
  ],
  "questSuitabilityDelta": [
    {
      "bucket": "public_return",
      "fitsChapters": ["1.1", "1.1.a", "1.1.b"],
      "questIds": ["haven_qchain_ledger_of_the_ghost", "haven_qchain_three_silver_discount"],
      "summary": "Use paperwork and tavern comedy to prove Bin is back without adding heavy plot pressure."
    }
  ],
  "consequencePotential": [
    {
      "id": "return_entry_style",
      "currentIfChosen": ["story_return_route_gate", "story_return_route_tavern"],
      "potentialAxes": { "duty": 1, "wit": 1, "resolve": 1 },
      "relationshipOrWorldPressure": ["frostbitten.reputation", "lily.trust"],
      "futureBranchUse": "NPCs can react to whether Bin returned openly, socially, or under visible pressure."
    }
  ],
  "readNextForFutureAI": [
    "data/worlds/haven/story_context/index.json",
    "data/campaigns/haven/sequences/_sequence_index.json",
    "Exact next sequence file only after choosing Gate or Tavern route."
  ],
  "protectedTruthNotes": [
    "Do not reveal Lily's cure path, Garr's protected history, or the coin buyer's name in this update."
  ]
}
```

If the next part cannot be cleanly authored yet, use:

```json
{
  "deliveryStatus": "in_update",
  "implementedSlice": {
    "scope": "story",
    "chapterLabel": "1.1",
    "title": "Frostwood Return"
  },
  "blockers": [
    "Gate reunion branch depends on final rumor / hub reaction wording.",
    "Roaming monster behavior is still planned, not fully authored as a stable runtime schema."
  ],
  "questUpdates": [],
  "hubUpdates": [],
  "rumorUpdates": [],
  "eventUpdates": [],
  "deferredMechanics": [],
  "nextSuggestedTargets": [
    {
      "id": "story_haven_arc1_1_1a_gate_reunion",
      "chapterLabel": "1.1a",
      "reason": "Finish the hub reaction pass first, then author this follow-up."
    }
  ]
}
```

---

## Random / Manual Value Table Template

When the AI needs a compact summary inside `notes_for_integrator`, it can use:

```json
{
  "randomManualTable": {
    "battles": {
      "fixed": [
        { "label": "Gate Road Cutoff", "battleSetId": "haven_bset_wolf_pack_bent_pine" }
      ],
      "random": [
        { "label": "Wolf Pack", "battleSetId": "haven_bset_wolf_pack_bent_pine", "weight": 50 },
        { "label": "Snowblind Taxmen", "battleSetId": "haven_bset_bandit_taxmen_snowblind", "weight": 30 }
      ]
    },
    "events": {
      "fixed": [
        { "label": "Tracks Warning", "eventId": "haven_evt_return_tracks_warning" }
      ],
      "random": [
        { "label": "Cold Trail", "eventTableId": "haven_evt_return_cold_trail", "weight": 40 },
        { "label": "Broken Marker", "eventTableId": "haven_evt_return_broken_marker", "weight": 20 }
      ]
    },
    "minigames": {
      "fixed": [
        { "label": "Frozen Latch", "gameId": "push_box", "levelId": "return_cache_lock", "difficulty": 2 }
      ]
    },
    "checks": [
      { "label": "Keep your nerve", "type": "stat_check", "stat": "C", "dc": 11 },
      { "label": "Grab the rope in time", "type": "qte_like", "stat": "C", "dc": 12 }
    ],
    "roamingThreatProxy": [
      {
        "label": "Road Watcher",
        "currentPlayableForm": "battle cell with immediate encounter",
        "futureIntent": "randomly moving grid threat"
      }
    ]
  }
}
```

---

## Event-Only Prompt Variant

Use this when you want a standalone character, special, or side event instead of a story chapter part:

```text
Same rules as the master prompt, but:
- scope: event
- kind: <character|special|side>
- chapterLabel: leave blank unless UI needs a visible event code
- orderKey: use an event-local stable key such as event.character.peri.001
- keep the event tied to the current early story state
- event availability should react to recently authored story parts
- sequence file may include narration, dialogue, choice, stat_check, combat, minigame, scenario, and end
- do not require a scenario/map unless the event explicitly includes exploration
- still output notes_for_integrator with quest, hub, rumor, and follow-up event implications
```
