// scenario.ts — Phase H.3 scenario lifecycle action handlers.
//
// start-scenario opens a generated scenario through ScenarioRunner.
// cancel-scenario asks the GM to confirm, clears the active run, restores
// scenario-bound availability and discards the run's generated scenario.
// discard-scenario removes a generated scenario (and its generated map)
// without cancelling an active run on it. generate-scenario (+ the static
// generate-*-run variants and the quest-source generate-quest-scenario) call
// CampaignScenarioGenerator with the payload-passed form values (the React
// `CampaignScenariosTab` now passes the form state in the payload — no more
// `_root.querySelector('#campaign-gen-*')` reads). inspect-scenario builds
// the Run Inspect modal whose shape-pill row reuses the typed TS
// `shapePillsData` helper from `tabs/data/scenarioShared.ts` (the JS
// `getShapePillsData` bridge it used to consult ported alongside the
// data builders in H.4). Mode/tab jumps, mutation sources, op
// payloads, confirm copy and toast strings mirror the deleted closures.

import { applyOp, confirmDialog, cs, mod, ops, rerender, setActiveModeRaw, setActiveTabRaw, toast } from "./context";
import { esc, widgets } from "./modals";
import { goto } from "./nav";
import { shapePillsData, type ScenarioForShape } from "../tabs/data/scenarioShared";

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

// generateAndStart returns either `{ error }` (already-active run / no
// quest / no chain) or `{ scenario, map, seed, context, options }` on
// success. The TS handler treats it as the latter on the happy path.
interface GeneratorResult {
  error?: "active_run" | "no_active_quest" | "no_active_chain" | string;
  scenario?: { id?: string; name?: string; [key: string]: unknown };
  [key: string]: unknown;
}

interface GeneratorModule {
  generateAndStart?: (options: Record<string, unknown>) => GeneratorResult | null | undefined;
}

// Form / launcher payload — `mapType`/`mapSetting` resolve identically
// upstream (`_normalizeOptions` uses `mapSetting || mapType`), so the
// payload can carry just `mapType` (React form) or full overrides
// (JS launchers passing questId / quest / mapForm / forceGenerated / ...).
type GeneratePayload = Record<string, unknown>;

const GEN_ERROR_TOASTS: Record<string, string> = {
  active_run: "End the active scenario before generating another",
  no_active_quest: "No active quest to source from. Add one in the Quests tab first.",
  no_active_chain: "No active quest arc. Start one from the Quests tab first."
};

export function generateScenario(payload: GeneratePayload = {}): GeneratorResult | null {
  // Mirror the early-out the closure used so the toast fires before the
  // generator does its own active-run check (preserves the original copy).
  const active = (cs().getState() as { activeScenarioRun?: unknown } | null)?.activeScenarioRun;
  if (active) {
    toast("End the active scenario before generating another", "info");
    return null;
  }
  // Defaults first, payload wins. Mirrors the old `{ source: form ||
  // 'random', ..., ...overrides }` order — the React form passes the
  // chosen values in the payload (no more DOM reads), JS launchers
  // (still-in-JS `_startQuestScenario` etc.) pass their explicit values
  // through the runtime, and pass-through keys (questId / quest /
  // forceGenerated / questChainId) reach the generator unchanged.
  const options: Record<string, unknown> = {
    source: "random",
    mapForm: "node_map",
    mapType: "any",
    mapSetting: "any",
    size: "small",
    layers: 1,
    ...payload
  };
  const result = mod<GeneratorModule>("CampaignScenarioGenerator")?.generateAndStart?.(options) ?? null;
  if (!result || result.error) {
    const message = GEN_ERROR_TOASTS[String(result?.error ?? "")] ?? "Scenario generation skipped";
    toast(message, "info");
    return result;
  }
  setActiveModeRaw("quest");
  setActiveTabRaw("maps");
  rerender();
  toast(`Started ${result.scenario?.name ?? "scenario"}`, "success");
  return result;
}

// Scenario shape used by inspect — only the fields the modal reads.
interface InspectScenario {
  id?: string;
  name?: string;
  notes?: string;
  summary?: string;
  travelMode?: string;
  mapId?: string;
  mapForm?: string;
  beats?: Array<Record<string, unknown>>;
  nodes?: Array<Record<string, unknown>>;
  map?: { nodes?: Array<Record<string, unknown>>; [key: string]: unknown };
  rewardOps?: unknown[];
  rewards?: unknown[];
  dangerMax?: number;
  limits?: { events?: number; randomBattles?: number; campRests?: number };
}

