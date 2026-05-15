# CJS Persona, Tag, Story Quality Integration Plan

This document collects the practical changes needed to implement the best ideas from the persona, tag, quest, Story Director, legacy, and UI brainstorms.

The goal is not to add decorative systems. Every new feature should do at least one of these:

- affect campaign state
- affect combat setup or results
- unlock or block story content
- improve solo GM guidance
- make authoring and later debugging easier

## Core Design Rule

Keep the engine boring and reliable. Put flavor in data.

The existing app already has Campaign Mode, CampaignOps, quest chains, Story Director packs, combat bridge, roster/loadouts, saves, GM override, and editor JSON panels. The new work should extend those systems instead of replacing them with parallel managers.

## Non-Goals

- Do not build the mask feature.
- Do not add a Peri chaos automation that constantly comments on player behavior.
- Do not replace current quest chains with a separate full QuestManager.
- Do not make the Story Director autoplay the novel.
- Do not create many tiny disconnected tools that require manual syncing.

Peri should remain an authored Story Director source: occasional useful hints, jokes, rare emotional slips, and optional red/yellow/green canon review.

## Current Systems To Reuse

Primary integration points:

- `js/core/data-store.js`: data collections, validation, import/export.
- `js/core/content-manager.js`: manifest loading, multi-file editing, visibility filters.
- `data/_manifest.json`: content registry.
- `js/campaign/campaign-state.js`: campaign save shape, party state, normalization.
- `js/campaign/campaign-ops.js`: all campaign save writes.
- `js/campaign/campaign-ui.js`: roster, story, quest, travel, GM override UI.
- `js/campaign/campaign-combat-bridge.js`: campaign party to combat unit snapshots.
- `js/campaign/campaign-story-director.js`: solo GM story card rolling and review.
- `js/campaign/campaign-quest-chains.js`: side story chain state and quest conversion.
- `js/builders/campaign-editor.js`: JSON authoring for campaign content.
- `js/ui/data-browser.js`: read-only inspection.

## Feature 1: Persona Layer

Personas are world-specific versions of a universal character. Bin remains one identity, but his Haven, Zombie, Cyberpunk, or Wuxia versions can have different jobs, equipment, skill pools, avatars, story tags, and relationship tone.

### Why This Is Needed

Bin needs different jobs and styles in different worlds:

- Haven: F-rank adventurer, swordsman or rogue build.
- Zombie Apocalypse: scavenger, survivor, or survivor leader.
- Future worlds: netrunner, cultivator, starship oddball, etc.

The persona layer should connect directly to current job, skill, equipment, campaign, combat, and editor flows.

### Persona Data Collection

Add a new `personas` DataStore collection and manifest category.

Suggested files:

- `data/universal/personas.json`
- `data/worlds/haven/personas.json`
- `data/worlds/zombie/personas.json`

Suggested schema:

```json
{
  "id": "bin_haven_f_rank",
  "characterId": "bin",
  "homeWorld": "haven",
  "name": "Bin Chen, F-rank Adventurer",
  "role": "Swordsman / rogue",
  "portrait": "images/characters/bin.png",
  "icon": "",
  "description": "The Haven version of Bin, still half-frozen and learning how to be useful again.",

  "defaultJob": "job_warrior",
  "availableJobs": ["job_warrior", "job_thief"],
  "availableBranches": ["warrior", "thief"],

  "starterSkills": ["haven_ember_slash", "taunt_mock", "jester_gambit"],
  "starterPassives": ["jester_luck", "comedy_armor"],
  "starterEquipment": ["haven_rusty_sword", "haven_leather_armor", "haven_lucky_coin"],
  "allowedWeaponTypes": ["sword", "dagger"],
  "allowedArmorTypes": ["light", "leather", "medium"],
  "statOverrides": { "A": 1, "L": 1 },

  "unlock": {
    "stageId": "haven_stage_return",
    "flags": [],
    "tags": []
  },

  "offWorld": {
    "allowed": true,
    "penaltyStatus": "status_persona_displaced",
    "relationshipTone": "familiar_but_wrong",
    "statPenalty": { "P": -1, "C": -1 },
    "notes": "Haven instincts do not fully fit other worlds."
  },

  "storyTags": ["persona:bin_haven_f_rank", "world:haven", "role:f_rank", "build:sword_rogue"]
}
```

