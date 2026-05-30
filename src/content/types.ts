// AI Content Contracts — strongly-typed shapes for the JSON content the
// engine eats. These types are deliberately narrow: only the fields the
// engine validates today, plus optional fields documented as
// authoring-time hints. AI generators target these types so generated
// content lints cleanly before it touches a save.
//
// Keep this file additive. When the engine starts honouring a new field
// you must add it here AND in `data/schemas/<type>.schema.json` so the
// schema lint stays in sync with TypeScript. Removals are breaking — do
// them with a migration in `src/persistence/migrations.ts`.

// ── File envelope ───────────────────────────────────────────────────
// Every authored JSON content file uses this two-layer shape:
//   { "_file": { version, format, scope, world? }, "entries": [...] }
// `format` tags the entry shape ("cjs-skills", "cjs-monsters", ...).
// `scope` is "world" or "universal" — content-loader decides whether to
// prefix entry ids with the world id.
export interface ContentFileEnvelope<TFormat extends string = string> {
  readonly _file: {
    readonly version: number;
    readonly format: TFormat;
    readonly scope: "universal" | "world";
    readonly world?: string;
  };
}

export interface ContentFile<TEntry, TFormat extends string = string>
  extends ContentFileEnvelope<TFormat> {
  readonly entries: readonly TEntry[];
}

// ── Shared primitives ──────────────────────────────────────────────
export type Stat = "S" | "P" | "E" | "C" | "I" | "A" | "L";
export type Rank = "F" | "E" | "D" | "C" | "B" | "A" | "S" | "SS" | "SSS";
export type Team = "player" | "enemy" | "neutral" | "support" | string;
export type DamageType = "Physical" | "Magic" | "Chaos" | "True" | string;
export type Element =
  | "Physical" | "Fire" | "Ice" | "Lightning" | "Water" | "Earth"
  | "Wind" | "Light" | "Dark" | "Holy" | "Poison" | "Chaos" | string;
export type CellType =
  | "empty" | "obstacle" | "wall" | "high_ground" | "low_ground"
  | "water" | "lava" | "ice" | "spike" | "rough" | string;

export interface StatBlock {
  readonly S?: number;
  readonly P?: number;
  readonly E?: number;
  readonly C?: number;
  readonly I?: number;
  readonly A?: number;
  readonly L?: number;
}

// Used by skill perks, levelScaling, etc.
export interface LevelScaling {
  readonly powerPerLevel?: number;
  readonly maxLevel?: number;
  readonly perLevel?: number;
  readonly perks?: ReadonlyArray<{
    readonly atLevel: number;
    readonly description?: string;
    readonly bonusPower?: number;
    readonly bonusRange?: number;
    readonly bonusAoeSize?: number;
    readonly addEffect?: ContentEffect;
  }>;
}

// Engine effect shape. The canonical form is a reference into
// `data/system/master-effects.json` with optional `overrides`. The
// legacy inline form ({ type, target, chance, ... }) is still accepted
// by the engine for compatibility, so both shapes are valid here.
export interface ContentEffectRef {
  readonly effectId: string;
  readonly overrides?: Record<string, unknown>;
}
export interface ContentEffectInline {
  readonly type: string;
  readonly target?: "self" | "ally" | "enemy" | "single" | "aoe" | "team" | string;
  readonly chance?: number;
  readonly stacks?: number;
  readonly duration?: number;
  readonly amount?: number;
  readonly statusId?: string;
  readonly element?: Element;
  readonly damageType?: DamageType;
  readonly [key: string]: unknown;
}
export type ContentEffect = ContentEffectRef | ContentEffectInline;

// ── Skill ──────────────────────────────────────────────────────────
export interface SkillEntry {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly description?: string;
  readonly power: number;
  readonly ap: number;
  readonly mp: number;
  readonly spCost?: number;
  readonly cooldown?: number;
  readonly damageType?: DamageType;
  readonly element?: Element;
  readonly scalingStat?: Stat;
  readonly range?: number;
  readonly aoe?: "self" | "line" | "cone" | "burst" | "row" | "column" | null;
  readonly aoeSize?: number;
  readonly qte?: "quickpress" | "mash" | "rhythm" | "fishing" | "quiz" | null;
  readonly effects?: readonly ContentEffect[];
  readonly levelScaling?: LevelScaling;
  readonly isUltimate?: boolean;
  readonly ultimateCost?: number;
  readonly requiredWeaponTypes?: readonly string[];
  readonly tags?: readonly string[];
}

