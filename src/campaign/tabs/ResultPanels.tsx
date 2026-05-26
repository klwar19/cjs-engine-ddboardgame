// ResultPanels.tsx — Phase G JSX port of `_renderEventResult` and
// `_renderOracle`.
//
// Two shared panels used by EventLog, EventTab, Overview, and Maps.
// Each reads typed data via `getEventResultData(state)` /
// `getOracleData(state)` and renders JSX. Sub-fragments that depend
// on cross-module renderers (inline purpose chip, consequence
// preview, flavor trail) still come through HTML bridges because
// their inner data shapes live in sibling modules (HubTab / Controls).

import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import {
  getEventResultData,
  getOracleData,
  getSoloNoticeData,
  type EventResultData,
  type ManualSummary,
  type SoloNoticeData
} from "./data/resultPanels";

// ── EventResult ───────────────────────────────────────────────────
export function EventResultPanel({ state }: { state: CampaignStateSnapshot }) {
  const data = getEventResultData(state);
  if (!data) return null;
  return (
    <section className={`campaign-panel campaign-event-result campaign-result-card is-${data.tone}`}>
      <div className="campaign-panel-head">
        <div>
          <h2>{data.title}</h2>
          <div className="campaign-muted">{data.subLabel}</div>
        </div>
        <div className="campaign-impact-row">
          <span className={`campaign-impact-badge is-${data.tone}`}>{data.summaryLabel}</span>
          {data.ideaPillLabel && <span className="campaign-pill">{data.ideaPillLabel}</span>}
        </div>
      </div>
      <HtmlBridge html={data.inlinePurposeHtml} className="campaign-inline-purpose-bridge" />
      {data.manualSummary && <ManualSummaryBlock summary={data.manualSummary} />}
      <p>{data.prompt}</p>
      {data.gmHook && (
        <div className="campaign-warning"><b>GM hook:</b> {data.gmHook}</div>
      )}
      <HtmlBridge html={data.consequencePreviewHtml} className="campaign-consequence-preview-bridge" />
      <HtmlBridge html={data.flavorTrailHtml} className="campaign-flavor-trail-bridge" />
      <div className="campaign-control-help">
        Pick one: <b>Apply</b> commits listed ops and writes the event ledger. <b>Edit Rewards/Consequences</b> lets you tweak ops. <b>Event Log</b> records summary only. <b>To Quest</b> promotes the hook into the quest tracker.
      </div>
      <EventResultActions data={data} />
    </section>
  );
}

function ManualSummaryBlock({ summary }: { summary: ManualSummary }) {
  return (
    <div className="campaign-manual-summary">
      <div>
        <strong>Event Summary</strong>
        <span>{summary.short}</span>
      </div>
      {summary.main && (
        <div>
          <strong>Main Story</strong>
          <span>{summary.main}</span>
        </div>
      )}
      {summary.tags.length > 0 && (
        <div className="campaign-manual-summary-tags">
          {summary.tags.map((tag, i) => <span key={i}>{tag}</span>)}
        </div>
      )}
    </div>
  );
}

function EventResultActions({ data }: { data: EventResultData }) {
  return (
    <div className="campaign-action-grid">
      <ActionBtn action="apply-event" label={data.applyLabel} hint={data.applyHint} kind="primary" />
      <ActionBtn action="edit-event" label="Edit Rewards/Consequences" hint="Tweak the ops, then apply" />
      <ActionBtn action="event-to-quest" label="To Quest" hint="Create a tracked quest from this event" />
      <ActionBtn action="event-log-only" label="Event Log" hint="Summarize this event without applying mechanics" />
      <ActionBtn action="event-add-tags" label="Add Tags" hint="Tag this event in the campaign ledger" />
      {data.hasManualSummary && (
        <ActionBtn
          action="copy-event-summary"
          label="Copy Summary"
          hint="Copy the event summary and separate main-story notes for outside writing"
          kind="manual"
        />
      )}
      {data.hasPlotSeedTrigger && (
        <ActionBtn action="pin-plot-seed" label="Pin Plot Seed" hint="Save as a future plot hook in pinned notes" />
      )}
      {data.hasOracleTableId && (
        <ActionBtn action="event-to-oracle" label="Roll Linked Oracle" hint="Roll an oracle prompt linked to this event" />
      )}
      <ActionBtn action="ignore-event" label="Ignore" hint="Discard this event with no log entry" kind="danger" />
      <ActionBtn action="pick-event" label="Pick Different" hint="Replace with a specific event from the catalog" />
    </div>
  );
}