### Persona Save Shape

Add to campaign save:

```js
personas: {
  activeByWorld: {
    haven: "bin_haven_f_rank",
    zombie: "bin_zombie_scavenger"
  },
  unlocked: {
    bin_haven_f_rank: true
  },
  progress: {
    bin_haven_f_rank: {
      characterId: "bin",
      level: 1,
      currentJob: "job_warrior",
      unlockedJobs: ["job_warrior", "job_thief"],
      jobProgress: {},
      skillProgress: {},
      passiveProgress: {},
      learnedSkills: [],
      learnedPassives: [],
      equippedSkills: [],
      equippedPassives: [],
      equipment: [],
      equipmentSlots: {},
      statOverrides: {}
    }
  }
}
```

Party members should also get:

```js
activePersonaId: "bin_haven_f_rank"
```

### Important Anti-Bug Rule

Do not repeatedly add persona stat bonuses into `member.statOverrides`.

The safest implementation is:

1. Keep party member fields as the active runtime mirror so existing roster and combat code keeps working.
2. When switching away from a persona, save current job, skill, equipment, and persona-local stat progress into `state.personas.progress[personaId]`.
3. When switching into a persona, load that persona progress into the party member fields.
4. Compute static persona bonuses at snapshot time or load them in a controlled reset, never by stacking them each switch.

This prevents stat drift.

### Persona Ops

Add CampaignOps:

```js
unlock_persona
lock_persona
set_active_persona
sync_active_persona
set_world_persona
```

Example:

```json
{
  "op": "unlock_persona",
  "personaId": "bin_zombie_scavenger",
  "characterId": "bin",
  "reason": "Zombie world intro complete"
}
```

Example:

```json
{
  "op": "set_active_persona",
  "target": "bin",
  "personaId": "bin_haven_f_rank",
  "world": "haven"
}
```

### Persona Resolver Module

Add:

- `js/campaign/campaign-personas.js`

Responsibilities:

- get personas for a character
- check unlock conditions
- check world fit
- get wrong-world penalty
- initialize persona progress
- switch active persona safely
- sync active member progress back to persona save
- expose explanation text for UI

Key functions:

```js
getPersonasForCharacter(characterId, worldId)
isPersonaUnlocked(personaId, state)
getActivePersonaForMember(memberId, state)
switchPersona(state, memberId, personaId, options)
syncMemberToActivePersona(state, memberId)
buildPersonaSnapshot(memberId, member, state)
explainPersonaFit(personaId, worldId, state)
```

### Combat Integration

Patch `campaign-combat-bridge.js`.

When building a unit snapshot:

1. Load base character.
2. Resolve active persona.
3. Merge base stats plus persona static overrides plus persona progress/manual overrides.
4. Use active persona job, equipment, skill pool, and passives.
5. If persona home world does not match current world, apply visible wrong-world penalty.
6. Add metadata:

```js
activePersonaId
personaHomeWorld
personaFit
personaPenalty
storyTags
```

Combat UI should show a small note when a persona has a penalty:

```text
Persona Displaced: Haven F-rank instincts are strained in Zombie.
```

### Campaign UI Integration

Roster:

- Show persona chip near job chip.
- Add `Persona` action beside `Job`.
- Show world fit: Home, Adapted, Displaced, Locked.
- Show wrong-world penalty before confirming.

World Travel:

- If only one valid persona exists, auto-pick it and show a small note.
- If multiple personas are available, show a persona picker.
- If using a wrong-world persona, show the penalty and relationship tone warning.

GM Override:

- Add unlock persona.
- Add set active persona.
- Add tag ops from Feature 2.

Story UI:

- Story Director cards can unlock or recommend personas.
- Persona requirements should show under "Why Available" and "Why Blocked".

