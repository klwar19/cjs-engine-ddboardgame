// RecentLog.tsx — Phase F JSX port of `_renderRecentLogStrip`.
//
// Renders the compact log strip below the sub-tabs: panel header with
// "All" and "Clear" buttons, then up to three log entries. The "All"
// button opens the log drawer (`log` panel), and "Clear" calls the
// typed clearLog wrapper.

import { clearLog } from "../actions";
import { setActivePanel } from "./bridge";
import type { RecentLogData, RecentLogEntry } from "./types";

interface Props {
  readonly data: RecentLogData;
}

export function CampaignRecentLog({ data }: Props) {
  return (
    <section className="campaign-log-strip">
      <div className="campaign-panel-head">
        <h2>Recent Log</h2>
        <div className="campaign-panel-actions">
          <button
            className="campaign-icon-btn"
            onClick={() => setActivePanel("log")}
          >
            All
          </button>
          {data.hasLog && (
            <button
              className="campaign-icon-btn danger"
              onClick={clearLog}
            >
              Clear
            </button>
          )}
        </div>
      </div>
      {data.entries.length ? (
        data.entries.map((entry, i) => <LogLine key={i} entry={entry} />)
      ) : (
        <div className="campaign-empty">No log entries yet.</div>
      )}
    </section>
  );
}

function LogLine({ entry }: { entry: RecentLogEntry }) {
  return (
    <div className={`campaign-log-line campaign-log-${entry.kind.key}`}>
      <div className="campaign-log-main">
        <span className="campaign-log-type">{entry.kind.label}</span>
        <span>{entry.text}</span>
      </div>
      <small>{entry.meta}</small>
    </div>
  );
}
