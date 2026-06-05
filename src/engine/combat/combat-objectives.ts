// combat-objectives.ts — Tier 3 TS port of js/combat/combat-objectives.js
// (engine cluster: combat). Pluggable battle objective types replacing the
// implicit "kill all enemies" win condition. Each objective declares setup
// (build), evaluate (after turn-end), describe (UI), highlight cells, and
// survival reinforcements. Kinds: kill_all, escort, capture_point, survival,
// assassination.
//
// Reads: combat-manager state shape, grid-engine positions.
// Used by: combat-manager._checkBattleEnd, combat-ui (banner).
//
// Exports `CombatObjectives` and installs window.CJS.CombatObjectives (rides the
// CJSNamespace index signature). Bodies verbatim.

const KINDS = ['kill_all', 'escort', 'capture_point', 'survival', 'assassination'];

function _readObjective(encounter) {
  if (!encounter) return null;
  const raw = encounter.objective || encounter.combatObjective || null;
  if (!raw) return null;
  const kind = String(raw.kind || raw.type || 'kill_all').toLowerCase();
  if (!KINDS.includes(kind)) return null;
  return { ...raw, kind };
}

// Build the live objective tracker. Returns null if no special objective is
// configured (callers fall back to the legacy kill_all check).
function build(encounter) {
  const def = _readObjective(encounter);
  if (!def || def.kind === 'kill_all') return null;

  const tracker = {
    kind: def.kind,
    def,
    // Common state
    startedAtRound: 1,
    lastTickedRound: 0,
    // Escort
    vipId: def.vipId || def.escortId || null,
    // Optional cell the VIP must reach (escort to safety)
    goalCell: _normalizeCell(def.goalCell),
    escortTurns: Number(def.protectRounds || def.turns || 0) || 0,
    // Capture point
    captureCells: _normalizeCellList(def.captureCells || def.zoneCells),
    captureRounds: Number(def.holdRounds || def.captureRounds || 3) || 3,
    captureProgress: 0,
    captureBroken: false,
    // Survival
    surviveRounds: Number(def.surviveRounds || def.rounds || 5) || 5,
    reinforcementRound: Number(def.reinforcementRound || 0) || 0,
    reinforcementsFired: false,
    // Assassination
    targetId: def.targetId || null,
    targetKilled: false,
    escapeCells: _normalizeCellList(def.escapeCells)
  };
  return tracker;
}

function _normalizeCell(value) {
  if (!value) return null;
  if (Array.isArray(value) && value.length >= 2) {
    return [Number(value[0]), Number(value[1])];
  }
  if (typeof value === 'object' && (value.r != null || value.c != null || value.row != null || value.col != null)) {
    const r = Number(value.r ?? value.row ?? 0);
    const c = Number(value.c ?? value.col ?? 0);
    return [r, c];
  }
  return null;
}

function _normalizeCellList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(_normalizeCell).filter(Boolean);
}

function _cellKey(cell) {
  return cell ? `${cell[0]},${cell[1]}` : '';
}

// Called by combat-manager after each turn-end (BEFORE _checkBattleEnd's default
// logic). Returns { winner, reason } if the battle should end now, or null.
function evaluate(tracker, combatState) {
  if (!tracker || !combatState) return null;
  const units: any[] = Object.values(combatState.units || {});
  const playersAlive = units.some((u) => u.team === 'player' && (u.currentHP || 0) > 0);
  const enemiesAlive = units.some((u) => u.team === 'enemy'  && (u.currentHP || 0) > 0);

  // Mutual wipe always ends as a draw (legacy behavior).
  if (!playersAlive && !enemiesAlive) return { winner: 'draw', reason: 'mutual_kill' };
  // No matter the objective, if the entire party is down, the run ends.
  if (!playersAlive) return { winner: 'enemy', reason: 'all_players_defeated' };

  switch (tracker.kind) {
    case 'escort':       return _evalEscort(tracker, combatState, { enemiesAlive });
    case 'capture_point':return _evalCapture(tracker, combatState, { enemiesAlive });
    case 'survival':     return _evalSurvival(tracker, combatState);
    case 'assassination':return _evalAssassination(tracker, combatState, { enemiesAlive });
    default: return null;
  }
}

function _evalEscort(tracker, state, ctx) {
  const vip = _findUnit(state, tracker.vipId);
  // VIP dies → defeat regardless of enemies remaining.
  if (!vip || (vip.currentHP || 0) <= 0) {
    return { winner: 'enemy', reason: 'escort_vip_lost' };
  }
  // Reached goal cell?
  if (tracker.goalCell && vip.pos) {
    const [gr, gc] = tracker.goalCell;
    if (vip.pos[0] === gr && vip.pos[1] === gc) {
      return { winner: 'player', reason: 'escort_goal_reached' };
    }
  }
  // Survived N rounds?
  if (tracker.escortTurns > 0) {
    const roundsElapsed = (state.roundNumber || 1) - tracker.startedAtRound + 1;
    if (roundsElapsed > tracker.escortTurns) {
      return { winner: 'player', reason: 'escort_endured' };
    }
  }
  // Implicit win: if no enemies left, escort succeeds.
  if (!ctx.enemiesAlive) return { winner: 'player', reason: 'escort_cleared' };
  return null;
}

