# Mini-Game Asset Attribution

The CJS mini-game module ships with two bundled CC0 tile sheets plus local
character sheets used by the canvas renderers.

| File | Used by | Source | License |
|------|---------|--------|---------|
| `dungeon_sheet.png` | `mummy_maze` walls, floor, gate, exit/stairs | Kenney - **Tiny Dungeon** (v1.0, 2022-07-05). https://kenney.nl/assets/tiny-dungeon | CC0 1.0 - `KENNEY_DUNGEON_LICENSE.txt` |
| `sokoban_sheet.png` | `push_box` floor, wall, crates, goal marker | Kenney - **Sokoban Pack** (2017-01-24). https://kenney.nl/assets/sokoban | CC0 1.0 - `KENNEY_SOKOBAN_LICENSE.txt` |
| `images/characters/bin_sprite.png` | `push_box`, `mummy_maze` animated player | User-supplied Bin walk-cycle sheet | Project asset |
| `images/monsters/shadow_stalker.png` | `mummy_maze` animated guardian | User-supplied shadow stalker sheet | Project asset |

The Kenney packs are public-domain (Creative Commons Zero, CC0 1.0). Kenney
explicitly states that crediting is voluntary; we credit anyway because the
work is good and Kenney makes a lot of CC0 art for indie devs.

## How Sprites Are Wired

The map from logical names (`wall`, `mummy_left_2`, `crate_on_goal`, etc.) to
pixel rectangles inside the sheets lives in `assets/minigames/spritesheet.json`.
The runtime loader is `js/minigames/minigame-sprites.js`. Each game's render
loop asks the loader for a logical sprite first; if the sheet failed to load or
the sprite is missing, the game's procedural canvas fallback runs instead.

Procedurally drawn items are listed under `"procedural": [...]` in the sprite
map. Current examples include key/trap drawings for mummy maze, goal glows,
deadlock outlines, priority badges, shadows, and the extra tile lighting pass.

## Swapping The Art

1. **Edit `spritesheet.json` in place** - change tile indices or x/y/w/h
   rectangles. The next page load picks them up.
2. **Replace the PNG sheets** - keep the JSON pointing at the same paths and
   drop in new PNGs with matching tile coordinates.
3. **Point at an entirely different map at runtime** - call
   `window.CJS.Minigames.useSpriteMap('path/to/alt-sprites.json')` or pass an
   inline object before opening the mini-game.

```js
window.CJS.Minigames.useSpriteMap('events/cursed-vault/sprites.json');
window.CJS.Minigames.openMiniGame({ gameId: 'mummy_maze', ... });
```

## Notes For Future Mummy Art

The current mummy maze uses the local shadow stalker animation sheet. If a
classic bandaged mummy sheet is desired later, a compatible option is the
OpenGameArt "Mummy" pack by Svetlana Kushnariova (Cabbit) and Jordan Irwin
(AntumDeluge), licensed CC-BY 3.0 / OGA-BY 3.0:
https://opengameart.org/content/mummies

To use it, drop the PNG into this directory, add a sheet entry to
`spritesheet.json`, and map its directional frames to the logical names the
renderer already asks for (`mummy_down_0`, `mummy_left_1`, and so on).

## Code

All `js/minigames/*.js`, `css/minigames.css`, level data, and HTML in this
drop were written for the CJS Engine project. License follows the repository.
