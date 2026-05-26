// storyDirector.ts — Phase F bridge for the Story Director tab.

import type { CampaignStateSnapshot } from "../../store";
import type { StoryVnHeroData } from "./storyShared";

export type { StoryVnHeroData, StoryNextStep, StoryActionButton } from "./storyShared";

// G.11b — typed stage rail + director card. The route consequence
// preview is still an HTML bridge (`HubTab.renderConsequencePreview`)
// until K.3 ports the HubTab renderers.
export interface StoryStageEntry {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly index: number;
  readonly isActive: boolean;
  readonly isPast: boolean;
}

export interface StoryRouteChoice {
  readonly index: number;
  readonly label: string;
  readonly cardId: string;
  readonly isRecommended: boolean;
  readonly consequencePreviewHtml: string;
}

export interface StoryDirectorCardData {
  readonly id: string;
  readonly title: string;
  readonly stageLabel: string;
  readonly kindLabel: string;
  readonly canonRisk: string;
  readonly canonRiskClass: string;
  readonly prompt: string;
  readonly text: string;
  readonly summary: string;
  readonly gmNote: string;
  readonly tags: readonly string[];
  readonly routes: readonly StoryRouteChoice[];
}

interface StoryDirectorMissing {
  readonly moduleAvailable: false;
  readonly themeClassName: string;
  readonly themeStyleVars: Readonly<Record<string, string>>;
}

interface StoryDirectorNoPack {
  readonly moduleAvailable: true;
  readonly hasPack: false;
  readonly themeClassName: string;
  readonly themeStyleVars: Readonly<Record<string, string>>;
  readonly vnHero: StoryVnHeroData;
}

interface StoryDirectorReady {
  readonly moduleAvailable: true;
  readonly hasPack: true;
  readonly themeClassName: string;
  readonly themeStyleVars: Readonly<Record<string, string>>;
  readonly stageName: string;
  readonly stageSummary: string;
  readonly vnHero: StoryVnHeroData;
  readonly soloGuideActiveIndex: number;
  readonly actionDeckFlowSynced: boolean;
  readonly actionDeckHasFlow: boolean;
  readonly stageRailEntries: readonly StoryStageEntry[];
  readonly lastCard: StoryDirectorCardData | null;
  readonly pressureBoardHtml: string;
  readonly sideFlowHtml: string;
  readonly cluesHtml: string;
  readonly queueHtml: string;
  readonly truthsHtml: string;
}

export type StoryDirectorData = StoryDirectorMissing | StoryDirectorNoPack | StoryDirectorReady;

interface Bridge {
  readonly getStoryDirectorData: (state?: CampaignStateSnapshot) => StoryDirectorData | null;
}

interface Cjs {
  readonly CampaignUI?: Bridge;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

export function getStoryDirectorData(state: CampaignStateSnapshot): StoryDirectorData | null {
  return cjs().CampaignUI?.getStoryDirectorData(state) ?? null;
}
