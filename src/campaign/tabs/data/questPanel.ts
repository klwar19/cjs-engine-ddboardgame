// questPanel.ts — Phase F bridge for the Quests (Tracker) panel tab.
//
// Phase H.4 — `getQuestPanelData` ported inline. Reads CampaignState
// + the typed quest-row builder. The zombie variant produces its tracker
// data via `getZombieScavengeTrackerData`.

import { isQuestResolved, type QuestLike } from "../../util/state-helpers";
import { getQuestRowData, type QuestRowData, type QuestRowInput } from "./questRow";
import { getZombieScavengeTrackerData, type ZombieScavengeTrackerData } from "./zombie";
import type { CampaignStateSnapshot } from "../../store";

interface QuestPanelNormal {
  readonly isZombie: false;
  readonly activeCount: number;
  readonly finishedCount: number;
  readonly templateCount: number;
  readonly activeQuestRows: readonly QuestRowData[];
  readonly finishedQuestRows: readonly QuestRowData[];
}

interface QuestPanelZombie {
  readonly isZombie: true;
  readonly zombie: ZombieScavengeTrackerData;
}

export type QuestPanelData = QuestPanelNormal | QuestPanelZombie;

// ── Module surfaces ─────────────────────────────────────────────────
interface CampaignContent {
  readonly campaignQuests?: Record<string, { templates?: readonly unknown[] }>;
}

interface CampaignStateSurface {
  readonly getContent?: () => CampaignContent | null | undefined;
}

interface QuestPanelCjs {
  readonly CampaignState?: CampaignStateSurface;
}

function cjs(): QuestPanelCjs {
  return (window as unknown as { CJS?: QuestPanelCjs }).CJS ?? {};
}

interface QuestPanelStateShape {
  readonly currentWorld?: string;
  readonly quests?: Record<string, QuestRowInput & QuestLike & { readonly chainTemplateId?: string }>;
  readonly activeScenarioRun?: unknown;
  readonly crossWorld?: unknown;
}

export function getQuestPanelData(state: CampaignStateSnapshot): QuestPanelData | null {
  if (!state) return null;
  const typed = state as QuestPanelStateShape;
  if (typed.currentWorld === "zombie") {
    return {
      isZombie: true,
      zombie: getZombieScavengeTrackerData(typed as Parameters<typeof getZombieScavengeTrackerData>[0])
    };
  }
  const quests = Object.values(typed.quests || {});
  const active = quests.filter((q) => !q.chainTemplateId && !isQuestResolved(q));
  const finished = quests.filter((q) => !q.chainTemplateId && isQuestResolved(q));
  const campaignQuests = cjs().CampaignState?.getContent?.()?.campaignQuests || {};
  const templateCount = Object.values(campaignQuests).reduce(
    (sum, record) => sum + (record.templates?.length || 0),
    0
  );
  return {
    isZombie: false,
    activeCount: active.length,
    finishedCount: finished.length,
    templateCount,
    activeQuestRows: active.map((quest) => getQuestRowData(quest)),
    finishedQuestRows: finished.map((quest) => getQuestRowData(quest, { resolved: true }))
  };
}
