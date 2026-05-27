import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import {
  getWorldActivitiesData,
  type WorldActivityCard,
  type WorldActivityGroup,
  type WorldJournalEntry
} from "./data/worldMap";

// Vanilla `CampaignWorldMap.renderTravelMap` produces a complete travel-
// map panel (SVG + node buttons). It already carries every interactive
// `data-campaign-action` attribute the legacy event delegation expects,
// so the React wrapper just hands ownership of the placeholder to React
// without porting the SVG renderer. The SVG itself is a follow-up port.
interface WorldMapModule {
  readonly renderTravelMap: (state: CampaignStateSnapshot) => string;
}

interface Cjs {
  readonly CampaignWorldMap?: WorldMapModule;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignWorldMapTab({ state }: Props) {
  const mod = cjs().CampaignWorldMap;
  if (!mod?.renderTravelMap) {
    return (
      <section className="campaign-panel">
        <div className="campaign-empty">World map UI not loaded.</div>
      </section>
    );
  }
  let html: string;
  try {
    html = mod.renderTravelMap(state);
  } catch (error) {
    console.error("renderTravelMap failed:", error);
    html = '<section class="campaign-panel"><div class="campaign-empty">World map render failed.</div></section>';
  }
  return (
    <div className="campaign-world-map-react" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

// World Activities tab — K.3 JSX port (`renderActivities`). DIV-based
// activity groups + journal + pressure strip; the world-activity-use
// buttons dispatch via onClick.
export function CampaignWorldActivitiesTab({ state }: Props) {
  const data = getWorldActivitiesData(state);
  if (!data) {
    return (
      <section className="campaign-panel">
        <div className="campaign-empty">World activities UI not loaded.</div>
      </section>
    );
  }
  return (
    <>
      <section className="campaign-panel">
        <div className="campaign-panel-head">
          <div>
            <h2>{data.worldName} Activities</h2>
            <span className="campaign-muted">{data.locationName}</span>
          </div>
          {data.pressures.length > 0 && (
            <div className="campaign-panel-actions">
              {data.pressures.map((p) => (
                <span key={p.id} className="campaign-pill">
                  {p.title} {p.value}
                </span>
              ))}
            </div>
          )}
        </div>
        {data.groups.length === 0 ? (
          <div className="campaign-empty">No activities available at this location.</div>
        ) : (
          data.groups.map((group) => <ActivityGroup key={group.type} group={group} />)
        )}
      </section>
      <section className="campaign-panel">
        <div className="campaign-panel-head">
          <h2>Journal &amp; Recap</h2>
        </div>
        {data.journal.length === 0 ? (
          <div className="campaign-empty">No journal entries yet.</div>
        ) : (
          data.journal.map((entry, i) => <JournalEntry key={i} entry={entry} />)
        )}
      </section>
    </>
  );
}

function ActivityGroup({ group }: { group: WorldActivityGroup }) {
  return (
    <div className="campaign-world-activity-group">
      <h3>{group.label}</h3>
      <div className="campaign-tab-grid">
        {group.activities.map((activity) => (
          <ActivityCard key={activity.id} activity={activity} />
        ))}
      </div>
    </div>
  );
}

function ActivityCard({ activity }: { activity: WorldActivityCard }) {
  return (
    <article className="campaign-card">
      <div className="campaign-card-head">
        <h3>{activity.title}</h3>
        <span className="campaign-pill">{activity.typePill}</span>
      </div>
      <p>{activity.summary}</p>
      {activity.rewardText && <div className="campaign-muted">{activity.rewardText}</div>}
      {activity.costText && <div className="campaign-muted">{activity.costText}</div>}
      <div className="campaign-panel-actions">
        <button
          className="campaign-action primary"
          disabled={!activity.ready}
          title={activity.disabledTitle}
          onClick={() => dispatchCampaignAction("world-activity-use", { activityId: activity.id })}
        >
          {activity.buttonLabel}
        </button>
      </div>
    </article>
  );
}

function JournalEntry({ entry }: { entry: WorldJournalEntry }) {
  return (
    <div className="campaign-record-line">
      <div>
        <strong>{entry.title}</strong>
        <small>{entry.sub}</small>
        <p>{entry.text}</p>
      </div>
    </div>
  );
}

