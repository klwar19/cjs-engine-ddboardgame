// overview.ts — Phase F / G bridge for the Overview (Town) tab.
//
// Phase H.4 — `getTownSnapshotData` and `getTownRollFloatData` ported
// inline. The HubTab module (cui-hub-tab.js — still-JS bridged island)
// still owns `openRumors` and `consequenceSummary`; the TS port reaches
// them via the same `window.CJS.CampaignUIInternal.HubTab` surface the
// JS originals used.

import { label } from "../../util/cui-utils";
import { isQuestResolved, pendingSoloHookCard, type SoloHookStateShape } from "../../util/state-helpers";
import { rumorRowData, type RumorRowData } from "./hub";
import type { CampaignStateSnapshot } from "../../store";

// G.16 — typed shapes for Town Snapshot + Roll Float panels.
export interface TownStat {
  readonly id: string;
  readonly label: string;
  readonly value: number;
}

export type TownKpiTone = "" | "is-risk" | "is-plot";

export interface TownKpi {
  readonly count: number;
  readonly label: string;
  readonly tone: TownKpiTone;
}

export interface TownLocation {
  readonly id: string;
  readonly name: string;
  readonly detail: string;
}

export interface TownPressureItem {
  readonly id: string;
  readonly label: string;
}

export interface TownSnapshotData {
  readonly hubName: string;
  readonly hubDescription: string;
  readonly moodLabel: string;
  readonly stats: readonly TownStat[];
  readonly kpis: readonly TownKpi[];
  readonly problems: readonly TownPressureItem[];
  readonly rumors: readonly RumorRowData[];
  readonly locations: readonly TownLocation[];
}

export interface TownRollPending {
  readonly title: string;
  readonly toneLabel: string;
  readonly toneClass: string;
  readonly short: string;
  readonly hasOps: boolean;
}

export interface TownRollFloatData {
  readonly pending: TownRollPending | null;
}

interface CampaignHubDefinition {
  readonly id?: string;
  readonly name?: string;
  readonly description?: string;
  readonly locations?: ReadonlyArray<{
    readonly id?: string;
    readonly name?: string;
    readonly notes?: string;
    readonly type?: string;
  }>;
}

interface CampaignHubState {
  readonly mood?: string;
  readonly security?: number;
  readonly prosperity?: number;
  readonly warmth?: number;
  readonly weirdness?: number;
  readonly activeProblems?: readonly string[];
  readonly [key: string]: unknown;
}

interface RumorInput {
  readonly id?: string;
  readonly text?: string;
  readonly status?: string;
  readonly canonRisk?: string;
}

interface CampaignHubSurface {
  readonly getCurrentHubDefinition?: () => CampaignHubDefinition | null | undefined;
  readonly getCurrentHubState?: () => CampaignHubState | null | undefined;
}

interface HubTabSurface {
  readonly openRumors?: (hubState: CampaignHubState) => readonly RumorInput[];
  readonly consequenceSummary?: (
    ops: readonly unknown[],
    options?: { hasText?: boolean }
  ) => { tone?: string; label?: string; short?: string };
  readonly cardChoiceOps?: (card: unknown) => readonly unknown[];
}

interface CampaignStateModule {
  readonly getActiveQuestChains?: () => readonly unknown[];
}

interface OverviewCjs {
  readonly CampaignHub?: CampaignHubSurface;
  readonly CampaignUIInternal?: { HubTab?: HubTabSurface };
  readonly CampaignState?: CampaignStateModule;
}

function cjs(): OverviewCjs {
  return (window as unknown as { CJS?: OverviewCjs }).CJS ?? {};
}

interface CampaignStateForTown extends SoloHookStateShape {
  readonly quests?: Record<string, { status?: string; chainTemplateId?: string }>;
}

export function getTownSnapshotData(state: CampaignStateSnapshot): TownSnapshotData | null {
  if (!state) return null;
  const c = cjs();
  const hub = c.CampaignHub?.getCurrentHubDefinition?.() || {};
  const hubState = c.CampaignHub?.getCurrentHubState?.() || {};
  const typed = state as CampaignStateForTown;
  const activeQuests = Object.values(typed.quests || {}).filter((quest) => !isQuestResolved(quest));
  const activeChains = c.CampaignState?.getActiveQuestChains?.() || [];
  const problems = hubState.activeProblems || [];
  const rumors = c.CampaignUIInternal?.HubTab?.openRumors?.(hubState) || [];
  const stats: TownStat[] = (["security", "prosperity", "warmth", "weirdness"] as const).map((stat) => ({
    id: stat,
    label: label(stat),
    value: Number((hubState as Record<string, unknown>)[stat] ?? 0)
  }));
  return {
    hubName: String(hub.name || "Town Overview"),
    hubDescription: String(hub.description || "Town phase command view."),
    moodLabel: label(hubState.mood || "neutral"),
    stats,
    kpis: [
      { count: activeQuests.length, label: "Open quests", tone: "" },
      { count: activeChains.length, label: "Quest arcs", tone: "" },
      { count: problems.length, label: "Problems", tone: problems.length ? "is-risk" : "" },
      { count: rumors.length, label: "Rumors", tone: rumors.length ? "is-plot" : "" }
    ],
    problems: problems.slice(0, 4).map((problem) => ({
      id: String(problem),
      label: label(problem)
    })),
    rumors: rumors.slice(0, 3).map((rumor) => rumorRowData(rumor, { compact: true })),
    locations: (hub.locations || []).slice(0, 5).map((loc) => ({
      id: String(loc.id || ""),
      name: String(loc.name || loc.id || ""),
      detail: String(loc.notes || label(loc.type || "location"))
    }))
  };
}

interface PendingHookFields {
  readonly id?: string;
  readonly title?: string;
  readonly name?: string;
  readonly prompt?: string;
  readonly summary?: string;
  readonly text?: string;
}

export function getTownRollFloatData(state: CampaignStateSnapshot): TownRollFloatData | null {
  if (!state) return null;
  const pending = pendingSoloHookCard(state as CampaignStateForTown) as PendingHookFields | null;
  if (!pending) return { pending: null };
  const hub = cjs().CampaignUIInternal?.HubTab;
  const ops = hub?.cardChoiceOps?.(pending) || [];
  const hasOps = ops.length > 0;
  const summary = hub?.consequenceSummary?.(ops, {
    hasText: !!(pending.prompt || pending.summary || pending.text)
  }) || { tone: "flavor", label: "flavor", short: "" };
  return {
    pending: {
      title: String(pending.title || pending.name || pending.id || ""),
      toneLabel: String(summary.label || ""),
      toneClass: `is-${summary.tone}`,
      short: String(summary.short || ""),
      hasOps
    }
  };
}

// `getAdventureLegendVisible` stays bridged — its visibility logic
// lives in campaign-ui.js's `getAdventureLegendVisible` closure and
// reads `_lastAdventureLegendShown` plus campaign profile flags.
interface Bridge {
  readonly getAdventureLegendVisible: (state?: CampaignStateSnapshot) => boolean;
}

interface CjsForLegend {
  readonly CampaignUI?: Bridge;
}

function cjsBridge(): CjsForLegend {
  return (window as unknown as { CJS?: CjsForLegend }).CJS ?? {};
}

export function getAdventureLegendVisible(state: CampaignStateSnapshot): boolean {
  return cjsBridge().CampaignUI?.getAdventureLegendVisible(state) ?? false;
}
