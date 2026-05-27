import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import { setActiveTab } from "../shell/bridge";
import {
  getTravelMapData,
  getWorldActivitiesData,
  type TravelMapData,
  type TravelMapNode,
  type TravelNodeButton,
  type TravelLocationDetail,
  type TravelAreaSwitcher,
  type WorldActivityCard,
  type WorldActivityGroup,
  type WorldJournalEntry
} from "./data/worldMap";

interface Props {
  readonly state: CampaignStateSnapshot;
}

// World Map tab — K.3 JSX port (`renderTravelMap`). React owns the
// <section>, <svg>, interactive node <g> wrappers (onClick travel),
// location-detail panel, and area buttons; the intricate inner SVG
// geometry (markers, labels, layers, roads, links) arrives as raw-SVG
// strings via the typed bridge and is inserted with dangerouslySetInnerHTML
// (no JSX attribute-conversion risk).
export function CampaignWorldMapTab({ state }: Props) {
  const data = getTravelMapData(state);
  if (!data) {
    return (
      <section className="campaign-panel">
        <div className="campaign-empty">World map UI not loaded.</div>
      </section>
    );
  }
  if (!data.hasMap) {
    return (
      <section className="campaign-panel">
        <div className="campaign-empty">No travel map for this world yet.</div>
      </section>
    );
  }
  const sectionClass = [
    "campaign-panel",
    "campaign-world-map-panel",
    data.mode === "visual" ? "is-visual-map" : "",
    data.themeClass
  ].filter(Boolean).join(" ");
  const style = data.backdropVar
    ? ({ ["--world-map-backdrop" as string]: data.backdropVar } as React.CSSProperties)
    : undefined;
  return (
    <section className={sectionClass} style={style}>
      <div className="campaign-panel-head">
        <div>
          <h2>{data.title}</h2>
          <span className="campaign-muted">{data.worldName} / {data.currentLocationName}</span>
        </div>
        <div className="campaign-panel-actions">
          <span className="campaign-pill">Zone {data.progress.zone}</span>
          <span className="campaign-pill">Visited {data.progress.visited}</span>
        </div>
      </div>
      {data.mode === "visual" && data.areaSwitcher && <AreaSwitcher data={data.areaSwitcher} />}
      <div className="campaign-world-map-layout">
        {data.mode === "visual" ? (
          <div className="campaign-world-map-stage">
            <TravelSvg data={data} />
            {data.legend.length > 0 && (
              <div className="campaign-world-map-legend">
                {data.legend.map((item, i) => (
                  <span key={i}>
                    <i className={`legend-dot ${item.kind}`} />
                    {item.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <TravelSvg data={data} />
        )}
        <div className="campaign-world-location">
          {data.detail ? (
            <LocationDetail detail={data.detail} />
          ) : (
            <div className="campaign-empty">No location selected.</div>
          )}
        </div>
      </div>
    </section>
  );
}

function TravelSvg({ data }: { data: Extract<TravelMapData, { hasMap: true }> }) {
  const { width, height } = data.canvas;
  const cls = data.mode === "visual" ? "campaign-world-map-canvas is-visual" : "campaign-world-map-canvas";
  const bgRx = data.mode === "visual" ? 18 : 8;
  return (
    <svg className={cls} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={data.title}>
      <rect x="0" y="0" width={width} height={height} rx={bgRx} className="campaign-world-map-bg" />
      {data.mode === "visual" ? (
        <>
          {data.backdropImageHtml && <g dangerouslySetInnerHTML={{ __html: data.backdropImageHtml }} />}
          {data.layersHtml && <g dangerouslySetInnerHTML={{ __html: data.layersHtml }} />}
          {data.roadsHtml && <g dangerouslySetInnerHTML={{ __html: data.roadsHtml }} />}
        </>
      ) : (
        data.linksHtml && <g dangerouslySetInnerHTML={{ __html: data.linksHtml }} />
      )}
      {data.nodes.map((node) => (
        <TravelNode key={node.nodeId} node={node} />
      ))}
    </svg>
  );
}

function TravelNode({ node }: { node: TravelMapNode }) {
  return (
    <g
      className={node.classes}
      data-world-node={node.nodeId}
      style={{ cursor: "pointer" }}
      onClick={() => dispatchCampaignAction("world-map-travel", { mapId: node.mapId, nodeId: node.nodeId })}
      dangerouslySetInnerHTML={{ __html: node.innerSvg }}
    />
  );
}

function LocationDetail({ detail }: { detail: TravelLocationDetail }) {
  return (
    <>
      <div className="campaign-world-location-head">
        <h3>{detail.name}</h3>
        <span className="campaign-pill">{detail.type}</span>
      </div>
      <p>{detail.description}</p>
      {detail.hasActivities ? (
        <div className="campaign-world-location-activities">
          <strong>Available here</strong>
          {detail.activityPreviewNames.map((name, i) => (
            <span key={i}>{name}</span>
          ))}
        </div>
      ) : (
        <div className="campaign-muted">
          No location activities yet. This place can still hold story scenes, people, or future systems.
        </div>
      )}
      <div className="campaign-panel-actions">
        <button
          className="campaign-action primary"
          disabled={detail.isCurrent}
          onClick={() =>
            dispatchCampaignAction("world-map-travel", { mapId: detail.mapId, nodeId: detail.nodeId })
          }
        >
          {detail.isCurrent ? "Here" : "Travel"}
        </button>
        {detail.hasActivities && (
          <button className="campaign-action" onClick={() => setActiveTab("worldActivities")}>
            Open Activities
          </button>
        )}
      </div>
      {detail.people.length > 0 && (
        <>
          <h4>People</h4>
          <div className="campaign-world-action-list">
            {detail.people.map((btn, i) => (
              <NodeEntryButton key={i} btn={btn} />
            ))}
          </div>
        </>
      )}
      {detail.actions.length > 0 && (
        <>
          <h4>Local Actions</h4>
          <div className="campaign-world-action-list">
            {detail.actions.map((btn, i) => (
              <NodeEntryButton key={i} btn={btn} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function NodeEntryButton({ btn }: { btn: TravelNodeButton }) {
  return (
    <button
      className={`campaign-action ${btn.primary ? "primary" : ""}`}
      disabled={btn.disabled}
      title={btn.title}
      onClick={() =>
        dispatchCampaignAction(btn.action, { mapId: btn.mapId, nodeId: btn.nodeId, entryId: btn.entryId })
      }
    >
      {btn.label}
    </button>
  );
}

function AreaSwitcher({ data }: { data: TravelAreaSwitcher }) {
  return (
    <>
      <div className="campaign-world-area-switcher">
        {data.buttons.map((area, i) => {
          const cls = [
            "campaign-world-area-btn",
            area.active ? "is-active" : "",
            area.dev ? "is-dev" : ""
          ].filter(Boolean).join(" ");
          const disabled = area.active || area.dev;
          return (
            <button
              key={i}
              className={cls}
              disabled={disabled}
              title={area.title}
              onClick={
                disabled || !area.switchMapId
                  ? undefined
                  : () => dispatchCampaignAction("world-map-switch-map", { mapId: area.switchMapId as string })
              }
            >
              <span>{area.label}</span>
              <small>{area.sublabel}</small>
            </button>
          );
        })}
      </div>
      {data.devNotes.length > 0 && (
        <div className="campaign-world-dev-notes">
          {data.devNotes.map((note, i) => (
            <span key={i}>
              <strong>{note.label}:</strong> {note.text}
            </span>
          ))}
        </div>
      )}
    </>
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

