// scenarioShared.ts — Shared typed shapes for scenario / run pills
// and per-card run actions (Phase G.15).

export type QuestPillVariant =
  | "quest"
  | "arc"
  | "running"
  | "linked"
  | "noBinding";

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
