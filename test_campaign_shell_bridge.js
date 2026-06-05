// test_campaign_shell_bridge.js — Smoke test for the React-shell bridge
// surface owned by `src/campaign/shell/boot.ts`.
//
// The bridge is the contract between the React shell
// (`src/campaign/CampaignShell.tsx`) and the campaign engine. Phase H.4
// retired the vanilla `js/campaign/campaign-ui.js` IIFE: the boot + render
// loop, combat-result return flow, drawer body, quest narrative modal, and
// the action / chrome dispatch seam now live in TypeScript (`boot.ts`),
// which installs the same `window.CJS.CampaignUI` surface the shell + the
// remaining JS callers (pocket-haven / scenario-runner / data-hot-reload)
// consume. If a contributor removes a getter or setter, the React shell
// silently falls back to a blank page — these checks catch that regression
// at the source level.
//
// We don't fully boot the module here (it depends on many world data
// modules + the DOM). We grep the source for the API surface names —
// narrow but stable across refactors.
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

const bootPath = path.join(__dirname, 'src/campaign/shell/boot.ts');
const shellPath = path.join(__dirname, 'src/campaign/CampaignShell.tsx');
const pagePath = path.join(__dirname, 'src/campaign/CampaignPage.tsx');
const legacyUiPath = path.join(__dirname, 'js/campaign/campaign-ui.js');

// Phase H.4 — campaign-ui.js is deleted; boot.ts is the TS owner.
ok('legacy campaign-ui.js is removed', !fs.existsSync(legacyUiPath));
ok('shell/boot.ts exists', fs.existsSync(bootPath));
ok('CampaignShell.tsx exists', fs.existsSync(shellPath));
ok('CampaignPage.tsx exists', fs.existsSync(pagePath));

const boot = fs.readFileSync(bootPath, 'utf8');
const shell = fs.readFileSync(shellPath, 'utf8');
const page = fs.readFileSync(pagePath, 'utf8');

// Bridge functions: every name listed here is read by the React shell
// (directly or through the `src/campaign/shell/bridge.ts` wrapper) or by
// a remaining JS caller. Each must be defined in boot.ts AND installed on
// the window.CJS.CampaignUI surface.
const BRIDGE_FUNCS = [
  'init',
  'render',
  'enableReactShell',
  'handleAction',
  'showQuestNarrative',
  'setActiveMode',
  'setActiveTab',
  'setActivePanel',
  'getBootIncompatibleNotice',
  'clearBootIncompatibleNotice'
];
// The install block (Object.freeze({ ... })) lists every surface key.
const installIdx = boot.indexOf('.CampaignUI = Object.freeze({');
ok('boot.ts installs window.CJS.CampaignUI', installIdx >= 0);
const installBlock = installIdx >= 0 ? boot.slice(installIdx) : '';
for (const name of BRIDGE_FUNCS) {
  const defined = new RegExp('(?:export\\s+)?(?:async\\s+)?function\\s+' + name + '\\b').test(boot);
  const installed = new RegExp('(?:^|[\\s{,])' + name + '(?:,|\\s|$)', 'm').test(installBlock);
  ok('bridge exposes ' + name, defined && installed);
}

// The React shell must read these functions for the chrome to be wired
// up correctly. `getChromeData` lives behind `src/campaign/shell/bridge.ts`
// (and resolves to the TS chromeData builder); `panelDefsForState` comes
// from the same TS module.
const SHELL_USES = ['enableReactShell', 'panelDefsForState', 'setActivePanel'];
for (const name of SHELL_USES) {
  ok('CampaignShell.tsx uses ' + name, shell.indexOf(name) >= 0);
}

const bridgeShellPath = path.join(__dirname, 'src/campaign/shell/bridge.ts');
ok('src/campaign/shell/bridge.ts exists', fs.existsSync(bridgeShellPath));
const bridgeShell = fs.readFileSync(bridgeShellPath, 'utf8');
ok('shell/bridge.ts re-exports getChromeData', bridgeShell.indexOf('getChromeData') >= 0);
ok('shell/bridge.ts uses setActiveMode', bridgeShell.indexOf('setActiveMode') >= 0);
ok('shell/bridge.ts uses setActiveTab', bridgeShell.indexOf('setActiveTab') >= 0);
ok('shell/bridge.ts uses setActivePanel', bridgeShell.indexOf('setActivePanel') >= 0);

