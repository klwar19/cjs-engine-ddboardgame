# CJS Mini-Game AI Build Prompt

Use this prompt in a separate workspace when asking AI to build mini-games that can merge into CJS later.

## Prompt

Build two browser mini-games for the CJS Campaign Mode app:

1. `mummy_maze`: a turn-based tomb chase puzzle inspired by Theseus-and-Minotaur / Mummy Maze style logic.
2. `push_box`: a Sokoban-style crate puzzle.

Do not copy proprietary art, names, levels, UI, or sprites from commercial games. Use the internet only for rules research and puzzle-design references, then create original mechanics, levels, art, and sprites for CJS.

Reference mechanics to study:

- Mummy Maze / Theseus-and-Minotaur style: the player moves one orthogonal step or waits; the mummy moves faster after each player move; walls block movement; the player wins by reaching the exit and loses if caught.
- Sokoban / push-box style: the player pushes boxes onto target tiles; boxes cannot be pulled; only one box can be pushed at a time; avoid unsolvable deadlocks.
- Research deadlock handling and hint generation for Sokoban-style puzzles.

Useful reference links:

- https://www.mobygames.com/game/41636/mummy-maze-deluxe/
- https://maze.sourceforge.net/tutorial.html
- https://en.wikipedia.org/wiki/Sokoban
- https://jsokoapplet.sourceforge.io/sokoban/deadlocks.html

## Integration Target

Build the mini-games as standalone HTML/JS/CSS modules first, but expose a clean app integration API:

```js
window.CJS = window.CJS || {};
window.CJS.Minigames = {
  listGames(),
  getGame(gameId),
  openMiniGame({
    gameId,
    levelId,
    difficulty,
    seed,
    theme,
    source,
    questId,
    eventId,
    mapId,
    nodeId,
    onComplete
  })
};
```

`openMiniGame` must call `onComplete(result)` with:

```js
{
  gameId: "mummy_maze",
  levelId: "mummy_01",
  status: "win",
  turns: 18,
  hintsUsed: 1,
  score: 82,
  tags: ["minigame:mummy_maze", "puzzle:tomb", "result:win"],
  suggestedOps: [
    { "op": "update_quest_progress", "questId": "optional", "objectiveId": "optional", "amount": 1 },
    { "op": "log", "text": "Mini-game cleared: Mummy Maze." }
  ]
}
```

Do not directly mutate Campaign Mode saves from the mini-game. Return `suggestedOps`; the host app decides whether to apply them.

## Files To Produce

Use this structure:

```text
js/minigames/
  minigame-registry.js
  minigame-host.js
  mummy-maze.js
  push-box.js
css/
  minigames.css
data/minigames/
  mummy_maze_levels.json
  push_box_levels.json
assets/minigames/
  spritesheet.png
  spritesheet.json
  ATTRIBUTION.md
minigames.html
```

If using downloaded assets, only use CC0, public-domain, or clearly compatible licensed assets. Put source, author, license, and URL in `assets/minigames/ATTRIBUTION.md`. Prefer original generated or hand-drawn pixel sprites.

## Shared UI Requirements

- Works in `minigames.html` standalone and inside a Campaign modal later.
- Responsive layout for desktop and mobile.
- Keyboard controls: arrows/WASD, undo, reset, hint.
- Touch controls: directional pad and buttons.
- Buttons: Undo, Reset, Hint, Give Up, Exit.
- Stable tile size with responsive scaling.
- No layout shift while moving pieces.
- Clear win/fail modal with result JSON preview for integration testing.
- Optional sound hooks, but no required audio.
- No external runtime dependencies unless absolutely necessary.

## Art Requirements

Make a coherent CJS tomb/puzzle style:

- 32x32 or 48x48 pixel-art sprites.
- Original explorer sprite.
- Original mummy sprite.
- Optional scorpion or scarab obstacle sprite.
- Wall tile, cracked wall tile, floor tile, exit stairs, gate, key, torch, pressure plate.
- Push-box crate, goal rune, locked crate variant.
- Hover/focus states for accessible UI.
- Canvas fallback shapes if sprites fail to load.

## Mummy Maze Rules

Implement:

