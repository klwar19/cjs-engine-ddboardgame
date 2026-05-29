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
import {
  questChainActiveData,
  questChainTemplateData,
  questChainResolvedData,
  sideStoryFlowGuideData,
  type ChainActiveInput,
  type ChainTemplateInput
} from "./questChain";

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

// HubTab module (still-JS bridged island in `js/campaign/ui/tabs/cui-hub-tab.js`)
// exposes the consequence-preview / flavor-trail HTML builders that the
// side-card data builder embeds.
interface HubTabSurface {
  readonly cardChoiceOps?: (card: unknown) => readonly unknown[];
  readonly renderConsequencePreview?: (ops: readonly unknown[], options?: {
    title?: string;
    emptyTitle?: string;
    emptyText?: string;
  }) => string;
  readonly renderFlavorTrail?: (entry: unknown) => string;
  readonly consequenceSummary?: (
    ops: readonly unknown[],
    options?: { hasText?: boolean }
  ) => { tone?: string; label?: string };
  readonly openRumors?: (hubState: unknown) => readonly RumorInput[];
}

interface CampaignHubSurface {
  readonly getCurrentHubId?: () => string;
  readonly getCurrentHubDefinition?: () => {
    readonly id?: string;
    readonly name?: string;
    readonly description?: string;
  } | null | undefined;
  readonly getCurrentHubState?: () => {
    readonly mood?: string;
    readonly security?: number;
    readonly prosperity?: number;
    readonly warmth?: number;
    readonly weirdness?: number;
    readonly activeProblems?: readonly string[];
    readonly [key: string]: unknown;
  } | null | undefined;
}

function hubTab(): HubTabSurface | undefined {
  return (window as unknown as { CJS?: { CampaignUIInternal?: { HubTab?: HubTabSurface } } }).CJS?.CampaignUIInternal?.HubTab;
}

function campaignHub(): CampaignHubSurface | undefined {
  return (window as unknown as { CJS?: { CampaignHub?: CampaignHubSurface } }).CJS?.CampaignHub;
}

// ── Side-content card + rumor row builders ──────────────────────────
// Used by the Side Forge / Oracle Forge / Town snapshot data builders.
// Display-only sub-pieces (inline purpose, flavor trail, choice
// consequence preview) arrive pre-rendered as HTML via HubTab — the
// JSX consumer threads them through `<HtmlBridge>` divs (same pattern
// ResultPanels uses).
interface SideCardInput {
  readonly id?: string;
  readonly title?: string;
  readonly name?: string;
  readonly type?: string;
  readonly source?: string;
  readonly status?: string;
  readonly canonRisk?: string;
  readonly prompt?: string;
  readonly text?: string;
  readonly summary?: string;
  readonly gmKeywords?: readonly string[];
  readonly gmNote?: string;
  readonly suggestedChoices?: ReadonlyArray<{ label?: string; ops?: readonly unknown[] }>;
  readonly [key: string]: unknown;
}

interface RumorInput {
  readonly id?: string;
  readonly text?: string;
  readonly status?: string;
  readonly canonRisk?: string;
}

import { label } from "../../util/cui-utils";
import { renderInlinePurpose, purposeKeyForCard } from "../../util/cui-controls";

