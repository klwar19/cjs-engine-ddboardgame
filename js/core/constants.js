// constants.js
// All enums, rank tables, element lists, stat names, terrain types.
// Pure data — no logic, no imports, no side effects.
// Read by: every other module. Edit here to add new elements, ranks, etc.
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.CONST = (() => {
  'use strict';

  // ── SPECIAL STATS ──────────────────────────────────────────────────
  const STATS = ['S', 'P', 'E', 'C', 'I', 'A', 'L'];

  const STAT_NAMES = {
    S: 'Strength',
    P: 'Perception',
    E: 'Endurance',
    C: 'Charisma',
    I: 'Intelligence',
    A: 'Agility',
    L: 'Luck'
  };

  // ── RANKS ──────────────────────────────────────────────────────────
  const RANKS = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SR', 'SSR'];

  const RANK_DATA = {
    F:   { statMin: 3,  statMax: 8,  totalSpecial: 35,  hpBonus: 20,  mpBonus: 20  },
    E:   { statMin: 6,  statMax: 12, totalSpecial: 55,  hpBonus: 40,  mpBonus: 40  },
    D:   { statMin: 9,  statMax: 16, totalSpecial: 80,  hpBonus: 70,  mpBonus: 70  },
    C:   { statMin: 12, statMax: 22, totalSpecial: 110, hpBonus: 110, mpBonus: 110 },
    B:   { statMin: 16, statMax: 30, totalSpecial: 150, hpBonus: 160, mpBonus: 160 },
    A:   { statMin: 22, statMax: 40, totalSpecial: 200, hpBonus: 220, mpBonus: 220 },
    S:   { statMin: 30, statMax: 55, totalSpecial: 270, hpBonus: 300, mpBonus: 300 },
    SR:  { statMin: 40, statMax: 75, totalSpecial: 360, hpBonus: 400, mpBonus: 400 },
    SSR: { statMin: 55, statMax: 99, totalSpecial: 480, hpBonus: 520, mpBonus: 520 }
  };

  // QTE difficulty distribution by area rank
  const QTE_DIFFICULTY_BY_RANK = {
    tutorial: { EASY: 1.0, MEDIUM: 0,   HARD: 0,   INSANE: 0   },
    F:        { EASY: 0.7, MEDIUM: 0.3, HARD: 0,   INSANE: 0   },
    E:        { EASY: 0.3, MEDIUM: 0.5, HARD: 0.2, INSANE: 0   },
    D:        { EASY: 0.1, MEDIUM: 0.4, HARD: 0.4, INSANE: 0.1 },
    C:        { EASY: 0,   MEDIUM: 0.2, HARD: 0.5, INSANE: 0.3 },
    B:        { EASY: 0,   MEDIUM: 0.1, HARD: 0.5, INSANE: 0.4 },
    A:        { EASY: 0,   MEDIUM: 0,   HARD: 0.4, INSANE: 0.6 },
    S:        { EASY: 0,   MEDIUM: 0,   HARD: 0.3, INSANE: 0.7 },
    SR:       { EASY: 0,   MEDIUM: 0,   HARD: 0.2, INSANE: 0.8 },
    SSR:      { EASY: 0,   MEDIUM: 0,   HARD: 0.1, INSANE: 0.9 }
  };

  // ── ELEMENTS ───────────────────────────────────────────────────────
  const ELEMENTS = [
    'Physical', 'Fire', 'Water', 'Lightning', 'Earth',
    'Wind', 'Nature', 'Light', 'Dark', 'Chaos'
  ];

  const ELEMENT_COLORS = {
    Physical:  '#9ca3af',
    Fire:      '#ef4444',
    Water:     '#3b82f6',
    Lightning: '#eab308',
    Earth:     '#a16207',
    Wind:      '#6ee7b7',
    Nature:    '#22c55e',
    Light:     '#fbbf24',
    Dark:      '#7c3aed',
    Chaos:     '#ec4899'
  };

  // ── DAMAGE TYPES ───────────────────────────────────────────────────
  const DAMAGE_TYPES = ['Physical', 'Magic', 'Chaos', 'True'];

  // ── UNIT TYPES ─────────────────────────────────────────────────────
  const UNIT_TYPES = [
    'humanoid', 'beast', 'undead', 'demon', 'dragon',
    'elemental', 'construct', 'plant', 'insect', 'spirit',
    'fae', 'angel', 'slime', 'aquatic'
  ];

  // ── EQUIPMENT SLOTS ────────────────────────────────────────────────
  const EQUIPMENT_SLOTS = [
    'weapon', 'offhand', 'head', 'body', 'legs',
    'feet', 'accessory1', 'accessory2'
  ];

  // ── RARITY ─────────────────────────────────────────────────────────
  const RARITIES = ['Junk', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

  const RARITY_COLORS = {
    Junk:      '#6b7280',
    Common:    '#9ca3af',
    Uncommon:  '#22c55e',
    Rare:      '#3b82f6',
    Epic:      '#a855f7',
    Legendary: '#f59e0b'
  };

  // ── TERRAIN ────────────────────────────────────────────────────────
  // moveCost: how many movement points to enter (1 = normal, 2 = difficult, 999 = impassable)
  // blocksLoS: whether this terrain blocks line of sight for ranged attacks
  const TERRAIN_TYPES = {
    empty:      { passable: true,  moveCost: 1, blocksLoS: false, effect: null,                     icon: '',  color: '#1a1a2e' },
    obstacle:   { passable: false, moveCost: 999, blocksLoS: true,  effect: null,                     icon: '🪨', color: '#374151' },
    fire_zone:  { passable: true,  moveCost: 1, blocksLoS: false, effect: 'terrain_burn',           icon: '🔥', color: '#7f1d1d' },
    ice_zone:   { passable: true,  moveCost: 2, blocksLoS: false, effect: 'terrain_slow',           icon: '🧊', color: '#1e3a5f' },
    poison_zone:{ passable: true,  moveCost: 1, blocksLoS: false, effect: 'terrain_poison',         icon: '☠️', color: '#14532d' },
    heal_zone:  { passable: true,  moveCost: 1, blocksLoS: false, effect: 'terrain_heal',           icon: '💚', color: '#064e3b' },
    high_ground:{ passable: true,  moveCost: 2, blocksLoS: false, effect: 'terrain_high_ground',    icon: '⬆️', color: '#4a3728' },
    water:      { passable: true,  moveCost: 2, blocksLoS: false, effect: 'terrain_water',          icon: '🌊', color: '#1e40af' },
    lava:       { passable: true,  moveCost: 2, blocksLoS: false, effect: 'terrain_lava',           icon: '🌋', color: '#9a3412' },
    mud:        { passable: true,  moveCost: 3, blocksLoS: false, effect: 'terrain_mud',            icon: '🟤', color: '#78350f' },
    thorns:     { passable: true,  moveCost: 2, blocksLoS: false, effect: 'terrain_thorns',         icon: '🌿', color: '#365314' },
    electric:   { passable: true,  moveCost: 1, blocksLoS: false, effect: 'terrain_shock',          icon: '⚡', color: '#854d0e' },
    holy:       { passable: true,  moveCost: 1, blocksLoS: false, effect: 'terrain_holy',           icon: '✨', color: '#fef3c7' },
    dark:       { passable: true,  moveCost: 1, blocksLoS: false, effect: 'terrain_dark',           icon: '🌑', color: '#1e1b4b' },
    wind:       { passable: true,  moveCost: 1, blocksLoS: false, effect: 'terrain_wind_push',      icon: '💨', color: '#ecfdf5' },
    wall:       { passable: false, moveCost: 999, blocksLoS: true,  effect: null,                     icon: '🧱', color: '#44403c' },
    pillar:     { passable: false, moveCost: 999, blocksLoS: true,  effect: null,                     icon: '🏛️', color: '#57534e' },
    tree:       { passable: false, moveCost: 999, blocksLoS: true,  effect: null,                     icon: '🌲', color: '#14532d' },
    rubble:     { passable: true,  moveCost: 3, blocksLoS: false, effect: null,                     icon: '🪨', color: '#57534e' }
  };

  // ── UNIT SIZES ──────────────────────────────────────────────────────
  // Units occupy a rectangular footprint on the grid.
  // Position (pos) is always the top-left corner of the footprint.
  // w = columns, h = rows the unit occupies.
  const UNIT_SIZES = {
    '1x1': { w: 1, h: 1, label: 'Small (1×1)' },
    '2x1': { w: 2, h: 1, label: 'Wide (2×1)' },
    '1x2': { w: 1, h: 2, label: 'Tall (1×2)' },
    '2x2': { w: 2, h: 2, label: 'Large (2×2)' },
    '3x3': { w: 3, h: 3, label: 'Huge (3×3)' }
  };

  // ── MOVEMENT RULES ──────────────────────────────────────────────────
  // Movement is a FLAT number per unit. Not derived from stats.
  // Only modifiable by passives, items, effects, skills, statuses.
  const MOVEMENT_DEFAULTS = {
    humanoid: 3,     // default for player characters
    beast:    3,
    undead:   2,
    demon:    3,
    dragon:   2,     // big, compensated by range/AoE
    elemental:3,
    construct:2,
    plant:    1,
    insect:   4,
    spirit:   4,     // floaty, fast
    fae:      3,
    angel:    3,
    slime:    2,
    aquatic:  2
  };

  // ── COLLISION RULES (knockback / push) ─────────────────────────────
  // When a unit is knocked back into something, what happens?
  const COLLISION = {
    // Knocked into obstacle/wall/off-grid:
    // → Stop at last valid cell, take collision damage
    wallDamageFlat:    5,       // flat damage for hitting a wall/obstacle
    wallDamagePercent: 0,       // % of knockback source damage

    // Knocked into another unit:
    // → Both units take collision damage, knockback stops
    unitCollisionDamageFlat:    3,
    unitCollisionDamagePercent: 0,
    // The "blocker" unit also takes damage and is pushed 0 cells (stands firm)
    // If blocker is smaller size than the pushed unit → blocker is ALSO pushed 1 cell
    sizeMatters: true,          // larger units push smaller ones on collision

    // Knockback distance reduced by:
    // - Target END/5 (rounded down) → "heavy" units resist knockback
    knockbackResistPerEnd: 5    // every X points of END reduces knockback by 1
  };

  // ── LINE OF SIGHT RULES ────────────────────────────────────────────
  const LINE_OF_SIGHT = {
    // What blocks LoS for ranged attacks:
    obstaclesBlock: true,       // terrain with blocksLoS: true
    unitsBlock:     false,      // other units do NOT block LoS by default
    // (can be overridden per-unit: large/boss units may block LoS)
    largeUnitsBlock: true,      // 2x2+ units block LoS
    highGroundIgnoresBlock: true // attacker on high ground ignores LoS blockers 1 cell away
  };

  // ── EFFECT SYSTEM ENUMS ────────────────────────────────────────────

  const EFFECT_TRIGGERS = {
    // Passive (always active)
    passive: [
      'stat_mod', 'dr_mod', 'element_mod', 'crit_mod', 'evasion_mod',
      'accuracy_mod', 'ap_mod', 'movement_mod', 'range_mod', 'cost_mod',
      'cooldown_mod', 'damage_mod', 'hp_mod', 'mp_mod',
      'status_resist_mod', 'double_action', 'triple_action'
    ],
    // Event-triggered
    event: [
      'on_hit', 'on_take_damage', 'on_kill', 'on_death',
      'on_turn_start', 'on_turn_end', 'on_battle_start', 'on_battle_end',
      'on_low_hp', 'on_dodge', 'on_move', 'on_status_applied',
      'on_ally_hit', 'on_crit', 'on_status_tick', 'on_miss',
      'on_heal_received', 'on_buff_received', 'on_debuff_received',
      'on_skill_use', 'on_item_use', 'on_counter',
      'on_hp_threshold'  // generic: fires at configurable HP %
    ]
  };

  const EFFECT_ACTIONS = [
    // Damage / Heal
    'damage', 'heal', 'mp_restore', 'mp_drain', 'hp_drain',
    // Status
    'status_apply', 'status_remove', 'status_resist',
    'dispel_buffs', 'dispel_debuffs', 'purge_all',
    // Defensive
    'reflect', 'absorb', 'counter', 'revive', 'damage_block',
    'spell_immunity', 'link_share_damage',
    // Positional
    'knockback', 'pull', 'teleport', 'swap_position', 'phase_movement',
    // Terrain
    'terrain_create', 'terrain_remove',
    // Summon
    'summon', 'summon_persistent', 'clone',
    // Utility
    'steal_buff', 'steal_debuff', 'transform', 'cooldown_reset',
    'ap_grant', 'mp_burn', 'silence_apply',
    'taunt_apply', 'fear_apply', 'charm_apply',
    'break_passives', 'mute_items',
    // Special
    'execute',           // instant kill below HP threshold
    'sacrifice',         // consume allied unit for effect
    'resurrect_as_ally', // raise dead enemy as ally
    'copy_skill',        // use target's last skill
    'randomize_target',  // confuse: random target selection
    'extra_action',      // grant another main action this turn
    'delay_damage',      // damage applies X turns later (doom-style)
    'store_damage',      // absorb damage, release later
    'aura_toggle'        // toggle an aura on/off
  ];

  const EFFECT_TARGETS = [
    // Single
    'self', 'target', 'attacker', 'host',
    // Group
    'all_allies', 'all_enemies', 'all',
    // Smart
    'random_enemy', 'random_ally',
    'lowest_hp_ally', 'lowest_hp_enemy',
    'highest_hp_ally', 'highest_hp_enemy',
    'adjacent_to_self', 'adjacent_to_target',
    'furthest_enemy', 'nearest_enemy',
    // AoE (parametric — size defined in effect)
    'aoe_radius', 'aoe_line', 'aoe_cone', 'aoe_cross',
    'same_row', 'same_column',
    // Special
    'last_attacker', 'random_any', 'all_summoned',
    'all_with_status'   // targets all units that have a specific status
  ];

  const VALUE_SOURCES = [
    'flat', 'percent',
    'max_hp', 'current_hp', 'missing_hp',
    'max_mp', 'current_mp', 'missing_mp',
    'caster_S', 'caster_P', 'caster_E', 'caster_C',
    'caster_I', 'caster_A', 'caster_L',
    'target_max_hp', 'target_current_hp', 'target_missing_hp',
    'target_max_mp',
    'target_S', 'target_P', 'target_E', 'target_C',
    'target_I', 'target_A', 'target_L',
    'damage_dealt', 'damage_received', 'overkill',
    'stack_count', 'turn_number', 'units_alive_ally', 'units_alive_enemy'
    // Also: "dice:XdY", "dice:XdY+Z", "stored:varname" — parsed dynamically
  ];

  // ── STATUS CATEGORIES (for UI grouping) ────────────────────────────
  const STATUS_CATEGORIES = {
    dot:      { name: 'Damage Over Time', color: '#ef4444' },
    control:  { name: 'Control / Disable', color: '#f97316' },
    movement: { name: 'Movement Debuff', color: '#a16207' },
    statdown: { name: 'Stat Debuff', color: '#dc2626' },
    buff:     { name: 'Buff', color: '#22c55e' },
    exotic:   { name: 'Exotic / Unique', color: '#a855f7' }
  };

  // ── AI BEHAVIOR ARCHETYPES ─────────────────────────────────────────
  const AI_ARCHETYPES = [
    'aggressive', 'defensive', 'sniper', 'berserker',
    'support', 'tactical', 'coward', 'boss'
  ];

  const AI_TARGET_TYPES = [
    'nearest_enemy', 'lowest_hp_enemy', 'highest_hp_enemy',
    'lowest_hp_adjacent', 'most_clustered', 'random_enemy',
    'lowest_hp_ally', 'squishiest', 'most_threatening',
    'furthest_enemy', 'lowest_dr_enemy', 'highest_damage_enemy'
  ];

  // ── QTE TYPES ──────────────────────────────────────────────────────
  const QTE_TYPES = ['fishing', 'rhythm', 'quickpress', 'mash', 'quiz', 'none'];

  const QTE_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD', 'INSANE'];

  const QTE_MULTIPLIERS = {
    perfect: 1.5,
    good:    1.25,
    ok:      1.0,
    fail:    0.75
  };

  // ── GRID DEFAULTS ──────────────────────────────────────────────────
  const GRID_DEFAULTS = {
    width: 8,
    height: 8,
    maxWidth: 16,
    maxHeight: 16,
    cellSizePx: 56
  };

  // ── ACTION ECONOMY ─────────────────────────────────────────────────
  const ACTION_ECONOMY = {
    baseAP: 2,
    defendAPBonus: 1,        // AP gained next turn from defending
    defendDRBonus: 5,        // flat DR boost during defend round
    movesPerTurn: 1,         // free moves allowed per turn
    mainActionsPerTurn: 1    // main actions per turn (can be increased by effects)
  };

  // ── ELEMENTAL INTERACTION TABLE ────────────────────────────────────
  // Key = attacking element, value = { weakAgainst: [], strongAgainst: [] }
  const ELEMENT_CHART = {
    Physical:  { weakAgainst: [],            strongAgainst: [] },
    Fire:      { weakAgainst: ['Water'],     strongAgainst: ['Nature', 'Wind'] },
    Water:     { weakAgainst: ['Lightning'], strongAgainst: ['Fire', 'Earth'] },
    Lightning: { weakAgainst: ['Earth'],     strongAgainst: ['Water', 'Wind'] },
    Earth:     { weakAgainst: ['Nature'],    strongAgainst: ['Lightning', 'Fire'] },
    Wind:      { weakAgainst: ['Fire'],      strongAgainst: ['Earth', 'Nature'] },
    Nature:    { weakAgainst: ['Fire'],      strongAgainst: ['Water', 'Earth'] },
    Light:     { weakAgainst: ['Dark'],      strongAgainst: ['Dark'] },    // mutual
    Dark:      { weakAgainst: ['Light'],     strongAgainst: ['Light'] },   // mutual
    Chaos:     { weakAgainst: [],            strongAgainst: [] }           // neutral to all
  };

  const ELEMENT_MULTIPLIERS = {
    weak:   1.5,
    resist: 0.5,
    immune: 0,
    normal: 1.0
  };

  // ── ID PREFIXES ────────────────────────────────────────────────────
  const ID_PREFIXES = {
    effect:    'eff',
    skill:     'skl',
    item:      'itm',
    character: 'chr',
    monster:   'mon',
    encounter: 'enc',
    passive:   'pas',
    status:    'sts',
    quip:      'qip'
  };

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    STATS, STAT_NAMES, RANKS, RANK_DATA,
    QTE_DIFFICULTY_BY_RANK,
    ELEMENTS, ELEMENT_COLORS, ELEMENT_CHART, ELEMENT_MULTIPLIERS,
    DAMAGE_TYPES, UNIT_TYPES, EQUIPMENT_SLOTS,
    RARITIES, RARITY_COLORS,
    TERRAIN_TYPES, UNIT_SIZES, MOVEMENT_DEFAULTS, COLLISION, LINE_OF_SIGHT,
    EFFECT_TRIGGERS, EFFECT_ACTIONS, EFFECT_TARGETS, VALUE_SOURCES,
    STATUS_CATEGORIES,
    AI_ARCHETYPES, AI_TARGET_TYPES,
    QTE_TYPES, QTE_DIFFICULTIES, QTE_MULTIPLIERS,
    GRID_DEFAULTS, ACTION_ECONOMY,
    ID_PREFIXES
  });
})();
