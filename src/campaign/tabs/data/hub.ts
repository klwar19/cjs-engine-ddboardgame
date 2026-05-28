// hub.ts — K.3 bridge for the Hub-family forge tabs (Battle Sets,
// Map Seeds, and — added in later K.3 commits — Side Forge, Oracle
// Forge, Quest Chains). Each tab body was previously an HTML string
// built in `js/campaign/ui/tabs/cui-hub-tab.js` carrying
// `data-campaign-action`; the React tree now reads this structured data
// and renders JSX with direct onClick dispatch.
//
// Phase H.4 — `getBattleSetsData` and `getMapSeedsData` ported inline
// (pure reads of `CampaignBattleSetForge` / `CampaignMapSeedForge`).
// The remaining `getSideForgeData` / `getOracleForgeData` /
// `getQuestChainsData` still bridge to `CampaignUI.*` while their
// deep closure-private helpers (`_sideCardData`, `_questChainActiveData`,
// etc.) wait on the side-card port.

import type { CampaignStateSnapshot } from "../../store";
import type { QuestChainActiveData, QuestChainTemplateData } from "./eventTab";

// Side-content risk classifier surface (already implemented in
// `js/campaign/campaign-side-content.js`). Lives on
// `window.CJS.CampaignSideContent`.
interface SideContentSurface {
  readonly riskClass?: (canonRisk: string | null | undefined) => string;
}

interface BattleSetCardLike {
  readonly id?: string | number;
  readonly name?: string;
  readonly canonRisk?: string;
  readonly rank?: string | number;
  readonly objective?: string;
  readonly tags?: readonly unknown[];
  readonly enemyMix?: ReadonlyArray<{ qty?: number; label?: string; name?: string; id?: string }>;
  readonly gimmick?: string;
  readonly encounterId?: string;
}

interface MapSeedCardLike {
  readonly id?: string | number;
  readonly name?: string;
  readonly canonRisk?: string;
  readonly purpose?: string | readonly string[];
  readonly nodes?: ReadonlyArray<{ name?: string; id?: string; role?: string; notes?: string }>;
}

interface BattleSetForgeSurface {
  readonly getCards?: () => readonly BattleSetCardLike[];
}

interface MapSeedForgeSurface {
  readonly getSeeds?: () => readonly MapSeedCardLike[];
}

interface CjsHubExtras {
  readonly CampaignSideContent?: SideContentSurface;
  readonly CampaignBattleSetForge?: BattleSetForgeSurface;
  readonly CampaignMapSeedForge?: MapSeedForgeSurface;
}

function side(): SideContentSurface | undefined {
  return (window as unknown as { CJS?: CjsHubExtras }).CJS?.CampaignSideContent;
}

function battleForge(): BattleSetForgeSurface | undefined {
  return (window as unknown as { CJS?: CjsHubExtras }).CJS?.CampaignBattleSetForge;
}

function mapForge(): MapSeedForgeSurface | undefined {
  return (window as unknown as { CJS?: CjsHubExtras }).CJS?.CampaignMapSeedForge;
}

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

// Phase H.4 inline port — pure read of CampaignBattleSetForge.
// State is threaded so the shell refreshes on every tick even though
// the data source is the forge module, not the snapshot.
export function getBattleSetsData(_state: CampaignStateSnapshot): BattleSetsData | null {
  const cards = battleForge()?.getCards?.() || [];
  const sx = side();
  return {
    cards: cards.map((card) => ({
      id: String(card.id || ""),
      name: String(card.name || card.id || ""),
      canonRisk: String(card.canonRisk || "green"),
      canonRiskClass: sx?.riskClass?.(card.canonRisk) ?? "",
      rank: String(card.rank || "-"),
      objective: String(card.objective || ""),
      tags: Array.isArray(card.tags) ? card.tags.map(String) : [],
      enemyMix: (card.enemyMix || []).map((enemy) => ({
        qty: Number(enemy.qty || 1),
        label: String(enemy.label || enemy.name || enemy.id || "unit")
      })),
      gimmick: String(card.gimmick || ""),
      queueLabel: card.encounterId ? "Queue Combat" : "Queue Manual"
    }))
  };
}

// Phase H.4 inline port — pure read of CampaignMapSeedForge.
export function getMapSeedsData(_state: CampaignStateSnapshot): MapSeedsData | null {
  const seeds = mapForge()?.getSeeds?.() || [];
  const sx = side();
  return {
    seeds: seeds.map((seed) => ({
      id: String(seed.id || ""),
      name: String(seed.name || seed.id || ""),
      canonRisk: String(seed.canonRisk || "green"),
      canonRiskClass: sx?.riskClass?.(seed.canonRisk) ?? "",
      purpose: (Array.isArray(seed.purpose) ? seed.purpose : [seed.purpose].filter(Boolean))
        .map(String)
        .join(", "),
      nodes: (seed.nodes || []).map((node) => ({
        name: String(node.name || node.id || ""),
        detail: String(node.role || node.notes || "")
      }))
    }))
  };
}
