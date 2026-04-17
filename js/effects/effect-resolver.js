// effect-resolver.js
// THE SPINE. Given a trigger event + combat context, this gathers every
// relevant effect from every relevant unit, evaluates conditions, and
// executes each one's action.
//
// Called at every combat phase (turn_start, on_hit, on_kill, ...) by
// combat-manager, action-handler, damage-calc, status-manager.
//
// Reads: data-store, value-calc, conditions, damage-calc, status-manager,
//        grid-engine, combat-log, constants
// Used by: combat-manager, action-handler, status-manager, damage-calc
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.EffectResolver = (() => {
  'use strict';

  const DS   = () => window.CJS.DataStore;
  const VC   = () => window.CJS.ValueCalc;
  const Cond = () => window.CJS.Conditions;
  const DC   = () => window.CJS.DamageCalc;
  const SM   = () => window.CJS.StatusManager;
  const GE   = () => window.CJS.GridEngine;
  const AoE  = () => window.CJS.AoE;
  const Log  = () => window.CJS.CombatLog;
  const C    = () => window.CJS.CONST;

  // ── MAIN ENTRY: FIRE TRIGGER ──────────────────────────────────────
  // Called whenever an event happens. Scans all units for effects with
  // this trigger, evaluates conditions, and executes the ones that match.
  //
  // trigger:   e.g. 'on_hit', 'on_kill', 'on_turn_start'
  // context:   {
  //   unit:       the primary unit in the event (depends on trigger —
  //               for on_hit it's the attacker, for on_take_damage it's the target)
  //   target:     the other party in the event
  //   attacker:   explicit attacker ref (for on_take_damage)
  //   damageDealt, damageReceived, overkill,
  //   element, damageType, isCritical, skillUsed,
  //   turnNumber, allUnits (array), storedResults (mutable)
  // }
  //
  // Returns: array of { effect, result } for logging / chaining.
  function fireTrigger(trigger, context) {
    const results = [];
    const ctx = { ...context, storedResults: context.storedResults || {} };

    // Which units' effects do we scan?
    // For self-triggers (on_turn_start, on_take_damage, on_kill, on_move, on_death),
    //   only the primary unit's effects fire.
    // For broadcast triggers (on_ally_hit), we'd scan all allies (Phase 5 feature).
    const unitsToScan = _unitsFor(trigger, ctx);

    for (const unit of unitsToScan) {
      const effects = unit.effectsByTrigger?.[trigger] || [];
      for (const effect of effects) {
        // Condition gate
        if (!Cond().evaluate(effect.conditions, { ...ctx, unit })) continue;

        const result = executeEffect(effect, { ...ctx, caster: unit, effectOwner: unit });
        results.push({ effect, result });
      }
    }

    return results;
  }

  // ── DETERMINE WHICH UNITS' EFFECTS FIRE ───────────────────────────
  function _unitsFor(trigger, ctx) {
    // Self-triggers: only the unit the event happened TO/FROM.
    // For on_hit: attacker's effects fire (their weapon lifesteal, etc.)
    // For on_take_damage: target's effects fire (reflect, thorns)
    // For on_kill: attacker's effects fire
    // For on_death: the dying unit's effects fire (revive, death explosion)
    const u = ctx.unit;
    if (!u) return [];

    switch (trigger) {
      case 'on_hit':
      case 'on_crit':
      case 'on_kill':
      case 'on_miss':
      case 'on_skill_use':
      case 'on_item_use':
      case 'on_counter':
        return ctx.attacker ? [ctx.attacker] : [u];
      case 'on_take_damage':
      case 'on_death':
      case 'on_dodge':
      case 'on_heal_received':
      case 'on_status_applied':
      case 'on_buff_received':
      case 'on_debuff_received':
      case 'on_low_hp':
      case 'on_hp_threshold':
      case 'on_move':
      case 'on_turn_start':
      case 'on_turn_end':
      case 'on_battle_start':
      case 'on_battle_end':
        return [u];
      case 'on_ally_hit':
        // Scan all allies of the primary unit
        if (!ctx.allUnits) return [];
        return ctx.allUnits.filter(x => x !== u && x.team === u.team && (x.currentHP || 0) > 0);
      default:
        return [u];
    }
  }

  // ── EXECUTE ONE EFFECT ────────────────────────────────────────────
  // Returns: { success, data?, stored? } — data is action-specific.
  function executeEffect(effect, context) {
    if (!effect) return { success: false, reason: 'no_effect' };
    const caster  = context.caster || context.unit;
    const action  = effect.action;

    // Resolve targets (can be multiple — e.g., all_allies, AoE)
    const targets = _resolveTargets(effect, context);

    // Resolve the numeric value
    const value = VC().resolve(effect.value, effect.source,
      { ...context, caster, stackCount: context.stackCount || 1 });

    let data = {};

    switch (action) {
      case 'damage':        data = _actDamage(effect, caster, targets, value, context); break;
      case 'heal':          data = _actHeal(effect, caster, targets, value, context); break;
      case 'mp_restore':    data = _actMPChange(effect, caster, targets, value, +1); break;
      case 'mp_drain':      data = _actMPChange(effect, caster, targets, value, -1); break;
      case 'hp_drain':      data = _actHPDrain(effect, caster, targets, value, context); break;
      case 'status_apply':  data = _actStatusApply(effect, caster, targets, context); break;
      case 'status_remove': data = _actStatusRemove(effect, caster, targets); break;
      case 'dispel_buffs':  data = _actCleanse(effect, caster, targets, { isBuffsOnly: true }); break;
      case 'dispel_debuffs':data = _actCleanse(effect, caster, targets, { isDebuffsOnly: true }); break;
      case 'purge_all':     data = _actCleanse(effect, caster, targets, {}); break;
      case 'reflect':       data = _actReflect(effect, caster, targets, value, context); break;
      case 'absorb':        data = _actAbsorb(effect, caster, targets, value); break;
      case 'counter':       data = _actCounter(effect, caster, targets, context); break;
      case 'damage_block':  data = _actDamageBlock(effect, caster, targets, value); break;
      case 'revive':        data = _actRevive(effect, caster, targets, value); break;
      case 'knockback':     data = _actKnockback(effect, caster, targets, value, context); break;
      case 'pull':          data = _actPull(effect, caster, targets, value, context); break;
      case 'teleport':      data = _actTeleport(effect, caster, targets, context); break;
      case 'swap_position': data = _actSwap(effect, caster, targets); break;
      case 'terrain_create':data = _actTerrainCreate(effect, caster, value, context); break;
      case 'cooldown_reset':data = _actCooldownReset(effect, caster, targets, context); break;
      case 'ap_grant':      data = _actApGrant(effect, caster, targets, value); break;
      case 'execute':       data = _actExecute(effect, caster, targets, context); break;
      case 'extra_action':  data = _actExtraAction(effect, caster, targets); break;
      case 'steal_buff':    data = _actStealBuff(effect, caster, targets); break;
      case 'taunt_apply':   data = _actStatusApplySpecific(effect, caster, targets, 'taunt', context); break;
      case 'silence_apply': data = _actStatusApplySpecific(effect, caster, targets, 'silence', context); break;
      case 'fear_apply':    data = _actStatusApplySpecific(effect, caster, targets, 'fear', context); break;
      case 'charm_apply':   data = _actStatusApplySpecific(effect, caster, targets, 'charm', context); break;
      default:
        // Passive-trigger actions (stat_mod, dr_mod etc.) are handled at
        // compile time, not here — quietly no-op.
        if (_isPassiveAction(effect.trigger)) {
          return { success: true, skipped: 'passive_handled_by_compiler' };
        }
        data = { note: `Unhandled action: ${action}` };
    }

    // Store result for sibling child effects
    if (effect.storeResult) {
      context.storedResults[effect.storeResult] = data?.amount || value;
    }

    // Fire child effects (sub-actions)
    if (effect.children && effect.children.length) {
      for (const child of effect.children) {
        executeEffect(child, { ...context, parentData: data });
      }
    }

    Log().logEffect({
      actor: caster,
      target: targets[0] || null,
      effect,
      result: data
    });

    return { success: true, data };
  }

  // ── TARGET RESOLUTION ─────────────────────────────────────────────
  function _resolveTargets(effect, context) {
    const targetSpec = effect.target || 'target';
    const caster = context.caster || context.unit;
    const primary = context.target;
    const all = context.allUnits || (GE() ? GE().getAllUnits() : []);

    switch (targetSpec) {
      case 'self':        return caster ? [caster] : [];
      case 'target':      return primary ? [primary] : [];
      case 'attacker':    return context.attacker ? [context.attacker] : [];
      case 'host':        return context.host ? [context.host] : [caster];
      case 'all_allies':  return all.filter(u => u.team === caster?.team && (u.currentHP || 0) > 0);
      case 'all_enemies': return all.filter(u => u.team !== caster?.team && (u.currentHP || 0) > 0);
      case 'all':         return all.filter(u => (u.currentHP || 0) > 0);
      case 'random_enemy': {
        const enemies = all.filter(u => u.team !== caster?.team && (u.currentHP || 0) > 0);
        return enemies.length ? [enemies[Math.floor(Math.random() * enemies.length)]] : [];
      }
      case 'random_ally': {
        const allies = all.filter(u => u.team === caster?.team && (u.currentHP || 0) > 0);
        return allies.length ? [allies[Math.floor(Math.random() * allies.length)]] : [];
      }
      case 'lowest_hp_ally':
        return _pickExtreme(all, u => u.team === caster?.team && (u.currentHP||0) > 0, (a, b) => a.currentHP - b.currentHP);
      case 'lowest_hp_enemy':
        return _pickExtreme(all, u => u.team !== caster?.team && (u.currentHP||0) > 0, (a, b) => a.currentHP - b.currentHP);
      case 'highest_hp_ally':
        return _pickExtreme(all, u => u.team === caster?.team && (u.currentHP||0) > 0, (a, b) => b.currentHP - a.currentHP);
      case 'highest_hp_enemy':
        return _pickExtreme(all, u => u.team !== caster?.team && (u.currentHP||0) > 0, (a, b) => b.currentHP - a.currentHP);
      case 'adjacent_to_self': {
        if (!GE() || !caster) return [];
        return all.filter(u => u !== caster && (u.currentHP||0) > 0 && GE().isAdjacent(caster, u));
      }
      case 'adjacent_to_target': {
        if (!GE() || !primary) return [];
        return all.filter(u => u !== primary && (u.currentHP||0) > 0 && GE().isAdjacent(primary, u));
      }
      case 'nearest_enemy': {
        if (!GE() || !caster) return [];
        const enemies = all.filter(u => u.team !== caster.team && (u.currentHP||0) > 0);
        enemies.sort((a, b) => GE().footprintDistance(caster, a) - GE().footprintDistance(caster, b));
        return enemies.length ? [enemies[0]] : [];
      }
      case 'furthest_enemy': {
        if (!GE() || !caster) return [];
        const enemies = all.filter(u => u.team !== caster.team && (u.currentHP||0) > 0);
        enemies.sort((a, b) => GE().footprintDistance(caster, b) - GE().footprintDistance(caster, a));
        return enemies.length ? [enemies[0]] : [];
      }
      case 'last_attacker':
        return context.lastAttacker ? [context.lastAttacker] : [];
      case 'all_summoned':
        return all.filter(u => u.isSummon);
      case 'all_with_status': {
        if (!effect.statusId) return [];
        return all.filter(u => SM() && SM().hasStatus(u, effect.statusId));
      }
      case 'aoe_radius':
      case 'aoe_line':
      case 'aoe_cone':
      case 'aoe_cross':
      case 'same_row':
      case 'same_column':
        return _resolveAoE(effect, context, all);
      default:
        return primary ? [primary] : [];
    }
  }

  function _resolveAoE(effect, context, all) {
    if (!AoE() || !GE()) return [];
    const origin = context.aoeOrigin ||
                   (context.target?.pos) ||
                   (context.caster?.pos) || [0, 0];
    const dims = GE().getDims();
    const size = effect.aoeSize || 2;
    const shape = effect.target; // e.g. 'aoe_radius'
    const dir = context.aoeDirection; // optional string or target cell
    const cells = AoE().getCellsForShape(shape, origin, size, dir, dims.width, dims.height);
    return AoE().unitsInCells(cells, GE()).filter(u => (u.currentHP||0) > 0);
  }

  function _pickExtreme(arr, filterFn, cmpFn) {
    const filtered = arr.filter(filterFn);
    if (!filtered.length) return [];
    filtered.sort(cmpFn);
    return [filtered[0]];
  }

  // ── ACTIONS ────────────────────────────────────────────────────────

  function _actDamage(effect, caster, targets, value, ctx) {
    const hits = [];
    for (const t of targets) {
      const result = DC().applyRawDamage({
        source: caster, target: t, amount: value,
        reason: `effect_${effect.id || effect.action}`,
        damageType: effect.damageType
      });
      hits.push({ target: t, applied: result.applied, killed: result.killed });

      // Cascade: on_take_damage
      fireTrigger('on_take_damage', {
        unit: t, target: t, attacker: caster,
        damageReceived: result.applied,
        damageType: effect.damageType,
        element: effect.element,
        turnNumber: ctx.turnNumber, allUnits: ctx.allUnits
      });
      if (result.killed) {
        fireTrigger('on_death', {
          unit: t, attacker: caster,
          turnNumber: ctx.turnNumber, allUnits: ctx.allUnits
        });
      }
    }
    return { action: 'damage', hits, amount: value };
  }

  function _actHeal(effect, caster, targets, value) {
    const healed = [];
    for (const t of targets) {
      const r = DC().applyHeal({ actor: caster, target: t, amount: value, source: effect.id });
      healed.push({ target: t, applied: r.applied });
    }
    return { action: 'heal', healed, amount: value };
  }

  function _actMPChange(effect, caster, targets, value, sign) {
    const results = [];
    for (const t of targets) {
      const actual = DC().applyMP({ target: t, delta: sign * value });
      results.push({ target: t, applied: actual });
    }
    // mp_drain: give to caster
    if (sign < 0 && caster && results.length) {
      const totalDrained = results.reduce((s, r) => s + Math.abs(r.applied), 0);
      DC().applyMP({ target: caster, delta: totalDrained });
    }
    return { action: sign > 0 ? 'mp_restore' : 'mp_drain', results, amount: value };
  }

  function _actHPDrain(effect, caster, targets, value, ctx) {
    // Damage target, heal caster by same amount
    const hits = [];
    let totalDealt = 0;
    for (const t of targets) {
      const r = DC().applyRawDamage({ source: caster, target: t, amount: value,
        reason: 'hp_drain', damageType: effect.damageType || 'Magic' });
      hits.push({ target: t, applied: r.applied });
      totalDealt += r.applied;
    }
    if (caster && totalDealt > 0) {
      DC().applyHeal({ actor: caster, target: caster, amount: totalDealt, source: 'hp_drain' });
    }
    return { action: 'hp_drain', hits, drained: totalDealt };
  }

  function _actStatusApply(effect, caster, targets, ctx) {
    if (!effect.statusId) return { action: 'status_apply', skipped: 'no_status_id' };
    const results = [];
    for (const t of targets) {
      const res = SM().applyStatus({
        target: t, statusId: effect.statusId, sourceUnit: caster,
        overrides: { duration: effect.duration, stacks: 1, value: effect.value },
        combatContext: ctx
      });
      results.push({ target: t, ...res });
    }
    return { action: 'status_apply', statusId: effect.statusId, results };
  }

  function _actStatusApplySpecific(effect, caster, targets, statusId, ctx) {
    const results = [];
    for (const t of targets) {
      const res = SM().applyStatus({
        target: t, statusId, sourceUnit: caster,
        overrides: { duration: effect.duration || 2 },
        combatContext: ctx
      });
      results.push({ target: t, ...res });
    }
    return { action: effect.action, statusId, results };
  }

  function _actStatusRemove(effect, caster, targets) {
    if (!effect.statusId) return { action: 'status_remove', skipped: 'no_status_id' };
    const results = [];
    for (const t of targets) {
      results.push({ target: t, removed: SM().removeStatus(t, effect.statusId, 'effect') });
    }
    return { action: 'status_remove', statusId: effect.statusId, results };
  }

  function _actCleanse(effect, caster, targets, opts) {
    const results = [];
    for (const t of targets) {
      results.push({ target: t, removed: SM().cleanse({ unit: t, ...opts }) });
    }
    return { action: 'cleanse', results };
  }

  function _actReflect(effect, caster, targets, value, ctx) {
    // Reflect is typically used in on_take_damage context — caster reflects to attacker.
    const reflectTarget = ctx.attacker || targets[0];
    if (!reflectTarget) return { action: 'reflect', skipped: 'no_attacker' };
    const amount = value; // already resolved from damage_received
    const r = DC().applyRawDamage({ source: caster, target: reflectTarget, amount,
      reason: 'reflect', damageType: ctx.damageType || 'Physical' });
    return { action: 'reflect', target: reflectTarget, applied: r.applied };
  }

  function _actAbsorb(effect, caster, targets, value) {
    for (const t of targets) {
      t.absorbShield = (t.absorbShield || 0) + value;
    }
    return { action: 'absorb', amount: value, targets: targets.length };
  }

  function _actCounter(effect, caster, targets, ctx) {
    // Counter-attack: caster performs a basic attack vs attacker
    const attacker = ctx.attacker;
    if (!attacker || !caster) return { action: 'counter', skipped: 'no_attacker' };
    const attack = DC().computeAttack({ attacker: caster, target: attacker, skill: null });
    if (attack.hit) {
      DC().applyDamage({
        attacker: caster, target: attacker, amount: attack.damage,
        element: 'Physical', damageType: 'Physical',
        isCritical: attack.isCritical, breakdown: attack.breakdown
      });
    }
    return { action: 'counter', attack };
  }

  function _actDamageBlock(effect, caster, targets, value) {
    for (const t of targets) {
      t.damageBlock = (t.damageBlock || 0) + value;
    }
    return { action: 'damage_block', amount: value };
  }

  function _actRevive(effect, caster, targets, value) {
    const results = [];
    for (const t of targets) {
      if ((t.currentHP || 0) > 0) continue;
      const hp = Math.floor((t.maxHP || 1) * (value || 50) / 100);
      t.currentHP = Math.max(1, hp);
      Log().record({
        type: 'revive', actor: caster, target: t,
        tags: ['revive', 'dramatic'],
        data: { hpRestored: t.currentHP }
      });
      results.push({ target: t, hp: t.currentHP });
    }
    return { action: 'revive', results };
  }

  function _actKnockback(effect, caster, targets, value, ctx) {
    if (!GE() || !caster) return { action: 'knockback', skipped: 'no_grid' };
    const results = [];
    for (const t of targets) {
      // Direction: away from caster
      const dr = Math.sign(t.pos[0] - caster.pos[0]);
      const dc = Math.sign(t.pos[1] - caster.pos[1]);
      if (dr === 0 && dc === 0) continue;
      const kb = GE().knockback(t.instanceId, dr, dc, value);
      const dmgHits = GE().resolveKnockbackCollisions(t.instanceId, kb.collisions, ctx.damageDealt || 0);
      for (const h of dmgHits) {
        const u = GE().getUnit(h.unitId);
        if (u) DC().applyRawDamage({ source: null, target: u, amount: h.damage, reason: h.reason });
      }
      Log().logKnockback({ actor: caster, target: t,
        distance: kb.distanceMoved, collisions: kb.collisions });
      results.push({ target: t, ...kb });
    }
    return { action: 'knockback', results };
  }

  function _actPull(effect, caster, targets, value, ctx) {
    if (!GE() || !caster) return { action: 'pull', skipped: 'no_grid' };
    const results = [];
    for (const t of targets) {
      // Direction: toward caster
      const dr = Math.sign(caster.pos[0] - t.pos[0]);
      const dc = Math.sign(caster.pos[1] - t.pos[1]);
      if (dr === 0 && dc === 0) continue;
      const kb = GE().knockback(t.instanceId, dr, dc, value);
      results.push({ target: t, ...kb });
    }
    return { action: 'pull', results };
  }

  function _actTeleport(effect, caster, targets, ctx) {
    if (!GE()) return { action: 'teleport', skipped: 'no_grid' };
    const dest = ctx.teleportDestination;
    if (!dest) return { action: 'teleport', skipped: 'no_destination' };
    const results = [];
    for (const t of targets) {
      const r = GE().teleportUnit(t.instanceId, dest[0], dest[1]);
      results.push({ target: t, ...r });
    }
    return { action: 'teleport', results };
  }

  function _actSwap(effect, caster, targets) {
    if (!GE() || !caster || !targets[0]) return { action: 'swap_position', skipped: 'no_target' };
    const other = targets[0];
    const casterPos = [...caster.pos];
    const otherPos = [...other.pos];
    // Temporary: remove both, then place each at the other's spot
    GE().removeFromBoard(caster.instanceId);
    GE().removeFromBoard(other.instanceId);
    const r1 = GE().addUnit(caster, otherPos[0], otherPos[1], caster.size);
    const r2 = GE().addUnit(other, casterPos[0], casterPos[1], other.size);
    return { action: 'swap_position', success: r1 && r2 };
  }

  function _actTerrainCreate(effect, caster, value, ctx) {
    // Terrain creation is tricky without a grid mutation API on GridEngine.
    // For now, just log it — grid-engine can add mutation later.
    const origin = ctx.terrainOrigin || ctx.target?.pos || caster?.pos;
    return { action: 'terrain_create', terrainType: effect.terrainType, origin,
      duration: effect.duration, note: 'terrain mutation API pending' };
  }

  function _actCooldownReset(effect, caster, targets, ctx) {
    const skillId = effect.skillId || ctx.lastSkillUsed?.id;
    const results = [];
    for (const t of targets) {
      if (t.turnState?.cooldowns?.[skillId]) {
        t.turnState.cooldowns[skillId] = 0;
        results.push({ target: t, skillId });
      }
    }
    return { action: 'cooldown_reset', results };
  }

  function _actApGrant(effect, caster, targets, value) {
    for (const t of targets) {
      if (t.turnState) {
        t.turnState.bonusAP = (t.turnState.bonusAP || 0) + value;
        t.turnState.apRemaining = (t.turnState.apRemaining || 0) + value;
      }
    }
    return { action: 'ap_grant', amount: value };
  }

  function _actExecute(effect, caster, targets, ctx) {
    const threshold = effect.threshold || 25; // HP % under which execute kills
    const results = [];
    for (const t of targets) {
      const pct = ((t.currentHP || 0) / (t.maxHP || 1)) * 100;
      if (pct < threshold) {
        DC().applyRawDamage({ source: caster, target: t, amount: t.currentHP,
          reason: 'execute', damageType: 'True' });
        fireTrigger('on_death', { unit: t, attacker: caster, turnNumber: ctx.turnNumber,
          allUnits: ctx.allUnits });
        results.push({ target: t, executed: true });
      } else {
        results.push({ target: t, executed: false, reason: 'above_threshold' });
      }
    }
    return { action: 'execute', results };
  }

  function _actExtraAction(effect, caster, targets) {
    for (const t of targets) {
      if (t.turnState) t.turnState.mainActionUsed = false;
    }
    return { action: 'extra_action', grantedTo: targets.length };
  }

  function _actStealBuff(effect, caster, targets) {
    if (!SM()) return { action: 'steal_buff', skipped: 'no_manager' };
    const results = [];
    for (const t of targets) {
      const buffs = (t.activeStatuses || []).filter(s => {
        const def = DS().get('statuses', s.statusId);
        return def?.isBuff;
      });
      if (!buffs.length) { results.push({ target: t, stolen: null }); continue; }
      const pick = buffs[Math.floor(Math.random() * buffs.length)];
      SM().removeStatus(t, pick.statusId, 'stolen');
      if (caster) {
        SM().applyStatus({
          target: caster, statusId: pick.statusId, sourceUnit: caster,
          overrides: { duration: pick.duration, stacks: pick.stacks }
        });
      }
      results.push({ target: t, stolen: pick.statusId });
    }
    return { action: 'steal_buff', results };
  }

  function _isPassiveAction(trigger) {
    return [
      'stat_mod','dr_mod','element_mod','crit_mod','evasion_mod',
      'accuracy_mod','ap_mod','movement_mod','range_mod','cost_mod',
      'cooldown_mod','damage_mod','hp_mod','mp_mod','status_resist_mod',
      'double_action','triple_action'
    ].includes(trigger);
  }

  // ── SINGLE EFFECT EXECUTION (public) ───────────────────────────────
  // Useful for AI-triggered effects, status-tick effects, etc., when
  // the caller already has the effect in hand and doesn't need the trigger scan.
  function executeSingleEffect(effect, context) {
    if (!Cond().evaluate(effect.conditions, context)) {
      return { success: false, reason: 'conditions_failed' };
    }
    return executeEffect(effect, context);
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    fireTrigger,
    executeEffect,
    executeSingleEffect
  });
})();
