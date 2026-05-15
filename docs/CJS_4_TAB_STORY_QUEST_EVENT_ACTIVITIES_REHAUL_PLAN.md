# CJS Four Tab Campaign Rehaul Plan

This plan turns Campaign Mode into four clear modes:

- Story
- Quest
- Event
- Activities

The goal is a smoother solo-GM app that still allows manual GM changes without making the user manage ten disconnected systems. The engine should stay simple. The richness should come from small, readable content files.

## Product Shape

### Story Tab

Story is the main arc player.

Required UI:

- Arc, chapter, and part picker.
- Continue current part button.
- Warning when selecting ahead: previous unreached parts will be marked revealed using their authored default path and default consequences.
- Summary tab showing what happened up to the current chapter.
- Replay/re-read mode for old chapters.
- Manual GM addendum form for adding notes to the story summary.
- Consequence drawer for manual reward, penalty, flag, relationship, battle, map move, or quest update.

Behavior:

- Main story is divided into chapters, and chapters into smaller parts.
- A part can switch between visual novel dialogue, narration, map movement, stat checks, combat, mini-games, rewards, penalties, and conclusion.
- Replaying a part should not re-apply consequences unless the GM explicitly chooses "apply override".
- Jumping ahead should use default path operations only once, then mark those parts as defaulted.
- Manual story entries do not need VN scenes, but they must be readable later and included in summary.

### Quest Tab

Quest is the reward and task layer.

Quest families:

- Daily quests: light repeatable quests reset by phase, chapter beat, or authored cooldown.
- Normal quests: created or randomly picked from templates, suited to rank, plot, current world, and active tags.
- Story quests: one-time or repeated by chapter/beat, with richer content and optional VN scenes.

Behavior:

- Daily quests should be light: small text variance, contextual monster or item pick, simple reward.
- Repeated quests reset after passing a phase or beat, not every screen refresh.
- Random monsters must match current context tags, rank band, biome, danger, phase, and plot state.
- Quest objectives can listen to combat action tags, not just kills.
- Quest creation should support auto solo and manual GM edit.
- Every quest can use a light mini-story shell: acceptance, journey, complication, climax, resolution.
- Auto mode fills that shell from tagged snippets and oracle tables. Manual mode lets the GM override the next beat, reward, twist, or interpretation.

Examples:

- Win a battle after using one self-deprecating action.
- Trigger a status through trolling.
- Gather Frostcap mushrooms from a forest map node.
- Beat a monster picked from `biome:frostwood`, `rank:F`, `tone:starter`, not `boss`.

### Event Tab

Event is the story content library outside the main arc.

Event families:

- Character events.
- Special events.
- Side stories.
- Random/context events.

Behavior:

- Events use the same sequence runtime as Story.
- Events can have VN dialogue, consequences, map movement, combat, mini-games, and summaries.
- Events exist to enrich the plot, not replace the main arc.
- Event availability is controlled by tags, flags, rank, chapter, phase, relationship, persona, and cooldown.
- Oracle and event rolling should be one flow, not separate confusing panels.

### Activities Tab

Activities is the town/base/system layer.

Sections:

- Hub.
- Oracle/Event.
- Pocket Haven: farm, forge, cooking, station upgrades.
- Shops.

Behavior:

- Hub should show practical actions first: rest, talk, shop, craft, farm, travel.
- Oracle/Event should roll prompts or events from one place.
- Pocket Haven should be a base screen, not scattered across side tools.
- Shops should remain ledger-backed and predictable.

## What To Remove Or Fold Away

Remove or fold into the four tabs:

- Old hints that explain obvious UI.
- Duplicate event/oracle controls.
- Old "flow suggestions" that do not write to state.
- Side Forge panels that do not fit Hub, Quest, Event, or Activities.
- Any quest button that creates content but does not track state.
- Any battle-result UI that duplicates CampaignOps.

Keep:

- CampaignOps as the only save mutation path.
- Story Director data ideas where they can become authored event/quest/story templates.
- Manual GM override, but move it into a compact drawer.
- Combat bridge and manual battle resolution.

## Core Runtime

Add one shared sequence runner for Story and Event:

