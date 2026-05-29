// resultPanels.ts — Phase G typed shapes for the shared EventResult
// and Oracle panels used across EventLog, EventTab, Overview, and
// Maps tabs.
//
// Phase H.4 — pure-state-read data builders move inline here. The
// helpers that emit HTML strings (`renderLootSummary`,
// `renderCombatConsequenceNotice`, etc.) are ported alongside in the
// "HTML helpers" section below.

import { esc, lootLine, label } from "../../util/cui-utils";
import { renderInlinePurpose, purposeKeyForCard, type CardLike } from "../../util/cui-controls";
import {
  pendingSoloHookCard,
  activeRunQuestId,
  isQuestResolved,
  questNextObjective,
  type SoloHookStateShape,
  type QuestObjective
} from "../../util/state-helpers";
import type { CampaignStateSnapshot } from "../../store";
import {
  runQuestPill,
  scenarioObjectiveMeta,
  type QuestPillData,
  type ObjectiveLike
} from "./scenarioShared";

// HubTab module (still-JS bridged island) renders the consequence
// preview / flavor trail HTML the side panels embed.
interface HubTabSurface {
  readonly renderConsequencePreview?: (
    ops: readonly unknown[],
    options?: { title?: string; emptyTitle?: string; emptyText?: string }
  ) => string;
  readonly renderFlavorTrail?: (entry: unknown) => string;
  readonly cardChoiceOps?: (card: unknown) => readonly unknown[];
  readonly consequenceSummary?: (
    ops: readonly unknown[],
    options?: { hasText?: boolean }
  ) => { tone?: string; label?: string; short?: string };
}

function hubTab(): HubTabSurface | undefined {
  return (window as unknown as { CJS?: { CampaignUIInternal?: { HubTab?: HubTabSurface } } })
    .CJS?.CampaignUIInternal?.HubTab;
}

// CampaignSideContent — risk classification + label.
interface SideContentSurface {
  readonly risk?: (canonRisk: unknown) => string;
  readonly riskClass?: (risk: string) => string;
}

function side(): SideContentSurface | undefined {
  return (window as unknown as { CJS?: { CampaignSideContent?: SideContentSurface } })
    .CJS?.CampaignSideContent;
}

// CampaignOps.describe — humanizes an op[] for the action hint.
interface OpsSurface {
  readonly describe?: (ops: readonly unknown[]) => readonly string[];
}

function ops(): OpsSurface | undefined {
  return (window as unknown as { CJS?: { CampaignOps?: OpsSurface } }).CJS?.CampaignOps;
}

// ── HTML helpers (Phase H.4 — ported from campaign-ui.js) ────────────
// These build small HTML fragments that the data builders below embed
// in their typed snapshots. They are intentionally still HTML strings
// rather than JSX because the consumers (`ResultPanels.tsx` etc.)
// render them via `dangerouslySetInnerHTML` — the React-side bridge
// pattern Phase G established.

function renderContextTags(tags: readonly string[] = []): string {
  const list = Array.from(new Set((tags || []).filter(Boolean))).slice(0, 8);
  if (!list.length) return "";
  return `
      <div class="campaign-chip-row campaign-context-tags">
        ${list.map((tag) => `<span class="campaign-chip">${esc(label(tag))}</span>`).join("")}
      </div>
    `;
}

interface LootDrop {
  readonly type?: string;
  readonly id?: string;
  readonly name?: string;
  readonly amount?: number;
  readonly qty?: number;
  readonly currency?: string;
}

function renderLootSummary(drops: readonly LootDrop[]): string {
  if (!drops.length) return '<div class="campaign-empty">No loot in this result.</div>';
  return `
      <div class="campaign-preview">
        <b>Loot</b><br>
        ${drops.map((drop) => esc(lootLine(drop))).join("<br>")}
      </div>
    `;
}

interface CombatPulse {
  readonly summary?: string;
  readonly tags?: readonly string[];
}

function renderCombatPulseSummary(pulse: CombatPulse | null | undefined): string {
  if (!pulse) return "";
  const tags = (pulse.tags || [])
    .filter((tag) => /^(behavior|defeated_tag|status|skill):/.test(tag))
    .slice(0, 8);
  return `
      <div class="campaign-combat-pulse">
        ${pulse.summary ? `<span>${esc(pulse.summary)}</span>` : ""}
        ${renderContextTags(tags.map((tag) => tag.replace(/^[^:]+:/, "")))}
      </div>
    `;
}

interface CombatResultInput {
  readonly result?: string;
  readonly defeatOps?: readonly unknown[];
  readonly drawOps?: readonly unknown[];
  readonly badEndingOps?: readonly unknown[];
  readonly badEndingOnDefeat?: boolean;
  readonly defeatOutcome?: string;
  readonly defeatMode?: string;
  readonly defeatNoRecovery?: boolean;
}

interface PendingBattleLike {
  readonly source?: string;
  readonly defeatOps?: readonly unknown[];
  readonly lossOps?: readonly unknown[];
  readonly badEndingOps?: readonly unknown[];
  readonly drawOps?: readonly unknown[];
  readonly badEndingOnDefeat?: boolean;
  readonly defeatOutcome?: string;
  readonly defeatMode?: string;
  readonly defeatNoRecovery?: boolean;
  readonly noDefeatRecovery?: boolean;
  readonly encounterId?: string;
  readonly battleSetId?: string;
  readonly monsterIds?: readonly string[];
  readonly label?: string;
  readonly battleMap?: { readonly theme?: string };
}

