# Mini-Game Asset Attribution

The CJS Mini-Game module ships with **no third-party art assets**. Every visual
in `mummy_maze` and `push_box` is rendered procedurally with HTML5 Canvas
primitives from `js/minigames/mummy-maze.js` and `js/minigames/push-box.js`.
There is no `spritesheet.png` to bundle, no external download, and therefore no
upstream license to track for art.

## Why canvas-drawn instead of imported sprites

- Keeps the merge surface small for the host Campaign Mode app — no binary
  assets to vet, ship, or version.
- Avoids licensing entanglements. Reusable pixel-art mummy/sokoban packs exist
  on opengameart.org and itch.io, but most require attribution that needs to
  flow through the Campaign Mode credit screen — out of scope for this drop.
- Satisfies the spec line "Canvas fallback shapes if sprites fail to load":
  the fallback IS the rendered art.

## If you swap in raster sprites later

Drop a `spritesheet.png` and `spritesheet.json` into this directory and extend
the renderer in each game file to call `drawImage` when the spritesheet loads.
Then list each tile here as follows:

```
Tile name        Source URL        Author        License        Notes
explorer         <url>             <name>        CC-BY 3.0      32x32
mummy            <url>             <name>        OGA-BY 3.0     32x32
crate            <url>             <name>        CC0            32x32
…
```

## Game design references (no asset reuse)

Mechanics, naming, and rule wording were guided by these public references.
They are cited for design intent only; no code or art was copied:

- Mummy Maze Deluxe — https://www.mobygames.com/game/41636/mummy-maze-deluxe/
- Theseus and the Minotaur tutorial — https://maze.sourceforge.net/tutorial.html
- Sokoban (Wikipedia) — https://en.wikipedia.org/wiki/Sokoban
- Sokoban deadlock notes — https://jsokoapplet.sourceforge.io/sokoban/deadlocks.html

## Code

All `js/minigames/*.js`, `css/minigames.css`, level data, and HTML in this drop
were written for the CJS Engine project. License follows the repository.
