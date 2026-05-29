// CampaignEventLogTab.tsx — Phase F JSX port of `_renderEventLog`.
//
// Renders the Event Log tab: a hero card with manual/oracle/export
// actions, a ledger panel listing every event log entry, and the two
// optional sub-panels (last event result, last oracle result). The
// hero and ledger render fully in JSX. The two sub-panels are still
// HTML-string bridges because they're shared with event{Character,
// Special,Side}; those tabs will port them to JSX next, replacing the
// last dangerouslySetInnerHTML blocks here.
//
// All buttons use direct onClick handlers via dispatchCampaignAction.

import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction, type CampaignActionName } from "../actions";
import {
  getEventLogData,
  type EventLogData,
  type EventLogEntry
} from "./data/eventLog";
import { EventResultPanel, OraclePanel } from "./ResultPanels";

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignEventLogTab({ state }: Props) {
  const data = getEventLogData(state);
  if (!data) {
    return (
      <section className="campaign-panel">
        <div className="campaign-empty">Event log not ready.</div>
      </section>
    );
  }
  // CSS custom property for the hero backdrop — `_worldHomeHeroStyle`
  // returned a raw `style="--..."` string; React needs a typed style
  // object instead. Cast through `CSSProperties` lets us name the var.
  const heroStyle = data.heroBackdropUrl
    ? ({ "--campaign-home-backdrop": `url('${data.heroBackdropUrl}')` } as React.CSSProperties)
    : undefined;

  return (
    <div className="campaign-dashboard campaign-event-log">
      <EventLogHero data={data} style={heroStyle} />
      <EventLedger data={data} />
      <EventResultPanel />
      <OraclePanel />
    </div>
  );
}

function EventLogHero({
  data,
  style
}: {
  data: EventLogData;
  style?: React.CSSProperties;
}) {
  return (
    <section className="campaign-gacha-hero campaign-wide-panel is-event" style={style}>
      <div className="campaign-gacha-hero-copy">
        <div className="campaign-gacha-kicker">Event Log</div>
        <h2>Events, Oracle Notes, Consequences</h2>
        <p>Bookkeeping for event-side happenings only. Main story addenda stay in Story Log.</p>
        <div className="campaign-chip-row">
          <span className="campaign-chip">{data.totalCount} entries</span>
          <span className="campaign-chip">{data.oracleCount} oracle</span>
          <span className="campaign-chip">{data.manualCount} manual</span>
        </div>
      </div>
      <div className="campaign-gacha-hero-actions">
        <HeroAction
          action="custom-event"
          label="Manual Event"
          hint="Write an event with quest, reward, consequence, tag, and log options"
          kind="manual"
        />
        <HeroAction
          action="roll-oracle"
          label="Oracle Prompt"
          hint="Roll a prompt, then convert or log it"
        />
        <HeroAction
          action="export-event-log"
          label="Export"
          hint="Download the event ledger"
        />
      </div>
    </section>
  );
}

// Mirrors `_actionBtn`: a button with label + hint subtitle. We use
// dispatchCampaignAction so legacy handlers in _handleAction keep
// owning these flows until they get typed wrappers.
function HeroAction({
  action,
  label,
  hint,
  kind
}: {
  action: CampaignActionName;
  label: string;
  hint: string;
  kind?: string;
}) {
  const cls = ["campaign-action"];
  if (kind) cls.push(kind);
  cls.push("has-hint");
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

function EventLedger({ data }: { data: EventLogData }) {
  return (
    <section className="campaign-panel campaign-wide-panel">
      <div className="campaign-panel-head">
        <div>
          <h2>Event Ledger</h2>
          <div className="campaign-muted">Separate from the Story Log and the raw session log.</div>
        </div>
        {data.totalCount > 0 && (
          <button
            className="campaign-action danger"
            onClick={() => dispatchCampaignAction("clear-event-log")}
          >
            Clear Event Log
          </button>
        )}
      </div>
      {data.entries.length ? (
        data.entries.map((entry, i) => <EventLogEntryRow key={i} entry={entry} />)
      ) : (
        <div className="campaign-empty">
          No event ledger entries yet. Use Oracle Prompt, Manual Event, or an Event card and choose Event Log.
        </div>
      )}
    </section>
  );
}

function EventLogEntryRow({ entry }: { entry: EventLogEntry }) {
  const phaseLabel = entry.phase ? `Phase ${entry.phase}` : "";
  const meta = [phaseLabel, entry.at].filter(Boolean).join(" | ");
  return (
    <article className="campaign-log-line campaign-log-event campaign-event-log-entry">
      <div className="campaign-log-main">
        <span className="campaign-log-type">{entry.scopeLabel}</span>
        <div>
          <strong>{entry.title}</strong>
          {entry.summary && <p>{entry.summary}</p>}
          {entry.consequences.length > 0 && (
            <div className="campaign-muted">{entry.consequences.join(" | ")}</div>
          )}
          {entry.tags.length > 0 && (
            <div className="campaign-chip-row">
              {entry.tags.map((tag, i) => (
                <span key={i} className="campaign-chip">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      <small>{meta}</small>
    </article>
  );
}
