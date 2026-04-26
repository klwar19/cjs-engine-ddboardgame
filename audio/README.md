# Audio assets

Drop user-supplied MP3 files here. The combat audio layer
(`js/ui/audio-manager.js`) fetches them by id from
`data/audio-manifest.json`.

```
audio/
  sfx/   — short one-shots (skill hits, weapon hits, item use, KO, status apply)
  bgm/   — looping battle music
```

To add a new file by hand:

1. Drop the `.mp3` into `audio/sfx/` or `audio/bgm/`.
2. Add an entry to `data/audio-manifest.json`, e.g.
   ```json
   { "sfx": { "magic_hit": "audio/sfx/magic-hit.mp3" } }
   ```
3. Reference the id from combat code (built-in keys are listed in the
   developer guide §17) or from an encounter record's `bgm` field.

The editor's **Audio Library** panel does the same flow with a file picker
and uploads to GitHub via `SaveManager.uploadBinaryFileToGitHub()`.
