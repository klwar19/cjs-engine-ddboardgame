// TownPanels.tsx — Phase G.16 JSX port of `_renderTownSnapshot` and
// `_renderTownRollFloat` (Overview tab). The underlying hub state
// still lives in the HubTab module; the rumor rows inside the
// snapshot stay an HTML bridge until HubTab itself ports (K.3).

import { dispatchCampaignAction } from "../actions";
import type {
  TownSnapshotData,
  TownRollFloatData,
  TownKpi,
  TownStat,
  TownLocation,
  TownPressureItem
} from "./data/overview";

// Static rumor-purpose blurb mirrors `Controls.renderRumorPurpose()`.
function RumorPurpose() {
  return (
    <div className="campaign-rumor-purpose">
      <span className="campaign-impact-badge is-plot">Rumor purpose</span>
      <span>
        Rumors are parked leads, not current events. Collect whispers now, check canon risk, then promote one later into a quest, event, map seed, character beat, oracle prompt, or hub problem when the party is ready.
      </span>
    </div>
  );
}

export function TownSnapshotPanel({ data }: { data: TownSnapshotData }) {
  return (
    <section className="campaign-panel campaign-town-snapshot">
      <div className="campaign-panel-head">
        <div>
          <h2>{data.hubName}</h2>
          <div className="campaign-muted">{data.hubDescription}</div>
        </div>
        <span className="campaign-pill">{data.moodLabel}</span>
      </div>
      <div className="campaign-town-summary">
        <div className="campaign-stat-grid campaign-town-stats">
          {data.stats.map((stat: TownStat) => (
            <span key={stat.id}>
              {stat.label} <b>{stat.value}</b>
            </span>
          ))}
        </div>
        <div className="campaign-town-now">
          {data.kpis.map((kpi: TownKpi, i) => (
            <div key={i} className={`campaign-town-kpi ${kpi.tone}`.trim()}>
              <b>{kpi.count}</b>
              <span>{kpi.label}</span>
            </div>
          ))}
        </div>
      </div>
      <RumorPurpose />
      <div className="campaign-town-columns">
        <div>
          <div className="campaign-section-title">Pressure</div>
          {data.problems.length > 0 ? (
            data.problems.map((problem: TownPressureItem) => (
              <div key={problem.id} className="campaign-town-line is-risk">
                <strong>{problem.label}</strong>
                <span>Active hub problem</span>
              </div>
            ))
          ) : (
            <div className="campaign-empty">No active hub problems.</div>
          )}
          {data.rumorRowsHtml && (
            <div
              className="campaign-town-rumors-bridge"
              dangerouslySetInnerHTML={{ __html: data.rumorRowsHtml }}
            />
          )}
        </div>
        <div>
          <div className="campaign-section-title">Places</div>
          {data.locations.length > 0 ? (
            data.locations.map((loc: TownLocation) => (
              <div key={loc.id} className="campaign-town-line">
                <strong>{loc.name}</strong>
                <span>{loc.detail}</span>
              </div>
            ))
          ) : (
            <div className="campaign-empty">No hub locations loaded.</div>
          )}
        </div>
      </div>
    </section>
  );
}

const IMPACT_LEGEND: ReadonlyArray<readonly [string, string]> = [
  ["reward", "gain"],
  ["risk", "risk"],
  ["quest", "quest"],
  ["plot", "plot"],
  ["flavor", "text"]
];

export function TownRollFloatPanel({ data }: { data: TownRollFloatData }) {
  const pending = data.pending;
  return (
    <section className={`campaign-panel campaign-random-float ${pending ? "has-pending" : ""}`.trim()}>
      <div className="campaign-floating-eyebrow">Roll Random</div>
      <h3>{pending ? "Resolve Current Roll" : "Hub Pulse Box"}</h3>
      {pending ? (
        <>
          <p>{pending.title}</p>
          <div className="campaign-impact-row">
            <span className={`campaign-impact-badge ${pending.toneClass}`}>{pending.toneLabel}</span>
            <span>{pending.short}</span>
          </div>
        </>
      ) : (
        <p>Click once, then deal with the result before rolling again.</p>
      )}
      <div className="campaign-action-grid">
        {pending ? (
          <>
            <button
              className="campaign-action primary"
              onClick={() => dispatchCampaignAction("accept-solo-hook")}
            >
              {pending.hasOps ? "Accept & Apply" : "Accept as Quest"}
            </button>
            <button
              className="campaign-action"
              onClick={() => dispatchCampaignAction("save-solo-hook")}
            >
              Save Text
            </button>
            <button
              className="campaign-action danger"
              onClick={() => dispatchCampaignAction("ignore-solo-hook")}
            >
              Reject
            </button>
          </>
        ) : (
          <button
            className="campaign-action primary campaign-roll-now"
            onClick={() => dispatchCampaignAction("solo-surprise")}
          >
            Roll Random
          </button>
        )}
      </div>
      <div className="campaign-impact-legend">
        {IMPACT_LEGEND.map(([tone, label]) => (
          <span key={tone} className={`campaign-impact-badge is-${tone}`}>{label}</span>
        ))}
      </div>
    </section>
  );
}