### Editor Integration

Minimum:

- Add `personas` to DataStore, ContentManager, manifest, Data Browser, and Campaign Editor JSON tabs.

Later:

- Add `js/builders/persona-editor.js` for friendly editing.
- The first pass can be JSON-only to avoid UI bloat.

## Feature 2: Tag Ledger

Tags should become structured campaign memory, not loose labels.

Tags can attach to:

- whole save
- quests
- quest chains
- story beats
- events
- NPCs
- locations
- personas
- battles
- items

### Flags Versus Tags

Use this rule:

- Flags are hard state or canon truth.
- Tags are searchable context, hooks, soft state, and authoring memory.

Examples:

```text
flag:pocket_haven_unlocked = true hard state
tag:hook:pocket_haven_garden = there is an open story hook
```

This prevents tags from becoming hidden bugs.

### Tag Namespaces

Use simple namespaced tags:

```text
world:haven
npc:garr
persona:bin_haven_f_rank
thread:garr_secret
hook:chimera_clue
theme:trust
tone:comedy
risk:yellow
state:active
state:resolved
needs:combat
reward:job_unlock
boss_prep:lightning
```

### Tag Save Shape

Add:

```js
tagLedger: {
  entries: {
    tag_123: {
      id: "tag_123",
      tag: "thread:garr_secret",
      scope: "story",
      targetType: "storyBeat",
      targetId: "haven_sd_scene_dinner_galaxy_eyes",
      status: "active",
      strength: 2,
      source: "story_director",
      addedAtPhase: 3,
      addedAt: "ISO_DATE",
      expires: null,
      resolution: null,
      note: "Garr recognized Peri but dodged the answer."
    }
  }
}
```

Store entries as objects by ID. Build indexes in code instead of storing fragile duplicated indexes.

### Tag Ops

Add CampaignOps:

```js
tag_add
tag_resolve
tag_archive
tag_remove
tag_strength_change
tag_expire
```

Examples:

```json
{
  "op": "tag_add",
  "tag": "thread:garr_secret",
  "scope": "story",
  "targetType": "npc",
  "targetId": "haven_garr",
  "status": "active",
  "strength": 2,
  "note": "Garr knows more about Peri than he admits."
}
```

```json
{
  "op": "tag_resolve",
  "tag": "thread:garr_secret",
  "resolution": "partial_reveal",
  "note": "Garr admitted he recognizes Peri's title but did not explain the meeting."
}
```

### Tag Module

Add:

- `js/campaign/campaign-tags.js`

Responsibilities:

- add/resolve/archive tags
- query active/resolved tags
- check tags by scope or target
- explain tag matches
- expire tags on phase pass
- list open loops

Key functions:

```js
getActiveTags(state, filter)
hasTag(state, tag, filter)
addTag(state, op)
resolveTag(state, op)
openLoops(state)
expirePhaseTags(state)
explainTagCheck(state, conditions)
```

## Feature 3: Shared Condition Engine

The app needs one condition checker instead of each feature inventing its own format.

Add:

- `js/campaign/campaign-conditions.js`

Used by:

- Story Director
- Quest chains
- persona unlocks
- events
- world travel warnings
- editor validation

Suggested condition schema:

```js
conditions: {
  requiresTags: ["thread:garr_secret"],
  blocksTags: ["resolved:garr_secret"],
  preferredTags: ["npc:garr", "theme:trust"],
  requiresFlags: ["memory_crystal_found"],
  blocksFlags: ["garr_secret_fully_revealed"],
  requiresPersona: ["bin_haven_f_rank"],
  homeWorldOnly: false,
  world: ["haven"],
  phaseTypes: ["town_phase"],
  chapterMin: 3,
  chapterMax: 5,
  bondMin: [
    { "npcId": "haven_garr", "field": "trust", "min": 10 }
  ],
  legacyTraitMin: [
    { "trait": "compassionate", "min": 2 }
  ]
}
```

Return:

```js
{
  ok: true,
  score: 8,
  reasons: ["tag thread:garr_secret active", "Garr trust 12/10"],
  blockers: []
}
```

