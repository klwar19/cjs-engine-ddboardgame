// Regression tests for choice consequence alignment, potential branch checks,
// and sequence choice recording.
// Run: node test_campaign_choice_consequences.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadEngineSource } = require('./tools/test/engine-source.cjs');

const mockFiles = {
  'data/campaigns/test/sequences/_sequence_index.json': {
    id: 'test_sequence_index',
    world: 'test',
    entries: [
      {
        id: 'story_start',
        scope: 'story',
        orderKey: '1.1',
        partId: 'start',
        partLabel: '1.1',
        title: 'First Choice',
        file: 'story/start.json'
      },
      {
        id: 'story_mercy_followup',
        scope: 'story',
        orderKey: '1.2.a',
        partId: 'mercy_followup',
        partLabel: '1.2.a',
        title: 'Mercy Followup',
        file: 'story/mercy.json',
        conditions: { alignmentMin: { mercy: 1 } }
      },
      {
        id: 'story_deep_mercy',
        scope: 'story',
        orderKey: '1.2.b',
        partId: 'deep_mercy',
        partLabel: '1.2.b',
        title: 'Deep Mercy',
        file: 'story/deep_mercy.json',
        conditions: { alignmentMin: { mercy: 2 } }
      },
      {
        id: 'story_future',
        scope: 'story',
        orderKey: '1.3',
        partId: 'future',
        partLabel: '1.3',
        title: 'Future Duty',
        file: 'story/future.json'
      },
      {
        id: 'story_potential_gate',
        scope: 'story',
        orderKey: '1.4',
        partId: 'potential_gate',
        partLabel: '1.4',
        title: 'Potential Gate',
        file: 'story/potential.json',
        conditions: { potentialAlignmentMin: { duty: 1 } }
      }
    ]
  },
  'data/campaigns/test/sequences/story/start.json': {
    id: 'story_start',
    scope: 'story',
    title: 'First Choice',
    orderKey: '1.1',
    partId: 'start',
    partLabel: '1.1',
    startNode: 'open',
    nodes: [
      { id: 'open', type: 'narration', text: 'A stranger asks for help.', next: 'choice' },
      {
        id: 'choice',
        type: 'choice',
        prompt: 'How does Bin answer?',
        defaultChoiceId: 'rescue',
        choices: [
          {
            id: 'rescue',
            label: 'Help them',
            next: 'end',
            alignment: { mercy: 1, duty: 1 },
            futureHooks: [{ id: 'guard_trust', label: 'Guard Trust', summary: 'A guard remembers Bin helped.' }],
            npcReactions: [{ npcId: 'old_guard', summary: 'Warm welcome later.' }]
          },
          {
            id: 'walk',
            label: 'Keep moving',
            next: 'end',
            alignment: { resolve: 1, mercy: -1 }
          }
        ]
      },
      { id: 'end', type: 'end', result: 'complete' }
    ]
  },
  'data/campaigns/test/sequences/story/future.json': {
    id: 'story_future',
    scope: 'story',
    title: 'Future Duty',
    orderKey: '1.3',
    partId: 'future',
    partLabel: '1.3',
    startNode: 'choice',
    nodes: [
      {
        id: 'choice',
        type: 'choice',
        prompt: 'What does Bin do next?',
        choices: [
          { id: 'report', label: 'Report the danger', next: 'end', alignment: { duty: 1 } },
          { id: 'joke', label: 'Make light of it', next: 'end', alignment: { wit: 1 } }
        ]
      },
      { id: 'end', type: 'end', result: 'complete' }
    ]
  },
  'data/campaigns/test/sequences/story/mercy.json': {
    id: 'story_mercy_followup',
    scope: 'story',
    startNode: 'end',
    nodes: [{ id: 'end', type: 'end', result: 'complete' }]
  },
  'data/campaigns/test/sequences/story/deep_mercy.json': {
    id: 'story_deep_mercy',
    scope: 'story',
    startNode: 'end',
    nodes: [{ id: 'end', type: 'end', result: 'complete' }]
  },
  'data/campaigns/test/sequences/story/potential.json': {
    id: 'story_potential_gate',
    scope: 'story',
    startNode: 'end',
    nodes: [{ id: 'end', type: 'end', result: 'complete' }]
  }
};

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
  'campaign/campaign-alignment.js',
  'campaign/campaign-state.js',
  'campaign/campaign-conditions.js',
  'campaign/campaign-ops.js',
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
function assertEq(label, actual, expected) {
  const ok = actual === expected;
  assert(`${label} (${JSON.stringify(actual)})`, ok);
  if (!ok) console.error(`       expected ${JSON.stringify(expected)}`);
}

function buildState() {
  return {
    saveVersion: 1,
    saveId: 'choice_consequence_test',
    slotName: 'Choice Consequence Test',
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
    storyMode: { completedParts: {}, defaultedParts: {}, revealedChapters: {}, partResults: {}, manualSummaryEntries: [] },
    sequenceRuntime: { active: null, history: [] },
    eventLog: { entries: [] },
    pinnedNotes: [],
    log: [],
    settings: {}
  };
}

(async () => {
  console.log('Choice consequence regression tests');

  CJS.CampaignState.setState(buildState(), { source: 'test', type: 'replace' });
  await CJS.CampaignSequences.loadWorld('test');
  await CJS.CampaignSequences.loadSequence('story_future', 'test');

  let state = CJS.CampaignState.getState();
  let snap = CJS.CampaignAlignment.snapshot(state, { world: 'test' });
  assert('future choice contributes reachable duty potential', snap.range.duty.max >= 1);
  assert('potential-gated branch is eligible before duty is earned', CJS.CampaignSequences.entryEligible('story_potential_gate').eligible);

  const lockedChoice = CJS.CampaignAlignment.choiceEligibility(
    { id: 'locked', label: 'Mercy answer', conditions: { alignmentMin: { mercy: 1 } } },
    { id: 'choice', type: 'choice' },
    state
  );
  assert('choice requiring mercy is locked at neutral', !lockedChoice.ok);

  await CJS.CampaignSequences.start('story_start', { world: 'test' });
  await CJS.CampaignSequences.advance('next');
  const result = await CJS.CampaignSequences.advance('choice', 'rescue');
  assert('rescue choice advances', result.ok);

  state = CJS.CampaignState.getState();
  snap = CJS.CampaignAlignment.snapshot(state, { world: 'test' });
  assertEq('mercy increased from rescue choice', snap.axes.mercy, 1);
  assertEq('duty increased from rescue choice', snap.axes.duty, 1);
  assert('choice history stores rescue label', snap.recent.some((entry) => entry.label === 'Help them'));
  assert('NPC reaction queued', snap.reactionQueue.some((entry) => entry.npcId === 'old_guard'));
  assert('future hook queued', snap.futureHooks.some((entry) => entry.id === 'guard_trust'));

  assert('mercy followup unlocks after rescue', CJS.CampaignSequences.entryEligible('story_mercy_followup').eligible);
  assert('deeper mercy branch remains locked', !CJS.CampaignSequences.entryEligible('story_deep_mercy').eligible);

  const metChoice = CJS.CampaignAlignment.choiceEligibility(
    { id: 'met', label: 'Mercy answer', conditions: { alignmentMin: { mercy: 1 } } },
    { id: 'choice', type: 'choice' },
    CJS.CampaignState.getState()
  );
  assert('choice requiring mercy unlocks after rescue', metChoice.ok);

  console.log(`\nRESULTS: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
