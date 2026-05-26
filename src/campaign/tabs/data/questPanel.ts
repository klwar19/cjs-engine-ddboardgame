// questPanel.ts — Phase F bridge for the Quests (Tracker) panel tab.

import type { CampaignStateSnapshot } from "../../store";
import type { QuestRowData } from "./questRow";

interface QuestPanelNormal {
  readonly isZombie: false;
  readonly activeCount: number;
  readonly finishedCount: number;
  readonly templateCount: number;
  readonly activeQuestRows: readonly QuestRowData[];
  readonly finishedQuestRows: readonly QuestRowData[];
  readonly soloNoticeHtml: string;
}

interface QuestPanelZombie {
  readonly isZombie: true;
  readonly zombieHtml: string;
}

export type QuestPanelData = QuestPanelNormal | QuestPanelZombie;

interface Bridge {
  readonly getQuestPanelData: (state?: CampaignStateSnapshot) => QuestPanelData | null;
}

interface Cjs {
  readonly CampaignUI?: Bridge;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

export function getQuestPanelData(state: CampaignStateSnapshot): QuestPanelData | null {
  return cjs().CampaignUI?.getQuestPanelData(state) ?? null;
}
