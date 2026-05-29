// WorldGateCard.tsx — Phase G.13 JSX port of `_renderWorldGateCard`
// plus the cross-world pressure-strip mini.

import { dispatchCampaignAction } from "../actions";
import { memoDeep } from "../util/memo";
import type {
  WorldGateCardEntry,
  WorldGateAction,
  WorldGatePressureChip
} from "./data/worldGate";

export function WorldGatePressureStrip({
  pressures
}: {
  pressures: readonly WorldGatePressureChip[];
}) {
  if (pressures.length === 0) return null;
  return (
    <div className="campaign-panel-actions">
      {pressures.map((p) => (
        <span key={p.id} className="campaign-pill">
          {p.title} {p.value}
        </span>
      ))}
    </div>
  );
}

function WorldGateCardView({ card }: { card: WorldGateCardEntry }) {
  const cls = ["campaign-world-gate-card", `theme-${card.worldId}`];
  if (card.isCurrent) cls.push("is-current");
  if (card.bannerImageUrl) cls.push("has-banner");
  const style = card.bannerImageUrl
    ? ({ ["--world-card-image" as string]: `url('${card.bannerImageUrl}')` } as React.CSSProperties)
    : undefined;
  return (
    <article className={cls.join(" ")} style={style}>
      {card.bannerImageUrl && (
        <div className="campaign-world-gate-banner" aria-hidden="true" />
      )}
      <div className="campaign-world-gate-card-head">
        <div>
          <h3>{card.title}</h3>
          <span>{card.kicker}</span>
        </div>
        <b>{card.status}</b>
      </div>
      <p>{card.summary}</p>
      <div className="campaign-world-gate-tags">
        {card.features.map((feature, i) => (
          <span key={`f-${i}`}>{feature}</span>
        ))}
        {card.mapCount > 0 && (
          <span>{card.mapCount} map{card.mapCount === 1 ? "" : "s"}</span>
        )}
        {card.activitiesCount > 0 && (
          <span>{card.activitiesCount} activities</span>
        )}
      </div>
      {card.activityTypeLabels.length > 0 && (
        <div className="campaign-muted">Loops: {card.activityTypeLabels.join(", ")}</div>
      )}
      {card.devNote && (
        <div className="campaign-world-gate-note">{card.devNote}</div>
      )}
      <div className="campaign-panel-actions">
        <WorldGateActionBtn action={card.primaryAction} />
        {card.secondaryActions.map((a, i) => (
          <WorldGateActionBtn key={i} action={a} />
        ))}
      </div>
    </article>
  );
}

// One card per world in the World Gate grid. Memoized by value so a state
// change re-renders only the world card whose data actually moved.
export const WorldGateCard = memoDeep(WorldGateCardView);

function WorldGateActionBtn({ action }: { action: WorldGateAction }) {
  const cls = ["campaign-action"];
  if (action.kind) {
    for (const part of action.kind.split(/\s+/)) if (part) cls.push(part);
  }
  if (action.hint) cls.push("has-hint");
  return (
    <button
      className={cls.join(" ")}
      title={action.hint || undefined}
      onClick={() => dispatchCampaignAction(action.action, action.data)}
    >
      <span className="campaign-action-label">{action.label}</span>
      {action.hint && <small className="campaign-action-hint">{action.hint}</small>}
    </button>
  );
}
