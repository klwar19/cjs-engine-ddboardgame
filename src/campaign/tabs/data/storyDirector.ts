// storyDirector.ts — Phase F bridge for the Story Director tab.

import type { CampaignStateSnapshot } from "../../store";

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
  readonly vnHeroHtml: string;
}

interface StoryDirectorReady {
  readonly moduleAvailable: true;
  readonly hasPack: true;
  readonly themeClassName: string;
  readonly themeStyleVars: Readonly<Record<string, string>>;
  readonly stageName: string;
  readonly stageSummary: string;
  readonly vnHeroHtml: string;
  readonly soloGuideHtml: string;
  readonly actionDeckHtml: string;
  readonly stageRailHtml: string;
  readonly lastCardHtml: string;
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
