// test_art_budget.js — Phase I.6 art-budget guard.
//
// Reads the SAME manifest the optimizer uses (tools/art-budget.json) and
// asserts every budgeted image is within its `maxEdge` cap — so a re-added or
// re-exported HD asset (the 8192px texture / 9 MB portrait class of mistake)
// fails here instead of silently re-bloating the payload. Dimensions are read
// straight from the PNG/JPEG headers (no Pillow at test time), so this runs in
// plain `npm test` / CI. The image bytes are also sanity-checked (a corrupt
// re-encode would yield no parseable header).
//
// Run: node test_art_budget.js

const fs = require('node:fs');
const path = require('node:path');

let pass = 0;
let fail = 0;
function ok(label, cond, info) {
  if (cond) {
    pass += 1;
    console.log('  OK  ' + label + (info ? ' (' + info + ')' : ''));
  } else {
    fail += 1;
    console.log('  XX  ' + label + (info ? ' (' + info + ')' : ''));
  }
}

const ROOT = __dirname;

// ── dimension readers (header-only; no image library) ──────────────────────
function pngDims(buf) {
  if (buf.length < 24) return null;
  // 8-byte signature, then IHDR: 4 len + "IHDR" + 4 width + 4 height.
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function jpegDims(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 carry frame size.
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    const seg = buf.readUInt16BE(i + 2);
    if (seg < 2) return null;
    i += 2 + seg;
  }
  return null;
}
function readDims(file) {
  const buf = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') return pngDims(buf);
  if (ext === '.jpg' || ext === '.jpeg') return jpegDims(buf);
  return null;
}

// ── tiny glob expander (handles `*` per path segment, real dir names) ───────
function expandGlob(globRel) {
  const parts = globRel.split('/');
  let dirs = [ROOT];
  for (let p = 0; p < parts.length; p += 1) {
    const seg = parts[p];
    const isLast = p === parts.length - 1;
    const next = [];
    if (seg.includes('*')) {
      const re = new RegExp(
        '^' + seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$'
      );
      for (const d of dirs) {
        let entries;
        try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
          if (!re.test(e.name)) continue;
          const abs = path.join(d, e.name);
          if (isLast ? e.isFile() : e.isDirectory()) next.push(abs);
        }
      }
    } else {
      for (const d of dirs) {
        const abs = path.join(d, seg);
        if (fs.existsSync(abs)) next.push(abs);
      }
    }
    dirs = next;
  }
  return dirs;
}
function resolveTarget(target) {
  if (target.path) {
    const abs = path.join(ROOT, target.path);
    return fs.existsSync(abs) ? [abs] : [];
  }
  if (target.glob) return expandGlob(target.glob);
  return [];
}

// ── run ─────────────────────────────────────────────────────────────────────
console.log('Art-budget guard (Phase I.6)');

const budgetPath = path.join(ROOT, 'tools', 'art-budget.json');
ok('tools/art-budget.json exists', fs.existsSync(budgetPath));
const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
ok('budget has a targets array', Array.isArray(budget.targets) && budget.targets.length > 0);

const tol = Number(budget.tolerancePx ?? 0);
let totalFiles = 0;
let totalBytes = 0;
let worstOver = 0;

for (const target of budget.targets) {
  const label = target.path || target.glob;
  ok(`budget entry has a positive maxEdge: ${label}`,
     Number.isFinite(target.maxEdge) && target.maxEdge > 0);
  const files = resolveTarget(target);
  ok(`resolves to at least one file: ${label}`, files.length > 0,
     files.length ? `${files.length} file(s)` : 'NONE — moved/renamed?');
  for (const file of files) {
    totalFiles += 1;
    totalBytes += fs.statSync(file).size;
    const rel = path.relative(ROOT, file);
    const dims = readDims(file);
    if (!dims) {
      ok(`readable image header: ${rel}`, false, 'no parseable PNG/JPEG header (corrupt?)');
      continue;
    }
    const longEdge = Math.max(dims.w, dims.h);
    const within = longEdge <= target.maxEdge + tol;
    if (!within) worstOver = Math.max(worstOver, longEdge - target.maxEdge);
    ok(`within ${target.maxEdge}px cap: ${rel}`, within, `${dims.w}x${dims.h}`);
  }
}

console.log('');
console.log(
  `Checked ${totalFiles} budgeted image(s), ${(totalBytes / 1048576).toFixed(1)} MB total`
  + (worstOver ? `; worst overage ${worstOver}px` : '; all within cap')
);
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
