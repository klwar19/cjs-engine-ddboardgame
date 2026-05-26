// scenarios.ts — Phase F bridge for the Scenarios (Run Setup) tab.

import type { CampaignStateSnapshot } from "../../store";

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
  readonly questPillHtml: string;
  readonly shapePillsHtml: string;
  readonly runActionsHtml: string;
}

export interface ScenariosData {
  readonly hasActiveRun: boolean;
  readonly activeRunScenarioId: string | null;
  readonly mapTypeOptions: readonly OptionRecord[];
  readonly sizeOptions: readonly OptionRecord[];
  readonly scenarios: readonly ScenarioCard[];
}

interface Bridge {
  readonly getScenariosData: (state?: CampaignStateSnapshot) => ScenariosData | null;
}

interface Cjs {
  readonly CampaignUI?: Bridge;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

export function getScenariosData(state: CampaignStateSnapshot): ScenariosData | null {
  return cjs().CampaignUI?.getScenariosData(state) ?? null;
}
