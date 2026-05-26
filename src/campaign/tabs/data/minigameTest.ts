// minigameTest.ts — Phase F typed bridge for the Mini-Game Test tab.

import type { CampaignStateSnapshot } from "../../store";

export interface MiniGameRecord {
  readonly id: string;
  readonly title: string;
}

export interface LevelRecord {
  readonly id: string;
  readonly title: string;
  readonly difficulty: number;
  readonly theme: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly optimalTurns: number | string | null;
  readonly hint: string;
  readonly tags: readonly string[];
}

export interface MinigameTestData {
  readonly games: readonly MiniGameRecord[];
  readonly selectedGameId: string | null;
  readonly levels: readonly LevelRecord[];
  readonly levelsLoaded: boolean;
  readonly lastResultStatus: string | null;
  readonly lastResultJson: string | null;
}

interface Bridge {
  readonly getMinigameTestData: (state?: CampaignStateSnapshot) => MinigameTestData | null;
}

interface Cjs {
  readonly CampaignUI?: Bridge;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

export function getMinigameTestData(state: CampaignStateSnapshot): MinigameTestData | null {
  return cjs().CampaignUI?.getMinigameTestData(state) ?? null;
}