Or:

```js
{
  ok: false,
  score: 0,
  reasons: [],
  blockers: ["missing tag hook:old_temple", "Garr trust 7/10"]
}
```

### UI Features From Conditions

Add "Why Available" and "Why Blocked" everywhere it matters:

- Story Director beat cards.
- Quest chains.
- persona unlocks.
- world travel persona picker.
- event cards.

This makes automation understandable instead of mysterious.

## Feature 4: Story Director Quality Layer

Keep Story Director as a solo GM assistant.

It should:

- suggest beats
- explain why
- show blocked beats
- track open loops
- track clues and payoffs
- honor canon risk review
- let the user reject suggestions without penalty
- let the user manually apply consequences

It should not:

- force reveals
- force a fixed chapter route
- apply red-risk content without review
- spam Peri interruptions

### Add To Story Director Cards

Support:

```js
conditions
addsTags
resolvesTags
payoffForTags
setupTags
contentDensity
personaEffects
legacyEffects
```

Example:

```json
{
  "id": "haven_sd_scene_garr_partial_reveal",
  "title": "Garr Gives Half An Answer",
  "canonRisk": "yellow",
  "conditions": {
    "requiresTags": ["thread:garr_secret", "hook:old_temple"],
    "blocksTags": ["resolved:garr_secret_full"],
    "bondMin": [{ "npcId": "haven_garr", "field": "trust", "min": 10 }]
  },
  "payoffForTags": ["thread:garr_secret"],
  "suggestedChoices": [
    {
      "label": "Let Garr explain only what he can",
      "ops": [
        { "op": "tag_resolve", "tag": "thread:garr_secret", "resolution": "partial_reveal" },
        { "op": "tag_add", "tag": "thread:garr_secret_followup", "scope": "story" },
        { "op": "story_fact_reveal", "factId": "garr_knows_peri_title" }
      ]
    }
  ]
}
```

### Story Dashboard Additions

Add compact panels:

- Open Loops: unresolved story tags.
- Payoff Ready: tags with enough setup.
- Blocked Reveals: red/yellow content waiting for conditions.
- Pacing Hint: comedy, breather, threat, boss prep.
- Content Density: warns if too many active side threads.

## Feature 5: Quest Chain Upgrade

Do not replace `campaign-quest-chains.js`. Extend it.

Add to quest chains:

```js
conditions
startTags
resolveTags
branchChoices
outcomes
urgency
recommendedStageIds
blocksWhenTags
promoteWhenTags
```

Example:

```json
{
  "id": "haven_qchain_thunder_needs_a_voice",
  "conditions": {
    "requiresTags": ["stage:frostwood_open"],
    "blocksTags": ["state:old_temple_active"]
  },
  "startTags": ["npc:bowy", "thread:bowy_confidence", "needs:combat"],
  "resolveTags": ["thread:bowy_confidence"],
  "branchChoices": [
    {
      "id": "let_bowy_lead",
      "label": "Let Bowy take point",
      "ops": [
        { "op": "bond_change", "npcId": "haven_bowy", "field": "confidence", "amount": 2 },
        { "op": "tag_add", "tag": "boss_prep:lightning", "scope": "combat" }
      ]
    }
  ]
}
```

### Quest UI Additions

For every quest chain row:

- show active tags
- show blocked reason
- show reward and consequence preview
- show "promote", "pause", "resolve", "archive"
- show combat relevance tags like `needs:combat` or `boss_prep:lightning`

### Auto Behavior

Safe automatic behavior:

- update open loop list
- mark payoff ready
- suggest next quest
- expire temporary tags
- warn about too many active quests

Manual approval required:

- red-risk story truth
- major relationship rupture
- world transition
- persona unlock with major story meaning
- permanent legacy trait shifts

## Feature 6: Small Legacy System

Keep cross-world legacy small at first.

Add:

```js
legacy: {
  traits: {
    compassionate: 0,
    ruthless: 0,
    tactical: 0,
    heroic: 0
  },
  majorChoices: [],
  unlockedEchoes: []
}
```

