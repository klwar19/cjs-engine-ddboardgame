// Regression tests for sequence <-> scenario flow, progress triggers, and
// battle auto-resume.
// Run: node test_campaign_sequence_scenario_flow.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const mockFiles = {
  'data/campaigns/test/sequences/_sequence_index.json': {
    id: 'test_sequence_index',
    campaignId: 'cmp_test',
    world: 'test',
    version: 1,
    entries: [
      {
        id: 'story_map_run',
        scope: 'story',
        kind: 'main_story',
        chapterId: 'arc1_ch01',
        chapterLabel: '1.15',
        orderKey: '1.15',
        partId: 'part_1_15',
        partLabel: 'Map Run',
        title: 'Bridge Search',
        file: 'story/map_run.json',
        summary: {
          short: 'The chapter opens into a multi-level grid run.',
          default: 'The party completes the bridge search.'
        }
      },
      {
        id: 'story_combat_resume',
        scope: 'story',
        kind: 'main_story',
        chapterId: 'arc1_ch02',
        chapterLabel: '1.16a',
        orderKey: '1.16.a',
        partId: 'part_1_16a',
        partLabel: 'Combat Resume',
        title: 'Gate Clash',
        file: 'story/combat_resume.json',
        summary: {
          short: 'A combat node should resume itself after battle.',
          default: 'The gate clash resolves.'
        }
      }
    ]
  },
  'data/campaigns/test/sequences/story/map_run.json': {
    id: 'story_map_run',
    scope: 'story',
    title: 'Bridge Search',
    chapterId: 'arc1_ch01',
    chapterLabel: '1.15',
    orderKey: '1.15',
    partId: 'part_1_15',
    partLabel: 'Map Run',
    startNode: 'open',
    nodes: [
      {
        id: 'open',
        type: 'narration',
        text: 'Bin reaches the bridge approach.',
        next: 'search_map'
      },
      {
        id: 'search_map',
        type: 'scenario',
        scenarioId: 'scn_grid_levels',
        text: 'Search the lower and upper halls for the target cache.',
        onSuccess: 'after_target',
        onFail: 'after_failure',
        onAbort: 'after_abort'
      },
      {
        id: 'after_target',
        type: 'narration',
        text: 'The chapter resumes after the target scene.',
        next: 'end'
      },
      {
        id: 'after_failure',
        type: 'narration',
        text: 'The party falls back from the search.',
        next: 'end'
      },
      {
        id: 'after_abort',
        type: 'narration',
        text: 'The party abandons the search for now.',
        next: 'end'
      },
      { id: 'end', type: 'end', result: 'complete' }
    ]
  },
  'data/campaigns/test/sequences/story/combat_resume.json': {
    id: 'story_combat_resume',
    scope: 'story',
    title: 'Gate Clash',
    chapterId: 'arc1_ch02',
    chapterLabel: '1.16a',
    orderKey: '1.16.a',
    partId: 'part_1_16a',
    partLabel: 'Combat Resume',
    startNode: 'fight',
    nodes: [
      {
        id: 'fight',
        type: 'combat',
        encounterId: 'enc_gate_clash',
        label: 'Gate Clash',
        onWin: 'after_win',
        onLose: 'after_loss'
      },
      {
        id: 'after_win',
        type: 'narration',
        text: 'Victory returns the story to dialogue.',
        next: 'end'
      },
      {
        id: 'after_loss',
        type: 'narration',
        text: 'Defeat routes into the fallback branch.',
        next: 'end'
      },
      { id: 'end', type: 'end', result: 'complete' }
    ]
  }
};

const math = Object.create(Math);
math.random = () => 0.99;

const sandbox = {
  window: {
    CJS: {
      FarmingMode: { normalizeFarm: (farm) => farm },
      CampaignPartyChat: { auto: () => {} },
      CampaignStoryScenes: {
        playSceneById: (sceneId, options = {}) => {
          sandbox.__storyScenes.push(sceneId);
          if (typeof options.onComplete === 'function') options.onComplete({ sceneId, reason: 'stub' });
          return true;
        },
        prepareNodeEntry: () => false,
        captureNodeAfterBattle: () => false
      }
    }
  },
  __storyScenes: [],
  document: {
    body: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => ({})
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {}
  },
  fetch: async (url) => {
    const key = String(url || '').replace(/\\/g, '/');
    const value = mockFiles[key];
    if (!value) {
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({})
      };
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => JSON.parse(JSON.stringify(value))
    };
  },
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  performance: { now: () => Date.now() },
  Math: math,
  Object,
  Array,
  String,
  Number,
  Boolean,
  JSON,
  Map,
  Set,
  Date,
  RegExp,
  Error,
  Promise,
  Symbol,
  Proxy,
  Reflect,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  Infinity,
  NaN
};

