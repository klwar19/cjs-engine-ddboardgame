// zombie.ts — Phase G.17 typed shapes for the zombie-world scavenge
// variants of Quest Home and the Quests tracker panel.

import type { QuestRowData } from "./questRow";

export interface WorldActivityPreview {
  readonly id: string;
  readonly kicker: string;
  readonly title: string;
  readonly summary: string;
  readonly rewardText: string;
}

export interface ZombiePressure {
  readonly id: string;
  readonly title: string;
  readonly value: number;
}

export interface ZombieScavengeHomeData {
  readonly scavengeCount: number;
  readonly buildCount: number;
  readonly pressureCount: number;
  readonly hasRun: boolean;
  readonly heroBackdropUrl: string | null;
  readonly scavenge: readonly WorldActivityPreview[];
  readonly build: readonly WorldActivityPreview[];
  readonly pressures: readonly ZombiePressure[];
}

export interface ZombieScavengeTrackerData {
  readonly activeCount: number;
  readonly finishedCount: number;
  readonly activities: readonly WorldActivityPreview[];
  readonly activeQuestRows: readonly QuestRowData[];
  readonly finishedQuestRows: readonly QuestRowData[];
}
