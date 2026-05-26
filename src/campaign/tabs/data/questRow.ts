// questRow.ts — Phase G typed shape for the shared QuestRow JSX
// component used by QuestHome and QuestsPanel.

export interface QuestObjective {
  readonly id: string;
  readonly label: string;
  readonly current: number;
  readonly required: number;
  readonly pct: number;
  readonly done: boolean;
  readonly pulseHints: readonly string[];
}

export interface QuestVariant {
  readonly label: string;
  readonly text: string;
  readonly repeat: string;
}

export interface QuestRowData {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly statusLabel: string;
  readonly statusClass: string;
  readonly metaLine: string;
  readonly resolved: boolean;
  readonly isRunQuest: boolean;
  readonly scenarioDisabled: boolean;
  readonly scenarioLabel: string;
  readonly scenarioHint: string;
  readonly scenarioPillHtml: string;
  readonly hasMiniGame: boolean;
  readonly tagChips: readonly string[];
  readonly variant: QuestVariant | null;
  readonly phaseLabel: string;
  readonly doneCount: number;
  readonly totalCount: number;
  readonly objectives: readonly QuestObjective[];
}
