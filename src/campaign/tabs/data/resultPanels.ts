// resultPanels.ts — Phase G typed shapes for the shared EventResult
// and Oracle panels used across EventLog, EventTab, Overview, and
// Maps tabs.
//
// Phase H.4 — pure-state-read data builders move inline here. The
// helpers that emit HTML strings (`renderLootSummary`,
// `renderCombatConsequenceNotice`, etc.) are ported alongside in the
// "HTML helpers" section below.

import { esc, lootLine, label } from "../../util/cui-utils";
import { renderInlinePurpose } from "../../util/cui-controls";
import type { CampaignStateSnapshot } from "../../store";
import type { QuestPillData } from "./scenarioShared";

// HubTab module (still-JS bridged island) renders the consequence
// preview / flavor trail HTML the side panels embed.
interface HubTabSurface {
  readonly renderConsequencePreview?: (
    ops: readonly unknown[],
    options?: { title?: string; emptyTitle?: string; emptyText?: string }
  ) => string;
}

function hubTab(): HubTabSurface | undefined {
  return (window as unknown as { CJS?: { CampaignUIInternal?: { HubTab?: HubTabSurface } } })
    .CJS?.CampaignUIInternal?.HubTab;
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
  readonly questRunTaskHtml: string;
  readonly hasGeneratedScenario: boolean;
}

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

interface Bridge {
  readonly getEventResultData: (state?: CampaignStateSnapshot) => EventResultData | null;
  readonly getSoloNoticeData: (state?: CampaignStateSnapshot) => SoloNoticeData | null;
  readonly getScenarioSummaryData: (state?: CampaignStateSnapshot) => ScenarioSummaryData | null;
  readonly getActiveSequenceData: (
    state?: CampaignStateSnapshot,
    scopes?: readonly SequenceScope[] | null
  ) => ActiveSequenceData | null;
}

interface Cjs {
  readonly CampaignUI?: Bridge;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

export function getEventResultData(state: CampaignStateSnapshot): EventResultData | null {
  return cjs().CampaignUI?.getEventResultData(state) ?? null;
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

export function getSoloNoticeData(state: CampaignStateSnapshot): SoloNoticeData | null {
  return cjs().CampaignUI?.getSoloNoticeData(state) ?? null;
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

export function getScenarioSummaryData(state: CampaignStateSnapshot): ScenarioSummaryData | null {
  return cjs().CampaignUI?.getScenarioSummaryData(state) ?? null;
}

export function getActiveSequenceData(
  state: CampaignStateSnapshot,
  scopes?: readonly SequenceScope[]
): ActiveSequenceData | null {
  return cjs().CampaignUI?.getActiveSequenceData(state, scopes ?? null) ?? null;
}
