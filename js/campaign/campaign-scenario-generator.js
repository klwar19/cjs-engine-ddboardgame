// campaign-scenario-generator.js
// Save-local scenario and layered node-map generator for Campaign Mode.

window.CJS = window.CJS || {};

window.CJS.CampaignScenarioGenerator = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const DS = () => window.CJS.DataStore;
  const Loader = () => window.CJS.CampaignDataLoader;
  const Runner = () => window.CJS.ScenarioRunner;

  const MAP_TYPES = ['any', 'urban', 'outdoor', 'forest', 'dungeon', 'cave', 'sewer', 'ruins', 'temple', 'house', 'tavern', 'castle', 'mountain', 'arena'];
  const MAP_FORMS = ['node_map', 'grid_map'];
  const SIZES = ['tiny', 'small', 'medium', 'large'];
  const SIZE_COUNTS = { tiny: 5, small: 7, medium: 9, large: 12 };
  const GRID_SIZES = { tiny: [5, 5], small: [6, 6], medium: [8, 6], large: [10, 8] };
  const BATTLE_TARGETS = { tiny: 2, small: 3, medium: 4, large: 5 };
  const BATTLE_LIMITS = { tiny: 2, small: 3, medium: 4, large: 5 };
  const EVENT_LIMITS = { tiny: 2, small: 3, medium: 4, large: 5 };
  const BATTLE_KINDS = new Set(['battle', 'boss', 'event_battle']);
  const LOW_BATTLE_KINDS = new Set(['entrance', 'exit', 'rest', 'shop']);
  const AREA_PROFILES = {
    urban: {
      aliases: ['urban', 'town', 'city', 'street', 'market', 'guild', 'alley'],
      battle: ['urban', 'guild', 'rival', 'bandit', 'sparring', 'social', 'taxmen'],
      themes: ['arena', 'open_field']
    },
    outdoor: {
      aliases: ['outdoor', 'outside', 'trail', 'road', 'field', 'wilds', 'snow', 'tundra'],
      battle: ['outdoor', 'forest', 'trail', 'road', 'wolf', 'bear', 'ambush', 'beast', 'snow', 'ridge'],
      themes: ['forest', 'tundra', 'open_field']
    },
    forest: {
      aliases: ['forest', 'wood', 'frostwood', 'grove', 'pine', 'creek'],
      battle: ['forest', 'wolf', 'bear', 'sprite', 'grove', 'mushroom', 'beast', 'ambush'],
      themes: ['forest', 'tundra']
    },
    dungeon: {
      aliases: ['dungeon', 'underground', 'cellar', 'vault', 'floor', 'crypt'],
      battle: ['dungeon', 'cave', 'cellar', 'shrine', 'temple', 'sprite', 'undead', 'mystery'],
      themes: ['cave', 'ruins', 'temple']
    },
    cave: {
      aliases: ['cave', 'hollow', 'den', 'cavern'],
      battle: ['cave', 'bear', 'wolf', 'undead', 'hollow', 'danger'],
      themes: ['cave']
    },
    sewer: {
      aliases: ['sewer', 'drain', 'canal', 'tunnel'],
      battle: ['sewer', 'rat', 'undead', 'runner', 'brute', 'crawler'],
      themes: ['cave', 'swamp']
    },
    ruins: {
      aliases: ['ruins', 'ruin', 'old', 'broken', 'relic'],
      battle: ['ruins', 'shrine', 'temple', 'sprite', 'mystery', 'guardian', 'undead'],
      themes: ['ruins', 'temple']
    },
    temple: {
      aliases: ['temple', 'shrine', 'bell', 'holy'],
      battle: ['temple', 'shrine', 'sprite', 'guardian', 'mystery', 'review'],
      themes: ['temple', 'ruins']
    },
    house: {
      aliases: ['house', 'home', 'hut', 'room', 'cellar'],
      battle: ['house', 'cellar', 'rat', 'sprite', 'training', 'social'],
      themes: ['arena', 'cave']
    },
    tavern: {
      aliases: ['tavern', 'inn', 'mug', 'kitchen', 'food', 'cellar'],
      battle: ['tavern', 'food', 'rat', 'comedy', 'cellar', 'sparring'],
      themes: ['arena', 'cave']
    },
    castle: {
      aliases: ['castle', 'keep', 'gate', 'bailey', 'tower'],
      battle: ['castle', 'gate', 'guard', 'rival', 'undead', 'tower'],
      themes: ['ruins', 'arena']
    },
    mountain: {
      aliases: ['mountain', 'ridge', 'peak', 'summit', 'slope', 'ice'],
      battle: ['mountain', 'ridge', 'bear', 'wolf', 'yeti', 'oni', 'danger'],
      themes: ['tundra', 'cave', 'open_field']
    },
    arena: {
      aliases: ['arena', 'training', 'sparring', 'drill'],
      battle: ['arena', 'training', 'sparring', 'rival', 'boss_preview'],
      themes: ['arena', 'open_field']
    }
  };

  function generateAndStart(options = {}) {
    if (CS().getState()?.activeScenarioRun) return { error: 'active_run' };
    const result = generate(options);
    if (result.error) return result;
    Runner().startScenario(result.scenario.id);
    return result;
  }

  function generate(options = {}) {
    const state = CS().getState();
    if (!state) throw new Error('No campaign save loaded.');
    const world = state.currentWorld || CS().getCurrentCampaign()?.world || 'haven';
    const opts = _normalizeOptions(options);
    const context = _sourceContext(opts.source, world, opts);
    if (context.error) return { error: context.error, source: opts.source };
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
    return { source, mapType, mapForm, size, layers, questId: options.questId || null };
  }

  function _sourceContext(source, world, opts = {}) {
    const state = CS().getState();
    if (source === 'active_quest') {
      const quest = (opts.questId ? state.quests?.[opts.questId] : null)
        || Object.values(state.quests || {}).find((entry) => !['complete', 'completed', 'failed'].includes(String(entry.status || 'active')))
        || null;
      if (!quest || ['complete', 'completed', 'failed'].includes(String(quest.status || 'active'))) return { error: 'no_active_quest', source };
      return {
        source,
        questId: quest.id,
        title: quest.title || quest.id,
        summary: quest.summary || '',
        tags: quest.tags || [],
        battleSetIds: quest.battleSetIds || [],
        mapSeedIds: quest.mapSeedIds || []
      };
    }

    if (source === 'quest_chain') {
      const activeState = Object.values(state.sideContent?.activeQuestChains || {})[0] || null;
      const activeTemplate = activeState ? Loader().getQuestChainTemplate(activeState.templateId) : null;
      const chain = activeTemplate || activeState;
      if (!chain) return { error: 'no_active_chain', source };
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

    return {
      source: 'random',
      title: '',
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
      const typed = opts.mapType === 'any' ? byContext : byContext.filter((seed) => _matchesArea(seed, opts.mapType));
      const sized = (typed.length ? typed : byContext).filter((seed) => _hasToken(seed, opts.size));
      return _pick(sized.length ? sized : (typed.length ? typed : byContext));
    }

    let filtered = seeds;
    if (opts.mapType !== 'any') {
      filtered = seeds.filter((seed) => _matchesArea(seed, opts.mapType));
    }
    const sized = filtered.filter((seed) => _hasToken(seed, opts.size));
    const layered = (sized.length ? sized : filtered).filter((seed) => opts.layers <= 1 || (seed.layers || []).length >= opts.layers || _hasToken(seed, 'multi_layer'));
    return _pick(layered.length ? layered : (sized.length ? sized : filtered));
  }

  function _buildScenario(map, seed, opts, context, world) {
    const points = map.nodes || map.cells || [];
    const setting = opts.mapType === 'any' ? _firstMapType(seed) : opts.mapType;
    const autoBattlePool = _worldBattlePool(world, { setting, size: opts.size, tags: _scenarioTags(seed, context) }, context, seed);
    _ensurePointBattles(points, autoBattlePool, { setting, size: opts.size });
    _ensureBattleDensity(points, autoBattlePool, { setting, size: opts.size, tags: _scenarioTags(seed, context) });
    const battleRefs = _unique([
      ...(context.battleSetIds || []),
      ...points.flatMap((point) => [...(point.battleSetIds || []), ...(point.encounterIds || [])])
    ]);
    let setBattles = battleRefs.map(_battleEntryFromRef).filter((entry) => entry.encounterId || entry.battleSetId);
    setBattles = _dedupeBattleEntries(setBattles);
    const fallbackPool = setBattles.length ? [] : autoBattlePool;
    const battlePool = setBattles.length ? setBattles : fallbackPool;
    const exitPoint = [...points].reverse().find((point) => point.kind === 'exit') || points[points.length - 1];
    const id = `gen_scn_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    return {
      id,
      name: _scenarioName(context, map, seed),
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
      tags: _scenarioTags(seed, context),
      source: {
        kind: context.source,
        title: context.title || '',
        questId: context.questId || null,
        questChainId: context.questChainId || null,
        mapSeedId: seed.id || null
      },
      notes: context.summary || seed.notes || 'Generated scenario.',
      limits: { campRests: opts.size === 'large' ? 2 : 1, randomBattles: BATTLE_LIMITS[opts.size] || 3, events: EVENT_LIMITS[opts.size] || 3 },
      danger: { start: 0, max: opts.size === 'large' ? 12 : 10 },
      setBattles,
      randomBattleTables: battlePool.length ? [{
        id: `${id}_random_battles`,
        name: setBattles.length ? 'Generated Battle Pool' : `${_titleCase(setting)} Battle Pool`,
        entries: battlePool.map((entry) => ({ ...entry, weight: entry.weight || 1 }))
      }] : [],
      eventTables: _campaignEventTables(world),
      successConditions: exitPoint
        ? (map.type === 'grid_map'
          ? [{ type: 'reach_cell', x: exitPoint.x, y: exitPoint.y }]
          : [{ type: 'reach_node', nodeId: exitPoint.id }])
        : [],
      entryOps: [{ op: 'log', text: `Generated from ${context.source}: ${context.title || seed.name || 'random pools'}.` }],
      exitOps: []
    };
  }

  function _scenarioName(context, map, seed) {
    const base = map.name || seed.name || 'Scenario';
    if (context.source === 'random' || !context.title) return base;
    return `${context.title}: ${base}`;
  }

  function _ensurePointBattles(points, pool, context = {}) {
    if (!Array.isArray(points) || !points.length || !pool.length) return;
    const shuffled = _shuffle(pool);
    let index = 0;
    for (const point of points) {
      const kind = String(point.kind || _roleToKind(point.role)).toLowerCase();
      if (!BATTLE_KINDS.has(kind)) continue;
      if (point.randomBattle || point.battleSetIds?.length || point.encounterIds?.length || point.encounterId) continue;
      const localPool = _rankedBattles(shuffled, { ...context, tags: [...(context.tags || []), ...(point.tags || []), point.title, point.name, point.notes, kind] });
      const entry = localPool[index % localPool.length] || shuffled[index % shuffled.length];
      index += 1;
      if (!entry) continue;
      if (entry.battleSetId) point.battleSetIds = _unique([...(point.battleSetIds || []), entry.battleSetId]);
      if (entry.encounterId) point.encounterIds = _unique([...(point.encounterIds || []), entry.encounterId]);
      point.randomBattle = {
        chance: kind === 'boss' ? 1 : 0.85,
        ...entry,
        source: 'auto_area'
      };
      point.tags = _unique([...(point.tags || []), 'auto_battle', context.setting || '']);
      point.notes = [point.notes, `Auto battle: ${entry.label || entry.encounterId || entry.battleSetId}.`].filter(Boolean).join(' ');
    }
  }

  function _ensureBattleDensity(points, pool, context = {}) {
    if (!Array.isArray(points) || !points.length || !pool.length) return;
    const target = Math.min(_battleTarget(context.size, context.setting), Math.max(1, points.length - 2));
    let current = _battlePointCount(points);
    if (current >= target) return;
    const candidates = _shuffle(points.filter((point, index) => _canAddBattleToPoint(point, index, points.length)));
    let poolIndex = 0;
    for (const point of candidates) {
      if (current >= target) break;
      const kind = String(point.kind || _roleToKind(point.role)).toLowerCase();
      const localPool = _rankedBattles(pool, { ...context, tags: [...(context.tags || []), ...(point.tags || []), point.title, point.name, point.notes, kind] });
      const entry = localPool[poolIndex % localPool.length] || pool[poolIndex % pool.length];
      poolIndex += 1;
      if (!entry) continue;
      _attachBattleToPoint(point, entry, {
        ...context,
        chance: _battleChanceForPoint(point, kind, context.size),
        source: 'auto_density'
      });
      current += 1;
    }
  }

  function _battleTarget(size, setting) {
    const base = BATTLE_TARGETS[size] || 3;
    const key = String(setting || '').toLowerCase();
    const bump = ['dungeon', 'cave', 'sewer', 'ruins', 'mountain', 'arena'].includes(key) ? 1 : 0;
    return Math.min(6, base + bump);
  }

  function _battlePointCount(points) {
    return points.filter((point) => point.randomBattle || point.battleSetIds?.length || point.encounterIds?.length || point.encounterId).length;
  }

  function _canAddBattleToPoint(point, index, total) {
    const kind = String(point.kind || _roleToKind(point.role)).toLowerCase();
    if (index === 0 || index === total - 1) return false;
    if (LOW_BATTLE_KINDS.has(kind)) return false;
    if (point.randomBattle || point.battleSetIds?.length || point.encounterIds?.length || point.encounterId) return false;
    return true;
  }

  function _battleChanceForPoint(point, kind, size) {
    if (kind === 'boss') return 1;
    if (BATTLE_KINDS.has(kind)) return 0.9;
    const bySize = { tiny: 0.5, small: 0.58, medium: 0.64, large: 0.7 };
    if (String(point.kind || '').includes('trap')) return Math.min(0.75, (bySize[size] || 0.6) + 0.08);
    return bySize[size] || 0.6;
  }

  function _attachBattleToPoint(point, entry, context = {}) {
    if (entry.battleSetId) point.battleSetIds = _unique([...(point.battleSetIds || []), entry.battleSetId]);
    if (entry.encounterId) point.encounterIds = _unique([...(point.encounterIds || []), entry.encounterId]);
    point.randomBattle = {
      chance: context.chance ?? 0.75,
      ...entry,
      source: context.source || 'auto_area'
    };
    point.tags = _unique([...(point.tags || []), 'auto_battle', context.setting || '']);
    point.notes = [point.notes, `Auto battle: ${entry.label || entry.encounterId || entry.battleSetId}.`].filter(Boolean).join(' ');
  }

  function _worldBattlePool(world, area = {}, context = {}, seed = {}) {
    const cards = Loader().getBattleSetCards(world) || [];
    const entries = cards
      .map((card) => ({
        id: card.id,
        battleSetId: card.id,
        encounterId: card.encounterId || null,
        label: card.name || card.id,
        rewardOps: card.rewardOps || [],
        objective: card.objective || '',
        notes: card.gimmick || '',
        tags: card.tags || [],
        rank: card.rank || '',
        canonRisk: card.canonRisk || 'green',
        enemyMix: card.enemyMix || [],
        battleMap: _battleMapSuggestion(card, area.setting)
      }))
      .filter((entry) => entry.encounterId || entry.battleSetId);
    if (entries.length) return _rankedBattles(entries, {
      setting: area.setting,
      size: area.size,
      tags: [...(area.tags || []), ...(context.tags || []), ...(seed.tags || []), context.title, context.summary, seed.name, seed.notes]
    });
    const encounters = (DS().getAllAsArray('encounters') || []).filter((enc) => !enc._world || enc._world === world);
    return _rankedBattles(encounters.map((enc) => ({
      id: enc.id,
      encounterId: enc.id,
      label: enc.name || enc.id,
      tags: enc.tags || [],
      battleMap: _battleMapSuggestion(enc, area.setting)
    })), area).slice(0, 8);
  }

  function _campaignEventTables(world) {
    const tables = CS().getCurrentCampaign()?.eventTables || [];
    if (tables.length) return [...tables];
    const fromStore = (DS().getAllAsArray('campaignEvents') || [])
      .filter((table) => !table.world || table.world === world || table._world === world)
      .map((table) => table.id);
    return fromStore;
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
      forest: ['Forest Edge', 'Bent Pine', 'Mossy Hollow', 'Wolf Track', 'Old Snag', 'Hidden Grove', 'Return Trail'],
      dungeon: ['Stone Mouth', 'Low Hall', 'Split Stairs', 'Guard Room', 'Rune Door', 'Deep Vault', 'Exit Arch'],
      cave: ['Cave Mouth', 'Dripstone Bend', 'Low Crawl', 'Bear Scratch', 'Dark Pool', 'Deep Hollow', 'Daylight Crack'],
      sewer: ['Drain Gate', 'Slick Channel', 'Broken Grate', 'Rat Run', 'Flooded Step', 'Old Valve', 'Street Exit'],
      ruins: ['Snowed Road', 'Broken Gate', 'Old Courtyard', 'Fallen Pillars', 'Silent Bell', 'Sealed Door', 'Side Exit'],
      temple: ['Prayer Gate', 'Outer Ring', 'Offering Bowl', 'Bell Court', 'Shrine Steps', 'Inner Seal', 'Retreat Path'],
      house: ['Front Step', 'Mud Room', 'Kitchen', 'Locked Study', 'Cold Cellar', 'Attic Cache', 'Back Door'],
      tavern: ['Common Room', 'Kitchen Door', 'Pantry Shelves', 'Cellar Steps', 'Ale Casks', 'Warm Hearth', 'Back Alley'],
      castle: ['Outer Gate', 'Bailey', 'Armory', 'Servant Hall', 'Tower Stair', 'Keep Chamber', 'Postern Exit'],
      mountain: ['Base Camp', 'Switchback', 'Ice Shelf', 'Wind Gap', 'Goat Path', 'Summit Cache', 'Downslope'],
      arena: ['Entry Sand', 'Left Cover', 'Center Line', 'Hazard Mark', 'High Rail', 'Prize Corner', 'Exit Gate']
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
        notes: card.gimmick || '',
        tags: card.tags || [],
        enemyMix: card.enemyMix || [],
        rank: card.rank || '',
        canonRisk: card.canonRisk || 'green',
        battleMap: _battleMapSuggestion(card)
      };
    }
    const encounter = DS().get('encounters', ref);
    return {
      id: ref,
      encounterId: encounter?.id || ref,
      label: encounter?.name || ref,
      tags: encounter?.tags || [],
      battleMap: _battleMapSuggestion(encounter || {}, null)
    };
  }

  function _scenarioTags(seed, context) {
    return _unique([
      ...(seed.tags || []),
      ...(context.tags || []),
      ...(Array.isArray(seed.purpose) ? seed.purpose : [seed.purpose].filter(Boolean)),
      context.source,
      context.questId,
      context.questChainId
    ]);
  }

  function _battleMapSuggestion(record = {}, setting) {
    const theme = _themeForArea(setting || _firstMatchingArea(record) || 'outdoor', record);
    const grid = record.grid || {};
    return {
      theme,
      width: Number(grid.width || record.width || 8),
      height: Number(grid.height || record.height || 8)
    };
  }

  function _rankedBattles(entries, context = {}) {
    const scored = (entries || [])
      .filter(Boolean)
      .map((entry) => ({ entry, score: _battleScore(entry, context) }))
      .sort((a, b) => b.score - a.score || String(a.entry.label || a.entry.id || '').localeCompare(String(b.entry.label || b.entry.id || '')));
    return scored.map(({ entry, score }) => ({
      ...entry,
      weight: Math.max(1, Math.round(score))
    }));
  }

  function _battleScore(entry, context = {}) {
    const setting = context.setting === 'any' ? '' : context.setting;
    const profile = _areaProfile(setting);
    const haystack = _tokensFor(entry).join(' ');
    const contextTokens = _tokensFor({ tags: context.tags || [], notes: [context.setting, context.size].filter(Boolean).join(' ') });
    let score = entry.encounterId ? 8 : 4;
    if (entry.canonRisk === 'green') score += 2;
    if (entry.canonRisk === 'red') score -= 3;
    for (const token of profile.aliases || []) if (haystack.includes(token)) score += 4;
    for (const token of profile.battle || []) if (haystack.includes(token)) score += 5;
    for (const token of contextTokens) if (token && haystack.includes(token)) score += 1.5;
    if (setting && _matchesArea(entry, setting)) score += 4;
    if (String(context.size || '').toLowerCase() === 'tiny' && /boss|chimera|yeti|oni|kumiho|b-|c-|d-c/.test(haystack)) score -= 3;
    if (/starter|f-|f\b|low combat/.test(haystack)) score += 1;
    return Math.max(1, score);
  }

  function _dedupeBattleEntries(entries) {
    const seen = new Set();
    const out = [];
    for (const entry of entries || []) {
      const key = entry.battleSetId || entry.encounterId || entry.id;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
    return out;
  }

  function _matchesArea(record, area) {
    if (!area || area === 'any') return true;
    const profile = _areaProfile(area);
    const haystack = _tokensFor(record).join(' ');
    return [area, ...(profile.aliases || [])].some((token) => token && haystack.includes(token));
  }

  function _firstMatchingArea(record) {
    return MAP_TYPES.find((type) => type !== 'any' && _matchesArea(record, type)) || 'outdoor';
  }

  function _areaProfile(area) {
    const key = String(area || 'outdoor').toLowerCase();
    return AREA_PROFILES[key] || AREA_PROFILES.outdoor;
  }

  function _themeForArea(area, record = {}) {
    const profile = _areaProfile(area);
    const haystack = _tokensFor(record).join(' ');
    if (haystack.includes('temple') || haystack.includes('shrine')) return 'temple';
    if (haystack.includes('ruins')) return 'ruins';
    if (haystack.includes('cave') || haystack.includes('cellar') || haystack.includes('sewer')) return 'cave';
    if (haystack.includes('snow') || haystack.includes('ice') || haystack.includes('frost') || haystack.includes('ridge') || haystack.includes('mountain')) return 'tundra';
    return profile.themes?.[0] || 'forest';
  }

  function _tokensFor(record = {}) {
    return [
      record.id,
      record.name,
      record.title,
      record.label,
      record.rank,
      record.objective,
      record.gimmick,
      record.notes,
      record.summary,
      record.prompt,
      record.setting,
      ...(record.tags || []),
      ...(Array.isArray(record.purpose) ? record.purpose : [record.purpose].filter(Boolean)),
      ...(record.enemyMix || []).flatMap((enemy) => [enemy.id, enemy.name, enemy.label])
    ]
      .flatMap((value) => String(value || '').toLowerCase().split(/[^a-z0-9_]+/))
      .filter(Boolean);
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
    return _firstMatchingArea(seed);
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

  function _shuffle(values) {
    return [...(values || [])].sort(() => Math.random() - 0.5);
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
