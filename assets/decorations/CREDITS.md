# Decoration Assets — Credits

This folder hosts decoration assets and inline-SVG primitives used by the
Visual Novel window, the campaign overworld map, the campaign grid map,
and the combat grid renderer.

## Procedurally drawn SVG / canvas decorations

The following primitives are drawn programmatically (inline SVG strings or
HTML5 canvas paths) by code in this repository and are released along with
the rest of the project under the repository's license:

| Used in | Source | What it is |
|---|---|---|
| `css/visual-novel.css` (`.campaign-grid-cell.kind-*::before` rules) | Inline SVG `data:` URIs | Terrain decoration patterns for floor, grass, water, stone, battle, boss, rest, shop, reward, trap, exit, event cells. |
| `css/visual-novel.css` (`.campaign-grid-threat`) | Inline SVG `data:` URI | Persona-style "shadow blob" moving threat marker (eyes + grin on a dark silhouette with red outline). |
| `css/visual-novel.css` (`.combat-popup-card::before`) | Inline SVG `data:` URI | Crossed-blades + ring emblem displayed above the combat popup card. |
| `css/visual-novel.css` (`.campaign-objective-banner-icon`) | Inline SVG `data:` URI | Five-point star glyph for the objective-revealed banner. |
| `js/campaign/campaign-map.js` (`_nodeIconDefs()`) | Inline `<symbol>` library | Geometric node icons: battle, boss, campfire/rest, shop, reward, trap, resource, event, exit, entrance. |
| `js/grid/grid-renderer.js` (`_drawTerrainDecor()`) | Canvas 2D paths | Procedural per-terrain decoration: grass tufts, water ripples, brick walls, tree canopies, fire flicker, ice crystals, thorn vines, poison bubbles, healing cross, dark blot, stone speckle. |

All of the above are bespoke geometric primitives created for this
repository — no third-party art is embedded in those data URIs.

## Existing CC0 art reused

The new VN window and themed grid/map backdrops reuse already-shipped CC0
background paintings that live elsewhere in the repository:

| File | License | Source / Author |
|---|---|---|
| `images/story-mode/haven/frostwood-vn.png` | CC0 | OpenGameArt — see `images/story-mode/CREDITS.md`. |
| `images/story-mode/zombie/rot-city-vn.webp` | CC0 | OpenGameArt — see `images/story-mode/CREDITS.md`. |

These backdrops are pulled in as `background-image` for:

- `.campaign-vn-overlay .campaign-vn-backdrop` (Visual Novel window)
- `.campaign-map-canvas[data-theme="..."]` (campaign overworld map)
- `.campaign-grid-map[data-theme="..."]` (campaign grid map)
- `js/grid/grid-renderer.js` via `setTheme({ image })` (combat grid)

## Adding new decorations

If you add downloaded art (Kenney, OpenGameArt, etc.), drop it under one
of the sub-folders here (`grid/`, `nodes/`, `backgrounds/`, `threats/`)
and append a row to the table above with the source URL and license. Keep
the project CC0 / permissive only — anything otherwise belongs in a
separate restricted-assets path.
