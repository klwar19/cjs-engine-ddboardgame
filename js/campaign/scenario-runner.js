// scenario-runner.js
// Starts, moves, ends, and reports campaign scenario runs.

window.CJS = window.CJS || {};

window.CJS.ScenarioRunner = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const Ops = () => window.CJS.CampaignOps;
  const SURPRISE_BASE_CHANCE = 0.32;
  const SURPRISE_REVISIT_CHANCE = 0.1;
  const SURPRISE_REVISIT_DECAY = 0.72;
  const SURPRISE_HISTORY_LIMIT = 40;
  const RANK_ORDER = { F: 1, E: 2, D: 3, C: 4, B: 5, A: 6, S: 7, SS: 8 };
  const DEFAULT_SURPRISE_PROFILE = {
    name: 'Wild Route',
    weights: { battle: 2, event: 3, item: 2, stat: 1, rumor: 1, interaction: 2, branch: 1 },
    events: [
      'The route shifts enough to demand a fresh choice.',
      'A small obstacle asks for care before anyone can move on.',
      'A clue appears where the party did not expect one.'
    ],
    rumors: [
      'Travelers disagree about what waits beyond the next landmark.',
      'Someone marked this way before, then scratched the mark out.',
      'A repeated local warning suddenly makes more sense here.'
    ],
    interactions: [
      'A quiet moment gives one party member room to speak up.',
      'A stranger, signal, or old note invites a cautious answer.',
      'The party can press forward, wait, or inspect the place.'
    ],
    branches: [
      'A side path opens just off the known route.',
      'A shortcut can be mapped if the party takes a risk.',
      'The terrain reveals one more reachable lead.'
    ],
    itemHints: ['useful salvage', 'travel supplies', 'a small cache'],
    statHints: ['momentum', 'focus', 'weariness'],
    battleTags: ['roamer', 'ambush']
  };
  const AREA_SURPRISE_PROFILES = {
    outdoor: {
      aliases: ['outdoor', 'field', 'road', 'route', 'snow', 'tundra', 'trail'],
      weights: { battle: 2, event: 3, item: 2, stat: 1, rumor: 1, interaction: 2, branch: 2 },
      events: ['Wind covers tracks and exposes fresher ones.', 'A landmark looks wrong from this angle.', 'Weather forces a detour before the next step.'],
      rumors: ['Road talk says a patrol has gone missing nearby.', 'A campfire tale names a hidden cache along this route.'],
      interactions: ['A distant signal asks whether to answer or hide.', 'The party spots a traveler before the traveler spots them.'],
      branches: ['A deer track becomes a usable side trail.', 'A half-buried marker points toward a lesser route.'],
      itemHints: ['field herbs', 'lost travel gear', 'usable firewood'],
      statHints: ['endurance', 'alertness'],
      battleTags: ['beast', 'raider', 'patrol']
    },
    forest: {
      aliases: ['forest', 'wood', 'woods', 'grove', 'thicket'],
      weights: { battle: 3, event: 3, item: 2, stat: 1, rumor: 1, interaction: 2, branch: 2 },
      events: ['Branches bend back as if something just passed.', 'The undergrowth hides a choice of route.', 'Old claw marks point toward a living lair.'],
      rumors: ['Hunters whisper about lights between the trunks.', 'A missing forager left marks only locals would notice.'],
      interactions: ['A hidden watcher tests whether the party is hostile.', 'Birdsong stops, leaving one careful opening.'],
      branches: ['A root tunnel bypasses the obvious path.', 'A marked trunk reveals an old hunting trail.'],
      itemHints: ['foraged herbs', 'fallen arrows', 'animal sign'],
      statHints: ['stealth', 'tracking'],
      battleTags: ['beast', 'sprite', 'ambush']
    },
    dungeon: {
      aliases: ['dungeon', 'crypt', 'vault', 'floor', 'labyrinth'],
      weights: { battle: 4, event: 3, item: 1, stat: 1, rumor: 1, interaction: 2, branch: 2 },
      events: ['A pressure seam clicks under the next step.', 'An old door answers to sound, light, or blood.', 'The corridor repeats, then breaks its pattern.'],
      rumors: ['Previous delvers left a warning in shorthand.', 'A map note claims one wall is newer than the rest.'],
      interactions: ['A sealed alcove invites a careful touch.', 'Something speaks through the stonework for one breath.'],
      branches: ['A false wall opens into a narrow side room.', 'A stairwell landing reveals a second route.'],
      itemHints: ['old coins', 'torch stubs', 'lock scraps'],
      statHints: ['nerve', 'focus'],
      battleTags: ['undead', 'construct', 'lurker']
    },
    cave: {
      aliases: ['cave', 'hollow', 'den', 'cellar', 'underground', 'tunnel'],
      weights: { battle: 3, event: 3, item: 2, stat: 1, rumor: 1, interaction: 1, branch: 2 },
      events: ['Loose stone turns a simple step into a choice.', 'Echoes make the party sound outnumbered.', 'A cold draft hints at a chamber beyond the wall.'],
      rumors: ['Miners say the lower air carries voices.', 'A clawed thing avoids one part of the cave.'],
      interactions: ['A trapped pack has not been here long.', 'A glimmer deeper in the rock asks for a risk.'],
      branches: ['A crawlspace opens behind broken stone.', 'A ledge route becomes visible from this angle.'],
      itemHints: ['ore flakes', 'dropped rope', 'mushrooms'],
      statHints: ['balance', 'resolve'],
      battleTags: ['beast', 'underground', 'ambush']
    },
    sewer: {
      aliases: ['sewer', 'drain', 'canal', 'waterway', 'culvert'],
      weights: { battle: 3, event: 3, item: 1, stat: 2, rumor: 1, interaction: 2, branch: 2 },
      events: ['Water level changes and reveals a new route marker.', 'A grate rattles from the wrong side.', 'A bad smell means danger, medicine, or both.'],
      rumors: ['Someone has been using the drains as a message route.', 'A maintenance mark warns against the clean-looking tunnel.'],
      interactions: ['A half-submerged bundle may be bait.', 'Voices carry through the pipework before bodies appear.'],
      branches: ['A sluice gate can open a side channel.', 'A dry service crawl loops behind the main drain.'],
      itemHints: ['salvaged tools', 'sealed bottle', 'lost coin pouch'],
      statHints: ['grit', 'sickness'],
      battleTags: ['rat', 'undead', 'crawler']
    },
    ruins: {
      aliases: ['ruins', 'relic', 'pillar', 'fallen', 'old shrine'],
      weights: { battle: 3, event: 4, item: 2, stat: 1, rumor: 2, interaction: 2, branch: 2 },
      events: ['A broken inscription changes meaning in the light.', 'Old magic stirs when the party crosses the threshold.', 'A collapsed room preserves one intact clue.'],
      rumors: ['Collectors would pay for proof this place is older than claimed.', 'The locals avoid naming who built the ruin.'],
      interactions: ['An echo of the old owners offers a bargain.', 'A carved face watches the party choose.'],
      branches: ['A cracked plinth reveals a lower chamber.', 'A fallen arch can be crossed to a hidden court.'],
      itemHints: ['relic shard', 'ancient coin', 'ritual chalk'],
      statHints: ['insight', 'awe'],
      battleTags: ['undead', 'sprite', 'guardian']
    },
    temple: {
      aliases: ['temple', 'shrine', 'chapel', 'holy', 'bell'],
      weights: { battle: 2, event: 4, item: 2, stat: 1, rumor: 2, interaction: 3, branch: 2 },
      events: ['A bell, flame, or prayer bowl reacts to the party.', 'A forbidden side hall opens after a respectful pause.', 'A sacred rule becomes a practical problem.'],
      rumors: ['A caretaker hid a confession in the temple route.', 'Pilgrims say the bell answers honest fear.'],
      interactions: ['A vow, offering, or apology can change the room.', 'A quiet presence waits for a clear answer.'],
      branches: ['A reliquary passage opens behind the altar.', 'A prayer path bends away from the main hall.'],
      itemHints: ['votive charm', 'clean bandages', 'incense ash'],
      statHints: ['faith', 'clarity'],
      battleTags: ['spirit', 'guardian', 'cultist']
    },
    urban: {
      aliases: ['urban', 'town', 'city', 'street', 'guild', 'market', 'alley'],
      weights: { battle: 2, event: 3, item: 2, stat: 1, rumor: 3, interaction: 3, branch: 1 },
      events: ['A crowd blocks the direct way and hides a better one.', 'A public argument exposes private information.', 'A patrol changes the timing of the route.'],
      rumors: ['Market gossip turns into a specific name and place.', 'A guild errand overlaps the party route.'],
      interactions: ['A local recognizes someone in the party.', 'A messenger tries to hand off the wrong note.'],
      branches: ['A service alley avoids the watched street.', 'A rooftop or back stair creates a shortcut.'],
      itemHints: ['dropped purse', 'market scrap', 'borrowed tool'],
      statHints: ['reputation', 'composure'],
      battleTags: ['bandit', 'guard', 'rival']
    },
    house: {
      aliases: ['house', 'manor', 'hut', 'room', 'kitchen', 'cellar'],
      weights: { battle: 2, event: 4, item: 3, stat: 1, rumor: 2, interaction: 3, branch: 2 },
      events: ['A floorboard gives away a secret compartment.', 'A domestic detail contradicts the official story.', 'A door opens into a room that should not fit.'],
      rumors: ['A family secret is stored in plain sight.', 'The neighbors heard movement after the house went dark.'],
      interactions: ['A portrait, letter, or keepsake invites a hard choice.', 'Someone inside is hiding, trapped, or pretending.'],
      branches: ['A dumbwaiter shaft links two rooms.', 'A pantry hatch opens into a cellar route.'],
      itemHints: ['house key', 'warm meal', 'keepsake'],
      statHints: ['comfort', 'suspicion'],
      battleTags: ['intruder', 'vermin', 'haunt']
    },
    tavern: {
      aliases: ['tavern', 'inn', 'bar', 'mug', 'pantry'],
      weights: { battle: 2, event: 3, item: 2, stat: 1, rumor: 4, interaction: 4, branch: 1 },
      events: ['A toast goes quiet at the wrong name.', 'A game of chance becomes a useful lead.', 'A cellar noise interrupts the room.'],
      rumors: ['Tonight every table tells a different version of the same story.', 'A regular knows who bought supplies in secret.'],
      interactions: ['A patron offers help with a price attached.', 'The keeper asks the party to settle something quietly.'],
      branches: ['A back stair reaches the upper room unseen.', 'The cellar door is open when it should be locked.'],
      itemHints: ['leftover meal', 'marked card', 'bottle with a note'],
      statHints: ['morale', 'gossip'],
      battleTags: ['brawler', 'rat', 'rival']
    },
    castle: {
      aliases: ['castle', 'keep', 'bailey', 'tower', 'fort'],
      weights: { battle: 3, event: 3, item: 1, stat: 1, rumor: 2, interaction: 3, branch: 2 },
      events: ['A guard routine creates one precise opening.', 'Old defenses still remember how to close.', 'A banner or crest points to buried politics.'],
      rumors: ['A loyalist still moves through the keep at night.', 'The tower records name a prisoner no one admits existed.'],
      interactions: ['A sentry can be bluffed, bribed, or bypassed.', 'A courtly custom becomes a tactical lever.'],
      branches: ['A servant stair loops around the guarded hall.', 'A broken wall gives access to the battlement.'],
      itemHints: ['guard token', 'oil flask', 'old ration'],
      statHints: ['discipline', 'pressure'],
      battleTags: ['guard', 'soldier', 'rival']
    },
    mountain: {
      aliases: ['mountain', 'ridge', 'summit', 'slope', 'peak'],
      weights: { battle: 3, event: 4, item: 1, stat: 2, rumor: 1, interaction: 1, branch: 2 },
      events: ['A sudden drop makes the party choose speed or safety.', 'Thin air turns a simple climb into a test.', 'Falling ice exposes something buried.'],
      rumors: ['Climbers mark one route as cursed and another as worse.', 'A high cave is said to hold an old camp intact.'],
      interactions: ['A distant cry could be a victim or a lure.', 'A signal fire needs answering before weather closes in.'],
      branches: ['A goat path cuts across the ridge.', 'A snow shelf hides a sheltered traverse.'],
      itemHints: ['climbing spike', 'cold herbs', 'broken pack'],
      statHints: ['endurance', 'altitude'],
      battleTags: ['beast', 'yeti', 'raider']
    },
    arena: {
      aliases: ['arena', 'training', 'spar', 'pit', 'trial'],
      weights: { battle: 4, event: 2, item: 1, stat: 2, rumor: 1, interaction: 3, branch: 1 },
      events: ['The rules change just as the party understands them.', 'A trainer offers a side wager with consequences.', 'The arena floor reveals a hazard pattern.'],
      rumors: ['A champion has a weakness no announcer says aloud.', 'Someone is fixing the brackets from below.'],
      interactions: ['A rival demands a public answer.', 'A sponsor offers help, loudly enough to cause trouble.'],
      branches: ['A service tunnel reaches the preparation rooms.', 'A judges path opens after the crowd shifts.'],
      itemHints: ['training token', 'bandage roll', 'weapon oil'],
      statHints: ['confidence', 'strain'],
      battleTags: ['rival', 'beast', 'champion']
    }
  };

  function startScenario(scenarioId, options = {}) {
    const content = CS().getContent();
    const scenario = CS().getScenarioById(scenarioId);
    if (!scenario) throw new Error(`Scenario not found: ${scenarioId}`);
    if (CS().getState()?.activeScenarioRun) {
      Ops().apply({ op: 'log', text: `Scenario already active: ${CS().getState().activeScenarioRun.scenarioId}.` }, { source: 'scenario' });
      return CS().getState().activeScenarioRun;
    }
    const travelMode = scenario.travelMode || (scenario.mapId ? 'node_map' : 'freeform');

    let map = null;
    let proceduralMap = null;
    let mapId = null;

    if (travelMode === 'node_map' || travelMode === 'grid_map') {
      map = CS().getScenarioMapById(scenario.mapId);
      mapId = scenario.mapId;
    } else if (travelMode === 'procedural') {
      proceduralMap = expandProceduralMap(scenario);
      map = proceduralMap;
      mapId = proceduralMap?.id || `proc_${scenarioId}`;
    }

    const startNode = travelMode === 'node_map' || travelMode === 'procedural'
      ? (scenario.startNode || map?.defaultStartNode || map?.nodes?.[0]?.id || null)
      : null;
    const startLevelId = travelMode === 'grid_map'
      ? _defaultGridLevelId(map, scenario.startLevelId || scenario.mapLayer || scenario.levelId)
      : null;
    const startCell = travelMode === 'grid_map'
      ? _normalizeCell(scenario.startCell || _gridLevelDefaultStartCell(map, startLevelId) || map?.defaultStartCell || map?.startCell || [0, 0])
      : null;
    const objective = _normalizeObjective(scenario, map, {
      travelMode,
      startNode,
      startCell,
      levelId: startLevelId
    });
    const movingThreats = _normalizeMovingThreats(scenario, map, {
      travelMode,
      startLevelId,
      startCell
    });
    const entrySnapshot = _snapshotForReport(CS().getState());

    CS().mutate((state) => {
      const runId = `run_${Date.now()}`;
      const revealed = _defaultRevealedNodes(map, startNode);
      const revealedCells = _defaultRevealedCells(map, startCell, startLevelId);
      const startCellKey = startCell ? _cellKey(startCell.x, startCell.y, startLevelId, map) : null;
      state.activeScenarioRun = {
        runId,
        scenarioId,
        travelMode,
        mapId,
        proceduralMap,
        currentNode: startNode,
        currentCell: startCell,
        mapLayer: travelMode === 'grid_map' ? startLevelId : _defaultMapLayer(map, startNode),
        currentBeatIndex: travelMode === 'linear' ? 0 : null,
        completedBeats: [],
        startedAtPhase: state.phase.number || 1,
        danger: scenario.danger?.start || 0,
        dangerMax: scenario.danger?.max || 10,
        limits: { ...(scenario.limits || {}) },
        usedCampRests: 0,
        eventsUsed: 0,
        randomBattlesUsed: 0,
        visitedNodes: startNode ? [startNode] : [],
        revealedNodes: revealed,
        visitedCells: startCellKey ? [startCellKey] : [],
        revealedCells,
        completedBattles: [],
        entrySnapshot,
        travelSteps: 0,
        revisitCounts: {},
        surpriseHistory: [],
        notes: [],
        objectiveState: objective,
        movingThreats,
        progressTriggerState: {},
        // Generated and user-built quests run in "quick narrative" mode:
        // a single begin/end narrative box instead of per-node VN scenes.
        // Authored special scenarios leave this falsy and keep the full VN.
        quickNarrative: scenario.quickNarrative === true,
        sequenceLink: options.sequenceLink || null
      };
      if (mapId) {
        const mapState = state.mapState[mapId] = state.mapState[mapId] || { visited: {}, revealed: {}, locked: {}, cleared: {}, notes: {} };
        for (const nodeId of revealed) mapState.revealed[nodeId] = true;
        if (startNode) mapState.visited[startNode] = true;
        mapState.revealedCells = mapState.revealedCells || {};
        mapState.visitedCells = mapState.visitedCells || {};
        for (const cellId of revealedCells) mapState.revealedCells[cellId] = true;
        if (startCellKey) mapState.visitedCells[startCellKey] = true;
      }
    }, { source: 'scenario_start' });

    applyAutomaticPartyAvailability(scenario);
    Ops().apply(scenario.entryOps || [], { source: 'scenario_entry' });
    Ops().apply({ op: 'log', text: `Scenario started: ${scenario.name || scenario.id} (${travelMode}).` }, { source: 'scenario' });
    _refreshObjectiveVisibility(CS().getState(), map, {
      levelId: startLevelId,
      explorationPercent: _explorationPercent(CS().getState()?.activeScenarioRun || {}, map)
    });
    window.CJS.CampaignPartyChat?.auto?.({ world: scenario.world || CS().getState()?.currentWorld, situation: 'scenario_start', scenarioId, tags: scenario.tags || [] }, { chance: 0.65 });
    const runState = CS().getState()?.activeScenarioRun;
    if (runState?.quickNarrative) {
      // Quick narrative quests show a single dialogue/narrative box at start
      // and at end instead of fullscreen VN scenes per node.
      _showQuestNarrative({
        phase: 'begin',
        title: scenario.name || scenario.id || 'Quest',
        text: _composeBeginNarrative(scenario, runState)
      });
    } else if (startNode && (travelMode === 'node_map' || travelMode === 'procedural')) {
      const activeMap = CS().getActiveMap() || map;
      const node = findNode(activeMap, startNode);
      if (node) {
        window.CJS.CampaignStoryScenes?.prepareNodeEntry?.(node, activeMap, {
          source: 'scenario_start',
          mapId: CS().getState()?.activeScenarioRun?.mapId || activeMap?.id
        });
      }
    }
    return CS().getState().activeScenarioRun;
  }

  function endScenario(outcome = 'success') {
    const state = CS().getState();
    const run = state?.activeScenarioRun;
    if (!run) return null;
    const scenario = CS().getScenarioById(run.scenarioId);
    const report = buildReport(state, outcome);
    const sequenceOutcome = outcome === 'manual'
      ? (run.objectiveState?.completed ? 'success' : 'abort')
      : outcome;
    const wasQuickNarrative = !!run.quickNarrative;
    const runSnapshot = { questTitle: run.questTitle, scenarioName: scenario?.name || run.scenarioId };

    CS().mutate((next) => {
      next.scenarioHistory.unshift(report);
      next.scenarioHistory = next.scenarioHistory.slice(0, 50);
      next.lastScenarioReport = report;
      next.activeScenarioRun = null;
      next.pendingBattle = null;
      _clearScenarioAvailability(next);
    }, { source: 'scenario_end' });

    Ops().apply(scenario?.exitOps || [], { source: 'scenario_exit' });
    Ops().apply({ op: 'log', text: `Scenario ended (${outcome}): ${scenario?.name || run.scenarioId}.` }, { source: 'scenario' });
    if (wasQuickNarrative) {
      _showQuestNarrative({
        phase: 'end',
        title: runSnapshot.questTitle || runSnapshot.scenarioName || 'Quest',
        text: _composeEndNarrative(outcome, scenario, report, runSnapshot)
      });
    }
    if (run.sequenceLink?.sequenceId) {
      void window.CJS.CampaignSequences?.resumeFromScenario?.(sequenceOutcome, {
        report,
        scenarioId: run.scenarioId,
        runId: run.runId
      });
    }
    return report;
  }

  // Quick narrative helpers. Generated/user-built quests use a single
  // begin and end narrative box rather than a fullscreen VN at every node.
  // The runner just composes the text; CampaignUI.showQuestNarrative owns
  // the actual DOM/modal (so this module stays headless and testable).
  function _showQuestNarrative(payload = {}) {
    try {
      window.CJS.CampaignUI?.showQuestNarrative?.(payload);
    } catch (err) {
      // Narrative is decorative — never let it break the run loop.
    }
  }

  function _composeBeginNarrative(scenario = {}, run = {}) {
    const parts = [];
    if (run.questTitle) parts.push(`Quest: ${run.questTitle}`);
    const summary = scenario?.notes || scenario?.summary || '';
    if (summary) parts.push(summary);
    if (scenario?.mapSetting && !summary) parts.push(`Setting: ${scenario.mapSetting}.`);
    const objectiveLabel = run.objectiveState?.label;
    if (objectiveLabel) parts.push(`Objective: ${objectiveLabel}.`);
    return parts.join('\n\n') || 'The quest begins.';
  }

  function _composeEndNarrative(outcome = 'success', scenario = {}, report = {}, snapshot = {}) {
    const verdict = String(outcome || 'success').toLowerCase();
    const heading = (verdict === 'success' || verdict === 'win' || verdict === 'victory')
      ? 'The quest is wrapped up.'
      : (verdict === 'manual' ? 'The run is over.' : 'The quest ends here.');
    const parts = [heading];
    if (snapshot?.questTitle) parts.push(`Quest: ${snapshot.questTitle}.`);
    const battles = report?.completedBattles?.length;
    if (battles) parts.push(`Battles fought: ${battles}.`);
    const visited = (report?.visitedNodes?.length || report?.visitedCells?.length || 0);
    if (visited) parts.push(`Places visited: ${visited}.`);
    return parts.join('\n\n');
  }

  function moveToNode(nodeId, link = null) {
    const state = CS().getState();
    const run = state?.activeScenarioRun;
    const map = CS().getActiveMap();
    if (!run || !map || !nodeId) return;
    const node = findNode(map, nodeId);
    if (!node) return;
    const current = findNode(map, run.currentNode);
    const travelLink = link || (current?.exits || []).find((exit) => exit.to === nodeId) || null;
    const canMove = nodeId === run.currentNode || !!travelLink || (run.visitedNodes || []).includes(nodeId);
    const alreadyVisited = (run.visitedNodes || []).includes(nodeId);
    if (!canMove) {
      Ops().apply({ op: 'log', text: `Move blocked: ${node.title || nodeId} is not connected to the current node.` }, { source: 'map_move' });
      return null;
    }

    const travelOps = [];
    if (travelLink?.dangerChange) travelOps.push({ op: 'danger', amount: travelLink.dangerChange });
    if (Array.isArray(travelLink?.onTravel)) travelOps.push(...travelLink.onTravel);
    if (travelLink?.check) {
      travelOps.push(_checkToOperation(travelLink.check));
    }
    if (travelOps.length) Ops().apply(travelOps, { source: 'map_travel' });

    const dxMove = Number(node.x) - Number(current?.x);
    const dyMove = Number(node.y) - Number(current?.y);
    const facing = Math.abs(dxMove) >= Math.abs(dyMove)
      ? (dxMove >= 0 ? 'right' : 'left')
      : (dyMove >= 0 ? 'down' : 'up');
    const moved = nodeId !== run.currentNode;
    Ops().apply({ op: 'goto_node', nodeId }, { source: 'map_move' });
    if (moved) {
      CS().mutate((next) => {
        const active = next.activeScenarioRun;
        if (!active) return;
        active.facing = (Number.isFinite(dxMove) || Number.isFinite(dyMove)) ? facing : (active.facing || 'down');
        active.playerMotionAt = Date.now();
      }, { source: 'map_move_motion' });
    }
    _revealNodeNeighborhood(map, nodeId);

    // In quick-narrative runs (generated + user-built quests), skip the
    // fullscreen VN flow at every node — the begin/end narrative boxes are
    // the whole story surface for these quests. Node onEnter ops, traps,
    // and random battles still run via the normal path below.
    const activeRun = CS().getState()?.activeScenarioRun;
    if (!activeRun?.quickNarrative
        && window.CJS.CampaignStoryScenes?.prepareNodeEntry?.(node, map, { source: 'node_enter' })) {
      return node;
    }

    if (Array.isArray(node.onEnter) && node.onEnter.length) {
      Ops().apply(node.onEnter, { source: 'node_enter' });
    }

    if (node.trap?.check) {
      CS().mutate((s) => { s.lastEvent = { type: 'trap', title: node.trap.title || node.title, prompt: node.trap.prompt || '', suggested: [_checkToOperation(node.trap.check)] }; }, { source: 'trap' });
    }

    if (node.randomBattle) {
      maybeTriggerRandomBattle(node.randomBattle);
    }

    _maybeTravelSurprise({
      mode: run.travelMode,
      map,
      location: node,
      locationKey: nodeId,
      repeated: alreadyVisited,
      travelLink
    });

    const scenarioForChat = CS().getActiveScenario();
    window.CJS.CampaignPartyChat?.auto?.({
      world: scenarioForChat?.world || CS().getState()?.currentWorld,
      situation: 'scenario',
      scenarioId: run.scenarioId,
      mapId: run.mapId,
      locationKind: node.kind || '',
      tags: [...(node.tags || []), ...(scenarioForChat?.tags || [])]
    }, { chance: 0.3 });

    handleLocationEntry('node', node, { map, run, nodeId });
    return node;
  }

  function moveToCell(x, y) {
    const state = CS().getState();
    const run = state?.activeScenarioRun;
    const map = CS().getActiveMap();
    if (!run || !map || run.travelMode !== 'grid_map') return null;
    const activeLevelId = _defaultGridLevelId(map, run.mapLayer);
    const previousLevelId = activeLevelId;
    let target = _gridCell(map, x, y, activeLevelId);
    if (!target || !_cellPassable(map, target.x, target.y)) return null;
    const current = run.currentCell || _normalizeCell(map.defaultStartCell || [0, 0]);
    const distance = Math.abs(Number(target.x) - Number(current.x)) + Math.abs(Number(target.y) - Number(current.y));
    let targetKey = _cellKey(target.x, target.y, activeLevelId, map);
    const alreadyVisited = (run.visitedCells || []).includes(targetKey);
    if (distance > 1 && !alreadyVisited) {
      Ops().apply({ op: 'log', text: `Move blocked: ${target.title || targetKey} is too far from the current cell.` }, { source: 'grid_move' });
      return null;
    }

    const dxMove = Number(target.x) - Number(current.x);
    const dyMove = Number(target.y) - Number(current.y);
    const facing = Math.abs(dxMove) >= Math.abs(dyMove)
      ? (dxMove >= 0 ? 'right' : 'left')
      : (dyMove >= 0 ? 'down' : 'up');

    CS().mutate((next) => {
      const active = next.activeScenarioRun;
      if (!active) return;
      active.currentCell = { x: Number(target.x), y: Number(target.y) };
      active.facing = (dxMove === 0 && dyMove === 0) ? (active.facing || 'down') : facing;
      if (dxMove !== 0 || dyMove !== 0) active.playerMotionAt = Date.now();
      active.visitedCells = active.visitedCells || [];
      active.revealedCells = active.revealedCells || [];
      if (!active.visitedCells.includes(targetKey)) active.visitedCells.push(targetKey);
      if (!active.revealedCells.includes(targetKey)) active.revealedCells.push(targetKey);
      const mapState = next.mapState[active.mapId || map.id] = next.mapState[active.mapId || map.id] || { visited: {}, revealed: {}, locked: {}, cleared: {}, notes: {} };
      mapState.visitedCells = mapState.visitedCells || {};
      mapState.revealedCells = mapState.revealedCells || {};
      mapState.visitedCells[targetKey] = true;
      mapState.revealedCells[targetKey] = true;
    }, { source: 'grid_move' });

    _revealCellNeighborhood(map, target.x, target.y, activeLevelId);
    const threatPending = _stepMovingThreats(map, target, targetKey);

    if (Array.isArray(target.onEnter) && target.onEnter.length) {
      Ops().apply(target.onEnter, { source: 'grid_cell_enter' });
    }
    if (!threatPending && target.randomBattle) {
      maybeTriggerRandomBattle(target.randomBattle);
    }
    if (!threatPending) {
      _maybeTravelSurprise({
        mode: 'grid_map',
        map,
        location: target,
        locationKey: targetKey,
        repeated: alreadyVisited
      });
    }
    const scenario = CS().getActiveScenario();
    window.CJS.CampaignPartyChat?.auto?.({
      world: scenario?.world || state.currentWorld,
      situation: 'scenario',
      scenarioId: run.scenarioId,
      mapId: run.mapId,
      locationKind: target.kind || _terrainAt(map, target.x, target.y),
      tags: target.tags || []
    }, { chance: 0.28 });
    let enteredLevelId = null;
    if (target.nextLevelId) {
      const arrival = _transitionGridLevel(map, target);
      if (arrival) {
        target = arrival;
        targetKey = _cellKey(arrival.x, arrival.y, arrival.levelId, map);
        enteredLevelId = arrival.levelId || null;
        if (Array.isArray(arrival.onEnter) && arrival.onEnter.length) {
          Ops().apply(arrival.onEnter, { source: 'grid_level_arrival' });
        }
        if (arrival.randomBattle) {
          maybeTriggerRandomBattle(arrival.randomBattle);
        }
      }
    }
    const activeRun = CS().getState()?.activeScenarioRun || run;
    const explorationPercent = _explorationPercent(activeRun || {}, map);
    if (enteredLevelId) {
      _refreshObjectiveVisibility(CS().getState(), map, {
        levelId: enteredLevelId,
        explorationPercent
      });
      _runProgressTriggers({
        type: 'enter_layer',
        state: CS().getState(),
        run: activeRun,
        scenario,
        map,
        location: target,
        levelId: enteredLevelId,
        previousLevelId,
        explorationPercent
      });
    }
    handleLocationEntry('cell', target, { map, run: CS().getState()?.activeScenarioRun || run, cellKey: targetKey });
    return target;
  }

  function currentObjective(state = CS().getState()) {
    return state?.activeScenarioRun?.objectiveState || null;
  }

  function objectiveForNode(nodeId, state = CS().getState(), map = CS().getActiveMap()) {
    const objective = currentObjective(state);
    if (!objective || objective.marker === false || (!objective.visible && !objective.completed) || !nodeId) return null;
    return objective.nodeId === nodeId ? objective : null;
  }

  function objectiveForCell(cell = {}, state = CS().getState(), map = CS().getActiveMap()) {
    const objective = currentObjective(state);
    const run = state?.activeScenarioRun;
    if (!objective || objective.marker === false || (!objective.visible && !objective.completed) || !cell || !run) return null;
    const key = _cellKey(cell.x, cell.y, cell.levelId || run.mapLayer, map);
    return objective.cellKey === key ? objective : null;
  }

  function handleLocationEntry(kind, location, meta = {}) {
    const state = CS().getState();
    const run = state?.activeScenarioRun;
    const scenario = CS().getActiveScenario();
    const map = meta.map || CS().getActiveMap();
    if (!run || !scenario || !location) return null;

    const explorationPercent = _explorationPercent(run, map);
    _refreshObjectiveVisibility(state, map, {
      explorationPercent,
      levelId: kind === 'cell' ? (location.levelId || run.mapLayer) : run.mapLayer,
      location,
      type: kind
    });
    let objectiveCompleted = false;
    if (_objectiveLocationMatch(run.objectiveState, kind, location, map, run)) {
      if (!_objectiveNeedsBattle(run.objectiveState)) {
        objectiveCompleted = _markObjectiveComplete(location.title || location.id || meta.cellKey || 'objective');
      }
    }

    const context = {
      type: kind === 'node' ? 'enter_node' : 'enter_cell',
      state,
      run,
      scenario,
      map,
      location,
      nodeId: meta.nodeId || (kind === 'node' ? location.id : null),
      cellKey: meta.cellKey || (kind === 'cell' ? _cellKey(location.x, location.y, location.levelId || run.mapLayer, map) : null),
      explorationPercent
    };
    _runProgressTriggers(context);
    if (objectiveCompleted) {
      _runProgressTriggers({
        ...context,
        type: 'objective_completed',
        objective: currentObjective()
      });
    }
    return {
      objectiveCompleted,
      explorationPercent
    };
  }

  function handleBattleOutcome(outcome = 'victory', pending = {}, result = {}) {
    const state = CS().getState();
    const run = state?.activeScenarioRun;
    const scenario = CS().getActiveScenario();
    const map = CS().getActiveMap();
    if (!run || !scenario) return null;
    const normalized = String(outcome || 'victory').toLowerCase();
    _resolveMovingThreatBattle(normalized, pending);
    let objectiveCompleted = false;
    if ((normalized === 'victory' || normalized === 'win' || normalized === 'success')
      && _objectiveBattleMatch(run.objectiveState, pending, result, map, run)) {
      objectiveCompleted = _markObjectiveComplete(pending.label || result.label || pending.nodeId || pending.cellKey || 'battle target');
    }
    const context = {
      type: normalized === 'defeat' || normalized === 'lose' || normalized === 'fail'
        ? 'battle_lost'
        : (normalized === 'draw' ? 'battle_draw' : 'battle_won'),
      state,
      run,
      scenario,
      map,
      pending,
      result,
      outcome: normalized,
      explorationPercent: _explorationPercent(run, map)
    };
    _runProgressTriggers(context);
    if (objectiveCompleted) {
      _runProgressTriggers({
        ...context,
        type: 'objective_completed',
        objective: currentObjective()
      });
    }
    return {
      objectiveCompleted,
      explorationPercent: context.explorationPercent
    };
  }

  function _normalizeObjective(scenario = {}, map = null, options = {}) {
    const raw = scenario.objective || scenario.questObjective || null;
    const fallback = !raw
      ? (scenario.successConditions || []).find((cond) => cond.type === 'reach_node' || cond.type === 'reach_cell')
      : null;
    const source = raw || fallback;
    if (!source) return null;
    const startLevelId = options.levelId || _defaultGridLevelId(map, source.levelId || source.layerId || source.layer || '');
    const cell = source.cell || (source.x != null || source.y != null
      ? { x: Number(source.x || 0), y: Number(source.y || 0) }
      : null);
    const kind = String(source.kind || source.type || (fallback?.type === 'reach_cell' || fallback?.type === 'reach_node' ? 'reach' : 'objective')).toLowerCase();
    const levelId = cell ? _defaultGridLevelId(map, source.levelId || source.layerId || source.layer || startLevelId) : null;
    const cellKey = cell ? _cellKey(cell.x, cell.y, levelId, map) : null;
    const reveal = _objectiveRevealConfig(source, scenario, map, {
      ...options,
      levelId
    });
    return {
      id: source.id || 'objective_main',
      label: source.label || source.title || _objectiveLabel(source, fallback, map),
      kind,
      marker: source.marker !== false,
      visible: reveal.visible,
      revealAtPercent: reveal.revealAtPercent,
      revealAtLevelId: reveal.revealAtLevelId,
      revealAtLayerIndex: reveal.revealAtLayerIndex,
      revealHint: reveal.revealHint,
      revealedAt: source.revealedAt || null,
      revealSource: source.revealSource || '',
      nodeId: source.nodeId || fallback?.nodeId || null,
      levelId,
      cell,
      cellKey,
      encounterId: source.encounterId || null,
      battleSetId: source.battleSetId || null,
      completed: !!source.completed,
      completedAt: source.completedAt || null
    };
  }

  function _objectiveRevealConfig(source = {}, scenario = {}, map = null, options = {}) {
    const explicitVisible = source.visible ?? source.revealed;
    const levelCount = _gridLevels(map).length;
    const totalExplorable = _totalExplorableCount(map);
    const sizeText = String(source.size || scenario.size || map?.size || '').toLowerCase();
    const layered = levelCount > 1;
    const bigGrid = layered || totalExplorable >= 24 || sizeText === 'big' || sizeText === 'large' || sizeText === 'huge' || sizeText === 'massive';
    const revealAtPercent = Number(source.revealAtPercent ?? source.revealPercent ?? (options.travelMode === 'grid_map' || map?.type === 'grid_map' ? 60 : 0)) || 0;
    const explicitLevelId = source.revealAtLevelId || source.revealLevelId || source.revealLayerId || source.revealLayer || null;
    const explicitLayerIndex = Number(source.revealAtLayerIndex || source.revealLayerIndex || 0) || 0;
    let revealAtLayerIndex = explicitLayerIndex;
    if (!revealAtLayerIndex && layered && levelCount >= 3) revealAtLayerIndex = 3;
    let revealAtLevelId = explicitLevelId ? _defaultGridLevelId(map, explicitLevelId) : null;
    if (!revealAtLevelId && revealAtLayerIndex > 0 && levelCount >= revealAtLayerIndex) {
      revealAtLevelId = _defaultGridLevelId(map, _gridLevels(map)[revealAtLayerIndex - 1]?.id || null);
    }
    const shouldHide = source.marker !== false && (map?.type === 'grid_map' || options.travelMode === 'grid_map') && (bigGrid || revealAtPercent > 0);
    const visible = explicitVisible != null ? !!explicitVisible : !shouldHide;
    return {
      visible,
      revealAtPercent: revealAtPercent > 0 ? revealAtPercent : null,
      revealAtLevelId,
      revealAtLayerIndex: revealAtLayerIndex > 0 ? revealAtLayerIndex : null,
      revealHint: _objectiveRevealHint(map, {
        revealAtPercent,
        revealAtLevelId,
        revealAtLayerIndex
      })
    };
  }

  function _objectiveRevealHint(map = null, config = {}) {
    const bits = [];
    if (Number(config.revealAtPercent || 0) > 0) bits.push(`reveal near ${Number(config.revealAtPercent)}% explored`);
    if (config.revealAtLevelId) bits.push(`or reach ${_gridLevelName(map, config.revealAtLevelId)}`);
    else if (Number(config.revealAtLayerIndex || 0) > 0) bits.push(`or reach layer ${Number(config.revealAtLayerIndex)}`);
    return bits.join(' | ');
  }

  function _refreshObjectiveVisibility(state = CS().getState(), map = CS().getActiveMap(), context = {}) {
    const run = state?.activeScenarioRun;
    const objective = run?.objectiveState;
    if (!run || !objective || objective.marker === false || objective.completed || objective.visible) return objective;
    const explorationPercent = Number(context.explorationPercent ?? _explorationPercent(run, map));
    const levelId = _defaultGridLevelId(map, context.levelId || run.mapLayer);
    const currentLayerIndex = _gridLevelIndex(map, levelId);
    const targetLayerIndex = Number(objective.revealAtLayerIndex || 0);
    const levelMatch = objective.revealAtLevelId
      ? _defaultGridLevelId(map, objective.revealAtLevelId) === levelId
      : false;
    const percentMatch = Number(objective.revealAtPercent || 0) > 0 && explorationPercent >= Number(objective.revealAtPercent || 0);
    const layerMatch = targetLayerIndex > 0 && currentLayerIndex >= targetLayerIndex;
    if (!percentMatch && !levelMatch && !layerMatch) return objective;
    let revealed = null;
    CS().mutate((next) => {
      const activeObjective = next.activeScenarioRun?.objectiveState;
      if (!activeObjective || activeObjective.visible || activeObjective.completed) return;
      activeObjective.visible = true;
      activeObjective.revealedAt = new Date().toISOString();
      activeObjective.revealSource = levelMatch
        ? _gridLevelName(map, levelId)
        : (layerMatch ? `layer_${currentLayerIndex}` : `${explorationPercent}% explored`);
      revealed = {
        label: activeObjective.label || 'Objective',
        source: activeObjective.revealSource || ''
      };
    }, { source: 'scenario_objective_reveal' });
    if (revealed) {
      Ops().apply({ op: 'log', text: `Objective revealed: ${revealed.label}.` }, { source: 'scenario_objective_reveal' });
    }
    return CS().getState()?.activeScenarioRun?.objectiveState || objective;
  }

  function _objectiveLabel(source = {}, fallback = null, map = null) {
    if (fallback?.type === 'reach_node') {
      const node = findNode(map, fallback.nodeId);
      return node?.title || 'Reach the target node';
    }
    if (fallback?.type === 'reach_cell') {
      return source.label || `Reach ${Number(fallback.x)},${Number(fallback.y)}`;
    }
    return source.label || source.title || 'Resolve the objective';
  }

  function _objectiveNeedsBattle(objective = {}) {
    const kind = String(objective?.kind || '').toLowerCase();
    return !!(objective?.encounterId || objective?.battleSetId || ['defeat', 'defeat_boss', 'boss', 'battle'].includes(kind));
  }

  function _objectiveLocationMatch(objective = null, kind = '', location = {}, map = null, run = null) {
    if (!objective || objective.completed) return false;
    if (kind === 'node' && objective.nodeId) return objective.nodeId === location.id;
    if (kind === 'cell' && objective.cellKey) {
      const key = _cellKey(location.x, location.y, location.levelId || run?.mapLayer, map);
      return objective.cellKey === key;
    }
    return false;
  }

  function _objectiveBattleMatch(objective = null, pending = {}, result = {}, map = null, run = null) {
    if (!objective || objective.completed || !_objectiveNeedsBattle(objective)) return false;
    if (objective.battleSetId && objective.battleSetId === pending?.battleSetId) return true;
    if (objective.encounterId && objective.encounterId === (pending?.encounterId || result?.encounterId)) return true;
    if (objective.nodeId && objective.nodeId === pending?.nodeId) return true;
    if (objective.cellKey && objective.cellKey === pending?.cellKey) return true;
    return false;
  }

  function _markObjectiveComplete(sourceText = '') {
    let completed = false;
    let label = '';
    CS().mutate((state) => {
      const objective = state.activeScenarioRun?.objectiveState;
      if (!objective || objective.completed) return;
      objective.completed = true;
      objective.completedAt = new Date().toISOString();
      objective.sourceText = sourceText || '';
      label = objective.label || objective.nodeId || objective.cellKey || 'Objective';
      completed = true;
    }, { source: 'scenario_objective_complete' });
    if (completed) {
      Ops().apply({ op: 'log', text: `Scenario objective reached: ${label}.` }, { source: 'scenario' });
    }
    return completed;
  }

  function _explorationPercent(run, map) {
    const total = _totalExplorableCount(map);
    if (!total) return 0;
    const visited = _visitedExplorableCount(run);
    return Math.max(0, Math.min(100, Math.round((visited / total) * 100)));
  }

  function _visitedExplorableCount(run = {}) {
    if (run.travelMode === 'grid_map') return new Set(run.visitedCells || []).size;
    return new Set(run.visitedNodes || []).size;
  }

  function _totalExplorableCount(map = {}) {
    if (!map) return 0;
    if (map.type === 'grid_map') {
      if (_usesGridLevels(map)) {
        return _gridLevels(map).reduce((sum, level) => sum + _countPassableCells(level.terrain || level.grid || [], level.width || 0, level.height || 0), 0);
      }
      return _countPassableCells(map.terrain || map.grid || [], map.width || map.cols || map.columns || 0, map.height || map.rows || 0);
    }
    return Array.isArray(map.nodes) ? map.nodes.length : 0;
  }

  function _countPassableCells(grid = [], width = 0, height = 0) {
    let total = 0;
    const cols = Number(width || 0);
    const rows = Number(height || 0);
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const terrain = (grid[y] || [])[x] || 'floor';
        if (!['wall', 'obstacle', 'blocked', 'void'].includes(String(terrain).toLowerCase())) total += 1;
      }
    }
    return total;
  }

  function _runProgressTriggers(context = {}) {
    const scenario = context.scenario || CS().getActiveScenario();
    const run = context.run || CS().getState()?.activeScenarioRun;
    if (!scenario || !run) return;
    const triggers = _normalizeProgressTriggers(scenario);
    for (const trigger of triggers) {
      if (!trigger.id) continue;
      if (trigger.once !== false && run.progressTriggerState?.[trigger.id]) continue;
      if (!_triggerMatches(trigger, context)) continue;
      _markTriggerFired(trigger.id);
      _executeProgressTrigger(trigger, context);
    }
  }

  function _normalizeProgressTriggers(scenario = {}) {
    return (scenario.progressTriggers || []).map((trigger, index) => {
      const when = typeof trigger.when === 'string'
        ? { type: trigger.when }
        : { ...(trigger.when || {}) };
      if (!when.type) when.type = trigger.trigger || trigger.type || '';
      const actions = Array.isArray(trigger.actions) ? trigger.actions.slice() : [];
      if (trigger.log) actions.push({ type: 'log', text: trigger.log });
      if (trigger.ops) actions.push({ type: 'ops', ops: trigger.ops });
      if (trigger.setFlags) actions.push({ type: 'flags', flags: trigger.setFlags });
      if (trigger.storySceneId) actions.push({ type: 'story_scene', sceneId: trigger.storySceneId });
      if (trigger.eventId) actions.push({ type: 'event', eventId: trigger.eventId });
      if (trigger.eventTableId) actions.push({ type: 'event_table', tableId: trigger.eventTableId });
      if (trigger.encounterId || trigger.battleSetId) {
        actions.push({
          type: 'battle',
          encounterId: trigger.encounterId || null,
          battleSetId: trigger.battleSetId || null,
          label: trigger.label || trigger.title || ''
        });
      }
      if (trigger.minigame || trigger.minigameId || trigger.gameId) {
        actions.push({
          type: 'minigame',
          ...(typeof trigger.minigame === 'object' ? trigger.minigame : {}),
          gameId: trigger.gameId || trigger.minigameId || trigger.minigame?.gameId || trigger.minigame || '',
          levelId: trigger.levelId || trigger.minigame?.levelId || '',
          difficulty: trigger.difficulty || trigger.minigame?.difficulty || 1,
          theme: trigger.theme || trigger.minigame?.theme || '',
          onWinOps: trigger.onWinOps || trigger.minigame?.onWinOps || [],
          onLoseOps: trigger.onLoseOps || trigger.minigame?.onLoseOps || []
        });
      }
      if (trigger.revealObjective) {
        actions.push({
          type: 'reveal_objective',
          ...(typeof trigger.revealObjective === 'object' ? trigger.revealObjective : {})
        });
      }
      if (trigger.endScenario) {
        actions.push({
          type: 'end_scenario',
          outcome: typeof trigger.endScenario === 'string' ? trigger.endScenario : (trigger.outcome || 'success')
        });
      }
      return {
        id: trigger.id || `progress_${index + 1}`,
        once: trigger.fireOnce !== false && trigger.repeat !== true,
        when,
        actions
      };
    });
  }

  function _triggerMatches(trigger = {}, context = {}) {
    const when = trigger.when || {};
    const type = String(when.type || '').toLowerCase();
    if (!type) return false;
    if (type === 'explore_percent' || type === 'explorepercentgte') {
      const target = Number(when.gte ?? when.percent ?? when.value ?? 0);
      return Number(context.explorationPercent || 0) >= target;
    }
    if (type === 'enter_node') {
      if (context.type !== 'enter_node') return false;
      return !when.nodeId || when.nodeId === context.location?.id;
    }
    if (type === 'enter_cell') {
      if (context.type !== 'enter_cell') return false;
      if (when.levelId && when.levelId !== (context.location?.levelId || context.run?.mapLayer)) return false;
      if (when.cellKey) return when.cellKey === context.cellKey;
      if (when.x != null || when.y != null) {
        return Number(when.x) === Number(context.location?.x) && Number(when.y) === Number(context.location?.y);
      }
      return true;
    }
    if (type === 'enter_layer' || type === 'enter_level') {
      if (context.type !== 'enter_layer' && context.type !== 'enter_level') return false;
      const entered = _defaultGridLevelId(context.map, context.levelId || context.location?.levelId || context.run?.mapLayer);
      const wanted = when.levelId || when.layerId || when.level || when.layer || null;
      if (wanted && _defaultGridLevelId(context.map, wanted) !== entered) return false;
      if (Number(when.layerIndex || when.levelIndex || 0) > 0) {
        return _gridLevelIndex(context.map, entered) >= Number(when.layerIndex || when.levelIndex || 0);
      }
      return true;
    }
    if (type === 'objective_completed' || type === 'objectivereached') {
      return context.type === 'objective_completed';
    }
    if (type === 'battle_won') return context.type === 'battle_won';
    if (type === 'battle_lost') return context.type === 'battle_lost';
    if (type === 'battle_draw') return context.type === 'battle_draw';
    return false;
  }

  function _markTriggerFired(triggerId) {
    CS().mutate((state) => {
      const run = state.activeScenarioRun;
      if (!run || !triggerId) return;
      run.progressTriggerState = run.progressTriggerState || {};
      const prev = run.progressTriggerState[triggerId] || {};
      run.progressTriggerState[triggerId] = {
        count: Number(prev.count || 0) + 1,
        at: new Date().toISOString()
      };
    }, { source: 'scenario_progress_trigger' });
  }

  function _executeProgressTrigger(trigger = {}, context = {}, index = 0) {
    const action = (trigger.actions || [])[index];
    if (!action) return;
    const next = () => _executeProgressTrigger(trigger, context, index + 1);
    const type = String(action.type || '').toLowerCase();
    if (type === 'log') {
      Ops().apply({ op: 'log', text: action.text || trigger.id || 'Scenario progress triggered.' }, { source: 'scenario_progress' });
      return next();
    }
    if (type === 'ops') {
      Ops().apply(_asOps(action.ops), { source: 'scenario_progress' });
      return next();
    }
    if (type === 'flags') {
      Ops().apply(_flagOps(action.flags), { source: 'scenario_progress' });
      return next();
    }
    if (type === 'story_scene') {
      // Skip the fullscreen VN for quick-narrative quests (generated + user-built).
      // The trigger's text/log still applies via _runProgressTriggers' other actions.
      if (context?.run?.quickNarrative || CS().getState()?.activeScenarioRun?.quickNarrative) {
        return next();
      }
      const opened = window.CJS.CampaignStoryScenes?.playSceneById?.(action.sceneId, {
        source: 'scenario_progress',
        onComplete: next
      });
      if (!opened) return next();
      return;
    }
    if (type === 'event') {
      _queueScenarioEventById(action.eventId);
      return next();
    }
    if (type === 'event_table') {
      _rollScenarioEventTable(action.tableId, context);
      return next();
    }
    if (type === 'battle') {
      Ops().apply({
        op: 'start_battle',
        encounterId: action.encounterId || null,
        battleSetId: action.battleSetId || null,
        label: action.label || action.encounterId || action.battleSetId || 'Scenario Battle',
        nodeId: context.location?.id || context.pending?.nodeId || null,
        source: 'progress_trigger'
      }, { source: 'scenario_progress' });
      return;
    }
    if (type === 'minigame') {
      return _openTriggerMiniGame(action, context, next);
    }
    if (type === 'reveal_objective') {
      _forceRevealObjective(action, context);
      return next();
    }
    if (type === 'end_scenario') {
      endScenario(action.outcome || 'success');
      return;
    }
    next();
  }

  function _queueScenarioEventById(eventId) {
    if (!eventId) return;
    const wanted = String(eventId || '');
    let found = null;
    for (const table of Object.values(CS().getContent?.().campaignEvents || {})) {
      for (const entry of table.entries || []) {
        if (entry.id !== wanted) continue;
        found = {
          ...CS().clone(entry),
          tableId: table.id,
          tableName: table.name || table.id,
          rolledAt: new Date().toISOString()
        };
        break;
      }
      if (found) break;
    }
    if (!found) return;
    CS().mutate((state) => {
      state.lastEvent = found;
    }, { source: 'scenario_progress_event' });
    _incrementScenarioEventsUsed();
  }

  function _rollScenarioEventTable(tableId, context = {}) {
    if (!tableId || !window.CJS.CampaignEvents?.roll) return;
    const run = CS().getState()?.activeScenarioRun;
    const scenario = CS().getActiveScenario?.();
    window.CJS.CampaignEvents.roll(tableId, {
      world: CS().getState()?.currentWorld,
      setting: scenario?.setting || '',
      tags: [...(context.location?.tags || []), ...(scenario?.tags || [])],
      locationKind: context.location?.kind || ''
    });
    if (CS().getState()?.lastEvent) _incrementScenarioEventsUsed();
  }

  function _incrementScenarioEventsUsed() {
    CS().mutate((state) => {
      if (state.activeScenarioRun) state.activeScenarioRun.eventsUsed = (state.activeScenarioRun.eventsUsed || 0) + 1;
    }, { source: 'scenario_progress_event_count' });
  }

  function _openTriggerMiniGame(action = {}, context = {}, done = () => {}) {
    const MG = window.CJS.Minigames;
    if (!MG?.openMiniGame || !action.gameId) return done();
    Promise.resolve(MG.openMiniGame({
      gameId: action.gameId,
      levelId: action.levelId || undefined,
      difficulty: action.difficulty || undefined,
      seed: action.seed || undefined,
      theme: action.theme || undefined,
      source: 'scenario_progress',
      mapId: context.run?.mapId || null,
      nodeId: context.location?.id || context.pending?.nodeId || null,
      onWinOps: action.onWinOps || [],
      onLoseOps: action.onLoseOps || [],
      onComplete: (result) => {
        const ops = (result?.suggestedOps || []).filter(Boolean);
        if (ops.length) Ops().apply(ops, { source: 'scenario_progress_minigame' });
        done();
      }
    })).catch(() => done());
  }

  function _flagOps(flags) {
    if (!flags) return [];
    if (Array.isArray(flags)) {
      return flags.filter(Boolean).map((flag) => ({ op: 'set_flag', flag, value: true }));
    }
    return Object.entries(flags).map(([flag, value]) => ({
      op: value === false ? 'clear_flag' : 'set_flag',
      flag,
      value: value === false ? undefined : value
    }));
  }

  function _asOps(value) {
    if (!value) return [];
    return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
  }

  function maybeTriggerRandomBattle(randomBattle) {
    const state = CS().getState();
    const run = state.activeScenarioRun;
    if (!run) return null;
    if (state.pendingBattle) return null;
    const chance = Number(randomBattle.chance ?? 1);
    if (Math.random() > chance) return null;
    if (randomBattle.battleSetId || randomBattle.encounterId) return _queueBattleEntry(randomBattle, { source: 'random' });
    return rollRandomBattle(randomBattle.table);
  }

  function advanceLinearBeat() {
    const state = CS().getState();
    const run = state?.activeScenarioRun;
    const scenario = CS().getActiveScenario();
    if (!run || run.travelMode !== 'linear' || !scenario?.beats?.length) return null;

    const idx = run.currentBeatIndex ?? 0;
    if (idx >= scenario.beats.length) {
      Ops().apply({ op: 'log', text: 'All beats complete.' }, { source: 'scenario' });
      return null;
    }
    const beat = scenario.beats[idx];

    const normalizedBattle = _normalizeBattleEntry(beat);
    if (beat.kind === 'battle' && (normalizedBattle.encounterId || normalizedBattle.battleSetId || normalizedBattle.monsterIds?.length)) {
      const pending = {
        encounterId: normalizedBattle.encounterId || null,
        battleSetId: normalizedBattle.battleSetId || null,
        monsterIds: normalizedBattle.monsterIds || [],
        label: normalizedBattle.label || beat.label || normalizedBattle.encounterId || normalizedBattle.battleSetId || 'Beat Battle',
        beatId: beat.id,
        source: 'beat',
        rewardOps: normalizedBattle.rewardOps || [],
        ..._defeatFields(normalizedBattle),
        objective: normalizedBattle.objective || '',
        notes: normalizedBattle.notes || '',
        battleMap: normalizedBattle.battleMap || null,
        setting: normalizedBattle.setting || scenario?.setting || null
      };
      CS().mutate((next) => { next.pendingBattle = pending; }, { source: 'beat_battle' });
      Ops().apply({ op: 'log', text: `Beat ${idx + 1}: battle queued (${pending.label}).` }, { source: 'scenario' });
    } else if (beat.kind === 'event') {
      const event = {
        id: beat.id,
        title: beat.label || 'Event',
        prompt: beat.prompt || '',
        suggested: beat.ops || [],
        rolledAt: new Date().toISOString(),
        source: 'beat'
      };
      CS().mutate((s) => { s.lastEvent = event; }, { source: 'beat_event' });
      Ops().apply({ op: 'log', text: `Beat ${idx + 1}: event (${event.title}).` }, { source: 'scenario' });
    } else if (beat.kind === 'rest') {
      Ops().apply({ op: 'camp_rest', dangerChange: beat.dangerChange ?? -1 }, { source: 'beat_rest' });
    } else if (beat.kind === 'reward' && Array.isArray(beat.ops)) {
      Ops().apply(beat.ops, { source: 'beat_reward' });
    } else if (beat.kind === 'trap' && beat.check) {
      CS().mutate((s) => {
        s.lastEvent = { type: 'trap', title: beat.label || 'Trap', prompt: beat.prompt || '', suggested: [_checkToOperation(beat.check)] };
      }, { source: 'beat_trap' });
    } else if (Array.isArray(beat.ops)) {
      Ops().apply(beat.ops, { source: 'beat_ops' });
    }

    CS().mutate((next) => {
      const r = next.activeScenarioRun;
      if (!r) return;
      r.completedBeats = r.completedBeats || [];
      r.completedBeats.push(beat.id);
      r.currentBeatIndex = idx + 1;
    }, { source: 'beat_advance' });

    if (idx + 1 >= scenario.beats.length && (scenario.successConditions || []).some((cond) => cond.type === 'complete_beats')) {
      Ops().apply({ op: 'log', text: 'Scenario objective reached: all beats complete.' }, { source: 'scenario' });
    }

    _maybeTravelSurprise({
      mode: 'linear',
      location: beat,
      locationKey: beat.id || `beat_${idx}`,
      repeated: false,
      baseChance: 0.22
    });

    return beat;
  }

  function expandProceduralMap(scenario) {
    const seedRef = _resolveMapSeed(scenario);
    if (!seedRef) return null;
    const nodes = _layoutSeedNodes(seedRef);
    return {
      id: `proc_${scenario.id}_${seedRef.id}`,
      name: seedRef.name || scenario.name || 'Procedural Map',
      type: 'node_map',
      world: scenario.world || seedRef.world || null,
      setting: scenario.setting || seedRef.tags?.find((tag) => ['urban', 'outdoor', 'dungeon', 'house', 'castle', 'mountain'].includes(tag)) || null,
      size: scenario.size || seedRef.tags?.find((tag) => ['tiny', 'small', 'medium', 'large', 'huge', 'massive'].includes(tag)) || null,
      layers: _layerDefs(seedRef, nodes),
      defaultStartNode: nodes[0]?.id || null,
      nodes,
      _procedural: true,
      _seedId: seedRef.id
    };
  }

  function _resolveMapSeed(scenario) {
    const Loader = window.CJS.CampaignDataLoader;
    if (!Loader) return null;
    if (scenario.mapSeedId) {
      const direct = Loader.getMapSeed(scenario.mapSeedId);
      if (direct) return direct;
    }
    const pool = Loader.getMapSeeds(scenario.world || null);
    if (Array.isArray(scenario.mapSeedTags) && scenario.mapSeedTags.length) {
      const tagged = pool.filter((s) => scenario.mapSeedTags.every((tag) => (s.tags || []).includes(tag)));
      if (tagged.length) return _pick(tagged);
    }
    if (pool.length) return _pick(pool);
    return null;
  }

  function _layoutSeedNodes(seed) {
    const seedNodes = seed.nodes || [];
    if (!seedNodes.length) return [];
    const links = seed.links || [];
    const exitsById = {};
    for (const [a, b] of links) {
      exitsById[a] = exitsById[a] || [];
      exitsById[b] = exitsById[b] || [];
      exitsById[a].push(b);
      exitsById[b].push(a);
    }
    const width = 660;
    const height = 380;
    const padX = 70;
    const padY = 60;
    const rng = _seededRng(seed.id || 'proc');
    const layers = _layerDefs(seed, seedNodes);
    const nodesByLayer = new Map();
    for (const node of seedNodes) {
      const layer = _normalizeLayerId(node.layer || node.layerId || layers[0]?.id || 'layer_1');
      if (!nodesByLayer.has(layer)) nodesByLayer.set(layer, []);
      nodesByLayer.get(layer).push(node);
    }
    return seedNodes.map((node, idx) => {
      const layer = _normalizeLayerId(node.layer || node.layerId || layers[0]?.id || 'layer_1');
      const layerNodes = nodesByLayer.get(layer) || seedNodes;
      const layerIndex = layerNodes.findIndex((entry) => entry.id === node.id);
      const cols = Math.max(layerNodes.length, 2);
      const t = cols === 1 ? 0.5 : Math.max(0, layerIndex) / (cols - 1);
      const baseX = padX + t * (width - 2 * padX);
      const jitterX = (rng() - 0.5) * 30;
      const yMid = height / 2;
      const yJitter = (rng() - 0.5) * (height - 2 * padY);
      const kind = _seedRoleToKind(node.role);
      const exits = (exitsById[node.id] || []).map((to) => ({ to, label: `Travel to ${seedNodes.find((n) => n.id === to)?.name || to}` }));
      const battleRef = _firstBattleRef(node);
      return {
        id: node.id,
        title: node.name || node.id,
        kind,
        x: Math.round(baseX + jitterX),
        y: Math.round(yMid + yJitter),
        layer,
        layerName: _layerName(seed, layer),
        tags: node.tags || [],
        notes: node.notes || node.role || '',
        discoveredByDefault: idx === 0,
        battleSetIds: node.battleSetIds || [],
        encounterIds: node.encounterIds || (node.encounterId ? [node.encounterId] : []),
        randomBattle: kind === 'battle' || kind === 'boss' || kind === 'event_battle'
          ? (battleRef ? { chance: 0.85, ..._battleEntryFromRef(battleRef) } : undefined)
          : undefined,
        onEnter: _onEnterOpsForRole(node, kind),
        exits
      };
    });
  }

  function _onEnterOpsForRole(node, kind) {
    const ops = [];
    if (kind === 'reward') {
      ops.push({ op: 'give_money', currency: _activeCurrency(), amount: 18 });
      ops.push({ op: 'give_material', id: _pickWorldMaterial(), qty: 1 });
      ops.push({ op: 'log', text: `Reward node: ${node.name || node.id}.` });
    } else if (kind === 'trap') {
      ops.push({ op: 'damage_party', amount: 4 });
      ops.push({ op: 'danger', amount: 1 });
      ops.push({ op: 'log', text: `Trap triggered at ${node.name || node.id}.` });
    } else if (kind === 'rest') {
      ops.push({ op: 'heal_party', amount: 8 });
      ops.push({ op: 'log', text: `Brief rest at ${node.name || node.id}.` });
    } else if (kind === 'shop') {
      ops.push({ op: 'log', text: `Small offering / cache at ${node.name || node.id}.` });
      ops.push({ op: 'give_money', currency: _activeCurrency(), amount: 8 });
    } else if (kind === 'boss') {
      ops.push({ op: 'danger', amount: 2 });
      ops.push({ op: 'log', text: `Boss approach: ${node.name || node.id}.` });
    } else if (kind === 'event_battle') {
      ops.push({ op: 'log', text: `Quest scene beat: ${node.name || node.id}.` });
    }
    return ops.length ? ops : undefined;
  }

  function _activeCurrency() {
    const world = CS().getState()?.currentWorld || 'haven';
    return `${world}_gold`;
  }

  function _pickWorldMaterial() {
    const world = CS().getState()?.currentWorld;
    const DS = window.CJS.DataStore;
    const all = DS ? DS.getAllAsArray('materials') : [];
    const list = all.filter((m) => !m._world || m._world === world);
    if (!list.length) return 'haven_wolf_pelt';
    return list[Math.floor(Math.random() * list.length)].id;
  }

  function rollTravelSurprise(context = {}) {
    const state = CS().getState();
    const run = state?.activeScenarioRun;
    if (!run) return null;
    const map = context.map || CS().getActiveMap();
    const currentCell = run.currentCell && map ? _gridCell(map, run.currentCell.x, run.currentCell.y) : null;
    const location = context.location || findCurrentNode() || currentCell || CS().getActiveScenario() || {};
    const locationKey = context.locationKey
      || location.id
      || (currentCell ? _cellKey(currentCell.x, currentCell.y) : `freeform_${run.travelSteps || 0}`);
    return _maybeTravelSurprise({
      ...context,
      mode: context.mode || run.travelMode || 'freeform',
      map,
      location,
      locationKey,
      repeated: !!context.repeated,
      baseChance: context.baseChance ?? 0.52
    }, { force: context.force !== false, manual: true });
  }

  function _maybeTravelSurprise(context = {}, options = {}) {
    const state = CS().getState();
    const run = state?.activeScenarioRun;
    if (!run) return null;
    const profile = _surpriseProfileForContext(context);
    const locationKey = context.locationKey || context.location?.id || `step_${run.travelSteps || 0}`;
    const visitCount = _recordTravelStep(locationKey);
    const repeated = !!context.repeated || visitCount > 1;
    const modifiers = _campaignTravelModifiers(state, context);
    const danger = Math.max(0, Number(run.danger || 0));
    let chance = Number(context.baseChance ?? (repeated ? SURPRISE_REVISIT_CHANCE : SURPRISE_BASE_CHANCE));
    chance *= modifiers.baseRate || 1;
    if (repeated) chance *= modifiers.revisitRate || 1;
    if (visitCount > 2) chance *= Math.pow(SURPRISE_REVISIT_DECAY, Math.min(5, visitCount - 2));
    if (context.mode === 'linear') chance *= 0.85;
    chance += Math.min(0.12, danger * 0.008);
    chance = _clamp(chance, options.force ? 1 : 0.03, options.force ? 1 : 0.72);
    if (!options.force && Math.random() > chance) return null;

    const category = _pickSurpriseCategory(profile, modifiers, {
      repeated,
      visitCount,
      hasPendingBattle: !!state.pendingBattle,
      hasEvent: !!state.lastEvent,
      run
    });
    if (!category) return null;
    const result = _resolveTravelSurprise(category, profile, { ...context, locationKey, repeated, visitCount });
    if (!result) return null;
    _recordTravelSurprise(result, profile, { ...context, repeated, visitCount, chance });
    return result;
  }

  function _recordTravelStep(locationKey) {
    let visitCount = 1;
    CS().mutate((state) => {
      const run = state.activeScenarioRun;
      if (!run) return;
      run.travelSteps = (run.travelSteps || 0) + 1;
      run.revisitCounts = run.revisitCounts || {};
      visitCount = (run.revisitCounts[locationKey] || 0) + 1;
      run.revisitCounts[locationKey] = visitCount;
    }, { source: 'travel_step' });
    return visitCount;
  }

  function _pickSurpriseCategory(profile, modifiers, ctx) {
    const weights = { ...(profile.weights || DEFAULT_SURPRISE_PROFILE.weights) };
    if (ctx.repeated) {
      weights.battle *= 0.45;
      weights.event *= 0.55;
      weights.branch *= 0.5;
      weights.rumor *= 0.75;
      weights.interaction *= 0.8;
      weights.item *= 0.7;
    }
    if (ctx.visitCount > 2) {
      const decay = Math.pow(0.76, Math.min(5, ctx.visitCount - 2));
      weights.battle *= decay;
      weights.event *= decay;
      weights.branch *= decay;
    }
    if (ctx.hasPendingBattle) weights.battle = 0;
    if (ctx.hasEvent) {
      weights.event *= 0.25;
      weights.interaction *= 0.25;
    }
    const battleLimit = Number(ctx.run?.limits?.randomBattles ?? 0);
    if (battleLimit && Number(ctx.run?.randomBattlesUsed || 0) >= battleLimit) weights.battle *= 0.25;
    const eventLimit = Number(ctx.run?.limits?.events ?? 0);
    if (eventLimit && Number(ctx.run?.eventsUsed || 0) >= eventLimit) {
      weights.event *= 0.35;
      weights.rumor *= 0.5;
      weights.interaction *= 0.5;
      weights.branch *= 0.55;
    }

    weights.battle *= (modifiers.encounterRate || 1) * (modifiers.battle || 1);
    weights.event *= (modifiers.eventRate || 1) * (modifiers.event || 1);
    weights.item *= (modifiers.itemRate || 1) * (modifiers.item || 1);
    weights.stat *= modifiers.stat || 1;
    weights.rumor *= (modifiers.rumorRate || 1) * (modifiers.rumor || 1);
    weights.interaction *= modifiers.interaction || 1;
    weights.branch *= (modifiers.branchRate || 1) * (modifiers.branch || 1);

    return _weightedPick(Object.entries(weights).map(([id, weight]) => ({ id, weight })))?.id || null;
  }

  function _resolveTravelSurprise(category, profile, context) {
    switch (category) {
      case 'battle': return _travelBattleSurprise(profile, context);
      case 'item': return _travelItemSurprise(profile, context);
      case 'stat': return _travelStatSurprise(profile, context);
      case 'rumor': return _travelRumorSurprise(profile, context);
      case 'interaction': return _travelPromptSurprise(profile, context, 'interaction');
      case 'branch': return _travelBranchSurprise(profile, context);
      case 'event':
      default: return _travelPromptSurprise(profile, context, 'event');
    }
  }

  function _travelBattleSurprise(profile, context) {
    const entry = _battleFromScenarioTable(profile, context) || _monsterBattleEntry({ ...context, profile });
    if (!entry) return null;
    const pending = _queueBattleEntry({
      ...entry,
      label: entry.label || `${profile.name} Encounter`,
      battleMap: entry.battleMap || _battleMapForProfile(profile, context),
      setting: entry.setting || profile.key
    }, { source: 'travel_surprise', tableId: entry.tableId || context.tableId || null });
    if (!pending) return null;
    return {
      category: 'battle',
      title: 'Battle Ready',
      prompt: `${pending.label} appears along the ${profile.name.toLowerCase()} route.`,
      action: 'battle',
      battle: pending
    };
  }

  function _battleFromScenarioTable(profile, context = {}) {
    const scenario = CS().getActiveScenario();
    const tables = scenario?.randomBattleTables || [];
    if (!tables.length) return null;
    const tokens = _profileTokens(profile, context);
    const scored = tables
      .filter((table) => Array.isArray(table.entries) && table.entries.length)
      .map((table) => {
        const text = _normalizeText([table.id, table.name, ...(table.tags || [])].join(' '));
        let score = 0;
        for (const token of tokens) if (token && text.includes(token)) score += 2;
        return { table, score };
      })
      .sort((a, b) => b.score - a.score);
    const table = scored[0]?.table || tables.find((entry) => entry.entries?.length);
    if (!table) return null;
    const picked = window.CJS.CampaignEvents?.weightedPick?.(table.entries) || _weightedPick(table.entries);
    return picked ? { ...picked, tableId: table.id, battleMap: picked.battleMap || _battleMapForProfile(profile, context), setting: profile.key } : null;
  }

  function _monsterBattleEntry(context = {}) {
    const profile = context.profile || _surpriseProfileForContext(context);
    const pool = _monsterPoolForContext(context, profile);
    if (!pool.length) return null;
    const state = CS().getState();
    const ready = Object.values(state?.party || {}).filter((member) => _memberCanTravel(member)).length;
    const count = Math.max(1, Math.min(5, Math.ceil(Math.max(ready, 1) * 0.75) + (Math.random() < 0.45 ? 1 : 0)));
    const top = pool.slice(0, Math.min(8, pool.length));
    const monsterIds = [];
    for (let i = 0; i < count; i++) {
      const picked = _weightedPick(top.map((entry) => ({ id: entry.monster.id, weight: Math.max(1, entry.score) })));
      if (picked?.id) monsterIds.push(picked.id);
    }
    if (!monsterIds.length) return null;
    const names = Array.from(new Set(monsterIds.map((id) => window.CJS.DataStore?.get?.('monsters', id)?.name || id)));
    return {
      monsterIds,
      label: `${profile.name} ${names.slice(0, 2).join(' + ')}`,
      source: context.source || 'monster_pool',
      notes: 'Generated from the current monster database using scenario area, tags, rank, and future habitat fields.',
      battleMap: _battleMapForProfile(profile, context),
      setting: profile.key
    };
  }

  function _monsterPoolForContext(context, profile) {
    const DS = window.CJS.DataStore;
    if (!DS) return [];
    const world = CS().getState()?.currentWorld;
    const partyRank = _activePartyRankValue();
    return DS.getAllAsArray('monsters')
      .filter((monster) => !world || !monster._world || monster._world === world)
      .map((monster) => ({ monster, score: _monsterTravelScore(monster, profile, context, partyRank) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  function _monsterTravelScore(monster, profile, context, partyRank) {
    const tokens = _profileTokens(profile, context);
    const text = _normalizeText([
      monster.id,
      monster.name,
      monster.type,
      monster.rank,
      monster.description,
      ...(monster.tags || []),
      ...(monster.biomes || []),
      ...(monster.habitats || []),
      monster.zone,
      monster.area,
      monster.environment
    ].join(' '));
    let score = 1;
    for (const token of tokens) {
      if (!token) continue;
      if (text.includes(token)) score += 4;
    }
    const rankGap = _rankValue(monster.rank) - partyRank;
    if (rankGap > 2) score -= 4;
    else if (rankGap > 1) score -= 1;
    else if (rankGap < -3) score -= 1;
    if (/boss|champion|chimera|ancient|lord/.test(text) && !/boss|arena|mountain|danger|trial/.test(tokens.join(' '))) score -= 3;
    return score;
  }

  function _travelItemSurprise(profile, context) {
    const op = _travelItemOperation(profile, context);
    if (!op) return null;
    const hint = _pick(profile.itemHints || DEFAULT_SURPRISE_PROFILE.itemHints);
    const title = `${profile.name} Find`;
    const prompt = `The party finds ${hint}.`;
    Ops().apply([op, { op: 'log', text: `Travel find: ${hint}.` }], { source: 'travel_surprise' });
    return { category: 'item', title, prompt, action: 'reward', operations: [op] };
  }

  function _travelItemOperation(profile, context) {
    const material = _pickWorldRecord('materials', profile, context);
    const item = _pickWorldRecord('items', profile, context);
    if (material && Math.random() < 0.55) return { op: 'give_material', id: material.id, qty: 1 };
    if (item && Math.random() < 0.45) return { op: 'give_item', id: item.id, qty: 1 };
    return { op: 'give_money', currency: _activeCurrency(), amount: 6 + Math.floor(Math.random() * 13) };
  }

  function _travelStatSurprise(profile) {
    const stat = _pick(['S', 'P', 'E', 'C', 'I', 'A', 'L']);
    const delta = Math.random() < 0.72 ? 1 : -1;
    const hint = _pick(profile.statHints || DEFAULT_SURPRISE_PROFILE.statHints);
    const label = `${profile.name} ${delta > 0 ? 'Edge' : 'Strain'}`;
    const op = {
      op: 'add_buff',
      target: 'party_random',
      id: `travel_${profile.key}_${stat}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      label,
      stat,
      amount: delta,
      duration: 'scenario',
      notes: `Travel ${hint}.`
    };
    Ops().apply([op, { op: 'log', text: `${label}: ${stat} ${delta > 0 ? '+' : ''}${delta}.` }], { source: 'travel_surprise' });
    return {
      category: 'stat',
      title: label,
      prompt: `${hint} changes one party member's ${stat} for this scenario.`,
      action: 'stat',
      operations: [op]
    };
  }

  function _travelRumorSurprise(profile) {
    const text = _pick(profile.rumors || DEFAULT_SURPRISE_PROFILE.rumors);
    const op = {
      op: 'add_rumor',
      text,
      tags: ['travel', profile.key],
      source: 'travel_surprise',
      canonRisk: 'green'
    };
    Ops().apply([op, { op: 'log', text: `Travel rumor heard: ${text}` }], { source: 'travel_surprise' });
    return { category: 'rumor', title: `${profile.name} Rumor`, prompt: text, action: 'rumor', operations: [op] };
  }

  function _travelPromptSurprise(profile, context, category) {
    const promptList = category === 'interaction' ? profile.interactions : profile.events;
    const prompt = _pick(promptList || DEFAULT_SURPRISE_PROFILE.events);
    const stat = category === 'interaction' ? _pick(['C', 'I', 'L']) : _pick(['P', 'E', 'A', 'I']);
    const dc = _travelCheckDc(context);
    const event = {
      id: `travel_${category}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      title: category === 'interaction' ? `${profile.name} Interaction` : `${profile.name} Event`,
      prompt,
      type: 'travel_surprise',
      category,
      tableName: `${profile.name} Travel`,
      source: 'travel_surprise',
      suggested: [{
        op: 'roll_check',
        stat,
        dc,
        success: [
          { op: 'danger', amount: -1 },
          { op: 'log', text: `Handled travel surprise cleanly: ${prompt}` }
        ],
        fail: [
          { op: 'danger', amount: 1 },
          { op: 'damage_party', amount: 2 },
          { op: 'log', text: `Travel surprise complicated the route: ${prompt}` }
        ]
      }],
      rolledAt: new Date().toISOString()
    };
    CS().mutate((state) => {
      state.lastEvent = event;
      if (state.activeScenarioRun) state.activeScenarioRun.eventsUsed = (state.activeScenarioRun.eventsUsed || 0) + 1;
    }, { source: 'travel_surprise_event' });
    return { category, title: event.title, prompt, action: 'event', event };
  }

  function _travelBranchSurprise(profile, context) {
    const node = _appendRuntimeBranchNode(profile, context);
    if (node) {
      const prompt = `${node.title || node.id} is now reachable.`;
      Ops().apply({ op: 'log', text: `Travel branch revealed: ${prompt}` }, { source: 'travel_surprise' });
      return { category: 'branch', title: `${profile.name} Branch`, prompt, action: 'branch', nodeId: node.id };
    }
    const cells = _revealGridBranch(profile, context);
    if (cells.length) {
      const prompt = `${cells.length} nearby ${cells.length === 1 ? 'cell' : 'cells'} were mapped.`;
      Ops().apply({ op: 'log', text: `Travel branch revealed: ${prompt}` }, { source: 'travel_surprise' });
      return { category: 'branch', title: `${profile.name} Branch`, prompt, action: 'branch', cells };
    }
    return _travelPromptSurprise(profile, context, 'branch');
  }

  function _appendRuntimeBranchNode(profile, context = {}) {
    const state = CS().getState();
    const run = state?.activeScenarioRun;
    const sourceMap = context.map || CS().getActiveMap();
    if (!run || !sourceMap?.nodes?.length || !run.currentNode) return null;
    let created = null;
    CS().mutate((next) => {
      const active = next.activeScenarioRun;
      if (!active) return;
      if (!active.proceduralMap) {
        active.proceduralMap = CS().clone(sourceMap);
        active.proceduralMap._runtimeBranches = true;
      }
      const map = active.proceduralMap;
      map.nodes = map.nodes || [];
      const current = findNode(map, active.currentNode);
      if (!current) return;
      current.exits = current.exits || [];
      const id = `surprise_${profile.key}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const kind = Math.random() < 0.4 ? 'reward' : (Math.random() < 0.75 ? 'event' : 'battle');
      const battle = kind === 'battle' ? _monsterBattleEntry({ ...context, profile }) : null;
      const node = {
        id,
        title: `${profile.name} Side Lead`,
        kind,
        x: Math.round(Number(current.x || 320) + 70 + (Math.random() * 40)),
        y: Math.round(Number(current.y || 180) + ((Math.random() - 0.5) * 90)),
        layer: current.layer || active.mapLayer || 'layer_1',
        layerName: current.layerName || _layerName(map, current.layer || active.mapLayer || 'layer_1'),
        tags: ['travel_surprise', profile.key],
        notes: _pick(profile.branches || DEFAULT_SURPRISE_PROFILE.branches),
        discoveredByDefault: false,
        onEnter: kind === 'reward' ? [_travelItemOperation(profile, context), { op: 'log', text: `${profile.name} side lead searched.` }] : undefined,
        randomBattle: battle ? { chance: 0.78, ...battle } : undefined,
        exits: [{ to: current.id, label: `Return to ${current.title || current.id}` }]
      };
      current.exits.push({ to: id, label: `Follow ${node.title}` });
      map.nodes.push(node);
      active.revealedNodes = active.revealedNodes || [];
      if (!active.revealedNodes.includes(id)) active.revealedNodes.push(id);
      const mapState = next.mapState[active.mapId || map.id] = next.mapState[active.mapId || map.id] || { visited: {}, revealed: {}, locked: {}, cleared: {}, notes: {} };
      mapState.revealed[id] = true;
      created = node;
    }, { source: 'travel_branch' });
    return created;
  }

  function _revealGridBranch(profile, context = {}) {
    const state = CS().getState();
    const run = state?.activeScenarioRun;
    const map = context.map || CS().getActiveMap();
    if (!run || run.travelMode !== 'grid_map' || !map || !run.currentCell) return [];
    const { x, y } = run.currentCell;
    const candidates = [
      [Number(x) + 2, Number(y)],
      [Number(x) - 2, Number(y)],
      [Number(x), Number(y) + 2],
      [Number(x), Number(y) - 2],
      [Number(x) + 1, Number(y) + 1],
      [Number(x) - 1, Number(y) - 1],
      [Number(x) + 1, Number(y) - 1],
      [Number(x) - 1, Number(y) + 1]
    ]
      .map(([cx, cy]) => _gridCell(map, cx, cy))
      .filter((cell) => cell && _cellPassable(map, cell.x, cell.y) && !(run.revealedCells || []).includes(_cellKey(cell.x, cell.y)));
    const picked = [];
    while (candidates.length && picked.length < 2) {
      const idx = Math.floor(Math.random() * candidates.length);
      picked.push(candidates.splice(idx, 1)[0]);
    }
    if (!picked.length) return [];
    CS().mutate((next) => {
      const active = next.activeScenarioRun;
      if (!active) return;
      active.revealedCells = active.revealedCells || [];
      const mapState = next.mapState[active.mapId || map.id] = next.mapState[active.mapId || map.id] || { visited: {}, revealed: {}, locked: {}, cleared: {}, notes: {} };
      mapState.revealedCells = mapState.revealedCells || {};
      for (const cell of picked) {
        const key = _cellKey(cell.x, cell.y);
        if (!active.revealedCells.includes(key)) active.revealedCells.push(key);
        mapState.revealedCells[key] = true;
      }
    }, { source: 'travel_branch_grid' });
    return picked.map((cell) => _cellKey(cell.x, cell.y));
  }

  function _recordTravelSurprise(result, profile, context) {
    const notice = {
      id: `travel_notice_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      category: result.category,
      title: result.title,
      prompt: result.prompt,
      action: result.action || '',
      area: profile.name,
      areaKey: profile.key,
      repeated: !!context.repeated,
      visitCount: context.visitCount || 1,
      location: _locationTitle(context.location),
      chance: Number(context.chance || 0),
      createdAt: new Date().toISOString()
    };
    CS().mutate((state) => {
      state.lastTravelSurprise = notice;
      const run = state.activeScenarioRun;
      if (!run) return;
      run.surpriseHistory = run.surpriseHistory || [];
      run.surpriseHistory.unshift(notice);
      run.surpriseHistory = run.surpriseHistory.slice(0, SURPRISE_HISTORY_LIMIT);
    }, { source: 'travel_surprise_notice' });
    return notice;
  }

  function _surpriseProfileForContext(context = {}) {
    const key = _areaKeyFromContext(context);
    const raw = AREA_SURPRISE_PROFILES[key] || {};
    return {
      key,
      name: raw.name || _titleCase(key),
      weights: { ...DEFAULT_SURPRISE_PROFILE.weights, ...(raw.weights || {}) },
      events: [...DEFAULT_SURPRISE_PROFILE.events, ...(raw.events || [])],
      rumors: [...DEFAULT_SURPRISE_PROFILE.rumors, ...(raw.rumors || [])],
      interactions: [...DEFAULT_SURPRISE_PROFILE.interactions, ...(raw.interactions || [])],
      branches: [...DEFAULT_SURPRISE_PROFILE.branches, ...(raw.branches || [])],
      itemHints: [...DEFAULT_SURPRISE_PROFILE.itemHints, ...(raw.itemHints || [])],
      statHints: [...DEFAULT_SURPRISE_PROFILE.statHints, ...(raw.statHints || [])],
      battleTags: [...DEFAULT_SURPRISE_PROFILE.battleTags, ...(raw.battleTags || [])],
      aliases: raw.aliases || []
    };
  }

  function _areaKeyFromContext(context = {}) {
    const scenario = CS().getActiveScenario();
    const map = context.map || CS().getActiveMap();
    const location = context.location || {};
    const text = _normalizeText([
      scenario?.setting,
      scenario?.mapType,
      scenario?.name,
      scenario?.notes,
      ...(scenario?.tags || []),
      map?.setting,
      map?.type,
      map?.name,
      ...(map?.tags || []),
      location.kind,
      location.title,
      location.name,
      location.notes,
      ...(location.tags || []),
      context.mode,
      context.travelLink?.label
    ].join(' '));
    for (const [key, profile] of Object.entries(AREA_SURPRISE_PROFILES)) {
      if (text.includes(key)) return key;
      if ((profile.aliases || []).some((alias) => text.includes(_normalizeText(alias)))) return key;
    }
    return scenario?.setting && AREA_SURPRISE_PROFILES[scenario.setting] ? scenario.setting : 'outdoor';
  }

  function _profileTokens(profile, context = {}) {
    const location = context.location || {};
    return Array.from(new Set([
      profile.key,
      ...(profile.aliases || []),
      ...(profile.battleTags || []),
      ...(location.tags || []),
      location.kind,
      context.mode
    ].map(_normalizeText).filter(Boolean)));
  }

  function _campaignTravelModifiers(state, context = {}) {
    const mods = {
      baseRate: 1,
      revisitRate: 1,
      encounterRate: 1,
      eventRate: 1,
      itemRate: 1,
      rumorRate: 1,
      branchRate: 1,
      battle: 1,
      event: 1,
      item: 1,
      stat: 1,
      rumor: 1,
      interaction: 1,
      branch: 1
    };
    const DS = window.CJS.DataStore;
    if (!DS) return mods;
    for (const [id, member] of Object.entries(state?.party || {})) {
      if (!_memberCanTravel(member)) continue;
      const base = DS.get('characters', member.baseCharacterId || id) || {};
      for (const record of _travelModifierRecords(member, base)) {
        _applyTravelModifierRecord(mods, record);
      }
    }
    for (const key of Object.keys(mods)) mods[key] = _clamp(mods[key], 0.15, 3.5);
    return mods;
  }

  function _travelModifierRecords(member = {}, base = {}) {
    const DS = window.CJS.DataStore;
    const records = [base];
    const skillIds = [...(base.skills || []), ...(member.skills || [])];
    const passiveIds = [...(base.innatePassives || []), ...(member.innatePassives || [])];
    const equipmentIds = [...(base.equipment || []), ...(member.equipment || [])];
    for (const id of skillIds) records.push(DS.get('skills', id));
    for (const id of passiveIds) records.push(DS.get('passives', id));
    for (const id of equipmentIds) records.push(DS.get('items', id));
    return records.filter(Boolean);
  }

  function _applyTravelModifierRecord(mods, record = {}) {
    const bags = [
      record,
      record.campaignMap,
      record.mapTravel,
      record.travel,
      record.exploration,
      record.scenarioMap,
      record.campaignMovement
    ].filter(Boolean);
    for (const bag of bags) {
      _applyRateAliases(mods, 'baseRate', bag, ['surpriseRate', 'travelSurpriseRate', 'explorationRate', 'mapRate']);
      _applyRateAliases(mods, 'revisitRate', bag, ['revisitRate', 'backtrackRate']);
      _applyRateAliases(mods, 'encounterRate', bag, ['encounterRate', 'battleRate', 'randomBattleRate', 'ambushRate']);
      _applyRateAliases(mods, 'eventRate', bag, ['eventRate', 'travelEventRate']);
      _applyRateAliases(mods, 'itemRate', bag, ['itemRate', 'forageRate', 'lootRate', 'cacheRate']);
      _applyRateAliases(mods, 'rumorRate', bag, ['rumorRate', 'gossipRate']);
      _applyRateAliases(mods, 'branchRate', bag, ['branchRate', 'secretRate', 'shortcutRate']);
    }
    const text = _normalizeText([record.id, record.name, record.description, ...(record.tags || [])].join(' '));
    if (/stealth|sneak|quiet|invisible/.test(text)) mods.encounterRate *= 0.88;
    if (/scout|pathfinder|navigator|danger sense|tracking|hunter/.test(text)) {
      mods.eventRate *= 1.1;
      mods.branchRate *= 1.25;
      mods.encounterRate *= 0.94;
    }
    if (/forage|survival|herbal|gather|prospector/.test(text)) mods.itemRate *= 1.3;
    if (/luck|lucky|fortune|oracle/.test(text)) {
      mods.itemRate *= 1.08;
      mods.rumorRate *= 1.08;
      mods.eventRate *= 1.05;
    }
    if (/loud|taunt|mock|challenge/.test(text)) mods.encounterRate *= 1.1;
  }

  function _applyRateAliases(mods, target, bag, aliases) {
    for (const alias of aliases) {
      if (bag[`${alias}Multiplier`] !== undefined) mods[target] *= _directMultiplier(bag[`${alias}Multiplier`]);
      if (bag[alias] !== undefined) mods[target] *= _rateToMultiplier(bag[alias]);
    }
  }

  function _directMultiplier(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0.05, n) : 1;
  }

  function _rateToMultiplier(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return 1;
    if (Math.abs(n) <= 1) return Math.max(0.05, 1 + n);
    if (n > 1 && n <= 3) return n;
    if (Math.abs(n) <= 100) return Math.max(0.05, 1 + (n / 100));
    return 1;
  }

  function _memberCanTravel(member = {}) {
    const availability = String(member.availability?.status || 'available').toLowerCase();
    return Number(member.currentHp ?? member.maxHp ?? 1) > 0 && !['unavailable', 'busy', 'story_locked'].includes(availability);
  }

  function _pickWorldRecord(type, profile, context = {}) {
    const DS = window.CJS.DataStore;
    if (!DS) return null;
    const world = CS().getState()?.currentWorld;
    const tokens = _profileTokens(profile, context);
    const list = DS.getAllAsArray(type)
      .filter((record) => !world || !record._world || record._world === world)
      .map((record) => {
        const text = _normalizeText([record.id, record.name, record.type, record.rarity, record.description, ...(record.tags || [])].join(' '));
        let score = 1;
        for (const token of tokens) if (token && text.includes(token)) score += 2;
        if (/quest|unique|legendary/.test(text)) score -= 2;
        return { record, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    if (!list.length) return null;
    const pool = list.slice(0, Math.min(8, list.length));
    return _weightedPick(pool.map((entry) => ({ id: entry.record.id, weight: entry.score, record: entry.record })))?.record || pool[0].record;
  }

  function _battleMapForProfile(profile, context = {}) {
    const key = profile?.key || _areaKeyFromContext(context);
    const text = _normalizeText([
      key,
      context.location?.title,
      context.location?.kind,
      ...(context.location?.tags || [])
    ].join(' '));
    let theme = 'forest';
    if (['dungeon', 'cave', 'sewer', 'house'].includes(key)) theme = 'cave';
    else if (key === 'temple') theme = 'temple';
    else if (key === 'ruins') theme = 'ruins';
    else if (['urban', 'tavern', 'castle', 'arena'].includes(key)) theme = 'arena';
    else if (key === 'mountain' || /snow|ice|frost|ridge|tundra/.test(text)) theme = 'tundra';
    return { theme, width: 8 + Math.floor(Math.random() * 3), height: 8 + Math.floor(Math.random() * 3) };
  }

  function _travelCheckDc(context = {}) {
    const run = CS().getState()?.activeScenarioRun;
    const danger = Number(run?.danger || 0);
    const repeat = Number(context.visitCount || 1) > 1 ? 1 : 0;
    return Math.max(7, Math.min(16, 9 + Math.floor(danger / 2) + repeat));
  }

  function _activePartyRankValue() {
    const state = CS().getState();
    const ranks = Object.values(state?.party || {})
      .filter(_memberCanTravel)
      .map((member) => _rankValue(member.rank));
    if (!ranks.length) return 1;
    return ranks.reduce((sum, value) => sum + value, 0) / ranks.length;
  }

  function _rankValue(rank) {
    return RANK_ORDER[String(rank || 'F').toUpperCase()] || 1;
  }

  function _weightedPick(entries = []) {
    const weighted = entries
      .map((entry) => ({ entry, weight: Number(entry.weight ?? 1) }))
      .filter(({ weight }) => Number.isFinite(weight) && weight > 0);
    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    if (!total) return null;
    let roll = Math.random() * total;
    for (const { entry, weight } of weighted) {
      roll -= weight;
      if (roll <= 0) return entry;
    }
    return weighted[weighted.length - 1]?.entry || null;
  }

  function _locationTitle(location = {}) {
    return location.title || location.name || location.id || '';
  }

  function _titleCase(value) {
    return String(value || 'Area').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function _normalizeText(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9_]+/g, ' ').trim();
  }

  function _clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function _seedRoleToKind(role) {
    const r = String(role || '').toLowerCase();
    if (r.includes('entrance')) return 'entrance';
    if (r.includes('exit') || r.includes('return')) return 'exit';
    if (r.includes('battle')) return 'battle';
    if (r.includes('boss')) return 'boss';
    if (r.includes('trap')) return 'trap';
    if (r.includes('rest') || r.includes('camp')) return 'rest';
    if (r.includes('shop') || r.includes('reward')) return 'shop';
    if (r.includes('clue') || r.includes('choice') || r.includes('gather') || r.includes('resource')) return 'event';
    return 'event_battle';
  }

  function _seededRng(seedStr) {
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 15), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return ((h >>> 0) / 4294967296);
    };
  }

  function _pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function rollRandomBattle(tableId) {
    const scenario = CS().getActiveScenario();
    const tables = scenario?.randomBattleTables || [];
    const table = tables.find((entry) => entry.id === tableId) || tables[0];
    if (!table || !Array.isArray(table.entries) || table.entries.length === 0) {
      if (tableId && (_battleCardById(tableId) || _encounterById(tableId))) {
        return _queueBattleEntry(_battleEntryFromRef(tableId), { source: 'random' });
      }
      const fallback = _monsterBattleEntry({ source: 'random_fallback', tableId });
      return fallback ? _queueBattleEntry(fallback, { source: 'random_monster_pool', tableId }) : null;
    }
    const entry = window.CJS.CampaignEvents.weightedPick(table.entries);
    return _queueBattleEntry(entry, { source: 'random', tableId: table.id });
  }

  function _queueBattleEntry(entry, meta = {}) {
    const normalized = _normalizeBattleEntry(entry);
    if (!normalized.encounterId && !normalized.battleSetId && !normalized.monsterIds?.length) return null;
    const run = CS().getState().activeScenarioRun;
    const pending = {
      encounterId: normalized.encounterId || null,
      battleSetId: normalized.battleSetId || null,
      monsterIds: normalized.monsterIds || [],
      label: normalized.label || normalized.encounterId || normalized.battleSetId,
      mapId: run?.mapId || null,
      tableId: meta.tableId || normalized.tableId || null,
      nodeId: run?.currentNode || null,
      cellKey: meta.cellKey || (run?.currentCell ? _cellKey(run.currentCell.x, run.currentCell.y, run.mapLayer, CS().getActiveMap()) : null),
      source: meta.source || normalized.source || 'random',
      threatId: meta.threatId || normalized.threatId || null,
      rewardOps: normalized.rewardOps || [],
      ..._defeatFields(normalized),
      objective: normalized.objective || '',
      notes: normalized.notes || '',
      battleMap: normalized.battleMap || null,
      setting: normalized.setting || CS().getActiveScenario()?.setting || null,
      tags: normalized.tags || [],
      contextTags: normalized.contextTags || [],
      monsterTags: normalized.monsterTags || []
    };
    const questContext = window.CJS.CampaignQuestPulse?.battleContextForPending?.(CS().getState(), pending) || null;
    if (questContext) {
      pending.questId = questContext.questId || null;
      pending.questChainId = questContext.questChainId || null;
      pending.objectiveId = questContext.objectiveId || null;
      pending.questContext = questContext;
      pending.contextTags = questContext.contextTags || pending.contextTags || [];
      pending.monsterTags = questContext.monsterTags || pending.monsterTags || [];
    }
    CS().mutate((state) => {
      state.pendingBattle = pending;
      if (state.activeScenarioRun) state.activeScenarioRun.randomBattlesUsed += 1;
    }, { source: 'random_battle' });
    Ops().apply({ op: 'log', text: `Random battle triggered: ${pending.label}.` }, { source: 'random_battle' });
    window.CJS.CampaignPartyChat?.auto?.({
      world: CS().getState()?.currentWorld,
      situation: 'battle_ready',
      scenarioId: CS().getState()?.activeScenarioRun?.scenarioId || '',
      locationKind: pending.source === 'random' ? 'battle' : ''
    }, { chance: 0.5 });
    return pending;
  }

  function _normalizeBattleEntry(entry = {}) {
    if (typeof entry === 'string') return _battleEntryFromRef(entry);
    if (entry.battleSetId) {
      const card = _battleCardById(entry.battleSetId);
      return {
        ...entry,
        battleSetId: entry.battleSetId,
        encounterId: entry.encounterId || card?.encounterId || null,
        monsterIds: _monsterIdsFromEntry(entry),
        label: entry.label || card?.name || entry.battleSetId,
        rewardOps: entry.rewardOps || card?.rewardOps || [],
        ..._defeatFields(entry, card),
        objective: entry.objective || card?.objective || '',
        notes: entry.notes || card?.gimmick || '',
        battleMap: entry.battleMap || _battleMapForCard(card),
        tags: entry.tags || card?.tags || [],
        contextTags: entry.contextTags || card?.tags || [],
        monsterTags: entry.monsterTags || card?.tags || []
      };
    }
    if (entry.encounterId) {
      const encounter = _encounterById(entry.encounterId);
      return {
        ...entry,
        encounterId: entry.encounterId,
        monsterIds: _monsterIdsFromEntry(entry),
        label: entry.label || encounter?.name || entry.encounterId,
        ..._defeatFields(entry)
      };
    }
    if (_monsterIdsFromEntry(entry).length) {
      return {
        ...entry,
        encounterId: entry.encounterId || null,
        battleSetId: entry.battleSetId || null,
        monsterIds: _monsterIdsFromEntry(entry),
        label: entry.label || entry.name || 'Travel Encounter',
        ..._defeatFields(entry)
      };
    }
    return entry;
  }

  function _defeatFields(entry = {}, card = {}) {
    const defeatOutcome = entry.defeatOutcome || card?.defeatOutcome || null;
    const defeatMode = entry.defeatMode || card?.defeatMode || null;
    return {
      defeatOps: entry.defeatOps || entry.lossOps || card?.defeatOps || card?.lossOps || [],
      drawOps: entry.drawOps || card?.drawOps || [],
      badEndingOps: entry.badEndingOps || card?.badEndingOps || [],
      badEndingOnDefeat: !!(entry.badEndingOnDefeat || card?.badEndingOnDefeat || defeatOutcome === 'bad_ending' || defeatMode === 'bad_ending'),
      badEndingFlag: entry.badEndingFlag || card?.badEndingFlag || null,
      defeatOutcome,
      defeatMode,
      defeatNoRecovery: !!(entry.defeatNoRecovery || entry.noDefeatRecovery || card?.defeatNoRecovery || card?.noDefeatRecovery)
    };
  }

  function _monsterIdsFromEntry(entry = {}) {
    const ids = entry.monsterIds || entry.enemyIds || entry.enemies || (entry.monsterId ? [entry.monsterId] : []);
    return (Array.isArray(ids) ? ids : [ids]).map((id) => String(id || '').trim()).filter((id) => id && window.CJS.DataStore?.exists?.('monsters', id));
  }

  function _battleEntryFromRef(ref) {
    const id = typeof ref === 'string' ? ref : ref?.id;
    if (!id) return {};
    const card = _battleCardById(id);
    if (card) {
      return {
        battleSetId: card.id,
        encounterId: card.encounterId || null,
        label: card.name || card.id,
        rewardOps: card.rewardOps || [],
        ..._defeatFields(card),
        objective: card.objective || '',
        notes: card.gimmick || '',
        battleMap: _battleMapForCard(card),
        tags: card.tags || [],
        contextTags: card.tags || [],
        monsterTags: card.tags || []
      };
    }
    const encounter = _encounterById(id);
    return {
      encounterId: encounter?.id || id,
      label: encounter?.name || id
    };
  }

  function _battleCardById(id) {
    return window.CJS.CampaignBattleSetForge?.getCard?.(id)
      || window.CJS.CampaignDataLoader?.getBattleSetCard?.(id)
      || null;
  }

  function _encounterById(id) {
    return window.CJS.DataStore?.get?.('encounters', id) || null;
  }

  function _firstBattleRef(node) {
    return node.battleSetIds?.[0] || node.encounterIds?.[0] || node.encounterId || null;
  }

  function _battleMapForCard(card = {}) {
    if (!card) return null;
    const text = [card.name, card.objective, card.gimmick, ...(card.tags || [])].join(' ').toLowerCase();
    let theme = 'forest';
    if (/temple|shrine|holy/.test(text)) theme = 'temple';
    else if (/ruins|relic|pillar/.test(text)) theme = 'ruins';
    else if (/cave|cellar|sewer|underground|den/.test(text)) theme = 'cave';
    else if (/snow|ice|frost|ridge|mountain/.test(text)) theme = 'tundra';
    else if (/arena|spar|training|guild|tavern|house|urban|street/.test(text)) theme = 'arena';
    return {
      theme,
      width: Number(card.grid?.width || 8),
      height: Number(card.grid?.height || 8)
    };
  }

  function findNode(map, nodeId) {
    return (map?.nodes || []).find((node) => node.id === nodeId) || null;
  }

  function findCurrentNode() {
    const run = CS().getState()?.activeScenarioRun;
    return run ? findNode(CS().getActiveMap(), run.currentNode) : null;
  }

  function buildReport(state, outcome) {
    const run = state.activeScenarioRun;
    const scenario = CS().getScenarioById(run.scenarioId);
    const exit = _snapshotForReport(state);
    return {
      id: `report_${Date.now()}`,
      scenarioId: run.scenarioId,
      scenarioName: scenario?.name || run.scenarioId,
      runId: run.runId,
      outcome,
      startedAtPhase: run.startedAtPhase,
      endedAtPhase: state.phase.number,
      entrySnapshot: run.entrySnapshot,
      exitSnapshot: exit,
      diff: _diffSnapshots(run.entrySnapshot, exit),
      danger: run.danger,
      usedCampRests: run.usedCampRests,
      eventsUsed: run.eventsUsed,
      randomBattlesUsed: run.randomBattlesUsed,
      completedBattles: CS().clone(run.completedBattles || []),
      notes: CS().clone(run.notes || []),
      endedAt: new Date().toISOString()
    };
  }

  function _snapshotForReport(state) {
    return {
      currencies: CS().clone(state.currencies || {}),
      inventory: CS().clone(state.inventory || {}),
      party: Object.fromEntries(Object.entries(state.party || {}).map(([id, member]) => [id, {
        currentHp: member.currentHp,
        maxHp: member.maxHp,
        currentMp: member.currentMp,
        maxMp: member.maxMp,
        statuses: CS().clone(member.statuses || [])
      }])),
      quests: CS().clone(state.quests || {})
    };
  }

  function _diffMap(before = {}, after = {}) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const out = {};
    for (const key of keys) {
      const delta = (after[key] || 0) - (before[key] || 0);
      if (delta) out[key] = delta;
    }
    return out;
  }

  function _diffSnapshots(before, after) {
    return {
      currencies: _diffMap(before.currencies, after.currencies),
      items: _diffMap(before.inventory?.items, after.inventory?.items),
      materials: _diffMap(before.inventory?.materials, after.inventory?.materials),
      food: _diffMap(before.inventory?.food, after.inventory?.food),
      questItems: _diffMap(before.inventory?.questItems, after.inventory?.questItems),
      party: Object.fromEntries(Object.entries(after.party || {}).map(([id, member]) => {
        const prev = before.party?.[id] || {};
        return [id, {
          hp: (member.currentHp || 0) - (prev.currentHp || 0),
          mp: (member.currentMp || 0) - (prev.currentMp || 0),
          statuses: (member.statuses || []).map((status) => status.id)
        }];
      }))
    };
  }

  function _defaultRevealedNodes(map, startNode) {
    const out = new Set();
    for (const node of map?.nodes || []) {
      if (node.discoveredByDefault || node.id === startNode) out.add(node.id);
    }
    for (const id of _adjacentNodeIds(map, startNode)) out.add(id);
    return Array.from(out);
  }

  function _defaultRevealedCells(map, startCell, levelId = null) {
    if (!map || map.type !== 'grid_map' || !startCell) return [];
    const activeLevelId = _defaultGridLevelId(map, levelId);
    const out = new Set([_cellKey(startCell.x, startCell.y, activeLevelId, map)]);
    for (const cell of _gridCellsForLevel(map, activeLevelId)) {
      if (cell.discoveredByDefault) out.add(_cellKey(cell.x, cell.y, activeLevelId, map));
    }
    for (const cell of _adjacentCells(map, startCell.x, startCell.y, activeLevelId)) {
      out.add(_cellKey(cell.x, cell.y, cell.levelId || activeLevelId, map));
    }
    return Array.from(out);
  }

  function _revealNodeNeighborhood(map, nodeId) {
    if (!map || !nodeId) return;
    const ids = [nodeId, ..._adjacentNodeIds(map, nodeId)];
    CS().mutate((state) => {
      const run = state.activeScenarioRun;
      if (!run) return;
      const mapId = run.mapId || map.id;
      const mapState = state.mapState[mapId] = state.mapState[mapId] || { visited: {}, revealed: {}, locked: {}, cleared: {}, notes: {} };
      run.revealedNodes = run.revealedNodes || [];
      for (const id of ids) {
        mapState.revealed[id] = true;
        if (!run.revealedNodes.includes(id)) run.revealedNodes.push(id);
      }
      const layer = _nodeLayer(findNode(map, nodeId));
      if (layer) run.mapLayer = layer;
    }, { source: 'map_reveal' });
  }

  function _adjacentNodeIds(map, nodeId) {
    if (!map || !nodeId) return [];
    const out = new Set();
    const node = findNode(map, nodeId);
    for (const exit of node?.exits || []) out.add(exit.to);
    for (const other of map.nodes || []) {
      if ((other.exits || []).some((exit) => exit.to === nodeId)) out.add(other.id);
    }
    return Array.from(out);
  }

  function _revealCellNeighborhood(map, x, y, levelId = null) {
    if (!map) return;
    const activeLevelId = _defaultGridLevelId(map, levelId);
    const cells = [_gridCell(map, x, y, activeLevelId), ..._adjacentCells(map, x, y, activeLevelId)].filter(Boolean);
    CS().mutate((state) => {
      const run = state.activeScenarioRun;
      if (!run) return;
      const mapId = run.mapId || map.id;
      const mapState = state.mapState[mapId] = state.mapState[mapId] || { visited: {}, revealed: {}, locked: {}, cleared: {}, notes: {} };
      mapState.revealedCells = mapState.revealedCells || {};
      run.revealedCells = run.revealedCells || [];
      for (const cell of cells) {
        const key = _cellKey(cell.x, cell.y, cell.levelId || activeLevelId, map);
        mapState.revealedCells[key] = true;
        if (!run.revealedCells.includes(key)) run.revealedCells.push(key);
      }
    }, { source: 'grid_reveal' });
  }

  function _adjacentCells(map, x, y, levelId = null) {
    return [
      [Number(x) + 1, Number(y)],
      [Number(x) - 1, Number(y)],
      [Number(x), Number(y) + 1],
      [Number(x), Number(y) - 1]
    ].map(([cx, cy]) => _gridCell(map, cx, cy, levelId)).filter((cell) => cell && _cellPassable(map, cell.x, cell.y, cell.levelId || levelId));
  }

  function _gridCell(map, x, y, levelId = null) {
    const cx = Number(x);
    const cy = Number(y);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
    const activeLevelId = _defaultGridLevelId(map, levelId || CS().getState()?.activeScenarioRun?.mapLayer);
    const level = _gridLevel(map, activeLevelId);
    const width = Number(level?.width || map.width || map.cols || map.columns || 0);
    const height = Number(level?.height || map.height || map.rows || 0);
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) return null;
    const authored = _gridCellsForLevel(map, activeLevelId).find((cell) => Number(cell.x) === cx && Number(cell.y) === cy);
    return {
      id: authored?.id || _cellKey(cx, cy, activeLevelId, map),
      x: cx,
      y: cy,
      levelId: activeLevelId,
      levelName: _gridLevelName(map, activeLevelId),
      title: authored?.title || authored?.name || _cellKey(cx, cy, activeLevelId, map),
      kind: authored?.kind || _terrainAt(map, cx, cy, activeLevelId),
      notes: authored?.notes || '',
      tags: authored?.tags || [],
      onEnter: authored?.onEnter || [],
      randomBattle: authored?.randomBattle || null,
      discoveredByDefault: authored?.discoveredByDefault || false,
      nextLevelId: authored?.nextLevelId || authored?.stairsTo || null,
      nextCell: authored?.nextCell || authored?.exitCell || null,
      questObjective: authored?.questObjective || null
    };
  }

  function _cellPassable(map, x, y, levelId = null) {
    const terrain = _terrainAt(map, x, y, levelId);
    return !['wall', 'obstacle', 'blocked', 'void', 'rock', 'pillar'].includes(String(terrain || '').toLowerCase());
  }

  function _terrainAt(map, x, y, levelId = null) {
    const activeLevelId = _defaultGridLevelId(map, levelId || CS().getState()?.activeScenarioRun?.mapLayer);
    const level = _gridLevel(map, activeLevelId);
    const row = level?.terrain?.[Number(y)] || level?.grid?.[Number(y)] || map.terrain?.[Number(y)] || map.grid?.[Number(y)];
    return row?.[Number(x)] || 'floor';
  }

  function _normalizeCell(value) {
    if (Array.isArray(value)) return { x: Number(value[0] || 0), y: Number(value[1] || 0) };
    return { x: Number(value?.x || 0), y: Number(value?.y || 0) };
  }

  function _cellKey(x, y, levelId = null, map = null) {
    const base = `${Number(x)},${Number(y)}`;
    if (map && _usesGridLevels(map)) return `${_defaultGridLevelId(map, levelId)}:${base}`;
    if (!map && levelId && String(levelId) !== 'level_1') return `${String(levelId)}:${base}`;
    return base;
  }

  function _usesGridLevels(map = {}) {
    return Array.isArray(map?.levels) && map.levels.length > 0;
  }

  function _gridLevels(map = {}) {
    if (_usesGridLevels(map)) return map.levels;
    return [{
      id: map.defaultLevelId || 'level_1',
      name: map.levelName || map.name || 'Map',
      width: map.width || map.cols || map.columns || 0,
      height: map.height || map.rows || 0,
      terrain: map.terrain || map.grid || [],
      cells: map.cells || []
    }];
  }

  function _gridLevel(map = {}, levelId = null) {
    const wanted = _defaultGridLevelId(map, levelId);
    return _gridLevels(map).find((level) => _normalizeLayerId(level.id || level.layerId || 'level_1') === wanted) || _gridLevels(map)[0] || null;
  }

  function _defaultGridLevelId(map = {}, preferred = null) {
    const wanted = preferred ? _normalizeLayerId(preferred) : '';
    if (_usesGridLevels(map) && wanted) return wanted;
    if (_usesGridLevels(map)) {
      return _normalizeLayerId(map.defaultLevelId || map.levels?.[0]?.id || map.levels?.[0]?.layerId || 'level_1');
    }
    return wanted || _normalizeLayerId(map.defaultLevelId || 'level_1');
  }

  function _gridLevelDefaultStartCell(map = {}, levelId = null) {
    const level = _gridLevel(map, levelId);
    return level?.defaultStartCell || level?.startCell || null;
  }

  function _gridLevelName(map = {}, levelId = null) {
    const level = _gridLevel(map, levelId);
    return level?.name || level?.label || String(levelId || 'Level').replace(/_/g, ' ');
  }

  function _gridCellsForLevel(map = {}, levelId = null) {
    const level = _gridLevel(map, levelId);
    if (_usesGridLevels(map)) return level?.cells || [];
    return map.cells || [];
  }

  function _gridLevelIndex(map = {}, levelId = null) {
    const wanted = _defaultGridLevelId(map, levelId);
    const levels = _gridLevels(map);
    const index = levels.findIndex((level) => _normalizeLayerId(level.id || level.layerId || 'level_1') === wanted);
    return index >= 0 ? index + 1 : 1;
  }

  function _normalizeMovingThreats(scenario = {}, map = null, options = {}) {
    const raw = [
      ...((Array.isArray(scenario?.movingThreats) ? scenario.movingThreats : [])),
      ...((Array.isArray(map?.movingThreats) ? map.movingThreats : []))
    ];
    if ((options.travelMode || map?.type) !== 'grid_map' && map?.type !== 'grid_map') return [];
    return raw.map((threat, index) => {
      const cell = _normalizeCell(threat.cell || [threat.x, threat.y]);
      const levelId = _defaultGridLevelId(map, threat.levelId || threat.layerId || threat.layer || options.startLevelId);
      let x = Number(cell.x || 0);
      let y = Number(cell.y || 0);
      // Defensive: if the authored spawn lands on an impassable cell, slide
      // the threat to the nearest passable neighbour so it can move and the
      // renderer doesn't paint the threat on top of a wall.
      if (map && !_cellPassable(map, x, y, levelId)) {
        const alt = _findPassableNeighbour(map, x, y, levelId);
        if (alt) { x = alt.x; y = alt.y; }
      }
      return {
        id: threat.id || `moving_threat_${index + 1}`,
        label: threat.label || threat.title || `Roaming Threat ${index + 1}`,
        levelId,
        x,
        y,
        icon: threat.icon || '!',
        // Optional explicit sprite path. The renderer falls back to the
        // shadow_stalker sheet (with directional animation) when this is
        // empty — matching the user's expectation that roamers look like
        // shadow creatures unless the scenario authored otherwise.
        sprite: threat.sprite || threat.portrait || '',
        portrait: threat.portrait || threat.sprite || '',
        moveMode: threat.moveMode || threat.move || 'random',
        moveChance: Number(threat.moveChance ?? 1),
        encounterId: threat.encounterId || null,
        battleSetId: threat.battleSetId || null,
        monsterIds: Array.isArray(threat.monsterIds) ? threat.monsterIds.slice() : [],
        rewardOps: Array.isArray(threat.rewardOps) ? threat.rewardOps.slice() : [],
        defeatOps: Array.isArray(threat.defeatOps) ? threat.defeatOps.slice() : [],
        drawOps: Array.isArray(threat.drawOps) ? threat.drawOps.slice() : [],
        defeatOutcome: threat.defeatOutcome || null,
        defeatMode: threat.defeatMode || null,
        defeatNoRecovery: !!threat.defeatNoRecovery,
        notes: threat.notes || 'A moving threat can trigger an immediate battle on contact.',
        objective: threat.objective || '',
        tags: Array.isArray(threat.tags) ? threat.tags.slice() : []
      };
    }).filter((threat) => Number.isFinite(threat.x) && Number.isFinite(threat.y));
  }

  // Breadth-first search for the closest passable cell. Limits its search
  // radius so a fully sealed level can't loop forever.
  function _findPassableNeighbour(map, x, y, levelId, maxRadius = 4) {
    const queue = [{ x: Number(x), y: Number(y), d: 0 }];
    const seen = new Set([`${Number(x)},${Number(y)}`]);
    while (queue.length) {
      const cur = queue.shift();
      if (cur.d > 0 && _cellPassable(map, cur.x, cur.y, levelId)) return { x: cur.x, y: cur.y };
      if (cur.d >= maxRadius) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        const key = `${nx},${ny}`;
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push({ x: nx, y: ny, d: cur.d + 1 });
      }
    }
    return null;
  }

  function _stepMovingThreats(map, target = {}, targetKey = '') {
    const state = CS().getState();
    const run = state?.activeScenarioRun;
    if (!run || run.travelMode !== 'grid_map' || !map) return null;
    const currentLevelId = _defaultGridLevelId(map, target.levelId || run.mapLayer);
    const threats = Array.isArray(run.movingThreats) ? run.movingThreats.slice() : [];
    if (!threats.length) return null;
    const contact = threats.find((threat) =>
      _defaultGridLevelId(map, threat.levelId) === currentLevelId
      && _cellKey(threat.x, threat.y, threat.levelId, map) === targetKey);
    if (contact) return _queueMovingThreatBattle(contact, map, targetKey);
    const occupied = new Set(threats.map((threat) => _cellKey(threat.x, threat.y, threat.levelId, map)));
    occupied.add(targetKey); // player cell is "occupied" so threats don't overlap unless chasing
    let nextThreats = threats.map((threat) => ({ ...threat }));
    let triggered = null;
    const targetX = Number(target.x);
    const targetY = Number(target.y);
    for (const threat of nextThreats) {
      if (_defaultGridLevelId(map, threat.levelId) !== currentLevelId) continue;
      const mode = String(threat.moveMode || 'random').toLowerCase();
      if (mode === 'static') continue;
      if (Math.random() > Math.max(0, Math.min(1, Number(threat.moveChance ?? 1)))) continue;
      const fromKey = _cellKey(threat.x, threat.y, threat.levelId, map);
      occupied.delete(fromKey);
      let neighbors = _adjacentCells(map, threat.x, threat.y, threat.levelId)
        .filter((cell) => !occupied.has(_cellKey(cell.x, cell.y, cell.levelId || threat.levelId, map))
                       || (cell.x === targetX && cell.y === targetY));
      // If totally walled in, allow staying put.
      let pick = null;
      if (neighbors.length) {
        if (mode === 'chase' || mode === 'pursue') {
          // Lowest manhattan distance to player; deterministic with small jitter.
          neighbors = neighbors.map((cell) => ({
            cell,
            dist: Math.abs(Number(cell.x) - targetX) + Math.abs(Number(cell.y) - targetY)
          }));
          const minDist = Math.min(...neighbors.map((n) => n.dist));
          const best = neighbors.filter((n) => n.dist === minDist);
          pick = best[Math.floor(Math.random() * best.length)].cell;
        } else if (mode === 'patrol') {
          // Prefer continuing in the last direction; otherwise random.
          const last = threat._lastDir;
          let preferred = null;
          if (last) {
            const want = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[last];
            if (want) {
              preferred = neighbors.find((c) =>
                Number(c.x) - Number(threat.x) === want[0]
                && Number(c.y) - Number(threat.y) === want[1]);
            }
          }
          pick = preferred || neighbors[Math.floor(Math.random() * neighbors.length)];
        } else {
          // random
          pick = neighbors[Math.floor(Math.random() * neighbors.length)];
        }
      }
      if (pick) {
        const oldX = Number(threat.x);
        const oldY = Number(threat.y);
        const dx = Number(pick.x) - Number(threat.x);
        const dy = Number(pick.y) - Number(threat.y);
        threat._lastDir = Math.abs(dx) >= Math.abs(dy)
          ? (dx >= 0 ? 'right' : 'left')
          : (dy >= 0 ? 'down' : 'up');
        threat.x = Number(pick.x);
        threat.y = Number(pick.y);
        threat.levelId = _defaultGridLevelId(map, pick.levelId || threat.levelId);
        if (Number(threat.x) !== oldX || Number(threat.y) !== oldY) threat._motionAt = Date.now();
      }
      const movedKey = _cellKey(threat.x, threat.y, threat.levelId, map);
      occupied.add(movedKey);
      if (movedKey === targetKey && !triggered) triggered = { ...threat };
    }
    CS().mutate((next) => {
      if (!next.activeScenarioRun) return;
      next.activeScenarioRun.movingThreats = nextThreats;
    }, { source: 'moving_threat_step' });
    if (triggered) return _queueMovingThreatBattle(triggered, map, targetKey);
    return null;
  }

  function _queueMovingThreatBattle(threat = {}, map = null, cellKey = '') {
    if (!threat) return null;
    Ops().apply({ op: 'log', text: `Moving threat intercepts the party: ${threat.label || threat.id}.` }, { source: 'moving_threat' });
    return _queueBattleEntry(threat, {
      source: 'moving_threat',
      threatId: threat.id,
      cellKey
    });
  }

  function _resolveMovingThreatBattle(outcome = 'victory', pending = {}) {
    if (pending?.source !== 'moving_threat' || !pending?.threatId) return;
    const normalized = String(outcome || '').toLowerCase();
    if (!['victory', 'win', 'success'].includes(normalized)) return;
    CS().mutate((state) => {
      const threats = state.activeScenarioRun?.movingThreats;
      if (!Array.isArray(threats)) return;
      state.activeScenarioRun.movingThreats = threats.filter((threat) => threat.id !== pending.threatId);
    }, { source: 'moving_threat_clear' });
    Ops().apply({ op: 'log', text: `Moving threat cleared: ${pending.label || pending.threatId}.` }, { source: 'moving_threat' });
  }

  function _forceRevealObjective(action = {}, context = {}) {
    const map = context.map || CS().getActiveMap();
    let changed = false;
    CS().mutate((state) => {
      const objective = state.activeScenarioRun?.objectiveState;
      if (!objective || objective.visible) return;
      objective.visible = true;
      objective.revealedAt = new Date().toISOString();
      objective.revealSource = action.reason || action.source || 'trigger';
      changed = true;
    }, { source: 'scenario_objective_force_reveal' });
    if (changed) {
      Ops().apply({ op: 'log', text: `Objective revealed: ${CS().getState()?.activeScenarioRun?.objectiveState?.label || 'Objective'}.` }, { source: 'scenario_objective_force_reveal' });
    }
    return map;
  }

  function _transitionGridLevel(map, cell = {}) {
    const nextLevelId = _defaultGridLevelId(map, cell.nextLevelId);
    if (!nextLevelId) return null;
    const arrival = _normalizeCell(cell.nextCell || _gridLevelDefaultStartCell(map, nextLevelId) || [0, 0]);
    const arrivalKey = _cellKey(arrival.x, arrival.y, nextLevelId, map);
    CS().mutate((state) => {
      const run = state.activeScenarioRun;
      if (!run) return;
      run.mapLayer = nextLevelId;
      run.currentCell = { x: Number(arrival.x), y: Number(arrival.y) };
      run.visitedCells = run.visitedCells || [];
      run.revealedCells = run.revealedCells || [];
      if (!run.visitedCells.includes(arrivalKey)) run.visitedCells.push(arrivalKey);
      if (!run.revealedCells.includes(arrivalKey)) run.revealedCells.push(arrivalKey);
      const mapState = state.mapState[run.mapId || map.id] = state.mapState[run.mapId || map.id] || { visited: {}, revealed: {}, locked: {}, cleared: {}, notes: {} };
      mapState.visitedCells = mapState.visitedCells || {};
      mapState.revealedCells = mapState.revealedCells || {};
      mapState.visitedCells[arrivalKey] = true;
      mapState.revealedCells[arrivalKey] = true;
    }, { source: 'grid_level_transition' });
    _revealCellNeighborhood(map, arrival.x, arrival.y, nextLevelId);
    Ops().apply({ op: 'log', text: `Level transition: ${_gridLevelName(map, nextLevelId)}.` }, { source: 'grid_level_transition' });
    return _gridCell(map, arrival.x, arrival.y, nextLevelId);
  }

  function _defaultMapLayer(map, startNode) {
    const start = findNode(map, startNode);
    return _nodeLayer(start) || _layerDefs(map || {}, map?.nodes || [])[0]?.id || 'layer_1';
  }

  function _nodeLayer(node) {
    return node ? _normalizeLayerId(node.layer || node.layerId || 'layer_1') : null;
  }

  function _layerDefs(seed, nodes) {
    const explicit = Array.isArray(seed.layers) ? seed.layers : [];
    if (explicit.length) {
      return explicit.map((layer, index) => ({
        id: _normalizeLayerId(layer.id || layer.layerId || `layer_${index + 1}`),
        name: layer.name || layer.label || `Layer ${index + 1}`
      }));
    }
    const fromNodes = Array.from(new Set((nodes || []).map((node) => _normalizeLayerId(node.layer || node.layerId || 'layer_1'))));
    return (fromNodes.length ? fromNodes : ['layer_1']).map((id, index) => ({ id, name: `Layer ${index + 1}` }));
  }

  function _normalizeLayerId(value) {
    return String(value || 'layer_1').replace(/\s+/g, '_').toLowerCase();
  }

  function _layerName(seed, layerId) {
    const found = (seed.layers || []).find((layer) => _normalizeLayerId(layer.id || layer.layerId) === layerId);
    return found?.name || found?.label || layerId.replace(/_/g, ' ');
  }

  function _checkToOperation(check) {
    return {
      op: check.type === 'qte_or_dice' ? 'run_qte_or_dice' : 'roll_check',
      stat: check.stat,
      dc: check.dc,
      success: check.success,
      fail: check.fail
    };
  }

  function applyAutomaticPartyAvailability(scenario = {}) {
    CS().mutate((state) => {
      for (const [id, member] of Object.entries(state.party || {})) {
        if (Number(member.currentHp || 0) <= 0) {
          member.availability = {
            status: 'injured',
            reason: '0 HP at scenario start',
            source: 'auto_hp',
            expires: 'scenario',
            updatedAt: new Date().toISOString()
          };
        }
      }
      for (const rule of scenario.partyRestrictions || scenario.partyAvailability || []) {
        const id = rule.characterId || rule.target || rule.id;
        if (!id || !state.party[id]) continue;
        if (rule.unlessFlag && state.flags?.[rule.unlessFlag]) continue;
        if (rule.requiresFlag && !state.flags?.[rule.requiresFlag]) continue;
        state.party[id].availability = {
          status: rule.status || 'unavailable',
          reason: rule.reason || 'Scenario circumstance',
          source: rule.source || 'scenario',
          expires: rule.expires || 'scenario',
          updatedAt: new Date().toISOString()
        };
      }
    }, { source: 'party_availability_auto' });
  }

  function _clearScenarioAvailability(state) {
    for (const member of Object.values(state.party || {})) {
      if (member.availability?.expires === 'scenario') {
        member.availability = {
          status: 'available',
          reason: '',
          source: 'scenario_end',
          expires: null,
          updatedAt: new Date().toISOString()
        };
      }
    }
  }

  return Object.freeze({
    startScenario,
    endScenario,
    moveToNode,
    moveToCell,
    advanceLinearBeat,
    expandProceduralMap,
    maybeTriggerRandomBattle,
    rollRandomBattle,
    rollTravelSurprise,
    findNode,
    findCurrentNode,
    findCell: _gridCell,
    findCurrentCell: () => {
      const run = CS().getState()?.activeScenarioRun;
      const map = CS().getActiveMap();
      return run?.currentCell ? _gridCell(map, run.currentCell.x, run.currentCell.y, run.mapLayer) : null;
    },
    currentObjective,
    objectiveForNode,
    objectiveForCell,
    handleLocationEntry,
    handleBattleOutcome,
    explorationPercent: (state = CS().getState(), map = CS().getActiveMap()) => _explorationPercent(state?.activeScenarioRun || {}, map),
    applyAutomaticPartyAvailability,
    buildReport
  });
})();