vm.createContext(sandbox);

const loadOrder = [
  'core/constants.js',
  'core/formulas.js',
  'core/state-tools.js',
  'core/data-store.js',
  'campaign/campaign-tags.js',
  'campaign/campaign-state.js',
  'campaign/campaign-ops.js',
  'campaign/campaign-conditions.js',
  'campaign/scenario-runner.js',
  'campaign/campaign-sequence-runner.js'
];

for (const file of loadOrder) {
  const code = fs.readFileSync(path.join(__dirname, 'js', file), 'utf8');
  vm.runInContext(code, sandbox);
}

const CJS = sandbox.window.CJS;

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  OK  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${label}`);
  }
}

function assertEq(label, actual, expected) {
  const ok = actual === expected;
  assert(`${label} (${JSON.stringify(actual)})`, ok);
  if (!ok) console.error(`       expected ${JSON.stringify(expected)}`);
}

function buildState() {
  return {
    saveVersion: 1,
    saveId: 'flow_test',
    slotName: 'Flow Test',
    campaignId: 'cmp_test',
    currentWorld: 'test',
    currentChapter: 1,
    phase: { number: 1, type: 'town_phase', name: 'Town Phase' },
    party: {},
    currencies: {},
    inventory: { items: {}, materials: {}, food: {}, questItems: {}, equipment: {} },
    quests: {},
    flags: {},
    tagLedger: { entries: {} },
    questPulse: { recent: [], settings: { autoApplyCombat: true } },
    legacy: { traits: {}, majorChoices: [], unlockedEchoes: [] },
    activeScenarioRun: null,
    scenarioHistory: [],
    mapState: {},
    worldArchive: {},
    pocketHaven: { enabled: true, notes: [], incomeNodes: {}, farm: { plots: [] }, stations: [] },
    hubState: {},
    sideContent: { generatedIdeas: {}, generatedScenarios: {}, generatedMaps: {}, activeQuestChains: {}, contentHistory: [], reviewQueue: [], importedPacks: {} },
    storyChoices: [],
    clocks: {},
    memoryShards: {},
    bonds: {},
    storyDirector: { mode: 'solo_gm', activeStageId: null, storyQueue: {}, clueLedger: {}, revealedFacts: {}, threadStatus: {}, metrics: {}, lastBeatIds: [], sideQuestSync: {} },
    storyMode: {
      currentArcId: null,
      currentChapterId: null,
      currentChapterLabel: null,
      currentChapterOrderKey: null,
      currentPartId: null,
      completedParts: {},
      defaultedParts: {},
      revealedChapters: {},
      partResults: {},
      manualSummaryEntries: []
    },
    sequenceRuntime: { active: null, history: [] },
    eventLog: { entries: [] },
    pinnedNotes: [],
    log: [],
    settings: {}
  };
}

function seedContent() {
  const DS = CJS.DataStore;
  DS.reset();
  DS.replace('scenarios', 'scn_grid_levels', {
    id: 'scn_grid_levels',
    world: 'test',
    travelMode: 'grid_map',
    mapId: 'map_grid_levels',
    startLevelId: 'floor_1',
    startCell: [0, 0],
    objective: {
      id: 'obj_cache',
      kind: 'reach',
      label: 'Reach the target cache',
      levelId: 'floor_2',
      cell: { x: 1, y: 0 },
      marker: true
    },
    movingThreats: [
      {
        id: 'roamer_floor_1',
        label: 'Roaming Test Threat',
        levelId: 'floor_1',
        cell: { x: 1, y: 0 },
        battleSetId: 'bset_roamer_floor_1',
        moveMode: 'random',
        icon: '!'
      }
    ],
    progressTriggers: [
      {
        id: 'upper_floor',
        when: { type: 'enter_layer', levelId: 'floor_2' },
        setFlags: { entered_upper: true }
      },
      {
        id: 'midpoint',
        when: { type: 'explore_percent', gte: 60 },
        setFlags: { explored_60: true }
      },
      {
        id: 'target_scene',
        when: { type: 'objective_completed' },
        storySceneId: 'scene_target_found',
        endScenario: 'success'
      }
    ]
  });
  DS.replace('scenarioMaps', 'map_grid_levels', {
    id: 'map_grid_levels',
    name: 'Layered Grid Test',
    type: 'grid_map',
    defaultLevelId: 'floor_1',
    levels: [
      {
        id: 'floor_1',
        name: 'Lower Hall',
        width: 3,
        height: 1,
        defaultStartCell: [0, 0],
        terrain: [['floor', 'floor', 'floor']],
        cells: [
          { id: 'lower_start', x: 0, y: 0, kind: 'entrance', title: 'Lower Start', discoveredByDefault: true },
          { id: 'threat_lane', x: 1, y: 0, kind: 'event', title: 'Threat Lane' },
          { id: 'stairs_up', x: 2, y: 0, kind: 'stairs', title: 'Stairs Up', nextLevelId: 'floor_2', nextCell: [0, 0] }
        ]
      },
      {
        id: 'floor_2',
        name: 'Upper Gallery',
        width: 2,
        height: 1,
        defaultStartCell: [0, 0],
        terrain: [['floor', 'floor']],
        cells: [
          { id: 'upper_landing', x: 0, y: 0, kind: 'entrance', title: 'Upper Landing' },
          { id: 'target_cache', x: 1, y: 0, kind: 'event', title: 'Target Cache' }
        ]
      }
    ]
  });
  CJS.CampaignState.loadContentFromDataStore();
}

function waitTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

(async () => {
  console.log('Sequence / scenario flow regression tests');
  seedContent();
  CJS.CampaignState.setState(buildState(), { source: 'test', type: 'replace' });

  await CJS.CampaignSequences.loadWorld('test');

  await CJS.CampaignSequences.start('story_map_run', { world: 'test' });
  await CJS.CampaignSequences.advance('next');
  let state = CJS.CampaignState.getState();
  assertEq('sequence advances into scenario node', state.sequenceRuntime.active.nodeId, 'search_map');

  const startRun = await CJS.CampaignSequences.advance('next');
  state = CJS.CampaignState.getState();
  assert('scenario node starts a linked run', !!startRun?.scenarioStarted && state.activeScenarioRun?.scenarioId === 'scn_grid_levels');
  assertEq('grid run starts on floor 1', state.activeScenarioRun.mapLayer, 'floor_1');
  assert('grid objective starts hidden on authored map run', state.activeScenarioRun.objectiveState?.visible === false);

  CJS.ScenarioRunner.moveToCell(1, 0);
  state = CJS.CampaignState.getState();
  assertEq('moving threat contact queues an immediate battle', state.pendingBattle?.source, 'moving_threat');

  CJS.CampaignOps.apply({
    op: 'manual_battle_result',
    result: 'victory',
    summary: 'Moving threat test.'
  }, { source: 'test' });
  await waitTick();
  state = CJS.CampaignState.getState();
  assertEq('clearing the moving threat removes it from the active run', state.activeScenarioRun.movingThreats.length, 0);

  CJS.ScenarioRunner.moveToCell(2, 0);
  state = CJS.CampaignState.getState();
  assertEq('stairs move transitions to floor 2', state.activeScenarioRun.mapLayer, 'floor_2');
  assertEq('stairs move lands on the authored arrival cell', `${state.activeScenarioRun.currentCell.x},${state.activeScenarioRun.currentCell.y}`, '0,0');
  assert('enter-layer trigger sets a flag on floor 2 arrival', !!state.flags.entered_upper);
  assert('60 percent exploration trigger sets a flag', !!state.flags.explored_60);
  assert('objective reveals after the deeper push', state.activeScenarioRun.objectiveState?.visible === true);

  CJS.ScenarioRunner.moveToCell(1, 0);
  await waitTick();
  state = CJS.CampaignState.getState();
  assert('objective completion trigger plays a follow-up scene', sandbox.__storyScenes.includes('scene_target_found'));
  assert('objective completion ends the scenario', !state.activeScenarioRun);
  assertEq('sequence resumes after successful scenario resolution', state.sequenceRuntime.active.nodeId, 'after_target');

  await CJS.CampaignSequences.start('story_combat_resume', { world: 'test' });
  await CJS.CampaignSequences.advance('queue');
  state = CJS.CampaignState.getState();
  assertEq('combat node queues a sequence battle', state.pendingBattle.source, 'sequence:fight');

  CJS.CampaignOps.apply({
    op: 'manual_battle_result',
    result: 'victory',
    summary: 'Combat auto-resume test.'
  }, { source: 'test' });
  await waitTick();
  state = CJS.CampaignState.getState();
  assertEq('combat result auto-advances the active sequence', state.sequenceRuntime.active.nodeId, 'after_win');

  console.log(`\nRESULTS: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