// Phase H.4 — TS chrome data builder is the canonical source.
const chromeDataPath = path.join(__dirname, 'src/campaign/shell/chromeData.ts');
ok('src/campaign/shell/chromeData.ts exists', fs.existsSync(chromeDataPath));
const chromeData = fs.readFileSync(chromeDataPath, 'utf8');
ok('chromeData.ts exports getChromeData', /export function getChromeData/.test(chromeData));
ok('chromeData.ts exports panelDefsForState', /export function panelDefsForState/.test(chromeData));
ok('chromeData.ts exports panelOrder', /export function panelOrder/.test(chromeData));

// CampaignShell.tsx renders the JSX chrome components instead of
// dangerouslySetInnerHTML fragments. Asserting the imports is enough:
// the JSX directly references them so any drift breaks build/typecheck.
const CHROME_COMPONENTS = ['CampaignHeader', 'CampaignModeBar',
  'CampaignSubTabs', 'CampaignRecentLog', 'CampaignCommandRail'];
for (const name of CHROME_COMPONENTS) {
  ok('CampaignShell.tsx renders ' + name, shell.indexOf('<' + name) >= 0);
}

// The shell must NOT use dangerouslySetInnerHTML at all. Phase F retired the
// chrome `fragments.` strips; the switch-plan island ports retired the main-body
// fallback (now a typed empty state) and the drawer quests/log panels (now JSX
// in shell/DrawerPanels). The only sanctioned campaign island, the world-map
// SVG, lives in CampaignWorldMapTab.tsx — not the shell.
ok('CampaignShell.tsx does not render fragments.header via dangerouslySetInnerHTML',
   shell.indexOf('fragments.header') < 0 && shell.indexOf('fragments.modeBar') < 0
   && shell.indexOf('fragments.commandRail') < 0);
ok('CampaignShell.tsx has no dangerouslySetInnerHTML', shell.indexOf('dangerouslySetInnerHTML={') < 0);

// CampaignPage.tsx delegates to CampaignShell with no other Shell logic.
ok('CampaignPage renders CampaignShell', /<CampaignShell\s*\/?>/.test(page));

// React-shell-aware behaviour in boot.ts — when the flag is set, render()
// emits a state-tick (no innerHTML clobber); when unset, render() is a
// no-op. init() only clobbers the loading placeholder when the shell is
// NOT enabled.
ok('render() respects _reactShellEnabled',
   /_reactShellEnabled[\s\S]{0,400}campaign:state-tick/.test(boot));
ok('init() skips innerHTML clobber when shell enabled',
   /if \(!_reactShellEnabled\)[\s\S]{0,200}campaign-loading/.test(boot));

// The Escape-to-close drawer path survives (the imperative _openPanel /
// _renderPanelLayer DOM flow was dropped — the React CampaignDrawer owns
// the drawer DOM). boot.ts keeps a document-level Escape listener.
ok('boot.ts binds Escape-to-close for the drawer', /bindEscapeForPanels/.test(boot));
ok('boot.ts closePanel routes through the chrome slice',
   /function closePanel[\s\S]{0,160}setActivePanelRaw\(null\)/.test(boot));

// The shell uses createPortal for the drawer (so it can attach to
// document.body without leaving its React boundary).
ok('CampaignShell uses createPortal for the drawer',
   /createPortal\([\s\S]{0,400}document\.body/.test(shell));

// The shell listens for the new state-tick event (and the legacy
// rendered event as a fallback).
ok('CampaignShell listens for campaign:state-tick', /campaign:state-tick/.test(shell));
ok('CampaignShell still listens for campaign:rendered (legacy fallback)',
   /campaign:rendered/.test(shell));

// REACT_TAB_COMPONENTS in CampaignShell.tsx must cover every tab id the
// cui-react-bridge.ts module registers. If a tab id is registered in the
// bridge but missing from the React shell map, the active-tab switch
// silently falls back to dangerouslySetInnerHTML and the React component
// never renders.
const bridge = fs.readFileSync(path.join(__dirname, 'src/campaign/util/cui-react-bridge.ts'), 'utf8');
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
  ok('cui-react-bridge registers "' + id + '"',
     bridge.indexOf('"' + id + '"') >= 0 || bridge.indexOf("'" + id + "'") >= 0);
  const reBare = new RegExp('^\\s*' + id + '\\s*:', 'm');
  const reQuoted = new RegExp('["\']' + id + '["\']\\s*:');
  ok('CampaignShell.tsx has React component for "' + id + '"',
     reBare.test(shell) || reQuoted.test(shell));
}