// ── Passive ────────────────────────────────────────────────────────
export interface PassiveEntry {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly effects?: readonly ContentEffect[];
  readonly ranks?: ReadonlyArray<{
    readonly rank: number;
    readonly cost?: number;
    readonly effects: readonly ContentEffect[];
  }>;
}

// ── Status (debuff/buff registry) ──────────────────────────────────
export interface StatusEntry {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly desc?: string;
  readonly category?: "buff" | "debuff" | "neutral" | "environment" | string;
  readonly maxStacks?: number;
  readonly defaultDuration?: number;
  readonly tickEffect?: ContentEffect;
  readonly onApplyEffects?: readonly ContentEffect[];
  readonly onRemoveEffects?: readonly ContentEffect[];
  readonly tags?: readonly string[];
}

// ── Character / Monster (combat units) ─────────────────────────────
export interface UnitLootEntry {
  readonly type: "item" | "material" | "food" | "gold" | "currency" | string;
  readonly id?: string;
  readonly currencyId?: string;
  readonly min?: number;
  readonly max?: number;
  readonly chance?: number;
}

export interface CharacterEntry {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly portrait?: string;
  readonly team: Team;
  readonly rank: Rank;
  readonly type?: "ally" | "enemy" | "npc" | string;
  readonly stats: StatBlock;
  readonly skills?: readonly (string | { skillId: string; level?: number; overrides?: Record<string, unknown> })[];
  readonly ultimateSkillId?: string;
  readonly ultimateMax?: number;
  readonly equipment?: readonly string[];
  readonly innatePassives?: readonly string[];
  readonly behaviorAI?: string;
  readonly weak?: readonly Element[];
  readonly resist?: readonly Element[];
  readonly immune?: readonly Element[];
  readonly loot?: readonly UnitLootEntry[];
  readonly tags?: readonly string[];
}

export type MonsterEntry = CharacterEntry;

// ── Encounter (grid map + unit placements) ─────────────────────────
export interface EncounterUnitPlacement {
  readonly id: string;
  readonly pos: readonly [number, number];
  readonly size?: "1x1" | "1x2" | "2x1" | "2x2" | string;
  readonly team?: Team;
}

export interface EncounterEntry {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly grid: ReadonlyArray<readonly CellType[]>;
  readonly units: readonly EncounterUnitPlacement[];
  readonly objectives?: ReadonlyArray<{
    readonly id: string;
    readonly type: string;
    readonly summary?: string;
    readonly [key: string]: unknown;
  }>;
  readonly environment?: { readonly weatherId?: string; readonly bgmId?: string };
  readonly tags?: readonly string[];
}

// ── Item / Material / Food (inventory entries) ─────────────────────
export interface ItemEntry {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly description?: string;
  readonly rarity?: "common" | "uncommon" | "rare" | "epic" | "legendary" | string;
  readonly tags?: readonly string[];
  readonly buyValue?: number;
  readonly sellValue?: number;
  readonly stackable?: boolean;
  readonly unique?: boolean;
  readonly slot?: "weapon" | "armor" | "accessory" | "consumable" | string;
  readonly weaponType?: string;
  readonly armorType?: string;
  readonly effects?: readonly ContentEffect[];
  readonly stats?: StatBlock;
}

// ── Job ────────────────────────────────────────────────────────────
export interface JobEntry {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly branch?: string;
  readonly tier?: number;
  readonly description?: string;
  readonly weaponTypes?: readonly string[];
  readonly armorTypes?: readonly string[];
  readonly maxLevel?: number;
  readonly levels?: ReadonlyArray<{
    readonly level: number;
    readonly grantSkills?: readonly string[];
    readonly grantPassives?: readonly string[];
    readonly statBonuses?: StatBlock;
  }>;
}

// ── Persona (character variants per world/run) ─────────────────────
export interface PersonaEntry {
  readonly id: string;
  readonly name: string;
  readonly characterId: string;
  readonly world?: string;
  readonly icon?: string;
  readonly portrait?: string;
  readonly rank?: Rank;
  readonly description?: string;
  readonly statOverrides?: StatBlock;
  readonly defaultJob?: string;
  readonly availableJobs?: readonly string[];
  readonly availableBranches?: readonly string[];
  readonly innatePassives?: readonly string[];
  readonly skills?: readonly string[];
  readonly equipment?: readonly string[];
}

// ── World metadata ─────────────────────────────────────────────────
export interface WorldMeta {
  readonly id: string;
  readonly displayName: string;
  readonly ceiling: Rank;
  readonly requiredRank?: Rank | null;
  readonly recommendedRank?: Rank | null;
  readonly order?: number;
  readonly tone?: string;
  readonly color?: string;
  readonly status?: "stub" | "alpha" | "beta" | "live" | string;
  readonly storyModeTheme?: {
    readonly id?: string;
    readonly className?: string;
    readonly backdrop?: string;
    readonly bannerImage?: string;
    readonly accent?: string;
    readonly danger?: string;
    readonly motif?: string;
  };
}

