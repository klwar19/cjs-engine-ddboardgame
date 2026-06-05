// StoryDirectorPanels.tsx — Phase G.11b + G.11c JSX components for
// the Story Director episode rail, the last-beat director card, the
// empty fallback, and the five support-grid panels (pressure /
// clues / queue / truths / side-flow).
//
// The route consequence preview is the JSX `<ConsequencePreview>` (Part B).
// `StoryCardBody` is shared by the tab's `StoryDirectorCard` and the React
// story beat modal's `StoryBeatCard` (the `is-modal` variant) — both render
// the same head / dialogue / route map; `onChoose` lets the modal close
// before dispatching `story-apply-choice`.

import { dispatchCampaignAction, type CampaignActionName } from "../actions";
import { ConsequencePreview } from "./ConsequenceViews";
import type {
  StoryStageEntry,
  StoryDirectorCardData,
  StoryRouteChoice,
  PressureBoardData,
  StoryCluesPanelData,
  StoryQueuePanelData,
  StoryTruthsPanelData,
  StorySideFlowData,
  SideFlowColumn
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

// Shared card body — head + dialogue + gmNote + tags + route map. The tab
// card and the modal beat card render it identically; only the outer section
// (is-modal class) and the trailing action grid differ.
function StoryCardBody({
  data,
  onChoose
}: {
  data: StoryDirectorCardData;
  onChoose: (index: number) => void;
}) {
  return (
    <>
      <div className="campaign-story-dialogue-head">
        <div>
          <h3>{data.title}</h3>
          <div className="campaign-muted">
            {data.stageLabel} | {data.kindLabel}
          </div>
        </div>
        <span className={`campaign-risk ${data.canonRiskClass}`}>{data.canonRisk}</span>
      </div>
      <div className="campaign-story-dialogue-box">
        <div className="campaign-story-speaker">{data.kindLabel}</div>
        {data.prompt && <p>{data.prompt}</p>}
        {data.text && <p>{data.text}</p>}
        {data.summary && <p className="campaign-muted">{data.summary}</p>}
      </div>
      {data.gmNote && <div className="campaign-warning">{data.gmNote}</div>}
      {data.tags.length > 0 && (
        <div className="campaign-chip-row">
          {data.tags.map((tag, i) => (
            <span key={i} className="campaign-chip">{tag}</span>
          ))}
        </div>
      )}
      <StoryRouteMap routes={data.routes} onChoose={onChoose} />
    </>
  );
}

export function StoryDirectorCard({ card }: { card: StoryDirectorCardData | null }) {
  if (!card) return <StoryDirectorEmptyCard />;
  return (
    <section className="campaign-panel campaign-side-card campaign-result-card campaign-story-card campaign-story-dialogue">
      <StoryCardBody
        data={card}
        onChoose={(index) =>
          dispatchCampaignAction("story-apply-choice", { id: card.id, choice: index })
        }
      />
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

// Story beat modal card (`is-modal` variant; no action grid — the modal footer
// owns Hold/Skip). Route clicks call `onChoose` so the imperative modal can
// close before applying the choice. Shared by `tabs/StoryBeatModal.tsx`.
export function StoryBeatCard({
  data,
  onChoose
}: {
  data: StoryDirectorCardData;
  onChoose: (index: number) => void;
}) {
  return (
    <section className="campaign-panel campaign-side-card campaign-result-card campaign-story-card campaign-story-dialogue is-modal">
      <StoryCardBody data={data} onChoose={onChoose} />
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

function StoryRouteMap({
  routes,
  onChoose
}: {
  routes: readonly StoryRouteChoice[];
  onChoose: (index: number) => void;
}) {
  return (
    <div className="campaign-story-route-map">
      <div className="campaign-section-title">Route Choices</div>
      {routes.map((route) => (
        <StoryRouteCard key={route.index} route={route} onChoose={onChoose} />
      ))}
    </div>
  );
}

function StoryRouteCard({
  route,
  onChoose
}: {
  route: StoryRouteChoice;
  onChoose: (index: number) => void;
}) {
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
      <div className="campaign-consequence-preview-bridge">
        <ConsequencePreview data={route.consequencePreview} />
      </div>
      <button
        className={`campaign-action ${route.isRecommended ? "primary" : "quest"}`}
        title="Choose this route and commit its listed consequences"
        onClick={() => onChoose(route.index)}
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
  action: CampaignActionName;
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

// ── Support-grid panels (G.11c) ─────────────────────────────────

export function StoryPressureBoard({ data }: { data: PressureBoardData }) {
  return (
    <section className="campaign-panel campaign-story-support-panel">
      <div className="campaign-panel-head">
        <h3>Pressure Board</h3>
      </div>
      <div className="campaign-stat-grid">
        {data.metrics.length > 0 ? (
          data.metrics.map((metric) => (
            <span key={metric.id}>
              {metric.label} <b>{metric.value}</b>
            </span>
          ))
        ) : (
          <span>No metrics authored.</span>
        )}
      </div>
      <div className="campaign-control-help">{data.rule}</div>
    </section>
  );
}

export function StoryCluesPanel({ data }: { data: StoryCluesPanelData }) {
  return (
    <section className="campaign-panel campaign-story-support-panel">
      <div className="campaign-panel-head">
        <h3>Clues &amp; Reveals</h3>
      </div>
      {data.clues.length > 0 ? (
        data.clues.map((clue) => (
          <div key={clue.id} className="campaign-row">
            <div>
              <strong>{clue.title}</strong>
              <div className="campaign-muted">{clue.text}</div>
            </div>
            <span className={`campaign-risk ${clue.canonRiskClass}`}>{clue.canonRisk}</span>
          </div>
        ))
      ) : (
        <div className="campaign-empty">No story clues recorded yet.</div>
      )}
      {data.facts.length > 0 && (
        <>
          <div className="campaign-section-title">Revealed Facts</div>
          {data.facts.map((fact) => (
            <div key={fact.id} className="campaign-town-line is-plot">
              <strong>{fact.title}</strong>
              <span>{fact.text}</span>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

export function StoryQueuePanel({ data }: { data: StoryQueuePanelData }) {
  return (
    <section className="campaign-panel campaign-story-support-panel">
      <div className="campaign-panel-head">
        <h3>Held Scenes</h3>
      </div>
      {data.beats.length > 0 ? (
        data.beats.map((beat) => (
          <div key={beat.id} className="campaign-row">
            <div>
              <strong>{beat.title}</strong>
              <div className="campaign-muted">
                {beat.statusLabel} | {beat.stageLabel}
              </div>
            </div>
            <span className={`campaign-risk ${beat.canonRiskClass}`}>{beat.canonRisk}</span>
          </div>
        ))
      ) : (
        <div className="campaign-empty">Hold a scene to keep it here for later.</div>
      )}
    </section>
  );
}

export function StoryTruthsPanel({ data }: { data: StoryTruthsPanelData }) {
  return (
    <section className="campaign-panel campaign-story-support-panel">
      <div className="campaign-panel-head">
        <h3>Protected Truths</h3>
      </div>
      {data.truths.length > 0 ? (
        data.truths.map((truth) => (
          <div key={truth.id} className="campaign-town-line is-risk">
            <strong>{truth.title}</strong>
            <span>{truth.rule}</span>
          </div>
        ))
      ) : (
        <div className="campaign-empty">No protected truths listed.</div>
      )}
    </section>
  );
}

export function StorySideFlowPanel({ data }: { data: StorySideFlowData }) {
  if (!data.hasFlow) {
    return (
      <section className="campaign-panel campaign-story-support-panel">
        <div className="campaign-panel-head">
          <h3>Side Routes</h3>
        </div>
        <div className="campaign-empty">No side route flow authored for this episode.</div>
      </section>
    );
  }
  return (
    <section className="campaign-panel campaign-story-support-panel">
      <div className="campaign-panel-head">
        <div>
          <h3>Side Routes</h3>
          <div className="campaign-muted">{data.summary}</div>
        </div>
        <div className="campaign-row-actions">
          <span className={`campaign-chip ${data.flowSynced ? "is-good" : "is-warn"}`}>
            {data.flowSynced ? "Updated" : "Not updated"}
          </span>
          <button
            className={`campaign-action ${data.flowSynced ? "" : "quest"}`}
            disabled={data.flowSynced}
            onClick={() => dispatchCampaignAction("story-sync-sidequests")}
          >
            Update Routes
          </button>
        </div>
      </div>
      <div className="campaign-town-columns">
        {data.columns.map((col, i) => (
          <SideFlowColumnView key={i} column={col} />
        ))}
      </div>
    </section>
  );
}

function SideFlowColumnView({ column }: { column: SideFlowColumn }) {
  if (column.items.length === 0) return null;
  return (
    <div>
      <div className="campaign-section-title">{column.label}</div>
      {column.items.map((item, i) => (
        <div key={i} className={`campaign-town-line is-${column.tone}`}>
          <strong>{item.title}</strong>
          <span>{item.reason}</span>
        </div>
      ))}
    </div>
  );
}
