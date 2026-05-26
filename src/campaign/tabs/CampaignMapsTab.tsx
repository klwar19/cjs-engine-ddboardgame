// CampaignMapsTab.tsx — Phase F JSX port of `_renderRun`.
//
// Renders the Current Run / Maps tab. Four variants:
//   • No active run — empty state + "Run Setup" button.
//   • Freeform — stat grid + control stack + optional set-battles.
//   • Linear — stat grid + beat list + control stack.
//   • Node/Grid map — empty `#campaign-map-region` div. The vanilla
//     render() schedules `CampaignMap.render(mapRegion)` in a
//     setTimeout(0); we keep the same id so that lookup still works.
//
// Action buttons use direct onClick handlers via dispatchCampaignAction.

import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import {
  getRunData,
  type RunData,
  type RunStats,
  type FreeformPanel,
  type LinearPanel,
  type LinearBeat,
  type SetBattle
} from "./data/run";
import {
  EventResultPanel,
  TravelSurprisePanel,
  PendingBattlePanel,
  CombatResultPanel,
  LastCombatResultPanel
} from "./ResultPanels";

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignMapsTab({ state }: Props) {
  const data = getRunData(state);
  if (!data) {
    return (
      <section className="campaign-panel">
        <div className="campaign-empty">Run not ready.</div>
      </section>
    );
  }
  if (!data.hasRun) {
    return (
      <section className="campaign-panel">
        <div className="campaign-panel-head"><h2>Current Run</h2></div>
        <div className="campaign-empty">No run active. Start one from Run Setup.</div>
        <div className="campaign-action-grid">
          <button
            className="campaign-action primary"
            onClick={() => dispatchCampaignAction("open-scenarios-tab")}
          >
            Run Setup
          </button>
        </div>
      </section>
    );
  }
  return (
    <div className="campaign-dashboard">
      {data.mode === "freeform" && data.freeform && data.run ? (
        <FreeformRunPanel data={data} run={data.run} freeform={data.freeform} />
      ) : data.mode === "linear" && data.linear && data.run ? (
        <LinearRunPanel data={data} run={data.run} linear={data.linear} />
      ) : (
        // node_map / grid_map / anything else: CampaignMap renders here.
        <div id="campaign-map-region" />
      )}
      <TravelSurprisePanel state={state} />
      <PendingBattlePanel state={state} />
      <CombatResultPanel state={state} />
      <LastCombatResultPanel state={state} />
      <EventResultPanel state={state} />
    </div>
  );
}