```text
js/campaign/campaign-sequence-loader.js
js/campaign/campaign-sequence-runner.js
js/campaign/campaign-sequence-ui.js
```

Responsibilities:

- Load one manifest/index file per campaign.
- Load separate small sequence files.
- Validate node ids and transitions.
- Render visual novel style dialogue/narration/choices.
- Dispatch combat, map movement, mini-game, quest update, and CampaignOps nodes.
- Return to the same sequence after combat/manual result.
- Log summaries and consequences.

The runner should be generic. Story, Event, and Quest only provide different indexes and filters.

## Data Layout

Suggested files:

```text
data/campaigns/haven/story/
  _story_index.json
  arc1/
    ch01_return/
      part01_frostwood_return.json
      part02_gate_or_tavern.json
      part03_garr_hut.json
    ch02_frostwood/
      part01_frostcap_tutorial.json

data/campaigns/haven/events/
  _event_index.json
  character/
    bin_peri_luck_check.json
    bowy_thunder_needs_a_voice.json
  special/
    frostbitten_winter_market.json
  side_stories/
    ledger_of_the_ghost.json

data/campaigns/haven/quests/
  _quest_index.json
  daily/
    frostwood_patrol.json
    mushroom_delivery.json
  normal/
    f_rank_board_templates.json
  story/
    frostcap_fever.json
```

The DataStore should load indexes into collections like:

- `campaignStoryArcs`
- `campaignSequences`
- `campaignEvents`
- `campaignQuestTemplates`

Only the index is listed in the app first. Sequence files can be lazy-loaded later, but initial implementation can load all referenced JSON files if that is simpler.

## Story Index Format

```json
{
  "id": "haven_arc1_story_index",
  "campaignId": "haven_free_campaign_test",
  "title": "Haven Arc 1",
  "startChapterId": "arc1_ch01",
  "chapters": [
    {
      "id": "arc1_ch01",
      "title": "Return And Guild Noise",
      "rankBand": ["F"],
      "tags": ["world:haven", "arc:1", "chapter:return"],
      "defaultPath": "warm_return",
      "parts": [
        {
          "id": "ch01_part01_return",
          "title": "Frostwood Return",
          "file": "arc1/ch01_return/part01_frostwood_return.json",
          "defaultChoiceId": "go_to_gate",
          "summaryKey": "Bin returns to Haven after two months away."
        }
      ]
    }
  ]
}
```

## Event Index Format

```json
{
  "id": "haven_event_index",
  "campaignId": "haven_free_campaign_test",
  "events": [
    {
      "id": "event_bin_peri_luck_check",
      "title": "Peri Tests Bin's Luck",
      "kind": "character",
      "file": "character/bin_peri_luck_check.json",
      "weight": 3,
      "cooldownPhases": 2,
      "tags": ["peri", "luck", "comedy", "solo_gm"],
      "conditions": {
        "chapterMin": 1,
        "phaseTypeAny": ["town", "scenario"],
        "requiresPersonas": ["persona_bin_haven_adventurer"]
      }
    }
  ]
}
```

## Sequence File Format

Use a compact state-machine format. Each node has an `id`, `type`, and transition keys like `next`, `pass`, `fail`, `win`, `lose`, or `choices`.

