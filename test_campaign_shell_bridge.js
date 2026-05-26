// test_campaign_shell_bridge.js — Smoke test for the React-shell bridge
// surface exposed by campaign-ui.js.
//
// The bridge is the contract between the React shell
// (`src/campaign/CampaignShell.tsx`) and the legacy vanilla campaign UI.
// If a contributor removes a getter or setter, the React shell silently
// falls back to a blank page — these checks catch that regression at
// the file level.
//
// We don't fully boot the campaign-ui IIFE here (it depends on many
// world data modules). We just grep the source for the API surface
// names — narrow but stable across refactors.
//
// Run: node test_campaign_shell_bridge.js

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

console.log('Campaign Shell bridge surface tests');

const uiPath = path.join(__dirname, 'js/campaign/campaign-ui.js');
const shellPath = path.join(__dirname, 'src/campaign/CampaignShell.tsx');
const pagePath = path.join(__dirname, 'src/campaign/CampaignPage.tsx');
ok('campaign-ui.js exists', fs.existsSync(uiPath));
ok('CampaignShell.tsx exists', fs.existsSync(shellPath));
ok('CampaignPage.tsx exists', fs.existsSync(pagePath));

const ui = fs.readFileSync(uiPath, 'utf8');
const shell = fs.readFileSync(shellPath, 'utf8');
const page = fs.readFileSync(pagePath, 'utf8');

// Bridge functions: every name listed here is read by the React shell
// (directly or through the `src/campaign/shell/bridge.ts` wrapper).
// Removing one without updating the shell will break the chrome.
const BRIDGE_FUNCS = [
  'enableReactShell',
  'getChromeData',
  'getMainBody',
  'getPanelDefs',
  'getPanelOrder',
  'renderDrawerBody',
  'setActiveMode',
  'setActiveTab',
  'setActivePanel',
  'getActiveTab',
  'getActiveMode',
  'getActivePanel'
];
for (const name of BRIDGE_FUNCS) {
  // Either a `function name(` definition or a `name:` entry in the
  // returned object literal counts.
  const reFn = new RegExp('function\\s+' + name + '\\b');
  const reKey = new RegExp('\\b' + name + '\\s*:');
  ok('bridge exposes ' + name, reFn.test(ui) || reKey.test(ui));
}

// The React shell must read these functions for the chrome to be wired
// up correctly. `getChromeData` lives behind `src/campaign/shell/bridge.ts`
// so we check that the wrapper imports it as well.
const SHELL_USES = ['enableReactShell', 'getMainBody', 'getPanelDefs',
  'renderDrawerBody', 'setActivePanel'];
for (const name of SHELL_USES) {
  ok('CampaignShell.tsx uses ' + name, shell.indexOf(name) >= 0);
}

const bridgeShellPath = path.join(__dirname, 'src/campaign/shell/bridge.ts');
ok('src/campaign/shell/bridge.ts exists', fs.existsSync(bridgeShellPath));
const bridgeShell = fs.readFileSync(bridgeShellPath, 'utf8');
ok('shell/bridge.ts uses getChromeData', bridgeShell.indexOf('getChromeData') >= 0);
ok('shell/bridge.ts uses setActiveMode', bridgeShell.indexOf('setActiveMode') >= 0);
ok('shell/bridge.ts uses setActiveTab', bridgeShell.indexOf('setActiveTab') >= 0);
ok('shell/bridge.ts uses setActivePanel', bridgeShell.indexOf('setActivePanel') >= 0);

// CampaignShell.tsx renders the new JSX chrome components instead of
// dangerouslySetInnerHTML fragments. Asserting the imports is enough:
// the JSX directly references them so any drift breaks build/typecheck.
const CHROME_COMPONENTS = ['CampaignHeader', 'CampaignModeBar',
  'CampaignSubTabs', 'CampaignRecentLog', 'CampaignCommandRail'];
for (const name of CHROME_COMPONENTS) {
  ok('CampaignShell.tsx renders ' + name, shell.indexOf('<' + name) >= 0);
}

// The shell must NOT use dangerouslySetInnerHTML to render the chrome
// strip after Phase F. The drawer body and unmigrated tab bodies still
// do, so we look for the chrome-specific `__html: fragments.` pattern
// the old shell used.
ok('CampaignShell.tsx does not render fragments.header via dangerouslySetInnerHTML',
   shell.indexOf('fragments.header') < 0 && shell.indexOf('fragments.modeBar') < 0
   && shell.indexOf('fragments.commandRail') < 0);

// CampaignPage.tsx delegates to CampaignShell with no other Shell logic.
ok('CampaignPage renders CampaignShell', /<CampaignShell\s*\/?>/.test(page));

// React-shell-aware behaviour in render() — when the flag is set,
// `_root.innerHTML = ...` is skipped. Verify the conditional sits in
// render() and init().
ok('render() respects _reactShellEnabled',
   /_reactShellEnabled[\s\S]{0,400}campaign:state-tick/.test(ui));
ok('init() skips innerHTML clobber when shell enabled',
   /_reactShellEnabled[\s\S]{0,300}_root\.innerHTML = '<div class="campaign-loading"/.test(ui));

// _openPanel / _closePanel branch on react-shell flag so they don't
// fight React for drawer DOM ownership.
ok('_openPanel branches on _reactShellEnabled',
   /function _openPanel[\s\S]{0,500}_reactShellEnabled/.test(ui));
ok('_closePanel branches on _reactShellEnabled',
   /function _closePanel[\s\S]{0,500}_reactShellEnabled/.test(ui));

// The shell uses createPortal for the drawer (so it can attach to
// document.body without leaving its React boundary).
ok('CampaignShell uses createPortal for the drawer',
   /createPortal\([\s\S]{0,400}document\.body/.test(shell));

// The shell listens for the new state-tick event (and falls back to
// the legacy rendered event).
ok('CampaignShell listens for campaign:state-tick', /campaign:state-tick/.test(shell));
ok('CampaignShell still listens for campaign:rendered (legacy fallback)',
   /campaign:rendered/.test(shell));

// REACT_TAB_COMPONENTS in CampaignShell.tsx must cover every tab id
// the cui-react-bridge.js registers. If a tab id is registered in the
// vanilla bridge but missing from the React shell map, the active-tab
// switch silently falls back to dangerouslySetInnerHTML and the React
// component never renders.
const bridge = fs.readFileSync(path.join(__dirname, 'js/campaign/ui/tabs/cui-react-bridge.js'), 'utf8');
const REGISTERED_IDS = [
  'settings', 'logs', 'roster',
  'worldMap', 'worldActivities',
  'sideForge', 'questChains', 'oracleForge', 'battleSets', 'mapSeeds',
  'inventory', 'shops', 'craft', 'cook', 'farm', 'relationships',
  'worldGate', 'storyHome', 'storySummary', 'storyDirector',
  'questHome', 'quests',
  'eventHome', 'eventCharacter', 'eventSpecial', 'eventSide', 'eventLog',
  'scenarios', 'maps', 'minigameTest', 'overview'
];
for (const id of REGISTERED_IDS) {
  ok('cui-react-bridge registers "' + id + '"', bridge.indexOf("'" + id + "'") >= 0);
  // The shell's tab map uses bare keys, e.g. `settings: (props) => ...`.
  // Allow either bare or quoted forms (some keys aren't valid ident).
  const reBare = new RegExp('^\\s*' + id + '\\s*:', 'm');
  const reQuoted = new RegExp('["\']' + id + '["\']\\s*:');
  ok('CampaignShell.tsx has React component for "' + id + '"',
     reBare.test(shell) || reQuoted.test(shell));
}

console.log('\nRESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
