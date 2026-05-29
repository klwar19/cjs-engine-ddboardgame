// scenarios.ts — Phase F bridge for the Scenarios (Run Setup) tab.
//
// Phase H.4 — `getScenariosData` ported inline. Uses the shared TS
// `shapePillsData` / `scenarioQuestPillData` / `scenarioRunActionsData`
// helpers from `data/scenarioShared.ts`.

import { label } from "../../util/cui-utils";
import {
  shapePillsData,
  scenarioQuestPillData,
  scenarioRunActionsData,
  type QuestPillData,
  type ShapePillsData,
  type ScenarioRunActionsData,
  type ScenarioForShape,
  type ScenarioCardSource
} from "./scenarioShared";
import type { CampaignStateSnapshot } from "../../store";

export type {
  QuestPillData,
  QuestPillVariant,
  ShapePill,
  ShapePillsData,
  ScenarioRunStartState,
  ScenarioRunActionsData
} from "./scenarioShared";

export interface OptionRecord {
  readonly id: string;
  readonly label: string;
}

export interface ScenarioCard {
  readonly id: string;
  readonly name: string;
  readonly notes: string;
  readonly generated: boolean;
  readonly pillLabel: string;
  readonly questPill: QuestPillData | null;
  readonly shapePills: ShapePillsData;
  readonly runActions: ScenarioRunActionsData;
}

export interface ScenariosData {
  readonly hasActiveRun: boolean;
  readonly activeRunScenarioId: string | null;
  readonly mapTypeOptions: readonly OptionRecord[];
  readonly sizeOptions: readonly OptionRecord[];
  readonly scenarios: readonly ScenarioCard[];
}

// ── Module surfaces ─────────────────────────────────────────────────
interface ScenarioRecord extends ScenarioForShape, ScenarioCardSource {
  readonly id?: string;
  readonly name?: string;
  readonly notes?: string;
  readonly type?: string;
  readonly generated?: boolean;
  readonly source?: { readonly questId?: string; readonly questChainId?: string; readonly title?: string; readonly kind?: string };
}

interface CampaignContent {
  readonly scenarios?: Record<string, ScenarioRecord>;
}

interface CampaignStateSurface {
  readonly getCurrentCampaign?: () => { readonly scenarios?: readonly string[] } | null | undefined;
  readonly getContent?: () => CampaignContent;
  readonly getGeneratedScenarios?: () => readonly ScenarioRecord[];
}

interface ScenarioGeneratorOptions {
  readonly mapSettings?: readonly string[];
  readonly mapTypes?: readonly string[];
}

interface ScenarioGeneratorSurface {
  readonly options?: () => ScenarioGeneratorOptions;
}

interface ScenariosCjs {
  readonly CampaignState?: CampaignStateSurface;
  readonly CampaignScenarioGenerator?: ScenarioGeneratorSurface;
}

function cjs(): ScenariosCjs {
  return (window as unknown as { CJS?: ScenariosCjs }).CJS ?? {};
}

const DEFAULT_MAP_TYPES: readonly string[] = [
  "any",
  "urban",
  "outdoor",
  "forest",
  "dungeon",
  "cave",
  "sewer",
  "ruins",
  "temple",
  "house",
  "tavern",
  "castle",
  "mountain",
  "arena"
];

const SIZE_OPTIONS: readonly OptionRecord[] = [
  { id: "tiny", label: "Tiny" },
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" },
  { id: "huge", label: "Huge" },
  { id: "massive", label: "Massive" }
];

export function getScenariosData(state: CampaignStateSnapshot): ScenariosData | null {
  if (!state) return null;
  const c = cjs();
  const typed = state as {
    sideContent?: { generatedScenarios?: Record<string, ScenarioRecord> };
    activeScenarioRun?: { scenarioId?: string };
    quests?: Record<string, { title?: string }>;
  };
  const campaign = c.CampaignState?.getCurrentCampaign?.();
  const content = c.CampaignState?.getContent?.();
  const authored = (campaign?.scenarios || [])
    .map((id) => content?.scenarios?.[id])
    .filter((scenario): scenario is ScenarioRecord => Boolean(scenario));
  const generated = c.CampaignState?.getGeneratedScenarios
    ? c.CampaignState.getGeneratedScenarios()
    : Object.values(typed.sideContent?.generatedScenarios || {});
  const scenarios = [...generated, ...authored];
  const genOptions = c.CampaignScenarioGenerator?.options?.();
  const mapTypeIds = genOptions?.mapSettings || genOptions?.mapTypes || DEFAULT_MAP_TYPES;
  const activeRun = typed.activeScenarioRun;
  return {
    hasActiveRun: !!activeRun,
    activeRunScenarioId: activeRun?.scenarioId || null,
    mapTypeOptions: mapTypeIds.map((id) => ({ id, label: label(id) })),
    sizeOptions: SIZE_OPTIONS,
    scenarios: scenarios.map((scenario) => ({
      id: String(scenario.id || ""),
      name: scenario.name || scenario.id || "",
      notes: scenario.notes || "",
      generated: !!scenario.generated,
      pillLabel: scenario.generated
        ? `generated | ${scenario.source?.kind || "random"}`
        : scenario.type || "scenario",
      questPill: scenarioQuestPillData(scenario, typed),
      shapePills: shapePillsData(scenario),
      runActions: scenarioRunActionsData(scenario, typed)
    }))
  };
}
