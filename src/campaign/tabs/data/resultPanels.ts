// resultPanels.ts — Phase G typed shapes for the shared EventResult
// and Oracle panels used across EventLog, EventTab, Overview, and
// Maps tabs.

import type { CampaignStateSnapshot } from "../../store";

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
  readonly questPillHtml: string;
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
  readonly getOracleData: (state?: CampaignStateSnapshot) => OracleData | null;
  readonly getSoloNoticeData: (state?: CampaignStateSnapshot) => SoloNoticeData | null;
  readonly getTravelSurpriseData: (state?: CampaignStateSnapshot) => TravelSurpriseData | null;
  readonly getCombatResultData: (state?: CampaignStateSnapshot) => CombatResultData | null;
  readonly getLastCombatResultData: (state?: CampaignStateSnapshot) => LastCombatResultData | null;
  readonly getLastReportData: (state?: CampaignStateSnapshot) => LastReportData | null;
  readonly getPendingBattleData: (state?: CampaignStateSnapshot) => PendingBattleData | null;
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

export function getOracleData(state: CampaignStateSnapshot): OracleData | null {
  return cjs().CampaignUI?.getOracleData(state) ?? null;
}

export function getSoloNoticeData(state: CampaignStateSnapshot): SoloNoticeData | null {
  return cjs().CampaignUI?.getSoloNoticeData(state) ?? null;
}

export function getTravelSurpriseData(state: CampaignStateSnapshot): TravelSurpriseData | null {
  return cjs().CampaignUI?.getTravelSurpriseData(state) ?? null;
}

export function getCombatResultData(state: CampaignStateSnapshot): CombatResultData | null {
  return cjs().CampaignUI?.getCombatResultData(state) ?? null;
}

export function getLastCombatResultData(state: CampaignStateSnapshot): LastCombatResultData | null {
  return cjs().CampaignUI?.getLastCombatResultData(state) ?? null;
}

export function getLastReportData(state: CampaignStateSnapshot): LastReportData | null {
  return cjs().CampaignUI?.getLastReportData(state) ?? null;
}

export function getPendingBattleData(state: CampaignStateSnapshot): PendingBattleData | null {
  return cjs().CampaignUI?.getPendingBattleData(state) ?? null;
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
