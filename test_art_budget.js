// test_art_budget.js — Phase I.6 art-budget guard.
//
// Reads the SAME manifest the optimizer uses (tools/art-budget.json) and
// asserts every budgeted image is within its `maxEdge` cap — so a re-added or
// re-exported HD asset (the 8192px texture / 9 MB portrait class of mistake)
// fails here instead of silently re-bloating the payload. Dimensions are read
// straight from PNG/JPEG/WebP headers (no Pillow at test time), so this runs in
// plain `npm test` / CI. Category caps are checked here too, independent of a
// production build, while `npm run size:check` enforces the same caps alongside
// the built payload budget.
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
function webpDims(buf) {
  if (
    buf.length < 30 ||
    buf.toString('ascii', 0, 4) !== 'RIFF' ||
    buf.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }
  let i = 12;
  while (i + 8 <= buf.length) {
    const fourcc = buf.toString('ascii', i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    const data = i + 8;
    if (data + size > buf.length) return null;
    if (fourcc === 'VP8X' && size >= 10) {
      return {
        w: 1 + buf.readUIntLE(data + 4, 3),
        h: 1 + buf.readUIntLE(data + 7, 3)
      };
    }
    if (fourcc === 'VP8L' && size >= 5 && buf[data] === 0x2f) {
      const bits = buf.readUInt32LE(data + 1);
      return {
        w: 1 + (bits & 0x3fff),
        h: 1 + ((bits >> 14) & 0x3fff)
      };
    }
    if (
      fourcc === 'VP8 ' &&
      size >= 10 &&
      buf[data + 3] === 0x9d &&
      buf[data + 4] === 0x01 &&
      buf[data + 5] === 0x2a
    ) {
      return {
        w: buf.readUInt16LE(data + 6) & 0x3fff,
        h: buf.readUInt16LE(data + 8) & 0x3fff
      };
    }
    i = data + size + (size % 2);
  }
  return null;
}
function readDims(file) {
  const buf = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') return pngDims(buf);
  if (ext === '.jpg' || ext === '.jpeg') return jpegDims(buf);
  if (ext === '.webp') return webpDims(buf);
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

const SKIP_SOURCE_DIRS = new Set(['.git', 'dist', 'node_modules', 'tmp']);

function walkSourceFiles(dir = ROOT, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(ROOT, abs);
    const first = rel.split(path.sep)[0];
    if (SKIP_SOURCE_DIRS.has(first)) continue;
    if (entry.isDirectory()) {
      walkSourceFiles(abs, out);
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }
  return out;
}

function matchesCategoryCap(rel, cap) {
  const normalized = rel.split(path.sep).join('/');
  const prefix = String(cap.pathPrefix || '');
  if (!prefix || !normalized.startsWith(prefix)) return false;
  const extensions = Array.isArray(cap.extensions) ? cap.extensions : [];
  if (!extensions.length) return true;
  const lower = normalized.toLowerCase();
  return extensions.some((ext) => lower.endsWith(String(ext).toLowerCase()));
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
      ok(`readable image header: ${rel}`, false, 'no parseable PNG/JPEG/WebP header (corrupt?)');
      continue;
    }
    const longEdge = Math.max(dims.w, dims.h);
    const within = longEdge <= target.maxEdge + tol;
    if (!within) worstOver = Math.max(worstOver, longEdge - target.maxEdge);
    ok(`within ${target.maxEdge}px cap: ${rel}`, within, `${dims.w}x${dims.h}`);
  }
}

const categoryCaps = Array.isArray(budget.categoryCaps) ? budget.categoryCaps : [];
ok('budget has categoryCaps array', categoryCaps.length > 0);
const sourceFiles = categoryCaps.length ? walkSourceFiles() : [];

for (const cap of categoryCaps) {
  const label = cap.group || cap.pathPrefix || '?';
  ok(`category cap has a group: ${label}`, typeof cap.group === 'string' && cap.group.length > 0);
  ok(`category cap has a pathPrefix: ${label}`, typeof cap.pathPrefix === 'string' && cap.pathPrefix.length > 0);
  ok(`category cap has extensions: ${label}`, Array.isArray(cap.extensions) && cap.extensions.length > 0);
  ok(
    `category cap has a positive maxFileBytes: ${label}`,
    Number.isFinite(cap.maxFileBytes) && cap.maxFileBytes > 0
  );
  ok(
    `category cap has a positive maxTotalBytes: ${label}`,
    Number.isFinite(cap.maxTotalBytes) && cap.maxTotalBytes > 0
  );

  const files = sourceFiles.filter((file) => matchesCategoryCap(path.relative(ROOT, file), cap));
  ok(`category cap resolves files: ${label}`, files.length > 0, `${files.length} file(s)`);
  const sized = files.map((file) => ({ file, bytes: fs.statSync(file).size }));
  const total = sized.reduce((sum, entry) => sum + entry.bytes, 0);
  const overFiles = sized
    .filter((entry) => entry.bytes > cap.maxFileBytes)
    .sort((a, b) => b.bytes - a.bytes);
  ok(
    `category file-size cap: ${label}`,
    overFiles.length === 0,
    overFiles.length
      ? overFiles.slice(0, 3).map((entry) => `${path.relative(ROOT, entry.file)} ${(entry.bytes / 1048576).toFixed(2)} MB`).join('; ')
      : `${files.length} file(s)`
  );
  ok(
    `category total-size cap: ${label}`,
    total <= cap.maxTotalBytes,
    `${(total / 1048576).toFixed(2)} MB / ${(cap.maxTotalBytes / 1048576).toFixed(2)} MB`
  );
}

console.log('');
console.log(
  `Checked ${totalFiles} budgeted image(s), ${(totalBytes / 1048576).toFixed(1)} MB total`
  + (worstOver ? `; worst overage ${worstOver}px` : '; all within cap')
);
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
