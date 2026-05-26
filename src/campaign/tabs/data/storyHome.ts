// storyHome.ts — Phase F bridge for the Story Home tab.

import type { CampaignStateSnapshot } from "../../store";
import type { StoryVnHeroData } from "./storyShared";

export interface StoryArcStats {
  readonly completed: number;
  readonly defaulted: number;
  readonly manualNotes: number;
  readonly phase: number;
}

// G.12 — typed shapes for the Story Home sub-panels.
export interface ChapterTreeNode {
  readonly id: string;
  readonly partLabel: string;
  readonly title: string;
  readonly routeLabel: string;
  readonly stateLabel: string;
  readonly stateClass: string;
  readonly summaryShort: string;
  readonly lockReasons: string;
  readonly nextCandidates: readonly string[];
  readonly blocked: boolean;
  readonly locked: boolean;
  readonly replayOnly: boolean;
  readonly depth: number;
  readonly children: readonly ChapterTreeNode[];
}

export interface ChapterTreeData {
  readonly routeText: string;
  readonly routeCount: number;
  readonly roots: readonly ChapterTreeNode[];
}

export interface AlignmentAxis {
  readonly id: string;
  readonly label: string;
  readonly currentValue: number;
  readonly worldValue: number;
  readonly rangeMin: number;
  readonly rangeMax: number;
}

export interface AlignmentRecentEntry {
  readonly label: string;
  readonly description: string;
}

export interface AlignmentPotentialEntry {
  readonly label: string;
  readonly description: string;
  readonly summary: string;
  readonly reachable: boolean;
}

export interface ChoiceConsequenceData {
  readonly axes: readonly AlignmentAxis[];
  readonly recent: readonly AlignmentRecentEntry[];
  readonly potential: readonly AlignmentPotentialEntry[];
  readonly potentialCount: number;
}

export interface AiStoryContextLine {
  readonly path: string;
  readonly statusLabel: string;
}

export interface AiStoryContextData {
  readonly loaded: number;
  readonly total: number;
  readonly staticLines: readonly AiStoryContextLine[];
  readonly indexLines: readonly AiStoryContextLine[];
  readonly arcsCount: number;
  readonly manualCount: number;
  readonly branchCount: number;
}

export interface StoryPipelineData {
  readonly anchorTitle: string;
  readonly nextCandidates: readonly string[];
}

export interface SyncSummaryData {
  readonly title: string;
  readonly sourcePill: string;
  readonly lines: readonly string[];
}

export interface StoryHomeData {
  readonly themeClassName: string;
  readonly themeStyleVars: Readonly<Record<string, string>>;
  readonly chapterPartsCount: number;
  readonly currentChapter: string | number;
  readonly currentArc: StoryArcStats;
  readonly hasActiveRun: boolean;
  readonly vnHero: StoryVnHeroData;
  readonly chapterTree: ChapterTreeData | null;
  readonly choiceConsequence: ChoiceConsequenceData | null;
  readonly aiStoryContext: AiStoryContextData;
  readonly storyPipeline: StoryPipelineData;
  readonly syncSummary: SyncSummaryData;
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
