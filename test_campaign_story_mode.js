// Focused regression tests for story sequence ordering/default-path behavior.
// Run: node test_campaign_story_mode.js

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
        id: 'story_ch1_part1',
        scope: 'story',
        kind: 'main_story',
        chapterId: 'arc1_ch01',
        chapterLabel: '1',
        orderKey: '1',
        partId: 'part1',
        partLabel: 'Part 1',
        title: 'Arrival Route',
        file: 'story/part1.json',
        summary: {
          short: 'Bin arrives and picks a route.',
          default: 'Bin takes the authored gate route by default.'
        }
      },
      {
        id: 'story_ch1_part2_gate',
        scope: 'story',
        kind: 'main_story',
        chapterId: 'arc1_ch01b',
        chapterLabel: '1.1',
        orderKey: '1.1',
        partId: 'part2_gate',
        partLabel: 'Gate Follow-up',
        title: 'Gate Follow-up',
        file: 'story/part2_gate.json',
        requiresFlags: ['route_gate'],
        summary: {
          short: 'The gate route echoes forward.',
          default: 'The gate route follow-up becomes canon.'
        }
      },
      {
        id: 'story_ch1_part2_tavern',
        scope: 'story',
        kind: 'main_story',
        chapterId: 'arc1_ch01b',
        chapterLabel: '1.1',
        orderKey: '1.1',
        partId: 'part2_tavern',
        partLabel: 'Tavern Follow-up',
        title: 'Tavern Follow-up',
        file: 'story/part2_tavern.json',
        requiresFlags: ['route_tavern'],
        summary: {
          short: 'The tavern route echoes forward.',
          default: 'The tavern route follow-up becomes canon.'
        }
      },
      {
        id: 'story_ch2_part1',
        scope: 'story',
        kind: 'main_story',
        chapterId: 'arc1_ch02',
        chapterLabel: '2',
        orderKey: '2',
        partId: 'part3',
        partLabel: 'Part 1',
        title: 'Chapter Two Opens',
        file: 'story/part3.json',
        summary: {
          short: 'Chapter two starts.',
          default: 'Chapter two starts.'
        }
      }
    ]
  },
  'data/campaigns/test/sequences/story/part1.json': {
    id: 'story_ch1_part1',
    scope: 'story',
    title: 'Arrival Route',
    chapterId: 'arc1_ch01',
    chapterLabel: '1',
    orderKey: '1',
    partId: 'part1',
    partLabel: 'Part 1',
    startNode: 'open',
    summary: {
      short: 'Bin arrives and picks a route.',
      default: 'Bin takes the authored gate route by default.'
    },
    nodes: [
      { id: 'open', type: 'narration', text: 'Bin reaches the city gates.', next: 'route_choice' },
      {
        id: 'route_choice',
        type: 'choice',
        prompt: 'Which route is canon?',
        defaultChoiceId: 'gate',
        choices: [
          {
            id: 'gate',
            label: 'Gate',
            next: 'finish',
            ops: [{ op: 'set_flag', flag: 'route_gate', value: true }]
          },
          {
            id: 'tavern',
            label: 'Tavern',
            next: 'finish',
            ops: [{ op: 'set_flag', flag: 'route_tavern', value: true }]
          }
        ]
      },
      {
        id: 'finish',
        type: 'ops',
        summary: 'The arrival route is recorded.',
        ops: [{ op: 'set_flag', flag: 'part1_done', value: true }],
        next: 'end'
      },
      { id: 'end', type: 'end', result: 'complete' }
    ]
  },
  'data/campaigns/test/sequences/story/part2_gate.json': {
    id: 'story_ch1_part2_gate',
    scope: 'story',
    title: 'Gate Follow-up',
    chapterId: 'arc1_ch01b',
    chapterLabel: '1.1',
    orderKey: '1.1',
    partId: 'part2_gate',
    partLabel: 'Gate Follow-up',
    startNode: 'open',
    summary: {
      short: 'The gate route echoes forward.',
      default: 'The gate route follow-up becomes canon.'
    },
    nodes: [
      {
        id: 'open',
        type: 'ops',
        summary: 'Gate follow-up is stored.',
        ops: [{ op: 'set_flag', flag: 'gate_followup_done', value: true }],
        next: 'end'
      },
      { id: 'end', type: 'end', result: 'complete' }
    ]
  },
  'data/campaigns/test/sequences/story/part2_tavern.json': {
    id: 'story_ch1_part2_tavern',
    scope: 'story',
    title: 'Tavern Follow-up',
    chapterId: 'arc1_ch01b',
    chapterLabel: '1.1',
    orderKey: '1.1',
    partId: 'part2_tavern',
    partLabel: 'Tavern Follow-up',
    startNode: 'open',
    summary: {
      short: 'The tavern route echoes forward.',
      default: 'The tavern route follow-up becomes canon.'
    },
    nodes: [
      {
        id: 'open',
        type: 'ops',
        summary: 'Tavern follow-up is stored.',
        ops: [{ op: 'set_flag', flag: 'tavern_followup_done', value: true }],
        next: 'end'
      },
      { id: 'end', type: 'end', result: 'complete' }
    ]
  },
  'data/campaigns/test/sequences/story/part3.json': {
    id: 'story_ch2_part1',
    scope: 'story',
    title: 'Chapter Two Opens',
    chapterId: 'arc1_ch02',
    chapterLabel: '2',
    orderKey: '2',
    partId: 'part3',
    partLabel: 'Part 1',
    startNode: 'open',
    summary: {
      short: 'Chapter two starts.',
      default: 'Chapter two starts.'
    },
    nodes: [
      {
        id: 'open',
        type: 'ops',
        summary: 'Chapter two opening stored.',
        ops: [{ op: 'set_flag', flag: 'chapter2_started', value: true }],
        next: 'end'
      },
      { id: 'end', type: 'end', result: 'complete' }
    ]
  }
};

