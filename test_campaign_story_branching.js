// Regression tests for chapter branching: requiresAnyStoryParts, chapter tree,
// route choices, and branch eligibility detection.
// Run: node test_campaign_story_branching.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadEngineSource } = require('./tools/test/engine-source.cjs');

const mockFiles = {
  'data/campaigns/test/sequences/_sequence_index.json': {
    id: 'test_sequence_index',
    campaignId: 'cmp_test',
    world: 'test',
    version: 1,
    entries: [
      {
        id: 'story_p1',
        scope: 'story',
        chapterLabel: '1.1',
        orderKey: '1.1',
        partId: 'p1',
        partLabel: '1.1',
        branchKey: 'trunk',
        title: 'Open',
        file: 'story/p1.json'
      },
      {
        id: 'story_p1a',
        scope: 'story',
        chapterLabel: '1.1',
        orderKey: '1.1.a',
        partId: 'p1a',
        partLabel: '1.1.a',
        branchOf: 'p1',
        branchKey: 'gate',
        routeKey: 'gate',
        routeLabel: 'Gate Route',
        title: 'Gate Walk',
        file: 'story/p1a.json',
        requiresStoryParts: ['story_p1'],
        requiresFlags: ['route_gate']
      },
      {
        id: 'story_p1b',
        scope: 'story',
        chapterLabel: '1.1',
        orderKey: '1.1.b',
        partId: 'p1b',
        partLabel: '1.1.b',
        branchOf: 'p1',
        branchKey: 'tavern',
        routeKey: 'tavern',
        routeLabel: 'Tavern Route',
        title: 'Tavern Walk',
        file: 'story/p1b.json',
        requiresStoryParts: ['story_p1'],
        requiresFlags: ['route_tavern']
      },
      {
        id: 'story_p2a',
        scope: 'story',
        chapterLabel: '1.2',
        orderKey: '1.2.a',
        partId: 'p2a',
        partLabel: '1.2.a',
        branchOf: 'p1a',
        branchKey: 'gate',
        routeKey: 'gate',
        routeLabel: 'Gate Route',
        title: 'Gate Settle',
        file: 'story/p2a.json',
        requiresStoryParts: ['story_p1a']
      },
      {
        id: 'story_p2b',
        scope: 'story',
        chapterLabel: '1.2',
        orderKey: '1.2.b',
        partId: 'p2b',
        partLabel: '1.2.b',
        branchOf: 'p1b',
        branchKey: 'tavern',
        routeKey: 'tavern',
        routeLabel: 'Tavern Route',
        title: 'Tavern Settle',
        file: 'story/p2b.json',
        requiresStoryParts: ['story_p1b']
      },
      {
        id: 'story_p3',
        scope: 'story',
        chapterLabel: '1.3',
        orderKey: '1.3.a',
        partId: 'p3',
        partLabel: '1.3.a',
        branchOf: 'p2a',
        alsoBranchOf: ['p2b'],
        branchKey: 'converge',
        title: 'Town Meeting',
        file: 'story/p3.json',
        requiresAnyStoryParts: ['story_p2a', 'story_p2b']
      }
    ]
  }
};

const stubSequence = (id, partLabel) => ({
  id,
  scope: 'story',
  title: partLabel,
  chapterLabel: partLabel.split('.').slice(0, 2).join('.'),
  orderKey: partLabel,
  partId: id.replace(/^story_/, ''),
  partLabel,
  startNode: 'open',
  summary: { short: `${partLabel} summary`, default: `${partLabel} default` },
  nodes: [
    { id: 'open', type: 'ops', summary: `${partLabel} stored.`, ops: [], next: 'end' },
    { id: 'end', type: 'end', result: 'complete' }
  ]
});

mockFiles['data/campaigns/test/sequences/story/p1.json'] = {
  ...stubSequence('story_p1', '1.1'),
  nodes: [
    { id: 'open', type: 'narration', text: 'Start.', next: 'choice' },
    {
      id: 'choice',
      type: 'choice',
      prompt: 'Which way?',
      defaultChoiceId: 'gate',
      choices: [
        { id: 'gate', label: 'Gate', next: 'end', ops: [{ op: 'set_flag', flag: 'route_gate', value: true }] },
        { id: 'tavern', label: 'Tavern', next: 'end', ops: [{ op: 'set_flag', flag: 'route_tavern', value: true }] }
      ]
    },
    { id: 'end', type: 'end', result: 'complete' }
  ]
};
mockFiles['data/campaigns/test/sequences/story/p1a.json'] = stubSequence('story_p1a', '1.1.a');
mockFiles['data/campaigns/test/sequences/story/p1b.json'] = stubSequence('story_p1b', '1.1.b');
mockFiles['data/campaigns/test/sequences/story/p2a.json'] = stubSequence('story_p2a', '1.2.a');
mockFiles['data/campaigns/test/sequences/story/p2b.json'] = stubSequence('story_p2b', '1.2.b');
mockFiles['data/campaigns/test/sequences/story/p3.json'] = stubSequence('story_p3', '1.3.a');

const sandbox = {
  window: { CJS: { FarmingMode: { normalizeFarm: (farm) => farm } } },
  document: { addEventListener: () => {}, removeEventListener: () => {}, createElement: () => ({}) },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
  fetch: async (url) => {
    const key = String(url || '').replace(/\\/g, '/');
    const value = mockFiles[key];
    if (!value) return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
    return { ok: true, status: 200, statusText: 'OK', json: async () => JSON.parse(JSON.stringify(value)) };
  },
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  performance: { now: () => Date.now() },
  Math, Object, Array, String, Number, Boolean, JSON, Map, Set, Date, RegExp,
  Error, Promise, Symbol, Proxy, Reflect, parseInt, parseFloat, isNaN, isFinite, Infinity, NaN
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
  'campaign/campaign-sequence-runner.js'
];
for (const file of loadOrder) {
  const code = loadEngineSource(file);
  vm.runInContext(code, sandbox);
}

