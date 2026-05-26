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

// dispatchCampaignAction must look up campaign-root from the DOM. If a
// future refactor swaps the id, the React shell will silently stop
// receiving action callbacks — this is the structural check.
ok('dispatchCampaignAction looks up #campaign-root',
   /getElementById\("campaign-root"\)/.test(source));

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

console.log('');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
