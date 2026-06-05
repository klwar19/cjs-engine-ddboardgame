// ResultPanels.tsx — Phase G JSX port of `_renderEventResult` and
// `_renderOracle`.
//
// Shared result panels used by EventLog, EventTab, Overview, Maps, etc.
// Phase I.2b: each panel SELF-SUBSCRIBES to its slice via
// `useCampaignSelector(selector, deepEqual)` and is wrapped in `memo`, so
// when its parent tab re-renders for an unrelated reason the panel keeps the
// previous reference and skips — only re-rendering when its own data slice
// changes by value. (The campaign state is deep-cloned every mutation, so
// the value comparison, not reference identity, is what makes this work.)
// `ActiveSequencePanel` stays prop-driven because its selector depends on the
// `scopes` prop, which the version-keyed selector cache can't memoize safely.
//
// The inline-purpose chip / consequence preview / flavor trail are JSX
// components (`ConsequenceViews.tsx`) reading typed data (Part B). The
// remaining `HtmlBridge` uses below host the loot / combat-consequence /
// combat-pulse / pending-battle-context / battle-party islands, whose builders
// still emit HTML strings.

import { memo } from "react";
import { useCampaignSelector, type CampaignStateSnapshot } from "../store";
import { deepEqual } from "../util/equality";
import { dispatchCampaignAction, type CampaignActionName } from "../actions";
import {
  getEventResultData,
  getOracleData,
  getSoloNoticeData,
  getTravelSurpriseData,
  getCombatResultData,
  getLastCombatResultData,
  getLastReportData,
  getPendingBattleData,
  getScenarioSummaryData,
  getActiveSequenceData,
  type EventResultData,
  type ManualSummary,
  type SoloNoticeData,
  type PendingBattleData,
  type ScenarioSummaryRun,
  type SequenceScope
} from "./data/resultPanels";
import { SequenceNodePanel } from "./SequenceNode";
import { QuestPill } from "./ScenarioChips";
import { InlinePurpose, ConsequencePreview, FlavorTrail } from "./ConsequenceViews";

// Module-level stable selectors so `useCampaignSelector` keeps a steady
// getSnapshot and never re-subscribes. Each is a pure function of state.
const selEventResult = (s: CampaignStateSnapshot | null) => (s ? getEventResultData(s) : null);
const selOracle = (s: CampaignStateSnapshot | null) => (s ? getOracleData(s) : null);
const selSoloNotice = (s: CampaignStateSnapshot | null) => (s ? getSoloNoticeData(s) : null);
const selTravelSurprise = (s: CampaignStateSnapshot | null) => (s ? getTravelSurpriseData(s) : null);
const selCombatResult = (s: CampaignStateSnapshot | null) => (s ? getCombatResultData(s) : null);
const selLastCombatResult = (s: CampaignStateSnapshot | null) => (s ? getLastCombatResultData(s) : null);
const selLastReport = (s: CampaignStateSnapshot | null) => (s ? getLastReportData(s) : null);
const selPendingBattle = (s: CampaignStateSnapshot | null) => (s ? getPendingBattleData(s) : null);
const selScenarioSummary = (s: CampaignStateSnapshot | null) => (s ? getScenarioSummaryData(s) : null);

// ── EventResult ───────────────────────────────────────────────────
export const EventResultPanel = memo(function EventResultPanel() {
  const data = useCampaignSelector(selEventResult, deepEqual);
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
      <div className="campaign-inline-purpose-bridge"><InlinePurpose purpose={data.inlinePurpose} /></div>
      {data.manualSummary && <ManualSummaryBlock summary={data.manualSummary} />}
      <p>{data.prompt}</p>
      {data.gmHook && (
        <div className="campaign-warning"><b>GM hook:</b> {data.gmHook}</div>
      )}
      <div className="campaign-consequence-preview-bridge"><ConsequencePreview data={data.consequencePreview} /></div>
      {data.flavorTrail && (
        <div className="campaign-flavor-trail-bridge"><FlavorTrail data={data.flavorTrail} /></div>
      )}
      <div className="campaign-control-help">
        Pick one: <b>Apply</b> commits listed ops and writes the event ledger. <b>Edit Rewards/Consequences</b> lets you tweak ops. <b>Event Log</b> records summary only. <b>To Quest</b> promotes the hook into the quest tracker.
      </div>
      <EventResultActions data={data} />
    </section>
  );
});

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
export const OraclePanel = memo(function OraclePanel() {
  const data = useCampaignSelector(selOracle, deepEqual);
  if (!data) return null;
  return (
    <section className="campaign-panel oracle campaign-result-card is-flavor">
      <div className="campaign-panel-head">
        <h2>GM Prompt</h2>
        <span className="campaign-impact-badge is-flavor">Text only</span>
      </div>
      <div className="campaign-inline-purpose-bridge"><InlinePurpose purpose={data.inlinePurpose} /></div>
      <p>{data.text}</p>
      <div className="campaign-consequence-preview-bridge"><ConsequencePreview data={data.consequencePreview} /></div>
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
});

// ── SoloNotice ────────────────────────────────────────────────────
export const SoloNoticePanel = memo(function SoloNoticePanel() {
  const data = useCampaignSelector(selSoloNotice, deepEqual);
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
      <div className="campaign-inline-purpose-bridge"><InlinePurpose purpose={data.inlinePurpose} /></div>
      <strong>{data.title}</strong>
      {data.prompt && <p>{data.prompt}</p>}
      <div className="campaign-consequence-preview-bridge"><ConsequencePreview data={data.consequencePreview} /></div>
      {data.flavorTrail && (
        <div className="campaign-flavor-trail-bridge"><FlavorTrail data={data.flavorTrail} /></div>
      )}
      <div className="campaign-control-help">
        Pick one: <b>Accept</b> commits the suggested choice. <b>Make Quest</b> only adds it to the Quest Tracker when possible. <b>Make Rumor</b> plants it in the hub lead bank. <b>Save</b> stores the card as a saved idea. <b>Ignore</b> drops it.
      </div>
      <SoloNoticeActions data={data} />
    </section>
  );
});

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

