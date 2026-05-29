// scenarioShared.ts — Shared typed shapes for scenario / run pills
// and per-card run actions (Phase G.15).
//
// Phase H.4 — adds the typed `runQuestPill` builder (shared by
// `getScenarioSummaryData` and `getRunData`) that was previously the
// closure-private `_runQuestPill` in campaign-ui.js.

export type QuestPillVariant =
  | "quest"
  | "arc"
  | "running"
  | "linked"
  | "generated"
  | "noBinding"
  | "noMap";

export interface QuestPillData {
  readonly variant: QuestPillVariant;
  readonly label: string;
  readonly title: string;
  readonly linkable: boolean;
  readonly muted: boolean;
}

export interface ShapePill {
  readonly label: string;
}

export interface ShapePillsData {
  readonly pills: readonly ShapePill[];
}

export type ScenarioRunStartState = "start" | "continue" | "other_active";

export interface ScenarioRunActionsData {
  readonly scenarioId: string;
  readonly startState: ScenarioRunStartState;
}

// ── scenarioRunActionsData ──────────────────────────────────────────
// Per-scenario "Start / Continue" button state in the scenarios card
// grid. Other-active means a different scenario already has an active
// run, so this one can't start until the active one ends.

interface ScenarioCardLike {
  readonly id?: string;
}

interface RunBindingState {
  readonly activeScenarioRun?: { readonly scenarioId?: string };
}

export function scenarioRunActionsData(
  scenario: ScenarioCardLike,
  state: RunBindingState
): ScenarioRunActionsData {
  const activeRun = state.activeScenarioRun;
  const isCurrent = activeRun?.scenarioId === scenario.id;
  let startState: ScenarioRunStartState = "start";
  if (activeRun) startState = isCurrent ? "continue" : "other_active";
  return {
    scenarioId: String(scenario.id || ""),
    startState
  };
}

// ── scenarioQuestPillData ───────────────────────────────────────────
// Quest pill for a SCENARIO card (in the scenarios tab + the maps tab's
// active-scenario header). Differs from `runQuestPill` (which is for an
// active run): a scenario card may carry a `source.questId` / `questChainId`
// without there being an active run.

export interface ScenarioCardSource {
  readonly source?: { readonly questId?: string; readonly questChainId?: string; readonly title?: string };
}

interface QuestStateForPillCard {
  readonly quests?: Record<string, { readonly title?: string }>;
}

export function scenarioQuestPillData(
  scenario: ScenarioCardSource,
  state: QuestStateForPillCard | null | undefined
): QuestPillData | null {
  const src = scenario.source || {};
  const questId = src.questId;
  if (questId) {
    const quest = state?.quests?.[questId];
    const title = quest?.title || src.title || questId;
    return {
      variant: "quest",
      label: `📌 Quest: ${title}`,
      title: "Generated for this quest",
      linkable: false,
      muted: false
    };
  }
  if (src.questChainId) {
    return {
      variant: "arc",
      label: `📌 Arc: ${src.title || src.questChainId}`,
      title: "Generated for this quest arc",
      linkable: false,
      muted: false
    };
  }
  return null;
}

// ── runQuestPill ────────────────────────────────────────────────────
// Typed quest-pill data for the active scenario run. Shared by both
// `getScenarioSummaryData` (header row of the active run summary) and
// `getRunData` (linear/freeform/grid run displays).

interface ActiveRunForPill {
  readonly questId?: string;
  readonly scenarioId?: string;
  readonly questTitle?: string;
}

interface ScenarioForPill {
  readonly source?: { readonly questId?: string; readonly questChainId?: string; readonly title?: string };
}

interface QuestStateForPill {
  readonly quests?: Record<string, { readonly title?: string }>;
}

export function runQuestPill(
  state: QuestStateForPill | null | undefined,
  run: ActiveRunForPill | null | undefined,
  scenario: ScenarioForPill | null | undefined
): QuestPillData {
  const questId = run?.questId || scenario?.source?.questId || null;
  if (questId) {
    const quest = state?.quests?.[questId];
    const title = quest?.title || run?.questTitle || questId;
    return {
      variant: "quest",
      label: `📌 Quest: ${title}`,
      title: "This run is linked to a quest",
      linkable: true,
      muted: false
    };
  }
  if (scenario?.source?.questChainId) {
    return {
      variant: "arc",
      label: `📌 Arc: ${scenario.source.title || scenario.source.questChainId}`,
      title: "This run is part of a quest arc",
      linkable: false,
      muted: false
    };
  }
  return {
    variant: "noBinding",
    label: "no quest binding",
    title: "Standalone run, not bound to a quest",
    linkable: false,
    muted: true
  };
}

