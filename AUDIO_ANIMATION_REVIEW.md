# Audio + Animation Change Review

Use this file to walk through everything that landed on `main` for the
combat audio + animation feature. Read top-to-bottom; each section
points at the exact files and lines so you can verify the work.

## Commits in scope

| SHA       | Title                                                       |
|-----------|-------------------------------------------------------------|
| `ff7a4f4` | Add combat audio (SFX + BGM) and basic battle animations    |
| `282350d` | Merge: combat audio (SFX + BGM) and basic battle animations |
| `0ab4756` | Fix battle FX positioning + add WebAudio SFX fallback       |

Diff against the pre-feature baseline:
```bash
git diff 6eb38e6..0ab4756 --stat
```

## TL;DR

- New presentation layer that listens to existing `CombatManager` pub/sub
  and renders sound + DOM/CSS animations.
- Combat math is unchanged. Audio + animations are no-ops if disabled or
  missing — they cannot break a battle.
- `node test_engine.js` → **87/87 passes**.

## Subsystems

### A. AudioManager (`js/ui/audio-manager.js`)
- `loadManifest()`, `getManifest()` — fetches `data/audio-manifest.json`
- `playSfx(key, { fallbacks })` — round-robin pool of 6 `<audio>` elements
- `playBgm(idOrPool, opts)` — single looping `<audio>`; array picks at random
- `stopBgm()`, `setVolume('sfx'|'bgm', 0..1)`, `mute()`, `isMuted()`
- Volume + mute persisted to `localStorage` keys `cjs.audio.{sfxVol, bgmVol, muted}`
- **WebAudio fallback** (added in `0ab4756`): if a key isn't registered
  in the manifest, plays a short synthesized oscillator tone instead so
  SFX is audible before any MP3s are uploaded. See `FALLBACK_TONES` map.
- Logs a one-time `console.info` when both SFX and BGM are empty so the
  user knows why they're hearing the fallback tones.

### B. AnimationBus (`js/ui/animation-bus.js`)
- Tiny typed pub/sub: `on(name, fn)`, `off(name, fn)`, `emit(name, payload)`.
- Subscriber errors are caught and logged; never propagate to combat code.

### C. CSS animations (`css/combat-animations.css`)
- 5 keyframe sets: `cjs-damage-flash`, `cjs-ko-fade`, `cjs-cast-flourish`,
  `cjs-move-tween`, `cjs-turn-banner`.
- BGM control panel styling (`.bgm-controls`).
- `body.no-anim` global disable.

### D. SaveManager extension (`js/core/save-manager.js`)
- `fileToBase64(file)` — `File` → base64 string via `FileReader`.
- `uploadBinaryFileToGitHub(path, base64Content, opts)` — same PUT-to-
  GitHub flow as the text uploader, but accepts pre-base64 binary.
- Both exported on the public API (`return Object.freeze({ … })`).

### E. CombatSettings additions (`js/combat/combat-settings.js`)
- `setAnimationsEnabled(flag)` / `getAnimationsEnabled()`
- `setDefaultBgmPool(ids[])` / `getDefaultBgmPool()`
- These are session prefs and intentionally **not** wiped by `reset()`.

### F. Encounter editor BGM picker (`js/builders/encounter-editor.js`)
- New "Audio" form section with three modes: none / single / random pool.
- Stores `bgm: "id"` (string) or `bgm: ["id1","id2"]` (array) on the
  encounter record. Missing → fall back to default pool.

### G. Audio Library editor panel (`js/builders/audio-library.js`, new)
- Editor sidebar → **Tools → Audio Library**.
- File picker uploads MP3 to `audio/sfx/<id>.mp3` or `audio/bgm/<id>.mp3`
  on GitHub via `SaveManager.uploadBinaryFileToGitHub`.
- Updates `data/audio-manifest.json` in the same flow.
- Lists existing entries with play/preview and remove buttons.
- Requires a configured GitHub token (Editor → GitHub).

### H. CombatUI integration (`js/ui/combat-ui.js`)
- Sidebar panel: track select, play/pause, mute, music + sfx volume
  sliders, animations toggle.
- `_startEncounterBgm()` resolves encounter.bgm → default pool.
- `_bindAnimationBus()` subscribes to all 5 events.
- `_spawnFx()` mounts FX overlays. **Important:** uses
  `canvas.offsetLeft/offsetTop` so FX align with the centered canvas
  inside `.combat-grid-wrap` (this was the v1 bug fixed in `0ab4756`).

### I. Hook points wired into combat code

| Event              | File:Line(approx)                       | Effect                                       |
|--------------------|------------------------------------------|----------------------------------------------|
| Move success       | `js/combat/action-handler.js` `_doMove`  | `AnimationBus.emit('unit_move')`             |
| Weapon attack hit  | `js/combat/action-handler.js` `_doAttack`| `playSfx('weapon_hit_<element>')` + damage emit (in damage-calc) |
| Skill cast         | `js/combat/action-handler.js` `_doSkill` | `emit('skill_cast')`, `playSfx('magic_cast')` for Magic skills |
| Skill hit          | `js/combat/action-handler.js` `_doSkill` | `playSfx('magic_hit')` or `weapon_hit_<element>` |
| Item use           | `js/combat/action-handler.js` `_doItem`  | `playSfx('item_use')`                        |
| Damage applied     | `js/combat/damage-calc.js` `applyDamage` | `emit('damage')`                             |
| Status applied     | `js/combat/status-manager.js` `applyStatus`| `playSfx('status_apply')`                  |
| Turn start         | `js/combat/combat-manager.js` `_beginCurrentUnitTurn` | `emit('turn_start')`             |
| Unit KO            | `js/combat/combat-manager.js` `_handleDeath` | `emit('unit_ko')` + `playSfx('ko')`      |