function renderCombatConsequenceNotice(
  result: CombatResultInput,
  state: { pendingBattle?: PendingBattleLike }
): string {
  const outcome = String(result?.result || "").toLowerCase();
  if (!["defeat", "draw"].includes(outcome)) return "";
  const battle = state.pendingBattle || {};
  const hasCustom = outcome === "defeat"
    ? !!(
      (result.defeatOps || battle.defeatOps || battle.lossOps
        || result.badEndingOps || battle.badEndingOps || []).length
    )
    : !!((result.drawOps || battle.drawOps || []).length);
  const badEnding = outcome === "defeat" && !!(
    result.badEndingOnDefeat
    || battle.badEndingOnDefeat
    || result.defeatOutcome === "bad_ending"
    || battle.defeatOutcome === "bad_ending"
    || result.defeatMode === "bad_ending"
    || battle.defeatMode === "bad_ending"
  );
  const lines: string[] = [];
  if (badEnding) lines.push("Defeat can branch into a bad-ending route for this battle.");
  if (hasCustom) lines.push("This battle has authored defeat consequences.");
  if (!hasCustom) lines.push(
    outcome === "draw"
      ? "Default draw penalty: danger +1 and 5% currency loss."
      : "Default defeat penalty: danger +2 and 10% currency loss."
  );
  if (!(result.defeatNoRecovery || battle.defeatNoRecovery || battle.noDefeatRecovery)) {
    lines.push("KO party members recover to low HP instead of an instant wipeout.");
  }
  return `
      <div class="campaign-preview">
        <b>Campaign Consequence</b><br>
        ${lines.map((line) => esc(line)).join("<br>")}
      </div>
    `;
}

function battleSourceLabel(battle: PendingBattleLike): string {
  const map: Readonly<Record<string, string>> = {
    random: "🎲 Random Roll",
    set: "📌 Set Battle",
    manual_pick: "📋 Picked",
    beat: "📜 Beat",
    manual: "Manual"
  };
  if (battle.source === "travel_surprise") return "Travel Surprise";
  if (battle.source === "moving_threat") return "Moving Threat";
  if (battle.source === "random_monster_pool") return "Monster Pool";
  return map[battle.source || ""] || battle.source || "manual";
}

interface CombatBridgeSurface {
  readonly isMemberBattleReady?: (member: unknown) => boolean;
  readonly availabilityLabel?: (member: unknown) => string;
}

interface QuestPulseSurface {
  readonly battleContextForPending?: (
    state: unknown,
    battle: unknown
  ) => { questId?: string; questTitle?: string; contextTags?: string[]; monsterTags?: string[] } | null | undefined;
}

function combatBridge(): CombatBridgeSurface | undefined {
  return (window as unknown as { CJS?: { CampaignCombatBridge?: CombatBridgeSurface } }).CJS?.CampaignCombatBridge;
}

function questPulse(): QuestPulseSurface | undefined {
  return (window as unknown as { CJS?: { CampaignQuestPulse?: QuestPulseSurface } }).CJS?.CampaignQuestPulse;
}

interface PartyMemberLike {
  readonly name?: string;
}

function renderBattlePartySummary(state: { party?: Record<string, PartyMemberLike> }): string {
  const ready: string[] = [];
  const blocked: string[] = [];
  const bridge = combatBridge();
  for (const [id, member] of Object.entries(state.party || {})) {
    if (bridge?.isMemberBattleReady?.(member)) {
      ready.push(member.name || id);
    } else {
      blocked.push(`${member.name || id}: ${bridge?.availabilityLabel?.(member) || "Unavailable"}`);
    }
  }
  return `
      <div class="campaign-preview">
        <b>Battle Party</b><br>
        Ready: ${esc(ready.join(", ") || "none")}<br>
        ${blocked.length ? `Unavailable: ${esc(blocked.join("; "))}` : "Unavailable: none"}
      </div>
    `;
}

function renderPendingBattleContext(state: unknown, battle: PendingBattleLike = {}): string {
  const ctx = questPulse()?.battleContextForPending?.(state, battle);
  const tags = [
    ...(ctx?.contextTags || []),
    ...(ctx?.monsterTags || [])
  ];
  if (!ctx?.questId && !tags.length) return "";
  return `
      <div class="campaign-battle-context">
        ${ctx?.questTitle ? `<strong>${esc(ctx.questTitle)}</strong>` : ""}
        ${renderContextTags(tags)}
      </div>
    `;
}

export interface ManualSummary {
  readonly short: string;
  readonly main: string;
  readonly tags: readonly string[];
}

export interface EventResultData {
  readonly title: string;
  readonly subLabel: string;
  readonly tone: string;
  readonly summaryLabel: string;
  readonly ideaPillLabel: string;
  readonly prompt: string;
  readonly gmHook: string;
  readonly inlinePurposeHtml: string;
  readonly manualSummary: ManualSummary | null;
  readonly consequencePreviewHtml: string;
  readonly flavorTrailHtml: string;
  readonly applyLabel: string;
  readonly applyHint: string;
  readonly hasManualSummary: boolean;
  readonly hasPlotSeedTrigger: boolean;
  readonly hasOracleTableId: boolean;
}

export interface OracleData {
  readonly text: string;
  readonly inlinePurposeHtml: string;
  readonly consequencePreviewHtml: string;
}

export interface TravelSurpriseData {
  readonly title: string;
  readonly categoryLabel: string;
  readonly prompt: string;
  readonly areaLabel: string;
  readonly repeatLabel: string;
  readonly locationLabel: string;
}

export interface CombatResultData {
  readonly resultLabel: string;
  readonly encounterId: string;
  readonly rounds: number;
  readonly lootHtml: string;
  readonly consequenceNoticeHtml: string;
}

