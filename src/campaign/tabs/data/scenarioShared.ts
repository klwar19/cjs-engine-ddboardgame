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
