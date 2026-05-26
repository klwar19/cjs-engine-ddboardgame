// CampaignOverviewTab.tsx — Phase F JSX port of `_renderOverview`.
//
// The Overview tab is the campaign's town/dashboard view. Its outer
// structure is JSX now: dashboard wrapper, float stack, Adventure
// Desk action panel. The Adventure Desk's three control groups are
// fully JSX-driven (the ~22 actions use direct onClick handlers via
// dispatchCampaignAction).
//
// The shared read-only sub-panels (town snapshot, roll float, solo
// notice, scenario summary, etc.) still render through HTML-string
// bridges. Each is its own `<Section>` block; porting one to JSX
// means replacing one dangerouslySetInnerHTML and removing the
// matching case from `renderOverviewSectionHtml` in campaign-ui.js.

import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import { renderOverviewSectionHtml, type OverviewSectionId } from "./data/overview";

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignOverviewTab({ state }: Props) {
  return (
    <div className="campaign-dashboard campaign-town-dashboard">
      <Section state={state} id="townSnapshot" />
      <div className="campaign-town-float-stack">
        <Section state={state} id="townRollFloat" />
        <Section state={state} id="soloNotice" />
      </div>
      <AdventureDesk />
      <Section state={state} id="adventureLegend" />
      <Section state={state} id="scenarioSummary" />
      <Section state={state} id="travelSurprise" />
      <Section state={state} id="pendingBattle" />
      <Section state={state} id="combatResult" />
      <Section state={state} id="lastCombatResult" />
      <Section state={state} id="eventResult" />
      <Section state={state} id="oracle" />
      <Section state={state} id="lastReport" />
    </div>
  );
}

// Renders one sub-panel of the overview via the HTML bridge. Empty
// strings render nothing (the matching `_renderXxx` returns '' when
// there's no data — e.g. no pending battle, no last oracle).
function Section({ state, id }: { state: CampaignStateSnapshot; id: OverviewSectionId }) {
  const html = renderOverviewSectionHtml(id, state);
  if (!html) return null;
  return (
    <div
      className={`campaign-overview-section campaign-overview-${id}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ── Adventure Desk ──────────────────────────────────────────────────
// Three control groups: roll random / pick or customize / run admin.
// Each control group is the same panel pattern with a title, a help
// line, and a grid of action buttons. Buttons use dispatchCampaignAction
// directly — no `data-campaign-action` markers stamped into innerHTML.
function AdventureDesk() {
  return (
    <section className="campaign-panel campaign-actions-panel campaign-town-actions">
      <div className="campaign-panel-head">
        <div>
          <h2>Adventure Desk</h2>
          <div className="campaign-muted">
            Roll something random, pick something specific, or run admin tools. Every result shows its consequence before it touches the save.
          </div>
        </div>
      </div>
      <div className="campaign-control-stack">
        <ControlGroup
          title="Roll Random"
          help="Random outputs land in the floating box and result cards. Nothing is committed until you accept it."
          actions={[
            { action: "solo-surprise", label: "Story Offer", hint: "Hook card you can accept, make quest, plant as rumor, save, or ignore", kind: "primary" },
            { action: "random-quest-offer", label: "Quest Run", hint: "Pick a random quest template and auto-start its map run" },
            { action: "random-rumor-offer", label: "Rumor Hook", hint: "Create a marked lead bank item. No mechanics happen until you promote it later" },
            { action: "roll-oracle", label: "Roll GM Prompt", hint: "GM inspiration text only. No bonuses applied" }
          ]}
        />
        <ControlGroup
          title="Pick / Customize"
          help="Same outputs as Roll Random but you choose what shows up. Rumors are saved leads, not automatic mechanics."
          actions={[
            { action: "add-quest", label: "Add Quest", hint: "Quest builder: pick template, edit fields, optionally start its run" },
            { action: "manual-rumor", label: "Write Rumor", hint: "Type a custom lead into the hub rumor bank" },
            { action: "pick-event", label: "Pick Event", hint: "Choose a specific authored event from the catalog" },
            { action: "custom-event", label: "Custom Event", hint: "Write your own event with optional quick consequence" },
            { action: "pick-oracle", label: "Pick GM Prompt", hint: "Pick a specific GM prompt from the catalog" },
            { action: "custom-oracle", label: "Custom Prompt", hint: "Type your own GM scene prompt" }
          ]}
        />
        <ControlGroup
          title="Run Admin"
          help="Game-state controls. These commit immediately."
          actions={[
            { action: "pass-phase", label: "Pass Phase", hint: "Advance the campaign phase: ticks timers, ages rumors, advances quests" },
            { action: "full-rest", label: "Full Rest", hint: "Restore party HP/MP and clear non-permanent statuses" },
            { action: "travel-world", label: "Travel World", hint: "Switch to a different world / region in your campaign" }
          ]}
        />
      </div>
    </section>
  );
}

interface ControlAction {
  readonly action: string;
  readonly label: string;
  readonly hint: string;
  readonly kind?: string;
}

// Mirrors `_controlGroup`: titled section with a help line and a
// button grid. Used inside AdventureDesk.
function ControlGroup({
  title,
  help,
  actions
}: {
  title: string;
  help: string;
  actions: readonly ControlAction[];
}) {
  return (
    <div className="campaign-control-group">
      <div className="campaign-control-title">{title}</div>
      <div className="campaign-control-help">{help}</div>
      <div className="campaign-action-grid">
        {actions.map((act) => <ActionButton key={act.action} {...act} />)}
      </div>
    </div>
  );
}

// Mirrors `_actionBtn`. Routes through dispatchCampaignAction so the
// vanilla `_handleAction` switch keeps owning these flows.
function ActionButton({ action, label, hint, kind }: ControlAction) {
  const cls = ["campaign-action", "has-hint"];
  if (kind) cls.push(kind);
  return (
    <button
      className={cls.join(" ")}
      onClick={() => dispatchCampaignAction(action)}
      title={hint}
    >
      <span className="campaign-action-label">{label}</span>
      <small className="campaign-action-hint">{hint}</small>
    </button>
  );
}