export interface LastCombatResultData {
  readonly resultLabel: string;
  readonly label: string;
  readonly rounds: number;
  readonly summary: string;
  readonly pulseHtml: string;
  readonly lootHtml: string;
}

export interface LastReportData {
  readonly outcome: string;
  readonly danger: number;
  readonly campsUsed: number;
  readonly eventsUsed: number;
  readonly battlesCount: number;
  readonly diffJson: string;
}

export interface PendingBattleData {
  readonly sourceLabel: string;
  readonly label: string;
  readonly subLabel: string;
  readonly autoMapLabel: string;
  readonly contextHtml: string;
  readonly partySummaryHtml: string;
  readonly canRun: boolean;
  readonly isRandom: boolean;
}

export interface ScenarioObjective {
  readonly completed: boolean;
  readonly visible: boolean;
  readonly label: string;
  readonly meta: string;
}

export interface ScenarioSummaryRun {
  readonly hasRun: true;
  readonly name: string;
  readonly questPill: QuestPillData | null;
  readonly isGrid: boolean;
  readonly location: string;
  readonly danger: number;
  readonly dangerMax: number;
  readonly campsUsed: number;
  readonly campsMax: number;
  readonly eventsUsed: number;
  readonly eventsMax: number;
  readonly battlesUsed: number;
  readonly battlesMax: number;
  readonly roamerCount: number;
  readonly objective: ScenarioObjective | null;
  readonly questRunTask: QuestRunTaskData | null;
  readonly hasGeneratedScenario: boolean;
}

// Phase H.4 — typed replacement for the old `renderQuestRunTaskHtml`
// bridge. The ScenarioSummary panel renders this directly as JSX
// (`ResultPanels.tsx`), so the closure-private `_renderQuestRunTask`
// HTML emitter + its `_questTaskDescriptor` / `_questCellFromRef`
// sub-helpers in campaign-ui.js are gone.
export type QuestRunTaskData =
  | { readonly kind: "resolved"; readonly title: string }
  | { readonly kind: "task"; readonly phase: string; readonly label: string; readonly location: string };

interface ScenarioSummaryNoRun {
  readonly hasRun: false;
}

export type ScenarioSummaryData = ScenarioSummaryNoRun | ScenarioSummaryRun;

export type SequenceScope = "story" | "quest" | "event";

// Typed shape for one sequence node. The vanilla bridge
// (`_sequenceNodeSnapshot` in campaign-ui.js) pre-resolves eligibility,
// alignment hints, replay state, and chip text so the React tree
// renders each variant without reaching back into CJS modules.
export interface SequenceNodeChoice {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly locked: boolean;
}

interface SequenceNodeBase {
  readonly text: string;
}

interface SequenceNodeChoiceData extends SequenceNodeBase {
  readonly type: "choice";
  readonly speaker: string;
  readonly choices: readonly SequenceNodeChoice[];
}

interface SequenceNodeMetaCarrier extends SequenceNodeBase {
  readonly meta: readonly string[];
}

interface SequenceNodeStatCheckData extends SequenceNodeMetaCarrier {
  readonly type: "stat_check";
}

interface SequenceNodeCombatData extends SequenceNodeMetaCarrier {
  readonly type: "combat";
  readonly replay: boolean;
  readonly encounterId: string;
  readonly battleSetId: string;
}

interface SequenceNodeMinigameData extends SequenceNodeMetaCarrier {
  readonly type: "minigame";
  readonly replay: boolean;
  readonly gameId: string;
  readonly gameLabel: string;
}

interface SequenceNodeScenarioData extends SequenceNodeMetaCarrier {
  readonly type: "scenario";
  readonly replay: boolean;
  readonly scenarioId: string;
  readonly scenarioOpen: boolean;
}

interface SequenceNodeEndData extends SequenceNodeBase {
  readonly type: "end";
}

interface SequenceNodeDefaultData extends SequenceNodeMetaCarrier {
  readonly type: "default";
  readonly kind: string;
  readonly speaker: string;
  readonly replay: boolean;
  readonly next: string;
}

export type SequenceNodeData =
  | SequenceNodeChoiceData
  | SequenceNodeStatCheckData
  | SequenceNodeCombatData
  | SequenceNodeMinigameData
  | SequenceNodeScenarioData
  | SequenceNodeEndData
  | SequenceNodeDefaultData;

export interface ActiveSequenceData {
  readonly title: string;
  readonly scopeLabel: string;
  readonly chapterLabel: string;
  readonly nodeId: string;
  readonly replayMode: boolean;
  readonly vnActive: boolean;
  readonly node: SequenceNodeData | null;
}

export interface SoloNoticeData {
  readonly tone: string;
  readonly summaryLabel: string;
  readonly kindLabel: string;
  readonly choiceLabel: string;
  readonly risk: string;
  readonly riskClass: string;
  readonly title: string;
  readonly prompt: string;
  readonly inlinePurposeHtml: string;
  readonly consequencePreviewHtml: string;
  readonly flavorTrailHtml: string;
  readonly acceptLabel: string;
  readonly acceptHint: string;
}

// (No remaining CampaignUI bridge consumers — every data builder in
// this file is now inline TS.)

// Phase H.4 inline port — typed snapshot of `state.lastEvent`. The HTML
// fragments (inline purpose, consequence preview, flavor trail) still
// come through the helpers above + the HubTab module bridge; the data
// shape is fully typed for the JSX consumers.
interface EventInput {
  readonly id?: string;
  readonly title?: string;
  readonly type?: string;
  readonly tableName?: string;
  readonly prompt?: string;
  readonly gmHook?: string;
  readonly gmIdea?: string;
  readonly oracleTableId?: string;
  readonly suggested?: readonly unknown[];
  readonly manualSummary?: { short?: string; main?: string; tags?: readonly string[] };
}

