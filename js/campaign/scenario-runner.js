// scenario-runner.js
// Starts, moves, ends, and reports campaign scenario runs.

window.CJS = window.CJS || {};

window.CJS.ScenarioRunner = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const Ops = () => window.CJS.CampaignOps;

  function startScenario(scenarioId) {
    const content = CS().getContent();
    const scenario = content.scenarios[scenarioId];
    if (!scenario) throw new Error(`Scenario not found: ${scenarioId}`);
    const travelMode = scenario.travelMode || (scenario.mapId ? 'node_map' : 'freeform');

    let map = null;
    let proceduralMap = null;
    let mapId = null;

    if (travelMode === 'node_map') {
      map = content.scenarioMaps[scenario.mapId];
      mapId = scenario.mapId;
    } else if (travelMode === 'procedural') {
      proceduralMap = expandProceduralMap(scenario);
      map = proceduralMap;
      mapId = proceduralMap?.id || `proc_${scenarioId}`;
    }

    const startNode = travelMode === 'node_map' || travelMode === 'procedural'
      ? (scenario.startNode || map?.defaultStartNode || map?.nodes?.[0]?.id || null)
      : null;
    const entrySnapshot = _snapshotForReport(CS().getState());

    CS().mutate((state) => {
      const runId = `run_${Date.now()}`;
      const revealed = _defaultRevealedNodes(map, startNode);
      state.activeScenarioRun = {
        runId,
        scenarioId,
        travelMode,
        mapId,
        proceduralMap,
        currentNode: startNode,
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
        completedBattles: [],
        entrySnapshot,
        notes: []
      };
      if (mapId) {
        const mapState = state.mapState[mapId] = state.mapState[mapId] || { visited: {}, revealed: {}, locked: {}, cleared: {}, notes: {} };
        for (const nodeId of revealed) mapState.revealed[nodeId] = true;
        if (startNode) mapState.visited[startNode] = true;
      }
    }, { source: 'scenario_start' });

    Ops().apply(scenario.entryOps || [], { source: 'scenario_entry' });
    Ops().apply({ op: 'log', text: `Scenario started: ${scenario.name || scenario.id} (${travelMode}).` }, { source: 'scenario' });
    return CS().getState().activeScenarioRun;
  }

  function endScenario(outcome = 'success') {
    const state = CS().getState();
    const run = state?.activeScenarioRun;
    if (!run) return null;
    const scenario = CS().getContent().scenarios[run.scenarioId];
    const report = buildReport(state, outcome);

    CS().mutate((next) => {
      next.scenarioHistory.unshift(report);
      next.scenarioHistory = next.scenarioHistory.slice(0, 50);
      next.lastScenarioReport = report;
      next.activeScenarioRun = null;
      next.pendingBattle = null;
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

    const travelOps = [];
    if (link?.dangerChange) travelOps.push({ op: 'danger', amount: link.dangerChange });
    if (Array.isArray(link?.onTravel)) travelOps.push(...link.onTravel);
    if (link?.check) {
      travelOps.push(_checkToOperation(link.check));
    }
    if (travelOps.length) Ops().apply(travelOps, { source: 'map_travel' });

    Ops().apply({ op: 'goto_node', nodeId }, { source: 'map_move' });

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
  }

  function maybeTriggerRandomBattle(randomBattle) {
    const run = CS().getState().activeScenarioRun;
    if (!run) return null;
    const chance = Number(randomBattle.chance ?? 1);
    if (Math.random() > chance) return null;
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
    const cols = Math.max(seedNodes.length, 2);
    const rng = _seededRng(seed.id || 'proc');
    return seedNodes.map((node, idx) => {
      const t = cols === 1 ? 0.5 : idx / (cols - 1);
      const baseX = padX + t * (width - 2 * padX);
      const jitterX = (rng() - 0.5) * 30;
      const yMid = height / 2;
      const yJitter = (rng() - 0.5) * (height - 2 * padY);
      const kind = _seedRoleToKind(node.role);
      const exits = (exitsById[node.id] || []).map((to) => ({ to, label: `Travel to ${seedNodes.find((n) => n.id === to)?.name || to}` }));
      return {
        id: node.id,
        title: node.name || node.id,
        kind,
        x: Math.round(baseX + jitterX),
        y: Math.round(yMid + yJitter),
        tags: node.tags || [],
        notes: node.notes || node.role || '',
        discoveredByDefault: idx === 0,
        battleSetIds: node.battleSetIds || [],
        randomBattle: kind === 'battle' || kind === 'boss' || kind === 'event_battle'
          ? (node.battleSetIds?.length ? { chance: 0.85, table: node.battleSetIds[0] } : undefined)
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
    if (!table || !Array.isArray(table.entries) || table.entries.length === 0) return null;
    const entry = window.CJS.CampaignEvents.weightedPick(table.entries);
    const pending = {
      encounterId: entry.encounterId,
      label: entry.label || entry.encounterId,
      tableId: table.id,
      nodeId: CS().getState().activeScenarioRun?.currentNode || null,
      source: 'random'
    };
    CS().mutate((state) => {
      state.pendingBattle = pending;
      if (state.activeScenarioRun) state.activeScenarioRun.randomBattlesUsed += 1;
    }, { source: 'random_battle' });
    Ops().apply({ op: 'log', text: `Random battle triggered: ${pending.label}.` }, { source: 'random_battle' });
    return pending;
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
    const scenario = CS().getContent().scenarios[run.scenarioId];
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
    return Array.from(out);
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

  return Object.freeze({
    startScenario,
    endScenario,
    moveToNode,
    advanceLinearBeat,
    expandProceduralMap,
    maybeTriggerRandomBattle,
    rollRandomBattle,
    findNode,
    findCurrentNode,
    buildReport
  });
})();