Ops:

```js
legacy_trait_change
legacy_choice_record
legacy_echo_unlock
```

Example:

```json
{
  "op": "legacy_choice_record",
  "choiceId": "zombie_saved_civilians",
  "world": "zombie",
  "summary": "Protected civilians at a real cost.",
  "traitImpact": { "compassionate": 1, "heroic": 1, "ruthless": -1 },
  "tags": ["legacy:compassionate", "world:zombie"]
}
```

Use legacy to:

- alter Story Director eligibility
- unlock persona variants
- add dialogue variants
- affect new-world starting reputation
- unlock echo moments later

Do not build a giant echo soul framework until major choices already exist.

## Feature 7: Simple Bond Upgrade

Current `bond_change` can stay. Expand stored bond values carefully.

Suggested shape:

```js
bonds: {
  haven_garr: {
    trust: 10,
    affection: 8,
    respect: 6,
    tension: 2,
    tags: ["npc:garr", "thread:garr_secret"]
  }
}
```

Use bonds for:

- dialogue tone
- Story Director requirements
- side quest unlocks
- wrong-world persona reactions
- relationship warnings

Avoid dozens of emotional fields until the content needs them.

## Feature 8: Memory Shards And Callbacks

Keep memory callbacks manual and tagged.

Add tags to memory shards:

```js
memoryShards: {
  haven_mem_crossbow_smoke: {
    title: "Crossbow Smoke And Pine",
    text: "Bin remembers training near a fire with Bowy nearby.",
    tags: ["npc:bowy", "theme:training", "thread:missing_months"],
    canonRisk: "yellow"
  }
}
```

Story UI can then show:

```text
Relevant memories available: Bowy, training, missing months
```

The user chooses whether to use them. This keeps writing quality high.

## Feature 9: UI Clarity Rules

The UI should always answer:

- What is active?
- What is optional?
- What is blocked?
- Why is it blocked?
- What will change if I apply this?
- Is this canon-risky?
- Does this affect combat?

### Recommended UI Additions

Story tab:

- Open Loops
- Payoff Ready
- Blocked Reveals
- Suggested Beat
- Pacing Hint

Quest tab:

- Active side story count
- promoted, kept, paused, resolved labels
- tag chips
- impact preview

Roster:

- persona chip
- job chip
- skill/equipment loadout
- world fit meter

World Travel:

- persona picker only when needed
- wrong-world penalty preview
- relationship tone warning

GM Override:

- persona ops
- tag ops
- legacy ops
- condition tester

Editor:

- JSON authoring first
- Data Browser read-only display
- later persona editor and tag autocomplete

## Feature 10: Impact Preview

Before applying important ops, show a short preview:

```text
Will change:
- Tags: add thread:garr_secret_followup, resolve thread:garr_secret
- Bonds: Garr trust +1
- Facts: reveal garr_knows_peri_title
- Canon risk: yellow
- Combat: no direct changes
```

This is especially useful for Story Director cards, quest outcomes, persona switches, and GM override.

## Feature 11: Authoring Health Checks

Add a lightweight checker that can run from editor or tests.

It should find:

- missing persona referenced by ops
- missing tags in required conditions
- impossible conditions
- quest chain with no resolution path
- red-risk card with no review reason
- story payoff with no setup tags
- persona with missing job, skill, item, or passive refs
- wrong-world penalty status missing
- too many active side quest starts from one stage

This is a big quality improvement for future writing.

## Implementation Roadmap

Implement in large useful chunks, not many tiny disconnected tasks.

### Phase 1: Data And State Foundation

Files:

- `js/core/data-store.js`
- `js/core/content-manager.js`
- `data/_manifest.json`
- `js/campaign/campaign-state.js`
- `js/campaign/campaign-ops.js`
- `js/campaign/campaign-personas.js`
- `js/campaign/campaign-tags.js`
- `js/campaign/campaign-conditions.js`
- `data/worlds/haven/personas.json`
- `data/worlds/zombie/personas.json`