const EVENT_IDEA_LABELS: Readonly<Record<string, string>> = {
  new_char: "👤 New Character",
  new_item: "🎁 Item idea",
  weapon: "⚔ Weapon idea",
  back_story: "📖 Backstory beat",
  main_plot: "🌌 Main plot thread",
  development: "✨ Character development",
  faction: "🏛 Faction hook",
  mystery: "🔮 Mystery hook"
};

export function getEventResultData(state: CampaignStateSnapshot): EventResultData | null {
  if (!state) return null;
  const event = (state as { lastEvent?: EventInput }).lastEvent;
  if (!event) return null;
  const suggested = event.suggested || [];
  const hub = hubTab();
  const summary = hub?.consequenceSummary?.(suggested, {
    hasText: !!(event.prompt || event.gmHook)
  }) || { tone: "", label: "", short: "" };
  const opsModule = ops();
  const opsDesc = suggested.length
    ? (opsModule?.describe?.(suggested) ?? []).filter(Boolean)
    : [];
  return {
    title: event.title || event.id || "Event",
    subLabel: event.tableName || event.type || "event",
    tone: String(summary.tone || ""),
    summaryLabel: String(summary.label || ""),
    ideaPillLabel: event.gmIdea ? EVENT_IDEA_LABELS[event.gmIdea] || event.gmIdea : "",
    prompt: event.prompt || "",
    gmHook: event.gmHook || "",
    inlinePurposeHtml: renderInlinePurpose("event"),
    manualSummary: event.manualSummary
      ? {
          short: event.manualSummary.short || "No short result written yet.",
          main: event.manualSummary.main || "",
          tags: (event.manualSummary.tags || []).filter((tag): tag is string => Boolean(tag))
        }
      : null,
    consequencePreviewHtml:
      hub?.renderConsequencePreview?.(suggested, {
        emptyTitle: "Flavor or plot text only",
        emptyText: "No reward or damage is applied. Save the text, pin it as a plot seed, or ignore it."
      }) ?? "",
    flavorTrailHtml: hub?.renderFlavorTrail?.(event) ?? "",
    applyLabel: suggested.length ? "Apply Listed Changes" : "Log Flavor",
    applyHint: opsDesc.length ? "Commit: " + opsDesc.join("; ") : "Log the event with no stat changes",
    hasManualSummary: !!event.manualSummary,
    hasPlotSeedTrigger: !!(event.gmHook || event.gmIdea),
    hasOracleTableId: !!event.oracleTableId
  };
}

// Phase H.4 inline port — `state.lastOracle` + the HubTab
// consequence-preview HTML the side panel renders (with the static
// "flavor prompt" copy the JS original used).
interface OracleStateSlot {
  readonly text?: string;
}

export function getOracleData(state: CampaignStateSnapshot): OracleData | null {
  if (!state) return null;
  const oracle = (state as { lastOracle?: OracleStateSlot }).lastOracle;
  if (!oracle) return null;
  return {
    text: oracle.text || "",
    inlinePurposeHtml: renderInlinePurpose("oracle"),
    consequencePreviewHtml: hubTab()?.renderConsequencePreview?.([], {
      emptyTitle: "Flavor prompt",
      emptyText: "Use as narration now, save it as a note, or reroll for a sharper prompt."
    }) ?? ""
  };
}

// Phase H.4 inline port — pending solo hook card + side-content
// consequence/preview HTML. Five consumers (Overview, EventTab,
// QuestHome, QuestsPanel, StoryHome). Returns null when no card is
// pending; the consumer panel doesn't render.
interface SoloHookCard {
  readonly id?: string;
  readonly type?: string;
  readonly title?: string;
  readonly name?: string;
  readonly prompt?: string;
  readonly summary?: string;
  readonly gmHook?: string;
  readonly notes?: string;
  readonly canonRisk?: string;
  readonly questTemplate?: unknown;
  readonly questChainTemplateId?: string;
  readonly suggestedChoices?: ReadonlyArray<{ label?: string }>;
  readonly [key: string]: unknown;
}

interface CampaignStateForSoloNotice extends SoloHookStateShape {
  readonly pendingSoloHook?: { readonly cardId?: string; readonly kind?: string };
}

export function getSoloNoticeData(state: CampaignStateSnapshot): SoloNoticeData | null {
  if (!state) return null;
  const typedState = state as CampaignStateForSoloNotice;
  const card = pendingSoloHookCard(typedState) as SoloHookCard | null;
  if (!card) return null;
  const kind = typedState.pendingSoloHook?.kind || card.type || "hook";
  const sx = side();
  const risk = sx?.risk?.(card.canonRisk) ?? "";
  const prompt = card.prompt || card.summary || card.gmHook || card.notes || "";
  const hub = hubTab();
  const choiceOps = hub?.cardChoiceOps?.(card) || [];
  const summary = hub?.consequenceSummary?.(choiceOps, { hasText: !!prompt }) || {};
  const firstChoice = card.suggestedChoices?.[0];
  const choiceLabel = firstChoice?.label || "Apply the first suggested choice";
  const isQuestOffer = !!(card.questTemplate || card.questChainTemplateId || card.type === "quest_offer");
  const opsModule = ops();
  const acceptHint = isQuestOffer
    ? "Add quest to tracker and auto-start its map run"
    : (choiceOps.length
      ? `Apply: ${(opsModule?.describe?.(choiceOps) ?? []).join("; ")}`
      : "Create a quest from this story-only hook");
  return {
    tone: String(summary.tone || ""),
    summaryLabel: String(summary.label || ""),
    kindLabel: label(kind),
    choiceLabel,
    risk,
    riskClass: sx?.riskClass?.(risk) ?? "",
    title: String(card.title || card.name || card.id || ""),
    prompt,
    inlinePurposeHtml: renderInlinePurpose(kind === "rumor_offer" ? "rumor" : purposeKeyForCard(card as CardLike)),
    consequencePreviewHtml: hub?.renderConsequencePreview?.(choiceOps, {
      emptyTitle: "Flavor only",
      emptyText: "No mechanical change yet. Save it as text, make it a rumor, or turn it into a quest."
    }) ?? "",
    flavorTrailHtml: hub?.renderFlavorTrail?.(card) ?? "",
    acceptLabel: choiceOps.length ? "Accept & Apply" : "Accept as Quest",
    acceptHint
  };
}