function HtmlBridge({ html, className }: { html: string; className: string }) {
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function StatGrid({ run, includeEvents }: { run: RunStats; includeEvents: boolean }) {
  return (
    <div className="campaign-stat-grid">
      <span>Danger <b>{run.danger}/{run.dangerMax}</b></span>
      <span>Camps <b>{run.campsUsed}/{run.campsMax}</b></span>
      {includeEvents && <span>Battles <b>{run.battlesUsed}/{run.battlesMax}</b></span>}
      {includeEvents && <span>Events <b>{run.eventsUsed}/{run.eventsMax}</b></span>}
    </div>
  );
}

function PanelHead({ data, modeLabel }: { data: RunData; modeLabel: string }) {
  return (
    <>
      <div className="campaign-panel-head">
        <h2>{data.scenarioName}</h2>
        <span className="campaign-pill">{modeLabel}</span>
        {data.questPillHtml && (
          <span
            className="campaign-run-quest-pill-bridge"
            dangerouslySetInnerHTML={{ __html: data.questPillHtml }}
          />
        )}
      </div>
      {data.shapePillsHtml && (
        <div
          className="campaign-shape-pills-bridge"
          dangerouslySetInnerHTML={{ __html: data.shapePillsHtml }}
        />
      )}
    </>
  );
}

function FreeformRunPanel({
  data,
  run,
  freeform
}: {
  data: RunData;
  run: RunStats;
  freeform: FreeformPanel;
}) {
  return (
    <section className="campaign-panel">
      <PanelHead data={data} modeLabel="Freeform" />
      <div className="campaign-muted">{data.scenarioNotes || "No map. Pick what happens next."}</div>
      <StatGrid run={run} includeEvents={true} />
      <div className="campaign-control-stack">
        <ControlGroup
          title="Roll Random"
          help="Random output appears below the panel as a card you accept, edit, or ignore."
          actions={[
            { action: "run-roll-battle", label: "Random Battle", hint: "Roll from this scenario's battle pool", kind: "primary" },
            { action: "roll-travel-surprise", label: "Movement Surprise", hint: "Random encounter from movement (loot, danger, character)" }
          ]}
        />
        <ControlGroup
          title="Pick / Manual"
          help="Direct controls. End Run writes a report; Cancel (in summary) discards without one."
          actions={[
            { action: "run-pick-battle", label: "Pick Battle", hint: "Pick a specific battle from the catalog" },
            { action: "camp-rest", label: "Camp Rest", hint: "Spend a camp slot to heal and recover" },
            { action: "run-tick-danger", label: "Tick Danger +1", hint: "Manually raise danger (GM control)" },
            { action: "end-scenario", label: "End Run", hint: "Finish run and write a report", kind: "danger" }
          ]}
        />
      </div>
      {freeform.setBattles.length > 0 && (
        <>
          <div className="campaign-panel-head" style={{ marginTop: 14 }}>
            <h3>Set Battles</h3>
          </div>
          {freeform.setBattles.map((battle) => (
            <SetBattleRow key={battle.id} battle={battle} />
          ))}
        </>
      )}
    </section>
  );
}

function SetBattleRow({ battle }: { battle: SetBattle }) {
  return (
    <div className="campaign-row">
      <div>
        <strong>{battle.label}</strong>
        <div className="campaign-muted">{battle.sub}</div>
      </div>
      <button
        className="campaign-action"
        onClick={() => dispatchCampaignAction("run-queue-set-battle", { "battle-id": battle.id })}
      >
        Queue
      </button>
    </div>
  );
}

function LinearRunPanel({
  data,
  run,
  linear
}: {
  data: RunData;
  run: RunStats;
  linear: LinearPanel;
}) {
  const beatLabel = `Linear · Beat ${Math.min(linear.currentIndex + 1, linear.totalBeats)}/${linear.totalBeats}`;
  return (
    <section className="campaign-panel">
      <PanelHead data={data} modeLabel={beatLabel} />
      <div className="campaign-muted">{data.scenarioNotes}</div>
      <StatGrid run={run} includeEvents={false} />
      <ol className="campaign-beat-list" id="campaign-beat-list">
        {linear.beats.map((beat) => <BeatRow key={beat.id || beat.number} beat={beat} />)}
      </ol>
      <div className="campaign-control-stack">
        <ControlGroup
          title="Run Flow"
          actions={[
            {
              action: "run-next-beat",
              label: linear.allDone ? "All Beats Done" : "Next Beat",
              hint: linear.allDone ? "All authored beats are resolved" : "Advance to the next beat",
              kind: "primary",
              disabled: linear.allDone
            },
            { action: "roll-travel-surprise", label: "Movement Surprise", hint: "Random encounter from movement" }
          ]}
        />
        <ControlGroup
          title="Manual Control"
          actions={[
            { action: "run-pick-battle", label: "Pick Battle", hint: "Pick a specific battle from the catalog" },
            { action: "camp-rest", label: "Camp Rest", hint: "Spend a camp slot to heal and recover" },
            { action: "end-scenario", label: "End Run", hint: "Finish run and write a report", kind: "danger" }
          ]}
        />
      </div>
    </section>
  );
}

function BeatRow({ beat }: { beat: LinearBeat }) {
  const cls = ["campaign-beat"];
  if (beat.isCurrent) cls.push("is-current");
  else if (beat.isDone) cls.push("is-done");
  const sub = [beat.kind, beat.encounterId, beat.prompt].filter(Boolean).join(" · ");
  return (
    <li className={cls.join(" ")} data-beat-id={beat.id}>
      <span className="campaign-beat-num">{beat.number}</span>
      <span className="campaign-beat-icon">{beat.iconChar}</span>
      <div className="campaign-beat-body">
        <strong>{beat.label}</strong>
        <div className="campaign-muted">{sub}</div>
      </div>
    </li>
  );
}

interface ControlAction {
  readonly action: string;
  readonly label: string;
  readonly hint: string;
  readonly kind?: string;
  readonly disabled?: boolean;
}

function ControlGroup({
  title,
  help,
  actions
}: {
  title: string;
  help?: string;
  actions: readonly ControlAction[];
}) {
  return (
    <div className="campaign-control-group">
      <div className="campaign-control-title">{title}</div>
      {help && <div className="campaign-control-help">{help}</div>}
      <div className="campaign-action-grid">
        {actions.map((act) => <ActionButton key={act.action} {...act} />)}
      </div>
    </div>
  );
}

function ActionButton({ action, label, hint, kind, disabled }: ControlAction) {
  const cls = ["campaign-action"];
  if (kind) cls.push(kind);
  if (hint) cls.push("has-hint");
  return (
    <button
      className={cls.join(" ")}
      onClick={() => dispatchCampaignAction(action)}
      title={hint}
      disabled={!!disabled}
    >
      <span className="campaign-action-label">{label}</span>
      {hint && <small className="campaign-action-hint">{hint}</small>}
    </button>
  );
}
