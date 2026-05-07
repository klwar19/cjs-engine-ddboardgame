# Live2D Companion (Peri)

Avatar mounted in the right-side dock of `combat.html` and `campaign.html`.
Powered by Pixi v6 + Live2D Cubism Core + pixi-live2d-display (lazy-loaded
from CDN by `js/ui/l2d-avatar.js`).

## Folder layout

```
assets/live2d/
  README.md
  registry.json                  ← model + reactions + voice mapping
  peri/                          ← the Cubism model files
    mianyin.model3.json          ← entry file
    mianyin.moc3
    mianyin.physics3.json
    mianyin.cdi3.json
    mianyin.png                  ← used as static fallback if Live2D fails
    mianyin.8192/texture_00.png
    motions/                     ← *.motion3.json
    expressions/                 ← *.exp3.json
  voice/
    peri/                        ← *.mp3 / *.ogg / *.wav (optional)
    peri-v2/                     ← optional direct Peri v2 voice files
```

## Voice clips (optional, future-friendly)

The companion plays an audio file *when one is mapped* and stays silent
otherwise — there are no missing-file errors when the folder is empty.

To wire up voice:

1. Drop audio into `assets/live2d/voice/peri/` or `assets/live2d/voice/peri-v2/` (any web-friendly format), or upload Peri v2 clips through the Audio Library using the reserved `peri_v2_l2d_*` ids.
2. Edit `registry.json` → `models.peri.voice` / `models.peri_v2.voice` and map clips by:
   * **`byFragmentId`** — keyed by quip id from `data/quips.json`
     (e.g. `"e_excited_01": ["excited_01.mp3","excited_01b.mp3"]`).
     Most specific; wins over the others.
   * **`byEventType`** — keyed by combat-log event type
     (`hit`, `miss`, `kill`, `heal`, `battle_start`, `battle_end`,
      `status_applied`, `qte_result`, `knockback`, `dodge`).
   * **`byEventKey`** — keyed by reaction key in this registry
     (`turn_start`, `click`, `campaign_move`, `campaign_loot`,
      `campaign_quest`, `campaign_rest`, `campaign_idle`).

   Each value can be a single filename, an array (random pick per fire), or
   an Audio Library reference such as `sfx:peri_v2_l2d_click`.

3. Reload combat.html / campaign.html — Peri's lip-sync now uses the
   audio duration instead of an estimate from text length.

Example voice section:

```json
"voice": {
  "directory": "assets/live2d/voice/peri/",
  "byFragmentId": {
    "e_bored_01": ["bored_yawn.mp3"],
    "e_excited_01": ["lean_forward.mp3", "ratings_climbing.mp3"]
  },
  "byEventType": {
    "battle_start": ["fight_on_01.mp3","fight_on_02.mp3"],
    "kill":         ["another_one.mp3"],
    "heal":         ["all_better.mp3"]
  },
  "byEventKey": {
    "turn_start": ["your_move.mp3"],
    "click":      ["hi_there.mp3","poke_me.mp3"]
  }
}
```

The companion respects `window.CJS.AudioManager.isMuted()` if present, so
the global mute also silences voice. Set per-channel volume/mute via
`window.CJS.L2DCompanion.setVoiceVolume(0..1)` /
`setVoiceMuted(true|false)`.

## How combat dialogue is sourced

In combat, Peri's speech bubble is fed by the existing **NarratorEngine**:
`data/quips.json` already contains a `cjs_editorial` layer (the lines
prefixed with `[CJS] ` in the battle log) — that's literally Peri talking.
The companion subscribes to `NarratorEngine.subscribe()` and shows the
`[CJS]` line in the bubble while picking an expression from the entry's
type and tags. To extend her vocabulary, just add fragments to
`data/quips.json` with `"layer": "cjs_editorial"` — no code changes
needed.

In campaign mode the bubble is driven by `registry.json → reactions.*`
(no narrator there yet).

## Licensing

Make sure you have rights to redistribute any Live2D model or voice clip.