// Phase H.4 inline port — pure state read, no closure-private deps.
interface TravelSurpriseNotice {
  readonly title?: string;
  readonly category?: string;
  readonly prompt?: string;
  readonly area?: string;
  readonly repeated?: boolean;
  readonly visitCount?: number;
  readonly location?: string;
}

export function getTravelSurpriseData(state: CampaignStateSnapshot): TravelSurpriseData | null {
  if (!state) return null;
  const notice = (state as { lastTravelSurprise?: TravelSurpriseNotice }).lastTravelSurprise;
  const activeRun = (state as { activeScenarioRun?: unknown }).activeScenarioRun;
  if (!notice || !activeRun) return null;
  return {
    title: notice.title || "Travel Surprise",
    categoryLabel: label(notice.category || "surprise"),
    prompt: notice.prompt || "",
    areaLabel: notice.area || "Area",
    repeatLabel: notice.repeated ? `Revisit ${notice.visitCount || 2}` : "New route",
    locationLabel: notice.location || ""
  };
}

interface PendingBattleResult {
  readonly result?: string;
  readonly encounterId?: string;
  readonly rounds?: number;
  readonly loot?: readonly LootDrop[];
  readonly defeatOps?: readonly unknown[];
  readonly drawOps?: readonly unknown[];
  readonly badEndingOps?: readonly unknown[];
  readonly badEndingOnDefeat?: boolean;
  readonly defeatOutcome?: string;
  readonly defeatMode?: string;
  readonly defeatNoRecovery?: boolean;
}

export function getCombatResultData(state: CampaignStateSnapshot): CombatResultData | null {
  if (!state) return null;
  const result = (state as { pendingBattleResult?: PendingBattleResult }).pendingBattleResult;
  if (!result) return null;
  return {
    resultLabel: result.result || "resolved",
    encounterId: result.encounterId || "",
    rounds: result.rounds || 0,
    lootHtml: renderLootSummary(result.loot || []),
    consequenceNoticeHtml: renderCombatConsequenceNotice(
      result,
      state as { pendingBattle?: PendingBattleLike }
    )
  };
}

interface LastCombatResult {
  readonly result?: string;
  readonly encounterId?: string;
  readonly label?: string;
  readonly rounds?: number;
  readonly summary?: string;
  readonly combatPulse?: CombatPulse;
  readonly loot?: readonly LootDrop[];
}

export function getLastCombatResultData(state: CampaignStateSnapshot): LastCombatResultData | null {
  if (!state) return null;
  const result = (state as { lastCombatResult?: LastCombatResult }).lastCombatResult;
  if (!result) return null;
  return {
    resultLabel: result.result || "resolved",
    label: result.encounterId || result.label || "Campaign battle",
    rounds: result.rounds || 0,
    summary: result.summary || "",
    pulseHtml: renderCombatPulseSummary(result.combatPulse) || "",
    lootHtml: renderLootSummary(result.loot || [])
  };
}

// Phase H.4 inline port — pure state read, no closure-private deps.
interface LastScenarioReport {
  readonly outcome?: string;
  readonly danger?: number;
  readonly usedCampRests?: number;
  readonly eventsUsed?: number;
  readonly completedBattles?: readonly unknown[];
  readonly diff?: unknown;
}

export function getLastReportData(state: CampaignStateSnapshot): LastReportData | null {
  if (!state) return null;
  const report = (state as { lastScenarioReport?: LastScenarioReport }).lastScenarioReport;
  if (!report) return null;
  return {
    outcome: report.outcome || "",
    danger: report.danger || 0,
    campsUsed: report.usedCampRests || 0,
    eventsUsed: report.eventsUsed || 0,
    battlesCount: (report.completedBattles || []).length,
    diffJson: JSON.stringify(report.diff, null, 2)
  };
}

export function getPendingBattleData(state: CampaignStateSnapshot): PendingBattleData | null {
  if (!state) return null;
  const battle = (state as { pendingBattle?: PendingBattleLike }).pendingBattle;
  if (!battle) return null;
  const isRandom = battle.source === "random";
  const canRun = !!(battle.encounterId || battle.battleSetId || (battle.monsterIds || []).length);
  return {
    sourceLabel: battleSourceLabel(battle),
    label: battle.label || battle.encounterId || "",
    subLabel: battle.encounterId || battle.battleSetId || (battle.monsterIds || []).join(", ") || "",
    autoMapLabel: battle.battleMap?.theme ? label(battle.battleMap.theme) : "",
    contextHtml: renderPendingBattleContext(state, battle) || "",
    partySummaryHtml: renderBattlePartySummary(state as { party?: Record<string, PartyMemberLike> }) || "",
    canRun,
    isRandom
  };
}

