# Live2D Avatars

This folder hosts Live2D Cubism models used by the in-game avatar (combat & campaign modes).

## How to upload your model

1. Open this folder on GitHub: `assets/live2d/`
2. Click **Add file → Upload files**
3. Drag the **entire** model folder from your local machine here
   (e.g. `C:\Users\klwar\Desktop\tai lieu nhap hoc sp\CJS\l2d neko loli Peri`)
4. Make sure the `.model3.json` (or `.model.json` for Cubism 2) is at a known path
5. Commit the upload

## Expected layout

A Cubism 4 (`.moc3`) model usually looks like this:

```
assets/live2d/
  peri/
    peri.model3.json          <- entry file (engine loads this)
    peri.moc3
    peri.physics3.json        (optional)
    peri.pose3.json           (optional)
    peri.cdi3.json            (optional)
    textures/
      texture_00.png
    motions/
      idle_01.motion3.json
      tap_body.motion3.json
      ...
    expressions/
      smile.exp3.json
      ...
```

Cubism 2 models use `.model.json` + `.moc` + `.mtn` motions instead. Both versions are supported.

## Registry

After uploading, edit `assets/live2d/registry.json` and point `path` at your model entry file.
The viewer will pick up the registry on next page load.

## Licensing

Make sure you have rights to use any Live2D model you upload. Live2D Cubism models created from copyrighted character art typically require permission from the artist.
