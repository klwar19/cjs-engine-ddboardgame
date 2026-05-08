// farming-mode.js
// Playable Pocket Haven farming grid, tool actions, and farm save migration.

window.CJS = window.CJS || {};

window.CJS.FarmingMode = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const DS = () => window.CJS.DataStore;

  const FARM_VERSION = 1;
  const DEFAULT_WIDTH = 8;
  const DEFAULT_HEIGHT = 6;
  const DEFAULT_FERTILIZER_ID = 'haven_basic_fertilizer';
  const QTE_DEFAULT_DURATION = 1500;
  const QTE_TARGET_WIDTH = 18;
  const DIRECTIONS = {
    up: { x: 0, y: -1, label: 'North' },
    down: { x: 0, y: 1, label: 'South' },
    left: { x: -1, y: 0, label: 'West' },
    right: { x: 1, y: 0, label: 'East' }
  };
  const TOOLS = [
    { id: 'hand', label: 'Hand', glyph: 'A' },
    { id: 'hoe', label: 'Hoe', glyph: 'H' },
    { id: 'seed', label: 'Seed', glyph: 'S' },
    { id: 'water', label: 'Water', glyph: 'W' },
    { id: 'fertilizer', label: 'Fertilizer', glyph: 'F' },
    { id: 'scythe', label: 'Scythe', glyph: 'C' }
  ];

  let _boundRoot = null;
  let _keyboardBound = false;

  function normalizeFarm(rawFarm = {}, options = {}) {
    const farm = rawFarm && typeof rawFarm === 'object' ? rawFarm : {};
    const rule = options.rule?.farm || _defaultRule()?.farm || {};
    const world = options.world || CS()?.getState?.()?.currentWorld || '';
    const crops = _cropOptions(world);
    const fallbackSeed = rule.defaultSeedId || crops[0]?.id || 'haven_frostcap_seed';
    const startingSeeds = rule.startingSeeds || { [fallbackSeed]: Number(rule.startingSeedQty || 6) };
    const startingFertilizer = rule.startingFertilizer || { [DEFAULT_FERTILIZER_ID]: Number(rule.startingFertilizerQty || 2) };
    const width = _clampInt(farm.width || rule.width || DEFAULT_WIDTH, 6, 16);
    const height = _clampInt(farm.height || rule.height || DEFAULT_HEIGHT, 5, 12);
    const cropSlots = _normalizeCropSlots(farm.cropSlots, width, height);
    const slotSeed = Number(farm.unlockedCropSlots ?? farm.unlockedSlots ?? farm.plots?.length ?? rule.startingPlots ?? 4);
    const maxSlots = Math.min(cropSlots.length, _clampInt(farm.maxCropSlots || rule.maxPlots || cropSlots.length, 1, cropSlots.length));

    farm.version = FARM_VERSION;
    farm.width = width;
    farm.height = height;
    farm.player = _normalizePlayer(farm.player, width, height);
    farm.selectedTool = TOOLS.some((tool) => tool.id === farm.selectedTool) ? farm.selectedTool : 'hand';
    farm.cropSlots = cropSlots;
    farm.unlockedCropSlots = Math.min(maxSlots, Math.max(1, slotSeed || 1));
    farm.maxCropSlots = maxSlots;
    farm.seedStock = _normalizeStock(farm.seedStock, startingSeeds);
    farm.selectedSeed = farm.selectedSeed || _firstPositiveStock(farm.seedStock) || fallbackSeed;
    farm.fertilizerStock = _normalizeStock(farm.fertilizerStock, startingFertilizer);
    farm.selectedFertilizer = farm.selectedFertilizer || DEFAULT_FERTILIZER_ID;
    farm.tools = _normalizeTools(farm.tools);
    farm.tiles = _normalizeTiles(farm.tiles, width, height);
    farm.recent = Array.isArray(farm.recent) ? farm.recent.slice(0, 8) : [];
    farm.qte = _normalizeQte(farm.qte);
    farm.bonusHarvests = Math.max(0, Number(farm.bonusHarvests || 0));
    farm.lastClickedTile = _normalizeClickedTile(farm.lastClickedTile, width, height);
    farm.actionMenu = _normalizeActionMenu(farm.actionMenu, width, height);
    farm.plots = Array.isArray(farm.plots) ? farm.plots : [];

    _migrateLegacyPlots(farm, rule);
    _nudgePlayerOffLockedSlot(farm);
    return farm;
  }

  function renderFarm() {
    const state = CS().getState();
    const farm = state?.pocketHaven?.farm || normalizeFarm({});
    const target = _targetCell(farm);
    const targetTile = _tileAt(farm, target.x, target.y);
    const targetKey = _key(target.x, target.y);
    const selectedCrop = _crop(farm.selectedSeed);
    const seedQty = _stockQty(farm.seedStock, farm.selectedSeed);
    const fertilizerQty = _fertilizerAvailable(state, farm);

    return `
      <section class="campaign-panel farm-mode ${farm.qte?.active ? 'has-qte-active' : ''} ${farm.actionMenu ? 'has-tile-menu' : ''}" tabindex="0" aria-label="Pocket Haven farm">
        <div class="campaign-panel-head farm-head">
          <div>
            <h2>Pocket Haven Farm</h2>
            <div class="campaign-muted">Slots ${_esc(farm.unlockedCropSlots)}/${_esc(farm.maxCropSlots)} | Seeds ${_esc(seedQty)} | Fertilizer ${_esc(fertilizerQty)}${farm.bonusHarvests ? ` | Harvest bonus +${_esc(farm.bonusHarvests)}` : ''}</div>
          </div>
          <div class="campaign-panel-actions farm-head-actions">
            <button class="campaign-action ${farm.qte?.available ? 'primary' : ''}" data-campaign-action="farm-qte-open" ${farm.qte?.available ? '' : 'disabled'}>${farm.qte?.available ? 'Focus Bonus' : 'No Bonus'}</button>
            <button class="campaign-action" data-campaign-action="farm-tick">Tick Growth</button>
            <button class="campaign-action primary" data-campaign-action="pass-phase">Pass Phase</button>
          </div>
        </div>

        <div class="farm-layout">
          <div class="farm-stage">
            <div class="farm-board" style="--farm-cols:${_escAttr(farm.width)}">
              ${_renderTiles(farm, targetKey)}
            </div>
          </div>

          <aside class="farm-controls" aria-label="Farm controls">
            <div class="farm-tool-grid" role="toolbar" aria-label="Tools">
              ${TOOLS.map((tool) => _renderTool(tool, farm)).join('')}
            </div>

            <label class="farm-select-label">
              <span>Seed</span>
              <select class="farm-select" data-farm-select="seed">
                ${_seedOptions(state.currentWorld).map((seed) => `
                  <option value="${_escAttr(seed.id)}" ${seed.id === farm.selectedSeed ? 'selected' : ''}>
                    ${_esc(seed.name || seed.id)} (${_stockQty(farm.seedStock, seed.id)})
                  </option>
                `).join('')}
              </select>
            </label>

            <div class="farm-action-strip">
              <button class="campaign-action primary farm-main-action" data-campaign-action="farm-interact">
                ${_esc(_actionLabel(farm, targetTile, target))}
              </button>
              <button class="campaign-action farm-bonus-action ${farm.qte?.available ? 'primary' : ''}" data-campaign-action="farm-qte-open" ${farm.qte?.available ? '' : 'disabled'}>
                ${farm.qte?.available ? 'Focus Bonus' : 'No Bonus'}
              </button>
            </div>

            <div class="farm-dpad" aria-label="Move farmer">
              <span></span>
              <button data-campaign-action="farm-move" data-dir="up" aria-label="Move up">Up</button>
              <span></span>
              <button data-campaign-action="farm-move" data-dir="left" aria-label="Move left">Left</button>
              <button data-campaign-action="farm-interact" aria-label="Use selected tool">Act</button>
              <button data-campaign-action="farm-move" data-dir="right" aria-label="Move right">Right</button>
              <span></span>
              <button data-campaign-action="farm-move" data-dir="down" aria-label="Move down">Down</button>
              <span></span>
            </div>

            <div class="farm-detail">
              ${_renderTileDetail(farm, targetTile, target)}
            </div>

            <div class="farm-recent">
              ${(farm.recent || []).slice(0, 4).map((line) => `<div>${_esc(line)}</div>`).join('') || '<div class="campaign-muted">No farm actions yet.</div>'}
            </div>
          </aside>
        </div>
        ${_renderTileMenu(state, farm)}
        ${_renderQteWindow(farm)}
      </section>
    `;
  }

  function bindControls(root) {
    _boundRoot = root || _boundRoot;
    if (_keyboardBound) return;
    _keyboardBound = true;
    document.addEventListener('keydown', (event) => {
      const rootEl = _boundRoot || document;
      if (!rootEl.querySelector?.('.farm-mode')) return;
      const active = document.activeElement;
      if (active && ['INPUT', 'SELECT', 'TEXTAREA'].includes(active.tagName)) return;
      const key = String(event.key || '').toLowerCase();
      const farm = CS()?.getState?.()?.pocketHaven?.farm;
      if (farm?.actionMenu && key === 'escape') {
        event.preventDefault();
        closeTileMenu();
        return;
      }
      if (farm?.qte?.active) {
        if (key === ' ' || key === 'enter') {
          event.preventDefault();
          hitQte();
        } else if (key === 'escape') {
          event.preventDefault();
          closeQte();
        }
        return;
      }
      const dir = {
        arrowup: 'up',
        w: 'up',
        arrowdown: 'down',
        s: 'down',
        arrowleft: 'left',
        a: 'left',
        arrowright: 'right',
        d: 'right'
      }[key];
      if (dir) {
        event.preventDefault();
        move(dir);
        return;
      }
      if (key === ' ' || key === 'enter') {
        event.preventDefault();
        interact();
      }
    });
  }

  function move(direction) {
    if (!DIRECTIONS[direction]) return;
    CS().mutate((state) => {
      const farm = normalizeFarm(state.pocketHaven.farm, _normalizerContext(state));
      _tryMove(state, farm, direction, { logFailure: true });
    }, { source: 'farming_mode', type: 'farm_move' });
  }

  function faceOrUseTile(x, y) {
    CS().mutate((state) => {
      const farm = normalizeFarm(state.pocketHaven.farm, _normalizerContext(state));
      _handleTileClick(state, farm, x, y);
    }, { source: 'farming_mode', type: 'farm_tile' });
  }

  function interact() {
    CS().mutate((state) => {
      const farm = normalizeFarm(state.pocketHaven.farm, _normalizerContext(state));
      _applyTool(state, farm);
    }, { source: 'farming_mode', type: 'farm_interact' });
  }

  function selectTool(toolId) {
    if (!TOOLS.some((tool) => tool.id === toolId)) return;
    CS().mutate((state) => {
      const farm = normalizeFarm(state.pocketHaven.farm, _normalizerContext(state));
      farm.selectedTool = toolId;
    }, { source: 'farming_mode', type: 'farm_select_tool' });
  }

  function selectSeed(seedId) {
    if (!seedId) return;
    CS().mutate((state) => {
      const farm = normalizeFarm(state.pocketHaven.farm, _normalizerContext(state));
      farm.selectedSeed = seedId;
      farm.selectedTool = 'seed';
    }, { source: 'farming_mode', type: 'farm_select_seed' });
  }

  function tickGrowth(state, amount = 1) {
    const farm = normalizeFarm(state.pocketHaven.farm, _normalizerContext(state));
    const ticks = Math.max(1, Number(amount || 1));
    let advanced = 0;
    let ready = 0;
    let neglected = 0;

    for (const key of Object.keys(farm.tiles || {})) {
      const tile = farm.tiles[key];
      if (!tile?.seedId || tile.ready) continue;
      if (!tile.watered) {
        tile.neglect = Number(tile.neglect || 0) + ticks;
        neglected += 1;
        continue;
      }
      const crop = _crop(tile.seedId);
      const bonus = tile.fertilized ? Number(crop?.fertilizerGrowthBonus ?? 1) : 0;
      tile.progress = Math.min(Number(tile.required || crop?.growthTicks || 3), Number(tile.progress || 0) + ticks + bonus);
      tile.ready = tile.progress >= Number(tile.required || crop?.growthTicks || 3);
      tile.watered = false;
      tile.cared = false;
      advanced += 1;
      if (tile.ready) ready += 1;
    }

    return { advanced, ready, neglected };
  }

  function grantSeed(state, seedId, qty = 1) {
    const farm = normalizeFarm(state.pocketHaven.farm, _normalizerContext(state));
    _addStock(farm.seedStock, seedId, qty);
    if (!farm.selectedSeed) farm.selectedSeed = seedId;
    _farmLog(state, `Gained ${qty} ${_name('crops', seedId)}.`);
  }

  function addFertilizer(state, fertilizerId = DEFAULT_FERTILIZER_ID, qty = 1) {
    const farm = normalizeFarm(state.pocketHaven.farm, _normalizerContext(state));
    _addStock(farm.fertilizerStock, fertilizerId, qty);
    farm.selectedFertilizer = fertilizerId;
    _farmLog(state, `Stored ${qty} ${_name('materials', fertilizerId)}.`);
  }

  function unlockSlots(state, qty = 1) {
    const farm = normalizeFarm(state.pocketHaven.farm, _normalizerContext(state));
    const before = farm.unlockedCropSlots;
    farm.unlockedCropSlots = Math.min(farm.maxCropSlots, before + Math.max(1, Number(qty || 1)));
    _farmLog(state, `Crop slots ${before} -> ${farm.unlockedCropSlots}.`);
  }

  function upgradeTool(state, toolId, levels = 1) {
    const farm = normalizeFarm(state.pocketHaven.farm, _normalizerContext(state));
    const id = TOOLS.some((tool) => tool.id === toolId) ? toolId : 'hand';
    farm.tools[id] = farm.tools[id] || { level: 1 };
    farm.tools[id].level = Math.max(1, Number(farm.tools[id].level || 1) + Math.max(1, Number(levels || 1)));
    _farmLog(state, `${_toolLabel(id)} upgraded to Lv ${farm.tools[id].level}.`);
  }

  function openQte() {
    CS().mutate((state) => {
      const farm = normalizeFarm(state.pocketHaven.farm, _normalizerContext(state));
      const qte = farm.qte;
      if (qte.active) return;
      if (!qte.available) {
        _farmLog(state, 'No focus bonus is ready.');
        return;
      }
      const streak = Math.max(0, Number(qte.streak || 0));
      qte.active = true;
      qte.available = false;
      qte.startedAt = Date.now();
      qte.duration = Math.max(1050, QTE_DEFAULT_DURATION - Math.min(5, streak) * 70);
      qte.targetStart = 30 + Math.floor(Math.random() * 35);
      qte.targetWidth = QTE_TARGET_WIDTH;
    }, { source: 'farming_mode', type: 'farm_qte_open' });
  }

  function closeQte() {
    CS().mutate((state) => {
      const farm = normalizeFarm(state.pocketHaven.farm, _normalizerContext(state));
      if (!farm.qte.active) return;
      farm.qte.active = false;
      farm.qte.available = true;
      farm.qte.startedAt = 0;
    }, { source: 'farming_mode', type: 'farm_qte_close' });
  }

  function hitQte() {
    CS().mutate((state) => {
      const farm = normalizeFarm(state.pocketHaven.farm, _normalizerContext(state));
      const qte = farm.qte;
      if (!qte.active) return;
      const duration = Math.max(1, Number(qte.duration || QTE_DEFAULT_DURATION));
      const progress = ((Date.now() - Number(qte.startedAt || Date.now())) % duration) / duration * 100;
      const start = Number(qte.targetStart || 40);
      const end = start + Number(qte.targetWidth || QTE_TARGET_WIDTH);
      const hit = progress >= start && progress <= end;

      qte.active = false;
      qte.available = false;
      qte.lastProgress = Math.round(progress);
      qte.lastResult = hit ? 'hit' : 'miss';
      qte.startedAt = 0;
      if (hit) {
        qte.streak = Math.max(0, Number(qte.streak || 0)) + 1;
        farm.bonusHarvests = Math.min(9, Math.max(0, Number(farm.bonusHarvests || 0)) + 1);
        _farmLog(state, 'Focus hit. Next harvest gains a bonus.');
      } else {
        qte.streak = 0;
        _farmLog(state, 'Focus missed.');
      }
    }, { source: 'farming_mode', type: 'farm_qte_hit' });
  }

  function closeTileMenu() {
    CS().mutate((state) => {
      const farm = normalizeFarm(state.pocketHaven.farm, _normalizerContext(state));
      farm.actionMenu = null;
    }, { source: 'farming_mode', type: 'farm_tile_menu_close' });
  }

  function tileAction(action, x, y) {
    if (!action) return;
    CS().mutate((state) => {
      const farm = normalizeFarm(state.pocketHaven.farm, _normalizerContext(state));
      x = Math.round(Number(x));
      y = Math.round(Number(y));
      if (!Number.isFinite(x) || !Number.isFinite(y) || !_inside(farm, x, y)) return;
      farm.actionMenu = null;
      farm.lastClickedTile = _key(x, y);
      if (action === 'close') return;
      if (action === 'move') {
        _moveToAdjacent(state, farm, x, y);
        return;
      }
      const toolByAction = {
        care: 'hand',
        harvest: 'hand',
        hoe: 'hoe',
        seed: 'seed',
        water: 'water',
        fertilizer: 'fertilizer',
        scythe: 'scythe'
      };
      const tool = toolByAction[action];
      if (!tool) return;
      farm.selectedTool = tool;
      _applyToolAtCell(state, farm, x, y, tool);
    }, { source: 'farming_mode', type: 'farm_tile_action' });
  }

  function _applyTool(state, farm) {
    const target = _targetCell(farm);
    if (!_inside(farm, target.x, target.y)) {
      _farmLog(state, 'The farm fence is in the way.');
      return;
    }
    const tile = _ensureTile(farm, target.x, target.y);
    const tool = farm.selectedTool || 'hand';
    if (tool === 'hand') return _handAction(state, farm, tile, target);
    if (tool === 'hoe') return _hoeAction(state, farm, tile, target);
    if (tool === 'seed') return _seedAction(state, farm, tile, target);
    if (tool === 'water') return _waterAction(state, farm, tile, target);
    if (tool === 'fertilizer') return _fertilizerAction(state, farm, tile, target);
    if (tool === 'scythe') return _scytheAction(state, farm, tile, target);
  }

  function _applyToolAtCell(state, farm, x, y, tool) {
    const dx = x - farm.player.x;
    const dy = y - farm.player.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1) {
      _farmLog(state, 'Stand next to that tile first.');
      return;
    }
    const direction = _directionTo(dx, dy);
    if (direction) farm.player.facing = direction;
    const tile = _ensureTile(farm, x, y);
    const target = { x, y };
    if (tool === 'hand') return _handAction(state, farm, tile, target);
    if (tool === 'hoe') return _hoeAction(state, farm, tile, target);
    if (tool === 'seed') return _seedAction(state, farm, tile, target);
    if (tool === 'water') return _waterAction(state, farm, tile, target);
    if (tool === 'fertilizer') return _fertilizerAction(state, farm, tile, target);
    if (tool === 'scythe') return _scytheAction(state, farm, tile, target);
  }

  function _handAction(state, farm, tile) {
    if (tile.seedId && tile.ready) return _harvestTile(state, farm, tile);
    if (tile.seedId) {
      tile.cared = true;
      tile.neglect = 0;
      _farmLog(state, `Checked ${_name('crops', tile.seedId)}.`);
      _afterFarmAction(state, farm, 'care');
      return;
    }
    if (tile.grass) {
      _farmLog(state, 'Tall grass rustles here.');
      return;
    }
    _farmLog(state, 'Nothing to pick up here.');
  }

  function _hoeAction(state, farm, tile, target) {
    if (!_isUnlockedCropSlot(farm, _key(target.x, target.y))) {
      _farmLog(state, 'This crop slot is still locked.');
      return;
    }
    if (tile.seedId) {
      _farmLog(state, 'A crop is already growing here.');
      return;
    }
    tile.terrain = 'soil';
    tile.tilled = true;
    tile.grass = false;
    tile.watered = false;
    _farmLog(state, 'Soil ploughed.');
    _afterFarmAction(state, farm, 'hoe');
  }

  function _seedAction(state, farm, tile, target) {
    const seedId = farm.selectedSeed;
    const crop = _crop(seedId);
    if (!crop) {
      _farmLog(state, 'No seed selected.');
      return;
    }
    if (!_isUnlockedCropSlot(farm, _key(target.x, target.y))) {
      _farmLog(state, 'Unlock this crop slot first.');
      return;
    }
    if (!tile.tilled) {
      _farmLog(state, 'Plough the soil before planting.');
      return;
    }
    if (tile.seedId) {
      _farmLog(state, 'This tile is already planted.');
      return;
    }
    if (_stockQty(farm.seedStock, seedId) <= 0) {
      _farmLog(state, `No ${crop.name || seedId} seeds left.`);
      return;
    }
    _addStock(farm.seedStock, seedId, -1);
    tile.seedId = seedId;
    tile.cropId = crop.cropId || seedId;
    tile.progress = 0;
    tile.required = Number(crop.growthTicks || crop.growTime || 3);
    tile.ready = false;
    tile.watered = false;
    tile.fertilized = false;
    tile.neglect = 0;
    _farmLog(state, `Planted ${crop.name || seedId}.`);
    _afterFarmAction(state, farm, 'plant');
  }

  function _waterAction(state, farm, tile, target = null) {
    if (target && _isLockedCropSlot(farm, _key(target.x, target.y))) {
      _farmLog(state, 'This crop slot is still locked.');
      return;
    }
    if (!tile.tilled && !tile.seedId) {
      _farmLog(state, 'Water sinks into wild grass.');
      return;
    }
    tile.watered = true;
    _farmLog(state, tile.seedId ? `Watered ${_name('crops', tile.seedId)}.` : 'Watered the soil.');
    _afterFarmAction(state, farm, 'water');
  }

  function _fertilizerAction(state, farm, tile, target = null) {
    if (target && _isLockedCropSlot(farm, _key(target.x, target.y))) {
      _farmLog(state, 'This crop slot is still locked.');
      return;
    }
    if (!tile.tilled && !tile.seedId) {
      _farmLog(state, 'Fertilizer needs prepared soil.');
      return;
    }
    const fertilizerId = farm.selectedFertilizer || DEFAULT_FERTILIZER_ID;
    if (!_consumeFertilizer(state, farm, fertilizerId)) {
      _farmLog(state, `No ${_name('materials', fertilizerId)} left.`);
      return;
    }
    tile.fertilized = true;
    _farmLog(state, 'Fertilizer mixed into the soil.');
    _afterFarmAction(state, farm, 'fertilizer');
  }

  function _scytheAction(state, farm, tile, target = null) {
    if (target && _isLockedCropSlot(farm, _key(target.x, target.y))) {
      _farmLog(state, 'This crop slot is still locked.');
      return;
    }
    if (tile.seedId) {
      _farmLog(state, 'Use hand to harvest crops.');
      return;
    }
    if (!tile.grass) {
      _farmLog(state, 'No grass to cut here.');
      return;
    }
    tile.grass = false;
    _grantBundle(state, { materials: { haven_grass_clippings: 1 } });
    _farmLog(state, 'Cut grass and saved clippings.');
    _afterFarmAction(state, farm, 'scythe');
  }

  function _harvestTile(state, farm, tile) {
    const crop = _crop(tile.seedId);
    const outputs = crop?.harvest || { materials: { [tile.cropId || tile.seedId]: 1 } };
    _grantBundle(state, outputs);
    const bonus = farm.bonusHarvests > 0 ? _singleHarvestBonus(outputs) : null;
    if (bonus && _bundleHasAny(bonus)) {
      _grantBundle(state, bonus);
      farm.bonusHarvests = Math.max(0, Number(farm.bonusHarvests || 0) - 1);
      _farmLog(state, `Harvested ${crop?.name || tile.seedId} with a focus bonus.`);
    } else {
      _farmLog(state, `Harvested ${crop?.name || tile.seedId}.`);
    }
    tile.seedId = null;
    tile.cropId = null;
    tile.progress = 0;
    tile.required = crop?.growthTicks || 3;
    tile.ready = false;
    tile.watered = false;
    tile.fertilized = false;
    tile.cared = false;
    tile.neglect = 0;
    _afterFarmAction(state, farm, 'harvest');
  }

  function _renderTiles(farm, targetKey) {
    const cells = [];
    const playerKey = _key(farm.player.x, farm.player.y);
    for (let y = 0; y < farm.height; y++) {
      for (let x = 0; x < farm.width; x++) {
        const key = _key(x, y);
        const tile = _tileAt(farm, x, y);
        const crop = tile.seedId ? _crop(tile.seedId) : null;
        const cropStage = crop ? _cropStage(tile, crop) : '';
        const distance = Math.abs(farm.player.x - x) + Math.abs(farm.player.y - y);
        const slotIndex = farm.cropSlots.indexOf(key);
        const locked = slotIndex >= 0 && slotIndex >= farm.unlockedCropSlots;
        const classes = [
          'farm-tile',
          `terrain-${_className(tile.terrain || 'grass')}`,
          tile.tilled ? 'is-tilled' : '',
          tile.watered ? 'is-watered' : '',
          tile.fertilized ? 'is-fertilized' : '',
          tile.grass ? 'has-grass' : '',
          tile.seedId ? 'has-crop' : '',
          tile.ready ? 'is-ready' : '',
          key === targetKey ? 'is-target' : '',
          key === farm.lastClickedTile ? 'is-click-goal' : '',
          distance === 1 ? 'is-neighbor' : '',
          key === playerKey ? `is-player facing-${_className(farm.player.facing)}` : '',
          locked ? 'is-locked-slot' : '',
          slotIndex >= 0 && !locked ? 'is-crop-slot' : ''
        ].filter(Boolean).join(' ');
        cells.push(`
          <button class="${classes}" data-campaign-action="farm-tile" data-x="${x}" data-y="${y}" title="${_escAttr(_tileLabel(tile, crop, locked))}" aria-label="${_escAttr(_tileLabel(tile, crop, locked))}">
            <span class="farm-ground"></span>
            ${tile.grass ? '<span class="farm-grass"></span>' : ''}
            ${tile.seedId ? `<span class="farm-crop crop-stage-${_escAttr(cropStage)}">${_esc(_cropGlyph(tile, crop))}</span>` : ''}
            ${key === playerKey ? '<span class="farm-player"><span></span></span>' : ''}
          </button>
        `);
      }
    }
    return cells.join('');
  }

  function _renderTool(tool, farm) {
    const active = farm.selectedTool === tool.id;
    const level = farm.tools?.[tool.id]?.level || 1;
    return `
      <button class="farm-tool ${active ? 'is-active' : ''}" data-campaign-action="farm-select-tool" data-tool="${_escAttr(tool.id)}" aria-pressed="${active ? 'true' : 'false'}">
        <span class="farm-tool-glyph tool-${_className(tool.id)}">${_esc(tool.glyph)}</span>
        <span>${_esc(tool.label)}</span>
        <small>Lv ${_esc(level)}</small>
      </button>
    `;
  }

  function _renderTileMenu(state, farm) {
    const menu = farm.actionMenu;
    if (!menu || !_inside(farm, menu.x, menu.y)) return '';
    const tile = _tileAt(farm, menu.x, menu.y);
    const crop = tile.seedId ? _crop(tile.seedId) : null;
    const key = _key(menu.x, menu.y);
    const slotIndex = farm.cropSlots.indexOf(key);
    const locked = _isLockedCropSlot(farm, key);
    const unlocked = _isUnlockedCropSlot(farm, key);
    const title = crop ? (crop.name || crop.id) : _tileKind(tile, slotIndex, unlocked);
    const options = _tileActionOptions(state, farm, tile, menu);
    return `
      <div class="farm-tile-menu-backdrop" role="presentation">
        <div class="farm-tile-menu" role="dialog" aria-label="Tile actions">
          <div class="farm-tile-menu-head">
            <div>
              <strong>${_esc(title)}</strong>
              <div class="campaign-muted">${locked ? 'Locked crop slot' : `Tile ${_esc(menu.x + 1)},${_esc(menu.y + 1)}`}</div>
            </div>
            <button class="campaign-icon-btn" data-campaign-action="farm-tile-menu-close" aria-label="Close tile actions">Close</button>
          </div>
          <div class="farm-tile-menu-meta">
            ${crop ? `<span>Growth ${_esc(Math.min(tile.progress || 0, tile.required || crop.growthTicks || 3))}/${_esc(tile.required || crop.growthTicks || 3)}</span>` : ''}
            ${tile.tilled ? '<span>Prepared soil</span>' : '<span>Wild ground</span>'}
            ${tile.watered ? '<span>Watered</span>' : '<span>Dry</span>'}
            ${tile.fertilized ? '<span>Fertilized</span>' : ''}
          </div>
          <div class="farm-tile-menu-actions">
            ${options.map((option) => `
              <button class="campaign-action ${option.primary ? 'primary' : ''}" data-campaign-action="farm-tile-action" data-tile-action="${_escAttr(option.id)}" data-x="${_escAttr(menu.x)}" data-y="${_escAttr(menu.y)}" ${option.enabled ? '' : 'disabled'} title="${_escAttr(option.hint || option.label)}">
                <span>${_esc(option.label)}</span>
                ${option.hint ? `<small>${_esc(option.hint)}</small>` : ''}
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function _renderQteWindow(farm) {
    const qte = farm.qte || {};
    if (!qte.active) return '';
    const targetStart = _clampInt(qte.targetStart || 40, 0, 90);
    const targetWidth = _clampInt(qte.targetWidth || QTE_TARGET_WIDTH, 8, 34);
    const duration = _clampInt(qte.duration || QTE_DEFAULT_DURATION, 900, 2400);
    return `
      <div class="farm-qte-backdrop" role="presentation">
        <div class="farm-qte-window" role="dialog" aria-label="Farm focus bonus">
          <div class="farm-qte-head">
            <strong>Focus Bonus</strong>
            <button class="campaign-icon-btn" data-campaign-action="farm-qte-close" aria-label="Close focus bonus">Close</button>
          </div>
          <div class="farm-qte-lane" style="--qte-target-start:${_escAttr(targetStart)}%; --qte-target-width:${_escAttr(targetWidth)}%; --qte-duration:${_escAttr(duration)}ms">
            <span class="farm-qte-target"></span>
            <span class="farm-qte-marker"></span>
          </div>
          <div class="farm-qte-actions">
            <button class="campaign-action primary farm-qte-hit" data-campaign-action="farm-qte-hit">Hit</button>
            <button class="campaign-action" data-campaign-action="farm-qte-close">Close</button>
          </div>
        </div>
      </div>
    `;
  }

  function _renderTileDetail(farm, tile, target) {
    const crop = tile.seedId ? _crop(tile.seedId) : null;
    const slotKey = _key(target.x, target.y);
    const slotIndex = farm.cropSlots.indexOf(slotKey);
    const unlocked = _isUnlockedCropSlot(farm, slotKey);
    const progress = crop ? `${Math.min(tile.progress || 0, tile.required || crop.growthTicks || 3)}/${tile.required || crop.growthTicks || 3}` : 'none';
    return `
      <div class="farm-detail-title">
        <strong>${crop ? _esc(crop.name || crop.id) : _esc(_tileKind(tile, slotIndex, unlocked))}</strong>
        <span class="campaign-pill">${_esc(DIRECTIONS[farm.player.facing]?.label || 'Target')}</span>
      </div>
      <div class="farm-detail-grid">
        <span>Progress</span><b>${_esc(progress)}</b>
        <span>Soil</span><b>${tile.tilled ? 'Ready' : 'Wild'}</b>
        <span>Water</span><b>${tile.watered ? 'Wet' : 'Dry'}</b>
        <span>Fertilizer</span><b>${tile.fertilized ? 'Mixed' : 'None'}</b>
      </div>
    `;
  }

  function _actionLabel(farm, tile, target) {
    const tool = farm.selectedTool || 'hand';
    if (tool === 'hand' && tile.seedId && tile.ready) return 'Harvest';
    if (tool === 'hand') return 'Take Care';
    if (tool === 'hoe') return 'Plough';
    if (tool === 'seed') return 'Plant';
    if (tool === 'water') return 'Water';
    if (tool === 'fertilizer') return 'Fertilize';
    if (tool === 'scythe') return 'Cut';
    return _toolLabel(tool);
  }

  function _tileActionOptions(state, farm, tile, target) {
    const key = _key(target.x, target.y);
    const locked = _isLockedCropSlot(farm, key);
    const crop = tile.seedId ? _crop(tile.seedId) : null;
    const distance = Math.abs(target.x - farm.player.x) + Math.abs(target.y - farm.player.y);
    const seedId = farm.selectedSeed;
    const seedName = _name('crops', seedId);
    const seedQty = _stockQty(farm.seedStock, seedId);
    const fertilizerQty = _fertilizerAvailable(state, farm);
    const adjacent = distance === 1;
    const out = [];

    out.push({
      id: 'move',
      label: 'Move Here',
      enabled: adjacent && _canStandOnTile(farm, target.x, target.y),
      hint: locked ? 'Slot locked' : adjacent ? '' : 'Stand next to it'
    });

    if (locked) {
      out.push({ id: 'hoe', label: 'Locked Slot', enabled: false, hint: 'Unlock more crop slots first' });
      return out;
    }

    if (tile.seedId) {
      out.push({
        id: tile.ready ? 'harvest' : 'care',
        label: tile.ready ? 'Harvest' : 'Take Care',
        enabled: adjacent,
        primary: tile.ready,
        hint: adjacent ? (tile.ready ? 'Collect crop' : 'Reset neglect') : 'Stand next to it'
      });
    } else {
      out.push({
        id: 'hoe',
        label: 'Plough',
        enabled: adjacent && _isUnlockedCropSlot(farm, key) && !tile.tilled,
        primary: !tile.tilled && _isUnlockedCropSlot(farm, key),
        hint: !_isCropSlot(farm, key) ? 'Not a crop slot' : tile.tilled ? 'Already prepared' : ''
      });
    }

    out.push({
      id: 'seed',
      label: 'Plant Seed',
      enabled: adjacent && _isUnlockedCropSlot(farm, key) && tile.tilled && !tile.seedId && seedQty > 0,
      primary: adjacent && tile.tilled && !tile.seedId && seedQty > 0,
      hint: seedQty <= 0 ? `Need ${seedName}` : !tile.tilled ? 'Plough first' : tile.seedId ? 'Already planted' : `${seedName} x${seedQty}`
    });

    out.push({
      id: 'water',
      label: 'Water',
      enabled: adjacent && (tile.tilled || tile.seedId) && !tile.watered,
      hint: tile.watered ? 'Already watered' : (!tile.tilled && !tile.seedId) ? 'Needs prepared soil' : ''
    });

    out.push({
      id: 'fertilizer',
      label: 'Fertilize',
      enabled: adjacent && (tile.tilled || tile.seedId) && !tile.fertilized && fertilizerQty > 0,
      hint: fertilizerQty <= 0 ? 'Craft or find fertilizer' : tile.fertilized ? 'Already fertilized' : `Stock ${fertilizerQty}`
    });

    out.push({
      id: 'scythe',
      label: 'Cut Grass',
      enabled: adjacent && tile.grass && !tile.seedId,
      hint: tile.grass ? 'Gives clippings' : 'No tall grass'
    });

    return out;
  }

  function _normalizePlayer(player = {}, width, height) {
    return {
      x: _clampInt(player.x ?? 1, 0, width - 1),
      y: _clampInt(player.y ?? Math.floor(height / 2), 0, height - 1),
      facing: DIRECTIONS[player.facing] ? player.facing : 'down'
    };
  }

  function _normalizeStock(stock, fallback) {
    const source = stock && typeof stock === 'object' ? stock : {};
    const hasAny = Object.keys(source).length > 0;
    const out = {};
    for (const [id, qty] of Object.entries(hasAny ? source : fallback || {})) {
      if (id) out[id] = Math.max(0, Number(qty || 0));
    }
    return out;
  }

  function _normalizeTools(tools = {}) {
    const out = {};
    for (const tool of TOOLS) {
      out[tool.id] = {
        level: Math.max(1, Number(tools?.[tool.id]?.level || 1)),
        durability: tools?.[tool.id]?.durability ?? null
      };
    }
    return out;
  }

  function _normalizeQte(qte = {}) {
    return {
      available: !!qte.available,
      active: !!qte.active,
      reason: qte.reason || '',
      streak: Math.max(0, Number(qte.streak || 0)),
      actionCount: Math.max(0, Number(qte.actionCount || 0)),
      startedAt: Math.max(0, Number(qte.startedAt || 0)),
      duration: Math.max(900, Number(qte.duration || QTE_DEFAULT_DURATION)),
      targetStart: _clampInt(qte.targetStart || 40, 0, 90),
      targetWidth: _clampInt(qte.targetWidth || QTE_TARGET_WIDTH, 8, 34),
      lastResult: qte.lastResult || '',
      lastProgress: Math.max(0, Number(qte.lastProgress || 0))
    };
  }

  function _normalizeClickedTile(value, width, height) {
    if (!value) return null;
    const [x, y] = _xy(value);
    return _coordsInside(width, height, x, y) ? _key(x, y) : null;
  }

  function _normalizeActionMenu(menu, width, height) {
    if (!menu || typeof menu !== 'object') return null;
    const x = Math.round(Number(menu.x));
    const y = Math.round(Number(menu.y));
    return _coordsInside(width, height, x, y) ? { x, y } : null;
  }

  function _nudgePlayerOffLockedSlot(farm) {
    if (_canStandOnTile(farm, farm.player.x, farm.player.y)) return;
    const queue = [{ x: farm.player.x, y: farm.player.y }];
    const seen = new Set();
    while (queue.length) {
      const next = queue.shift();
      const key = _key(next.x, next.y);
      if (seen.has(key)) continue;
      seen.add(key);
      if (_inside(farm, next.x, next.y) && _canStandOnTile(farm, next.x, next.y)) {
        farm.player.x = next.x;
        farm.player.y = next.y;
        return;
      }
      for (const delta of Object.values(DIRECTIONS)) {
        const nx = next.x + delta.x;
        const ny = next.y + delta.y;
        if (_inside(farm, nx, ny) && !seen.has(_key(nx, ny))) queue.push({ x: nx, y: ny });
      }
    }
    farm.player.x = 0;
    farm.player.y = Math.min(farm.height - 1, Math.max(0, farm.player.y));
  }

  function _normalizeTiles(tiles = {}, width, height) {
    const out = {};
    for (const [key, raw] of Object.entries(tiles || {})) {
      const [x, y] = _xy(key);
      if (!_coordsInside(width, height, x, y)) continue;
      out[key] = _normalizeTile(raw, x, y);
    }
    return out;
  }

  function _normalizeTile(raw = {}, x, y) {
    const base = _defaultTile(x, y);
    const tile = { ...base, ...(raw || {}) };
    tile.terrain = tile.terrain || (tile.tilled ? 'soil' : 'grass');
    tile.tilled = !!tile.tilled || tile.terrain === 'soil';
    tile.grass = !!tile.grass && !tile.seedId && !tile.tilled;
    tile.progress = Math.max(0, Number(tile.progress || 0));
    tile.required = Math.max(1, Number(tile.required || _crop(tile.seedId)?.growthTicks || 3));
    tile.ready = !!tile.ready || (!!tile.seedId && tile.progress >= tile.required);
    tile.watered = !!tile.watered;
    tile.fertilized = !!tile.fertilized;
    tile.cared = !!tile.cared;
    tile.neglect = Math.max(0, Number(tile.neglect || 0));
    return tile;
  }

  function _normalizeCropSlots(slots, width, height) {
    const clean = Array.isArray(slots)
      ? slots.filter((key) => {
          const [x, y] = _xy(key);
          return _coordsInside(width, height, x, y);
        })
      : [];
    return clean.length ? Array.from(new Set(clean)) : _defaultCropSlots(width, height);
  }

  function _defaultCropSlots(width, height) {
    const slots = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) slots.push(_key(x, y));
    }
    return slots;
  }

  function _migrateLegacyPlots(farm) {
    if (farm.gridMigratedFromPlots || !Array.isArray(farm.plots) || !farm.plots.length) return;
    farm.plots.forEach((plot, index) => {
      if (!plot?.seedId) return;
      const key = farm.cropSlots[index];
      if (!key || farm.tiles[key]?.seedId) return;
      const [x, y] = _xy(key);
      farm.tiles[key] = _normalizeTile({
        terrain: 'soil',
        tilled: true,
        seedId: plot.seedId,
        cropId: plot.cropId,
        progress: plot.progress || 0,
        required: plot.required || _crop(plot.seedId)?.growthTicks || 3,
        ready: !!plot.ready
      }, x, y);
    });
    farm.gridMigratedFromPlots = true;
  }

  function _targetCell(farm) {
    const delta = DIRECTIONS[farm.player.facing] || DIRECTIONS.down;
    return { x: farm.player.x + delta.x, y: farm.player.y + delta.y };
  }

  function _handleTileClick(state, farm, rawX, rawY) {
    const x = Math.round(Number(rawX));
    const y = Math.round(Number(rawY));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !_inside(farm, x, y)) return;

    farm.lastClickedTile = _key(x, y);
    const dx = x - farm.player.x;
    const dy = y - farm.player.y;
    const distance = Math.abs(dx) + Math.abs(dy);
    if (distance === 0) {
      const target = _targetCell(farm);
      if (_inside(farm, target.x, target.y)) _openTileMenu(farm, target.x, target.y);
      return;
    }

    if (distance === 1) {
      farm.player.facing = _directionTo(dx, dy) || farm.player.facing;
      _openTileMenu(farm, x, y);
      return;
    }

    farm.actionMenu = null;
    _stepToward(state, farm, x, y);
  }

  function _tryMove(state, farm, direction, options = {}) {
    const delta = DIRECTIONS[direction];
    if (!delta) return false;
    const next = { x: farm.player.x + delta.x, y: farm.player.y + delta.y };
    farm.player.facing = direction;
    if (!_inside(farm, next.x, next.y)) {
      if (options.logFailure) _farmLog(state, `Edge of the farm faces ${DIRECTIONS[direction].label}.`);
      return false;
    }
    if (!_canStandOnTile(farm, next.x, next.y)) {
      if (options.logFailure) _farmLog(state, _isLockedCropSlot(farm, _key(next.x, next.y)) ? 'That crop slot is locked.' : 'That tile is blocked.');
      return false;
    }
    farm.player.x = next.x;
    farm.player.y = next.y;
    return true;
  }

  function _moveToAdjacent(state, farm, x, y) {
    const direction = _directionTo(x - farm.player.x, y - farm.player.y);
    if (direction) _tryMove(state, farm, direction, { logFailure: true });
  }

  function _stepToward(state, farm, x, y) {
    const dx = x - farm.player.x;
    const dy = y - farm.player.y;
    const horizontal = dx > 0 ? 'right' : dx < 0 ? 'left' : null;
    const vertical = dy > 0 ? 'down' : dy < 0 ? 'up' : null;
    const candidates = Math.abs(dx) >= Math.abs(dy)
      ? [horizontal, vertical]
      : [vertical, horizontal];
    for (const direction of candidates.filter(Boolean)) {
      if (_tryMove(state, farm, direction)) return;
    }
    _farmLog(state, 'No clear path to that tile.');
  }

  function _directionTo(dx, dy) {
    if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
    if (dx > 0) return 'right';
    if (dx < 0) return 'left';
    if (dy > 0) return 'down';
    if (dy < 0) return 'up';
    return null;
  }

  function _toolCanAffectTile(farm, tile, target) {
    const tool = farm.selectedTool || 'hand';
    const key = _key(target.x, target.y);
    if (_isLockedCropSlot(farm, key)) return false;
    if (tool === 'hand') return !!tile.seedId;
    if (tool === 'hoe') return !tile.seedId && _isUnlockedCropSlot(farm, key);
    if (tool === 'seed') return _isUnlockedCropSlot(farm, key) && tile.tilled && !tile.seedId;
    if (tool === 'water') return !!tile.seedId || !!tile.tilled;
    if (tool === 'fertilizer') return !!tile.seedId || !!tile.tilled;
    if (tool === 'scythe') return !!tile.grass;
    return false;
  }

  function _openTileMenu(farm, x, y) {
    farm.actionMenu = _inside(farm, x, y) ? { x, y } : null;
  }

  function _canStandOnTile(farm, x, y) {
    if (!_inside(farm, x, y)) return false;
    if (_tileAt(farm, x, y).blocked) return false;
    return !_isLockedCropSlot(farm, _key(x, y));
  }

  function _tileAt(farm, x, y) {
    return farm.tiles?.[_key(x, y)] || _defaultTile(x, y);
  }

  function _ensureTile(farm, x, y) {
    const key = _key(x, y);
    farm.tiles[key] = _normalizeTile(farm.tiles[key] || _defaultTile(x, y), x, y);
    return farm.tiles[key];
  }

  function _defaultTile(x, y) {
    return {
      terrain: 'grass',
      grass: (x * 7 + y * 11) % 5 === 0,
      tilled: false,
      watered: false,
      fertilized: false,
      blocked: false
    };
  }

  function _cropOptions(world) {
    const all = DS()?.getAllAsArray?.('crops') || [];
    return all.filter((crop) => !crop._world || !world || crop._world === world);
  }

  function _seedOptions(world) {
    const crops = _cropOptions(world);
    if (crops.length) return crops;
    return [{ id: 'haven_frostcap_seed', name: 'Frostcap Seed', growthTicks: 3 }];
  }

  function _crop(seedId) {
    return seedId ? DS()?.get?.('crops', seedId) : null;
  }

  function _cropStage(tile, crop) {
    const stages = crop?.stages || [];
    if (!stages.length) return tile.ready ? 'ready' : 'growing';
    if (tile.ready) return stages[stages.length - 1]?.id || 'ready';
    const pct = Number(tile.progress || 0) / Math.max(1, Number(tile.required || crop.growthTicks || 3));
    const index = Math.min(stages.length - 1, Math.floor(pct * stages.length));
    return stages[index]?.id || `stage-${index + 1}`;
  }

  function _cropGlyph(tile, crop) {
    if (tile.ready) return crop?.readyGlyph || '!';
    const pct = Number(tile.progress || 0) / Math.max(1, Number(tile.required || crop?.growthTicks || 3));
    if (pct >= 0.66) return crop?.midGlyph || 'o';
    if (pct >= 0.33) return crop?.sproutGlyph || 'v';
    return '.';
  }

  function _isUnlockedCropSlot(farm, key) {
    const index = farm.cropSlots.indexOf(key);
    return index >= 0 && index < farm.unlockedCropSlots;
  }

  function _isLockedCropSlot(farm, key) {
    const index = farm.cropSlots.indexOf(key);
    return index >= 0 && index >= farm.unlockedCropSlots;
  }

  function _isCropSlot(farm, key) {
    return farm.cropSlots.indexOf(key) >= 0;
  }

  function _fertilizerAvailable(state, farm) {
    const id = farm.selectedFertilizer || DEFAULT_FERTILIZER_ID;
    return _stockQty(farm.fertilizerStock, id) + Number(state.inventory?.materials?.[id] || 0);
  }

  function _consumeFertilizer(state, farm, id) {
    if (_stockQty(farm.fertilizerStock, id) > 0) {
      _addStock(farm.fertilizerStock, id, -1);
      return true;
    }
    const materials = state.inventory?.materials || {};
    if (Number(materials[id] || 0) > 0) {
      materials[id] = Math.max(0, Number(materials[id] || 0) - 1);
      if (materials[id] <= 0) delete materials[id];
      return true;
    }
    return false;
  }

  function _grantBundle(state, bundle = {}) {
    state.inventory = state.inventory || {};
    for (const bucket of ['items', 'materials', 'food', 'questItems']) {
      state.inventory[bucket] = state.inventory[bucket] || {};
      for (const [id, qty] of Object.entries(bundle[bucket] || {})) {
        state.inventory[bucket][id] = Math.max(0, Number(state.inventory[bucket][id] || 0) + Number(qty || 0));
        if (state.inventory[bucket][id] <= 0) delete state.inventory[bucket][id];
      }
    }
    state.currencies = state.currencies || {};
    for (const [id, qty] of Object.entries(bundle.currencies || {})) {
      state.currencies[id] = Math.max(0, Number(state.currencies[id] || 0) + Number(qty || 0));
    }
  }

  function _afterFarmAction(state, farm, reason) {
    farm.qte = _normalizeQte(farm.qte);
    const qte = farm.qte;
    qte.actionCount = Math.max(0, Number(qte.actionCount || 0)) + 1;
    if (qte.available || qte.active) return;
    const strongReason = reason === 'harvest' || reason === 'care' || reason === 'scythe';
    const cadenceReady = qte.actionCount % 5 === 0;
    const chance = strongReason ? 0.28 : 0.12;
    if (cadenceReady || Math.random() < chance) {
      qte.available = true;
      qte.reason = reason || 'farm';
      _farmLog(state, 'A focus bonus is ready.');
    }
  }

  function _singleHarvestBonus(bundle = {}) {
    for (const bucket of ['materials', 'items', 'food', 'questItems', 'currencies']) {
      const entry = Object.entries(bundle[bucket] || {}).find(([, qty]) => Number(qty || 0) > 0);
      if (entry) return { [bucket]: { [entry[0]]: 1 } };
    }
    return {};
  }

  function _bundleHasAny(bundle = {}) {
    return ['materials', 'items', 'food', 'questItems', 'currencies'].some((bucket) => (
      Object.values(bundle[bucket] || {}).some((qty) => Number(qty || 0) > 0)
    ));
  }

  function _farmLog(state, text) {
    if (!text) return;
    const farm = state.pocketHaven?.farm;
    if (farm) {
      farm.recent = [text, ...(farm.recent || [])].slice(0, 8);
    }
    state.log = state.log || [];
    state.log.unshift({
      id: `log_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      at: new Date().toISOString(),
      phase: state.phase?.number || 1,
      world: state.currentWorld,
      text,
      op: 'farm'
    });
    state.log = state.log.slice(0, 500);
  }

  function _addStock(stock, id, qty) {
    if (!id || !qty) return;
    stock[id] = Math.max(0, Number(stock[id] || 0) + Number(qty || 0));
  }

  function _stockQty(stock, id) {
    return Math.max(0, Number(stock?.[id] || 0));
  }

  function _firstPositiveStock(stock = {}) {
    return Object.keys(stock).find((id) => Number(stock[id] || 0) > 0) || Object.keys(stock)[0] || '';
  }

  function _normalizerContext(state) {
    return {
      world: state?.currentWorld,
      rule: Object.values(CS()?.getContent?.()?.pocketHavenRules || {})[0] || {}
    };
  }

  function _defaultRule() {
    return Object.values(CS()?.getContent?.()?.pocketHavenRules || {})[0] || {};
  }

  function _inside(farm, x, y) {
    return _coordsInside(farm.width, farm.height, x, y);
  }

  function _coordsInside(width, height, x, y) {
    return x >= 0 && y >= 0 && x < width && y < height;
  }

  function _xy(key) {
    const [x, y] = String(key || '').split(',').map((part) => Number(part));
    return [Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0];
  }

  function _key(x, y) {
    return `${Number(x)},${Number(y)}`;
  }

  function _clampInt(value, min, max) {
    const n = Math.round(Number(value || min));
    return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
  }

  function _toolLabel(id) {
    return TOOLS.find((tool) => tool.id === id)?.label || id;
  }

  function _tileKind(tile, slotIndex, unlocked) {
    if (slotIndex >= 0) return unlocked ? 'Open Crop Slot' : 'Locked Crop Slot';
    if (tile.grass) return 'Tall Grass';
    return tile.tilled ? 'Prepared Soil' : 'Farm Ground';
  }

  function _tileLabel(tile, crop, locked) {
    if (locked) return 'Locked crop slot';
    if (crop) return `${crop.name || crop.id} ${tile.ready ? 'ready' : 'growing'}`;
    if (tile.grass) return 'Tall grass';
    if (tile.tilled) return 'Prepared soil';
    return 'Farm ground';
  }

  function _name(type, id) {
    return DS()?.get?.(type, id)?.name || id;
  }

  function _className(value) {
    return String(value || '').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  }

  function _esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function _escAttr(value) {
    return _esc(value);
  }

  return Object.freeze({
    TOOLS,
    normalizeFarm,
    renderFarm,
    bindControls,
    move,
    faceOrUseTile,
    interact,
    selectTool,
    selectSeed,
    tickGrowth,
    openQte,
    closeQte,
    hitQte,
    closeTileMenu,
    tileAction,
    grantSeed,
    addFertilizer,
    unlockSlots,
    upgradeTool
  });
})();
