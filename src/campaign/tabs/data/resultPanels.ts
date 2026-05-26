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

interface Bridge {
  readonly getEventResultData: (state?: CampaignStateSnapshot) => EventResultData | null;
  readonly getOracleData: (state?: CampaignStateSnapshot) => OracleData | null;
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
