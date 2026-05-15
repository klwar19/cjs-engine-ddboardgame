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

  function startScenario(scenarioId) {
    const content = CS().getContent();
    const scenario = CS().getScenarioById(scenarioId);
    if (!scenario) throw new Error(`Scenario not found: ${scenarioId}`);
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
    const startCell = travelMode === 'grid_map'
      ? _normalizeCell(scenario.startCell || map?.defaultStartCell || map?.startCell || [0, 0])
      : null;
    const entrySnapshot = _snapshotForReport(CS().getState());

    CS().mutate((state) => {
      const runId = `run_${Date.now()}`;
      const revealed = _defaultRevealedNodes(map, startNode);
      const revealedCells = _defaultRevealedCells(map, startCell);
      state.activeScenarioRun = {
        runId,
        scenarioId,
        travelMode,
        mapId,
        proceduralMap,
        currentNode: startNode,
        currentCell: startCell,
        mapLayer: _defaultMapLayer(map, startNode),
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
        visitedCells: startCell ? [_cellKey(startCell.x, startCell.y)] : [],
        revealedCells,
        completedBattles: [],
        entrySnapshot,
        travelSteps: 0,
        revisitCounts: {},
        surpriseHistory: [],
        notes: []
      };
      if (mapId) {
        const mapState = state.mapState[mapId] = state.mapState[mapId] || { visited: {}, revealed: {}, locked: {}, cleared: {}, notes: {} };
        for (const nodeId of revealed) mapState.revealed[nodeId] = true;
        if (startNode) mapState.visited[startNode] = true;
        mapState.revealedCells = mapState.revealedCells || {};
        mapState.visitedCells = mapState.visitedCells || {};
        for (const cellId of revealedCells) mapState.revealedCells[cellId] = true;
        if (startCell) mapState.visitedCells[_cellKey(startCell.x, startCell.y)] = true;
      }
    }, { source: 'scenario_start' });

    applyAutomaticPartyAvailability(scenario);
    Ops().apply(scenario.entryOps || [], { source: 'scenario_entry' });
    Ops().apply({ op: 'log', text: `Scenario started: ${scenario.name || scenario.id} (${travelMode}).` }, { source: 'scenario' });
    window.CJS.CampaignPartyChat?.auto?.({ world: scenario.world || CS().getState()?.currentWorld, situation: 'scenario_start', scenarioId, tags: scenario.tags || [] }, { chance: 0.65 });
    if (startNode && (travelMode === 'node_map' || travelMode === 'procedural')) {
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
    return report;
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

    Ops().apply({ op: 'goto_node', nodeId }, { source: 'map_move' });
    _revealNodeNeighborhood(map, nodeId);

    if (window.CJS.CampaignStoryScenes?.prepareNodeEntry?.(node, map, { source: 'node_enter' })) {
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

    const scenario = CS().getActiveScenario();
    if ((scenario?.successConditions || []).some((cond) => cond.type === 'reach_node' && cond.nodeId === nodeId)) {
      Ops().apply({ op: 'log', text: `Scenario objective reached: ${node.title || nodeId}.` }, { source: 'scenario' });
    }
    return node;
  }

  function moveToCell(x, y) {
    const state = CS().getState();
    const run = state?.activeScenarioRun;
    const map = CS().getActiveMap();
    if (!run || !map || run.travelMode !== 'grid_map') return null;
    const target = _gridCell(map, x, y);
    if (!target || !_cellPassable(map, target.x, target.y)) return null;
    const current = run.currentCell || _normalizeCell(map.defaultStartCell || [0, 0]);
    const distance = Math.abs(Number(target.x) - Number(current.x)) + Math.abs(Number(target.y) - Number(current.y));
    const targetKey = _cellKey(target.x, target.y);
    const alreadyVisited = (run.visitedCells || []).includes(targetKey);
    if (distance > 1 && !alreadyVisited) {
      Ops().apply({ op: 'log', text: `Move blocked: ${target.title || targetKey} is too far from the current cell.` }, { source: 'grid_move' });
      return null;
    }

    CS().mutate((next) => {
      const active = next.activeScenarioRun;
      if (!active) return;
      active.currentCell = { x: Number(target.x), y: Number(target.y) };
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

    _revealCellNeighborhood(map, target.x, target.y);

    if (Array.isArray(target.onEnter) && target.onEnter.length) {
      Ops().apply(target.onEnter, { source: 'grid_cell_enter' });
    }
    if (target.randomBattle) {
      maybeTriggerRandomBattle(target.randomBattle);
    }
    _maybeTravelSurprise({
      mode: 'grid_map',
      map,
      location: target,
      locationKey: targetKey,
      repeated: alreadyVisited
    });
    const scenario = CS().getActiveScenario();
    if ((scenario?.successConditions || []).some((cond) => cond.type === 'reach_cell' && Number(cond.x) === Number(target.x) && Number(cond.y) === Number(target.y))) {
      Ops().apply({ op: 'log', text: `Scenario objective reached: ${target.title || targetKey}.` }, { source: 'scenario' });
    }
    window.CJS.CampaignPartyChat?.auto?.({
      world: scenario?.world || state.currentWorld,
      situation: 'scenario',
      scenarioId: run.scenarioId,
      mapId: run.mapId,
      locationKind: target.kind || _terrainAt(map, target.x, target.y),
      tags: target.tags || []
    }, { chance: 0.28 });
    return target;
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
      size: scenario.size || seedRef.tags?.find((tag) => ['tiny', 'small', 'medium', 'large'].includes(tag)) || null,
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
      const tableId = _campaignEventTableId();
      if (tableId) ops.push({ op: 'roll_event', table: tableId, chance: 0.6 });
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

  function _campaignEventTableId() {
    const campaign = CS().getCurrentCampaign();
    const world = CS().getState()?.currentWorld;
    const list = campaign?.eventTables || [];
    return list.find((id) => id.includes(world)) || list[0] || null;
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
      cellKey: run?.currentCell ? _cellKey(run.currentCell.x, run.currentCell.y) : null,
      source: meta.source || normalized.source || 'random',
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

  function _defaultRevealedCells(map, startCell) {
    if (!map || map.type !== 'grid_map' || !startCell) return [];
    const out = new Set([_cellKey(startCell.x, startCell.y)]);
    for (const cell of map.cells || []) {
      if (cell.discoveredByDefault) out.add(_cellKey(cell.x, cell.y));
    }
    for (const cell of _adjacentCells(map, startCell.x, startCell.y)) out.add(_cellKey(cell.x, cell.y));
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

  function _revealCellNeighborhood(map, x, y) {
    if (!map) return;
    const cells = [_gridCell(map, x, y), ..._adjacentCells(map, x, y)].filter(Boolean);
    CS().mutate((state) => {
      const run = state.activeScenarioRun;
      if (!run) return;
      const mapId = run.mapId || map.id;
      const mapState = state.mapState[mapId] = state.mapState[mapId] || { visited: {}, revealed: {}, locked: {}, cleared: {}, notes: {} };
      mapState.revealedCells = mapState.revealedCells || {};
      run.revealedCells = run.revealedCells || [];
      for (const cell of cells) {
        const key = _cellKey(cell.x, cell.y);
        mapState.revealedCells[key] = true;
        if (!run.revealedCells.includes(key)) run.revealedCells.push(key);
      }
    }, { source: 'grid_reveal' });
  }

  function _adjacentCells(map, x, y) {
    return [
      [Number(x) + 1, Number(y)],
      [Number(x) - 1, Number(y)],
      [Number(x), Number(y) + 1],
      [Number(x), Number(y) - 1]
    ].map(([cx, cy]) => _gridCell(map, cx, cy)).filter((cell) => cell && _cellPassable(map, cell.x, cell.y));
  }

  function _gridCell(map, x, y) {
    const cx = Number(x);
    const cy = Number(y);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
    const width = Number(map.width || map.cols || map.columns || 0);
    const height = Number(map.height || map.rows || 0);
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) return null;
    const authored = (map.cells || []).find((cell) => Number(cell.x) === cx && Number(cell.y) === cy);
    return {
      id: authored?.id || _cellKey(cx, cy),
      x: cx,
      y: cy,
      title: authored?.title || authored?.name || _cellKey(cx, cy),
      kind: authored?.kind || _terrainAt(map, cx, cy),
      notes: authored?.notes || '',
      tags: authored?.tags || [],
      onEnter: authored?.onEnter || [],
      randomBattle: authored?.randomBattle || null,
      discoveredByDefault: authored?.discoveredByDefault || false
    };
  }

  function _cellPassable(map, x, y) {
    const terrain = _terrainAt(map, x, y);
    return !['wall', 'obstacle', 'blocked', 'void'].includes(String(terrain || '').toLowerCase());
  }

  function _terrainAt(map, x, y) {
    const row = map.terrain?.[Number(y)] || map.grid?.[Number(y)];
    return row?.[Number(x)] || 'floor';
  }

  function _normalizeCell(value) {
    if (Array.isArray(value)) return { x: Number(value[0] || 0), y: Number(value[1] || 0) };
    return { x: Number(value?.x || 0), y: Number(value?.y || 0) };
  }

  function _cellKey(x, y) {
    return `${Number(x)},${Number(y)}`;
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
      return run?.currentCell ? _gridCell(map, run.currentCell.x, run.currentCell.y) : null;
    },
    applyAutomaticPartyAvailability,
    buildReport
  });
})();
