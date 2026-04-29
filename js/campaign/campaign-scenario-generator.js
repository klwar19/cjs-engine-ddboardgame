// campaign-scenario-generator.js
// Save-local scenario and layered node-map generator for Campaign Mode.

window.CJS = window.CJS || {};

window.CJS.CampaignScenarioGenerator = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const DS = () => window.CJS.DataStore;
  const Loader = () => window.CJS.CampaignDataLoader;
  const Runner = () => window.CJS.ScenarioRunner;

  const MAP_TYPES = ['any', 'urban', 'outdoor', 'dungeon', 'house', 'castle', 'mountain'];
  const MAP_FORMS = ['node_map', 'grid_map'];
  const SIZES = ['tiny', 'small', 'medium', 'large'];
  const SIZE_COUNTS = { tiny: 5, small: 7, medium: 9, large: 12 };
  const GRID_SIZES = { tiny: [5, 5], small: [6, 6], medium: [8, 6], large: [10, 8] };

  function generateAndStart(options = {}) {
    if (CS().getState()?.activeScenarioRun) return null;
    const result = generate(options);
    Runner().startScenario(result.scenario.id);
    return result;
  }

  function generate(options = {}) {
    const state = CS().getState();
    if (!state) throw new Error('No campaign save loaded.');
    const world = state.currentWorld || CS().getCurrentCampaign()?.world || 'haven';
    const opts = _normalizeOptions(options);
    const context = _sourceContext(opts.source, world);
    const seed = _pickMapSeed(opts, context, world) || _fallbackSeed(opts, context, world);
    const map = opts.mapForm === 'grid_map'
      ? _buildGridMap(seed, opts, context, world)
      : _buildMap(seed, opts, context, world);
    const scenario = _buildScenario(map, seed, opts, context, world);

    CS().mutate((next) => {
      const sc = _sideContentState(next);
      sc.generatedMaps[map.id] = map;
      sc.generatedScenarios[scenario.id] = scenario;
      sc.contentHistory.unshift({
        id: `hist_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        phase: next.phase?.number || 1,
        type: 'generated_scenario',
        title: scenario.name,
        result: `${opts.source}:${opts.mapType}:${opts.size}`,
        at: new Date().toISOString()
      });
      sc.contentHistory = sc.contentHistory.slice(0, 250);
      next.lastGeneratedScenario = { scenarioId: scenario.id, mapId: map.id, at: new Date().toISOString() };
      _log(next, `Generated scenario: ${scenario.name}.`);
    }, { source: 'scenario_generator' });

    return { scenario, map, seed, context, options: opts };
  }

  function options() {
    return {
      sources: ['random', 'active_quest', 'quest_chain'],
      mapForms: [...MAP_FORMS],
      mapTypes: [...MAP_TYPES],
      sizes: [...SIZES],
      layers: [1, 2, 3]
    };
  }

  function _normalizeOptions(options) {
    const mapType = MAP_TYPES.includes(options.mapType) ? options.mapType : 'any';
    const mapForm = MAP_FORMS.includes(options.mapForm) ? options.mapForm : 'node_map';
    const size = SIZES.includes(options.size) ? options.size : 'small';
    const layers = Math.max(1, Math.min(3, Number(options.layers || 1)));
    const source = ['random', 'active_quest', 'quest_chain'].includes(options.source) ? options.source : 'random';
    return { source, mapType, mapForm, size, layers };
  }

  function _sourceContext(source, world) {
    const state = CS().getState();
    if (source === 'active_quest') {
      const quest = Object.values(state.quests || {}).find((entry) => !['complete', 'completed', 'failed'].includes(String(entry.status || 'active')))
        || Object.values(state.quests || {})[0]
        || null;
      if (quest) {
        return {
          source,
          title: quest.title || quest.id,
          summary: quest.summary || '',
          tags: quest.tags || [],
          battleSetIds: quest.battleSetIds || [],
          mapSeedIds: quest.mapSeedIds || []
        };
      }
    }

    if (source === 'quest_chain') {
      const active = Object.values(state.sideContent?.activeQuestChains || {})[0] || null;
      const template = active ? Loader().getQuestChainTemplate(active.templateId) : _pick(Loader().getQuestChainTemplates(world));
      const chain = template || active;
      if (chain) {
        return {
          source,
          title: chain.title || chain.name || chain.templateId || chain.id,
          summary: chain.summary || '',
          tags: chain.tags || [],
          battleSetIds: chain.battleSetIds || [],
          mapSeedIds: chain.mapSeedIds || [],
          questChainId: chain.id || chain.templateId
        };
      }
    }

    return {
      source: 'random',
      title: 'Random Scenario',
      summary: 'A generated field run using the current campaign pools.',
      tags: [],
      battleSetIds: [],
      mapSeedIds: []
    };
  }

  function _pickMapSeed(opts, context, world) {
    const seeds = Loader().getMapSeeds(world);
    const byContext = (context.mapSeedIds || [])
      .map((id) => Loader().getMapSeed(id))
      .filter(Boolean);
    if (byContext.length) {
      const typed = opts.mapType === 'any' ? byContext : byContext.filter((seed) => _hasToken(seed, opts.mapType));
      const sized = (typed.length ? typed : byContext).filter((seed) => _hasToken(seed, opts.size));
      return _pick(sized.length ? sized : (typed.length ? typed : byContext));
    }

    let filtered = seeds;
    if (opts.mapType !== 'any') {
      filtered = seeds.filter((seed) => _hasToken(seed, opts.mapType));
    }
    const sized = filtered.filter((seed) => _hasToken(seed, opts.size));
    const layered = (sized.length ? sized : filtered).filter((seed) => opts.layers <= 1 || (seed.layers || []).length >= opts.layers || _hasToken(seed, 'multi_layer'));
    return _pick(layered.length ? layered : (sized.length ? sized : filtered));
  }

  function _buildScenario(map, seed, opts, context, world) {
    const points = map.nodes || map.cells || [];
    const battleRefs = _unique([
      ...(context.battleSetIds || []),
      ...points.flatMap((point) => [...(point.battleSetIds || []), ...(point.encounterIds || [])])
    ]);
    const setBattles = battleRefs.map(_battleEntryFromRef).filter((entry) => entry.encounterId || entry.battleSetId);
    const exitPoint = [...points].reverse().find((point) => point.kind === 'exit') || points[points.length - 1];
    const id = `gen_scn_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const setting = opts.mapType === 'any' ? _firstMapType(seed) : opts.mapType;
    return {
      id,
      name: `${context.title || 'Generated Scenario'}: ${map.name}`,
      type: 'generated',
      world,
      travelMode: map.type === 'grid_map' ? 'grid_map' : 'node_map',
      mapId: map.id,
      startNode: map.defaultStartNode,
      startCell: map.defaultStartCell,
      setting,
      size: opts.size,
      canonRisk: seed.canonRisk || 'green',
      generated: true,
      source: {
        kind: context.source,
        title: context.title || '',
        questChainId: context.questChainId || null,
        mapSeedId: seed.id || null
      },
      notes: context.summary || seed.notes || 'Generated scenario.',
      limits: { campRests: opts.size === 'large' ? 2 : 1, randomBattles: opts.size === 'tiny' ? 1 : 2, events: opts.size === 'large' ? 4 : 2 },
      danger: { start: 0, max: opts.size === 'large' ? 12 : 10 },
      setBattles,
      randomBattleTables: setBattles.length ? [{
        id: `${id}_random_battles`,
        name: 'Generated Battle Pool',
        entries: setBattles.map((entry) => ({ ...entry, weight: entry.weight || 1 }))
      }] : [],
      successConditions: exitPoint
        ? (map.type === 'grid_map'
          ? [{ type: 'reach_cell', x: exitPoint.x, y: exitPoint.y }]
          : [{ type: 'reach_node', nodeId: exitPoint.id }])
        : [],
      entryOps: [{ op: 'log', text: `Generated from ${context.source}: ${context.title || seed.name || 'random pools'}.` }],
      exitOps: []
    };
  }

  function _buildMap(seed, opts, context, world) {
    const id = `gen_map_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const seedNodes = (seed.nodes || []).length ? seed.nodes : _fallbackNodes(opts);
    const links = (seed.links || []).length ? seed.links : _chainLinks(seedNodes);
    const layers = _layers(seed, opts.layers);
    const nodesByLayer = new Map();
    seedNodes.forEach((node, index) => {
      const layer = _nodeLayer(node, layers, index);
      if (!nodesByLayer.has(layer)) nodesByLayer.set(layer, []);
      nodesByLayer.get(layer).push(node);
    });

    const exitsById = {};
    for (const [from, to] of links) {
      exitsById[from] = exitsById[from] || [];
      exitsById[to] = exitsById[to] || [];
      exitsById[from].push(to);
      exitsById[to].push(from);
    }

    const rng = _seededRng(`${seed.id || id}:${Date.now()}`);
    const nodes = seedNodes.map((node, index) => {
      const layer = _nodeLayer(node, layers, index);
      const layerNodes = nodesByLayer.get(layer) || seedNodes;
      const layerIndex = Math.max(0, layerNodes.findIndex((entry) => entry.id === node.id));
      const x = _layoutX(layerIndex, layerNodes.length, rng);
      const y = _layoutY(index, layerIndex, layerNodes.length, rng);
      const kind = _roleToKind(node.role);
      const battleRef = node.battleSetIds?.[0] || node.encounterIds?.[0] || node.encounterId || null;
      return {
        id: node.id,
        title: node.name || node.title || node.id,
        kind,
        x,
        y,
        layer,
        layerName: layers.find((entry) => entry.id === layer)?.name || layer,
        tags: _unique([...(node.tags || []), ...(seed.tags || [])]),
        notes: node.notes || node.role || '',
        discoveredByDefault: index === 0,
        battleSetIds: node.battleSetIds || [],
        encounterIds: node.encounterIds || (node.encounterId ? [node.encounterId] : []),
        randomBattle: ['battle', 'boss', 'event_battle'].includes(kind) && battleRef
          ? { chance: kind === 'boss' ? 1 : 0.8, ..._battleEntryFromRef(battleRef) }
          : undefined,
        onEnter: _onEnterOps(node, kind, world),
        exits: (exitsById[node.id] || []).map((to) => ({ to, label: _exitLabel(seedNodes, to, layer, layers) }))
      };
    });

    return {
      id,
      name: seed.name || `${_titleCase(opts.mapType)} Route`,
      type: 'node_map',
      world,
      setting: opts.mapType === 'any' ? _firstMapType(seed) : opts.mapType,
      size: opts.size,
      layers,
      defaultStartNode: nodes[0]?.id || null,
      nodes,
      _generated: true,
      _seedId: seed.id || null,
      _source: context.source
    };
  }

  function _buildGridMap(seed, opts, context, world) {
    const id = `gen_grid_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const [width, height] = GRID_SIZES[opts.size] || GRID_SIZES.small;
    const rng = _seededRng(`${seed.id || id}:grid:${Date.now()}`);
    const seedNodes = (seed.nodes || []).length ? seed.nodes : _fallbackNodes(opts);
    const path = _gridPath(width, height);
    const step = Math.max(1, Math.floor(path.length / Math.max(seedNodes.length, 1)));
    const occupied = new Set();
    const cells = seedNodes.slice(0, Math.min(seedNodes.length, path.length)).map((node, index) => {
      const pos = path[Math.min(path.length - 1, index * step)];
      occupied.add(`${pos.x},${pos.y}`);
      const kind = _roleToKind(node.role);
      const battleRef = node.battleSetIds?.[0] || node.encounterIds?.[0] || node.encounterId || null;
      return {
        id: node.id,
        title: node.name || node.title || node.id,
        x: pos.x,
        y: pos.y,
        kind,
        tags: _unique([...(node.tags || []), ...(seed.tags || []), 'grid']),
        notes: node.notes || node.role || '',
        discoveredByDefault: index === 0,
        battleSetIds: node.battleSetIds || [],
        encounterIds: node.encounterIds || (node.encounterId ? [node.encounterId] : []),
        randomBattle: ['battle', 'boss', 'event_battle'].includes(kind) && battleRef
          ? { chance: kind === 'boss' ? 1 : 0.8, ..._battleEntryFromRef(battleRef) }
          : undefined,
        onEnter: _onEnterOps(node, kind, world)
      };
    });
    const terrain = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => {
      const key = `${x},${y}`;
      if (occupied.has(key)) return 'floor';
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return rng() < 0.35 ? 'wall' : 'floor';
      return rng() < 0.12 ? 'obstacle' : 'floor';
    }));
    for (const pos of path) terrain[pos.y][pos.x] = 'floor';
    return {
      id,
      name: `${seed.name || _titleCase(opts.mapType)} Grid`,
      type: 'grid_map',
      world,
      setting: opts.mapType === 'any' ? _firstMapType(seed) : opts.mapType,
      size: opts.size,
      width,
      height,
      terrain,
      defaultStartCell: cells[0] ? [cells[0].x, cells[0].y] : [1, height - 2],
      cells,
      _generated: true,
      _seedId: seed.id || null,
      _source: context.source
    };
  }

  function _gridPath(width, height) {
    const out = [];
    for (let y = height - 2; y >= 1; y--) {
      const xs = y % 2 === 0
        ? Array.from({ length: width - 2 }, (_, index) => index + 1)
        : Array.from({ length: width - 2 }, (_, index) => width - 2 - index);
      for (const x of xs) out.push({ x, y });
    }
    return out.length ? out : [{ x: 0, y: 0 }];
  }

  function _layers(seed, count) {
    const explicit = Array.isArray(seed.layers) ? seed.layers : [];
    if (explicit.length) {
      return explicit.slice(0, Math.max(count, explicit.length)).map((layer, index) => ({
        id: _normalizeLayerId(layer.id || layer.layerId || `layer_${index + 1}`),
        name: layer.name || layer.label || `Layer ${index + 1}`
      }));
    }
    return Array.from({ length: count }, (_, index) => ({ id: `layer_${index + 1}`, name: count === 1 ? 'Map' : `Layer ${index + 1}` }));
  }

  function _nodeLayer(node, layers, index) {
    if (node.layer || node.layerId) return _normalizeLayerId(node.layer || node.layerId);
    return layers[index % layers.length]?.id || 'layer_1';
  }

  function _fallbackSeed(opts, context, world) {
    return {
      id: `generated_seed_${opts.mapType}_${opts.size}`,
      name: `${_titleCase(opts.mapType === 'any' ? 'outdoor' : opts.mapType)} ${_titleCase(opts.size)} Run`,
      world,
      tags: [opts.mapType === 'any' ? 'outdoor' : opts.mapType, opts.size],
      canonRisk: 'green',
      nodes: _fallbackNodes(opts),
      links: null,
      notes: context.summary || 'Generated from fallback pools.'
    };
  }

  function _fallbackNodes(opts) {
    const type = opts.mapType === 'any' ? 'outdoor' : opts.mapType;
    const names = {
      urban: ['Gate Alley', 'Market Bend', 'Rooftop Cut', 'Watch Post', 'Storehouse', 'Back Street', 'Canal Exit'],
      outdoor: ['Trailhead', 'Old Marker', 'Broken Sled', 'Pine Hollow', 'Cold Creek', 'Hidden Cache', 'Return Trail'],
      dungeon: ['Stone Mouth', 'Low Hall', 'Split Stairs', 'Guard Room', 'Rune Door', 'Deep Vault', 'Exit Arch'],
      house: ['Front Step', 'Mud Room', 'Kitchen', 'Locked Study', 'Cold Cellar', 'Attic Cache', 'Back Door'],
      castle: ['Outer Gate', 'Bailey', 'Armory', 'Servant Hall', 'Tower Stair', 'Keep Chamber', 'Postern Exit'],
      mountain: ['Base Camp', 'Switchback', 'Ice Shelf', 'Wind Gap', 'Goat Path', 'Summit Cache', 'Downslope']
    };
    const roles = ['entrance', 'clue', 'trap', 'battle', 'rest', 'reward', 'battle', 'boss', 'exit', 'clue', 'battle', 'exit'];
    const count = SIZE_COUNTS[opts.size] || 7;
    const list = names[type] || names.outdoor;
    return Array.from({ length: count }, (_, index) => ({
      id: `node_${index + 1}`,
      name: list[index % list.length],
      role: index === count - 1 ? 'exit' : roles[index % roles.length],
      notes: index === 0 ? 'Entry point.' : ''
    }));
  }

  function _chainLinks(nodes) {
    return nodes.slice(1).map((node, index) => [nodes[index].id, node.id]);
  }

  function _onEnterOps(node, kind, world) {
    if (kind === 'reward') return [
      { op: 'give_money', currency: `${world}_gold`, amount: 12 },
      { op: 'log', text: `Reward found: ${node.name || node.id}.` }
    ];
    if (kind === 'trap') return [
      { op: 'danger', amount: 1 },
      { op: 'damage_party', amount: 3 },
      { op: 'log', text: `Trap sprung: ${node.name || node.id}.` }
    ];
    if (kind === 'rest') return [
      { op: 'heal_party', amount: 6 },
      { op: 'log', text: `Brief rest: ${node.name || node.id}.` }
    ];
    if (kind === 'event') {
      const tableId = _eventTableId(world);
      return tableId ? [{ op: 'roll_event', table: tableId, chance: 0.65 }] : undefined;
    }
    return undefined;
  }

  function _eventTableId(world) {
    const campaign = CS().getCurrentCampaign();
    return (campaign?.eventTables || []).find((id) => id.includes(world)) || campaign?.eventTables?.[0] || null;
  }

  function _roleToKind(role) {
    const text = String(role || '').toLowerCase();
    if (text.includes('entrance')) return 'entrance';
    if (text.includes('exit') || text.includes('return')) return 'exit';
    if (text.includes('boss')) return 'boss';
    if (text.includes('battle')) return 'battle';
    if (text.includes('trap')) return 'trap';
    if (text.includes('rest') || text.includes('camp')) return 'rest';
    if (text.includes('shop') || text.includes('reward') || text.includes('cache')) return 'reward';
    if (text.includes('clue') || text.includes('choice') || text.includes('gather') || text.includes('resource')) return 'event';
    return 'event_battle';
  }

  function _battleEntryFromRef(ref) {
    if (!ref) return {};
    const card = Loader().getBattleSetCard(ref);
    if (card) {
      return {
        id: card.id,
        battleSetId: card.id,
        encounterId: card.encounterId || null,
        label: card.name || card.id,
        rewardOps: card.rewardOps || [],
        objective: card.objective || '',
        notes: card.gimmick || ''
      };
    }
    const encounter = DS().get('encounters', ref);
    return {
      id: ref,
      encounterId: encounter?.id || ref,
      label: encounter?.name || ref
    };
  }

  function _hasToken(record, token) {
    const haystack = [
      record.id,
      record.name,
      ...(record.tags || []),
      ...(Array.isArray(record.purpose) ? record.purpose : [record.purpose].filter(Boolean)),
      record.notes
    ].join(' ').toLowerCase();
    return haystack.includes(String(token || '').toLowerCase());
  }

  function _firstMapType(seed) {
    return MAP_TYPES.find((type) => type !== 'any' && _hasToken(seed, type)) || 'outdoor';
  }

  function _exitLabel(seedNodes, to, fromLayer, layers) {
    const target = seedNodes.find((node) => node.id === to);
    const layer = target?.layer || target?.layerId;
    const prefix = layer && _normalizeLayerId(layer) !== fromLayer && layers.length > 1 ? 'Stairs to ' : 'Travel to ';
    return `${prefix}${target?.name || target?.title || to}`;
  }

  function _layoutX(index, count, rng) {
    const pad = 70;
    const width = 680;
    const cols = Math.max(count, 2);
    const t = cols === 1 ? 0.5 : index / (cols - 1);
    return Math.round(pad + t * (width - 2 * pad) + (rng() - 0.5) * 24);
  }

  function _layoutY(globalIndex, layerIndex, layerCount, rng) {
    const height = 420;
    const mid = height / 2;
    const wave = Math.sin((layerIndex / Math.max(1, layerCount - 1)) * Math.PI * 2) * 58;
    return Math.round(mid + wave + (rng() - 0.5) * 44 + (globalIndex % 2 ? 14 : -14));
  }

  function _sideContentState(state) {
    state.sideContent = state.sideContent || {};
    state.sideContent.generatedIdeas = state.sideContent.generatedIdeas || {};
    state.sideContent.generatedScenarios = state.sideContent.generatedScenarios || {};
    state.sideContent.generatedMaps = state.sideContent.generatedMaps || {};
    state.sideContent.activeQuestChains = state.sideContent.activeQuestChains || {};
    state.sideContent.contentHistory = state.sideContent.contentHistory || [];
    state.sideContent.reviewQueue = state.sideContent.reviewQueue || [];
    state.sideContent.importedPacks = state.sideContent.importedPacks || {};
    return state.sideContent;
  }

  function _log(state, text) {
    state.log = state.log || [];
    state.log.unshift({
      id: `log_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      at: new Date().toISOString(),
      phase: state.phase?.number || 1,
      world: state.currentWorld,
      text,
      op: 'generated_scenario'
    });
    state.log = state.log.slice(0, 500);
  }

  function _normalizeLayerId(value) {
    return String(value || 'layer_1').replace(/\s+/g, '_').toLowerCase();
  }

  function _titleCase(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function _unique(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function _pick(values) {
    return values?.length ? values[Math.floor(Math.random() * values.length)] : null;
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

  return Object.freeze({
    generate,
    generateAndStart,
    options
  });
})();
