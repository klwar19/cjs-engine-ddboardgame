// overview.ts — Phase F / G bridge for the Overview (Town) tab.

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
  readonly rumorRowsHtml: string;
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

interface Bridge {
  readonly getTownSnapshotData: (state?: CampaignStateSnapshot) => TownSnapshotData | null;
  readonly getTownRollFloatData: (state?: CampaignStateSnapshot) => TownRollFloatData | null;
  readonly getAdventureLegendVisible: (state?: CampaignStateSnapshot) => boolean;
}

interface Cjs {
  readonly CampaignUI?: Bridge;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

export function getTownSnapshotData(state: CampaignStateSnapshot): TownSnapshotData | null {
  return cjs().CampaignUI?.getTownSnapshotData(state) ?? null;
}

export function getTownRollFloatData(state: CampaignStateSnapshot): TownRollFloatData | null {
  return cjs().CampaignUI?.getTownRollFloatData(state) ?? null;
}

export function getAdventureLegendVisible(state: CampaignStateSnapshot): boolean {
  return cjs().CampaignUI?.getAdventureLegendVisible(state) ?? false;
}
