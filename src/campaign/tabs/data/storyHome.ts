// storyHome.ts — Phase F bridge for the Story Home tab.

import type { CampaignStateSnapshot } from "../../store";

export interface StoryArcStats {
  readonly completed: number;
  readonly defaulted: number;
  readonly manualNotes: number;
  readonly phase: number;
}

export interface StoryHomeData {
  readonly themeClassName: string;
  readonly themeStyleVars: Readonly<Record<string, string>>;
  readonly chapterPartsCount: number;
  readonly currentChapter: string | number;
  readonly currentArc: StoryArcStats;
  readonly hasActiveRun: boolean;
  readonly vnHeroHtml: string;
  readonly chapterTreeHtml: string;
  readonly choiceConsequenceHtml: string;
  readonly aiStoryContextHtml: string;
  readonly storyPipelineHtml: string;
  readonly syncSummaryHtml: string;
}

interface Bridge {
  readonly getStoryHomeData: (state?: CampaignStateSnapshot) => StoryHomeData | null;
}

interface Cjs {
  readonly CampaignUI?: Bridge;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

export function getStoryHomeData(state: CampaignStateSnapshot): StoryHomeData | null {
  return cjs().CampaignUI?.getStoryHomeData(state) ?? null;
}
