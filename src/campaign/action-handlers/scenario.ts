// scenario.ts — Phase H.3 scenario lifecycle action handlers.
//
// start-scenario opens a generated scenario through ScenarioRunner.
// cancel-scenario asks the GM to confirm, clears the active run, restores
// scenario-bound availability and discards the run's generated scenario.
// discard-scenario removes a generated scenario (and its generated map)
// without cancelling an active run on it. Mode/tab jumps, mutation sources,
// op payloads, confirm copy and toast strings mirror the deleted closures.
//
// generate-scenario / inspect-scenario stay in the switch: generate reads the
// React form fields off `_root.querySelector('#campaign-gen-*')` (the React
// dispatch needs to pass them in the payload first), and inspect builds a
// modal whose card markup shares the closure-private `_shapePillsData` render
// helper. Both port in follow-ups.

import { applyOp, confirmDialog, cs, mod, rerender, setActiveModeRaw, setActiveTabRaw, toast } from "./context";

interface RunnerModule {
  startScenario?: (scenarioId: string) => unknown;
}
interface ActiveRun {
  scenarioId?: string;
}
interface Availability {
  status?: string;
  reason?: string;
  source?: string;
  expires?: string | null;
  updatedAt?: string;
}
interface PartyMember {
  availability?: Availability;
}

export function startScenarioFromUi(scenarioId: string): unknown {
  if (!scenarioId) return null;
  try {
    const run = mod<RunnerModule>("ScenarioRunner")?.startScenario?.(scenarioId);
    setActiveTabRaw("maps");
    rerender();
    return run;
  } catch (error) {
    toast((error as Error)?.message || "Scenario could not start", "error");
    return null;
  }
}

export function discardGeneratedScenario(scenarioId: string): void {
  if (!scenarioId) return;
  const state = cs().getState() as { activeScenarioRun?: ActiveRun } | null;
  if (state?.activeScenarioRun?.scenarioId === scenarioId) {
    toast("Cancel the active run first", "info");
    return;
  }
  confirmDialog("Discard this generated scenario?", () => {
    cs().mutate((next) => {
      const sc = (next as { sideContent?: { generatedScenarios?: Record<string, { mapId?: string }>; generatedMaps?: Record<string, unknown> } }).sideContent || {};
      const scenario = sc.generatedScenarios?.[scenarioId];
      const mapId = scenario?.mapId;
      if (sc.generatedScenarios) delete sc.generatedScenarios[scenarioId];
      if (mapId && sc.generatedMaps) delete sc.generatedMaps[mapId];
    }, { source: "scenario_discard" });
    applyOp({ op: "log", text: `Generated scenario discarded: ${scenarioId}.` }, "scenario_discard");
    toast("Scenario discarded", "info");
  });
}

export function cancelScenario(): void {
  const run = (cs().getState() as { activeScenarioRun?: ActiveRun } | null)?.activeScenarioRun;
  if (!run) return;
  confirmDialog("Cancel this scenario without recording a report?", () => {
    const scenarioId = run.scenarioId;
    cs().mutate((state) => {
      const s = state as {
        activeScenarioRun?: unknown;
        pendingBattle?: unknown;
        party?: Record<string, PartyMember>;
        sideContent?: { generatedScenarios?: Record<string, unknown> };
      };
      s.activeScenarioRun = null;
      s.pendingBattle = null;
      for (const member of Object.values(s.party || {})) {
        if (member.availability?.expires === "scenario") {
          member.availability = {
            status: "available",
            reason: "",
            source: "scenario_cancel",
            expires: null,
            updatedAt: new Date().toISOString()
          };
        }
      }
      if (scenarioId && s.sideContent?.generatedScenarios?.[scenarioId]) {
        delete s.sideContent.generatedScenarios[scenarioId];
      }
    }, { source: "scenario_cancel" });
    applyOp({ op: "log", text: `Scenario cancelled: ${scenarioId}.` }, "scenario_cancel");
    setActiveModeRaw("quest");
    setActiveTabRaw("scenarios");
    rerender();
    toast("Scenario cancelled", "info");
  });
}
