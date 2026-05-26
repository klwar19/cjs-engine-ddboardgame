// CampaignStoryHomeTab.tsx — Phase F JSX port of `_renderStoryHome`.
//
// Renders the Story Home tab. The outer dashboard wrapper, the Story
// Controls panel (4 onClick buttons), the Current Arc stat panel,
// the Active Sequence body (G.7/G.8), and the sequence shelf (G.10)
// are full JSX. The other sub-panels — VN hero with the chapter
// banner video, chapter tree, choice-consequences alignment grid,
// AI story-context, pipeline, sync-summary — still render via HTML
// bridges. Each is its own isolated chunk so individual ports can
// land later.

import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import { getStoryHomeData, type StoryHomeData } from "./data/storyHome";
import { getSequenceShelfData } from "./data/sequence";
import {
  SoloNoticePanel,
  PendingBattlePanel,
  CombatResultPanel,
  ScenarioSummaryPanel,
  ActiveSequencePanel
} from "./ResultPanels";
import { SequenceShelfPanel } from "./SequenceCard";
import { StoryVnHero } from "./StoryVn";

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignStoryHomeTab({ state }: Props) {
  const data = getStoryHomeData(state);
  if (!data) {
    return (
      <section className="campaign-panel">
        <div className="campaign-empty">Story Home not ready.</div>
      </section>
    );
  }
  const shelf = getSequenceShelfData("story", {
    wide: true,
    title: "Chapter Files",
    note: "Pick the chapter part to play. Branches are gated by the choice you made in the previous chapter, so unlocked branches will be marked. If you start ahead, prior parts are revealed with the default path."
  }, state);
  const dashboardCls = `campaign-dashboard campaign-mode-home campaign-story-home campaign-story-vn ${data.themeClassName}`;
  return (
    <div className={dashboardCls} style={data.themeStyleVars as React.CSSProperties}>
      <StoryVnHero data={data.vnHero} />
      <ActiveSequencePanel state={state} scopes={["story"]} />
      <HtmlBridge html={data.chapterTreeHtml} className="campaign-chapter-tree-bridge" />
      <HtmlBridge html={data.choiceConsequenceHtml} className="campaign-choice-consequence-bridge" />
      <HtmlBridge html={data.aiStoryContextHtml} className="campaign-ai-story-context-bridge" />
      {shelf && <SequenceShelfPanel shelf={shelf} />}
      <StoryControlsPanel data={data} />
      <CurrentArcPanel data={data} />
      <HtmlBridge html={data.storyPipelineHtml} className="campaign-story-pipeline-bridge" />
      <HtmlBridge html={data.syncSummaryHtml} className="campaign-sync-summary-bridge" />
      <SoloNoticePanel state={state} />
      <ScenarioSummaryPanel state={state} />
      <PendingBattlePanel state={state} />
      <CombatResultPanel state={state} />
    </div>
  );
}

function HtmlBridge({ html, className }: { html: string; className: string }) {
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function StoryControlsPanel({ data }: { data: StoryHomeData }) {
  return (
    <section className="campaign-panel campaign-wide-panel campaign-home-focus">
      <div className="campaign-panel-head">
        <div>
          <h2>Story Controls</h2>
          <div className="campaign-muted">
            Compact story mode: chapter files, current sequence, summary, and manual GM notes.
          </div>
        </div>
        <span className="campaign-pill">{data.chapterPartsCount} chapter parts</span>
      </div>
      <div className="campaign-home-actions">
        <ActionButton
          action="story-manual-note"
          label="Add Manual Scene"
          hint="Add story text to the summary without a VN scene"
          kind="manual"
        />
        <ActionButton
          action="open-story-summary"
          label="Open Summary"
          hint="Read completed parts, facts, and manual notes"
          kind="primary story"
        />
        <ActionButton
          action="story-copy-prompt"
          label="Copy AI Context"
          hint="Includes static story summary files plus GM-added save notes and runtime branches"
          kind="manual"
        />
        <ActionButton
          action="open-maps-tab"
          label={data.hasActiveRun ? "Continue Map" : "Current Map"}
          hint={data.hasActiveRun ? "Return to the active map" : "No active map run yet"}
        />
      </div>
    </section>
  );
}

function CurrentArcPanel({ data }: { data: StoryHomeData }) {
  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head">
        <h3>Current Arc</h3>
        <span className="campaign-pill">Chapter {data.currentChapter}</span>
      </div>
      <div className="campaign-stat-grid">
        <span>Completed <b>{data.currentArc.completed}</b></span>
        <span>Defaulted <b>{data.currentArc.defaulted}</b></span>
        <span>Manual Notes <b>{data.currentArc.manualNotes}</b></span>
        <span>Phase <b>{data.currentArc.phase}</b></span>
      </div>
      <div className="campaign-muted">
        Jumping ahead defaults earlier unrevealed parts once. Re-reading a played/defaulted part stays in story-only replay unless you add a future override flow.
      </div>
    </section>
  );
}

function ActionButton({
  action,
  label,
  hint,
  kind
}: {
  action: string;
  label: string;
  hint: string;
  kind?: string;
}) {
  const cls = ["campaign-action", "has-hint"];
  if (kind) cls.push(kind);
  return (
    <button
      className={cls.join(" ")}
      onClick={() => dispatchCampaignAction(action)}
      title={hint}
    >
      <span className="campaign-action-label">{label}</span>
      <small className="campaign-action-hint">{hint}</small>
    </button>
  );
}
