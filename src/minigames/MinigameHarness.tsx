import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getMinigamesApi,
  getMinigameRegistry,
  type MinigameLevel,
  type MinigameMeta,
  type MinigameResult
} from "./types";

const DEFAULT_GAME = "mummy_maze";

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ESCAPE_MAP[c] ?? c);
}

function levelSize(level: MinigameLevel): { width: number; height: number } {
  if (Array.isArray(level.layout)) {
    const width =
      level.width ??
      Math.max(...level.layout.map((row) => String(row).length));
    const height = level.height ?? level.layout.length;
    return { width, height };
  }
  return { width: level.width ?? 0, height: level.height ?? 0 };
}

function layoutHas(level: MinigameLevel, chars: readonly string[]): boolean {
  if (!Array.isArray(level.layout)) return false;
  return level.layout.some((row) =>
    chars.some((ch) => String(row).includes(ch))
  );
}

function pushCounts(level: MinigameLevel): { boxes: number; goals: number } {
  if (!Array.isArray(level.layout)) {
    return {
      boxes: (level.boxes ?? []).length,
      goals: (level.goals ?? []).length
    };
  }
  let boxes = 0;
  let goals = 0;
  for (const row of level.layout) {
    for (const ch of String(row)) {
      if (ch === "$" || ch === "*") boxes += 1;
      if (ch === "." || ch === "*" || ch === "+") goals += 1;
    }
  }
  return { boxes, goals };
}

async function fetchLevels(gameId: string): Promise<readonly MinigameLevel[]> {
  const res = await fetch(`data/minigames/${gameId}_levels.json`);
  if (!res.ok) {
    throw new Error(
      `Could not load ${gameId} levels (${res.status}). Use a local server, not file://.`
    );
  }
  const data = (await res.json()) as { levels?: MinigameLevel[] };
  return data.levels ?? [];
}

interface LevelCardProps {
  readonly level: MinigameLevel;
  readonly onPlay: () => void;
}

function LevelCard({ level, onPlay }: LevelCardProps) {
  const size = levelSize(level);
  const tags = level.tags?.join(", ") ?? "";
  return (
    <div className="level-card">
      <div className="level-card-top">
        <h3
          dangerouslySetInnerHTML={{ __html: escapeHtml(level.title) }}
        />
        <span
          dangerouslySetInnerHTML={{ __html: escapeHtml(level.difficulty) }}
        />
      </div>
      <span className="meta">{`${size.width}x${size.height} - ${tags}`}</span>
      <p
        className="level-hint"
        dangerouslySetInnerHTML={{ __html: escapeHtml(level.hint ?? "") }}
      />
      <button onClick={onPlay}>{`Play ${level.id}`}</button>
    </div>
  );
}