All hooks are guarded with `try {} catch` and optional chaining — they
cannot throw or break the turn loop.

## Files touched

**New (8)**
- `js/ui/audio-manager.js`
- `js/ui/animation-bus.js`
- `js/builders/audio-library.js`
- `css/combat-animations.css`
- `data/audio-manifest.json`
- `audio/README.md`
- `audio/sfx/.gitkeep`
- `audio/bgm/.gitkeep`

**Modified (12)**
- `DEVELOPER_GUIDE.md` (added §17 Audio and Animation)
- `editor.html` (Audio Library nav item, panel, editorMap entry, script tag)
- `combat.html` (link `combat-animations.css`, audio-manager, animation-bus)
- `index.html` (audio-manager, animation-bus for sanity-check)
- `js/builders/encounter-editor.js` (BGM picker + `_bgm` state + save)
- `js/combat/action-handler.js` (SFX + animation emits)
- `js/combat/combat-manager.js` (turn_start + unit_ko emits, ko SFX)
- `js/combat/combat-settings.js` (`animationsEnabled`, `defaultBgmPool`)
- `js/combat/damage-calc.js` (damage emit)
- `js/combat/status-manager.js` (status_apply SFX)
- `js/core/save-manager.js` (binary upload helpers)
- `js/ui/combat-ui.js` (BGM panel, AnimationBus subscribe, FX layer)

## Manual test plan

Run from a static server (e.g. `python3 -m http.server`) and open
`combat.html`. Open DevTools console to see the audio hint.

| Step | Expected                                                         |
|------|------------------------------------------------------------------|
| 1. Start any encounter (Battle Setup or pick from dropdown)       | Console: `[CJS Audio] No MP3s registered…`. Sidebar BGM controls visible. |
| 2. Move a unit                                                    | Both the from and to cells flash blue briefly                    |
| 3. Basic attack (or any skill) lands a hit                        | Target cell flashes red, audible blip                            |
| 4. Magic skill (e.g. firebolt)                                    | Caster cell pulses blue (cast flourish), target flashes, magic blip |
| 5. KO an enemy                                                    | Cell fades + scales down (~600ms), low oscillator thud           |
| 6. Status applied (e.g. burn)                                     | Status apply blip                                                |
| 7. New unit's turn starts                                         | Banner flies in from the side with the unit's name (player = green stripe, enemy = red stripe) |
| 8. Toggle the **Animations** checkbox off                         | All cell flashes/banners stop. Audio still plays.                |
| 9. Click the speaker (mute) button                                 | All audio stops. Animations still play.                          |
| 10. Drag SFX + Music sliders                                      | Volume changes immediately; values persist after page reload.    |

**BGM**: empty manifest means the BGM dropdown only contains "-- none --".
To test BGM end-to-end, configure the GitHub token, open the **Audio
Library** panel in the editor, upload an MP3 to the BGM tab, then
attach it to an encounter via the encounter editor's Audio section. On
combat start the dropdown will be populated and the chosen track will
loop.

## Known limitations / out of scope

- No per-skill SFX overrides yet — routing is by `damageType + element`.
- WebAudio fallback tones are intentionally minimal (single-osc blips);
  they're a placeholder, not the final feel.
- The move animation flashes both cells but does not actually tween the
  unit sprite along the path — that would need either canvas-side sprite
  animation or a temporary DOM ghost overlay.
- KO fade does not block `removeFromBoard()` — the unit is removed
  immediately and the FX plays on the now-empty cell. Feels fine for a
  600ms effect but noted.
- Audio Library does not delete the underlying MP3 file when removing
  an entry; only the manifest is updated. Stale files in `audio/`
  must be pruned by hand.
- BGM play on battle start can be blocked by browser autoplay policy
  until the user clicks something. The Play button in the BGM panel
  always works because it's a user gesture.
- No Git LFS guidance for large MP3 collections — current setup pushes
  binary blobs to the repo. Fine for a few short tracks; revisit if it
  grows.

## Where to push back

If anything below feels wrong, that's good feedback:

- **Synth fallback tones too cheesy?** Drop the FALLBACK_TONES map in
  `audio-manager.js` to silence them, or replace with `SimpleSampler`
  WAV blobs.
- **Animation overlays should be on the canvas itself, not DOM?** Doable,
  but means moving the FX queue into `grid-renderer.js` and re-rendering
  per frame. More invasive.
- **BGM should belong to the world, not the encounter?** Move the
  `bgm` field from encounter to `data/worlds/<id>/_meta.json` and
  resolve it in `_startEncounterBgm()` via the encounter's `_world`
  tag.
- **Audio Library upload UX?** Currently one file at a time. Could
  batch-upload a folder.