const CJS = sandbox.window.CJS;

let passed = 0;
let failed = 0;
function assert(label, cond) {
  if (cond) { passed += 1; console.log(`  OK  ${label}`); }
  else { failed += 1; console.error(`  FAIL ${label}`); }
}
function assertEq(label, a, b) {
  const ok = a === b;
  assert(`${label} (${JSON.stringify(a)})`, ok);
  if (!ok) console.error(`       expected ${JSON.stringify(b)}`);
}

function buildState() {
  return {
    saveVersion: 1,
    saveId: 'branch_test',
    slotName: 'Branch Test',
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
  console.log('Story branching regression tests');

  // Path A: take the gate route end-to-end
  CJS.CampaignState.setState(buildState(), { source: 'test', type: 'replace' });
  await CJS.CampaignSequences.loadWorld('test');

  let tree = CJS.CampaignSequences.chapterTree('test', CJS.CampaignState.getState());
  assertEq('chapter tree has one trunk root', tree.roots.length, 1);
  assertEq('trunk root is 1.1', tree.roots[0].partLabel, '1.1');
  assertEq('trunk has two direct branches', tree.roots[0].children.length, 2);
  const branchLabels = tree.roots[0].children.map((c) => c.partLabel).sort().join(',');
  assertEq('trunk branches are 1.1.a and 1.1.b', branchLabels, '1.1.a,1.1.b');

  // Initial eligibility: 1.1.a needs route_gate flag, 1.1.b needs route_tavern
  const initialP1a = CJS.CampaignSequences.entryEligible('story_p1a');
  assert('1.1.a is locked before route flag is set', !initialP1a.eligible);
  assert('1.1.a reports missing requiresFlags reason',
    initialP1a.reasons.some((r) => r.includes('route_gate')));

  // Play 1.1, choose gate
  await CJS.CampaignSequences.start('story_p1', { world: 'test' });
  await CJS.CampaignSequences.advance('next'); // narration -> choice
  await CJS.CampaignSequences.advance('choice', 'gate');
  await CJS.CampaignSequences.complete('played');
  let state = CJS.CampaignState.getState();
  assert('gate flag is set after playing 1.1 with gate choice', !!state.flags.route_gate);
  assert('tavern flag is NOT set', !state.flags.route_tavern);

  const afterGateP1a = CJS.CampaignSequences.entryEligible('story_p1a');
  assert('1.1.a is unlocked after gate choice', afterGateP1a.eligible);
  const afterGateP1b = CJS.CampaignSequences.entryEligible('story_p1b');
  assert('1.1.b remains locked after gate choice', !afterGateP1b.eligible);

  // Play 1.1.a then 1.2.a, then verify 1.3.a is unlocked via requiresAnyStoryParts
  await CJS.CampaignSequences.start('story_p1a', { world: 'test' });
  await CJS.CampaignSequences.complete('played');
  await CJS.CampaignSequences.start('story_p2a', { world: 'test' });
  await CJS.CampaignSequences.complete('played');

  const afterP2aP3 = CJS.CampaignSequences.entryEligible('story_p3');
  assert('1.3.a is unlocked after 1.2.a (any-of A or B)', afterP2aP3.eligible);

  // The route choices list should reflect the gate route
  const route = CJS.CampaignSequences.currentRouteChoices(CJS.CampaignState.getState(), 'test');
  assert('current route has 3 played entries', route.length === 3);
  assertEq('first route entry is 1.1', route[0].partLabel, '1.1');
  assertEq('second route entry is 1.1.a', route[1].partLabel, '1.1.a');
  assertEq('third route entry is 1.2.a', route[2].partLabel, '1.2.a');

  // The 1.3.a node should appear under both 1.2.a and 1.2.b in the tree
  tree = CJS.CampaignSequences.chapterTree('test', CJS.CampaignState.getState());
  const p2a = tree.byPartId.p2a;
  const p2b = tree.byPartId.p2b;
  assert('1.3.a is a child of 1.2.a', p2a.children.some((c) => c.partLabel === '1.3.a'));
  assert('1.3.a is also a child of 1.2.b (convergence)', p2b.children.some((c) => c.partLabel === '1.3.a'));

  // Path B: starting fresh, choosing tavern unlocks 1.1.b instead
  CJS.CampaignState.setState(buildState(), { source: 'test', type: 'replace' });
  await CJS.CampaignSequences.start('story_p1', { world: 'test' });
  await CJS.CampaignSequences.advance('next');
  await CJS.CampaignSequences.advance('choice', 'tavern');
  await CJS.CampaignSequences.complete('played');
  state = CJS.CampaignState.getState();
  assert('tavern flag is set after tavern choice', !!state.flags.route_tavern);

  const tavernP1a = CJS.CampaignSequences.entryEligible('story_p1a');
  const tavernP1b = CJS.CampaignSequences.entryEligible('story_p1b');
  assert('1.1.a stays locked on the tavern path', !tavernP1a.eligible);
  assert('1.1.b unlocks on the tavern path', tavernP1b.eligible);

  console.log(`\nRESULTS: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
