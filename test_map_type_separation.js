// Regression tests covering the node/grid map separation: bigger sizes,
// guaranteed chasing monster on grid quest maps, and the
// "I picked Grid Map but got Node Map" bug fix.
// Run: node test_map_type_separation.js

const fs = require('fs');
const vm = require('vm');

function makeSandbox() {
  const sandbox = { window: {}, console, Math, Date, Object, Array, Number, JSON, Boolean, String };
  sandbox.window.CJS = {
    CampaignState: {
      getState: () => ({
        currentWorld: 'haven',
        sideContent: { generatedMaps: {}, generatedScenarios: {}, contentHistory: [] },
        log: [],
        quests: { q1: { id: 'q1', title: 'Hunt the wolves', mapForm: 'grid_map', objectives: [] } },
        phase: { number: 1 }
      }),
      getCurrentCampaign: () => ({ world: 'haven' }),
      mutate: () => {}
    },
    DataStore: { get: () => null, getAllAsArray: () => [] },
    CampaignDataLoader: {
      getMapSeeds: () => [],
      getMapSeed: () => null,
      getBattleSetCards: () => [],
      getBattleSetCard: () => null,
      getQuestChainTemplate: () => null
    },
    ScenarioRunner: {}
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('js/campaign/campaign-scenario-generator.js', 'utf8'), sandbox);
  return sandbox;
}

let pass = 0;
let fail = 0;
function ok(label, cond, info = '') {
  if (cond) { pass += 1; console.log('  OK  ' + label + (info ? ' (' + info + ')' : '')); }
  else { fail += 1; console.log('  XX  ' + label + (info ? ' (' + info + ')' : '')); }
}

console.log('Map type separation regression tests');

const sandbox = makeSandbox();
const Gen = sandbox.window.CJS.CampaignScenarioGenerator;

// Size catalog
const opts = Gen.options();
ok('huge size is available', opts.sizes.includes('huge'));
ok('massive size is available', opts.sizes.includes('massive'));
ok('size order is tiny..massive', opts.sizes.join(',') === 'tiny,small,medium,large,huge,massive');

// Grid maps always include at least 1 chasing threat across all sizes
for (const size of opts.sizes) {
  const r = Gen.generate({ source: 'active_quest', questId: 'q1', mapForm: 'grid_map', mapType: 'forest', size });
  const threats = r.scenario.movingThreats || [];
  const chasers = threats.filter((t) => t.moveMode === 'chase');
  ok('grid size ' + size + ' has at least 1 chase threat', chasers.length >= 1, 'chasers=' + chasers.length);
  ok('grid size ' + size + ' produces a grid_map', r.map.type === 'grid_map' && r.scenario.travelMode === 'grid_map');
}

// Node maps never get moving threats (different ruleset)
for (const size of opts.sizes) {
  const r = Gen.generate({ source: 'active_quest', questId: 'q1', mapForm: 'node_map', mapType: 'forest', size });
  const threats = r.scenario.movingThreats || [];
  ok('node size ' + size + ' has no moving threats', threats.length === 0);
  ok('node size ' + size + ' produces a node_map', r.map.type === 'node_map' && r.scenario.travelMode === 'node_map');
}

// Grid sizes grow monotonically
const sizes = ['tiny', 'small', 'medium', 'large', 'huge', 'massive'];
let prevCells = 0;
for (const size of sizes) {
  const r = Gen.generate({ source: 'active_quest', questId: 'q1', mapForm: 'grid_map', mapType: 'dungeon', size });
  const cells = r.map.width * r.map.height;
  ok('grid ' + size + ' is at least as big as previous (' + cells + ')', cells >= prevCells);
  prevCells = cells;
}

// Node canvases scale with size
const tiny = Gen.generate({ source: 'active_quest', questId: 'q1', mapForm: 'node_map', mapType: 'forest', size: 'tiny' });
const massive = Gen.generate({ source: 'active_quest', questId: 'q1', mapForm: 'node_map', mapType: 'forest', size: 'massive' });
ok('massive node canvas is taller than tiny canvas', massive.map.canvasHeight > tiny.map.canvasHeight,
   tiny.map.canvasHeight + ' -> ' + massive.map.canvasHeight);

// Threat spawns are away from start cell
const big = Gen.generate({ source: 'active_quest', questId: 'q1', mapForm: 'grid_map', mapType: 'cave', size: 'huge' });
const start = big.map.defaultStartCell;
for (const t of big.scenario.movingThreats || []) {
  const dist = Math.abs(t.cell.x - start[0]) + Math.abs(t.cell.y - start[1]);
  ok('threat ' + t.id + ' spawns at least 2 steps from start', dist >= 2, 'dist=' + dist);
}

// Generated scenarios opt into the lightweight quick-narrative flow so the
// fullscreen VN is skipped for create-quest / random-quest runs.
for (const form of ['node_map', 'grid_map']) {
  const r = Gen.generate({ source: 'active_quest', questId: 'q1', mapForm: form, mapType: 'forest', size: 'small' });
  ok(form + ' scenario is marked quickNarrative=true', r.scenario.quickNarrative === true);
}

console.log('\nRESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
