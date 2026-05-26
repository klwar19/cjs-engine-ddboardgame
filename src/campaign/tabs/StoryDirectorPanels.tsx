// StoryDirectorPanels.tsx — Phase G.11b JSX components for the Story
// Director episode rail, the last-beat director card, and the empty
// fallback. The route consequence preview is still an HTML bridge
// (`HubTab.renderConsequencePreview`) until K.3 ports the HubTab
// renderers.

import { dispatchCampaignAction } from "../actions";
import type {
  StoryStageEntry,
  StoryDirectorCardData,
  StoryRouteChoice
} from "./data/storyDirector";

export function StoryStageRail({ stages }: { stages: readonly StoryStageEntry[] }) {
  if (stages.length === 0) {
    return <div className="campaign-empty">No stages authored.</div>;
  }
  return (
    <div className="campaign-story-stage-rail">
      {stages.map((stage) => {
        const cls = ["campaign-story-stage"];
        if (stage.isActive) cls.push("is-active");
        else if (stage.isPast) cls.push("is-past");
        return (
          <button
            key={stage.id}
            type="button"
            className={cls.join(" ")}
            title={stage.summary}
            onClick={() => dispatchCampaignAction("story-set-stage", { id: stage.id })}
          >
            <span>{stage.index}</span>
            <strong>{stage.name}</strong>
            <small>{stage.summary}</small>
          </button>
        );
      })}
    </div>
  );
}

export function StoryDirectorCard({ card }: { card: StoryDirectorCardData | null }) {
  if (!card) return <StoryDirectorEmptyCard />;
  return (
    <section className="campaign-panel campaign-side-card campaign-result-card campaign-story-card campaign-story-dialogue">
      <div className="campaign-story-dialogue-head">
        <div>
          <h3>{card.title}</h3>
          <div className="campaign-muted">
            {card.stageLabel} | {card.kindLabel}
          </div>
        </div>
        <span className={`campaign-risk ${card.canonRiskClass}`}>{card.canonRisk}</span>
      </div>
      <div className="campaign-story-dialogue-box">
        <div className="campaign-story-speaker">{card.kindLabel}</div>
        {card.prompt && <p>{card.prompt}</p>}
        {card.text && <p>{card.text}</p>}
        {card.summary && <p className="campaign-muted">{card.summary}</p>}
      </div>
      {card.gmNote && <div className="campaign-warning">{card.gmNote}</div>}
      {card.tags.length > 0 && (
        <div className="campaign-chip-row">
          {card.tags.map((tag, i) => (
            <span key={i} className="campaign-chip">{tag}</span>
          ))}
        </div>
      )}
      <StoryRouteMap routes={card.routes} />
      <div className="campaign-action-grid">
        <CardActionBtn
          action="story-open-last"
          label="Open Popup"
          hint="Show this beat in a decision window again"
          kind="story"
        />
        <ActionMenu label="Beat Options">
          <CardActionBtn
            action="story-save-beat"
            label="Hold For Later"
            hint="Queue this for later without applying it"
            kind="manual"
          />
          <CardActionBtn
            action="story-copy-prompt"
            label="Copy GM Prompt"
            hint="Copy this beat and current context"
            kind="manual"
          />
          <CardActionBtn
            action="story-reject-beat"
            label="Skip Roll"
            hint="Save as skipped and clear it"
            kind="danger"
          />
        </ActionMenu>
      </div>
    </section>
  );
}

function StoryDirectorEmptyCard() {
  return (
    <section className="campaign-panel campaign-wide-panel campaign-solo-notice campaign-story-card campaign-story-dialogue is-empty">
      <div className="campaign-panel-head">
        <h3>Scene Waiting</h3>
      </div>
      <div className="campaign-story-dialogue-box">
        <div className="campaign-story-speaker">Narrator</div>
        <p>
          Choose <b>Next Scene</b> when you want the app to surprise you. Choose <b>Write Scene</b> when you already know what should happen and only want the campaign log to remember it.
        </p>
        <small>Nothing random commits until you choose a route.</small>
      </div>
    </section>
  );
}

function StoryRouteMap({ routes }: { routes: readonly StoryRouteChoice[] }) {
  return (
    <div className="campaign-story-route-map">
      <div className="campaign-section-title">Route Choices</div>
      {routes.map((route) => (
        <StoryRouteCard key={route.index} route={route} />
      ))}
    </div>
  );
}

function StoryRouteCard({ route }: { route: StoryRouteChoice }) {
  const cls = ["campaign-story-route"];
  if (route.isRecommended) cls.push("is-recommended");
  const indexLabel = String(route.index + 1).padStart(2, "0");
  return (
    <div className={cls.join(" ")}>
      <div className="campaign-story-route-head">
        <span>Route {indexLabel}</span>
        <strong>{route.label}</strong>
        {route.isRecommended && <small>Suggested</small>}
      </div>
      <div
        className="campaign-consequence-preview-bridge"
        dangerouslySetInnerHTML={{ __html: route.consequencePreviewHtml }}
      />
      <button
        className={`campaign-action ${route.isRecommended ? "primary" : "quest"}`}
        title="Choose this route and commit its listed consequences"
        onClick={() =>
          dispatchCampaignAction("story-apply-choice", {
            id: route.cardId,
            choice: route.index
          })
        }
      >
        Choose Route {route.index + 1}
      </button>
    </div>
  );
}

function CardActionBtn({
  action,
  label,
  hint,
  kind
}: {
  action: string;
  label: string;
  hint: string;
  kind: string;
}) {
  const cls = ["campaign-action"];
  if (kind) {
    for (const part of kind.split(/\s+/)) if (part) cls.push(part);
  }
  if (hint) cls.push("has-hint");
  return (
    <button
      className={cls.join(" ")}
      title={hint}
      onClick={() => dispatchCampaignAction(action)}
    >
      <span className="campaign-action-label">{label}</span>
      <small className="campaign-action-hint">{hint}</small>
    </button>
  );
}

function ActionMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="campaign-action-menu">
      <summary className="campaign-action-menu-trigger">
        <span>{label}</span>
      </summary>
      <div className="campaign-action-menu-panel">{children}</div>
    </details>
  );
}
