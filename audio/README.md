# Audio assets

The repo now ships with a small original starter pack so combat has
real audio out of the box. You can replace or extend it with your own
files at any time through `data/audio-manifest.json`.

```
audio/
  sfx/   — short one-shots (skill hits, weapon hits, item use, KO, status apply)
  bgm/   — looping battle music
```

Included starter ids:

- `bgm.codex_battle_loop`
- `sfx.ui_click`
- `sfx.weapon_hit_physical`
- `sfx.weapon_hit_fire`
- `sfx.weapon_hit_ice`
- `sfx.weapon_hit_lightning`
- `sfx.weapon_hit_water`
- `sfx.magic_cast`
- `sfx.magic_hit`
- `sfx.item_use`
- `sfx.status_apply`
- `sfx.ko`

To add a new file by hand:

1. Drop the audio file into `audio/sfx/` or `audio/bgm/`.
2. Add an entry to `data/audio-manifest.json`, e.g.
   ```json
   { "sfx": { "magic_hit": "audio/sfx/magic-hit.wav" } }
   ```
3. Reference the id from combat code (built-in keys are listed in the
   developer guide §17) or from an encounter record's `bgm` field.

The editor's **Audio Library** panel does the same flow with a file picker
and uploads to GitHub via `SaveManager.uploadBinaryFileToGitHub()`. It now
preserves the source extension, so `.mp3`, `.ogg`, and `.wav` all work.