// ── Travel Surprise ───────────────────────────────────────────────
export const TravelSurprisePanel = memo(function TravelSurprisePanel() {
  const data = useCampaignSelector(selTravelSurprise, deepEqual);
  if (!data) return null;
  return (
    <section className="campaign-panel campaign-travel-notice">
      <div className="campaign-panel-head">
        <h2>{data.title}</h2>
        <span className="campaign-pill">{data.categoryLabel}</span>
      </div>
      <p>{data.prompt}</p>
      <div className="campaign-chip-row">
        <span className="campaign-chip">{data.areaLabel}</span>
        <span className="campaign-chip">{data.repeatLabel}</span>
        {data.locationLabel && <span className="campaign-chip">{data.locationLabel}</span>}
      </div>
      <div className="campaign-action-grid" style={{ marginTop: 12 }}>
        <button
          className="campaign-action"
          onClick={() => dispatchCampaignAction("roll-travel-surprise")}
        >
          Roll Another
        </button>
      </div>
    </section>
  );
});

// ── Combat Result (pending) ───────────────────────────────────────
export const CombatResultPanel = memo(function CombatResultPanel() {
  const data = useCampaignSelector(selCombatResult, deepEqual);
  if (!data) return null;
  return (
    <section className="campaign-panel battle-result">
      <div className="campaign-panel-head">
        <h2>Returned From Combat</h2>
        <span className="campaign-pill">{data.resultLabel}</span>
      </div>
      <div className="campaign-muted">{data.encounterId} | {data.rounds} rounds</div>
      <HtmlBridge html={data.lootHtml} className="campaign-loot-summary-bridge" />
      <HtmlBridge html={data.consequenceNoticeHtml} className="campaign-combat-consequence-bridge" />
      <div className="campaign-action-grid">
        <button
          className="campaign-action primary"
          onClick={() => dispatchCampaignAction("apply-combat-result")}
        >
          Apply to Campaign
        </button>
        <button
          className="campaign-action danger"
          onClick={() => dispatchCampaignAction("ignore-combat-result")}
        >
          Ignore
        </button>
      </div>
    </section>
  );
});

// ── Last Combat Result (applied) ──────────────────────────────────
export const LastCombatResultPanel = memo(function LastCombatResultPanel() {
  const data = useCampaignSelector(selLastCombatResult, deepEqual);
  if (!data) return null;
  return (
    <section className="campaign-panel battle-result applied">
      <div className="campaign-panel-head">
        <h2>Combat Applied</h2>
        <span className="campaign-pill">{data.resultLabel}</span>
      </div>
      <div className="campaign-muted">{data.label} | {data.rounds} rounds</div>
      {data.summary && <p>{data.summary}</p>}
      <HtmlBridge html={data.pulseHtml} className="campaign-combat-pulse-bridge" />
      <HtmlBridge html={data.lootHtml} className="campaign-loot-summary-bridge" />
    </section>
  );
});

