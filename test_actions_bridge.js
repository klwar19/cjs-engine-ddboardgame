// test_actions_bridge.js — Smoke test for src/campaign/actions.ts shape.
//
// The action wrappers run in the browser, but we can still verify the
// surface (every exported symbol present, every wrapper is a function)
// using a tiny TypeScript compile of the import-and-call pattern. Skip
// network and DOM here — those are exercised in-app.
//
// Run: node test_actions_bridge.js

const fs = require('node:fs');
const path = require('node:path');
// Tier 3: engine modules move js/<area>/<mod>.js -> src/engine/<area>/<mod>.ts
// one at a time. Resolve source-text reads through the shared resolver so a
// port is transparent to these regex checks.
const { resolveEngine } = require('./tools/test/engine-source.cjs');

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

console.log('Campaign actions bridge smoke tests');

const file = path.join(__dirname, 'src/campaign/actions.ts');
ok('src/campaign/actions.ts exists', fs.existsSync(file));

const source = fs.readFileSync(file, 'utf8');

// Each typed wrapper we expect to land. Listed explicitly so this test
// fails loudly if a contributor removes one — the React tabs that
// import them won't build.
const REQUIRED_EXPORTS = [
  'quickSave',
  'newSave',
  'forkSave',
  'exportSave',
  'importSavePicker',
  'pushToGitHub',
  'loadSlot',
  'deleteSlot',
  'deleteAllSaves',
  'exportSlot',
  'clearLog',
  'exportLog',
  'exportEventLog',
  'clearEventLog',
  'benchCharacter',
  'activateCharacter',
  'passPhase',
  'dispatchCampaignAction'
];

for (const name of REQUIRED_EXPORTS) {
  // Look for an exported declaration or named re-export.
  const re = new RegExp('export\\s+(?:async\\s+)?function\\s+' + name + '\\b');
  ok('exports ' + name, re.test(source));
}

// dispatchCampaignAction must route through the typed
// `CampaignUI.handleAction` boundary (Phase H.1). If a future refactor
// drops this call, the React shell silently stops dispatching actions
// — this is the structural check.
ok('dispatchCampaignAction routes through CampaignUI.handleAction',
   /ui\.handleAction\(campaignAction, data\)/.test(source));

// Settings + Logs tabs must use the typed actions, NOT inline
// `data-campaign-action` attributes. If a contributor reverts a migrated
// button back to the vanilla style, the tab still works (the legacy
// dispatcher catches the click) but the migration history is lost.
const SETTINGS = fs.readFileSync(path.join(__dirname, 'src/campaign/tabs/CampaignSettingsTab.tsx'), 'utf8');
const LOGS = fs.readFileSync(path.join(__dirname, 'src/campaign/tabs/CampaignLogsTab.tsx'), 'utf8');

// Both files MUST import the typed actions module.
ok('CampaignSettingsTab imports CampaignActions', /from "\.\.\/actions"/.test(SETTINGS));
ok('CampaignLogsTab imports CampaignActions', /from "\.\.\/actions"/.test(LOGS));

