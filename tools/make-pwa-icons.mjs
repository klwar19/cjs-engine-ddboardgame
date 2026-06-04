#!/usr/bin/env node
// make-pwa-icons.mjs — Rasterize public/icon.svg into the PNG sizes a PWA
// needs for broad installability (Android home-screen, iOS apple-touch-icon,
// maskable adaptive icons). The SVG alone is enough for desktop Chrome, but
// iOS Safari ignores SVG apple-touch-icons and several Android launchers want
// a real raster maskable, so we ship PNGs alongside the scalable source.
//
// The generated PNGs are COMMITTED artifacts (like the optimized art), so this
// is a dev tool, not a build/runtime dependency. It needs `sharp`, which is
// NOT in package.json for the same reason `tools/optimize-art.py` keeps Pillow
// out of it:
//
//   npm i --no-save sharp && node tools/make-pwa-icons.mjs
//
// Idempotent: re-running regenerates byte-similar PNGs from the same SVG.
//
// Maskable note: the OS applies its own mask (circle / squircle / rounded
// square) to a maskable icon, so the art must be FULL-BLEED (no transparent
// corners) and keep its logo inside the inner 80% "safe zone". The source
// icon's d20 already sits within that safe circle; for the maskable variant we
// only drop the rounded-rect corner radius so the background fills to the edge.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const svgPath = path.join(publicDir, "icon.svg");

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error(
    "make-pwa-icons: `sharp` is not installed. This is a dev-only tool — run:\n" +
      "  npm i --no-save sharp && node tools/make-pwa-icons.mjs"
  );
  process.exit(2);
}

if (!fs.existsSync(svgPath)) {
  console.error(`make-pwa-icons: source not found: ${path.relative(root, svgPath)}`);
  process.exit(2);
}

const svg = fs.readFileSync(svgPath, "utf8");
// Full-bleed variant for the maskable icon: square off the background rect so
// the OS mask never reveals transparent corners. Everything else is identical.
const maskableSvg = svg.replace(/(<rect\b[^>]*?)\srx="\d+"/, "$1");

// Render at 4× density then downscale for crisp antialiasing, regardless of the
// SVG's intrinsic size.
async function render(source, size, outFile) {
  const out = path.join(publicDir, outFile);
  await sharp(Buffer.from(source), { density: 96 * 4 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(out);
  const bytes = fs.statSync(out).size;
  console.log(`  ${outFile.padEnd(24)} ${size}x${size}  ${(bytes / 1024).toFixed(1)} KB`);
  if (bytes < 512) {
    console.error(`make-pwa-icons: ${outFile} is suspiciously small (${bytes} B) — render likely failed.`);
    process.exitCode = 1;
  }
}

console.log("make-pwa-icons: rasterizing public/icon.svg →");
await render(svg, 192, "icon-192.png");
await render(svg, 512, "icon-512.png");
await render(maskableSvg, 512, "icon-maskable-512.png");
console.log("make-pwa-icons: done.");
