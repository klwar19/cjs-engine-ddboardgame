// ModeBar.tsx — Phase F JSX port of `_renderModeBar` and
// `_renderScenarioHud`.
//
// Renders the primary mode buttons (world/story/quest/event/activities),
// the optional scenario HUD pills between them, and the utility-tab
// buttons (Current Run / Party / Relationships / Logs / Settings).
// onClick handlers route through `setActiveMode/setActiveTab` (the
// bridge), and the scenario HUD buttons dispatch their legacy actions
// via dispatchCampaignAction.

import { dispatchCampaignAction } from "../actions";
import { setActiveMode, setActiveTab } from "./bridge";
import type { ModeBarData, ScenarioHudData } from "./types";

interface Props {
  readonly data: ModeBarData;
}

export function CampaignModeBar({ data }: Props) {
  return (
    <div className="campaign-modes">
      <div className="campaign-modes-primary">
        {data.modes.map((mode) => {
          const active = mode.id === data.activeMode;
          return (
            <button
              key={mode.id}
              className={`campaign-mode-btn ${active ? "active" : ""}`}
              onClick={() => setActiveMode(mode.id)}
            >
              <span className="campaign-mode-icon">{mode.icon}</span>
              <span>{mode.label}</span>
            </button>
          );
        })}
      </div>
      {data.scenarioHud ? <ScenarioHud hud={data.scenarioHud} /> : <div className="campaign-hud-spacer" />}
      <div className="campaign-modes-utility">
        {data.utilityTabs.map((tab) => {
          const active = tab.id === data.activeTab;
          return (
            <button
              key={tab.id}
              className={`campaign-util-btn ${active ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScenarioHud({ hud }: { hud: ScenarioHudData }) {
  return (
    <div className="campaign-scenario-hud">
      <span className="campaign-pill is-current">{hud.scenarioName}</span>
      <span className="campaign-pill">Danger {hud.danger}/{hud.dangerMax}</span>
      <span className="campaign-pill">Camps {hud.campsUsed}/{hud.campsMax}</span>
      <span className="campaign-pill">Battles {hud.battlesUsed}/{hud.battlesMax}</span>
      <button
        className="campaign-action"
        onClick={() => dispatchCampaignAction("open-maps-tab")}
      >
        Run
      </button>
      <button
        className="campaign-action danger"
        onClick={() => dispatchCampaignAction("end-scenario")}
      >
        End
      </button>
      {hud.generated && (
        <button
          className="campaign-action danger"
          onClick={() => dispatchCampaignAction("cancel-scenario")}
          title="Discard without recording a report"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
