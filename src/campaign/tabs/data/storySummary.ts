// storySummary.ts — Phase F typed bridge for the Story Summary tab.

import type { CampaignStateSnapshot } from "../../store";

export interface StoryPartEntry {
  readonly title: string;
  readonly chapterLabel: string;
  readonly partLabel: string;
  readonly modeLabel: string;
  readonly result: string;
  readonly timestamp: string;
  readonly summaryText: string;
  readonly routeText: string;
  readonly syncSummary: readonly string[];
}

export interface ManualNote {
  readonly title: string;
  readonly timestamp: string;
  readonly text: string;
}

export interface RevealedFact {
  readonly title: string;
  readonly text: string;
}

export interface HeldBeat {
  readonly title: string;
  readonly status: string;
  readonly text: string;
}

export interface StorySummaryData {
  readonly storyParts: readonly StoryPartEntry[];
  readonly manual: readonly ManualNote[];
  readonly facts: readonly RevealedFact[];
  readonly queue: readonly HeldBeat[];
}

interface Bridge {
  readonly getStorySummaryData: (state?: CampaignStateSnapshot) => StorySummaryData | null;
}

interface Cjs {
  readonly CampaignUI?: Bridge;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

export function getStorySummaryData(state: CampaignStateSnapshot): StorySummaryData | null {
  return cjs().CampaignUI?.getStorySummaryData(state) ?? null;
}