Work:

- Add `personas` collection.
- Add save fields: `personas`, `tagLedger`, `legacy`.
- Add persona ops.
- Add tag ops.
- Add shared condition evaluator.
- Add one Haven Bin persona and one locked Zombie Bin persona.

### Phase 2: Combat And Roster Integration

Files:

- `js/campaign/campaign-combat-bridge.js`
- `js/campaign/campaign-ui.js`
- `css/campaign.css`

Work:

- Apply active persona to campaign combat snapshots.
- Show persona chip in roster.
- Add persona switch modal.
- Show wrong-world penalty.
- Add impact preview for persona switching.
- Make `set_job`, `gain_job_xp`, skill, passive, and equipment changes sync back into active persona progress.

### Phase 3: Story Director And Quest Chain Conditions

Files:

- `js/campaign/campaign-story-director.js`
- `js/campaign/campaign-quest-chains.js`
- `js/campaign/campaign-ui.js`
- `data/campaigns/haven/story_director/haven_story_director_v1.json`
- `data/campaigns/haven/quest_chains/frostbitten_quest_chains.json`

Work:

- Let Story Director use `CampaignConditions`.
- Add "Why Available" and "Why Blocked".
- Add tags to key Haven beats and quest chains.
- Add payoff-ready logic.
- Add open loop dashboard.
- Add quest density warning.

### Phase 4: Editor And Browser Support

Files:

- `js/builders/campaign-editor.js`
- `js/ui/data-browser.js`
- `editor.html`
- optional later: `js/builders/persona-editor.js`

Work:

- Add `personas` tab to Campaign Editor or entity editor.
- Add personas to Data Browser.
- Add basic tag browsing in Campaign Data or Story Director UI.
- Add condition tester in GM tools or editor.

### Phase 5: Content Quality Pass

Files:

- Haven persona content.
- Zombie persona content.
- Haven Story Director pack.
- Frostbitten quest chains.
- Future tag rules file if needed.

Work:

- Define tag naming conventions.
- Add starter tags to major story beats.
- Add persona unlock hooks.
- Add boss prep tags such as `boss_prep:lightning`.
- Add legacy choice examples.
- Ensure red-risk content stays reviewed.

## Suggested File Changes By System

### DataStore

Add:

```js
personas: {}
```

Update:

- collection order
- count reporting
- import/export
- validation
- ID prefix map, if prefixes are used

Suggested prefix:

```text
per
```

### ContentManager

Add `personas` to:

- `TYPE_TO_CATEGORY`
- `TYPE_ORDER`
- migration/export paths if needed
- validation for referenced character, jobs, skills, passives, items, statuses

### CampaignState

Add default save fields:

```js
personas: { activeByWorld: {}, unlocked: {}, progress: {} }
tagLedger: { entries: {} }
legacy: { traits: {}, majorChoices: [], unlockedEchoes: [] }
```

Normalize old saves by backfilling these fields.

### CampaignOps

Add describe and apply support for:

```text
unlock_persona
lock_persona
set_active_persona
set_world_persona
sync_active_persona
tag_add
tag_resolve
tag_archive
tag_remove
tag_strength_change
legacy_trait_change
legacy_choice_record
legacy_echo_unlock
```

Also call persona sync after ops that mutate active persona-owned fields:

- set_job
- unlock_job
- gain_job_xp
- set_job_level
- learn_skill
- unlearn_skill
- equip_skill
- unequip_skill
- learn_passive
- unlearn_passive
- equip_passive
- unequip_passive
- equip_item
- unequip_item
- change_stat, if persona-local

### Combat Bridge

Update `_campaignUnitSnapshot` to use the active persona resolver.

It should still return a normal combat character object so combat internals do not need to understand the whole persona system.

### Campaign UI

Add:

- persona chip
- persona switch modal
- world fit meter
- tag drawer
- open loop panel
- payoff ready panel
- why available/blocked explanations
- impact preview

Keep the UI compact. Use existing roster, Story Director, quest, and GM override areas.

### Campaign Editor