// Phase H.4 inline port — pure state + scenario read. The questRunTask
// data builder (`buildQuestRunTask`) reads `ScenarioRunner.findNode/findCell`
// + `CampaignState.getScenarioMapById/getActiveMap` against the active
// scenario map. This is the TS home of the old closure-private
// `_renderQuestRunTask` / `_questTaskDescriptor` / `_questCellFromRef`.
interface ScenarioSummaryRunInput {
  readonly scenarioId?: string;
  readonly questId?: string;
  readonly travelMode?: string;
  readonly currentCell?: { readonly x?: number; readonly y?: number };
  readonly currentNode?: string;
  readonly danger?: number;
  readonly dangerMax?: number;
  readonly usedCampRests?: number;
  readonly eventsUsed?: number;
  readonly randomBattlesUsed?: number;
  readonly limits?: { readonly campRests?: number; readonly events?: number; readonly randomBattles?: number };
  readonly movingThreats?: readonly unknown[];
  readonly objectiveState?: ObjectiveStateInput | null;
}

interface ObjectiveStateInput extends ObjectiveLike {
  readonly completed?: boolean;
  readonly label?: string;
}

interface ScenarioRecord {
  readonly name?: string;
  readonly generated?: boolean;
}

// The scenario fields the quest-run-task descriptor reads, beyond the
// `ScenarioRecord` display fields above. `getScenarioById` returns a
// record carrying these too (mapId / successConditions / source.questId).
interface ScenarioForTask {
  readonly mapId?: string;
  readonly source?: { readonly questId?: string };
  readonly successConditions?: ReadonlyArray<{
    readonly type?: string;
    readonly nodeId?: string;
    readonly x?: number;
    readonly y?: number;
  }>;
}

interface MapCellLike {
  readonly id?: string;
  readonly x?: number;
  readonly y?: number;
  readonly title?: string;
}
interface ScenarioMapLike {
  readonly cells?: ReadonlyArray<MapCellLike>;
}
interface MapNodeLike {
  readonly title?: string;
}

interface QuestForTask {
  readonly title?: string;
  readonly id?: string;
  readonly status?: string;
  readonly objectives?: readonly QuestObjective[];
  readonly linkedMapNodes?: readonly string[];
  readonly linkedMapCells?: readonly unknown[];
  readonly [key: string]: unknown;
}

interface CampaignStateSurface {
  readonly getScenarioById?: (id: string) => ScenarioRecord | null | undefined;
  readonly getScenarioMapById?: (id: string) => ScenarioMapLike | null | undefined;
  readonly getActiveMap?: () => ScenarioMapLike | null | undefined;
}

interface ScenarioRunnerSurface {
  readonly findNode?: (map: unknown, nodeId: string) => MapNodeLike | null | undefined;
  readonly findCell?: (map: unknown, x: number, y: number) => MapCellLike | null | undefined;
}

interface SummaryCjs {
  readonly CampaignState?: CampaignStateSurface;
  readonly ScenarioRunner?: ScenarioRunnerSurface;
}

function summaryCjs(): SummaryCjs {
  return (window as unknown as { CJS?: SummaryCjs }).CJS ?? {};
}

// `_questCellFromRef` — resolves a linked-cell reference (array pair,
// `{id}` / `{x,y}` object, or cell id string) against the scenario map.
function questCellFromRef(map: ScenarioMapLike | null, ref: unknown): MapCellLike | null {
  if (!map || ref == null) return null;
  const Runner = summaryCjs().ScenarioRunner;
  if (Array.isArray(ref)) {
    return Runner?.findCell?.(map, Number(ref[0]), Number(ref[1])) || { x: Number(ref[0]), y: Number(ref[1]) };
  }
  if (typeof ref === "object") {
    const r = ref as { id?: string; x?: number; y?: number };
    if (r.id) return (map.cells || []).find((c) => c.id === r.id) || null;
    if (r.x != null && r.y != null) return Runner?.findCell?.(map, r.x, r.y) || r;
  }
  if (typeof ref === "string") return (map.cells || []).find((c) => c.id === ref) || null;
  return null;
}

// `_questTaskDescriptor` — the next objective's display label + the map
// location (node title / cell coords) it routes to. Only `label` +
// `location` are consumed by the render path (the launcher keeps its own
// fuller copy in `action-handlers/quest-launcher.ts`).
function questTaskDescriptor(
  quest: QuestForTask,
  scenario: ScenarioForTask | null
): { readonly label: string; readonly location: string } {
  const c = summaryCjs();
  const CS = c.CampaignState;
  const Runner = c.ScenarioRunner;
  const objectives = quest.objectives || [];
  const objective = questNextObjective(quest);
  const objectiveIndex = Math.max(0, objectives.findIndex((entry) => entry.id === objective?.id));
  const map = (scenario?.mapId && CS?.getScenarioMapById?.(scenario.mapId)) || CS?.getActiveMap?.() || null;
  const baseLabel = objective?.label || quest.title || "Quest task";

  const linkedNodes = Array.isArray(quest.linkedMapNodes) ? quest.linkedMapNodes : null;
  const nodeId = linkedNodes ? (linkedNodes[objectiveIndex] || linkedNodes[linkedNodes.length - 1]) : null;
  if (nodeId) {
    const node = Runner?.findNode?.(map, nodeId);
    return { label: baseLabel, location: node?.title || label(nodeId) };
  }

  const linkedCells = Array.isArray(quest.linkedMapCells) ? quest.linkedMapCells : [];
  const cellRef = linkedCells[objectiveIndex] || linkedCells[linkedCells.length - 1] || null;
  const cell = questCellFromRef(map, cellRef);
  if (cell) {
    return { label: baseLabel, location: cell.title || `${cell.x},${cell.y}` };
  }

  const success = (scenario?.successConditions || [])[0];
  if (success?.type === "reach_node") {
    const node = Runner?.findNode?.(map, String(success.nodeId));
    return { label: baseLabel, location: node?.title || label(String(success.nodeId)) };
  }
  if (success?.type === "reach_cell") {
    const found = Runner?.findCell?.(map, Number(success.x), Number(success.y));
    return { label: baseLabel, location: found?.title || `${success.x},${success.y}` };
  }
  return { label: baseLabel, location: "" };
}

