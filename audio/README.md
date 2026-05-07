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
- `bgm.codex_shadow_skirmish`
- `sfx.ui_click`
- `sfx.move_step`
- `sfx.defend_guard`
- `sfx.miss`
- `sfx.heal`
- `sfx.crit_sting`
- `sfx.absorb_guard`
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

Reserved battle voice ids are also defined in `data/audio-manifest.json`
under `sfxSlots`. They do not ship with files yet; upload your own files
with these ids when you are ready:

- `sfx.bin_fight` -> `audio/sfx/bin_fight.wav`
- `sfx.bin_hurt` -> `audio/sfx/bin_hurt.wav`
- `sfx.bin_happy` -> `audio/sfx/bin_happy.wav`
- `sfx.bin_angry` -> `audio/sfx/bin_angry.wav`
- `sfx.weapon_bow_shot` -> `audio/sfx/weapon_bow_shot.wav`
- `sfx.zombie_attack` -> `audio/sfx/zombie_attack.wav`
- `sfx.zombie_hurt` -> `audio/sfx/zombie_hurt.wav`
- `sfx.peri_v2_l2d_greeting` -> `audio/sfx/peri_v2_l2d_greeting.wav`
- `sfx.peri_v2_l2d_idle` -> `audio/sfx/peri_v2_l2d_idle.wav`
- `sfx.peri_v2_l2d_click` -> `audio/sfx/peri_v2_l2d_click.wav`
- `sfx.peri_v2_l2d_battle_start` -> `audio/sfx/peri_v2_l2d_battle_start.wav`
- `sfx.peri_v2_l2d_react_happy` -> `audio/sfx/peri_v2_l2d_react_happy.wav`
- `sfx.peri_v2_l2d_react_angry` -> `audio/sfx/peri_v2_l2d_react_angry.wav`
- `sfx.peri_v2_l2d_react_sad` -> `audio/sfx/peri_v2_l2d_react_sad.wav`

To add a new file by hand:

1. Drop the audio file into `audio/sfx/` or `audio/bgm/`.
2. Add an entry to `data/audio-manifest.json`, e.g.
   ```json
   { "sfx": { "magic_hit": "audio/sfx/magic-hit.wav" } }
   ```
   Variant sets are also supported:
   ```json
   { "sfx": { "magic_hit": ["audio/sfx/magic-hit.wav", "audio/sfx/magic-hit-alt.wav"] } }
   ```
3. Reference the id from combat code (built-in keys are listed in the
   developer guide §17) or from an encounter record's `bgm` field.

The editor's **Audio Library** panel does the same flow with a file picker
and uploads to GitHub via `SaveManager.uploadBinaryFileToGitHub()`. It now
preserves the source extension, so `.mp3`, `.ogg`, and `.wav` all work.
