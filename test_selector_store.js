// test_selector_store.js — Phase I.2 foundation.
//
// Two layers:
//   1. Real logic tests for the pure value-equality helpers
//      (src/campaign/util/equality.ts). These back `useCampaignSelector`
//      and `memoDeep`; a wrong comparator silently breaks memoization
//      (false "equal" → stale UI; false "changed" → no perf win), so we
//      exercise the actual transpiled functions, not just their presence.
//      We transpile the TS in-memory with the already-installed typescript
//      package (no extra tooling) and eval the CommonJS output.
//   2. Grep-based contract checks for src/campaign/store.ts and
//      CampaignShell.tsx — the store wiring runs in the browser (React +
//      DOM), so we assert its surface the same way the other React-layer
//      smoke tests do.
//
// Run: node test_selector_store.js

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

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

console.log('Campaign selector-store + equality tests');

// ── Layer 1: transpile + eval equality.ts, test the real functions ────────
function loadTsModule(relPath) {
  const abs = path.join(__dirname, relPath);
  const src = fs.readFileSync(abs, 'utf8');
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    },
    fileName: abs
  });
  const mod = { exports: {} };
  const fn = new Function('module', 'exports', out.outputText);
  fn(mod, mod.exports);
  return mod.exports;
}

const eqPath = 'src/campaign/util/equality.ts';
ok('equality.ts exists', fs.existsSync(path.join(__dirname, eqPath)));

const { shallowEqual, deepEqual } = loadTsModule(eqPath);
ok('shallowEqual is a function', typeof shallowEqual === 'function');
ok('deepEqual is a function', typeof deepEqual === 'function');

// shallowEqual --------------------------------------------------------------
ok('shallow: identical primitives equal', shallowEqual(1, 1) === true);
ok('shallow: different primitives unequal', shallowEqual(1, 2) === false);
ok('shallow: NaN equals NaN', shallowEqual(NaN, NaN) === true);
ok('shallow: same ref equal', (() => { const o = { a: 1 }; return shallowEqual(o, o); })() === true);
ok('shallow: equal flat objects', shallowEqual({ a: 1, b: 'x' }, { a: 1, b: 'x' }) === true);
ok('shallow: differing value unequal', shallowEqual({ a: 1 }, { a: 2 }) === false);
ok('shallow: extra key unequal', shallowEqual({ a: 1 }, { a: 1, b: 2 }) === false);
ok('shallow: missing key unequal', shallowEqual({ a: 1, b: 2 }, { a: 1, c: 2 }) === false);
ok('shallow: nested ref-equal slices equal',
   (() => { const n = { x: 1 }; return shallowEqual({ n }, { n }); })() === true);
ok('shallow: nested fresh objects NOT equal (one level)',
   shallowEqual({ n: { x: 1 } }, { n: { x: 1 } }) === false);
ok('shallow: null vs object unequal', shallowEqual(null, { a: 1 }) === false);
ok('shallow: null equals null', shallowEqual(null, null) === true);

// deepEqual -----------------------------------------------------------------
ok('deep: identical primitives equal', deepEqual('a', 'a') === true);
ok('deep: NaN equals NaN', deepEqual(NaN, NaN) === true);
ok('deep: +0 / -0 distinct (Object.is)', deepEqual(0, -0) === false);
ok('deep: equal nested objects (fresh clones)',
   deepEqual({ a: { b: [1, 2, { c: 3 }] } }, { a: { b: [1, 2, { c: 3 }] } }) === true);
ok('deep: detects a deep change',
   deepEqual({ a: { b: [1, 2, { c: 3 }] } }, { a: { b: [1, 2, { c: 4 }] } }) === false);
