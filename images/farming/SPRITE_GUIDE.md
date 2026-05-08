# Farming Sprite Guide

The current farmer art is extracted from the generated farming atlas. You can replace it later without changing JavaScript.

## Player Sprite

Default player sheet:

```text
images/farming/farmer-from-atlas.png
```

The farm CSS expects one horizontal 4-frame sheet:

```text
frame 1: facing down
frame 2: facing up
frame 3: facing left
frame 4: facing right
```

Current source size:

```text
512x128 px total, four 128x128 frames
```

Small replacement source size:

```text
128x32 px total, four 32x32 frames
```

Any size works as long as all four frames are equal width and arranged horizontally. You can use SVG or PNG. If you keep the same file name and frame order, no code change is needed. If you use a different file name, update this CSS variable in `css/campaign.css`:

```css
.farm-mode {
  --farm-player-sprite: url("../images/farming/farmer-from-atlas.png");
}
```

## Better Art Direction

For a Stardew-like level of quality, use original art with:

- clear face/hair/hat silhouette
- larger head and readable outfit colors
- 2-4 walking frames per direction when animation is added later
- transparent background
- consistent pixel grid, usually 16x16, 24x32, or 32x32 per frame

Do not copy Stardew Valley assets. Use original AI-generated art, commissioned art, self-made sprites, or licensed asset packs that allow use in your project.

## Future Walking Animation

The current farm only swaps facing direction. A future upgrade can support an 8-frame or 16-frame walk sheet, for example:

```text
down idle, down step 1, down step 2, down step 3,
up idle, up step 1, up step 2, up step 3,
left idle, left step 1, left step 2, left step 3,
right idle, right step 1, right step 2, right step 3
```

That would need CSS animation plus a small movement-state flag in `js/campaign/farming-mode.js`.

## Extracted Atlas Assets

The farm now uses these cropped sprites from `farm-sprite-atlas.png`:

```text
tile-grass.png
tile-soil.png
tile-watered-soil.png
tile-tall-grass.png
crop-seed.png
crop-sprout.png
crop-leaf.png
crop-mushroom.png
crop-ready-mushroom.png
tool-hand.png
tool-hoe.png
tool-seed.png
tool-water.png
tool-fertilizer.png
tool-scythe.png
```

The sprite paths are centralized as CSS variables in `css/campaign.css` under `.farm-mode`, so future art swaps should usually only need a file replacement or one variable change.
