# Grid Map Asset Manifest

SVG fallbacks that work without any user uploads. The grid renderer prefers
PNG assets at the paths below when they exist, otherwise it falls back to
these SVGs.

## Tiles
- `assets/grid/tile_snow.svg` (snow / ice / frostwood floor — default)
- `assets/grid/tile_grass.svg` (grass / forest floor / open field)
- `assets/grid/tile_dirt.svg` (dirt / mud / patrol path)
- `assets/grid/tile_stone.svg` (stone / tile / floor — passable)
- `assets/grid/tile_wall.svg` (wall / obstacle / rock / pillar — impassable)
- `assets/grid/tile_forest.svg` (heavier woods / trees)
- `assets/grid/tile_water.svg` (water / river / pond)
- `assets/grid/tile_path.svg` (dirt road / cobble path)

## Nodes (point-of-interest markers)
- `assets/nodes/node_battle.svg`
- `assets/nodes/node_boss.svg`
- `assets/nodes/node_rest.svg` (camp / inn)
- `assets/nodes/node_shop.svg`
- `assets/nodes/node_story.svg` (story scene / clue / lore)
- `assets/nodes/node_treasure.svg` (loot chest / reward)
- `assets/nodes/node_event.svg` (special event / heart)

## Sprites
- `assets/sprites/bin_marker.svg` (player marker fallback — used by no-sprite class)
- `assets/sprites/shadow_marker.svg` (chasing-threat marker fallback — used by no-sprite class)

## Active sprite sheets (preferred, drawn directly by CSS)
Each is a 4x4 grid of 320x320 frames (1280x1280 total). Row layout:
  row 0 = facing down, row 1 = up, row 2 = right, row 3 = left.

- `images/characters/bin.png` (portrait, neutral expression — fullsize, used by VN)
- `images/characters/bin_normal.png` / `bin_angry.png` / `bin_happy.png` / `bin_sad.png`
- `images/characters/bin_sprite.png` (4x4 movement sprite sheet — used on grid + node maps)
- `images/monsters/shadow_stalker.png` (4x4 movement sprite sheet — used for moving threats)