ok('deep: equal arrays', deepEqual([1, 'x', { y: 2 }], [1, 'x', { y: 2 }]) === true);
ok('deep: array length mismatch unequal', deepEqual([1, 2], [1, 2, 3]) === false);
ok('deep: array vs object unequal', deepEqual([1, 2], { 0: 1, 1: 2 }) === false);
ok('deep: key-count mismatch unequal', deepEqual({ a: 1 }, { a: 1, b: 2 }) === false);
ok('deep: same keys, different key names unequal', deepEqual({ a: 1 }, { b: 1 }) === false);
ok('deep: null vs object unequal', deepEqual(null, {}) === false);
ok('deep: empty objects equal', deepEqual({}, {}) === true);
ok('deep: empty arrays equal', deepEqual([], []) === true);
// The headline use case: a chrome slice re-cloned but value-identical must
// compare equal (so memoDeep / useCampaignSelector skip the re-render), while
// a real change must compare unequal (so the UI updates).
const chromeA = { header: { campaignName: 'Vael', currencies: { gold: 10, jp: 2 }, worldEvents: [] } };
const chromeClone = JSON.parse(JSON.stringify(chromeA));
const chromeChanged = { header: { campaignName: 'Vael', currencies: { gold: 11, jp: 2 }, worldEvents: [] } };
ok('deep: re-cloned chrome slice compares equal', deepEqual(chromeA, chromeClone) === true);
ok('deep: chrome slice with changed gold compares unequal', deepEqual(chromeA, chromeChanged) === false);

// ── Layer 2: store.ts + CampaignShell.tsx contract (grep) ──────────────────
const storePath = path.join(__dirname, 'src/campaign/store.ts');
ok('src/campaign/store.ts exists', fs.existsSync(storePath));
const storeSrc = fs.readFileSync(storePath, 'utf8');

ok('store uses useSyncExternalStore', /useSyncExternalStore/.test(storeSrc));
ok('store exports the singleton campaignStore',
   /export const campaignStore = new CampaignStore\(\)/.test(storeSrc));