// ── Compact AI index entries (token-saving) ────────────────────────
// These are the shapes consumed by the compact AI index files in
// `data/ai-index/`. They include just enough information for an AI to
// generate a content patch referring to an existing id — id, name,
// short tags, and one-sentence summary. Anything more comes from the
// full content file.
export interface SkillCompact {
  readonly id: string;
  readonly name: string;
  readonly element?: Element;
  readonly damageType?: DamageType;
  readonly power: number;
  readonly ap: number;
  readonly mp: number;
  readonly range?: number;
  readonly aoe?: string | null;
  readonly tags?: readonly string[];
  readonly summary?: string;
}

export interface MonsterCompact {
  readonly id: string;
  readonly name: string;
  readonly world?: string;
  readonly rank: Rank;
  readonly hp?: number;
  readonly weak?: readonly Element[];
  readonly resist?: readonly Element[];
  readonly skills?: readonly string[];
  readonly tags?: readonly string[];
  readonly summary?: string;
}

export interface WorldCompact {
  readonly id: string;
  readonly displayName: string;
  readonly ceiling: Rank;
  readonly tone?: string;
  readonly monsterCount?: number;
  readonly characterCount?: number;
  readonly encounterCount?: number;
  readonly status?: string;
  readonly summary?: string;
}

export interface PassiveCompact {
  readonly id: string;
  readonly name: string;
  readonly tags?: readonly string[];
  readonly summary?: string;
}

export interface StatusCompact {
  readonly id: string;
  readonly name: string;
  readonly category?: string;
  readonly summary?: string;
}

export interface ItemCompact {
  readonly id: string;
  readonly name: string;
  readonly slot?: string;
  readonly rarity?: string;
  readonly tags?: readonly string[];
  readonly summary?: string;
}

// ════════════════════════════════════════════════════════════════════
// Campaign-side content contracts
// ════════════════════════════════════════════════════════════════════
// These mirror the campaign collection schemas in `data/schemas/` (one per
// `_file.category`). They live under `data/campaigns/<world>/<type>/` and
// all use `format: "cjs-collection"` + a `category` tag. The CampaignOps
// verb set is open (the engine's CampaignOps registry is the authority), so
// `CampaignOp` keeps `op` typed and the payload free-form.

export type CanonRisk = "green" | "yellow" | "red";

export interface CampaignOp {
  readonly op: string;
  readonly [key: string]: unknown;
}

// ── Campaign quests (category: campaignQuests) ─────────────────────
export interface QuestMiniGame {
  readonly gameId: string;
  readonly difficulty?: number;
  readonly theme?: string;
  readonly contextText?: string;
  readonly bonusText?: string;
  readonly conversation?: ReadonlyArray<{ readonly speaker?: string; readonly text?: string }>;
}

export interface QuestProgressTrigger {
  readonly id: string;
  readonly outcome?: string;
  readonly amount?: number;
  readonly requiresAnyTags?: readonly string[];
  readonly addTags?: readonly string[];
  readonly log?: string;
}

export interface QuestObjective {
  readonly id: string;
  readonly label: string;
  readonly kind?: string;
  readonly current?: number;
  readonly required?: number;
  readonly minigame?: QuestMiniGame;
  readonly progressTriggers?: readonly QuestProgressTrigger[];
}

export interface QuestObjectiveOverride {
  readonly id: string;
  readonly kind?: string;
  readonly label?: string;
  readonly required?: number;
  readonly minigame?: QuestMiniGame;
}

export interface QuestVariant {
  readonly id: string;
  readonly label?: string;
  readonly summary?: string;
  readonly dialogue?: string;
  readonly tags?: readonly string[];
  readonly contextTags?: readonly string[];
  readonly monsterTags?: readonly string[];
  readonly objectiveOverrides?: readonly QuestObjectiveOverride[];
}

export interface QuestRepeat {
  readonly reset?: string;
  readonly refreshActive?: boolean;
  readonly timerPhases?: number;
  readonly variants?: readonly QuestVariant[];
}

