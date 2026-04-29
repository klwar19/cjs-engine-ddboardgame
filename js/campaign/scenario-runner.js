// scenario-runner.js
// Starts, moves, ends, and reports campaign scenario runs.

window.CJS = window.CJS || {};

window.CJS.ScenarioRunner = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const Ops = () => window.CJS.CampaignOps;

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

    if (Array.isArray(node.onEnter) && node.onEnter.length) {
      Ops().apply(node.onEnter, { source: 'node_enter' });
    }

    if (node.trap?.check) {
      CS().mutate((s) => { s.lastEvent = { type: 'trap', title: node.trap.title || node.title, prompt: node.trap.prompt || '', suggested: [_checkToOperation(node.trap.check)] }; }, { source: 'trap' });
    }

    if (node.randomBattle) {
      maybeTriggerRandomBattle(node.randomBattle);
    }

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
    const run = CS().getState().activeScenarioRun;
    if (!run) return null;
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

    if (beat.kind === 'battle' && beat.encounterId) {
      const pending = {
        encounterId: beat.encounterId,
        label: beat.label || beat.encounterId,
        beatId: beat.id,
        source: 'beat'
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
      return tableId ? _queueBattleEntry(_battleEntryFromRef(tableId), { source: 'random' }) : null;
    }
    const entry = window.CJS.CampaignEvents.weightedPick(table.entries);
    return _queueBattleEntry(entry, { source: 'random', tableId: table.id });
  }

  function _queueBattleEntry(entry, meta = {}) {
    const normalized = _normalizeBattleEntry(entry);
    if (!normalized.encounterId && !normalized.battleSetId) return null;
    const pending = {
      encounterId: normalized.encounterId || null,
      battleSetId: normalized.battleSetId || null,
      label: normalized.label || normalized.encounterId || normalized.battleSetId,
      tableId: meta.tableId || normalized.tableId || null,
      nodeId: CS().getState().activeScenarioRun?.currentNode || null,
      source: meta.source || normalized.source || 'random',
      rewardOps: normalized.rewardOps || [],
      objective: normalized.objective || '',
      notes: normalized.notes || ''
    };
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
        label: entry.label || card?.name || entry.battleSetId,
        rewardOps: entry.rewardOps || card?.rewardOps || [],
        objective: entry.objective || card?.objective || '',
        notes: entry.notes || card?.gimmick || ''
      };
    }
    if (entry.encounterId) {
      const encounter = _encounterById(entry.encounterId);
      return {
        ...entry,
        encounterId: entry.encounterId,
        label: entry.label || encounter?.name || entry.encounterId
      };
    }
    return entry;
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
        objective: card.objective || '',
        notes: card.gimmick || ''
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
