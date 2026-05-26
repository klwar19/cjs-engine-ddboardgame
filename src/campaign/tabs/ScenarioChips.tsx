// ScenarioChips.tsx — Phase G.15 JSX components for the shared
// scenario chips and per-card run actions used by Scenarios, Maps
// (Current Run), and the ScenarioSummary panel.

import { dispatchCampaignAction } from "../actions";
import type {
  QuestPillData,
  ShapePillsData,
  ScenarioRunActionsData
} from "./data/scenarioShared";

export function QuestPill({ data }: { data: QuestPillData | null }) {
  if (!data) return null;
  const cls = ["campaign-pill"];
  if (data.linkable) cls.push("campaign-pill-link");
  if (data.muted) cls.push("campaign-muted-pill");
  return (
    <span className={cls.join(" ")} title={data.title}>
      {data.label}
    </span>
  );
}

export function ShapePillsRow({ data }: { data: ShapePillsData }) {
  if (data.pills.length === 0) return null;
  return (
    <div className="campaign-chip-row">
      {data.pills.map((pill, i) => (
        <span key={i} className="campaign-chip">{pill.label}</span>
      ))}
    </div>
  );
}

export function ScenarioRunActions({ data }: { data: ScenarioRunActionsData }) {
  return (
    <>
      <ScenarioStartButton data={data} />
      <button
        className="campaign-action"
        title="Open a read-only sheet showing beats, danger budget, and rewards. Does not start it."
        onClick={() => dispatchCampaignAction("inspect-scenario", { id: data.scenarioId })}
      >
        Inspect
      </button>
    </>
  );
}

function ScenarioStartButton({ data }: { data: ScenarioRunActionsData }) {
  if (data.startState === "continue") {
    return (
      <button
        className="campaign-action primary"
        title="This run is already active."
        onClick={() => dispatchCampaignAction("open-maps-tab")}
      >
        Continue Run
      </button>
    );
  }
  if (data.startState === "other_active") {
    return (
      <button
        className="campaign-action"
        disabled
        title="Finish or cancel the current run before starting another."
      >
        Current Run Active
      </button>
    );
  }
  return (
    <button
      className="campaign-action primary"
      title="Begin this as the current run. Generates a map, applies danger, and switches to Current Run."
      onClick={() => dispatchCampaignAction("start-scenario", { id: data.scenarioId })}
    >
      Start Run
    </button>
  );
}