```json
{
  "id": "event_bin_peri_luck_check",
  "version": 1,
  "title": "Peri Tests Bin's Luck",
  "scope": "event",
  "startNode": "open",
  "tags": ["peri", "luck", "comedy"],
  "defaultEndNode": "end_default",
  "summary": {
    "short": "Peri challenged Bin to prove his luck under pressure.",
    "default": "Bin accepted Peri's test, survived the embarrassment, and gained a small amount of confidence."
  },
  "nodes": [
    {
      "id": "open",
      "type": "dialogue",
      "speaker": "Peri",
      "portrait": "peri",
      "text": "Let's see if you're actually lucky, or just loud.",
      "next": "bin_reply"
    },
    {
      "id": "bin_reply",
      "type": "dialogue",
      "speaker": "Bin",
      "portrait": "bin",
      "text": "Those are legally different talents.",
      "next": "luck_check"
    },
    {
      "id": "luck_check",
      "type": "stat_check",
      "actor": "bin",
      "stat": "L",
      "difficulty": 12,
      "tags": ["luck", "peri_test"],
      "pass": "luck_success",
      "fail": "luck_fail"
    },
    {
      "id": "luck_success",
      "type": "dialogue",
      "speaker": "Peri",
      "text": "Annoying. Useful, but annoying.",
      "next": "reward_confidence"
    },
    {
      "id": "reward_confidence",
      "type": "ops",
      "ops": [
        { "op": "set_flag", "flag": "peri_luck_test_passed", "value": true },
        { "op": "add_bond", "a": "bin", "b": "peri", "amount": 1, "reason": "Luck test" }
      ],
      "summary": "Bin passed Peri's luck test.",
      "next": "end_success"
    },
    {
      "id": "luck_fail",
      "type": "dialogue",
      "speaker": "Bin",
      "text": "I would like to file a complaint with probability.",
      "next": "small_fight"
    },
    {
      "id": "small_fight",
      "type": "combat",
      "encounterId": "haven_frostwood_impish_sparks",
      "battleMode": "auto_or_manual",
      "onWin": "loss_recovered",
      "onLose": "loss_penalty"
    },
    {
      "id": "loss_recovered",
      "type": "ops",
      "ops": [
        { "op": "set_flag", "flag": "peri_luck_test_survived", "value": true },
        { "op": "add_quest_progress", "questId": "daily_perform_under_pressure", "amount": 1 }
      ],
      "summary": "Bin failed the check but recovered in combat.",
      "next": "end_success"
    },
    {
      "id": "loss_penalty",
      "type": "ops",
      "ops": [
        { "op": "damage_party", "amount": 2, "reason": "Peri luck test backfire" },
        { "op": "add_clock", "clockId": "frostwood_embarrassment", "amount": 1 }
      ],
      "summary": "Bin failed the test and paid for it.",
      "next": "retry_choice"
    },
    {
      "id": "retry_choice",
      "type": "choice",
      "prompt": "Peri offers the look of someone who already wrote the joke.",
      "choices": [
        {
          "id": "retry",
          "label": "Fight again",
          "next": "small_fight"
        },
        {
          "id": "accept_penalty",
          "label": "Accept the penalty",
          "next": "end_fail"
        }
      ],
      "defaultChoiceId": "accept_penalty"
    },
    {
      "id": "end_success",
      "type": "end",
      "result": "success"
    },
    {
      "id": "end_fail",
      "type": "end",
      "result": "fail"
    },
    {
      "id": "end_default",
      "type": "end",
      "result": "defaulted"
    }
  ]
}
```

## Supported Node Types

Start with these:

- `narration`
- `dialogue`
- `choice`
- `stat_check`
- `condition`
- `ops`
- `combat`
- `map_move`
- `quest_update`
- `minigame`
- `summary`
- `include`
- `end`

Later additions can be plugged in without rewriting content files.

## Node Contracts

### Dialogue

```json
{
  "id": "n1",
  "type": "dialogue",
  "speaker": "Mitia",
  "portrait": "mitia",
  "text": "Please do not call the snow suspicious.",
  "next": "n2"
}
```

### Choice

```json
{
  "id": "route_choice",
  "type": "choice",
  "prompt": "Where does Bin go first?",
  "choices": [
    { "id": "gate", "label": "Gate", "next": "gate_scene", "ops": [{ "op": "set_flag", "flag": "route_gate", "value": true }] },
    { "id": "tavern", "label": "Frosted Mug", "next": "tavern_scene" }
  ],
  "defaultChoiceId": "gate"
}
```

### Condition

```json
{
  "id": "check_prior_help",
  "type": "condition",
  "conditions": {
    "requiresFlags": ["helped_hilda"],
    "requiresTags": ["world:haven"],
    "requiresPersonas": ["persona_bin_haven_adventurer"]
  },
  "pass": "hilda_remembers",
  "fail": "hilda_neutral"
}
```

### Combat