ok('store still exports useCampaignState', /export function useCampaignState\(/.test(storeSrc));
ok('store still exports useCampaignReady', /export function useCampaignReady\(/.test(storeSrc));
ok('store exports useCampaignSelector with an equality arg',
   /export function useCampaignSelector<T>\([\s\S]{0,200}isEqual/.test(storeSrc));
ok('store imports shallowEqual default comparator',
   /import \{ shallowEqual \} from "\.\/util\/equality"/.test(storeSrc));
ok('store listens to campaign:state-tick in the CAPTURE phase',
   /addEventListener\("campaign:state-tick",[^)]*,\s*true\)/.test(storeSrc));
ok('store listens to campaign:rendered fallback',
   /addEventListener\("campaign:rendered"/.test(storeSrc));
ok('store also subscribes to CampaignState directly',
   /\.subscribe\(\(\) => this\.scheduleCommit\(\)\)/.test(storeSrc));
ok('store coalesces signals via queueMicrotask (matches combat store)',
   /queueMicrotask\(/.test(storeSrc));
ok('useCampaignState contract still returns { state, tick }',
   /readonly state: CampaignStateSnapshot \| null;[\s\S]{0,160}readonly tick: number;/.test(storeSrc));

const shellPath = path.join(__dirname, 'src/campaign/CampaignShell.tsx');
const shellSrc = fs.readFileSync(shellPath, 'utf8');
ok('CampaignShell still consumes useCampaignState', /useCampaignState\(\)/.test(shellSrc));
ok('CampaignShell no longer keeps its own renderTick state',
   !/renderTick/.test(shellSrc));
ok('CampaignShell no longer double-binds a state-tick listener',
   !/addEventListener\("campaign:state-tick"/.test(shellSrc));
ok('CampaignShell reads chrome via useCampaignSelector (value-stable across body commits)',
   /useCampaignSelector\(selectChrome, deepEqual\)/.test(shellSrc));

// ── Layer 3: memo boundaries (I.1) ─────────────────────────────────────────
const memoPath = path.join(__dirname, 'src/campaign/util/memo.ts');
ok('util/memo.ts exists', fs.existsSync(memoPath));
const memoSrc = fs.readFileSync(memoPath, 'utf8');
ok('memoDeep wraps React.memo with the deepEqual comparator',
   /memo\(Component,\s*\(prev,\s*next\)\s*=>\s*deepEqual\(prev,\s*next\)\)/.test(memoSrc));
ok('memoDeep imports deepEqual', /import \{ deepEqual \} from "\.\/equality"/.test(memoSrc));

// Always-mounted chrome strips: each must be a memoDeep export so a body-only
// change skips them. A regression here (dropping the wrap) silently
// reintroduces a full chrome re-render on every state tick.
const strips = [
  ['Header', 'CampaignHeader'],
  ['ModeBar', 'CampaignModeBar'],
  ['SubTabs', 'CampaignSubTabs'],
  ['RecentLog', 'CampaignRecentLog'],
  ['CommandRail', 'CampaignCommandRail']
];
for (const [file, name] of strips) {
  const src = fs.readFileSync(path.join(__dirname, `src/campaign/shell/${file}.tsx`), 'utf8');
  ok(`${name} is exported as memoDeep`,
     new RegExp(`export const ${name} = memoDeep\\(${name}View\\)`).test(src));
  ok(`${file}.tsx imports memoDeep`, /import \{ memoDeep \} from "\.\.\/util\/memo"/.test(src));
}

// List-item / panel components rendered many times: memoized so one item's
// change doesn't re-render its siblings.
const listItems = [
  ['tabs/QuestRow.tsx', 'QuestRow'],
  ['tabs/WorldGateCard.tsx', 'WorldGateCard'],
  ['tabs/SequenceNode.tsx', 'SequenceNodePanel'],
  ['tabs/SequenceCard.tsx', 'SequenceShelfPanel']
];
for (const [rel, name] of listItems) {
  const src = fs.readFileSync(path.join(__dirname, `src/campaign/${rel}`), 'utf8');
  ok(`${name} is exported as memoDeep`,
     new RegExp(`export const ${name} = memoDeep\\(${name}View\\)`).test(src));
}

// ── Layer 4: self-subscribing shared panels (I.2b) ─────────────────────────
// The ResultPanels family self-subscribes to its slice via useCampaignSelector
// + memo, so a parent tab re-render no longer re-renders an unchanged panel.
const rp = fs.readFileSync(path.join(__dirname, 'src/campaign/tabs/ResultPanels.tsx'), 'utf8');
ok('ResultPanels imports useCampaignSelector', /import \{ useCampaignSelector,/.test(rp));
ok('ResultPanels imports deepEqual + memo',
   /import \{ deepEqual \}/.test(rp) && /import \{ memo \} from "react"/.test(rp));
const SELF_SUB_PANELS = [
  'EventResultPanel', 'OraclePanel', 'SoloNoticePanel', 'TravelSurprisePanel',
  'CombatResultPanel', 'LastCombatResultPanel', 'LastReportPanel',
  'PendingBattlePanel', 'ScenarioSummaryPanel'
];
for (const name of SELF_SUB_PANELS) {
  ok(`${name} is a memo() self-subscribing panel`,
     new RegExp(`export const ${name} = memo\\(function ${name}`).test(rp));
  ok(`${name} no longer takes a state prop (it self-subscribes)`,
     !new RegExp(`function ${name}\\(\\{ state`).test(rp));
}
// useCampaignSelector must be the data source for the converted panels.
ok('converted panels read data via useCampaignSelector',
   (rp.match(/useCampaignSelector\(sel/g) || []).length >= SELF_SUB_PANELS.length);
// ActiveSequencePanel intentionally stays prop-driven (selector depends on scopes).
ok('ActiveSequencePanel stays prop-driven (state + scopes)',
   /export function ActiveSequencePanel\(\{\s*state,\s*scopes/.test(rp));
// No consumer tab passes state= to a converted panel anymore.
const CONSUMER_TABS = [
  'CampaignEventLogTab', 'CampaignEventTab', 'CampaignQuestHomeTab', 'CampaignHubTabs',
  'CampaignMapsTab', 'CampaignQuestsPanelTab', 'CampaignOverviewTab', 'CampaignStoryHomeTab'
];
let strayStateProp = 0;
for (const tab of CONSUMER_TABS) {
  const src = fs.readFileSync(path.join(__dirname, `src/campaign/tabs/${tab}.tsx`), 'utf8');
  for (const name of SELF_SUB_PANELS) {
    if (new RegExp(`<${name} state=`).test(src)) strayStateProp += 1;
  }
}
ok('no consumer passes state= to a self-subscribing panel', strayStateProp === 0);

console.log('');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
