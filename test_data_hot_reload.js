// test_data_hot_reload.js — Tests ContentManager.reloadFileDoc, the in-place
// single-file re-ingest that backs dev content hot-reload (Phase J.5).
//
// We exercise the pure ingestion core (no fetch / no browser): upsert present
// entries, remove entries the file previously owned that are now gone (tracked
// via _origin), leave other files' entries untouched, and emit DataStore
// change events (which drive the UI re-render in the real app).
//
// Run: node test_data_hot_reload.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {
  window: { CJS: {} },
  document: { addEventListener: () => {}, removeEventListener: () => {}, readyState: 'complete' },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  Math, Object, Array, String, Number, Boolean, JSON, Map, Set,
  Date, RegExp, Error, Promise, Symbol, Proxy, Reflect,
  parseInt, parseFloat, isNaN, isFinite, undefined, Infinity, NaN
};
vm.createContext(sandbox);

for (const file of ['core/constants.js', 'core/formulas.js', 'core/dice.js',
  'core/undo-manager.js', 'core/state-tools.js', 'core/data-store.js', 'core/content-manager.js']) {
  try {
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', file), 'utf8'), sandbox);
  } catch (e) {
    console.error(`LOAD ERROR: ${file}:`, e.message);
    process.exit(1);
  }
}

const CJS = sandbox.window.CJS;
const CM = CJS.ContentManager;
const DS = CJS.DataStore;

let pass = 0, fail = 0;
function ok(label, cond, info) {
  if (cond) { pass += 1; console.log('  OK  ' + label + (info ? ' (' + info + ')' : '')); }
  else { fail += 1; console.log('  XX  ' + label + (info ? ' (' + info + ')' : '')); }
}

console.log('Data hot-reload (reloadFileDoc) tests');

ok('ContentManager exposes reloadFile + reloadFileDoc',
   typeof CM.reloadFile === 'function' && typeof CM.reloadFileDoc === 'function');

const REL = 'data/worlds/haven/_hot_test_skills.json';
const header = { version: 1, format: 'cjs-collection', scope: 'world', world: 'haven', category: 'skills' };
const skill = (id, power) => ({ id, name: id, power, ap: 1, mp: 0 });

// An unrelated entry from a different origin must survive our file's reloads.
DS.replace('skills', 'haven_unrelated', { id: 'haven_unrelated', name: 'U', power: 1, ap: 1, mp: 0, _origin: 'other.json' });

// 1. First ingest: two new skills.
let changes = 0;
const unsub = DS.subscribe(() => { changes += 1; });
const r1 = CM.reloadFileDoc(REL, { _file: header, entries: [skill('haven_hot_a', 10), skill('haven_hot_b', 5)] });
ok('first reload succeeds', r1.success === true, JSON.stringify(r1));
ok('first reload upserts 2', r1.upserted === 2 && r1.removed === 0);
ok('entry A ingested with value', DS.get('skills', 'haven_hot_a')?.power === 10);
ok('entry A stamped with _origin', DS.get('skills', 'haven_hot_a')?._origin === REL);
ok('DataStore emitted change events', changes > 0, `${changes} events`);

// 2. Re-ingest: A changed, B unchanged, C added.
const r2 = CM.reloadFileDoc(REL, { _file: header, entries: [skill('haven_hot_a', 20), skill('haven_hot_b', 5), skill('haven_hot_c', 7)] });
ok('second reload succeeds', r2.success === true);
ok('entry A updated in place', DS.get('skills', 'haven_hot_a')?.power === 20);
ok('entry C added', DS.get('skills', 'haven_hot_c')?.power === 7);
ok('still exactly the 3 file entries present',
   ['haven_hot_a', 'haven_hot_b', 'haven_hot_c'].every((id) => DS.exists('skills', id)));

// 3. Re-ingest with A + C removed from the file -> they leave the store.
const r3 = CM.reloadFileDoc(REL, { _file: header, entries: [skill('haven_hot_b', 9)] });
ok('third reload reports 2 removed', r3.success === true && r3.removed === 2, JSON.stringify(r3));
ok('removed entry A is gone', !DS.exists('skills', 'haven_hot_a'));
ok('removed entry C is gone', !DS.exists('skills', 'haven_hot_c'));
ok('surviving entry B updated', DS.get('skills', 'haven_hot_b')?.power === 9);

// 4. A different file's entry is never touched by our reloads.
ok('unrelated-origin entry survives', DS.get('skills', 'haven_unrelated')?.power === 1);
unsub();

// 5. Failure modes.
ok('no _file.category -> failure', CM.reloadFileDoc('data/worlds/haven/_x.json', { entries: [] }).success === false);
const agg = CM.reloadFileDoc('data/system/quips.json', { _file: { category: 'quips', scope: 'system' }, entries: [] });
ok('aggregate category signals full-reload fallback', agg.success === false && agg.reason === 'aggregate-category');

// 6. World-scoped id prefix is still enforced (a real authoring guardrail).
const bad = CM.reloadFileDoc(REL, { _file: header, entries: [{ id: 'unprefixed', name: 'X', power: 1, ap: 1, mp: 0 }] });
ok('unprefixed world id is rejected', bad.success === false && bad.reason === 'ingest-error', JSON.stringify(bad));

console.log('');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
