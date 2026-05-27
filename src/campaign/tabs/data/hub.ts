// hub.ts — K.3 bridge for the Hub-family forge tabs (Battle Sets,
// Map Seeds, and — added in later K.3 commits — Side Forge, Oracle
// Forge, Quest Chains). Each tab body was previously an HTML string
// built in `js/campaign/ui/tabs/cui-hub-tab.js` carrying
// `data-campaign-action`; the React tree now reads this structured data
// and renders JSX with direct onClick dispatch.

import type { CampaignStateSnapshot } from "../../store";
import type { QuestChainActiveData, QuestChainTemplateData } from "./eventTab";

export interface SideStoryFlowGuide {
  readonly title: string;
  readonly summary: string;
  readonly phases: readonly string[];
}

export interface QuestChainResolved {
  readonly title: string;
  readonly statusLabel: string;
  readonly phaseLabel: string;
}

export interface QuestChainsData {
  readonly activeCount: number;
  readonly availableCount: number;
  readonly flowGuide: SideStoryFlowGuide | null;
  readonly active: readonly QuestChainActiveData[];
  readonly finished: readonly QuestChainResolved[];
  readonly available: readonly QuestChainTemplateData[];
}

export interface BattleSetEnemy {
  readonly qty: number;
  readonly label: string;
}

export interface BattleSetCard {
  readonly id: string;
  readonly name: string;
  readonly canonRisk: string;
  readonly canonRiskClass: string;
  readonly rank: string;
  readonly objective: string;
  readonly tags: readonly string[];
  readonly enemyMix: readonly BattleSetEnemy[];
  readonly gimmick: string;
  readonly queueLabel: string;
}

export interface BattleSetsData {
  readonly cards: readonly BattleSetCard[];
}

export interface MapSeedNode {
  readonly name: string;
  readonly detail: string;
}

export interface MapSeedCard {
  readonly id: string;
  readonly name: string;
  readonly canonRisk: string;
  readonly canonRiskClass: string;
  readonly purpose: string;
  readonly nodes: readonly MapSeedNode[];
}

export interface MapSeedsData {
  readonly seeds: readonly MapSeedCard[];
}

interface Bridge {
  readonly getQuestChainsData: () => QuestChainsData | null;
  readonly getBattleSetsData: () => BattleSetsData | null;
  readonly getMapSeedsData: () => MapSeedsData | null;
}

interface Cjs {
  readonly CampaignUI?: Bridge;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

export function getQuestChainsData(_state: CampaignStateSnapshot): QuestChainsData | null {
  return cjs().CampaignUI?.getQuestChainsData() ?? null;
}

// State is threaded so the data refreshes on every shell tick even
// though these bridges read from the forge / quest-chain modules, not
// the snapshot.
export function getBattleSetsData(_state: CampaignStateSnapshot): BattleSetsData | null {
  return cjs().CampaignUI?.getBattleSetsData() ?? null;
}

export function getMapSeedsData(_state: CampaignStateSnapshot): MapSeedsData | null {
  return cjs().CampaignUI?.getMapSeedsData() ?? null;
}