function _evalCapture(tracker, state, ctx) {
  if (!tracker.captureCells.length) return null;
  const playerOn = _playerOnAnyCell(state, tracker.captureCells);
  const enemyOn  = _enemyOnAnyCell(state, tracker.captureCells);
  if (playerOn && !enemyOn) {
    tracker.captureProgress = Math.min(tracker.captureRounds, (tracker.captureProgress || 0) + 1);
    tracker.captureBroken = false;
  } else if (enemyOn) {
    // Enemy contesting resets progress (held by force).
    tracker.captureProgress = 0;
    tracker.captureBroken = true;
  }
  if (tracker.captureProgress >= tracker.captureRounds) {
    return { winner: 'player', reason: 'point_captured' };
  }
  return null;
}

function _evalSurvival(tracker, state) {
  const roundsElapsed = (state.roundNumber || 1) - tracker.startedAtRound + 1;
  if (roundsElapsed >= tracker.surviveRounds) {
    return { winner: 'player', reason: 'survived' };
  }
  return null;
}

function _evalAssassination(tracker, state, ctx) {
  const target = _findUnit(state, tracker.targetId);
  if (target && (target.currentHP || 0) <= 0) {
    tracker.targetKilled = true;
  }
  if (!tracker.targetKilled) {
    // Target alive but reachable cells: keep playing.
    return null;
  }
  // After kill: escape requirement.
  if (tracker.escapeCells.length) {
    const survivors = (Object.values(state.units || {}) as any[])
      .filter((u) => u.team === 'player' && (u.currentHP || 0) > 0);
    const escaped = survivors.some((u) => u.pos && tracker.escapeCells.some(([r, c]) => u.pos[0] === r && u.pos[1] === c));
    if (escaped) return { winner: 'player', reason: 'assassinated_and_escaped' };
    return null; // keep playing until they reach escape OR die
  }
  // No escape requirement → instant win.
  return { winner: 'player', reason: 'assassinated' };
}

function _findUnit(state, id) {
  if (!id || !state.units) return null;
  return state.units[id] || Object.values(state.units).find((u: any) => u.baseId === id || u.instanceId === id) || null;
}

function _playerOnAnyCell(state, cells) {
  const keys = new Set(cells.map(_cellKey));
  for (const u of Object.values(state.units || {}) as any[]) {
    if (u.team !== 'player' || (u.currentHP || 0) <= 0 || !u.pos) continue;
    if (keys.has(_cellKey(u.pos))) return true;
  }
  return false;
}

function _enemyOnAnyCell(state, cells) {
  const keys = new Set(cells.map(_cellKey));
  for (const u of Object.values(state.units || {}) as any[]) {
    if (u.team !== 'enemy' || (u.currentHP || 0) <= 0 || !u.pos) continue;
    if (keys.has(_cellKey(u.pos))) return true;
  }
  return false;
}

// UI label/progress summary. UI calls this each refresh.
function describe(tracker, combatState) {
  if (!tracker) {
    return { title: 'Defeat all enemies', detail: '', progressPct: 0, icon: '⚔', kind: 'kill_all' };
  }
  switch (tracker.kind) {
    case 'escort': return _describeEscort(tracker, combatState);
    case 'capture_point': return _describeCapture(tracker, combatState);
    case 'survival': return _describeSurvival(tracker, combatState);
    case 'assassination': return _describeAssassination(tracker, combatState);
    default: return { title: '', detail: '', progressPct: 0, icon: '⚔', kind: tracker.kind };
  }
}

function _describeEscort(tracker, state) {
  const vip = _findUnit(state, tracker.vipId);
  const vipName = vip?.name || vip?.baseId || tracker.vipId || 'VIP';
  const detail = [];
  if (tracker.goalCell) detail.push(`Reach [${tracker.goalCell[0]},${tracker.goalCell[1]}]`);
  if (tracker.escortTurns > 0) {
    const elapsed = Math.max(0, (state.roundNumber || 1) - tracker.startedAtRound + 1);
    const left = Math.max(0, tracker.escortTurns - elapsed + 1);
    detail.push(`Survive ${left} more round${left === 1 ? '' : 's'}`);
  }
  const hpPct = vip ? Math.max(0, Math.min(100, Math.round(((vip.currentHP || 0) / (vip.maxHP || 1)) * 100))) : 0;
  return {
    title: `Escort: ${vipName}`,
    detail: detail.join(' · '),
    progressPct: hpPct,
    icon: '🛡',
    kind: 'escort',
    vipHpPct: hpPct,
    vipName
  };
}

