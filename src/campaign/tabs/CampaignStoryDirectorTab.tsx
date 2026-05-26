// CampaignStoryDirectorTab.tsx — Phase F JSX port of `_renderStoryDirector`.
//
// Renders the Story Director dashboard. Three variants:
//   • Module not loaded: a small empty notice.
//   • Pack not loaded for this world: the VN hero plus an empty
//     "Story Mode" panel.
//   • Pack loaded: the VN hero, a Story Desk panel (with solo-guide
//     and action-deck inner HTML), Episode Route panel with the
//     stage-rail HTML, the last director card (or empty card), and
//     the five-panel support grid (pressure board, side flow, clues,
//     queue, truths).
//
// All sub-panel bodies are still HTML bridges because they are
// produced by closure-private helpers (`_renderStoryVnHero`,
// `_renderStorySoloGuide`, `_renderStoryActionDeck`,
// `_renderStoryStageRail`, `_renderStoryDirectorCard`, etc.). Each
// remains an isolated chunk so later commits can port them
// individually.

import type { CampaignStateSnapshot } from "../store";
import { getStoryDirectorData, type StoryDirectorData } from "./data/storyDirector";

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
        <HtmlBridge html={data.vnHeroHtml} className="campaign-story-vn-hero-bridge" />
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
      <HtmlBridge html={data.vnHeroHtml} className="campaign-story-vn-hero-bridge" />
      <StoryDeskPanel data={data} />
      <EpisodeRoutePanel data={data} />
      <HtmlBridge html={data.lastCardHtml} className="campaign-story-director-card-bridge" />
      <div className="campaign-story-support-grid campaign-wide-panel">
        <HtmlBridge html={data.pressureBoardHtml} className="campaign-story-pressure-bridge" />
        <HtmlBridge html={data.sideFlowHtml} className="campaign-story-side-flow-bridge" />
        <HtmlBridge html={data.cluesHtml} className="campaign-story-clues-bridge" />
        <HtmlBridge html={data.queueHtml} className="campaign-story-queue-bridge" />
        <HtmlBridge html={data.truthsHtml} className="campaign-story-truths-bridge" />
      </div>
    </div>
  );
}

function HtmlBridge({ html, className }: { html: string; className: string }) {
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
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
        <HtmlBridge html={data.soloGuideHtml} className="campaign-story-solo-guide-bridge" />
        <HtmlBridge html={data.actionDeckHtml} className="campaign-story-action-deck-bridge" />
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
      <HtmlBridge html={data.stageRailHtml} className="campaign-story-stage-rail-bridge" />
    </section>
  );
}
