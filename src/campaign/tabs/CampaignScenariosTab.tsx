// CampaignScenariosTab.tsx — Phase F JSX port of `_renderScenarios`.
//
// Renders the Run Setup form (5 selects + 2 generate buttons) and the
// grid of scenario cards. Phase H.3 — the form is now controlled
// (useState per select) so the chosen values dispatch in the
// generate-scenario / generate-quest-scenario payload directly. The
// vanilla `_generateScenario` closure that used to read these via
// `_root.querySelector('#campaign-gen-*')` is gone; the TS handler
// (`action-handlers/scenario.ts::generateScenario`) reads the payload.
//
// Per-card quest pill, shape pill row, and Start/Continue/Inspect
// actions are full JSX (Phase G.15).

// Tier 1 perf: the CampaignScenarioGenerator engine (cjs-campaign-generators
// chunk) is deferred off the campaign boot path and co-located here for this
// tab's render path (getScenariosData reads the generator's map-type options).
// The cross-tab generate handlers await it via ./lazy-campaign-engine instead.
import "../../engine/campaign/campaign-scenario-generator";
import { useState } from "react";
import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import { getScenariosData, type ScenariosData, type ScenarioCard } from "./data/scenarios";
import { QuestPill, ShapePillsRow, ScenarioRunActions } from "./ScenarioChips";

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignScenariosTab({ state }: Props) {
  const data = getScenariosData(state);
  if (!data) {
    return (
      <section className="campaign-panel">
        <div className="campaign-empty">Scenarios not ready.</div>
      </section>
    );
  }
  return (
    <div className="campaign-dashboard">
      <RunSetupPanel data={data} />
      <ScenarioGrid
        scenarios={data.scenarios}
        activeRunScenarioId={data.activeRunScenarioId}
      />
    </div>
  );
}

// Form defaults match the vanilla closure (the `_root.querySelector`
// fallbacks: source='random', mapForm='node_map', mapType='any',
// size='small', layers=1). The IDs are kept on the elements so users
// inspecting the DOM (or downstream styling targeting `#campaign-gen-*`)
// keep working; nothing reads `.value` off them now.
function RunSetupPanel({ data }: { data: ScenariosData }) {
  const [source, setSource] = useState<string>("random");
  const [mapForm, setMapForm] = useState<string>("node_map");
  const [mapType, setMapType] = useState<string>("any");
  const [size, setSize] = useState<string>("small");
  const [layers, setLayers] = useState<string>("1");

  // Form payload — passed for both Generate & Quest-Based. The
  // generate-quest-scenario handler spreads this then forces
  // source='active_quest' (matching the deleted switch override).
  const payload = { source, mapForm, mapType, size, layers: Number(layers) };

  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head">
        <h2>Run Setup</h2>
        <span className="campaign-pill">Save-local</span>
      </div>
      <div className="campaign-generator-controls">
        <label>
          Source
          <select
            id="campaign-gen-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="random">Random</option>
            <option value="active_quest">Active Quest</option>
            <option value="quest_chain">Side Story</option>
          </select>
        </label>
        <label>
          Movement
          <select
            id="campaign-gen-form"
            value={mapForm}
            onChange={(e) => setMapForm(e.target.value)}
          >
            <option value="node_map">Node Map</option>
            <option value="grid_map">Grid Map</option>
          </select>
        </label>
        <label>
          Setting / Context
          <select
            id="campaign-gen-map-type"
            value={mapType}
            onChange={(e) => setMapType(e.target.value)}
          >
            {data.mapTypeOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label>
          Size
          <select
            id="campaign-gen-size"
            value={size}
            onChange={(e) => setSize(e.target.value)}
          >
            {data.sizeOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label>
          Layers
          <select
            id="campaign-gen-layers"
            value={layers}
            onChange={(e) => setLayers(e.target.value)}
          >
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </label>
      </div>
      <div className="campaign-action-grid">
        <button
          className="campaign-action primary"
          onClick={() => dispatchCampaignAction("generate-scenario", payload)}
          disabled={data.hasActiveRun}
        >
          Generate &amp; Start
        </button>
        <button
          className="campaign-action"
          onClick={() => dispatchCampaignAction("generate-quest-scenario", payload)}
          disabled={data.hasActiveRun}
        >
          Quest-Based
        </button>
      </div>
    </section>
  );
}

function ScenarioGrid({
  scenarios,
  activeRunScenarioId
}: {
  scenarios: readonly ScenarioCard[];
  activeRunScenarioId: string | null;
}) {
  if (!scenarios.length) return <div className="campaign-empty">No runs available.</div>;
  return (
    <div className="campaign-tab-grid">
      {scenarios.map((scenario) => (
        <ScenarioCardView
          key={scenario.id}
          scenario={scenario}
          discardDisabled={activeRunScenarioId === scenario.id}
        />
      ))}
    </div>
  );
}

function ScenarioCardView({
  scenario,
  discardDisabled
}: {
  scenario: ScenarioCard;
  discardDisabled: boolean;
}) {
  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head">
        <h3>{scenario.name}</h3>
        <span className="campaign-pill">{scenario.pillLabel}</span>
        <QuestPill data={scenario.questPill} />
      </div>
      <ShapePillsRow data={scenario.shapePills} />
      {scenario.notes && <div className="campaign-muted">{scenario.notes}</div>}
      <div className="campaign-action-grid">
        <ScenarioRunActions data={scenario.runActions} />
        {scenario.generated && (
          <button
            className="campaign-action danger"
            onClick={() => dispatchCampaignAction("discard-scenario", { id: scenario.id })}
            disabled={discardDisabled}
          >
            Discard
          </button>
        )}
      </div>
    </section>
  );
}
