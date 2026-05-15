# Mini-Game Merge Notes

Practical wiring guide for folding the standalone mini-game module into CJS
Campaign Mode. Nothing here changes existing Campaign code — all hooks are
opt-in.

## Files this drop adds

```
js/minigames/
  minigame-registry.js          // registry, listGames/getGame
  minigame-sprites.js           // loads spritesheet.json, resolves sprite rects
  minigame-host.js              // openMiniGame() modal, result-builder, useSpriteMap()
  mummy-maze.js                 // game logic + BFS solver for hints
  push-box.js                   // game logic + BFS solver for hints
css/
  minigames.css
data/minigames/
  mummy_maze_levels.json        // 5 levels, one per difficulty band 1–5
  push_box_levels.json          // 5 levels, one per difficulty band 1–5
assets/minigames/
  ATTRIBUTION.md
  dungeon_sheet.png             // Kenney Tiny Dungeon (CC0) — used by mummy_maze
  sokoban_sheet.png             // Kenney Sokoban Pack (CC0) — used by push_box
  spritesheet.json              // logical-name → sprite-rect map (editable)
  KENNEY_DUNGEON_LICENSE.txt
  KENNEY_SOKOBAN_LICENSE.txt
minigames.html                  // standalone harness + acceptance tests
MINIGAME_MERGE_NOTES.md         // this file
```

## Script tags

In any host page that wants to launch mini-games (currently `minigames.html`,
likely `campaign.html` after merge), include in this order:

```html
<link rel="stylesheet" href="css/minigames.css">
<script src="js/minigames/minigame-registry.js"></script>
<script src="js/minigames/minigame-sprites.js"></script>
<script src="js/minigames/mummy-maze.js"></script>
<script src="js/minigames/push-box.js"></script>
<script src="js/minigames/minigame-host.js"></script>
```

Registry must load first; sprite loader next so the game modules can grab
their sprite handles on construction; game files self-register; host loads
last and reads the registry.

## Three ways to play

These exist side-by-side; each goes through the same `openMiniGame()` entry
point so the result handling is identical.

| Entry point | Where the user starts | Section below |
|-------------|----------------------|---------------|
| **Solo** | a "Mini-Games" menu or dev harness | see `minigames.html` |
| **Event / sequence node** | mid-story choice resolved by a puzzle | "Wiring into Campaign sequence nodes" |
| **Map node** | a tagged room on the world map | "Wiring into map nodes" |
| **Quest objective** | "Clear 1 tomb puzzle" row in a quest | "Wiring into quest objectives" |

Solo play is already wired — `minigames.html` is shippable as-is. The other
three paths are about three lines of glue each.

## Public API

```js
window.CJS.Minigames.listGames();          // -> [{id, title, theme, ...}, ...]
window.CJS.Minigames.getGame(gameId);      // -> meta or null
window.CJS.Minigames.openMiniGame(opts);   // -> session handle
window.CJS.Minigames.useSpriteMap(url|obj);// swap art at runtime, see below
```

`opts` accepts:

| key | type | purpose |
|-----|------|---------|
| `gameId` | string | `"mummy_maze"` or `"push_box"` |
| `levelId` | string? | pick exact level; otherwise filtered by `difficulty` |
| `difficulty` | number? | 1..5 difficulty band |
| `seed` | any? | stable level pick for a given (difficulty, seed) pair |
| `theme` | string? | overrides the shell theme class |
| `source` | string? | echoed back in result for analytics (`"map"`, `"quest"`, etc.) |
| `questId`, `objectiveId` | string? | echoed into `suggestedOps[].update_quest_progress` |
| `eventId`, `mapId`, `nodeId` | string? | echoed back in result for host bookkeeping |
| `onWinOps`, `onLoseOps` | op[]? | extra ops appended to `suggestedOps` on the matching outcome |
| `container` | Element? | mount target (defaults to `document.body`) |
| `onComplete(result)` | function | called once per session |

The mini-game **never mutates Campaign state**. The host always decides whether
to apply `result.suggestedOps`.

## Wiring into Campaign sequence nodes

`js/campaign/campaign-sequence-runner.js` (or `scenario-runner.js`) currently
dispatches on `node.type`. Add a `minigame` branch:

