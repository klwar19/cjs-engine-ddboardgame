// test_virtual_list.js — Phase I.3 list virtualization.
//
// Two layers, mirroring test_selector_store.js:
//   1. Real logic tests for the PURE windowing math
//      (src/campaign/util/virtual.ts). A wrong offset or window bound silently
//      drops a visible row or paints a blank gap, so we transpile the actual
//      TS in-memory (with the installed typescript package) and eval it — no
//      mocking the geometry the UI depends on.
//   2. Grep-based contract checks for VirtualList.tsx and the four tabs that
//      adopt it (session log, event ledger, quest list, save slots) — the
//      component runs in the browser (React + ResizeObserver), so we assert
//      its surface the same way the other React-layer smoke tests do.
//
// Run: node test_virtual_list.js

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

console.log('Campaign list-virtualizer tests (Phase I.3)');

// ── Layer 1: transpile + eval virtual.ts, test the real functions ──────────
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

const vPath = 'src/campaign/util/virtual.ts';
ok('virtual.ts exists', fs.existsSync(path.join(__dirname, vPath)));

const { buildOffsets, findIndexForOffset, computeWindow } = loadTsModule(vPath);
ok('buildOffsets is a function', typeof buildOffsets === 'function');
ok('findIndexForOffset is a function', typeof findIndexForOffset === 'function');
ok('computeWindow is a function', typeof computeWindow === 'function');

// buildOffsets ---------------------------------------------------------------
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
ok('offsets: empty list → [0]', eq(buildOffsets(0, () => 10, 0), [0]));
ok('offsets: 3 fixed rows, no gap', eq(buildOffsets(3, () => 10, 0), [0, 10, 20, 30]));
// gap applies BETWEEN rows only — 3 rows, 2 gaps: 30 height + 10 gap = 40.
ok('offsets: 3 fixed rows, gap 5', eq(buildOffsets(3, () => 10, 5), [0, 15, 30, 40]));
ok('offsets: variable heights', eq(buildOffsets(3, (i) => [10, 20, 30][i], 0), [0, 10, 30, 60]));
ok('offsets: single row has no trailing gap', eq(buildOffsets(1, () => 10, 99), [0, 10]));
ok('offsets: non-finite/negative height counts as 0',
   eq(buildOffsets(3, (i) => [10, NaN, -5][i], 0), [0, 10, 10, 10]));

// findIndexForOffset (offsets [0,10,30,60], 3 rows) --------------------------
const O = [0, 10, 30, 60];
ok('find: negative target → 0', findIndexForOffset(O, -5) === 0);
ok('find: target 0 → 0', findIndexForOffset(O, 0) === 0);
ok('find: inside row 0 → 0', findIndexForOffset(O, 5) === 0);
ok('find: at row-1 boundary → 1', findIndexForOffset(O, 10) === 1);
ok('find: inside row 1 → 1', findIndexForOffset(O, 15) === 1);
ok('find: at row-2 boundary → 2', findIndexForOffset(O, 30) === 2);
ok('find: inside row 2 → 2', findIndexForOffset(O, 59) === 2);
ok('find: at total clamps to last row', findIndexForOffset(O, 60) === 2);
ok('find: beyond total clamps to last row', findIndexForOffset(O, 1000) === 2);
ok('find: empty offsets [0] → 0', findIndexForOffset([0], 50) === 0);

