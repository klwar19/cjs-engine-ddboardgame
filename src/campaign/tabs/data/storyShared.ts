// storyShared.ts — Shared Story-mode typed shapes used by both the
// Story Home tab and the Story Director tab. The bridge in
// campaign-ui.js (`_storyVnHeroData`, `_storyNextStepData`) produces
// these.

export interface StoryActionButton {
  readonly action: string;
  readonly label: string;
  readonly hint: string;
  readonly kind: string;
  readonly disabled: boolean;
  readonly data: Readonly<Record<string, string>>;
}

export interface StoryNextStep {
  readonly index: number;
  readonly title: string;
  readonly text: string;
  readonly actions: readonly StoryActionButton[];
}

export interface StoryVnHeroData {
  readonly worldName: string;
  readonly chapterLabel: string;
  readonly phaseLabel: string;
  readonly motif: string;
  readonly title: string;
  readonly summary: string;
  readonly bannerVideoUrl: string;
  readonly bannerVideoType: string;
  readonly next: StoryNextStep;
}
