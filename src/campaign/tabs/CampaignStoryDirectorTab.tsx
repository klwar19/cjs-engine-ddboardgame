// CampaignStoryDirectorTab.tsx — Phase F JSX port of `_renderStoryDirector`.
//
// Renders the Story Director dashboard. Three variants:
//   • Module not loaded: a small empty notice.
//   • Pack not loaded for this world: the VN hero plus an empty
//     "Story Mode" panel.
//   • Pack loaded: the VN hero, a Story Desk panel (solo-guide +
//     action-deck), Episode Route panel with the stage rail, the
//     last director card (or empty card), and the five-panel
//     support grid (pressure / side-flow / clues / queue / truths).
//
// All bodies are full JSX after G.11a / G.11b / G.11c.

import type { CampaignStateSnapshot } from "../store";
import { getStoryDirectorData, type StoryDirectorData } from "./data/storyDirector";
import { StoryVnHero, StorySoloGuide, StoryActionDeck } from "./StoryVn";
import {
  StoryStageRail,
  StoryDirectorCard,
  StoryPressureBoard,
  StoryCluesPanel,
  StoryQueuePanel,
  StoryTruthsPanel,
  StorySideFlowPanel
} from "./StoryDirectorPanels";

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignStoryDirectorTab({ state }: Props) {
  const data = getStoryDirectorData(state);
  if (!data) {
    return (
      <section className="campaign-panel">
        <div className="campaign-empty">Story Director not ready.</div>
      </section>
    );
  }
  if (data.moduleAvailable === false) {
    return <div className="campaign-empty">Story Director module is not loaded.</div>;
  }
  const dashboardCls = `campaign-dashboard campaign-story-dashboard campaign-story-vn ${data.themeClassName}`;
  if (data.hasPack === false) {
    return (
      <div className={dashboardCls} style={data.themeStyleVars as React.CSSProperties}>
        <StoryVnHero data={data.vnHero} />
        <section className="campaign-panel campaign-wide-panel campaign-story-empty-world">
          <div className="campaign-panel-head"><h2>Story Mode</h2></div>
          <div className="campaign-empty">No Story Director pack loaded for this world.</div>
        </section>
      </div>
    );
  }
  return <ReadyDashboard data={data} dashboardCls={dashboardCls} />;
}

function ReadyDashboard({
  data,
  dashboardCls
}: {
  data: Extract<StoryDirectorData, { moduleAvailable: true; hasPack: true }>;
  dashboardCls: string;
}) {
  return (
    <div className={dashboardCls} style={data.themeStyleVars as React.CSSProperties}>
      <StoryVnHero data={data.vnHero} />
      <StoryDeskPanel data={data} />
      <EpisodeRoutePanel data={data} />
      <StoryDirectorCard card={data.lastCard} />
      <div className="campaign-story-support-grid campaign-wide-panel">
        <StoryPressureBoard data={data.pressureBoard} />
        <StorySideFlowPanel data={data.sideFlow} />
        <StoryCluesPanel data={data.clues} />
        <StoryQueuePanel data={data.queue} />
        <StoryTruthsPanel data={data.truths} />
      </div>
    </div>
  );
}

function StoryDeskPanel({
  data
}: {
  data: Extract<StoryDirectorData, { moduleAvailable: true; hasPack: true }>;
}) {
  return (
    <section className="campaign-panel campaign-wide-panel campaign-story-control-deck">
      <div className="campaign-panel-head">
        <div>
          <h2>Story Desk</h2>
          <div className="campaign-muted">Rolls open a decision window first. Nothing changes until you choose a route.</div>
        </div>
        <span className="campaign-pill">{data.stageName}</span>
      </div>
      <div className="campaign-story-command-grid">
        <StorySoloGuide activeIndex={data.soloGuideActiveIndex} />
        <StoryActionDeck
          flowSynced={data.actionDeckFlowSynced}
          hasFlow={data.actionDeckHasFlow}
        />
      </div>
    </section>
  );
}

function EpisodeRoutePanel({
  data
}: {
  data: Extract<StoryDirectorData, { moduleAvailable: true; hasPack: true }>;
}) {
  return (
    <section className="campaign-panel campaign-wide-panel campaign-story-episode-panel">
      <div className="campaign-panel-head">
        <div>
          <h3>Episode Route</h3>
          <div className="campaign-muted">{data.stageSummary}</div>
        </div>
      </div>
      <StoryStageRail stages={data.stageRailEntries} />
    </section>
  );
}
