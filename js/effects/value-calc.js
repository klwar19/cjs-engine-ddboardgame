// value-calc.js
// Resolves effect value expressions.
// Given a value + source + combat context, returns the final number.
// Pure function — no state.
// Reads: dice.js
// Used by: effect-resolver.js, damage-calc.js, stat-compiler.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.ValueCalc = (() => {
  'use strict';

  const Dice = () => window.CJS.Dice;

  // ── MAIN RESOLVER ──────────────────────────────────────────────────
  // context = {
  //   caster:         unit object (the one using the effect)
  //   target:         unit object (the one being affected)
  //   damageDealt:    number (result of the attack that triggered this)
  //   damageReceived: number (damage received that triggered this)
  //   overkill:       number (excess damage beyond lethal)
  //   storedResults:  { varName: number } (from sibling child effects)
  //   stackCount:     number (current stacks of this status)
  //   turnNumber:     number (current combat turn)
  //   unitsAliveAlly: number
  //   unitsAliveEnemy:number
  // }

  function resolve(value, source, context) {
    if (value === null || value === undefined) return 0;
    if (source === null || source === undefined) source = 'flat';

    const ctx = context || {};
    const caster = ctx.caster || {};
    const target = ctx.target || {};
    const casterStats = caster.compiledStats || caster.stats || {};
    const targetStats = target.compiledStats || target.stats || {};

    // ── Dynamic source strings ───────────────────────────────────
    // "dice:2d6" or "dice:1d4+2"
    if (typeof source === 'string' && source.startsWith('dice:')) {
      const diceStr = source.substring(5);
      const result = Dice().roll(diceStr);
      return result.total;
    }

    // "stored:variable_name"
    if (typeof source === 'string' && source.startsWith('stored:')) {
      const varName = source.substring(7);
      return (ctx.storedResults && ctx.storedResults[varName]) || 0;
    }

    // ── Static source lookup ─────────────────────────────────────
    switch (source) {
      // Simple
      case 'flat':
        return value;

      case 'percent':
        return value; // caller interprets as percentage

      // Caster HP/MP
      case 'max_hp':
        return Math.floor((caster.maxHP || 0) * value / 100);

      case 'current_hp':
        return Math.floor((caster.currentHP || 0) * value / 100);

      case 'missing_hp':
        return Math.floor(((caster.maxHP || 0) - (caster.currentHP || 0)) * value / 100);

      case 'max_mp':
        return Math.floor((caster.maxMP || 0) * value / 100);

      case 'current_mp':
        return Math.floor((caster.currentMP || 0) * value / 100);

      case 'missing_mp':
        return Math.floor(((caster.maxMP || 0) - (caster.currentMP || 0)) * value / 100);

      // Caster stats
      case 'caster_S': return Math.floor(value * (casterStats.S || 0));
      case 'caster_P': return Math.floor(value * (casterStats.P || 0));
      case 'caster_E': return Math.floor(value * (casterStats.E || 0));
      case 'caster_C': return Math.floor(value * (casterStats.C || 0));
      case 'caster_I': return Math.floor(value * (casterStats.I || 0));
      case 'caster_A': return Math.floor(value * (casterStats.A || 0));
      case 'caster_L': return Math.floor(value * (casterStats.L || 0));

      // Target HP/MP
      case 'target_max_hp':
        return Math.floor((target.maxHP || 0) * value / 100);

      case 'target_current_hp':
        return Math.floor((target.currentHP || 0) * value / 100);

      case 'target_missing_hp':
        return Math.floor(((target.maxHP || 0) - (target.currentHP || 0)) * value / 100);

      case 'target_max_mp':
        return Math.floor((target.maxMP || 0) * value / 100);

      // Target stats
      case 'target_S': return Math.floor(value * (targetStats.S || 0));
      case 'target_P': return Math.floor(value * (targetStats.P || 0));
      case 'target_E': return Math.floor(value * (targetStats.E || 0));
      case 'target_C': return Math.floor(value * (targetStats.C || 0));
      case 'target_I': return Math.floor(value * (targetStats.I || 0));
      case 'target_A': return Math.floor(value * (targetStats.A || 0));
      case 'target_L': return Math.floor(value * (targetStats.L || 0));

      // Combat context
      case 'damage_dealt':
        return Math.floor((ctx.damageDealt || 0) * value / 100);

      case 'damage_received':
        return Math.floor((ctx.damageReceived || 0) * value / 100);

      case 'overkill':
        return ctx.overkill || 0;

      // Dynamic counters
      case 'stack_count':
        return value * (ctx.stackCount || 1);

      case 'turn_number':
        return value * (ctx.turnNumber || 1);

      case 'units_alive_ally':
        return value * (ctx.unitsAliveAlly || 1);

      case 'units_alive_enemy':
        return value * (ctx.unitsAliveEnemy || 1);

      default:
        console.warn(`ValueCalc: unknown source "${source}", treating as flat`);
        return value;
    }
  }

  // ── PREVIEW (for editor — shows human-readable description) ────────
  function describeValue(value, source) {
    if (!source || source === 'flat') return `${value}`;
    if (source === 'percent') return `${value}%`;

    if (source.startsWith('dice:')) return source.substring(5);
    if (source.startsWith('stored:')) return `(stored: ${source.substring(7)})`;

    const descriptions = {
      max_hp:           `${value}% of max HP`,
      current_hp:       `${value}% of current HP`,
      missing_hp:       `${value}% of missing HP`,
      max_mp:           `${value}% of max MP`,
      current_mp:       `${value}% of current MP`,
      missing_mp:       `${value}% of missing MP`,
      caster_S:         `${value} × STR`,
      caster_P:         `${value} × PER`,
      caster_E:         `${value} × END`,
      caster_C:         `${value} × CHA`,
      caster_I:         `${value} × INT`,
      caster_A:         `${value} × AGI`,
      caster_L:         `${value} × LCK`,
      target_max_hp:    `${value}% of target's max HP`,
      target_current_hp:`${value}% of target's current HP`,
      target_missing_hp:`${value}% of target's missing HP`,
      target_max_mp:    `${value}% of target's max MP`,
      target_S:         `${value} × target's STR`,
      target_P:         `${value} × target's PER`,
      target_E:         `${value} × target's END`,
      target_C:         `${value} × target's CHA`,
      target_I:         `${value} × target's INT`,
      target_A:         `${value} × target's AGI`,
      target_L:         `${value} × target's LCK`,
      damage_dealt:     `${value}% of damage dealt`,
      damage_received:  `${value}% of damage received`,
      overkill:         `overkill damage`,
      stack_count:      `${value} × stacks`,
      turn_number:      `${value} × turn number`,
      units_alive_ally: `${value} × allies alive`,
      units_alive_enemy:`${value} × enemies alive`
    };

    return descriptions[source] || `${value} (${source})`;
  }

  // ── ESTIMATE (for preview — uses average dice, assumed stats) ──────
  function estimate(value, source, assumedStats) {
    if (!source || source === 'flat') return value;
    if (source === 'percent') return value;

    if (source.startsWith('dice:')) {
      return Dice().average(source.substring(5));
    }

    const stats = assumedStats || { S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 };

    if (source.startsWith('caster_')) {
      const stat = source.split('_')[1];
      return value * (stats[stat] || 5);
    }

    return value; // fallback
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    resolve,
    describeValue,
    estimate
  });
})();