// No inline `data-campaign-action="..."` JSX attribute in either file
// (comments are stripped before this test runs).
function stripComments(s) {
  // Remove // line comments and /* */ block comments.
  return s.replace(/\/\/[^\n]*\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
}
ok('CampaignSettingsTab.tsx has no inline data-campaign-action',
   !/data-campaign-action=/.test(stripComments(SETTINGS)));
ok('CampaignLogsTab.tsx has no inline data-campaign-action',
   !/data-campaign-action=/.test(stripComments(LOGS)));

// cui-controls.ts held the last two `data-campaign-action` emitters in the
// whole `src` tree (`actionBtn` / `renderTownActionButton`); both were dead
// (zero callers) and were removed, so no React-rendered surface emits the
// stringly-typed attribute any more — typed onClick is the only path.
ok('cui-controls.ts emits no data-campaign-action (last src emitter removed)',
   !/data-campaign-action=/.test(stripComments(
     fs.readFileSync(path.join(__dirname, 'src/campaign/util/cui-controls.ts'), 'utf8'))));

// These source files (campaign-map binds its own private click listener; the
// farm/pocket-haven modules are now JSX-rendered + op-only) must never
// reintroduce the generic `data-campaign-action` attribute — typed onClick is
// the only dispatch path.
// boot.ts is a src/ file; the three campaign modules are engine-resolved
// (js/ today, src/engine/ once ported) so the check follows the Tier 3 port.
const MIGRATED_ISLANDS = [
  path.join(__dirname, 'src/campaign/shell/boot.ts'),
  resolveEngine('campaign/campaign-map').path,
  resolveEngine('campaign/farming-mode').path,
  resolveEngine('campaign/pocket-haven').path
];
for (const abs of MIGRATED_ISLANDS) {
  const rel = path.relative(__dirname, abs);
  const src = fs.readFileSync(abs, 'utf8');
  ok(rel + ' has no generic data-campaign-action attributes',
     !/data-campaign-action=/.test(stripComments(src)));
}

// The two HTML-island forwarders are fully retired: the `<main>` action
// forwarder (removed earlier) and now the typed-marker bridge
// `htmlIslandActions.ts` + the `CampaignExternalTabs` safeWrap. Every former
// island tab is real JSX with typed onClick → CampaignUI.handleAction.
ok('htmlIslandActions.ts forwarder is fully retired',
   !fs.existsSync(path.join(__dirname, 'src/campaign/htmlIslandActions.ts')));
ok('CampaignExternalTabs safeWrap is fully retired',
   !fs.existsSync(path.join(__dirname, 'src/campaign/tabs/CampaignExternalTabs.tsx')));

// Every wrapper that mutates state should route through CampaignOps or
// CampaignSave. That keeps undo/log/save behaviour identical to the
// vanilla path.
ok('quickSave routes through CampaignSave',
   /export function quickSave[\s\S]{0,200}save\(\)\.saveCurrent\(\)/.test(source));
ok('passPhase routes through CampaignOps.apply',
   /export function passPhase[\s\S]{0,200}ops\(\)\.apply\(\{\s*op:\s*"pass_phase"/.test(source));
ok('benchCharacter routes through CampaignOps.apply',
   /export function benchCharacter[\s\S]{0,200}ops\(\)\.apply\(\{\s*op:\s*"bench_character"/.test(source));

// Phase H.3/H.4 — every name in the CampaignActionName union must be
// handled by an entry in the TS action registry
// (src/campaign/action-handlers/registry.ts). The vanilla `_handleAction`
// switch is gone (campaign-ui.js deleted), so the registry is the sole
// dispatch path — it must cover the whole union or a React onClick would
// compile yet no-op at runtime.
const namesSrc = fs.readFileSync(path.join(__dirname, 'src/campaign/actionNames.ts'), 'utf8');
const unionNames = (namesSrc.match(/^\s*\|\s*"([^"]+)"/gm) || [])
  .map((line) => line.replace(/^\s*\|\s*"/, '').replace(/"$/, ''));
ok('actionNames union is non-empty', unionNames.length > 100, unionNames.length + ' names');

// Phase H.4 — campaign-ui.js (and its now-empty `_handleAction` switch) is
// deleted. Dispatch is 100% the TS registry, reached through boot.ts's
// handleAction → window.CJS.CampaignActionsRuntime.
ok('legacy campaign-ui.js _handleAction switch is gone',
   !fs.existsSync(path.join(__dirname, 'js/campaign/campaign-ui.js')));

// Registry keys live in the HANDLERS object literal of registry.ts.
const regSrc = fs.readFileSync(path.join(__dirname, 'src/campaign/action-handlers/registry.ts'), 'utf8');
const handlersBlock = (regSrc.match(/const HANDLERS[\s\S]*?\n};/) || [''])[0];
const registryKeys = new Set(
  (handlersBlock.match(/"([a-z0-9-]+)":/g) || []).map((k) => k.replace(/^"/, '').replace(/":$/, ''))
);
ok('action registry is non-empty', registryKeys.size > 0, registryKeys.size + ' handlers');

// The registry is the only dispatch path now, so it alone must cover the
// whole union — otherwise a React onClick would compile yet no-op.
const uncovered = unionNames.filter((n) => !registryKeys.has(n));
ok('registry covers every CampaignActionName',
   uncovered.length === 0,
   uncovered.length ? 'uncovered: ' + uncovered.join(', ') : unionNames.length + '/' + unionNames.length);

// Every registry key is a real action name.
const bogus = [...registryKeys].filter((n) => !unionNames.includes(n));
ok('every registry key is a CampaignActionName',
   bogus.length === 0,
   bogus.length ? 'not in union: ' + bogus.join(', ') : '');

// The registry installs the runtime; boot.ts's handleAction routes through
// it (the single dispatch seam for React onClick + the shell forwarders).
ok('registry installs CampaignActionsRuntime',
   /CampaignActionsRuntime\s*=\s*\{/.test(regSrc));
const bootSrc = fs.readFileSync(path.join(__dirname, 'src/campaign/shell/boot.ts'), 'utf8');
ok('boot.ts handleAction routes through the action runtime',
   /function handleAction[\s\S]{0,260}CampaignActionsRuntime[\s\S]{0,160}runtime\.run\(/.test(bootSrc));

console.log('');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