// ── Last Scenario Report ──────────────────────────────────────────
export const LastReportPanel = memo(function LastReportPanel() {
  const data = useCampaignSelector(selLastReport, deepEqual);
  if (!data) return null;
  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head">
        <h2>Last Scenario Report</h2>
        <span className="campaign-pill">{data.outcome}</span>
      </div>
      <div className="campaign-stat-grid">
        <span>Danger <b>{data.danger}</b></span>
        <span>Camp <b>{data.campsUsed}</b></span>
        <span>Events <b>{data.eventsUsed}</b></span>
        <span>Battles <b>{data.battlesCount}</b></span>
      </div>
      <pre className="campaign-report">{data.diffJson}</pre>
    </section>
  );
});

// ── Pending Battle ────────────────────────────────────────────────
export const PendingBattlePanel = memo(function PendingBattlePanel() {
  const data = useCampaignSelector(selPendingBattle, deepEqual);
  if (!data) return null;
  return (
    <section className="campaign-panel battle-ready">
      <div className="campaign-panel-head">
        <h2>Battle Ready</h2>
        <span className="campaign-pill">{data.sourceLabel}</span>
      </div>
      <strong>{data.label}</strong>
      <div className="campaign-muted">{data.subLabel}</div>
      {data.autoMapLabel && (
        <div className="campaign-muted">Auto map: {data.autoMapLabel}</div>
      )}
      <HtmlBridge html={data.contextHtml} className="campaign-pending-battle-context-bridge" />
      <HtmlBridge html={data.partySummaryHtml} className="campaign-battle-party-summary-bridge" />
      <div className="campaign-control-help">
        Choose how this battle resolves. <b>Run in Combat App</b> = full tactical fight (loot returns to campaign). <b>Resolve Manually</b> = type a free-form result. <b>Manual Victory/Defeat</b> = skip the fight with default rewards or penalty. Cancel removes the pending battle without effect.
      </div>
      <PendingBattleActions data={data} />
    </section>
  );
});

function PendingBattleActions({ data }: { data: PendingBattleData }) {
  return (
    <div className="campaign-action-grid campaign-battle-primary-actions">
      <ActionBtn
        action="run-battle"
        label="Run in Combat App"
        hint="Open the tactical combat screen with this encounter"
        kind="primary"
        disabled={!data.canRun}
      />
      <ActionBtn
        action="manual-battle"
        label="Resolve Manually"
        hint="Type a custom outcome and rewards"
      />
      <details className="campaign-action-menu">
        <summary className="campaign-action-menu-trigger"><span>Battle Options</span></summary>
        <div className="campaign-action-menu-panel">
          {data.isRandom && (
            <ActionBtn action="battle-reroll" label="Reroll" hint="Re-roll from the same random table" />
          )}
          <ActionBtn action="battle-override" label="Override" hint="Pick a specific encounter from the catalog" />
          <ActionBtn action="skip-victory" label="Manual Victory" hint="Skip the fight as a win (basic rewards)" />
          <ActionBtn action="skip-defeat" label="Manual Defeat" hint="Skip as a loss (default: danger +2 and 10% currency loss)" />
          <ActionBtn action="cancel-battle" label="Cancel Battle" hint="Remove pending battle, no effect" kind="danger" />
        </div>
      </details>
    </div>
  );
}

// ── Scenario Summary ──────────────────────────────────────────────
export const ScenarioSummaryPanel = memo(function ScenarioSummaryPanel({
  showWhenNoRun = false
}: {
  showWhenNoRun?: boolean;
}) {
  const data = useCampaignSelector(selScenarioSummary, deepEqual);
  if (!data) return null;
  if (!data.hasRun) {
    if (!showWhenNoRun) return null;
    return (
      <section className="campaign-panel">
        <div className="campaign-panel-head"><h2>Current Run</h2></div>
        <div className="campaign-empty">No active run.</div>
        <button
          className="campaign-action primary"
          onClick={() => dispatchCampaignAction("open-scenarios-tab")}
        >
          Run Setup
        </button>
      </section>
    );
  }
  return <ScenarioSummaryActive data={data} />;
});