export function sideCardData(card: SideCardInput = {}, options: { compact?: boolean; mode?: string } = {}): SideCardData {
  const compact = !!options.compact;
  const choices = card.suggestedChoices || [];
  const hub = hubTab();
  const primaryOps = hub?.cardChoiceOps?.(card) || [];
  const summary = hub?.consequenceSummary?.(primaryOps, {
    hasText: !!(card.prompt || card.text || card.summary)
  }) || {};
  const sx = side();
  return {
    id: String(card.id || ""),
    title: String(card.title || card.name || card.id || ""),
    subtitle: `${card.type || "side content"} | ${card.source || ""} | ${card.status || "idea"}`,
    tone: String(summary.tone || "flavor"),
    toneLabel: String(summary.label || ""),
    canonRisk: String(card.canonRisk || "green"),
    canonRiskClass: sx?.riskClass?.(card.canonRisk) ?? "",
    compact,
    purposeHtml: compact ? "" : renderInlinePurpose(purposeKeyForCard(card)),
    prompt: String(card.prompt || ""),
    text: String(card.text || ""),
    summary: (!compact && card.summary) ? String(card.summary) : "",
    flavorTrailHtml: compact ? "" : (hub?.renderFlavorTrail?.(card) ?? ""),
    gmKeywords: (!compact && Array.isArray(card.gmKeywords)) ? card.gmKeywords.map(String) : [],
    gmNote: compact ? "" : String(card.gmNote || ""),
    choiceStackHtml: (!compact && choices.length)
      ? choices.map((choice, index) => hub?.renderConsequencePreview?.(choice.ops || [], {
          title: choice.label || `Choice ${index + 1}`,
          emptyTitle: choice.label || `Choice ${index + 1}`,
          emptyText: "Flavor choice only. Save it as text or use it to steer the next scene."
        }) ?? "").join("")
      : "",
    choiceButtons: choices.map((choice, index) => ({
      index,
      label: String(choice.label || `Choice ${index + 1}`)
    })),
    showDismiss: !compact
  };
}

export function rumorRowData(rumor: RumorInput = {}, options: { compact?: boolean } = {}): RumorRowData {
  const hubId = campaignHub()?.getCurrentHubId?.() || "";
  const sx = side();
  return {
    id: String(rumor.id || ""),
    hubId: String(hubId),
    text: String(rumor.text || rumor.id || ""),
    statusLabel: String(rumor.status || "active"),
    riskLabel: label(rumor.canonRisk || "green"),
    canonRisk: String(rumor.canonRisk || "green"),
    canonRiskClass: sx?.riskClass?.(rumor.canonRisk) ?? "",
    compact: !!options.compact
  };
}

// Oracle Forge data source — `CampaignDataLoader` provides the table
// list (the still-JS data loader stays as-is).
interface OracleTableLike {
  readonly id?: string;
  readonly name?: string;
}

interface CampaignDataLoaderSurface {
  readonly getOracleTables?: () => readonly OracleTableLike[];
}

