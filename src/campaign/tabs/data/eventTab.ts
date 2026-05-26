// eventTab.ts — Phase F bridge for the Event {Character,Special,Side}
// tabs. Shared shape; `kind` selects which variant.

import type { CampaignStateSnapshot } from "../../store";
import type { SequenceDelivery, SequenceAction } from "./sequence";

export type { SequenceDelivery, SequenceAction } from "./sequence";

export type EventTabKind = "character" | "special" | "side";

export interface EventFileEntry {
  readonly id: string;
  readonly title: string;
  readonly kindLabel: string;
  readonly summary: string;
  readonly tagLabels: readonly string[];
  readonly delivery: SequenceDelivery | null;
  readonly action: SequenceAction;
}

// G.14 — typed quest-chain shapes.
export interface QuestChainStep {
  readonly id: string;
  readonly label: string;
  readonly text: string;
  readonly meta: readonly string[];
  readonly systems: readonly string[];
  readonly detailLines: readonly string[];
  readonly pulseHints: readonly string[];
}

export interface QuestChainStakes {
  readonly runLine: string;
  readonly rewardLine: string;
  readonly failureLine: string;
}

export type QuestChainVnStepState = "current" | "done" | "upcoming";

export interface QuestChainVnStepChip {
  readonly index: number;
  readonly label: string;
  readonly state: QuestChainVnStepState;
}

export interface QuestChainVnPanel {
  readonly badgeLabel: string;
  readonly title: string;
  readonly text: string;
  readonly systems: readonly string[];
  readonly plot: string;
  readonly characters: string;
  readonly steps: readonly QuestChainVnStepChip[];
}

export interface QuestChainActiveData {
  readonly templateId: string;
  readonly title: string;
  readonly status: string;
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly stepLabel: string;
  readonly currentStepDetail: QuestChainStep | null;
  readonly contextTags: readonly string[];
  readonly vnPanel: QuestChainVnPanel;
  readonly stakes: QuestChainStakes;
}

export interface QuestChainTemplateData {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly canonRisk: string;
  readonly canonRiskClass: string;
  readonly tags: readonly string[];
  readonly vnPanel: QuestChainVnPanel;
  readonly stakes: QuestChainStakes;
  readonly steps: readonly QuestChainStep[];
}

export interface EventTabQuestChains {
  readonly activeCount: number;
  readonly availableCount: number;
  readonly active: readonly QuestChainActiveData[];
  readonly available: readonly QuestChainTemplateData[];
}

export interface EventTabData {
  readonly kind: EventTabKind;
  readonly kicker: string;
  readonly title: string;
  readonly text: string;
  readonly empty: string;
  readonly meta: readonly string[];
  readonly entryCount: number;
  readonly entries: readonly EventFileEntry[];
  readonly questChains: EventTabQuestChains | null;
}

interface Bridge {
  readonly getEventTabData: (
    kind: EventTabKind,
    state?: CampaignStateSnapshot
  ) => EventTabData | null;
}

interface Cjs {
  readonly CampaignUI?: Bridge;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

export function getEventTabData(
  kind: EventTabKind,
  state: CampaignStateSnapshot
): EventTabData | null {
  return cjs().CampaignUI?.getEventTabData(kind, state) ?? null;
}