```json
{
  "id": "chimera_fight",
  "type": "combat",
  "encounterId": "frostfire_chimera",
  "monsterPick": {
    "rankMax": "D",
    "tagsAny": ["frostwood", "chimera", "boss"],
    "excludeTags": ["daily", "joke"]
  },
  "onWin": "chimera_dead",
  "onLose": "chimera_loss_choice",
  "manualAllowed": true
}
```

### Map Movement

```json
{
  "id": "move_to_old_shrine",
  "type": "map_move",
  "mapId": "haven_frostwood_short_run",
  "nodeId": "old_shrine",
  "randomAllowed": false,
  "next": "old_shrine_arrival"
}
```

### Mini-Game

```json
{
  "id": "mummy_maze_intro",
  "type": "minigame",
  "minigameId": "mummy_maze",
  "variant": "tutorial",
  "difficulty": 1,
  "onWin": "maze_clear",
  "onLose": "maze_penalty",
  "manualResolveAllowed": true
}
```

Mini-game ids planned:

- `mummy_maze`
- `push_box`
- `ice_slide`
- `pipe_connection`
- `weight_balance`

The first implementation can render a placeholder resolver with win/loss/manual buttons and save result tags. The real mini-games can come later.

## Quest Format

```json
{
  "id": "daily_frostwood_showoff",
  "title": "Frostwood Showoff",
  "kind": "daily",
  "repeat": {
    "reset": "phase",
    "phaseTypes": ["scenario", "town"],
    "maxPerPhase": 1
  },
  "rankBand": ["F"],
  "context": {
    "world": "haven",
    "tagsAny": ["frostwood", "guild", "starter"],
    "chapterMin": 1,
    "chapterMax": 2
  },
  "variance": {
    "openings": [
      "The guild needs someone expendable, which is rude but accurate.",
      "A notice on the board has Bin's exact budget written all over it."
    ],
    "targets": {
      "monsterPick": {
        "tagsAny": ["frostwood", "rank:F"],
        "excludeTags": ["boss", "unique"]
      }
    }
  },
  "objectives": [
    {
      "id": "win_with_trolling",
      "type": "combat_tag",
      "requiresTags": ["action:trolling"],
      "count": 1
    }
  ],
  "rewards": [
    { "op": "give_currency", "amount": 12 },
    { "op": "gain_rank_progress", "amount": 1 }
  ]
}
```

Quest objective types:

- `combat_win`
- `combat_tag`
- `status_applied`
- `item_found`
- `map_node_visit`
- `stat_check_pass`
- `dialogue_choice`
- `manual_check`

## Context Tags

Use tags to keep random content suitable.

Core tags:

- `world:haven`
- `arc:1`
- `chapter:return`
- `phase:town`
- `phase:scenario`
- `rank:F`
- `biome:frostwood`
- `tone:comedy`
- `tone:warm`
- `tone:danger`
- `persona:persona_bin_haven_adventurer`
- `combat:trolling`
- `quest:daily`
- `event:character`

Tag categories to support from the design notes:

- Content tags: `character`, `monster`, `encounter`, `location`, `item`, `quest`, `event`.
- Mood tags: `comedy`, `warm`, `tense`, `horror`, `breather`, `climactic`.
- Narrative tags: `setup`, `payoff`, `foreshadowing`, `callback`, `character_growth`, `relationship_building`.
- Location tags: `forest`, `town`, `ruins`, `temple`, `safe`, `hazardous`, `chokepoint`.
- Trigger tags: `first_visit`, `return_visit`, `after_defeat`, `low_resources`, `specific_member_present`.
- Generation tags: `random_friendly`, `fixed_content`, `needs_leader`, `scales_with_party`, `social_focused`.
- Combat behavior tags: `action:trolling`, `action:self_deprecating`, `status:taunted`, `outcome:victory`.
- Persona tags: `persona:persona_bin_haven_adventurer`, `guild_adventurer`, `scavenger`, `out_of_place`.

The picker should score content by:

1. Required conditions pass.
2. Required tags are present.
3. Rank and danger fit.
4. Recent repeats are avoided.
5. Story progression is respected.
6. Monster tags match the current map/world/quest tone.

## Chapter Progression State

Add to save:

