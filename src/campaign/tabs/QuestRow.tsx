// QuestRow.tsx — Phase G JSX port of `_renderQuestRow`.
//
// One JSX component rendering one quest card. Shared by QuestHome
// (first 4 active quests) and QuestsPanel (all active + resolved).
// Action buttons use direct onClick handlers via dispatchCampaignAction
// with the quest id payload. The scenario pill at the title row uses
// the shared typed `<QuestPill>` (G.15 + Phase G completion).

import { dispatchCampaignAction, type CampaignActionName } from "../actions";
import { memoDeep } from "../util/memo";
import type { QuestRowData, QuestObjective, QuestVariant } from "./data/questRow";
import { QuestPill } from "./ScenarioChips";

function QuestRowView({ row }: { row: QuestRowData }) {
  return (
    <article className={`campaign-quest-card ${row.resolved ? "is-resolved" : ""}`}>
      <div className="campaign-quest-main">
        <div className="campaign-quest-title-row">
          <strong>{row.title}</strong>
          <span className={`campaign-pill campaign-quest-status ${row.statusClass}`}>
            {row.statusLabel}
          </span>
          <QuestPill data={row.scenarioPill} />
        </div>
        {row.metaLine && <div className="campaign-muted">{row.metaLine}</div>}
        {row.summary && <div className="campaign-muted">{row.summary}</div>}
        {row.variant && <VariantBlock variant={row.variant} />}
        {row.tagChips.length > 0 && (
          <div className="campaign-chip-row campaign-context-tags">
            {row.tagChips.map((tag, i) => (
              <span key={i} className="campaign-chip">{tag}</span>
            ))}
          </div>
        )}
        <div className="campaign-quest-phase">
          <span>Phase</span>
          <strong>{row.phaseLabel}</strong>
          <small>{row.doneCount}/{row.totalCount}</small>
        </div>
        <div className="campaign-quest-objectives">
          {row.objectives.length ? (
            row.objectives.map((obj) => <ObjectiveRow key={obj.id} obj={obj} />)
          ) : (
            <div className="campaign-muted">No written objective yet.</div>
          )}
        </div>
      </div>
      {!row.resolved && <QuestActions row={row} />}
    </article>
  );
}

// List item rendered once per quest (up to 4 in QuestHome, all in
// QuestsPanel). Memoized by value so editing one quest re-renders only that
// row, not every sibling, when the parent tab rebuilds its list.
export const QuestRow = memoDeep(QuestRowView);

function VariantBlock({ variant }: { variant: QuestVariant }) {
  return (
    <div className="campaign-quest-variant">
      {variant.label && <strong>{variant.label}</strong>}
      {variant.text && <span>{variant.text}</span>}
      {variant.repeat && <small>{variant.repeat}</small>}
    </div>
  );
}

function ObjectiveRow({ obj }: { obj: QuestObjective }) {
  return (
    <div className={`campaign-quest-objective ${obj.done ? "is-done" : ""}`}>
      <div>
        <strong>{obj.label}</strong>
        <small>{obj.current}/{obj.required}</small>
      </div>
      <div className="campaign-quest-progress">
        <span style={{ width: `${obj.pct}%` }} />
      </div>
      {obj.pulseHints.length > 0 && (
        <div className="campaign-quest-pulse">
          {obj.pulseHints.map((hint, i) => <span key={i}>{hint}</span>)}
        </div>
      )}
    </div>
  );
}

function QuestActions({ row }: { row: QuestRowData }) {
  return (
    <div className="campaign-quest-actions">
      <ActionBtn
        action="quest-scenario"
        label={row.scenarioLabel}
        hint={row.scenarioHint}
        kind="primary"
        data={{ id: row.id }}
        disabled={row.scenarioDisabled}
      />
      <ActionBtn
        action="quest-progress"
        label="Progress"
        hint="Tick an objective forward by 1"
        data={{ id: row.id }}
      />
      <details className="campaign-action-menu">
        <summary className="campaign-action-menu-trigger">
          <span>Quest Actions</span>
        </summary>
        <div className="campaign-action-menu-panel">
          <ActionBtn action="quest-battle" label="Battle" hint="Run a battle linked to this quest" data={{ id: row.id }} />
          <ActionBtn action="quest-hub-event" label="Hub Scene" hint="Run one logical hub scene and tick an objective" data={{ id: row.id }} />
          <ActionBtn action="quest-harvest" label="Harvest" hint="Manual harvest/gather progress with light loot" data={{ id: row.id }} />
          {row.hasMiniGame && (
            <ActionBtn action="quest-minigame" label="Mini-Game" hint="Play the linked puzzle room and apply its result" data={{ id: row.id }} />
          )}
          <ActionBtn action="quest-check" label="Check" hint="Make a stat or skill check toward this quest" data={{ id: row.id }} />
          <ActionBtn action="quest-hand-in" label="Hand In" hint="Deliver an item to complete an objective" data={{ id: row.id }} />
          <ActionBtn action="quest-answer" label="Answer" hint="Resolve a riddle / dialog objective" data={{ id: row.id }} />
          <ActionBtn action="quest-complete" label="Resolve" hint="Mark complete and grant rewards" data={{ id: row.id }} />
          <ActionBtn action="quest-fail" label="Fail" hint="Mark failed (no rewards)" kind="danger" data={{ id: row.id }} />
        </div>
      </details>
    </div>
  );
}

function ActionBtn({
  action,
  label,
  hint,
  kind,
  data,
  disabled
}: {
  action: CampaignActionName;
  label: string;
  hint: string;
  kind?: string;
  data?: Record<string, string | number>;
  disabled?: boolean;
}) {
  const cls = ["campaign-action", "has-hint"];
  if (kind) cls.push(kind);
  const payload = data
    ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))
    : {};
  return (
    <button
      className={cls.join(" ")}
      onClick={() => dispatchCampaignAction(action, payload)}
      title={hint}
      disabled={!!disabled}
    >
      <span className="campaign-action-label">{label}</span>
      <small className="campaign-action-hint">{hint}</small>
    </button>
  );
}
