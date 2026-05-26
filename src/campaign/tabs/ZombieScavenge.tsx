// ZombieScavenge.tsx — Phase G.17 JSX port of the zombie-world
// scavenge variants: the Quest Home scavenge board
// (`_renderZombieScavengeHome`) and the Quests tracker scavenge log
// (`_renderZombieScavengeTracker`). Legacy quest rows reuse the
// shared `<QuestRow>` component (G.1).

import { dispatchCampaignAction, type CampaignActionName } from "../actions";
import { QuestRow } from "./QuestRow";
import type { QuestRowData } from "./data/questRow";
import type {
  ZombieScavengeHomeData,
  ZombieScavengeTrackerData,
  WorldActivityPreview
} from "./data/zombie";

function WorldActivityPreviewCard({ activity }: { activity: WorldActivityPreview }) {
  return (
    <article className="campaign-sequence-card is-quest">
      <div className="campaign-sequence-kind">{activity.kicker}</div>
      <strong>{activity.title}</strong>
      <p>{activity.summary}</p>
      <div className="campaign-muted">{activity.rewardText}</div>
    </article>
  );
}

export function ZombieScavengeHome({ data }: { data: ZombieScavengeHomeData }) {
  const heroStyle = data.heroBackdropUrl
    ? ({ ["--campaign-home-backdrop" as string]: `url('${data.heroBackdropUrl}')` } as React.CSSProperties)
    : undefined;
  return (
    <div className="campaign-dashboard campaign-mode-home campaign-quest-home campaign-scavenge-home">
      <section className="campaign-gacha-hero campaign-wide-panel is-quest" style={heroStyle}>
        <div className="campaign-gacha-hero-copy">
          <div className="campaign-gacha-kicker">Scavenge</div>
          <h2>Last Light Scavenge Board</h2>
          <p>
            Zombie world does not use normal quests by default. It is built around supply routes, medical runs, safehouse projects, and pressure clocks that react to noise and infection.
          </p>
          <div className="campaign-chip-row">
            <span className="campaign-chip">{data.scavengeCount} supply runs</span>
            <span className="campaign-chip">{data.buildCount} build projects</span>
            <span className="campaign-chip">{data.pressureCount} pressures</span>
          </div>
        </div>
        <div className="campaign-gacha-hero-actions">
          <HeroAction
            action="open-world-content"
            label="Open Last Light Map"
            hint="Move between safehouse, mall, clinic, subway, and tower."
            kind="primary"
            data={{ tab: "worldMap", mode: "activities" }}
          />
          <HeroAction
            action="open-world-content"
            label="Supply Activities"
            hint="Run scavenging and safehouse actions from the current location."
            data={{ tab: "worldActivities", mode: "activities" }}
          />
          <HeroAction
            action="open-maps-tab"
            label={data.hasRun ? "Current Run" : "No Combat Run"}
            hint={data.hasRun ? "Continue the active scenario run." : "Zombie scavenge currently uses map activities unless a combat run is started."}
          />
        </div>
      </section>
      <section className="campaign-panel campaign-wide-panel campaign-scavenge-route-panel">
        <div className="campaign-panel-head">
          <div>
            <h2>Supply Routes</h2>
            <div className="campaign-muted">
              These replace Earth/Bazaar-style quests: choose a location on the zombie map, then run the activity there.
            </div>
          </div>
          <span className="campaign-pill">{data.scavengeCount} routes</span>
        </div>
        <div className="campaign-tab-grid">
          {data.scavenge.length > 0 ? (
            data.scavenge.map((activity) => (
              <WorldActivityPreviewCard key={activity.id} activity={activity} />
            ))
          ) : (
            <div className="campaign-empty">No scavenge routes authored yet.</div>
          )}
        </div>
      </section>
      <section className="campaign-panel campaign-wide-panel campaign-scavenge-build-panel">
        <div className="campaign-panel-head">
          <div>
            <h2>Safehouse Projects</h2>
            <div className="campaign-muted">
              Build actions convert salvage into security, medicine storage, and later survivor facilities.
            </div>
          </div>
          <span className="campaign-pill">{data.buildCount} projects</span>
        </div>
        <div className="campaign-tab-grid">
          {data.build.length > 0 ? (
            data.build.map((activity) => (
              <WorldActivityPreviewCard key={activity.id} activity={activity} />
            ))
          ) : (
            <div className="campaign-empty">No build projects authored yet.</div>
          )}
        </div>
      </section>
      <section className="campaign-panel">
        <div className="campaign-panel-head">
          <h3>Pressure Clocks</h3>
          <span className="campaign-muted">Zombie progress should feel like survival weather.</span>
        </div>
        <div className="campaign-stat-grid">
          {data.pressures.length > 0 ? (
            data.pressures.map((pressure) => (
              <span key={pressure.id}>
                {pressure.title} <b>{pressure.value}</b>
              </span>
            ))
          ) : (
            <span>No zombie pressures yet <b>0</b></span>
          )}
        </div>
      </section>
    </div>
  );
}

export function ZombieScavengeTracker({ data }: { data: ZombieScavengeTrackerData }) {
  return (
    <section className="campaign-panel campaign-scavenge-tracker">
      <div className="campaign-panel-head">
        <div>
          <h2>Scavenge Run Log</h2>
          <div className="campaign-muted">
            This is the zombie-world survival tracker. Normal quest creation is hidden behind the map/activity loop.
          </div>
        </div>
        <div className="campaign-panel-actions">
          <span className="campaign-pill">
            {data.activeCount} active runs | {data.finishedCount} resolved
          </span>
          <button
            className="campaign-action primary"
            onClick={() => dispatchCampaignAction("open-world-content", { tab: "worldActivities", mode: "activities" })}
          >
            Open Activities
          </button>
          <button
            className="campaign-action"
            onClick={() => dispatchCampaignAction("open-world-content", { tab: "worldMap", mode: "activities" })}
          >
            Open Map
          </button>
        </div>
      </div>
      <div className="campaign-tab-grid">
        {data.activities.length > 0 ? (
          data.activities.map((activity) => (
            <WorldActivityPreviewCard key={activity.id} activity={activity} />
          ))
        ) : (
          <div className="campaign-empty">No zombie activities authored yet.</div>
        )}
      </div>
      {data.activeQuestRows.length > 0 && (
        <>
          <div className="campaign-section-title">Active Legacy Runs</div>
          <div className="campaign-quest-list">
            {data.activeQuestRows.map((row: QuestRowData) => (
              <QuestRow key={row.id} row={row} />
            ))}
          </div>
        </>
      )}
      {data.finishedQuestRows.length > 0 && (
        <details className="campaign-resolved-quests">
          <summary>Resolved legacy runs ({data.finishedCount})</summary>
          <div className="campaign-quest-list">
            {data.finishedQuestRows.map((row: QuestRowData) => (
              <QuestRow key={row.id} row={row} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function HeroAction({
  action,
  label,
  hint,
  kind,
  data
}: {
  action: CampaignActionName;
  label: string;
  hint: string;
  kind?: string;
  data?: Record<string, string>;
}) {
  const cls = ["campaign-action", "has-hint"];
  if (kind) cls.push(kind);
  return (
    <button
      className={cls.join(" ")}
      title={hint}
      onClick={() => dispatchCampaignAction(action, data)}
    >
      <span className="campaign-action-label">{label}</span>
      <small className="campaign-action-hint">{hint}</small>
    </button>
  );
}
