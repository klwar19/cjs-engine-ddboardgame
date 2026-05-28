// mg-test.ts — Phase H.3 mini-game test play handlers.
//
// mg-test-play (specific level), mg-test-random (level by difficulty),
// mg-test-random-any (any level) all funnel through MinigameModule.openMiniGame
// with the `minigame_test_lab` source. The onComplete writes the result to
// `state.lastMiniGameTestResult` + the campaign log and toasts the outcome.
// Game id, level id, difficulty, payload keys, log format and toast strings
// mirror the deleted `_mgTestPlay` closure.
//
// mg-test-pick stays in the switch — it writes to `_root.dataset.mgTestGame`
// which the `getMinigameTestData` bridge reads, and porting it requires
// moving the selection state out of `_root`. H.4 (data-bridge port) does that.

import { cs, mod, toast } from "./context";

interface MinigameResult {
  gameId?: string;
  levelId?: string;
  status?: string;
  score?: number;
  [key: string]: unknown;
}

interface MinigamesModule {
  openMiniGame?: (cfg: {
    gameId: string;
    levelId?: string;
    difficulty?: number;
    source?: string;
    onComplete?: (result: MinigameResult) => void;
  }) => unknown;
}

function minigames(): MinigamesModule | undefined {
  return mod<MinigamesModule>("Minigames");
}

export interface MgTestPlayInput {
  gameId: string;
  levelId?: string;
  difficulty?: number;
}

export async function mgTestPlay({ gameId, levelId, difficulty }: MgTestPlayInput): Promise<void> {
  const mg = minigames();
  if (!mg?.openMiniGame) {
    toast("Mini-game module is not loaded", "error");
    return;
  }
  if (!gameId) {
    toast("No mini-game selected", "info");
    return;
  }
  try {
    const session = await mg.openMiniGame({
      gameId,
      levelId: levelId || undefined,
      difficulty: difficulty || undefined,
      source: "minigame_test_lab",
      onComplete: (result) => {
        cs().mutate((state) => {
          const s = state as { lastMiniGameTestResult?: MinigameResult; log?: Array<Record<string, unknown>>; phase?: { number?: number }; currentWorld?: string };
          s.lastMiniGameTestResult = result;
          s.log = s.log || [];
          s.log.unshift({
            id: `log_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
            at: new Date().toISOString(),
            phase: s.phase?.number || 1,
            world: s.currentWorld,
            text: `Mini-game test: ${result?.gameId || gameId} ${result?.levelId || ""} -> ${result?.status || "done"} (score ${result?.score ?? 0})`,
            op: "minigame_test"
          });
          s.log = s.log.slice(0, 500);
        }, { source: "mg_test_result" });
        if (result?.status === "win") toast("Mini-game test cleared", "success");
        else if (result?.status === "fail") toast("Mini-game test failed", "info");
        else if (result?.status === "giveup") toast("Mini-game test abandoned", "info");
      }
    });
    if (!session) toast("Mini-game could not open. Check the selected level data.", "error");
  } catch (err) {
    console.error("mg-test-play failed", err);
    toast((err as Error)?.message || "Could not open mini-game", "error");
  }
}