function dataLoader(): CampaignDataLoaderSurface | undefined {
  return (window as unknown as { CJS?: { CampaignDataLoader?: CampaignDataLoaderSurface } })
    .CJS?.CampaignDataLoader;
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

// (No remaining CampaignUI bridge consumers — getQuestChainsData is now
// inline TS reading CampaignQuestChains directly.)
interface CampaignQuestChainsSurface {
  readonly getActive?: () => readonly ChainActiveInput[];
  readonly getFinished?: () => readonly ChainActiveInput[];
  readonly getAvailable?: () => readonly ChainTemplateInput[];
}

function questChainsModule(): CampaignQuestChainsSurface | undefined {
  return (window as unknown as { CJS?: { CampaignQuestChains?: CampaignQuestChainsSurface } })
    .CJS?.CampaignQuestChains;
}

// Phase H.4 inline port — Living Hub side-content view. Reads
// CampaignHub state + side-content slot + the shared sideCardData /
// rumorRowData helpers above.
interface SideContentSlotInput extends SideCardInput {
  readonly type?: string;
  readonly status?: string;
}

interface CampaignStateForSideForge {
  readonly lastSideContentCard?: SideContentSlotInput;
  readonly sideContent?: {
    readonly generatedIdeas?: Record<string, SideContentSlotInput>;
    readonly reviewQueue?: ReadonlyArray<{
      id?: string;
      contentId?: string;
      reason?: string;
      canonRisk?: string;
    }>;
    readonly contentHistory?: ReadonlyArray<{
      title?: string;
      type?: string;
      result?: string;
      phase?: number | string;
    }>;
  };
}

export function getSideForgeData(state: CampaignStateSnapshot): SideForgeData | null {
  if (!state) return null;
  const hub = campaignHub()?.getCurrentHubDefinition?.() || {};
  const hubState = campaignHub()?.getCurrentHubState?.() || {};
  const typed = state as CampaignStateForSideForge;
  const last = typed.lastSideContentCard;
  const ideas = Object.values(typed.sideContent?.generatedIdeas || {});
  const saved = ideas.filter((idea) => idea.status === "saved" || idea.status === "active");
  const review = typed.sideContent?.reviewQueue || [];
  const history = typed.sideContent?.contentHistory || [];
  const sx = side();
  const rumors = hubTab()?.openRumors?.(hubState) || [];
  return {
    hubName: String(hub.name || "Living Hub"),
    hubDescription: String(hub.description || "Town pulse, rumors, problems, and content review queue."),
    hubId: String(hub.id || ""),
    moodLabel: label(hubState.mood || "neutral"),
    stats: {
      security: Number(hubState.security ?? 0),
      prosperity: Number(hubState.prosperity ?? 0),
      warmth: Number(hubState.warmth ?? 0),
      weirdness: Number(hubState.weirdness ?? 0)
    },
    problemPurposeHtml: renderInlinePurpose("problem"),
    problems: (hubState.activeProblems || []).map((problem) => ({
      id: String(problem),
      label: label(problem)
    })),
    lastCard: last ? sideCardData(last, { mode: "last" }) : null,
    rumors: rumors.slice(0, 6).map((rumor) => rumorRowData(rumor)),
    savedIdeas: saved.slice(0, 8).map((idea) => sideCardData(idea, { compact: true })),
    review: review.slice(0, 8).map((item) => ({
      id: String(item.id || ""),
      contentId: String(item.contentId || ""),
      reason: String(item.reason || ""),
      canonRisk: String(item.canonRisk || "red"),
      canonRiskClass: sx?.riskClass?.(item.canonRisk) ?? ""
    })),
    history: history.slice(0, 10).map((line) => ({
      title: String(line.title || line.type || ""),
      result: String(line.result || ""),
      phaseLabel: String(line.phase ?? "")
    }))
  };
}

// Phase H.4 inline port — pure read of state + DataLoader + sideCardData.
interface CampaignStateForOracleForge {
  readonly lastSideContentCard?: SideCardInput & { type?: string };
}

export function getOracleForgeData(state: CampaignStateSnapshot): OracleForgeData | null {
  if (!state) return null;
  const cardSlot = (state as CampaignStateForOracleForge).lastSideContentCard;
  const last = cardSlot && cardSlot.type === "oracle_prompt" ? cardSlot : null;
  const tables = dataLoader()?.getOracleTables?.() || [];
  return {
    purposeHtml: renderInlinePurpose("oracle"),
    tableNames: tables.map((table) => String(table.name || table.id || "")).join(", ") || "No oracle tables loaded.",
    lastCard: last ? sideCardData(last, { mode: "oracle" }) : null
  };
}

export function getQuestChainsData(_state: CampaignStateSnapshot): QuestChainsData | null {
  const QC = questChainsModule();
  if (!QC) {
    return { activeCount: 0, availableCount: 0, flowGuide: null, active: [], finished: [], available: [] };
  }
  const available = QC.getAvailable?.() || [];
  const active = QC.getActive?.() || [];
  const finished = QC.getFinished?.() || [];
  const guideSource = active[0]?.template || available[0] || null;
  return {
    activeCount: active.length,
    availableCount: available.length,
    flowGuide: guideSource ? sideStoryFlowGuideData(guideSource) : null,
    active: active.map((chain) => questChainActiveData(chain)),
    finished: finished.map((chain) => questChainResolvedData(chain)),
    available: available.map((chain) => questChainTemplateData(chain))
  };
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