// ── Oracle ────────────────────────────────────────────────────────
export function OraclePanel({ state }: { state: CampaignStateSnapshot }) {
  const data = getOracleData(state);
  if (!data) return null;
  return (
    <section className="campaign-panel oracle campaign-result-card is-flavor">
      <div className="campaign-panel-head">
        <h2>GM Prompt</h2>
        <span className="campaign-impact-badge is-flavor">Text only</span>
      </div>
      <HtmlBridge html={data.inlinePurposeHtml} className="campaign-inline-purpose-bridge" />
      <p>{data.text}</p>
      <HtmlBridge html={data.consequencePreviewHtml} className="campaign-consequence-preview-bridge" />
      <div className="campaign-control-help">
        Pure narrative until promoted. Turn it into a quest, summarize it into Event Log, or open the event builder when you want rewards, consequences, or tags.
      </div>
      <div className="campaign-action-grid">
        <ActionBtn action="oracle-event-log" label="Event Log" hint="Summarize this prompt into the event ledger" kind="primary" />
        <ActionBtn action="oracle-to-quest" label="To Quest" hint="Create a tracked quest from this prompt" />
        <ActionBtn action="oracle-to-event-builder" label="Event Builder" hint="Add rewards, consequences, tags, or a main-story note" />
        <ActionBtn action="oracle-add-tags" label="Add Tags" hint="Tag this oracle result" />
        <ActionBtn action="roll-oracle" label="Reroll Prompt" hint="Roll a different prompt" />
        <ActionBtn action="pick-oracle" label="Pick Different" hint="Pick a specific prompt from the catalog" />
      </div>
    </section>
  );
}

// ── SoloNotice ────────────────────────────────────────────────────
export function SoloNoticePanel({ state }: { state: CampaignStateSnapshot }) {
  const data = getSoloNoticeData(state);
  if (!data) return null;
  const cls = ["campaign-panel", "campaign-solo-notice", "campaign-result-card", `is-${data.tone}`];
  if (data.risk === "red") cls.push("risk-red");
  return (
    <section className={cls.join(" ")}>
      <div className="campaign-panel-head">
        <div>
          <h2>Immediate Roll Result</h2>
          <div className="campaign-muted">{data.kindLabel} | Suggested: {data.choiceLabel}</div>
        </div>
        <div className="campaign-impact-row">
          <span className={`campaign-impact-badge is-${data.tone}`}>{data.summaryLabel}</span>
          <span className={`campaign-risk ${data.riskClass}`}>{data.risk}</span>
        </div>
      </div>
      <HtmlBridge html={data.inlinePurposeHtml} className="campaign-inline-purpose-bridge" />
      <strong>{data.title}</strong>
      {data.prompt && <p>{data.prompt}</p>}
      <HtmlBridge html={data.consequencePreviewHtml} className="campaign-consequence-preview-bridge" />
      <HtmlBridge html={data.flavorTrailHtml} className="campaign-flavor-trail-bridge" />
      <div className="campaign-control-help">
        Pick one: <b>Accept</b> commits the suggested choice. <b>Make Quest</b> only adds it to the Quest Tracker when possible. <b>Make Rumor</b> plants it in the hub lead bank. <b>Save</b> stores the card as a saved idea. <b>Ignore</b> drops it.
      </div>
      <SoloNoticeActions data={data} />
    </section>
  );
}

function SoloNoticeActions({ data }: { data: SoloNoticeData }) {
  return (
    <div className="campaign-action-grid">
      <ActionBtn action="accept-solo-hook" label={data.acceptLabel} hint={data.acceptHint} kind="primary" />
      <ActionBtn action="solo-hook-quest" label="Make Quest" hint="Add to Quest Tracker, no map run yet" />
      <ActionBtn action="solo-hook-rumor" label="Make Rumor" hint="Add as a hub rumor / lead bank item" />
      <ActionBtn action="save-solo-hook" label="Save Text" hint="Store in Saved Ideas to use later" />
      <ActionBtn action="ignore-solo-hook" label="Ignore" hint="Discard this hook" kind="danger" />
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────
function HtmlBridge({ html, className }: { html: string; className: string }) {
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function ActionBtn({
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
