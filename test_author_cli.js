// test_author_cli.js — Tests for the content authoring CLI
// (tools/author/index.mjs).
//
// Runs the CLI as a subprocess (the same contract a human or an AI
// generator uses). Write tests target a tmp path with --no-manifest so the
// shipping data tree and data/_manifest.json are never mutated; dry-run
// tests assert nothing is written.
//
// Run: node test_author_cli.js

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

let pass = 0;
let fail = 0;
function ok(label, cond, info) {
  if (cond) { pass += 1; console.log('  OK  ' + label + (info ? ' (' + info + ')' : '')); }
  else { fail += 1; console.log('  XX  ' + label + (info ? ' (' + info + ')' : '')); }
}

const CLI = ['tools/author/index.mjs'];
function author(args, input) {
  return spawnSync('node', [...CLI, ...args], {
    cwd: __dirname, encoding: 'utf8', input: input == null ? undefined : input
  });
}

const ALL_TYPES = [
  'skills', 'passives', 'items', 'materials', 'food', 'characters', 'monsters',
  'encounters', 'statuses', 'campaignQuests', 'campaignEvents', 'oracleTables',
  'travelMaps', 'worldActivityPacks', 'storyDirectorPacks'
];

console.log('Author CLI tests');

// 1. --list enumerates every registered type.
const list = author(['--list']);
ok('--list runs', list.status === 0);
for (const t of ALL_TYPES) {
  ok(`--list mentions ${t}`, list.stdout.includes(t));
}

// 2. scaffold -> validate round-trips for every type (scaffolds are valid).
for (const t of ALL_TYPES) {
  const scaf = author([t, 'scaffold', '--world', 'haven']);
  const valid = scaf.status === 0 && (() => {
    const v = author([t, 'validate', '--world', 'haven'], scaf.stdout);
    return v.status === 0;
  })();
  ok(`scaffold|validate round-trips for ${t}`, valid,
     scaf.status !== 0 ? 'scaffold failed' : '');
}

// 3. validate rejects a broken entry with a non-zero exit + clear errors.
const broken = author(['skills', 'validate'], JSON.stringify({ id: 'BadId', name: 'x' }));
ok('validate rejects a broken skill', broken.status === 1
   && /missing required field "power"/.test(broken.stderr)
   && /pattern/.test(broken.stderr));

// 4. add --dry-run writes nothing and never touches the manifest.
const manifestPath = path.join(__dirname, 'data/_manifest.json');
const manifestBefore = fs.readFileSync(manifestPath, 'utf8');
const dryTarget = path.join(__dirname, 'data/campaigns/haven/quests/_dryrun_should_not_exist.json');
const scafQ = author(['campaignQuests', 'scaffold', '--world', 'haven']);
const dry = author(['campaignQuests', 'add', '--world', 'haven', '--file', '_dryrun_should_not_exist', '--dry-run'], scafQ.stdout);
ok('add --dry-run exits 0', dry.status === 0, dry.status !== 0 ? dry.stderr.slice(-160) : '');
ok('add --dry-run says "would write"', /would write/.test(dry.stdout));
ok('add --dry-run says "would register in manifest"', /would register in manifest/.test(dry.stdout));
ok('add --dry-run created no file', !fs.existsSync(dryTarget));
ok('add --dry-run left the manifest untouched', fs.readFileSync(manifestPath, 'utf8') === manifestBefore);

// 5. add writes to a tmp target and upserts idempotently (--no-manifest).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cjs-author-'));
try {
  const target = path.join(tmp, 'skills.json');
  const scafS = author(['skills', 'scaffold']);
  const add1 = author(['skills', 'add', '--target', target, '--no-manifest'], scafS.stdout);
  ok('add writes a new file', add1.status === 0 && fs.existsSync(target) && /1 added/.test(add1.stdout),
     add1.status !== 0 ? add1.stderr.slice(-160) : '');
  ok('add skips manifest with --no-manifest', /manifest skipped/.test(add1.stdout));
  const add2 = author(['skills', 'add', '--target', target, '--no-manifest'], scafS.stdout);
  ok('re-adding the same id updates, not duplicates', /0 added, 1 updated/.test(add2.stdout));
  const doc = JSON.parse(fs.readFileSync(target, 'utf8'));
  ok('idempotent: still one entry after two adds', Array.isArray(doc.entries) && doc.entries.length === 1);
  ok('created file carries a valid _file envelope',
     doc._file && doc._file.format === 'cjs-collection' && doc._file.category === 'skills');

  // 6. array input adds multiple entries at once.
  const arrTarget = path.join(tmp, 'multi.json');
  const arr = JSON.stringify([
    { id: 'a_one', name: 'A One', power: 1, ap: 1, mp: 0 },
    { id: 'a_two', name: 'A Two', power: 2, ap: 1, mp: 0 }
  ]);
  const addArr = author(['skills', 'add', '--target', arrTarget, '--no-manifest'], arr);
  const arrDoc = fs.existsSync(arrTarget) ? JSON.parse(fs.readFileSync(arrTarget, 'utf8')) : { entries: [] };
  ok('array input adds multiple entries', addArr.status === 0 && arrDoc.entries.length === 2);

  // 7. add refuses to write into a file of a different category.
  const wrongCat = path.join(tmp, 'wrong.json');
  fs.writeFileSync(wrongCat, JSON.stringify({ _file: { version: 1, format: 'cjs-collection', scope: 'world', category: 'campaignEvents' }, entries: [] }));
  const mismatch = author(['campaignQuests', 'add', '--target', wrongCat, '--no-manifest'],
    JSON.stringify({ id: 'x_set', name: 'X', templates: [{ id: 'x_q', title: 'X' }] }));
  ok('add rejects a category-mismatched target', mismatch.status !== 0 && /category/.test(mismatch.stderr));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
