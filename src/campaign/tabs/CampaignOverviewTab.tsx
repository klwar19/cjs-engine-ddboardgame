// CampaignOverviewTab.tsx — Phase F JSX port of `_renderOverview`.
//
// The Overview tab is the campaign's town/dashboard view. Every
// panel is now JSX: dashboard wrapper, town snapshot (G.16), roll
// float (G.16), Adventure Desk action panel, and the shared result
// panels (solo notice, scenario summary, etc.). The town-snapshot
// rumor rows remain a small HTML bridge until HubTab ports (K.3).

import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction, type CampaignActionName } from "../actions";
import {
  getTownSnapshotData,
  getTownRollFloatData,
  getAdventureLegendVisible
} from "./data/overview";
import { TownSnapshotPanel, TownRollFloatPanel } from "./TownPanels";
import {
  EventResultPanel,
  OraclePanel,
  SoloNoticePanel,
  TravelSurprisePanel,
  CombatResultPanel,
  LastCombatResultPanel,
  LastReportPanel,
  PendingBattlePanel,
  ScenarioSummaryPanel
} from "./ResultPanels";

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignOverviewTab({ state }: Props) {
  const snapshot = getTownSnapshotData(state);
  const rollFloat = getTownRollFloatData(state);
  return (
    <div className="campaign-dashboard campaign-town-dashboard">
      {snapshot && <TownSnapshotPanel data={snapshot} />}
      <div className="campaign-town-float-stack">
        {rollFloat && <TownRollFloatPanel data={rollFloat} />}
        <SoloNoticePanel state={state} />
      </div>
      <AdventureDesk />
      <AdventureLegend state={state} />
      <ScenarioSummaryPanel state={state} />
      <TravelSurprisePanel state={state} />
      <PendingBattlePanel state={state} />
      <CombatResultPanel state={state} />
      <LastCombatResultPanel state={state} />
      <EventResultPanel state={state} />
      <OraclePanel state={state} />
      <LastReportPanel state={state} />
    </div>
  );
}

// AdventureLegend is purely static content rendered only when there's
// no active result to display — see `getAdventureLegendVisible`. The
// four legend items document the Adventure Desk outputs in place.
function AdventureLegend({ state }: { state: CampaignStateSnapshot }) {
  if (!getAdventureLegendVisible(state)) return null;
  return (
    <section className="campaign-panel campaign-legend">
      <div className="campaign-panel-head">
        <h3>What each output means</h3>
        <small className="campaign-muted">Click any Adventure Desk button to see a result here</small>
      </div>
      <div className="campaign-legend-grid">
        <div className="campaign-legend-item">
          <strong>📜 Story Offer / Hook</strong>
          <p>A narrative card with a suggested choice. Buttons let you <b>Accept</b> (apply choice's ops),
            <b> Make Quest</b> (add to Quest Tracker), <b>Make Rumor</b> (post to hub), or <b>Save</b>/<b>Ignore</b>.
            Accepting a quest offer also auto-starts its map run.</p>
        </div>
        <div className="campaign-legend-item">
          <strong>🎴 Event</strong>
          <p>A table-rolled event with prepared consequence ops (gold, danger, status, etc.).
            <b> Apply</b> commits the ops; <b>Edit First</b> lets you change them; <b>Save Note</b> just logs it;
            <b> Pin Plot Seed</b> stores it as a future hook; <b>Ignore</b> discards it.</p>
        </div>
        <div className="campaign-legend-item">
          <strong>🔮 GM Prompt (Oracle)</strong>
          <p>Pure inspiration text. <b>No bonuses</b> are applied to the campaign. Use it to riff a scene,
            then either <b>Save as Note</b> for later or <b>Reroll</b>.</p>
        </div>
        <div className="campaign-legend-item">
          <strong>⚔ Battle / Scenario</strong>
          <p>Battle Ready cards run combat (or take a manual result). Scenarios are the run/map flow;
            quests with linked maps will create one when you press <b>Map Run</b> in the Quest Tracker.</p>
        </div>
      </div>
    </section>
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
  readonly action: CampaignActionName;
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