// ── shapePillsData ──────────────────────────────────────────────────
// Movement / Setting / Size pill labels. The closure-private SHAPE_*
// label tables live here as the single source of truth — consumed by
// `getRunData`, `getScenariosData`, the scenario inspect modal, and
// the per-card scenario chip row.

const SHAPE_MODE_LABELS: Readonly<Record<string, string>> = {
  node_map: "Movement: Node Map",
  grid_map: "Movement: Grid Map",
  procedural: "Movement: Procedural",
  linear: "Movement: Linear",
  freeform: "Movement: Freeform"
};

const SHAPE_SETTING_LABELS: Readonly<Record<string, string>> = {
  outdoor: "Setting: Outdoor",
  dungeon: "Setting: Dungeon",
  urban: "Setting: Urban",
  forest: "Setting: Forest",
  cave: "Setting: Cave",
  sewer: "Setting: Sewer",
  ruins: "Setting: Ruins",
  temple: "Setting: Temple",
  house: "Setting: House",
  tavern: "Setting: Tavern",
  castle: "Setting: Castle",
  mountain: "Setting: Mountain",
  arena: "Setting: Arena",
  abstract: "Setting: Abstract"
};

const SHAPE_SIZE_LABELS: Readonly<Record<string, string>> = {
  tiny: "XS",
  small: "S",
  medium: "M",
  large: "L"
};

export interface ScenarioForShape {
  readonly travelMode?: string;
  readonly mapForm?: string;
  readonly mapId?: string;
  readonly mapSetting?: string;
  readonly setting?: string;
  readonly size?: string;
}

export function shapePillsData(scenario: ScenarioForShape = {}): ShapePillsData {
  const mode = scenario.travelMode || scenario.mapForm || (scenario.mapId ? "node_map" : "freeform");
  const pills: ShapePill[] = [];
  pills.push({ label: SHAPE_MODE_LABELS[mode] || `Movement: ${mode}` });
  const setting = scenario.mapSetting || scenario.setting;
  if (setting) pills.push({ label: SHAPE_SETTING_LABELS[setting] || `Setting: ${setting}` });
  if (scenario.size) pills.push({ label: `Size: ${SHAPE_SIZE_LABELS[scenario.size] || scenario.size}` });
  return { pills };
}

// ── beatIcon ────────────────────────────────────────────────────────
// Linear-mode beat icon character (legacy emoji set). Used by
// `getRunData` for the linear scenario beat list.
const BEAT_ICONS: Readonly<Record<string, string>> = {
  battle: "⚔",
  event: "🎴",
  trap: "🪤",
  rest: "🏕",
  reward: "🎁",
  boss: "👹",
  exit: "🚪"
};

export function beatIcon(kind: string | undefined | null): string {
  return BEAT_ICONS[String(kind || "")] || "·";
}

// ── scenarioObjectiveMeta ───────────────────────────────────────────
// Builds the "meta" line (location + exploration percent) for the
// active-run objective. Reads ScenarioRunner.explorationPercent +
// CampaignState.getActiveMap directly — both are loaded unconditionally
// by main.tsx so the optional-chain is just defensive.

export interface ObjectiveLike {
  readonly visible?: boolean;
  readonly revealHint?: string;
  readonly levelId?: string;
  readonly nodeId?: string;
  readonly cell?: { readonly x?: number; readonly y?: number };
  readonly completedAt?: string;
}

export interface ScenarioRunLike {
  readonly travelMode?: string;
}

interface ScenarioRunnerSurface {
  readonly explorationPercent?: (state: unknown, map: unknown) => number;
}

interface CampaignStateForMeta {
  readonly getState?: () => unknown;
  readonly getActiveMap?: () => unknown;
}

interface ScenarioMetaCjs {
  readonly ScenarioRunner?: ScenarioRunnerSurface;
  readonly CampaignState?: CampaignStateForMeta;
}

function cjs(): ScenarioMetaCjs {
  return (window as unknown as { CJS?: ScenarioMetaCjs }).CJS ?? {};
}

export function scenarioObjectiveMeta(
  run: ScenarioRunLike = {},
  objective: ObjectiveLike = {}
): string {
  const bits: string[] = [];
  if (objective.visible === false && objective.revealHint) bits.push(objective.revealHint);
  if (run.travelMode === "grid_map" && objective.levelId) bits.push(objective.levelId.replace(/_/g, " "));
  if (objective.nodeId) bits.push(objective.nodeId);
  if (objective.cell) bits.push(`${objective.cell.x},${objective.cell.y}`);
  if (objective.completedAt) bits.push("resolved");
  else if (objective.visible === false) bits.push("hidden");
  else {
    const c = cjs();
    const pct = c.ScenarioRunner?.explorationPercent?.(c.CampaignState?.getState?.(), c.CampaignState?.getActiveMap?.()) || 0;
    bits.push(`${pct}% explored`);
  }
  return bits.join(" | ");
}
