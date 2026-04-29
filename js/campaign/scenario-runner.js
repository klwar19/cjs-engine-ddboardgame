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
    const map = content.scenarioMaps[scenario.mapId];
    const startNode = scenario.startNode || map?.defaultStartNode || map?.nodes?.[0]?.id || null;
    const entrySnapshot = _snapshotForReport(CS().getState());

    CS().mutate((state) => {
      const runId = `run_${Date.now()}`;
      const revealed = _defaultRevealedNodes(map, startNode);
      state.activeScenarioRun = {
        runId,
        scenarioId,
        mapId: scenario.mapId,
        currentNode: startNode,
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
      const mapState = state.mapState[scenario.mapId] = state.mapState[scenario.mapId] || { visited: {}, revealed: {}, locked: {}, cleared: {}, notes: {} };
      for (const nodeId of revealed) mapState.revealed[nodeId] = true;
      if (startNode) mapState.visited[startNode] = true;
    }, { source: 'scenario_start' });

    Ops().apply(scenario.entryOps || [], { source: 'scenario_entry' });
    Ops().apply({ op: 'log', text: `Scenario started: ${scenario.name || scenario.id}.` }, { source: 'scenario' });
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
    maybeTriggerRandomBattle,
    rollRandomBattle,
    findNode,
    findCurrentNode,
    buildReport
  });
})();
