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

// Every wrapper that mutates state should route through CampaignOps or
// CampaignSave. That keeps undo/log/save behaviour identical to the
// vanilla path.
ok('quickSave routes through CampaignSave',
   /export function quickSave[\s\S]{0,200}save\(\)\.saveCurrent\(\)/.test(source));
ok('passPhase routes through CampaignOps.apply',
   /export function passPhase[\s\S]{0,200}ops\(\)\.apply\(\{\s*op:\s*"pass_phase"/.test(source));
ok('benchCharacter routes through CampaignOps.apply',
   /export function benchCharacter[\s\S]{0,200}ops\(\)\.apply\(\{\s*op:\s*"bench_character"/.test(source));

// Phase H.3 — every name in the CampaignActionName union must be handled
// by EITHER a `case '<name>':` in the vanilla `_handleAction` switch OR an
// entry in the TS action registry (src/campaign/action-handlers/registry.ts).
// Porting an action moves it from the switch to the registry, so the two
// sets must stay disjoint and together cover the whole union — otherwise a
// React onClick would compile yet no-op at runtime.
const namesSrc = fs.readFileSync(path.join(__dirname, 'src/campaign/actionNames.ts'), 'utf8');
const unionNames = (namesSrc.match(/^\s*\|\s*"([^"]+)"/gm) || [])
  .map((line) => line.replace(/^\s*\|\s*"/, '').replace(/"$/, ''));
ok('actionNames union is non-empty', unionNames.length > 100, unionNames.length + ' names');

const uiSrc = fs.readFileSync(path.join(__dirname, 'js/campaign/campaign-ui.js'), 'utf8');
const switchCases = new Set(
  (uiSrc.match(/case '([^']+)':/g) || []).map((c) => c.replace(/^case '/, '').replace(/':$/, ''))
);

// Registry keys live in the HANDLERS object literal of registry.ts.
const regSrc = fs.readFileSync(path.join(__dirname, 'src/campaign/action-handlers/registry.ts'), 'utf8');
const handlersBlock = (regSrc.match(/const HANDLERS[\s\S]*?\n};/) || [''])[0];
const registryKeys = new Set(
  (handlersBlock.match(/"([a-z0-9-]+)":/g) || []).map((k) => k.replace(/^"/, '').replace(/":$/, ''))
);
ok('action registry is non-empty', registryKeys.size > 0, registryKeys.size + ' handlers');

const uncovered = unionNames.filter((n) => !switchCases.has(n) && !registryKeys.has(n));
ok('every CampaignActionName is handled (switch or registry)',
   uncovered.length === 0,
   uncovered.length ? 'uncovered: ' + uncovered.join(', ') : '');

// A ported action's switch case is deleted — no dead duplicate.
const dup = [...registryKeys].filter((n) => switchCases.has(n));
ok('registry and switch are disjoint (ported cases removed from switch)',
   dup.length === 0,
   dup.length ? 'still in both: ' + dup.join(', ') : '');

// Every registry key is a real action name.
const bogus = [...registryKeys].filter((n) => !unionNames.includes(n));
ok('every registry key is a CampaignActionName',
   bogus.length === 0,
   bogus.length ? 'not in union: ' + bogus.join(', ') : '');

// The registry installs the runtime bridge the vanilla switch reads, and
// `_handleAction` consults it before falling through to the switch.
ok('registry installs CampaignActionsRuntime',
   /CampaignActionsRuntime\s*=\s*\{/.test(regSrc));
ok('_handleAction consults the action runtime first',
   /CampaignActionsRuntime[\s\S]{0,240}runtime\.run\(/.test(uiSrc));

// Phase H.3 complete — every CampaignActionName resolves through the
// TS registry on its own. The switch is defensively kept (as an
// always-skipped no-op + the port history in comments), but it should
// not be needed to cover the union.
const registryUncovered = unionNames.filter((n) => !registryKeys.has(n));
ok('registry alone covers every CampaignActionName (Phase H.3 done)',
   registryUncovered.length === 0,
   registryUncovered.length ? 'registry-uncovered: ' + registryUncovered.join(', ') : '246/246');

console.log('');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
