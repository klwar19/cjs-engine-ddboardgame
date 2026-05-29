// minigameTest.ts — Phase F typed bridge for the Mini-Game Test tab.
//
// Phase H.4 — `getMinigameTestData` ported inline. The selection state
// (previously kept on `_root.dataset.mgTestGame`) lives in a module-level
// variable here so the TS data builder + the TS mg-test-pick handler
// share one source of truth. The level cache also moves to TS — same
// lazy-fetch behaviour the JS original had.

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

// ── Module surfaces ─────────────────────────────────────────────────
interface MinigameGameInput {
  readonly id?: string;
  readonly title?: string;
}

interface MinigamesSurface {
  readonly listGames?: () => readonly MinigameGameInput[];
}

interface CampaignUiSurface {
  readonly render?: () => void;
}

interface MgTestCjs {
  readonly Minigames?: MinigamesSurface;
  readonly CampaignUI?: CampaignUiSurface;
}

function cjs(): MgTestCjs {
  return (window as unknown as { CJS?: MgTestCjs }).CJS ?? {};
}

interface RawLevel {
  readonly id?: string;
  readonly title?: string;
  readonly difficulty?: number;
  readonly theme?: string;
  readonly width?: number;
  readonly height?: number;
  readonly optimalTurns?: number;
  readonly optimalMoves?: number;
  readonly hint?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
}

// Module-level state — selected game id + level cache. These were
// closure-private (`_root.dataset.mgTestGame` + `_mgTestLevels`) in
// campaign-ui.js; they keep the same lazy-fetch semantics here.
let selectedGameId = "";
const levelCache: Record<string, readonly RawLevel[]> = {};

export function setMinigameTestGame(gameId: string | undefined | null): void {
  selectedGameId = String(gameId || "");
}

async function ensureLevels(gameId: string): Promise<void> {
  if (!gameId || levelCache[gameId]) return;
  try {
    const res = await fetch(`data/minigames/${gameId}_levels.json?v=grid-regression-20260517c`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { levels?: readonly RawLevel[] };
    levelCache[gameId] = Array.isArray(data.levels) ? data.levels.slice() : [];
    cjs().CampaignUI?.render?.();
  } catch (err) {
    // Match the JS warning + cache-empty + re-render fallback.
    console.warn("Minigame test: failed to load levels for", gameId, err);
    levelCache[gameId] = [];
    cjs().CampaignUI?.render?.();
  }
}

export function getMinigameTestData(state: CampaignStateSnapshot): MinigameTestData | null {
  if (!state) return null;
  const games = cjs().Minigames?.listGames?.() || [];
  const selected = selectedGameId || (games[0]?.id ?? "");
  if (selected && !levelCache[selected]) void ensureLevels(selected);
  const rawLevels = levelCache[selected] || [];
  const levels: LevelRecord[] = rawLevels.map((lvl) => ({
    id: String(lvl.id || ""),
    title: lvl.title || lvl.id || "",
    difficulty: lvl.difficulty || 1,
    theme: lvl.theme || "any",
    width: lvl.width || null,
    height: lvl.height || null,
    optimalTurns: lvl.optimalTurns || lvl.optimalMoves || null,
    hint: lvl.hint || lvl.description || "",
    tags: Array.isArray(lvl.tags) ? lvl.tags.slice(0) : []
  }));
  const lastResult = (state as { lastMiniGameTestResult?: { status?: string } | null }).lastMiniGameTestResult || null;
  return {
    games: games.map((g) => ({ id: String(g.id || ""), title: g.title || g.id || "" })),
    selectedGameId: selected || null,
    levels,
    levelsLoaded: !!levelCache[selected],
    lastResultStatus: lastResult?.status || null,
    lastResultJson: lastResult ? JSON.stringify(lastResult, null, 2) : null
  };
}