// `_renderQuestRunTask` — the scenario-task strip in the ScenarioSummary
// panel. Returns null when the run isn't quest-bound or the quest is
// missing; resolved quests get a "Quest Resolved" card.
function buildQuestRunTask(
  state: CampaignStateSnapshot,
  run: ScenarioSummaryRunInput,
  scenario: (ScenarioForTask & ScenarioRecord) | null
): QuestRunTaskData | null {
  const questId = activeRunQuestId(run, scenario);
  const quests = (state as { quests?: Record<string, QuestForTask> }).quests;
  const quest = questId ? quests?.[questId] : null;
  if (!quest) return null;
  if (isQuestResolved(quest)) {
    return { kind: "resolved", title: String(quest.title || quest.id || "") };
  }
  const objectives = quest.objectives || [];
  const nextObjective = questNextObjective(quest);
  const idx = Math.max(0, objectives.findIndex((entry) => entry.id === nextObjective?.id));
  const phase = objectives.length ? `Phase ${idx + 1}/${objectives.length}` : "Quest Task";
  const task = questTaskDescriptor(quest, scenario);
  return {
    kind: "task",
    phase,
    label: nextObjective?.label || task.label || "Follow the quest route",
    location: task.location || "Use the map branches to resolve it"
  };
}

export function getScenarioSummaryData(state: CampaignStateSnapshot): ScenarioSummaryData | null {
  if (!state) return null;
  const typed = state as { activeScenarioRun?: ScenarioSummaryRunInput };
  const run = typed.activeScenarioRun;
  if (!run) return { hasRun: false };
  const c = summaryCjs();
  const scenario = run.scenarioId ? c.CampaignState?.getScenarioById?.(run.scenarioId) ?? null : null;
  const location =
    run.travelMode === "grid_map" && run.currentCell
      ? `${run.currentCell.x},${run.currentCell.y}`
      : run.currentNode || "-";
  const objective = run.objectiveState || null;
  return {
    hasRun: true,
    name: scenario?.name || run.scenarioId || "Run",
    questPill: runQuestPill(state as Parameters<typeof runQuestPill>[0], run, scenario as Parameters<typeof runQuestPill>[2]),
    isGrid: run.travelMode === "grid_map",
    location,
    danger: run.danger ?? 0,
    dangerMax: run.dangerMax ?? 0,
    campsUsed: run.usedCampRests ?? 0,
    campsMax: run.limits?.campRests ?? 0,
    eventsUsed: run.eventsUsed ?? 0,
    eventsMax: run.limits?.events ?? 0,
    battlesUsed: run.randomBattlesUsed ?? 0,
    battlesMax: run.limits?.randomBattles ?? 0,
    roamerCount: (run.movingThreats || []).length,
    objective: objective
      ? {
          completed: !!objective.completed,
          visible: objective.visible !== false,
          label: objective.label || "Reach the target",
          meta: scenarioObjectiveMeta(run, objective)
        }
      : null,
    questRunTask: buildQuestRunTask(state, run, scenario as (ScenarioForTask & ScenarioRecord) | null),
    hasGeneratedScenario: !!scenario?.generated
  };
}

// Phase H.4 inline port — typed snapshot for the active sequence panel.
// Discriminated by node type so the JSX `SequenceNodePanel` doesn't
// need to reach back into CampaignSequences / CampaignAlignment.
interface SequenceActiveInput {
  readonly scope?: SequenceScope;
  readonly sequenceId?: string;
  readonly title?: string;
  readonly nodeId?: string;
  readonly applyConsequences?: boolean;
}

interface SequenceNodeInput {
  readonly type?: string;
  readonly speaker?: string;
  readonly text?: string;
  readonly prompt?: string;
  readonly summary?: string;
  readonly title?: string;
  readonly label?: string;
  readonly next?: string;
  readonly stat?: string;
  readonly difficulty?: number | string;
  readonly dc?: number | string;
  readonly encounterId?: string;
  readonly battleSetId?: string;
  readonly scenarioId?: string;
  readonly actor?: string;
  readonly minigame?: { readonly gameId?: string; readonly difficulty?: number | string };
  readonly minigameId?: string;
  readonly gameId?: string;
  readonly tags?: readonly string[];
  readonly choices?: readonly SequenceChoiceInput[];
}

interface SequenceChoiceInput {
  readonly id?: string;
  readonly label?: string;
  readonly summary?: string;
  readonly next?: string;
  readonly alignment?: unknown;
  readonly karma?: unknown;
  readonly consequencePoints?: unknown;
  readonly alignmentDelta?: unknown;
}

interface ChoiceEligibility {
  readonly ok?: boolean;
  readonly hidden?: boolean;
  readonly blockers?: readonly string[];
}

interface CampaignSequencesSurface {
  readonly active?: (state: unknown) => SequenceActiveInput | null | undefined;
  readonly cachedSequence?: (sequenceId: string, world: string | undefined) => unknown;
  readonly storyMeta?: (entry: unknown, world: string | undefined) => { chapterLabel?: string } | null | undefined;
  readonly findNode?: (sequence: unknown, nodeId: string) => SequenceNodeInput | null | undefined;
  readonly choiceEligibility?: (
    choice: unknown,
    node: unknown,
    state: unknown,
    options: { active?: unknown }
  ) => ChoiceEligibility | null | undefined;
}