Minimum:

- JSON support for personas.
- Data Browser support for personas.

Later:

- friendly persona editor.
- tag autocomplete.
- condition tester.

## Auto Behavior Policy

Safe auto:

- suggest tags from content
- show why content is available or blocked
- show payoff readiness
- expire temporary tags on phase pass
- warn about content density
- recommend persona for world travel
- recommend side quest promote, keep, pause, or retire

Needs manual confirmation:

- applying ops
- changing active persona
- world transition
- red-risk content
- permanent legacy trait changes
- full story reveal
- major relationship rupture

This keeps the app helpful without stealing GM/player control.

## Example Flow

1. Player completes a Frostwood quest.
2. Quest ops add:

```json
[
  { "op": "tag_add", "tag": "hook:chimera_clue", "scope": "story" },
  { "op": "tag_add", "tag": "boss_prep:lightning", "scope": "combat" },
  { "op": "bond_change", "npcId": "haven_bowy", "field": "confidence", "amount": 1 }
]
```

3. Story Director sees `hook:chimera_clue`.
4. It suggests an Old Temple clue beat.
5. UI shows:

```text
Available because:
- hook:chimera_clue active
- chapter 3
- Frostwood Threat 4/12
```

6. Player applies the beat.
7. The beat resolves one open tag and adds another:

```json
[
  { "op": "tag_resolve", "tag": "hook:chimera_clue", "resolution": "temple_confirmed" },
  { "op": "tag_add", "tag": "thread:old_temple_memory", "scope": "story" }
]
```

8. Combat bridge later sees `boss_prep:lightning` and UI can recommend lightning battle prep.

## Example Persona Flow

1. Campaign starts in Haven.
2. Bin has `bin_haven_f_rank` active.
3. Roster shows:

```text
Persona: Haven F-rank
Job: Warrior Lv 1
Fit: Home
```

4. Player travels to Zombie.
5. Zombie persona is locked, so UI offers:

```text
Use Haven F-rank in Zombie?
Penalty: Persona Displaced, -1 PER, -1 CHA, survivor dialogue starts wary.
```

6. Later, a Zombie intro quest unlocks:

```json
{ "op": "unlock_persona", "personaId": "bin_zombie_scavenger", "characterId": "bin" }
```

7. Switching persona saves Haven job/skill/equipment progress, then loads Zombie progress.
8. Combat receives a normal unit snapshot with Zombie persona skills and gear.

## Testing Plan

Run after implementation:

```powershell
py -3 - <<'PY'
import json, pathlib
for path in pathlib.Path('data').rglob('*.json'):
    json.loads(path.read_text(encoding='utf-8'))
print('JSON OK')
PY
```

```powershell
node --check js/campaign/campaign-personas.js
node --check js/campaign/campaign-tags.js
node --check js/campaign/campaign-conditions.js
node --check js/campaign/campaign-state.js
node --check js/campaign/campaign-ops.js
node --check js/campaign/campaign-combat-bridge.js
node --check js/campaign/campaign-ui.js
node test_engine.js
```

Browser smoke tests:

- Open `campaign.html`.
- Create or load Haven campaign.
- Confirm Bin shows persona chip.
- Switch persona or view locked persona.
- Start a combat from campaign and confirm persona data appears in combat snapshot.
- Return combat result and confirm progression syncs back.
- Open Story Director and verify "Why Available" works.
- Open Quest Chains and verify tag chips and impact preview.
- Open `editor.html` and confirm persona data can be viewed/edited.

## Success Criteria

The implementation is successful when:

- Bin can have separate Haven and Zombie persona progress.
- Persona switching does not duplicate stats or lose equipment/skill state.
- Combat uses the active persona automatically.
- Story Director can suggest, block, and explain content using tags, flags, bonds, legacy, and persona.
- Quest chains can add and resolve tags.
- Open loops and payoff-ready items are visible.
- Editor can author persona and tagged story content.
- Red-risk content still requires review.
- The UI remains understandable without requiring the user to manage dozens of small hidden tasks.

