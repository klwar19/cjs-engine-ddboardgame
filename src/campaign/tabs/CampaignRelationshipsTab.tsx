// CampaignRelationshipsTab.tsx — JSX port of the vanilla `relationships-tab.js`
// island. Activity buttons + event "Start" buttons dispatch via typed onClick
// (`rel-activity` / `sequence-start`) instead of the old data-* island markers
// that `htmlIslandActions.ts` translated. The data shape is derived by
// tabs/data/relationships.ts (a faithful port of the module's logic).

import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import {
  getRelationshipsData,
  type RelCard,
  type RelActSummary,
  type RelEvent,
  type RelPortrait
} from "./data/relationships";

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignRelationshipsTab({ state }: Props) {
  const data = getRelationshipsData(state);
  if (!data.hasState) {
    return <div className="campaign-panel">No active campaign.</div>;
  }

  if (!data.knownCount) {
    return (
      <section className="campaign-panel campaign-relationships-panel">
        <div className="campaign-panel-head">
          <h2>Relationships</h2>
          <span className="campaign-pill">0 known</span>
        </div>
        <ActsSummary acts={data.acts} />
        <div className="rel-empty">
          <div className="rel-empty-icon">?</div>
          <h3>No characters known yet</h3>
          <p>
            Characters appear here after story scenes, quests, or manual bond changes. Spend Acts to
            build trust, respect, or romance when a character is eligible.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="campaign-panel campaign-relationships-panel">
      <div className="campaign-panel-head">
        <div>
          <h2>Relationships</h2>
          <div className="campaign-muted">
            Simple social bonds. Higher trust, respect, or romance can unlock character events.
          </div>
        </div>
        <span className="campaign-pill">{data.knownCount} known</span>
      </div>
      <ActsSummary acts={data.acts} />
      <div className="rel-grid">
        {data.cards.map((card) => (
          <RelationshipCard key={card.charId} card={card} />
        ))}
      </div>
    </section>
  );
}

function ActsSummary({ acts }: { acts: RelActSummary }) {
  return (
    <section className="rel-acts-banner">
      <div className="rel-acts-banner-row">
        <div>
          <strong>Activity Acts</strong>
          <span className="rel-acts-banner-meter">
            {acts.remaining} / {acts.max}
          </span>
        </div>
        <div className="rel-acts-banner-hint">
          Acts refresh when you Pass Phase. Relationship buttons now build trust, respect, or eligible
          romance.
        </div>
      </div>
      {acts.recent.length ? (
        <details className="rel-acts-history">
          <summary>Recent activities</summary>
          <ul>
            {acts.recent.map((entry, index) => (
              <li key={index}>
                <b>{entry.label}</b> with {entry.name} (+{entry.amount} {entry.field})
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function Portrait({ portrait }: { portrait: RelPortrait }) {
  if (portrait.src) {
    return (
      <img
        className="rel-portrait"
        src={portrait.src}
        alt={portrait.alt}
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    );
  }
  return (
    <div className="rel-portrait rel-portrait-fallback" aria-hidden="true">
      {portrait.fallbackText}
    </div>
  );
}

function RelationshipCard({ card }: { card: RelCard }) {
  return (
    <div className={`rel-card rel-tier-${card.tierId}`} data-rel-character={card.charId}>
      <div className="rel-card-head">
        <Portrait portrait={card.portrait} />
        <div className="rel-card-id">
          <div className="rel-card-name">{card.name}</div>
          <div className="rel-card-tier">
            {card.tierIcon} {card.tierLabel} <span className="rel-card-score">({card.score})</span>
          </div>
        </div>
      </div>
      <div className="rel-bar-track">
        <div className="rel-bar-fill" style={{ width: `${card.scorePct}%` }} />
      </div>
      {card.hasStatValues ? (
        <div className="rel-stats">
          {card.stats.map((entry) => (
            <div className="rel-stat" key={entry.id}>
              <span>{entry.label}</span>
              <strong>{entry.value}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="rel-fields-empty">No interactions yet.</div>
      )}
      <div className="rel-activities">
        <div className="rel-activities-head">
          <strong>Spend an Act</strong>
          <span className="rel-acts-pill">
            {card.actsRemaining} act{card.actsRemaining === 1 ? "" : "s"} left
          </span>
        </div>
        <div className="rel-activity-grid">
          {card.activities.map((activity) => (
            <button
              className="rel-activity-btn"
              key={activity.id}
              title={activity.title}
              disabled={activity.blocked}
              onClick={() =>
                dispatchCampaignAction("rel-activity", { characterId: card.charId, activityId: activity.id })
              }
            >
              <span className="rel-activity-icon" aria-hidden="true">
                {activity.icon}
              </span>
              <span className="rel-activity-label">{activity.label}</span>
              <span className="rel-activity-hint">{activity.hint}</span>
            </button>
          ))}
        </div>
      </div>
      {card.events.length ? <EventsSection events={card.events} /> : null}
      <details className="rel-card-detail">
        <summary>Stored values</summary>
        {card.storedFields === null ? null : card.storedFields.length ? (
          <ul className="rel-fields">
            {card.storedFields.map((field) => (
              <li key={field.key}>
                <span className="rel-field-name">{field.key}</span>
                <span className="rel-field-val">{field.value}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rel-fields-empty">No stored values yet.</div>
        )}
      </details>
    </div>
  );
}

function EventsSection({ events }: { events: readonly RelEvent[] }) {
  return (
    <div className="rel-events">
      <div className="rel-events-head">Character Events</div>
      {events.map((event) => (
        <div
          className={`rel-event-card ${event.completed ? "is-complete" : event.unlocked ? "is-unlocked" : "is-locked"}`}
          key={event.id}
        >
          <div>
            <strong>{event.title}</strong>
            <span>{event.statusText}</span>
          </div>
          {event.unlocked ? (
            <button
              className="campaign-action primary"
              onClick={() => dispatchCampaignAction("sequence-start", { id: event.id })}
            >
              Start
            </button>
          ) : (
            <span className="campaign-pill">{event.completed ? "Done" : "Locked"}</span>
          )}
        </div>
      ))}
    </div>
  );
}
