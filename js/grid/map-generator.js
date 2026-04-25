// map-generator.js
// Procedural battle map generation helpers for quick battles.

window.CJS = window.CJS || {};

window.CJS.MapGenerator = (() => {
  'use strict';

  const C = () => window.CJS.CONST;

  const THEMES = {
    forest: {
      name: 'Forest Clearing',
      icon: 'T',
      obstacleChance: 0.12,
      obstacleTypes: ['tree', 'tree', 'tree', 'obstacle'],
      terrainWeights: { empty: 20, thorns: 2, heal_zone: 1, mud: 1, water: 0.5 },
      borderStyle: 'natural',
      borderTerrain: 'tree',
      sizes: [8, 10],
      desc: 'Trees and undergrowth with occasional clearings'
    },
    cave: {
      name: 'Underground Cave',
      icon: 'C',
      obstacleChance: 0.15,
      obstacleTypes: ['obstacle', 'obstacle', 'pillar', 'wall'],
      terrainWeights: { empty: 20, water: 2, ice_zone: 1, dark: 1, rubble: 1 },
      borderStyle: 'walled',
      borderTerrain: 'wall',
      sizes: [8, 10],
      desc: 'Cramped tunnels and stone cover'
    },
    ruins: {
      name: 'Ancient Ruins',
      icon: 'R',
      obstacleChance: 0.14,
      obstacleTypes: ['pillar', 'wall', 'rubble', 'obstacle'],
      terrainWeights: { empty: 20, rubble: 3, holy: 1, dark: 1, fire_zone: 0.5 },
      borderStyle: 'natural',
      borderTerrain: 'wall',
      sizes: [10, 12],
      desc: 'Crumbling pillars and old magic'
    },
    volcano: {
      name: 'Volcanic Rift',
      icon: 'V',
      obstacleChance: 0.10,
      obstacleTypes: ['obstacle', 'obstacle', 'wall'],
      terrainWeights: { empty: 15, fire_zone: 5, lava: 3, rubble: 2 },
      borderStyle: 'natural',
      borderTerrain: 'obstacle',
      sizes: [8, 10],
      desc: 'Lava channels and scorched ground'
    },
    tundra: {
      name: 'Frozen Tundra',
      icon: 'I',
      obstacleChance: 0.08,
      obstacleTypes: ['obstacle', 'obstacle', 'tree'],
      terrainWeights: { empty: 18, ice_zone: 5, water: 2, wind: 1 },
      borderStyle: 'open',
      borderTerrain: null,
      sizes: [10, 12],
      desc: 'Icy plains and bitter wind'
    },
    arena: {
      name: 'Gladiator Arena',
      icon: 'A',
      obstacleChance: 0.06,
      obstacleTypes: ['pillar', 'pillar', 'obstacle'],
      terrainWeights: { empty: 25, fire_zone: 0.5, electric: 0.5 },
      borderStyle: 'walled',
      borderTerrain: 'wall',
      sizes: [8, 10],
      desc: 'Open combat floor with sparse cover'
    },
    swamp: {
      name: 'Toxic Swamp',
      icon: 'S',
      obstacleChance: 0.10,
      obstacleTypes: ['tree', 'obstacle', 'tree'],
      terrainWeights: { empty: 12, poison_zone: 4, water: 4, mud: 3, thorns: 2 },
      borderStyle: 'natural',
      borderTerrain: 'tree',
      sizes: [8, 10],
      desc: 'Poison pools and sticky ground'
    },
    temple: {
      name: 'Sacred Temple',
      icon: 'H',
      obstacleChance: 0.12,
      obstacleTypes: ['pillar', 'pillar', 'wall', 'pillar'],
      terrainWeights: { empty: 20, holy: 3, heal_zone: 1 },
      borderStyle: 'walled',
      borderTerrain: 'wall',
      sizes: [10, 12],
      desc: 'Holy ground and ancient pillars'
    },
    void: {
      name: 'Chaotic Void',
      icon: 'X',
      obstacleChance: 0.08,
      obstacleTypes: ['obstacle', 'wall'],
      terrainWeights: { empty: 12, dark: 4, electric: 3, fire_zone: 2, wind: 2, poison_zone: 1 },
      borderStyle: 'open',
      borderTerrain: null,
      sizes: [8, 10, 12],
      desc: 'Unpredictable elemental chaos'
    },
    open_field: {
      name: 'Open Field',
      icon: 'F',
      obstacleChance: 0.04,
      obstacleTypes: ['obstacle', 'tree'],
      terrainWeights: { empty: 30, high_ground: 1 },
      borderStyle: 'open',
      borderTerrain: null,
      sizes: [8, 10, 12],
      desc: 'Wide open space with very light cover'
    }
  };

  function _pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function _weightedPick(weights) {
    const entries = Object.entries(weights);
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = Math.random() * total;
    for (const [key, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return key;
    }
    return entries[entries.length - 1][0];
  }

  function _computeSpawnZones(width, height, borderStyle) {
    const margin = borderStyle === 'walled' ? 1 : 0;
    const depth = Math.min(3, Math.max(2, Math.ceil(height / 4)));
    const player = [];
    const enemy = [];

    for (let r = height - depth - margin; r < height - margin; r++) {
      for (let c = margin; c < width - margin; c++) {
        player.push([r, c]);
      }
    }

    for (let r = margin; r < depth + margin; r++) {
      for (let c = margin; c < width - margin; c++) {
        enemy.push([r, c]);
      }
    }

    return { player, enemy };
  }

  function _ensureConnectivity(grid, width, height) {
    let hasPath = false;

    for (let c = 1; c < width - 1; c++) {
      let blocked = false;
      for (let r = 0; r < height; r++) {
        const terrain = C().TERRAIN_TYPES[grid[r][c]];
        if (terrain && !terrain.passable) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        hasPath = true;
        break;
      }
    }

    if (hasPath) return;

    const mid = Math.floor(width / 2);
    for (let r = 0; r < height; r++) {
      const terrain = C().TERRAIN_TYPES[grid[r][mid]];
      if (terrain && !terrain.passable) grid[r][mid] = 'empty';

      if (mid + 1 < width) {
        const alt = C().TERRAIN_TYPES[grid[r][mid + 1]];
        if (alt && !alt.passable) grid[r][mid + 1] = 'empty';
      }
    }
  }

  function generate(options = {}) {
    const themeId = options.theme || _pick(Object.keys(THEMES));
    const theme = THEMES[themeId];
    if (!theme) throw new Error(`Unknown map theme: ${themeId}`);

    const width = options.width || _pick(theme.sizes);
    const height = options.height || width;
    const grid = Array.from({ length: height }, () => Array(width).fill('empty'));

    if (theme.borderStyle === 'walled') {
      for (let r = 0; r < height; r++) {
        grid[r][0] = theme.borderTerrain || 'wall';
        grid[r][width - 1] = theme.borderTerrain || 'wall';
      }
      for (let c = 0; c < width; c++) {
        grid[0][c] = theme.borderTerrain || 'wall';
        grid[height - 1][c] = theme.borderTerrain || 'wall';
      }
    } else if (theme.borderStyle === 'natural') {
      for (let r = 0; r < height; r++) {
        if (Math.random() < 0.5) grid[r][0] = theme.borderTerrain || 'tree';
        if (Math.random() < 0.5) grid[r][width - 1] = theme.borderTerrain || 'tree';
      }
      for (let c = 0; c < width; c++) {
        if (Math.random() < 0.5) grid[0][c] = theme.borderTerrain || 'tree';
        if (Math.random() < 0.5) grid[height - 1][c] = theme.borderTerrain || 'tree';
      }
    }

    const spawnZones = _computeSpawnZones(width, height, theme.borderStyle);
    const spawnCells = new Set([...spawnZones.player, ...spawnZones.enemy].map(([r, c]) => `${r},${c}`));
    const innerStart = theme.borderStyle === 'walled' ? 1 : 0;
    const innerEndR = theme.borderStyle === 'walled' ? height - 1 : height;
    const innerEndC = theme.borderStyle === 'walled' ? width - 1 : width;

    for (let r = innerStart; r < innerEndR; r++) {
      for (let c = innerStart; c < innerEndC; c++) {
        if (spawnCells.has(`${r},${c}`) || grid[r][c] !== 'empty') continue;
        if (Math.random() < theme.obstacleChance) {
          grid[r][c] = _pick(theme.obstacleTypes);
        }
      }
    }

    for (let r = innerStart; r < innerEndR; r++) {
      for (let c = innerStart; c < innerEndC; c++) {
        if (spawnCells.has(`${r},${c}`) || grid[r][c] !== 'empty') continue;
        if (Math.random() < 0.15) {
          grid[r][c] = _weightedPick(theme.terrainWeights);
        }
      }
    }

    for (const [r, c] of [...spawnZones.player, ...spawnZones.enemy]) {
      const terrain = C().TERRAIN_TYPES[grid[r][c]];
      if (!terrain || !terrain.passable) grid[r][c] = 'empty';
    }

    _ensureConnectivity(grid, width, height);

    return {
      grid,
      width,
      height,
      spawnZones,
      themeId,
      themeName: theme.name,
      themeIcon: theme.icon
    };
  }

  function placeUnitsInZone(unitIds, zone, unitData, grid) {
    const placements = [];
    const occupied = new Set();
    const shuffled = [...zone].sort(() => Math.random() - 0.5);

    for (const unitId of unitIds) {
      const data = unitData[unitId];
      const size = data?.size || '1x1';
      const footprint = C().UNIT_SIZES[size] || { w: 1, h: 1 };
      let placed = false;

      for (const [r, c] of shuffled) {
        let fits = true;

        for (let dr = 0; dr < footprint.h && fits; dr++) {
          for (let dc = 0; dc < footprint.w && fits; dc++) {
            const rr = r + dr;
            const cc = c + dc;
            const key = `${rr},${cc}`;

            if (occupied.has(key)) fits = false;
            if (rr >= grid.length || cc >= grid[0].length) fits = false;

            if (fits) {
              const terrain = C().TERRAIN_TYPES[grid[rr]?.[cc]];
              if (terrain && !terrain.passable) fits = false;
            }
          }
        }

        if (!fits) continue;

        for (let dr = 0; dr < footprint.h; dr++) {
          for (let dc = 0; dc < footprint.w; dc++) {
            occupied.add(`${r + dr},${c + dc}`);
          }
        }

        placements.push({ id: unitId, pos: [r, c], size });
        placed = true;
        break;
      }

      if (!placed) {
        console.warn(`MapGenerator: Could not place unit ${unitId} in spawn zone`);
      }
    }

    return placements;
  }

  return Object.freeze({
    generate,
    placeUnitsInZone,
    getThemes: () => ({ ...THEMES }),
    getThemeList: () => Object.entries(THEMES).map(([id, theme]) => ({
      id,
      name: theme.name,
      icon: theme.icon,
      desc: theme.desc,
      sizes: theme.sizes
    }))
  });
})();