function ScenarioSummaryActive({ data }: { data: ScenarioSummaryRun }) {
  const task = data.questRunTask;
  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head">
        <h2>{data.name}</h2>
        <span className="campaign-pill">Danger {data.danger}/{data.dangerMax}</span>
        <QuestPill data={data.questPill} />
      </div>
      <div className="campaign-stat-grid">
        <span>{data.isGrid ? "Cell" : "Node"} <b>{data.location}</b></span>
        <span>Camp <b>{data.campsUsed}/{data.campsMax}</b></span>
        <span>Events <b>{data.eventsUsed}/{data.eventsMax}</b></span>
        <span>Battles <b>{data.battlesUsed}/{data.battlesMax}</b></span>
        {data.roamerCount > 0 && <span>Roamers <b>{data.roamerCount}</b></span>}
      </div>
      {data.objective && (
        <div className="campaign-quest-phase campaign-scenario-task">
          <span>
            {data.objective.completed
              ? "Objective Complete"
              : (!data.objective.visible ? "Objective Hidden" : "Current Objective")}
          </span>
          <strong>{data.objective.label}</strong>
          <small>{data.objective.meta}</small>
        </div>
      )}
      {task && (
        <div className="campaign-quest-phase campaign-scenario-task">
          {task.kind === "resolved" ? (
            <>
              <span>Quest Resolved</span>
              <strong>{task.title}</strong>
              <small>End scenario when ready</small>
            </>
          ) : (
            <>
              <span>{task.phase}</span>
              <strong>{task.label}</strong>
              <small>{task.location}</small>
            </>
          )}
        </div>
      )}
      <div className="campaign-control-stack">
        <div className="campaign-control-group">
          <div className="campaign-control-title">Run Tools</div>
          <div className="campaign-action-grid">
            <button className="campaign-action" onClick={() => dispatchCampaignAction("open-maps-tab")}>Map</button>
            <button className="campaign-action primary" onClick={() => dispatchCampaignAction("roll-travel-surprise")}>Movement Surprise</button>
            <button className="campaign-action" onClick={() => dispatchCampaignAction("camp-rest")}>Camp Rest</button>
          </div>
        </div>
        <div className="campaign-control-group">
          <div className="campaign-control-title">Manual Control</div>
          <div className="campaign-action-grid">
            <button className="campaign-action" onClick={() => dispatchCampaignAction("manual-battle")}>Manual Battle Result</button>
            <button className="campaign-action danger" onClick={() => dispatchCampaignAction("end-scenario")}>End Run</button>
            {data.hasGeneratedScenario && (
              <button
                className="campaign-action danger"
                onClick={() => dispatchCampaignAction("cancel-scenario")}
                title="Discard without report"
              >
                Cancel Run
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Active Sequence ───────────────────────────────────────────────
// Shared by StoryHome (scope='story'), QuestHome (scope='quest'),
// and EventTab (scope='event'). Stays prop-driven (state + scopes): its
// selector depends on the `scopes` prop, which the version-keyed
// useCampaignSelector cache can't memoize safely.
export function ActiveSequencePanel({
  state,
  scopes
}: {
  state: CampaignStateSnapshot;
  scopes: readonly SequenceScope[];
}) {
  const data = getActiveSequenceData(state, scopes);
  if (!data) return null;
  if (data.vnActive) {
    return (
      <section className="campaign-panel campaign-wide-panel campaign-sequence-active is-vn-active">
        <div className="campaign-sequence-active-avatar" aria-hidden="true">
          <span className="campaign-grid-player" data-facing="down" />
        </div>
        <div className="campaign-sequence-active-body">
          <div className="campaign-panel-head">
            <div>
              <h2>Now playing — {data.title}</h2>
              <div className="campaign-muted">
                {data.chapterLabel && `Chapter ${data.chapterLabel} · `}
                {data.scopeLabel}
                {data.replayMode && " · Replay mode"}
              </div>
            </div>
            <button
              className="campaign-action danger"
              onClick={() => dispatchCampaignAction("sequence-complete")}
            >
              End
            </button>
          </div>
          <div className="campaign-muted">
            The visual novel overlay is open. Click anywhere in it to continue, or use Panel to switch back to the inline view.
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="campaign-panel campaign-wide-panel campaign-sequence-active">
      <div className="campaign-panel-head">
        <div>
          <h2>{data.title}</h2>
          <div className="campaign-muted">
            {data.scopeLabel} | {data.chapterLabel && `Chapter ${data.chapterLabel} | `}
            {data.nodeId}
            {data.replayMode && " | Replay mode"}
          </div>
        </div>
        {data.replayMode && <span className="campaign-pill">Replay</span>}
        <button className="campaign-action" onClick={() => dispatchCampaignAction("sequence-open-vn")}>
          Open VN
        </button>
        <button className="campaign-action danger" onClick={() => dispatchCampaignAction("sequence-complete")}>
          End
        </button>
      </div>
      {data.node ? (
        <SequenceNodePanel node={data.node} />
      ) : (
        <div className="campaign-empty">Loading sequence node...</div>
      )}
    </section>
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
  kind,
  disabled
}: {
  action: CampaignActionName;
  label: string;
  hint: string;
  kind?: string;
  disabled?: boolean;
}) {
  const cls = ["campaign-action", "has-hint"];
  if (kind) cls.push(kind);
  return (
    <button
      className={cls.join(" ")}
      onClick={() => dispatchCampaignAction(action)}
      title={hint}
      disabled={!!disabled}
    >
      <span className="campaign-action-label">{label}</span>
      <small className="campaign-action-hint">{hint}</small>
    </button>
  );
}