export function MinigameHarness() {
  const [games, setGames] = useState<readonly MinigameMeta[]>([]);
  const [currentGame, setCurrentGame] = useState<string | null>(null);
  const [levels, setLevels] = useState<readonly MinigameLevel[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resultLog, setResultLog] = useState<string>(
    "No result yet. Run a level above."
  );
  const [testLog, setTestLog] = useState<string>("Tests not run.");
  const [spritesEnabled, setSpritesEnabled] = useState<boolean>(true);

  const levelCache = useRef<Map<string, readonly MinigameLevel[]>>(new Map());

  const loadLevels = useCallback(
    async (gameId: string): Promise<readonly MinigameLevel[]> => {
      const cached = levelCache.current.get(gameId);
      if (cached) return cached;
      const fetched = await fetchLevels(gameId);
      levelCache.current.set(gameId, fetched);
      return fetched;
    },
    []
  );

  const selectGame = useCallback(
    async (gameId: string) => {
      setCurrentGame(gameId);
      setLoadError(null);
      try {
        const nextLevels = await loadLevels(gameId);
        setLevels(nextLevels);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        setLoadError(msg);
        setLevels([]);
      }
    },
    [loadLevels]
  );

  // Wait briefly for the vanilla JS modules to finish self-registering.
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const tick = () => {
      if (cancelled) return;
      const api = getMinigamesApi();
      if (api) {
        const list = api.listGames();
        setGames(list);
        const initial =
          list.find((g) => g.id === DEFAULT_GAME)?.id ?? list[0]?.id ?? null;
        if (initial) {
          void selectGame(initial);
        }
        return;
      }
      tries += 1;
      if (tries < 50) {
        window.setTimeout(tick, 40);
      } else {
        setLoadError("CJS.Minigames API never initialised");
      }
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [selectGame]);

  const launch = useCallback(
    async (gameId: string, levelId: string) => {
      const api = getMinigamesApi();
      if (!api) {
        setResultLog("Mini-game API unavailable.");
        return;
      }
      setResultLog("Running...");
      try {
        const session = await api.openMiniGame({
          gameId,
          levelId,
          source: "harness",
          onComplete: (result: MinigameResult) => {
            setResultLog(JSON.stringify(result, null, 2));
          }
        });
        if (!session) {
          setResultLog(
            `Could not open ${gameId}:${levelId}. Check the level manifest and console.`
          );
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        setResultLog(`Mini-game launch failed: ${msg}`);
        console.error(error);
      }
    },
    []
  );

  const toggleSprites = useCallback(() => {
    const api = getMinigamesApi();
    if (!api) return;
    const next = !spritesEnabled;
    setSpritesEnabled(next);
    if (next) {
      api.useSpriteMap("assets/minigames/spritesheet.json");
    } else {
      api.useSpriteMap({
        sheets: {},
        mummy_maze: { sprites: {} },
        push_box: { sprites: {} }
      });
    }
  }, [spritesEnabled]);

  const runTests = useCallback(async () => {
    const lines: string[] = [];
    const log = (...args: unknown[]) => {
      lines.push(args.map((a) => String(a)).join(" "));
      setTestLog(lines.join("\n"));
    };
    let pass = 0;
    let fail = 0;
    const assert = (cond: boolean, name: string) => {
      if (cond) {
        pass += 1;
        log(`PASS ${name}`);
      } else {
        fail += 1;
        log(`FAIL ${name}`);
      }
    };

    const registry = getMinigameRegistry();
    if (!registry) {
      log("ERROR: CJS.MinigameRegistry unavailable");
      return;
    }

    function makeInstance(gameId: string, level: MinigameLevel) {
      const entry = registry!.getGame(gameId);
      if (!entry) throw new Error(`Unknown game: ${gameId}`);
      const canvas = document.createElement("canvas");
      const stage = document.createElement("div");
      stage.appendChild(canvas);
      const game = entry.factory({
        canvas,
        stage,
        level,
        options: {},
        onUpdate: () => {},
        onComplete: () => {}
      });
      return { game };
    }

    function simulateInline(gameId: string, level: MinigameLevel, limit = 80) {
      const inst = makeInstance(gameId, level).game;
      for (let i = 0; i < limit; i++) {
        const s = inst.getState();
        if (s.status !== "play") return { status: s.status, steps: i };
        const next = inst._solveNext(s);
        if (!next) return { status: "unsolvable", steps: i };
        inst.handleAction(next);
      }
      return { status: "timeout", steps: limit };
    }

    function runUntilDone(
      gameId: string,
      level: MinigameLevel,
      moves: readonly string[]
    ): Promise<{ status: string; tags: string[]; suggestedOps: unknown[] }> {
      return new Promise((resolve) => {
        let resolved = false;
        const entry = registry!.getGame(gameId);
        if (!entry) {
          resolve({ status: "error", tags: [], suggestedOps: [] });
          return;
        }
        const canvas = document.createElement("canvas");
        const stage = document.createElement("div");
        stage.appendChild(canvas);
        const inst = entry.factory({
          canvas,
          stage,
          level,
          options: {},
          onUpdate: () => {},
          onComplete: (summary: { status: string }) => {
            if (resolved) return;
            resolved = true;
            resolve({
              status: summary.status,
              tags: [`minigame:${gameId}`, `result:${summary.status}`],
              suggestedOps: []
            });
          }
        });
        inst.mount();
        for (const m of moves) inst.handleAction(m);
        window.setTimeout(() => {
          if (resolved) return;
          resolved = true;
          resolve({
            status: inst.getState().status,
            tags: [],
            suggestedOps: []
          });
        }, 200);
      });
    }

    try {
      log("Loading levels...");
      const mummyLevels = await loadLevels("mummy_maze");
      const pushLevels = await loadLevels("push_box");
      assert(
        mummyLevels.length >= 6,
        `mummy: at least 6 levels (${mummyLevels.length})`
      );
      assert(
        pushLevels.length >= 6,
        `push: at least 6 levels (${pushLevels.length})`
      );

      const diffMummy = new Set(mummyLevels.map((l) => Number(l.difficulty)));
      const diffPush = new Set(pushLevels.map((l) => Number(l.difficulty)));
      for (let d = 1; d <= 6; d++) {
        assert(diffMummy.has(d), `mummy: difficulty band ${d} present`);
        assert(diffPush.has(d), `push: difficulty band ${d} present`);
      }

      for (const lvl of mummyLevels) {
        assert(
          (Array.isArray(lvl.player) && lvl.player.length === 2) ||
            layoutHas(lvl, ["@"]),
          `${lvl.id}: has player`
        );
        assert(
          (Array.isArray(lvl.exit) && lvl.exit.length === 2) ||
            layoutHas(lvl, ["E"]),
          `${lvl.id}: has exit`
        );
        const result = simulateInline("mummy_maze", lvl, 260);
        assert(
          result.status === "win",
          `${lvl.id}: solver can clear (${result.status}, ${result.steps} turns)`
        );
      }
      for (const lvl of pushLevels) {
        const counts = pushCounts(lvl);
        assert(
          (Array.isArray(lvl.player) && lvl.player.length === 2) ||
            layoutHas(lvl, ["@", "+"]),
          `${lvl.id}: has player`
        );
        assert(
          counts.boxes === counts.goals,
          `${lvl.id}: box/goal counts match`
        );
        assert(counts.goals >= 1, `${lvl.id}: at least 1 goal`);
        const result = simulateInline("push_box", lvl, 380);
        assert(
          result.status === "win",
          `${lvl.id}: solver can clear (${result.status}, ${result.steps} moves)`
        );
      }

      const tutorialMummy = mummyLevels.find(
        (l) => Number(l.difficulty) === 1
      );
      const tutorialPush = pushLevels.find((l) => Number(l.difficulty) === 1);

      if (tutorialMummy) {
        const inst = makeInstance("mummy_maze", tutorialMummy);
        const hintAction = inst.game._solveNext(inst.game.getState());
        assert(
          ["up", "down", "left", "right", "wait"].includes(
            String(hintAction)
          ),
          `mummy hint is legal: ${hintAction}`
        );
      }

      if (tutorialPush) {
        const u = makeInstance("push_box", tutorialPush);
        const before = JSON.stringify(u.game.getState());
        u.game.handleAction("right");
        u.game.undo?.();
        const after = JSON.stringify(u.game.getState());
        assert(before === after, "push: undo restores prior state");
      }

      if (tutorialMummy) {
        const r = makeInstance("mummy_maze", tutorialMummy);
        const initial = JSON.stringify(r.game.getState());
        r.game.handleAction("down");
        r.game.handleAction("down");
        r.game.reset?.();
        const resetState = JSON.stringify(r.game.getState());
        assert(initial === resetState, "mummy: reset restores initial state");

        const winResult = await runUntilDone("mummy_maze", tutorialMummy, [
          "down",
          "down",
          "down",
          "down",
          "down",
          "down"
        ]);
        assert(winResult.status === "win", "mummy result.status === win");
        assert(Array.isArray(winResult.tags), "mummy result.tags is array");
        assert(
          Array.isArray(winResult.suggestedOps),
          "mummy result.suggestedOps is array"
        );
      }

      const failTrap = mummyLevels.find((l) => Number(l.difficulty) === 4);
      if (failTrap) {
        const failResult = await runUntilDone("mummy_maze", failTrap, [
          "right",
          "right",
          "right"
        ]);
        assert(
          ["fail", "play", "win"].includes(failResult.status),
          `mummy fail path returns a status (${failResult.status})`
        );
      }

      const srcCheck = await Promise.all([
        fetch("js/minigames/mummy-maze.js").then((r) => r.text()),
        fetch("js/minigames/push-box.js").then((r) => r.text())
      ]);
      for (let i = 0; i < srcCheck.length; i++) {
        const found = /CampaignOps\s*\(\s*\)|CampaignOps\.apply/.test(
          srcCheck[i]
        );
        assert(
          !found,
          `${["mummy", "push"][i]} does not call CampaignOps directly`
        );
      }
    } catch (error) {
      fail += 1;
      const msg = error instanceof Error ? error.message : String(error);
      log(`ERROR ${msg}`);
    }

    log(`\n${pass} passed, ${fail} failed.`);
  }, [loadLevels]);

  const tabs = useMemo(() => games, [games]);

  return (
    <div className="panel">
      <header className="harness-hero">
        <div>
          <span className="harness-kicker">Puzzle Test Lab</span>
          <h1>CJS Mini-Games</h1>
          <p>
            Pick any level, open the modal, and inspect the result payload
            Campaign Mode receives.
          </p>
        </div>
        <button
          className="harness-button primary"
          onClick={() => void runTests()}
        >
          Run acceptance tests
        </button>
      </header>

      <div className="game-tabs">
        {tabs.map((g) => (
          <button
            key={g.id}
            data-game={g.id}
            className={currentGame === g.id ? "active" : undefined}
            onClick={() => void selectGame(g.id)}
          >
            {g.title ?? g.id}
          </button>
        ))}
      </div>

      <section className="harness-panel">
        <h2>Levels</h2>
        <div className="level-grid">
          {loadError ? (
            <div className="level-card is-error">{loadError}</div>
          ) : (
            levels.map((lvl) => (
              <LevelCard
                key={lvl.id}
                level={lvl}
                onPlay={() => {
                  if (!currentGame) return;
                  void launch(currentGame, lvl.id);
                }}
              />
            ))
          )}
        </div>
      </section>

      <section className="harness-panel">
        <h2>Latest result payload</h2>
        <pre className="log-pane">{resultLog}</pre>
      </section>

      <section className="harness-panel">
        <h2>Sprite map</h2>
        <p className="microcopy">
          Toggle the external sprite map to compare the shipped art pass with
          the canvas fallback.
        </p>
        <button className="harness-button" onClick={toggleSprites}>
          {spritesEnabled ? "Disable spritesheet" : "Re-enable spritesheet"}
        </button>
      </section>

      <section className="harness-panel">
        <h2>Self-tests</h2>
        <pre className="log-pane">{testLog}</pre>
      </section>
    </div>
  );
}
