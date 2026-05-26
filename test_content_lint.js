// test_content_lint.js — Smoke test for the content-lint tool.
//
// We want CI to fail loudly if a contributor commits content that breaks
// the canonical shape. Running the lint as a subprocess gives us the
// same exit-code contract used in dev. We also assert that the AI
// indexes can be rebuilt from the current tree without errors.
//
// Run: node test_content_lint.js

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

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

console.log('Content lint smoke tests');

// 1. content-lint exits 0 on the current tree.
const lint = spawnSync('node', ['tools/content-lint.mjs', '--quiet'], {
  cwd: __dirname, encoding: 'utf8'
});
ok('content-lint runs on the shipping tree', lint.status === 0,
   lint.status !== 0 ? (lint.stdout + lint.stderr).slice(-300) : `exit ${lint.status}`);

// 2. A deliberately-broken patch is rejected with non-zero exit.
const tmpPatch = path.join(__dirname, 'tmp_broken_patch.json');
fs.writeFileSync(tmpPatch, JSON.stringify({
  target: { file: 'data/universal/skills.json' },
  format: 'cjs-skills',
  upserts: [{ id: 'BAD-ID-WITH-CASE', name: 'X', power: 1 /* missing ap, mp */ }]
}));
const broken = spawnSync('node', ['tools/content-lint.mjs', '--quiet', '--patch', tmpPatch], {
  cwd: __dirname, encoding: 'utf8'
});
fs.unlinkSync(tmpPatch);
ok('content-lint rejects a broken patch', broken.status !== 0,
   broken.status === 0 ? 'expected non-zero exit' : 'good');

// 3. A valid patch is accepted.
const goodPatch = path.join(__dirname, 'tmp_good_patch.json');
fs.writeFileSync(goodPatch, JSON.stringify({
  target: { file: 'data/universal/skills.json' },
  format: 'cjs-skills',
  upserts: [{
    id: 'demo_smoke_test',
    name: 'Demo Smoke',
    power: 5, ap: 1, mp: 0,
    damageType: 'Physical',
    element: 'Physical',
    range: 1
  }]
}));
const good = spawnSync('node', ['tools/content-lint.mjs', '--quiet', '--patch', goodPatch], {
  cwd: __dirname, encoding: 'utf8'
});
fs.unlinkSync(goodPatch);
ok('content-lint accepts a valid patch', good.status === 0,
   good.status !== 0 ? (good.stdout + good.stderr).slice(-300) : 'good');

// 4. build-ai-index runs without error and produces expected files.
//    Write to a tmpdir so test runs don't dirty the committed indexes
//    under data/ai-index/ (each run would otherwise bump the
//    generatedAt timestamp and show up in `git status`).
const tmpOut = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cjs-ai-index-'));
try {
  const idx = spawnSync('node', ['tools/build-ai-index.mjs', '--out', tmpOut], {
    cwd: __dirname, encoding: 'utf8'
  });
  ok('build-ai-index runs', idx.status === 0,
     idx.status !== 0 ? (idx.stdout + idx.stderr).slice(-300) : 'good');

  const indexFiles = ['skills', 'passives', 'statuses', 'items', 'monsters', 'characters', 'worlds', 'encounters'];
  for (const name of indexFiles) {
    const p = path.join(tmpOut, `${name}.compact.json`);
    if (!fs.existsSync(p)) {
      ok(`ai-index/${name}.compact.json exists`, false);
      continue;
    }
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { parsed = null; }
    ok(`ai-index/${name}.compact.json is array`, Array.isArray(parsed), parsed === null ? 'parse failed' : '');
  }

  const manifest = path.join(tmpOut, 'index.json');
  ok('ai-index/index.json exists', fs.existsSync(manifest));
  if (fs.existsSync(manifest)) {
    const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    ok('manifest has generatedAt', typeof m.generatedAt === 'string');
    ok('manifest has files map', m.files && typeof m.files === 'object');
  }

  // Sanity check: the committed data/ai-index/ files must also exist
  // (someone may have generated them and committed; we don't regenerate
  // here because that would dirty the working tree). The committed
  // index is the one shipped with the build.
  const committed = path.join(__dirname, 'data/ai-index/index.json');
  ok('committed data/ai-index/index.json exists', fs.existsSync(committed));
} finally {
  fs.rmSync(tmpOut, { recursive: true, force: true });
}

console.log('');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