```js
// inside the existing sequence dispatcher
case 'minigame':
  return new Promise((resolve) => {
    window.CJS.Minigames.openMiniGame({
      gameId: node.minigameId,
      levelId: node.levelId,
      difficulty: node.difficulty,
      seed: node.seed,
      source: 'sequence',
      eventId: node.id,
      onWinOps: node.onWin ? resolveBranchOps(node.onWin) : [],
      onLoseOps: node.onLose ? resolveBranchOps(node.onLose) : [],
      onComplete: (result) => {
        // Optional pass-through to existing op pipeline
        if (result.suggestedOps?.length) {
          window.CJS.CampaignOps.apply(result.suggestedOps, { source: 'minigame' });
        }
        if (node.manualResolveAllowed && result.status !== 'win') {
          // surface a "resolve manually" prompt instead of forcing a fail branch
          openManualResolvePrompt(node, result).then(resolve);
        } else {
          resolve(result.status === 'win' ? node.onWin : node.onLose);
        }
      }
    });
  });
```

Data shape that authors write inside `data/campaigns/*.json`:

```json
{
  "type": "minigame",
  "minigameId": "mummy_maze",
  "levelId": "mummy_02",
  "difficulty": 2,
  "onWin": "maze_clear",
  "onLose": "maze_penalty",
  "manualResolveAllowed": true
}
```

`maze_clear` / `maze_penalty` are branch IDs handled by the existing sequence
runner — the mini-game does not need to know what they mean.

## Wiring into quest objectives

`js/campaign/campaign-quest-pulse.js` already has the quest-objective registry.
Add a `minigame` objective kind:

```js
// during objective render in campaign-ui.js
if (objective.kind === 'minigame') {
  const button = document.createElement('button');
  button.textContent = objective.label || 'Play mini-game';
  button.addEventListener('click', () => {
    window.CJS.Minigames.openMiniGame({
      gameId: objective.minigame.gameId,
      difficulty: objective.minigame.difficulty,
      theme: objective.minigame.theme,
      source: 'quest',
      questId: quest.id,
      objectiveId: objective.id,
      onComplete: (result) => {
        if (result.status === 'win') {
          window.CJS.CampaignOps.apply(result.suggestedOps, { source: 'quest:minigame' });
        }
      }
    });
  });
  return button;
}
```

Objective JSON:

```json
{
  "id": "clear_minigame",
  "kind": "minigame",
  "label": "Clear 1 tomb puzzle",
  "current": 0,
  "required": 1,
  "minigame": { "gameId": "mummy_maze", "difficulty": 2, "theme": "tomb" }
}
```

When the result's `suggestedOps` includes `update_quest_progress`, the existing
`CampaignOps.apply()` will increment `objective.current`.

## Wiring into map nodes

`js/campaign/campaign-map.js` resolves map-node interactions. For a
`puzzle`-kind node holding a `minigame` block:

```js
if (node.kind === 'puzzle' && node.minigame) {
  window.CJS.Minigames.openMiniGame({
    gameId: node.minigame.gameId,
    levelId: node.minigame.levelId,
    difficulty: node.minigame.difficulty,
    source: 'map',
    mapId: currentMapId,
    nodeId: node.id,
    onWinOps: node.onClearOps || [],
    onComplete: (result) => {
      if (result.status === 'win') {
        window.CJS.CampaignOps.apply(result.suggestedOps, { source: 'map:puzzle' });
        markNodeCleared(node.id);
      }
    }
  });
}
```

Map node JSON:

```json
{
  "id": "sealed_puzzle_room",
  "title": "Sealed Puzzle Room",
  "kind": "puzzle",
  "minigame": { "gameId": "push_box", "levelId": "push_03", "difficulty": 3 },
  "onClearOps": [
    { "op": "reveal_node", "nodeId": "hidden_cache" }
  ]
}
```

## Result payload contract (echoed back to host)

```js
{
  gameId: "mummy_maze",
  levelId: "mummy_02",
  status: "win" | "fail" | "giveup" | "error",
  turns: 12,
  hintsUsed: 0,
  score: 82,
  tags: ["minigame:mummy_maze", "puzzle:tomb", "result:win", "difficulty:2"],
  suggestedOps: [
    { op: "update_quest_progress", questId, objectiveId, amount: 1 },
    { op: "log", text: "Mini-game cleared: Mummy Maze." }
  ],
  source: "quest" | "map" | "sequence" | ...
  questId, eventId, mapId, nodeId    // echoed for the host to correlate
}
```

The host is free to ignore `suggestedOps` and synthesize its own ops, or to
filter the list (e.g., reject `update_quest_progress` if the relevant quest
is not active).

