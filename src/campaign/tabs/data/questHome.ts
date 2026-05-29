// questHome.ts — Phase F bridge for the Quest Home tab.
//
// Phase H.4 — `getQuestHomeData` ported inline. The zombie variant
// produces structured `ZombieScavengeHomeData`; the normal variant
// returns the active/finished quest counts + capped active rows + the
// authored "quest paper" (sequence) shelves grouped by `questPaperKind`.

import { label } from "../../util/cui-utils";
import { isQuestResolved, type QuestLike } from "../../util/state-helpers";
import { getQuestRowData, type QuestRowData, type QuestRowInput } from "./questRow";
import { getZombieScavengeHomeData, type ZombieScavengeHomeData } from "./zombie";
import type { CampaignStateSnapshot } from "../../store";

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
}

interface QuestHomeZombie {
  readonly isZombie: true;
  readonly zombie: ZombieScavengeHomeData;
}

export type QuestHomeData = QuestHomeNormal | QuestHomeZombie;

// ── Module surfaces ─────────────────────────────────────────────────
interface CampaignContent {
  readonly campaignQuests?: Record<string, { templates?: readonly unknown[] }>;
}

interface CampaignStateSurface {
  readonly getContent?: () => CampaignContent | null | undefined;
}

interface SequenceEntry {
  readonly id?: string;
  readonly title?: string;
  readonly kind?: string;
  readonly tags?: readonly string[];
}

interface CampaignSequencesSurface {
  readonly list?: (scope: string) => readonly SequenceEntry[];
}

interface QuestHomeCjs {
  readonly CampaignState?: CampaignStateSurface;
  readonly CampaignSequences?: CampaignSequencesSurface;
}

function cjs(): QuestHomeCjs {
  return (window as unknown as { CJS?: QuestHomeCjs }).CJS ?? {};
}

interface QuestHomeStateShape {
  readonly currentWorld?: string;
  readonly quests?: Record<string, QuestRowInput & QuestLike & { readonly chainTemplateId?: string; readonly title?: string; readonly summary?: string; readonly id?: string }>;
  readonly activeScenarioRun?: unknown;
  readonly crossWorld?: unknown;
}

// `_questPaperKind` — classifies a sequence entry's authored kind into
// daily / story / normal so the Quest Home shelves group correctly.
function questPaperKind(entry: SequenceEntry = {}): "daily" | "story" | "normal" {
  const kind = String(entry.kind || "").toLowerCase();
  const tags = (entry.tags || []).map((tag) => String(tag).toLowerCase());
  if (kind.includes("daily") || tags.includes("daily")) return "daily";
  if (
    kind.includes("story") ||
    kind.includes("chapter") ||
    kind.includes("one_time") ||
    tags.includes("story_quest") ||
    tags.includes("chapter_repeat")
  ) {
    return "story";
  }
  return "normal";
}

function paperLite(entries: readonly SequenceEntry[], limit: number): readonly QuestPaperLite[] {
  return entries.slice(0, limit).map((entry) => ({
    id: String(entry.id || ""),
    title: entry.title || entry.id || "",
    kindLabel: label(entry.kind || "quest paper")
  }));
}

export function getQuestHomeData(state: CampaignStateSnapshot): QuestHomeData | null {
  if (!state) return null;
  const typed = state as QuestHomeStateShape;
  if (typed.currentWorld === "zombie") {
    return {
      isZombie: true,
      zombie: getZombieScavengeHomeData(typed as Parameters<typeof getZombieScavengeHomeData>[0])
    };
  }
  const c = cjs();
  const quests = Object.values(typed.quests || {});
  const active = quests.filter((q) => !q.chainTemplateId && !isQuestResolved(q));
  const finished = quests.filter((q) => !q.chainTemplateId && isQuestResolved(q));
  const nextQuest = active[0] || null;
  const questEntries = c.CampaignSequences?.list?.("quest") || [];
  const dailyPapers = questEntries.filter((entry) => questPaperKind(entry) === "daily");
  const storyPapers = questEntries.filter((entry) => questPaperKind(entry) === "story");
  const normalPapers = questEntries.filter((entry) => questPaperKind(entry) === "normal");
  const campaignQuests = c.CampaignState?.getContent?.()?.campaignQuests || {};
  const templateCount = Object.values(campaignQuests).reduce(
    (sum, record) => sum + (record.templates?.length || 0),
    0
  );
  const run = typed.activeScenarioRun;
  return {
    isZombie: false,
    activeCount: active.length,
    finishedCount: finished.length,
    templateCount,
    hasRun: !!run,
    hasNextQuest: !!nextQuest,
    nextQuestTitle: nextQuest ? nextQuest.title || nextQuest.id || "" : "",
    nextQuestSummary: nextQuest ? nextQuest.summary || "" : "",
    paperCount: questEntries.length,
    dailyPapers: paperLite(dailyPapers, 2),
    normalPapers: paperLite(normalPapers, 2).slice(0, 1),
    storyPapers: paperLite(storyPapers, 2),
    activeQuestRows: active.slice(0, 4).map((quest) => getQuestRowData(quest))
  };
}