function _describeCapture(tracker, state) {
  const pct = tracker.captureRounds ? Math.round((tracker.captureProgress / tracker.captureRounds) * 100) : 0;
  return {
    title: 'Capture the point',
    detail: `${tracker.captureProgress}/${tracker.captureRounds} rounds held${tracker.captureBroken ? ' · contested' : ''}`,
    progressPct: pct,
    icon: '🚩',
    kind: 'capture_point',
    broken: tracker.captureBroken
  };
}

function _describeSurvival(tracker, state) {
  const elapsed = Math.max(0, (state.roundNumber || 1) - tracker.startedAtRound + 1);
  const left = Math.max(0, tracker.surviveRounds - elapsed);
  const pct = Math.round((Math.min(elapsed, tracker.surviveRounds) / tracker.surviveRounds) * 100);
  let reinforcementNote = '';
  if (tracker.reinforcementRound > 0 && !tracker.reinforcementsFired) {
    const rLeft = Math.max(0, tracker.reinforcementRound - (state.roundNumber || 1));
    if (rLeft > 0) reinforcementNote = ` · reinforcements in ${rLeft}`;
  }
  return {
    title: 'Hold out',
    detail: `${left} round${left === 1 ? '' : 's'} remaining${reinforcementNote}`,
    progressPct: pct,
    icon: '⏳',
    kind: 'survival'
  };
}

function _describeAssassination(tracker, state) {
  const target = _findUnit(state, tracker.targetId);
  const name = target?.name || target?.baseId || tracker.targetId || 'Target';
  if (!tracker.targetKilled) {
    const hpPct = target ? Math.round(((target.currentHP || 0) / (target.maxHP || 1)) * 100) : 0;
    return {
      title: `Eliminate: ${name}`,
      detail: target ? `Target ${hpPct}% HP` : 'Locate the target',
      progressPct: 100 - hpPct,
      icon: '🎯',
      kind: 'assassination',
      targetName: name,
      targetHpPct: hpPct
    };
  }
  if (tracker.escapeCells.length) {
    return {
      title: 'Escape',
      detail: `${tracker.escapeCells.length} extraction tile${tracker.escapeCells.length === 1 ? '' : 's'} marked`,
      progressPct: 100,
      icon: '🚪',
      kind: 'assassination',
      targetName: name
    };
  }
  return { title: 'Mission Complete', detail: 'Target eliminated.', progressPct: 100, icon: '🎯', kind: 'assassination' };
}

// Optional: returns cells the renderer should highlight (capture zones, escape
// tiles, escort goal). Used by combat-ui to overlay markers.
function getHighlightCells(tracker) {
  if (!tracker) return [];
  const out = [];
  if (tracker.kind === 'capture_point') {
    for (const c of tracker.captureCells) out.push({ pos: c, kind: 'capture' });
  } else if (tracker.kind === 'escort' && tracker.goalCell) {
    out.push({ pos: tracker.goalCell, kind: 'escort_goal' });
  } else if (tracker.kind === 'assassination' && tracker.targetKilled) {
    for (const c of tracker.escapeCells) out.push({ pos: c, kind: 'escape' });
  }
  return out;
}

// Fire reinforcements when survival mode hits the configured round. Called by
// combat-manager; uses CombatManager.gmAddUnit so they fold into the battle.
function maybeFireReinforcements(tracker, combatState) {
  if (!tracker || tracker.kind !== 'survival' || tracker.reinforcementsFired) return null;
  if (!tracker.reinforcementRound || tracker.reinforcementRound > (combatState.roundNumber || 1)) return null;
  const list = Array.isArray(tracker.def.reinforcements) ? tracker.def.reinforcements : [];
  if (!list.length) {
    tracker.reinforcementsFired = true;
    return null;
  }
  const CM: any = window.CJS.CombatManager;
  if (!CM?.gmAddUnit) return null;
  const fired = [];
  for (const r of list) {
    const id = r.id || r.baseId;
    const pos = _normalizeCell(r.pos) || [0, 0];
    const team = r.team || 'player';
    const result = CM.gmAddUnit(id, pos[0], pos[1], { team, size: r.size });
    if (result?.success) fired.push(result.unit?.instanceId || id);
  }
  tracker.reinforcementsFired = true;
  return { fired };
}

export const CombatObjectives = Object.freeze({
  KINDS,
  build,
  evaluate,
  describe,
  getHighlightCells,
  maybeFireReinforcements
});

// Runtime compatibility install — keep window.CJS.CombatObjectives identical to
// the legacy IIFE so every existing consumer (and the vanilla engine) is unchanged.
window.CJS = window.CJS || ({} as CJSNamespace);
window.CJS.CombatObjectives = CombatObjectives;