function inspectEntryLine(entry: Record<string, unknown>, index: number): string {
  const label = entry.label ?? entry.name ?? entry.id ?? "";
  const hint = entry.prompt ?? entry.notes ?? entry.kind ?? entry.role ?? "";
  return `
            <div class="campaign-step">
              <b>${index + 1}. ${esc(label)}</b>
              <span>${esc(hint)}</span>
            </div>`;
}

export function inspectScenario(scenarioId: string): void {
  if (!scenarioId) return;
  const scenario = cs().getScenarioById(scenarioId) as InspectScenario | null | undefined;
  if (!scenario) {
    toast("Run not found", "info");
    return;
  }
  const ui = widgets();
  if (!ui) return;

  const beats = scenario.beats ?? [];
  const nodes = scenario.nodes ?? scenario.map?.nodes ?? [];
  const rewards = ops().describe((scenario.rewardOps ?? scenario.rewards ?? []) as Array<{ op: string }>);
  const dangers = [
    scenario.dangerMax ? `Danger max ${scenario.dangerMax}` : "",
    scenario.limits?.events !== undefined ? `${scenario.limits.events} event rolls` : "",
    scenario.limits?.randomBattles !== undefined ? `${scenario.limits.randomBattles} random battles` : "",
    scenario.limits?.campRests !== undefined ? `${scenario.limits.campRests} camp rests` : ""
  ].filter(Boolean) as string[];
  const pills = shapePillsData(scenario as ScenarioForShape).pills;
  const shapePillsMarkup = `<div class="campaign-chip-row">${pills.map((p) => `<span class="campaign-chip">${esc(p.label)}</span>`).join("")}</div>`;

  const flowEntries = beats.length ? beats : nodes;
  const flowMarkup = flowEntries.length
    ? flowEntries.slice(0, 12).map(inspectEntryLine).join("")
    : '<div class="campaign-empty">Freeform run. Use manual controls, event notes, and battle picks.</div>';
  const travelLabel = scenario.travelMode ?? (scenario.mapId ? "node_map" : "freeform");
  const dangerMarkup = dangers.length
    ? dangers.map((line) => `<div class="campaign-town-line"><strong>${esc(line)}</strong><span>Run limit</span></div>`).join("")
    : '<div class="campaign-empty">No special limits listed.</div>';
  const rewardMarkup = rewards.length
    ? rewards.map((line) => `<div class="campaign-town-line is-reward"><strong>${esc(line)}</strong><span>On resolve</span></div>`).join("")
    : '<div class="campaign-empty">No authored rewards listed.</div>';

  const body = document.createElement("div");
  body.className = "campaign-inspect-sheet";
  body.innerHTML = `
      <div class="campaign-preview">
        <b>${esc(scenario.name ?? scenario.id ?? "")}</b><br>
        ${esc(scenario.notes ?? scenario.summary ?? "No notes.")}<br>
        ${shapePillsMarkup}
      </div>
      <div class="campaign-inspect-grid">
        <section>
          <h3>Flow</h3>
          <div class="campaign-muted">${esc(travelLabel)}</div>
          ${flowMarkup}
        </section>
        <section>
          <h3>Rules</h3>
          ${dangerMarkup}
          <h3>Rewards</h3>
          ${rewardMarkup}
        </section>
      </div>
    `;

  const footer = document.createElement("div");
  const hasActiveRun = !!(cs().getState() as { activeScenarioRun?: unknown } | null)?.activeScenarioRun;
  const primaryButtonHtml = hasActiveRun
    ? '<button class="btn btn-primary" data-inspect-current>Open Current Run</button>'
    : '<button class="btn btn-primary" data-inspect-start>Start Run</button>';
  footer.innerHTML = `
      <button class="btn" data-inspect-close>Close</button>
      ${primaryButtonHtml}
    `;
  const overlay = ui.openModal({ title: "Run Inspect", content: body, footer, width: "760px" });

  const close = footer.querySelector<HTMLButtonElement>("[data-inspect-close]");
  if (close) close.onclick = () => ui.closeModal(overlay);
  const current = footer.querySelector<HTMLButtonElement>("[data-inspect-current]");
  if (current) {
    current.onclick = () => {
      ui.closeModal(overlay);
      goto(null, "maps");
    };
  }
  const start = footer.querySelector<HTMLButtonElement>("[data-inspect-start]");
  if (start) {
    start.onclick = () => {
      ui.closeModal(overlay);
      startScenarioFromUi(scenarioId);
    };
  }
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
