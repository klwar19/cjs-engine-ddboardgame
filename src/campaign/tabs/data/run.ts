// run.ts — Phase F bridge for the Maps (Current Run) tab.
//
// Phase H.4 — `getRunData` ported inline. The typed shared
// `runQuestPill` / `shapePillsData` / `beatIcon` helpers live in
// `data/scenarioShared.ts` and are also consumed by
// `getScenarioSummaryData` / `getScenariosData`.

import {
  runQuestPill,
  shapePillsData,
  beatIcon,
  type QuestPillData,
  type ShapePillsData,
  type ScenarioForShape
} from "./scenarioShared";
import type { CampaignStateSnapshot } from "../../store";

export type RunMode = "node_map" | "grid_map" | "freeform" | "linear" | string;

export interface RunStats {
  readonly danger: number;
  readonly dangerMax: number;
  readonly campsUsed: number;
  readonly campsMax: number;
  readonly battlesUsed: number;
  readonly battlesMax: number;
  readonly eventsUsed: number;
  readonly eventsMax: number;
}

export interface SetBattle {
  readonly id: string;
  readonly label: string;
  readonly sub: string;
}

export interface FreeformPanel {
  readonly setBattles: readonly SetBattle[];
}

export interface LinearBeat {
  readonly id: string;
  readonly number: number;
  readonly label: string;
  readonly kind: string;
  readonly iconChar: string;
  readonly encounterId: string;
  readonly prompt: string;
  readonly isCurrent: boolean;
  readonly isDone: boolean;
}

export interface LinearPanel {
  readonly beats: readonly LinearBeat[];
  readonly currentIndex: number;
  readonly totalBeats: number;
  readonly allDone: boolean;
}

export interface RunData {
  readonly hasRun: boolean;
  readonly mode: RunMode | null;
  readonly scenarioName: string;
  readonly scenarioNotes: string;
  readonly questPill: QuestPillData | null;
  readonly shapePills: ShapePillsData;
  readonly run: RunStats | null;
  readonly freeform: FreeformPanel | null;
  readonly linear: LinearPanel | null;
}

// ── Module surfaces ─────────────────────────────────────────────────
interface ScenarioRecord extends ScenarioForShape {
  readonly name?: string;
  readonly notes?: string;
  readonly source?: { readonly questId?: string; readonly questChainId?: string; readonly title?: string };
  readonly setBattles?: ReadonlyArray<{
    readonly id?: string;
    readonly battleSetId?: string;
    readonly encounterId?: string;
    readonly label?: string;
    readonly name?: string;
  }>;
  readonly beats?: ReadonlyArray<{
    readonly id?: string;
    readonly label?: string;
    readonly kind?: string;
    readonly encounterId?: string;
    readonly prompt?: string;
  }>;
}

interface CampaignStateSurface {
  readonly getActiveScenario?: () => ScenarioRecord | null | undefined;
}

interface RunCjs {
  readonly CampaignState?: CampaignStateSurface;
}

function cjs(): RunCjs {
  return (window as unknown as { CJS?: RunCjs }).CJS ?? {};
}

interface RunInput {
  readonly travelMode?: string;
  readonly mapId?: string;
  readonly questId?: string;
  readonly questTitle?: string;
  readonly danger?: number;
  readonly dangerMax?: number;
  readonly usedCampRests?: number;
  readonly randomBattlesUsed?: number;
  readonly eventsUsed?: number;
  readonly limits?: { readonly campRests?: number; readonly events?: number; readonly randomBattles?: number };
  readonly currentBeatIndex?: number;
}

export function getRunData(state: CampaignStateSnapshot): RunData | null {
  if (!state) return null;
  const typed = state as { activeScenarioRun?: RunInput; quests?: Record<string, { title?: string }> };
  const run = typed.activeScenarioRun;
  if (!run) {
    return {
      hasRun: false,
      mode: null,
      scenarioName: "",
      scenarioNotes: "",
      questPill: null,
      shapePills: { pills: [] },
      run: null,
      freeform: null,
      linear: null
    };
  }
  const mode = run.travelMode || (run.mapId ? "node_map" : "freeform");
  const scenario = cjs().CampaignState?.getActiveScenario?.() ?? null;
  const shared = {
    hasRun: true,
    mode,
    scenarioName: scenario?.name || "Run",
    scenarioNotes: scenario?.notes || "",
    questPill: runQuestPill(typed, run, scenario),
    shapePills: shapePillsData(scenario || {}),
    run: {
      danger: run.danger ?? 0,
      dangerMax: run.dangerMax ?? 0,
      campsUsed: run.usedCampRests ?? 0,
      campsMax: run.limits?.campRests ?? 0,
      battlesUsed: run.randomBattlesUsed ?? 0,
      battlesMax: run.limits?.randomBattles ?? 0,
      eventsUsed: run.eventsUsed ?? 0,
      eventsMax: run.limits?.events ?? 0
    }
  };
  if (mode === "freeform") {
    const setBattles = scenario?.setBattles || [];
    return {
      ...shared,
      freeform: {
        setBattles: setBattles.map((b) => ({
          id: b.id || b.battleSetId || b.encounterId || "",
          label: b.label || b.name || b.encounterId || b.battleSetId || "",
          sub: b.encounterId || b.battleSetId || ""
        }))
      },
      linear: null
    };
  }
  if (mode === "linear") {
    const beats = scenario?.beats || [];
    const idx = run.currentBeatIndex ?? 0;
    return {
      ...shared,
      freeform: null,
      linear: {
        beats: beats.map((b, i) => ({
          id: String(b.id || ""),
          number: i + 1,
          label: b.label || b.id || "",
          kind: b.kind || "",
          iconChar: beatIcon(b.kind),
          encounterId: b.encounterId || "",
          prompt: b.prompt || "",
          isCurrent: i === idx,
          isDone: i < idx
        })),
        currentIndex: idx,
        totalBeats: beats.length,
        allDone: idx >= beats.length
      }
    };
  }
  // node_map / grid_map render into #campaign-map-region via CampaignMap.render
  return { ...shared, freeform: null, linear: null };
}