- Grid of walls, floor, player, exit, one or more mummies.
- Player moves one orthogonal tile or waits.
- After each player action, each mummy moves up to two steps.
- Default mummy AI: try horizontal movement toward player first, then vertical; if blocked, try the other axis; if both blocked, stay.
- A variant setting can flip priority to vertical-first.
- If a mummy enters the player tile, result is fail.
- If the player reaches exit and survives the mummy response, result is win.
- Support keys/gates and traps as optional level features.
- Support undo by storing state history.
- Hint option uses a solver over full game state and shows the next move, not the whole solution unless debug mode is on.

Level data:

```json
{
  "id": "mummy_01",
  "title": "First Tomb",
  "difficulty": 1,
  "theme": "tomb",
  "width": 7,
  "height": 7,
  "player": [1, 5],
  "exit": [5, 1],
  "mummies": [
    { "id": "m1", "pos": [5, 5], "speed": 2, "priority": "horizontal" }
  ],
  "walls": [[2, 5], [3, 5], [3, 4]],
  "keys": [],
  "gates": [],
  "optimalTurns": 12,
  "tags": ["tutorial", "tomb", "chase"]
}
```

Difficulty bands:

- 1: one mummy, small grid, obvious wall lure.
- 2: longer route, wait action taught.
- 3: two mummies or key/gate.
- 4: traps and vertical-first mummy variant.
- 5: compact hard puzzle requiring planned lure timing.

## Push Box Rules

Implement:

- Grid of walls, floor, player, boxes, goals.
- Player moves orthogonally.
- If moving into a box, push it one tile if the next tile is free.
- Cannot pull boxes.
- Only one box can be pushed at a time.
- Win when all goals are covered.
- Undo/reset/hint required.
- Hint option uses a solver or authored solution path and shows next move/push.
- Detect simple deadlocks: box in non-goal corner, box against wall with no goal on that line, frozen box clusters where practical.

Level data:

```json
{
  "id": "push_01",
  "title": "Guild Crate Stamp",
  "difficulty": 1,
  "theme": "guild_storehouse",
  "width": 7,
  "height": 6,
  "player": [1, 4],
  "boxes": [[3, 3]],
  "goals": [[5, 3]],
  "walls": [[0,0], [1,0]],
  "optimalPushes": 2,
  "optimalMoves": 8,
  "tags": ["tutorial", "crate", "guild"]
}
```

Difficulty bands:

- 1: one box, one goal, no deadlock trap.
- 2: one box with a corner trap.
- 3: two boxes, ordered pushes matter.
- 4: narrow corridors, parking spaces, multiple goals.
- 5: compact hard level with deadlock warnings and multi-step planning.

## CJS Integration Use Cases

The mini-games must support these host calls:

Story/Event node:

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

Quest objective:

```json
{
  "id": "clear_minigame",
  "kind": "minigame",
  "label": "Clear 1 tomb puzzle",
  "current": 0,
  "required": 1,
  "minigame": {
    "gameId": "mummy_maze",
    "difficulty": 2,
    "theme": "tomb"
  }
}
```

Map node:

```json
{
  "id": "sealed_puzzle_room",
  "title": "Sealed Puzzle Room",
  "kind": "puzzle",
  "minigame": {
    "gameId": "push_box",
    "levelId": "push_03",
    "difficulty": 3
  },
  "onClearOps": [
    { "op": "reveal_node", "nodeId": "hidden_cache" }
  ]
}
```

## Acceptance Tests

Provide a small test harness that verifies:

- All level JSON parses.
- Each level has one player and one win condition.
- Tutorial levels are solvable.
- Hint returns a legal next move.
- Undo restores exact prior state.
- Reset restores initial state.
- Win and fail both return the result object.
- No direct CampaignOps calls happen inside mini-game logic.

## Deliverable

Return:

- Working standalone `minigames.html`.
- The files listed above.
- At least 5 levels per game.
- At least 1 level per difficulty band for each game.
- A short `MINIGAME_MERGE_NOTES.md` explaining how to hook `window.CJS.Minigames.openMiniGame(...)` into Campaign sequence nodes, quest rows, and map nodes.
