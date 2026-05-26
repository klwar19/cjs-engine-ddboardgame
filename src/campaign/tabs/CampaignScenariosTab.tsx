// CampaignScenariosTab.tsx — Phase F JSX port of `_renderScenarios`.
//
// Renders the Run Setup form (5 selects + 2 generate buttons) and the
// grid of scenario cards. The form-input IDs match the vanilla
// implementation so the legacy `_generateScenario` action handler
// keeps reading them from `_root.querySelector('#campaign-gen-*')`.
//
// Per-card "run actions" (Start / Continue / Inspect / Discard) still
// come through the HTML bridge — they encode multiple dynamic states
// (active run, current run, generated vs authored). They'll port when
// the scenario-action handlers get typed wrappers.

import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import { getScenariosData, type ScenariosData, type ScenarioCard } from "./data/scenarios";

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

function RunSetupPanel({ data }: { data: ScenariosData }) {
  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head">
        <h2>Run Setup</h2>
        <span className="campaign-pill">Save-local</span>
      </div>
      <div className="campaign-generator-controls">
        <label>
          Source
          <select id="campaign-gen-source" defaultValue="random">
            <option value="random">Random</option>
            <option value="active_quest">Active Quest</option>
            <option value="quest_chain">Side Story</option>
          </select>
        </label>
        <label>
          Movement
          <select id="campaign-gen-form" defaultValue="node_map">
            <option value="node_map">Node Map</option>
            <option value="grid_map">Grid Map</option>
          </select>
        </label>
        <label>
          Setting / Context
          <select id="campaign-gen-map-type" defaultValue="any">
            {data.mapTypeOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label>
          Size
          <select id="campaign-gen-size" defaultValue="small">
            {data.sizeOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label>
          Layers
          <select id="campaign-gen-layers" defaultValue="1">
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </label>
      </div>
      <div className="campaign-action-grid">
        <button
          className="campaign-action primary"
          onClick={() => dispatchCampaignAction("generate-scenario")}
          disabled={data.hasActiveRun}
        >
          Generate &amp; Start
        </button>
        <button
          className="campaign-action"
          onClick={() => dispatchCampaignAction("generate-quest-scenario")}
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
        {scenario.questPillHtml && (
          <span
            className="campaign-scenario-quest-pill-bridge"
            dangerouslySetInnerHTML={{ __html: scenario.questPillHtml }}
          />
        )}
      </div>
      {scenario.shapePillsHtml && (
        <div
          className="campaign-shape-pills-bridge"
          dangerouslySetInnerHTML={{ __html: scenario.shapePillsHtml }}
        />
      )}
      {scenario.notes && <div className="campaign-muted">{scenario.notes}</div>}
      <div className="campaign-action-grid">
        <div
          className="campaign-scenario-actions-bridge"
          dangerouslySetInnerHTML={{ __html: scenario.runActionsHtml }}
        />
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
