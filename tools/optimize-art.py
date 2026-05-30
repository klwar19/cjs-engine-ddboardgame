#!/usr/bin/env python3
"""optimize-art.py — Phase I.6 art downscaler.

Shrinks the curated set of oversized images listed in tools/art-budget.json by
capping each one's longer edge (aspect preserved) and re-encoding it IN PLACE,
keeping the same path + format so no `<img>` / CSS / data-JSON / live2d
reference has to change. Idempotent: a file already within its `maxEdge` is
left untouched, so re-running is a no-op and never compounds quality loss.

Only deliberately-chosen art is in the budget — character portraits, story-mode
backgrounds, and live2d textures (Cubism samples textures by NORMALIZED UVs, so
uniformly downscaling a texture only lowers its resolution; the .moc3 rig is
never touched). Sprite sheets / tile atlases are excluded: their pixel cell
sizes are hardcoded in the renderers, so downscaling would misalign frames.

Usage:
    pip install Pillow            # one-time (dev tool, not a runtime dep)
    python3 tools/optimize-art.py            # downscale in place
    python3 tools/optimize-art.py --dry-run  # report what WOULD change
    npm run art:optimize                      # same, via package.json

This is a manual/dev tool (like tools/generate_sfx.py): run it after adding or
replacing oversized art, then commit the shrunk files and re-baseline the size
guard with `npm run size:baseline`. After it runs, `node test_art_budget.js`
verifies every budgeted file is within `maxEdge`.
"""

import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUDGET = os.path.join(ROOT, "tools", "art-budget.json")

try:
    from PIL import Image
except ImportError:
    sys.stderr.write(
        "optimize-art: Pillow is required.\n  pip install Pillow\n"
        "(Pillow is a dev-only tool dependency — it is not part of the app "
        "or the npm build.)\n"
    )
    sys.exit(2)

# Pillow >= 9.1 moved the resampling enum; fall back for older installs.
try:
    LANCZOS = Image.Resampling.LANCZOS
except AttributeError:  # pragma: no cover
    LANCZOS = Image.LANCZOS

DRY_RUN = "--dry-run" in sys.argv[1:]


def human(n):
    return f"{n / 1048576:.2f} MB" if n >= 1048576 else f"{n / 1024:.1f} KB"


def expand(target):
    """Resolve a target's `path` or `glob` to absolute file paths."""
    if "path" in target:
        p = os.path.join(ROOT, target["path"])
        return [p] if os.path.exists(p) else []
    if "glob" in target:
        return sorted(glob.glob(os.path.join(ROOT, target["glob"])))
    return []


def downscale(path, max_edge):
    """Downscale `path` so its longer edge == max_edge, in place. Returns
    (changed, before_bytes, after_bytes, note)."""
    before = os.path.getsize(path)
    with Image.open(path) as im:
        im.load()
        w, h = im.size
        fmt = im.format  # "PNG" / "JPEG" — preserve it
        long_edge = max(w, h)
        if long_edge <= max_edge:
            return (False, before, before, f"within cap ({w}x{h})")

        scale = max_edge / float(long_edge)
        new_size = (max(1, round(w * scale)), max(1, round(h * scale)))
        mode = im.mode

        if DRY_RUN:
            return (True, before, before, f"would downscale {w}x{h} -> {new_size[0]}x{new_size[1]}")

        resized = im.resize(new_size, LANCZOS)

        save_kwargs = {}
        if fmt == "PNG":
            # Palette PNGs resample poorly; promote to a true-colour mode that
            # keeps any alpha, then let PNG's lossless compression do the rest.
            if mode == "P":
                resized = resized.convert("RGBA")
            save_kwargs = {"optimize": True, "compress_level": 9}
        elif fmt in ("JPEG", "JPG"):
            if resized.mode in ("RGBA", "P", "LA"):
                resized = resized.convert("RGB")
            save_kwargs = {"quality": 85, "optimize": True, "progressive": True}

        # Re-encode in place, same format + path. No metadata carried over.
        resized.save(path, format=fmt, **save_kwargs)

    after = os.path.getsize(path)
    return (True, before, after, f"{w}x{h} -> {new_size[0]}x{new_size[1]}")


def main():
    with open(BUDGET, "r", encoding="utf-8") as f:
        budget = json.load(f)

    targets = budget.get("targets", [])
    total_before = 0
    total_after = 0
    changed_files = 0
    skipped = 0
    missing = 0
    errors = 0

    print(f"optimize-art: {'DRY RUN — ' if DRY_RUN else ''}processing {len(targets)} budget entries\n")
    for target in targets:
        label = target.get("path") or target.get("glob") or "?"
        files = expand(target)
        if not files:
            print(f"  !! no files matched: {label}")
            missing += 1
            continue
        max_edge = int(target["maxEdge"])
        for path in files:
            rel = os.path.relpath(path, ROOT)
            try:
                changed, before, after, note = downscale(path, max_edge)
            except Exception as exc:  # keep going; report at the end
                print(f"  XX {rel}: {exc}")
                errors += 1
                continue
            total_before += before
            total_after += after
            if changed:
                changed_files += 1
                pct = (1 - after / before) * 100 if before else 0
                arrow = "(dry-run)" if DRY_RUN else f"{human(before)} -> {human(after)}  -{pct:.0f}%"
                print(f"  -> {rel}  [{note}]  {arrow}")
            else:
                skipped += 1

    print("")
    saved = total_before - total_after
    print(
        f"optimize-art: {'would change' if DRY_RUN else 'changed'} {changed_files} file(s), "
        f"skipped {skipped} within cap"
        + (f", {missing} missing target(s)" if missing else "")
        + (f", {errors} error(s)" if errors else "")
    )
    if not DRY_RUN and changed_files:
        print(f"  total: {human(total_before)} -> {human(total_after)}  (saved {human(saved)})")
        print("  next: `npm run size:baseline` to re-baseline, then `node test_art_budget.js`.")
    if errors or missing:
        sys.exit(1)


if __name__ == "__main__":
    main()