export interface QuestTemplate {
  readonly id: string;
  readonly title: string;
  readonly kind?: string;
  readonly status?: string;
  readonly giver?: string;
  readonly summary?: string;
  readonly objectives?: readonly QuestObjective[];
  readonly rewards?: readonly CampaignOp[];
  readonly failureConsequence?: readonly CampaignOp[];
  readonly timer?: { readonly phasesRemaining?: number };
  readonly mapType?: string;
  readonly mapSetting?: string;
  readonly mapForm?: "node_map" | "grid_map";
  readonly linkedScenario?: string;
  readonly linkedMapNodes?: readonly string[];
  readonly linkedMapCells?: readonly string[];
  readonly battleSetIds?: readonly string[];
  readonly contextTags?: readonly string[];
  readonly monsterTags?: readonly string[];
  readonly tags?: readonly string[];
  readonly notes?: string;
  readonly repeat?: QuestRepeat;
}

export interface QuestTemplateSet {
  readonly id: string;
  readonly name: string;
  readonly world?: string;
  readonly zone?: string;
  readonly hubId?: string;
  readonly notes?: string;
  readonly tags?: readonly string[];
  readonly templates: readonly QuestTemplate[];
}

// ── Campaign events (category: campaignEvents) ─────────────────────
export interface EventCheck {
  readonly stat?: string;
  readonly dc?: number;
  readonly fail?: readonly CampaignOp[];
}

export interface EventEntry {
  readonly id: string;
  readonly title: string;
  readonly weight?: number;
  readonly type?: string;
  readonly tags?: readonly string[];
  readonly settings?: readonly string[];
  readonly locationKinds?: readonly string[];
  readonly prompt?: string;
  readonly gmHook?: string;
  readonly gmIdea?: string;
  readonly requiresParty?: readonly string[];
  readonly oracleTableId?: string;
  readonly check?: EventCheck;
  readonly suggested?: readonly CampaignOp[];
}

export interface EventTable {
  readonly id: string;
  readonly name: string;
  readonly world?: string;
  readonly zone?: string;
  readonly hubId?: string;
  readonly tags?: readonly string[];
  readonly settings?: readonly string[];
  readonly entries: readonly EventEntry[];
}

// ── Oracle tables (category: oracleTables) ─────────────────────────
export interface OraclePrompt {
  readonly id: string;
  readonly text: string;
  readonly suggestedUse?: string;
  readonly canonRisk?: CanonRisk;
  readonly tags?: readonly string[];
}

export interface OracleTable {
  readonly id: string;
  readonly name: string;
  readonly world?: string;
  readonly zone?: string;
  readonly hubId?: string;
  readonly notes?: string;
  readonly defaultCanonRisk?: CanonRisk;
  readonly tables?: Readonly<Record<string, readonly string[]>>;
  readonly prompts?: readonly OraclePrompt[];
}

// ── Travel maps (category: travelMaps) ─────────────────────────────
export interface TravelInteraction {
  readonly id: string;
  readonly label?: string;
  readonly summary?: string;
  readonly ops?: readonly CampaignOp[];
}

export interface TravelNode {
  readonly id: string;
  readonly name: string;
  readonly type?: string;
  readonly x?: number;
  readonly y?: number;
  readonly zone?: string;
  readonly description?: string;
  readonly visual?: Record<string, unknown>;
  readonly people?: readonly TravelInteraction[];
  readonly actions?: readonly TravelInteraction[];
}

export interface TravelLink {
  readonly from: string;
  readonly to: string;
  readonly route?: string;
  readonly time?: number;
  readonly risk?: string;
}

export interface TravelAreaButton {
  readonly id: string;
  readonly label?: string;
  readonly mapId?: string;
  readonly active?: boolean;
  readonly status?: string;
  readonly summary?: string;
}

export interface TravelVisualLayer {
  readonly type: string;
  readonly kind?: string;
  readonly x?: number;
  readonly y?: number;
  readonly cx?: number;
  readonly cy?: number;
  readonly rx?: number;
  readonly ry?: number;
  readonly width?: number;
  readonly height?: number;
  readonly d?: string;
  readonly text?: string;
}

export interface TravelMap {
  readonly id: string;
  readonly name: string;
  readonly world?: string;
  readonly zone?: string;
  readonly defaultLocationId?: string;
  readonly visualMode?: string;
  readonly visualBackdrop?: string;
  readonly visualBackdropPrompt?: string;
  readonly visualBackdropFit?: string;
  readonly canvas?: { readonly width?: number; readonly height?: number };
  readonly visualTheme?: { readonly id?: string; readonly mood?: string };
  readonly areaButtons?: readonly TravelAreaButton[];
  readonly legend?: ReadonlyArray<{ readonly id: string; readonly kind?: string; readonly label?: string }>;
  readonly visualLayers?: readonly TravelVisualLayer[];
  readonly nodes: readonly TravelNode[];
  readonly links?: readonly TravelLink[];
}