// Phase I.4 — tab bodies are React.lazy'd so the campaign entry chunk ships
// only the chrome + active tab. The map must use lazy(import(...)) (not eager
// imports), the body must be wrapped in <Suspense>, and an ErrorBoundary must
// catch a failed chunk so a stale hash doesn't blank the whole shell.
ok('CampaignShell lazy-loads tab components',
   /lazy\(\(\) => import\("\.\/tabs\//.test(shell));
ok('CampaignShell no longer eagerly imports tab components',
   !/^import \{[^}]*\} from "\.\/tabs\//m.test(shell));
ok('CampaignShell wraps the tab body in <Suspense>', /<Suspense fallback=/.test(shell));
ok('CampaignShell wraps the tab body in an ErrorBoundary keyed by tab',
   /<ErrorBoundary key=\{activeTab\}>/.test(shell));
const ebPath = path.join(__dirname, 'src/campaign/util/ErrorBoundary.tsx');
ok('ErrorBoundary component exists', fs.existsSync(ebPath));
ok('ErrorBoundary implements getDerivedStateFromError',
   /getDerivedStateFromError/.test(fs.readFileSync(ebPath, 'utf8')));

// Phase H.4 — chrome state lives in `src/campaign/chrome-state.ts` and is
// the single source of truth. boot.ts reads/writes through it.
const chromePath = path.join(__dirname, 'src/campaign/chrome-state.ts');
ok('src/campaign/chrome-state.ts exists', fs.existsSync(chromePath));
const chromeSrc = fs.readFileSync(chromePath, 'utf8');

const CHROME_EXPORTS = [
  'getSnapshot', 'getActiveMode', 'getActiveTab', 'getActivePanel',
  'setActiveMode', 'setActiveTab', 'setActivePanel',
  'setActiveModeRaw', 'setActiveTabRaw', 'setActivePanelRaw',
  'clearActivePanel', 'normalizeForWorld', 'subscribe',
  'modeForTab', 'tabsForMode', 'defaultTabForMode',
  'worldUiProfile', 'appModesForWorld', 'useChromeState'
];
for (const name of CHROME_EXPORTS) {
  const re = new RegExp('export\\s+(?:async\\s+)?function\\s+' + name + '\\b|export\\s+const\\s+' + name + '\\b');
  ok('chrome-state exports ' + name, re.test(chromeSrc));
}

ok('chrome-state exports APP_MODES', /export\s+const\s+APP_MODES\b/.test(chromeSrc));
ok('chrome-state exports APP_MODE_TABS', /export\s+const\s+APP_MODE_TABS\b/.test(chromeSrc));
ok('chrome-state exports APP_UTILITY_TABS', /export\s+const\s+APP_UTILITY_TABS\b/.test(chromeSrc));

ok('chrome-state installs window.CJS.CampaignChrome',
   /CampaignChrome\s*=\s*BRIDGE/.test(chromeSrc));

// boot.ts must NOT keep its own chrome state — mode/tab/panel are read
// through the chrome-state slice (getActiveMode/Tab/Panel), never mutated
// via local `_activeMode = ...` style writes. Any such write would bypass
// the single source of truth and drift from the React subscribers.
ok('boot.ts reads chrome state through the chrome-state slice',
   /from "\.\.\/chrome-state"/.test(boot)
   && /getActiveTab\(\)/.test(boot));
ok('boot.ts has no local _activeMode/_activeTab/_activePanel writes',
   !/_active(?:Mode|Tab|Panel)\s*=\s*[^=]/.test(boot));

// boot.ts chrome setters write the slice then render() (so the React
// shell repaints + the drawer focus management fires).
ok('boot.ts setActiveMode writes the slice then renders',
   /function setActiveMode[\s\S]{0,120}chromeSetActiveMode[\s\S]{0,160}render\(\)/.test(boot));
ok('boot.ts setActivePanel writes the slice then renders',
   /function setActivePanel[\s\S]{0,120}chromeSetActivePanel[\s\S]{0,60}render\(\)/.test(boot));

// boot.ts dispatches every action through the TS registry runtime.
ok('boot.ts handleAction routes through CampaignActionsRuntime',
   /function handleAction[\s\S]{0,260}CampaignActionsRuntime/.test(boot));

// main.tsx must import chrome-state.ts BEFORE shell/boot.ts (boot reads the
// installed bridge) and must import boot.ts instead of the deleted IIFE.
const mainTs = fs.readFileSync(path.join(__dirname, 'src/campaign/main.tsx'), 'utf8');
const chromeImportIdx = mainTs.indexOf('./chrome-state');
const bootImportIdx = mainTs.indexOf('./shell/boot');
ok('main.tsx imports chrome-state before shell/boot',
   chromeImportIdx > 0 && bootImportIdx > chromeImportIdx);
ok('main.tsx imports shell/boot', bootImportIdx > 0);
ok('main.tsx no longer imports campaign-ui.js',
   !/import\s+["'][^"']*campaign-ui\.js["']/.test(mainTs));

console.log('\nRESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