// computeWindow --------------------------------------------------------------
// heights 10/20/30 → offsets [0,10,30,60], total 60.
let w = computeWindow(O, 0, 25, 0);
ok('window: top, vp25, no overscan → rows 0..1', w.start === 0 && w.end === 2 && w.total === 60);
w = computeWindow(O, 0, 25, 1);
ok('window: overscan 1 pulls in the next row', w.start === 0 && w.end === 3);
w = computeWindow(O, 35, 20, 0);
ok('window: scrolled to last row', w.start === 2 && w.end === 3);
w = computeWindow([0], 0, 100, 4);
ok('window: empty list → {0,0,0}', w.start === 0 && w.end === 0 && w.total === 0);
// Coverage property: the rendered window must span the whole viewport — the
// first rendered row starts at/above scrollTop, the last ends at/below the
// viewport bottom (the bug virtualization most often ships).
function coversViewport(offsets, scrollTop, vp, overscan) {
  const win = computeWindow(offsets, scrollTop, vp, overscan);
  const count = offsets.length - 1;
  if (count === 0) return true;
  const startTop = offsets[win.start];
  const endBottom = offsets[win.end]; // top of first non-rendered row = bottom of last rendered
  const wantBottom = Math.min(scrollTop + vp, offsets[count]);
  return startTop <= scrollTop && endBottom >= wantBottom;
}
let coverageHolds = true;
const big = buildOffsets(200, (i) => 20 + (i % 5) * 8, 6); // variable heights + gap
for (let s = 0; s <= big[200] - 100; s += 37) {
  if (!coversViewport(big, s, 100, 3)) { coverageHolds = false; break; }
}
ok('window: covers the viewport across a 200-row variable-height scroll', coverageHolds);

// ── Layer 2: VirtualList.tsx + adopting tabs (grep contract) ────────────────
const vlPath = path.join(__dirname, 'src/campaign/util/VirtualList.tsx');
ok('VirtualList.tsx exists', fs.existsSync(vlPath));
const vl = fs.readFileSync(vlPath, 'utf8');
ok('VirtualList exports a VirtualList component', /export function VirtualList</.test(vl));
ok('VirtualList imports the pure math', /import \{ buildOffsets, computeWindow \} from "\.\/virtual"/.test(vl));
ok('VirtualList passthrough below threshold (no scroll box / windowing)',
   /items\.length <= threshold/.test(vl));
ok('VirtualList measures rows via ResizeObserver (variable heights)',
   /new ResizeObserver/.test(vl) && /getBoundingClientRect\(\)\.height/.test(vl));
ok('VirtualList throttles scroll via requestAnimationFrame',
   /requestAnimationFrame/.test(vl));
ok('VirtualList keys measurements by item key (survives append/reorder)',
   /heights = useRef<Map<string \| number, number>>/.test(vl));

// The four lists named in the migration plan must route through VirtualList.
const ADOPTERS = [
  ['tabs/CampaignLogsTab.tsx', 'campaign-log-list', 'Session log entries'],
  ['tabs/CampaignEventLogTab.tsx', 'campaign-event-ledger-list', 'Event ledger entries'],
  ['tabs/CampaignQuestsPanelTab.tsx', 'campaign-quest-list', 'Active quests'],
  ['tabs/CampaignSettingsTab.tsx', 'campaign-save-slot-list', 'Saved campaigns']
];
for (const [rel, listClass, aria] of ADOPTERS) {
  const src = fs.readFileSync(path.join(__dirname, 'src/campaign', rel), 'utf8');
  const name = rel.split('/').pop();
  ok(`${name} imports VirtualList`, /import \{ VirtualList \} from "\.\.\/util\/VirtualList"/.test(src));
  ok(`${name} renders <VirtualList>`, /<VirtualList\b/.test(src));
  ok(`${name} keeps the original list class as the passthrough wrapper`,
     new RegExp(`listClassName="${listClass}"`).test(src));
  ok(`${name} labels the list for assistive tech`, src.includes(aria));
}
// Quest tab virtualizes BOTH the active and the (long) resolved list.
const questSrc = fs.readFileSync(path.join(__dirname, 'src/campaign/tabs/CampaignQuestsPanelTab.tsx'), 'utf8');
ok('Quests tab virtualizes both active and resolved lists',
   (questSrc.match(/<VirtualList\b/g) || []).length === 2);
// The memoized per-row component is preserved — virtualization picks WHICH
// rows mount; memoDeep still decides whether a mounted row re-renders.
ok('Quest rows stay memoized through the virtualizer',
   /renderItem=\{\(row\) => <QuestRow row=\{row\} \/>\}/.test(questSrc));

console.log('');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
