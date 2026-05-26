// eventLog.ts — Phase F typed bridge for the Event Log tab.
//
// `getEventLogData(state)` returns a JSON snapshot the JSX renderer
// reads. The two shared sub-panels (event result, oracle) live in
// `src/campaign/tabs/ResultPanels.tsx` and are imported by the
// Event Log JSX directly.

import type { CampaignStateSnapshot } from "../../store";

export interface EventLogEntry {
  readonly title: string;
  readonly summary: string;
  readonly scopeLabel: string;
  readonly phase: number | null;
  readonly at: string;
  readonly consequences: readonly string[];
  readonly tags: readonly string[];
}

export interface EventLogData {
  readonly entries: readonly EventLogEntry[];
  readonly totalCount: number;
  readonly oracleCount: number;
  readonly manualCount: number;
  readonly heroBackdropUrl: string | null;
}

interface CampaignUIEventLogBridge {
  readonly getEventLogData: (state?: CampaignStateSnapshot) => EventLogData | null;
}

interface Cjs {
  readonly CampaignUI?: CampaignUIEventLogBridge;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

export function getEventLogData(state: CampaignStateSnapshot): EventLogData | null {
  return cjs().CampaignUI?.getEventLogData(state) ?? null;
}
