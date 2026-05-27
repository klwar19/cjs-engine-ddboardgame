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

// ── Shared side-content card + rumor row ───────────────────────────
export interface SideCardChoiceButton {
  readonly index: number;
  readonly label: string;
}

export interface SideCardData {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly tone: string;
  readonly toneLabel: string;
  readonly canonRisk: string;
  readonly canonRiskClass: string;
  readonly compact: boolean;
  readonly purposeHtml: string;
  readonly prompt: string;
  readonly text: string;
  readonly summary: string;
  readonly flavorTrailHtml: string;
  readonly gmKeywords: readonly string[];
  readonly gmNote: string;
  readonly choiceStackHtml: string;
  readonly choiceButtons: readonly SideCardChoiceButton[];
  readonly showDismiss: boolean;
}

export interface RumorRowData {
  readonly id: string;
  readonly hubId: string;
  readonly text: string;
  readonly statusLabel: string;
  readonly riskLabel: string;
  readonly canonRisk: string;
  readonly canonRiskClass: string;
  readonly compact: boolean;
}

// ── Side Forge tab ─────────────────────────────────────────────────
export interface SideForgeProblem {
  readonly id: string;
  readonly label: string;
}

export interface SideForgeReviewItem {
  readonly id: string;
  readonly contentId: string;
  readonly reason: string;
  readonly canonRisk: string;
  readonly canonRiskClass: string;
}

export interface SideForgeHistoryLine {
  readonly title: string;
  readonly result: string;
  readonly phaseLabel: string;
}

export interface SideForgeStats {
  readonly security: number;
  readonly prosperity: number;
  readonly warmth: number;
  readonly weirdness: number;
}

export interface SideForgeData {
  readonly hubName: string;
  readonly hubDescription: string;
  readonly hubId: string;
  readonly moodLabel: string;
  readonly stats: SideForgeStats;
  readonly problemPurposeHtml: string;
  readonly problems: readonly SideForgeProblem[];
  readonly lastCard: SideCardData | null;
  readonly rumors: readonly RumorRowData[];
  readonly savedIdeas: readonly SideCardData[];
  readonly review: readonly SideForgeReviewItem[];
  readonly history: readonly SideForgeHistoryLine[];
}

// ── Oracle Forge tab ───────────────────────────────────────────────
export interface OracleForgeData {
  readonly purposeHtml: string;
  readonly tableNames: string;
  readonly lastCard: SideCardData | null;
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
  readonly getSideForgeData: (state?: CampaignStateSnapshot) => SideForgeData | null;
  readonly getOracleForgeData: (state?: CampaignStateSnapshot) => OracleForgeData | null;
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

export function getSideForgeData(state: CampaignStateSnapshot): SideForgeData | null {
  return cjs().CampaignUI?.getSideForgeData(state) ?? null;
}

export function getOracleForgeData(state: CampaignStateSnapshot): OracleForgeData | null {
  return cjs().CampaignUI?.getOracleForgeData(state) ?? null;
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