const sandbox = {
  window: {
    CJS: {
      FarmingMode: { normalizeFarm: (farm) => farm }
    }
  },
  document: {
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
  Math,
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
  'core/data-store.js',
  'campaign/campaign-tags.js',
  'campaign/campaign-state.js',
  'campaign/campaign-ops.js',
  'campaign/campaign-conditions.js',
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
    saveId: 'story_test',
    slotName: 'Story Test',
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

(async () => {
  console.log('Story mode regression tests');
  CJS.CampaignState.setState(buildState(), { source: 'test', type: 'replace' });

  await CJS.CampaignSequences.loadWorld('test');
  const ordered = CJS.CampaignSequences.list('story', 'test').map((entry) => entry.id);
  assertEq('story files sort by order key',
    ordered.join(','),
    'story_ch1_part1,story_ch1_part2_gate,story_ch1_part2_tavern,story_ch2_part1');

  const started = await CJS.CampaignSequences.start('story_ch2_part1', { world: 'test' });
  assertEq('starting later chapter defaults only eligible earlier parts', started.defaulted.length, 2);

  let state = CJS.CampaignState.getState();
  assert('default path sets gate route flag', !!state.flags.route_gate);
  assert('default path sets part1 completion flag', !!state.flags.part1_done);
  assert('default path sets gate follow-up flag', !!state.flags.gate_followup_done);
  assert('default path skips tavern follow-up route', !state.flags.tavern_followup_done);
  assertEq('current chapter label follows active story part', state.storyMode.currentChapterLabel, '2');
  assertEq('canonical record stores defaulted mode', state.storyMode.partResults.story_ch1_part1.mode, 'defaulted');
  assertEq('replayed chapter count is still zero', Object.keys(state.storyMode.completedParts).length, 0);

  await CJS.CampaignSequences.complete('manual');
  state = CJS.CampaignState.getState();
  assert('chapter two part result is stored', !!state.storyMode.partResults.story_ch2_part1);

  const replay = await CJS.CampaignSequences.start('story_ch1_part1', { world: 'test' });
  assert('starting an already defaulted part opens replay mode', replay.replayOnly);
  assert('replay mode freezes consequences', CJS.CampaignSequences.active().applyConsequences === false);

  await CJS.CampaignSequences.advance('next');
  await CJS.CampaignSequences.advance('choice', 'tavern');
  state = CJS.CampaignState.getState();
  assert('replay route choice does not set tavern flag', !state.flags.route_tavern);

  await CJS.CampaignSequences.advance('next');
  await CJS.CampaignSequences.complete('manual');
  state = CJS.CampaignState.getState();
  assertEq('canonical part1 record remains defaulted after replay', state.storyMode.partResults.story_ch1_part1.mode, 'defaulted');
  assert('story summary keeps two chapter-one records plus chapter two', Object.keys(state.storyMode.partResults).length === 3);

  console.log(`\nRESULTS: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