// ── World activity packs (category: worldActivityPacks) ────────────
export type ResourceCost = Readonly<Record<string, number>>;

export interface ActivityConditions {
  readonly requiresMilestones?: readonly string[];
  readonly any?: ReadonlyArray<{ readonly requiresMilestones?: readonly string[] }>;
}

export interface JournalEntry {
  readonly id: string;
  readonly title?: string;
  readonly text?: string;
  readonly world?: string;
  readonly scope?: string;
  readonly tags?: readonly string[];
  readonly conditions?: ActivityConditions;
}

export interface WorldActivity {
  readonly id: string;
  readonly title: string;
  readonly type?: string;
  readonly summary?: string;
  readonly buttonLabel?: string;
  readonly rewardText?: string;
  readonly locationIds?: readonly string[];
  readonly conditions?: ActivityConditions;
  readonly cost?: {
    readonly materials?: ResourceCost;
    readonly currencies?: ResourceCost;
    readonly imports?: ResourceCost;
  };
  readonly ops?: readonly CampaignOp[];
}

export interface WorldActivityPack {
  readonly id: string;
  readonly name: string;
  readonly version?: number;
  readonly world?: string;
  readonly zone?: string;
  readonly hubId?: string;
  readonly activities: readonly WorldActivity[];
  readonly journalEntries?: readonly JournalEntry[];
}

// ── Story director packs (category: storyDirectorPacks) ────────────
export interface SuggestedChoice {
  readonly label?: string;
  readonly ops?: readonly CampaignOp[];
}

// Shared shape for sceneBeats / periInterruptions / memoryShards / pressureTicks.
export interface StoryBeat {
  readonly id: string;
  readonly title?: string;
  readonly stageIds?: readonly string[];
  readonly phaseTypes?: readonly string[];
  readonly canonRisk?: CanonRisk;
  readonly weight?: number;
  readonly tags?: readonly string[];
  readonly prompt?: string;
  readonly gmNote?: string;
  readonly reviewReason?: string;
  readonly suggestedChoices?: readonly SuggestedChoice[];
}

export interface StoryStage {
  readonly id: string;
  readonly name?: string;
  readonly chapterMin?: number;
  readonly chapterMax?: number;
  readonly summary?: string;
  readonly tags?: readonly string[];
}

export interface StoryMetric {
  readonly id: string;
  readonly label?: string;
  readonly min?: number;
  readonly max?: number;
}

export interface ProtectedTruth {
  readonly id: string;
  readonly title?: string;
  readonly rule?: string;
}

export interface SideQuestRef {
  readonly id: string;
  readonly title?: string;
  readonly reason?: string;
}

export interface SideQuestFlow {
  readonly stageId?: string;
  readonly summary?: string;
  readonly keep?: readonly SideQuestRef[];
  readonly promote?: readonly SideQuestRef[];
  readonly retire?: readonly SideQuestRef[];
  readonly ops?: readonly CampaignOp[];
}

export interface StoryDirectorPack {
  readonly id: string;
  readonly name: string;
  readonly version?: number;
  readonly world?: string;
  readonly zone?: string;
  readonly hubId?: string;
  readonly summary?: string;
  readonly pressureRule?: string;
  readonly defaultCanonRisk?: CanonRisk;
  readonly tonePillars?: readonly string[];
  readonly plotPolicy?: {
    readonly editable?: boolean;
    readonly notes?: string;
    readonly doNotOverfocus?: readonly string[];
    readonly preferredFeel?: readonly string[];
  };
  readonly metrics?: readonly StoryMetric[];
  readonly protectedTruths?: readonly ProtectedTruth[];
  readonly stages: readonly StoryStage[];
  readonly sceneBeats: readonly StoryBeat[];
  readonly periInterruptions?: readonly StoryBeat[];
  readonly memoryShards?: readonly StoryBeat[];
  readonly pressureTicks?: readonly StoryBeat[];
  readonly sideQuestFlow?: readonly SideQuestFlow[];
}

// ── Patch shape for AI generators ──────────────────────────────────
// AI generators produce a `ContentPatch` rather than rewriting whole
// files. The content-lint tool merges a patch against the current files,
// runs schema validation, and reports diagnostics so generators get a
// fast feedback loop without ever mutating shipped data.
export interface ContentPatch {
  readonly target: { readonly world?: string; readonly file: string };
  readonly format: string;
  readonly upserts?: ReadonlyArray<Record<string, unknown>>;
  readonly removes?: readonly string[];
  readonly notes?: string;
}
