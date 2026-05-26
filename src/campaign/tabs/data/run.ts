// run.ts — Phase F bridge for the Maps (Current Run) tab.

import type { CampaignStateSnapshot } from "../../store";

export type RunMode = "node_map" | "grid_map" | "freeform" | "linear" | string;

export interface RunStats {
  readonly danger: number;
  readonly dangerMax: number;
  readonly campsUsed: number;
  readonly campsMax: number;
  readonly battlesUsed: number;
  readonly battlesMax: number;
  readonly eventsUsed: number;
  readonly eventsMax: number;
}

export interface SetBattle {
  readonly id: string;
  readonly label: string;
  readonly sub: string;
}

export interface FreeformPanel {
  readonly setBattles: readonly SetBattle[];
}

export interface LinearBeat {
  readonly id: string;
  readonly number: number;
  readonly label: string;
  readonly kind: string;
  readonly iconChar: string;
  readonly encounterId: string;
  readonly prompt: string;
  readonly isCurrent: boolean;
  readonly isDone: boolean;
}

export interface LinearPanel {
  readonly beats: readonly LinearBeat[];
  readonly currentIndex: number;
  readonly totalBeats: number;
  readonly allDone: boolean;
}

export interface RunData {
  readonly hasRun: boolean;
  readonly mode: RunMode | null;
  readonly scenarioName: string;
  readonly scenarioNotes: string;
  readonly questPillHtml: string;
  readonly shapePillsHtml: string;
  readonly run: RunStats | null;
  readonly freeform: FreeformPanel | null;
  readonly linear: LinearPanel | null;
  readonly travelSurpriseHtml: string;
  readonly pendingBattleHtml: string;
  readonly combatResultHtml: string;
  readonly lastCombatResultHtml: string;
}

interface Bridge {
  readonly getRunData: (state?: CampaignStateSnapshot) => RunData | null;
}

interface Cjs {
  readonly CampaignUI?: Bridge;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

export function getRunData(state: CampaignStateSnapshot): RunData | null {
  return cjs().CampaignUI?.getRunData(state) ?? null;
}
