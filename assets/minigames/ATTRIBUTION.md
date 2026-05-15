# Mini-Game Asset Attribution

The CJS mini-game module ships with two bundled tile sheets and one
attribution file. License files for each sheet sit alongside this README.

| File | Used by | Source | License |
|------|---------|--------|---------|
| `dungeon_sheet.png` | `mummy_maze` (walls, floor, player, mummy, gate, exit/stairs) | Kenney — **Tiny Dungeon** (v1.0, 2022-07-05). https://kenney.nl/assets/tiny-dungeon | CC0 1.0 — `KENNEY_DUNGEON_LICENSE.txt` |
| `sokoban_sheet.png` | `push_box` (floor, wall, crates, goal marker, player) | Kenney — **Sokoban Pack** (2017-01-24). https://kenney.nl/assets/sokoban | CC0 1.0 — `KENNEY_SOKOBAN_LICENSE.txt` |

Both packs are **public-domain (Creative Commons Zero, CC0 1.0)**. Kenney
explicitly states that crediting is voluntary; we credit anyway, because the
work is good and Kenney makes a lot of CC0 art for indie devs.

## How sprites are wired

The map from logical names (`wall`, `mummy`, `crate_on_goal`, …) to pixel
rectangles inside the sheets lives in `assets/minigames/spritesheet.json`.
The runtime loader is `js/minigames/minigame-sprites.js`. Each game's render
loop asks the loader for a logical sprite first; if the sheet failed to load
or the sprite is missing, the game's procedural canvas fallback runs
instead. Procedurally drawn items are listed under `"procedural": [...]`
in the sprite map (currently `key` and `trap` for mummy maze, `deadlock_outline`
for push box).

## Swapping the art

Three escape hatches, no JS changes required for any of them:

1. **Edit `spritesheet.json` in place** — change tile indices or x/y/w/h
   rectangles. The next page load picks them up.
2. **Replace the PNG sheets** — keep the JSON pointing at the same paths,
   drop in new PNGs with matching tile coordinates.
3. **Point at an entirely different map at runtime** — call
   `window.CJS.Minigames.useSpriteMap('path/to/alt-sprites.json')` (or pass
   an inline object). Useful when an event needs a different visual theme:

   ```js
   // before opening a haunted-tomb event
   window.CJS.Minigames.useSpriteMap('events/cursed-vault/sprites.json');
   window.CJS.Minigames.openMiniGame({ gameId: 'mummy_maze', ... });
   ```

## If you want fancier mummy animation

The current mummy uses Kenney's static 16×16 mummy tile. An alternative is
the **OpenGameArt "Mummy" pack** by Svetlana Kushnariova (Cabbit) and Jordan
Irwin (AntumDeluge) — 24×32 four-directional animated walking frames,
licensed CC-BY 3.0 / OGA-BY 3.0. https://opengameart.org/content/mummies

To use it, drop the PNG into this directory, add a `mummies` entry to
`sheets` in `spritesheet.json`, and switch the `mummy_maze.sprites.mummy`
entry to point at the new sheet. (You'd also need to extend
`minigame-sprites.js` to pick a frame per direction, which it doesn't do
today — sprites today are static-frame.)

## Code

All `js/minigames/*.js`, `css/minigames.css`, level data, and HTML in this
drop were written for the CJS Engine project. License follows the repository.
