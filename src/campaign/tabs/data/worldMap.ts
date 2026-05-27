// worldMap.ts — K.3 bridge for the World Activities tab. Calls into the
// sibling CampaignWorldMap module directly (the same module the World Map
// tab wrapper already reaches), keeping the activity / condition / cost
// logic where it lives. The travel-map SVG ports separately.

import type { CampaignStateSnapshot } from "../../store";

export interface WorldPressure {
  readonly id: string;
  readonly title: string;
  readonly value: number;
}

export interface WorldActivityCard {
  readonly id: string;
  readonly title: string;
  readonly typePill: string;
  readonly summary: string;
  readonly rewardText: string;
  readonly costText: string;
  readonly ready: boolean;
  readonly buttonLabel: string;
  readonly disabledTitle: string;
}

export interface WorldActivityGroup {
  readonly type: string;
  readonly label: string;
  readonly activities: readonly WorldActivityCard[];
}

export interface WorldJournalEntry {
  readonly title: string;
  readonly sub: string;
  readonly text: string;
}

export interface WorldActivitiesData {
  readonly worldName: string;
  readonly locationName: string;
  readonly pressures: readonly WorldPressure[];
  readonly groups: readonly WorldActivityGroup[];
  readonly journal: readonly WorldJournalEntry[];
}

interface WorldMapModule {
  readonly getActivitiesData: (state?: CampaignStateSnapshot) => WorldActivitiesData | null;
}

interface Cjs {
  readonly CampaignWorldMap?: WorldMapModule;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

export function getWorldActivitiesData(state: CampaignStateSnapshot): WorldActivitiesData | null {
  return cjs().CampaignWorldMap?.getActivitiesData?.(state) ?? null;
}