```json
{
  "storyMode": {
    "currentArcId": "haven_arc1",
    "currentChapterId": "arc1_ch01",
    "currentPartId": "ch01_part01_return",
    "completedParts": {},
    "defaultedParts": {},
    "revealedChapters": {},
    "partResults": {},
    "manualSummaryEntries": [],
    "sequenceStack": [],
    "pendingBattleReturn": null,
    "pendingMiniGameReturn": null
  }
}
```

Rules:

- `completedParts[partId]` stores chosen path, result, summary, and applied operation ids.
- `defaultedParts[partId]` means the app auto-revealed it to allow jumping ahead.
- Defaulting applies only operations marked `defaultSafe: true`.
- Replaying reads from history and does not apply operations.
- GM override creates a new manual summary entry and optional operations.

## Manual GM Controls

Use one compact drawer in Story/Event/Quest:

- Add summary note.
- Set/unset flag.
- Give reward.
- Add penalty.
- Change relationship/bond.
- Start battle.
- Move map node.
- Mark quest progress.
- Resolve current node as win/loss/pass/fail.

Each manual action should create a log entry with:

- source: `manual_gm`
- linked sequence id if any
- reason
- operation list

## Authoring Prompt For AI

Use this prompt when asking AI to write a sequence file:

```text
Write a CJS campaign sequence JSON file.

Target:
- Campaign/world:
- Scope: story/event/quest
- Chapter/part or event id:
- Current context tags:
- Required characters:
- Tone:
- Desired gameplay pieces: dialogue, choice, stat_check, combat, map_move, minigame, reward, penalty
- Consequences allowed:
- Consequences not allowed:
- Default path:

Rules:
- Output valid JSON only.
- Use a compact state-machine with nodes.
- Every node must have a unique id.
- Every transition must point to an existing node id.
- Include `defaultChoiceId` for every choice.
- Include `summary.short` and node-level summaries when consequences happen.
- Use CampaignOps objects for all state changes.
- Do not reveal future chapter secrets unless the target context says they are known.
- Keep dialogue short, readable, and visual-novel friendly.
- Make combat and map movement optional/manual-friendly by setting `manualAllowed` or `manualResolveAllowed`.
- Keep repeated/daily content light with small text variance.
```

## Implementation Phases

### Phase 1: Stabilize Current Systems

- Finish remote-main/persona merge.
- Keep tag and quest-pulse integration.
- Make persona tags visible to conditions and story/event eligibility.
- Validate JSON and JS.

### Phase 2: Add Sequence Schema And Loader

- Add sequence index loaders.
- Add node validation.
- Add sequence runtime state to campaign save.
- Add a plain renderer for narration/dialogue/choice/end.
- Support `ops`, `condition`, and `stat_check`.

### Phase 3: Story Tab Rebuild

- Replace old Story Director-heavy UI with chapter/part navigator.
- Add VN player panel.
- Add summary view.
- Add jump-ahead defaulting.
- Add replay mode.
- Add manual GM drawer.

### Phase 4: Event Tab Rebuild

- Add event library filters.
- Use the same sequence runner.
- Merge oracle/event into one context picker.
- Add cooldown/history so events do not repeat badly.

### Phase 5: Quest Tab Rebuild

- Add daily reset by phase/beat.
- Add context-aware random quest picker.
- Add quest objective triggers from combat action tags.
- Add normal/story quest generation using rank, story, persona, and map tags.

### Phase 6: Activities Tab Rebuild

- Consolidate hub, oracle/event, Pocket Haven, farm, forge, and shops.
- Remove obsolete panels.
- Keep manual GM actions in the shared drawer.

### Phase 7: Mini-Game Foundation

- Add minigame node type and placeholder resolver.
- Store result tags and return node.
- Later build real mini-game modules one by one.

## First Thin Slice

Build one complete loop before converting everything:

1. Add sequence runner.
2. Add one event file: Peri luck test.
3. Let it run dialogue -> stat check -> combat/manual result -> ops -> summary.
4. Add one daily quest listening for `action:trolling`.
5. Show it in Quest tab and update it from combat result.
6. Add one story part with chapter picker and replay/default path.

This proves the format, combat return, quest pulse, persona tags, summaries, and manual GM override without overbuilding.
