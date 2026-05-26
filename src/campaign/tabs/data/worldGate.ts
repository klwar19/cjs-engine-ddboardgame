// worldGate.ts — Phase F bridge for the World Gate tab.

import type { CampaignStateSnapshot } from "../../store";

export interface WorldGatePressureChip {
  readonly id: string;
  readonly title: string;
  readonly value: number;
}

export interface WorldGateAction {
  readonly action: string;
  readonly label: string;
  readonly hint: string;
  readonly kind: string;
  readonly data: Readonly<Record<string, string>>;
}

export interface WorldGateCardEntry {
  readonly worldId: string;
  readonly title: string;
  readonly kicker: string;
  readonly summary: string;
  readonly features: readonly string[];
  readonly bannerImageUrl: string;
  readonly isCurrent: boolean;
  readonly status: string;
  readonly mapCount: number;
  readonly activitiesCount: number;
  readonly activityTypeLabels: readonly string[];
  readonly devNote: string;
  readonly primaryAction: WorldGateAction;
  readonly secondaryActions: readonly WorldGateAction[];
}

export interface WorldGateData {
  readonly currentWorldName: string;
  readonly pressures: readonly WorldGatePressureChip[];
  readonly cards: readonly WorldGateCardEntry[];
}

interface Bridge {
  readonly getWorldGateData: (state?: CampaignStateSnapshot) => WorldGateData | null;
}

interface Cjs {
  readonly CampaignUI?: Bridge;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

export function getWorldGateData(state: CampaignStateSnapshot): WorldGateData | null {
  return cjs().CampaignUI?.getWorldGateData(state) ?? null;
}
