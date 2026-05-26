// worldGate.ts — Phase F bridge for the World Gate tab.

import type { CampaignStateSnapshot } from "../../store";

export interface WorldGateCardEntry {
  readonly worldId: string;
  readonly cardHtml: string;
}

export interface WorldGateData {
  readonly currentWorldName: string;
  readonly pressureStripHtml: string;
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
