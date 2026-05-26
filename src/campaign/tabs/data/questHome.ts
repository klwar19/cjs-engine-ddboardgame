// questHome.ts — Phase F bridge for the Quest Home tab.
//
// Returns either the zombie-world variant (one HTML chunk) or the
// normal variant's structured data + a few HTML fragments for the
// shared sub-panels (active sequence, solo notice, scenario summary,
// pending battle, combat result, last report) and per-card HTML for
// the active quest list. Those migrate to JSX as their owning panels
// move out of campaign-ui.js.

import type { CampaignStateSnapshot } from "../../store";
import type { QuestRowData } from "./questRow";

export interface QuestPaperLite {
  readonly id: string;
  readonly title: string;
  readonly kindLabel: string;
}

interface QuestHomeNormal {
  readonly isZombie: false;
  readonly activeCount: number;
  readonly finishedCount: number;
  readonly templateCount: number;
  readonly hasRun: boolean;
  readonly hasNextQuest: boolean;
  readonly nextQuestTitle: string;
  readonly nextQuestSummary: string;
  readonly paperCount: number;
  readonly dailyPapers: readonly QuestPaperLite[];
  readonly normalPapers: readonly QuestPaperLite[];
  readonly storyPapers: readonly QuestPaperLite[];
  readonly activeQuestRows: readonly QuestRowData[];
  readonly activeSequenceHtml: string;
  readonly soloNoticeHtml: string;
  readonly scenarioSummaryHtml: string;
  readonly pendingBattleHtml: string;
  readonly combatResultHtml: string;
  readonly lastReportHtml: string;
}

interface QuestHomeZombie {
  readonly isZombie: true;
  readonly zombieHtml: string;
}

export type QuestHomeData = QuestHomeNormal | QuestHomeZombie;

interface Bridge {
  readonly getQuestHomeData: (state?: CampaignStateSnapshot) => QuestHomeData | null;
}

interface Cjs {
  readonly CampaignUI?: Bridge;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

export function getQuestHomeData(state: CampaignStateSnapshot): QuestHomeData | null {
  return cjs().CampaignUI?.getQuestHomeData(state) ?? null;
}