interface SequenceVnSurface {
  readonly isEnabled?: () => boolean;
}

interface AlignmentSurface {
  readonly describeDeltas?: (delta: unknown) => string;
}

interface SequenceCjs {
  readonly CampaignSequences?: CampaignSequencesSurface;
  readonly CampaignSequenceVN?: SequenceVnSurface;
  readonly CampaignAlignment?: AlignmentSurface;
}

function sequenceCjs(): SequenceCjs {
  return (window as unknown as { CJS?: SequenceCjs }).CJS ?? {};
}

function sequenceNodeMetaBits(node: SequenceNodeInput = {}): readonly string[] {
  const bits: string[] = [];
  if (node.stat) bits.push(`${node.stat} DC ${node.difficulty || node.dc || "?"}`);
  if (node.encounterId) bits.push(String(node.encounterId));
  if (node.battleSetId) bits.push(String(node.battleSetId));
  if (node.scenarioId) bits.push(`Scenario: ${label(node.scenarioId)}`);
  const gameId = node.minigame?.gameId || node.minigameId || node.gameId;
  const difficulty = node.minigame?.difficulty || node.difficulty;
  if (gameId) bits.push(`Mini-Game: ${label(gameId)} Lv ${difficulty || 1}`);
  if (node.tags?.length) bits.push(node.tags.map((t) => label(t)).join(", "));
  return bits;
}

function sequenceNodeSnapshot(
  node: SequenceNodeInput,
  active: SequenceActiveInput,
  state: CampaignStateSnapshot
): SequenceNodeData {
  const Seq = sequenceCjs().CampaignSequences;
  const type = String(node.type || "narration").toLowerCase();
  const replay = active.applyConsequences === false;
  const speaker = node.speaker || "";
  const text = node.text || node.prompt || node.summary || node.title || "";
  const meta = sequenceNodeMetaBits(node);
  if (type === "choice") {
    const choices = (node.choices || [])
      .map((choice) => {
        const eligibility = Seq?.choiceEligibility?.(choice, node, state, { active }) || {
          ok: true,
          blockers: [],
          hidden: false
        };
        if (eligibility.hidden) return null;
        const locked = !eligibility.ok;
        const alignmentHint = sequenceCjs().CampaignAlignment?.describeDeltas?.(
          choice.alignment ?? choice.karma ?? choice.consequencePoints ?? choice.alignmentDelta
        );
        const hint = locked
          ? (eligibility.blockers || []).join(" | ")
          : choice.summary || alignmentHint || choice.next || "";
        return {
          id: String(choice.id || ""),
          label: String(choice.label || choice.id || ""),
          hint: String(hint || ""),
          locked
        };
      })
      .filter((entry): entry is { id: string; label: string; hint: string; locked: boolean } => entry !== null);
    return { type: "choice", speaker, text: text || "Choose a path.", choices };
  }
  if (type === "stat_check") {
    return {
      type: "stat_check",
      text: text || `${node.actor || "Party"} checks ${node.stat || "?"} vs ${node.difficulty || node.dc || "?"}.`,
      meta
    };
  }
  if (type === "combat") {
    return {
      type: "combat",
      text: text || node.label || "Combat encounter",
      meta,
      replay,
      encounterId: String(node.encounterId || ""),
      battleSetId: String(node.battleSetId || "")
    };
  }
  if (type === "minigame") {
    const gameId = node.minigame?.gameId || node.minigameId || node.gameId || "";
    return {
      type: "minigame",
      text: text || `${label(gameId || "Mini-game")} challenge`,
      meta,
      replay,
      gameId: String(gameId),
      gameLabel: gameId ? label(gameId) : ""
    };
  }
  if (type === "scenario") {
    const activeRun = (state as { activeScenarioRun?: { scenarioId?: string } } | null | undefined)?.activeScenarioRun;
    const scenarioId = String(node.scenarioId || "");
    const scenarioOpen = !!(activeRun && activeRun.scenarioId === scenarioId);
    return {
      type: "scenario",
      text: text || node.label || node.title || "Exploration run",
      meta,
      replay,
      scenarioId,
      scenarioOpen
    };
  }
  if (type === "end") {
    return { type: "end", text: text || "This sequence is ready to close." };
  }
  return {
    type: "default",
    kind: type,
    speaker,
    text,
    meta,
    replay,
    next: String(node.next || "")
  };
}

export function getActiveSequenceData(
  state: CampaignStateSnapshot,
  scopes?: readonly SequenceScope[]
): ActiveSequenceData | null {
  if (!state) return null;
  const c = sequenceCjs();
  const Seq = c.CampaignSequences;
  const active = Seq?.active?.(state);
  if (!active) return null;
  if (scopes && active.scope && !scopes.includes(active.scope)) return null;
  const world = (state as { currentWorld?: string }).currentWorld;
  const sequence = active.sequenceId ? Seq?.cachedSequence?.(active.sequenceId, world) || null : null;
  const meta = Seq?.storyMeta?.(sequence || active.sequenceId, world) || {};
  const node = sequence ? Seq?.findNode?.(sequence, active.nodeId || "") : null;
  const vnActive = !!(c.CampaignSequenceVN?.isEnabled?.() && active);
  return {
    title: active.title || active.sequenceId || "",
    scopeLabel: label(active.scope || "sequence"),
    chapterLabel: meta.chapterLabel || "",
    nodeId: active.nodeId || "",
    replayMode: active.applyConsequences === false,
    vnActive,
    node: node ? sequenceNodeSnapshot(node, active, state) : null
  };
}