## Reskinning / replacing art

Sprites are resolved through `assets/minigames/spritesheet.json`:

```json
{
  "sheets": {
    "dungeon": { "src": "assets/minigames/dungeon_sheet.png", "tileSize": 16, "cols": 12 },
    "sokoban": { "src": "assets/minigames/sokoban_sheet.png" }
  },
  "mummy_maze": {
    "sheet": "dungeon",
    "sprites": {
      "floor": { "tile": 48 }, "wall": { "tile": 14 },
      "player": { "tile": 85 }, "mummy": { "tile": 111 },
      "exit": { "tile": 7 }, "gate": { "tile": 45 }
    }
  },
  "push_box": {
    "sheet": "sokoban",
    "sprites": {
      "floor": { "x": 320, "y": 192, "w": 64, "h": 64 },
      "player": { "x": 512, "y": 54, "w": 46, "h": 54 }, ...
    }
  }
}
```

Three reskinning workflows:

1. **Edit `spritesheet.json` in place.** Repoint a sprite at a different tile
   index or pixel rect. Reload — game picks it up.
2. **Drop in replacement PNGs at the same paths.** Useful when an artist
   produces a redrawn version of the bundled sheets.
3. **Swap maps at runtime per session.** Useful for themed events:
   ```js
   window.CJS.Minigames.useSpriteMap('events/cursed-vault/sprites.json');
   window.CJS.Minigames.openMiniGame({ gameId: 'mummy_maze', levelId: 'mummy_03' });
   // pass null to revert to the default map
   window.CJS.Minigames.useSpriteMap(null);
   ```

If a sprite can't be loaded (missing entry, sheet 404), the game's
procedural canvas fallback runs instead — no broken visuals, just less
flashy art. This is why every renderable thing in the games has both a
sprite name AND a procedural drawer.

## Extending the games

The pieces are small enough to fork or extend in place:

- **Add a new level** — append a JSON object to `data/minigames/{game}_levels.json`.
  Required keys: `id`, `title`, `difficulty`, `theme`, `width`, `height`,
  `player`, plus game-specific (`exit`+`mummies` for maze; `boxes`+`goals`
  for push). Optional: `walls`, `keys`, `gates`, `traps`, `optimalTurns`,
  `optimalPushes`, `tags`, `hint`. The harness's **Run acceptance tests**
  button will refuse to greenlight an unsolvable level.
- **Add a new game** — write `js/minigames/<game>.js` exporting a factory
  that returns `{ mount, unmount, handleAction, undo, reset, hint,
  getTurns, getHintsUsed, getState }`. Self-register with the registry. Add
  a `<game>` entry to the sprite map. Provide
  `data/minigames/<game>_levels.json`. The host treats every registered
  game uniformly.
- **Tweak the AI / mechanics** — `mummy-maze.js#mummyMoveStep` is the
  greedy mummy AI (replaceable with anything that returns a new mummy pos);
  `push-box.js#deadlockBoxes` is the heuristic deadlock detector (extend
  with frozen-cluster detection, see
  https://jsokoapplet.sourceforge.io/sokoban/deadlocks.html).
- **Make sprites animated** — each game's render path treats one sprite as
  a static frame. The sprite loader (`minigame-sprites.js`) returns an
  `img` handle, so animated rendering is a per-game change to draw based
  on `state.turns % N` rather than a sprite-loader change.

## Save data

Mini-games keep no persistent state of their own. Score / hint usage are
returned in the result; the host writes whatever it cares about into the
campaign save via `CampaignOps`.

If you later want a "best score per level" board, capture it from the result
in your host callback and store it under `state.minigameRecords` — the
mini-game side never reads or writes saves.

## Testing the integration

1. Open `minigames.html` directly in a browser. The page lists every level for
   both games and surfaces the exact `result` payload after each session.
2. Click **Run acceptance tests** at the bottom. It runs the contract checks
   listed in the build spec (one player + one win condition per level, tutorial
   solvable, hint legal, undo restores prior state, reset restores initial,
   win/fail emit result, no `CampaignOps` calls from inside mini-game source).
3. CLI: `node tools/test-minigames.js` (if you bring that helper in) wraps
   the same checks for CI.

## Removal / disable

Drop the four script tags and the stylesheet from the host page; delete or
ignore the data files. Nothing else in the repository depends on these modules.
