// action-handler.js
// Validates and executes an action chosen by either a player or the AI.
// Same API for both — combat-manager doesn't care who picked.
//
// Actions:
//   { type: 'move',    targetPos: [r, c] }
//   { type: 'attack',  targetId: 'unit_instance_id' }
//   { type: 'skill',   skillId, targetId? or aoeCenter? }
//   { type: 'item',    itemId, targetId? }
//   { type: 'defend' }
//   { type: 'end_turn' }
//
// Reads: grid-engine, damage-calc, effect-resolver, status-manager,
//        data-store, constants, combat-log, dice-service
// Used by: combat-manager.js, UI layer
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.ActionHandler = (() => {
  'use strict';

  const GE  = () => window.CJS.GridEngine;
  const DC  = () => window.CJS.DamageCalc;
  const ER  = () => window.CJS.EffectResolver;
  const SM  = () => window.CJS.StatusManager;
  const DS  = () => window.CJS.DataStore;
  const C   = () => window.CJS.CONST;
  const Log = () => window.CJS.CombatLog;
  const AoE = () => window.CJS.AoE;
  const AM  = () => window.CJS.AudioManager;
  const AB  = () => window.CJS.AnimationBus;

  function _sfx(key, opts) { try { AM()?.playSfx(key, opts); } catch (e) {} }
  function _anim(name, payload) { try { AB()?.emit(name, payload); } catch (e) {} }

  // Map a weapon's damageType ("Slashing", "Piercing", "Bludgeoning",
  // anything else) to our SFX key family. Falls back to weapon_hit_physical
  // if the synth/manifest doesn't have a more specific match.
  function _weaponSfxKey(weaponData) {
    const dt = String(weaponData?.damageType || '').toLowerCase();
    if (dt.includes('slash'))   return 'weapon_slash';
    if (dt.includes('pierc'))   return 'weapon_pierce';
    if (dt.includes('blunt') || dt.includes('bludg') || dt.includes('crush'))
      return 'weapon_blunt';
    return null;
  }

  function _battleSfx(unit, event, ctx = {}) {
    const key = _battleSfxKey(unit, event, ctx);
    if (key) _sfx(key, { volume: ctx.volume ?? 0.62 });
    return key;
  }

  function _battleSfxKey(unit, event, ctx = {}) {
    const authored = _authoredBattleSfx(unit, event);
    if (authored) return authored;
    if (event === 'archerAttack') return _isArcherWeapon(unit, ctx.weaponData) ? 'weapon_bow_shot' : null;
    if (event === 'attack') return null;
    if (event === 'hurt') return null;
    if (event === 'happy') return null;
    if (event === 'angry') return null;
    if (event === 'expression') return null;
    return null;
  }

  function _authoredBattleSfx(unit, event) {
    const slots = unit?.battleSfx || {};
    const aliases = {
      attack: ['attack', 'fight', 'attackLine', 'fightLine', 'voiceAttack', 'monsterAttack'],
      hurt: ['hurt', 'hurtLine', 'voiceHurt', 'monsterHurt'],
      happy: ['happy', 'happyLine', 'voiceHappy'],
      angry: ['angry', 'angryLine', 'voiceAngry', 'miss', 'missLine'],
      expression: ['expression', 'expressionLine', 'voiceExpression'],
      archerAttack: ['archerAttack', 'bowShot', 'rangedAttack'],
      monsterAttack: ['monsterAttack', 'attack'],
      monsterHurt: ['monsterHurt', 'hurt']
    }[event] || [event];
    for (const alias of aliases) {
      const picked = _pickSfxValue(slots[alias]);
      if (picked) return picked;
    }
    return null;
  }

  function _pickSfxValue(value) {
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) {
      const options = value.map((item) => String(item || '').trim()).filter(Boolean);
      return options.length ? options[Math.floor(Math.random() * options.length)] : '';
    }
    if (value && typeof value === 'object') return _pickSfxValue(value.id || value.key || value.sfx);
    return '';
  }

  function _isArcherWeapon(unit, weaponData) {
    const text = [
      weaponData?.itemId,
      weaponData?.itemName,
      weaponData?.weaponType,
      weaponData?.type,
      weaponData?.kind,
      ...(weaponData?.tags || [])
    ].join(' ').toLowerCase();
    if (/bow|crossbow|arrow|archer/.test(text)) return true;
    const range = Number(weaponData?.range ?? unit?.basicAttackRange ?? unit?.attackRange ?? 1);
    const damageType = String(weaponData?.damageType || '').toLowerCase();
    return range > 1 && (damageType.includes('physical') || damageType.includes('pierc'));
  }

  // ── VALIDATE ──────────────────────────────────────────────────────
  /**
   * Check whether `action` may be executed by `unit` right now.
   * @param {CJSCombatUnit} unit
   * @param {CJSCombatAction} action
   * @returns {{ valid: boolean, reason?: string }}
   */
  function validate(unit, action) {
    if (!unit || !action) return { valid: false, reason: 'bad_args' };
    if ((unit.currentHP || 0) <= 0) return { valid: false, reason: 'unit_dead' };

    // Can the unit act at all? (stun, sleep, freeze)
    if (action.type !== 'end_turn' && SM() && !SM().canAct(unit)) {
      return { valid: false, reason: 'action_prevented_by_status' };
    }

    const ts = unit.turnState || {};

    switch (action.type) {
      case 'move': {
        if (ts.hasMoved) return { valid: false, reason: 'already_moved' };
        if (SM() && !SM().canMove(unit)) return { valid: false, reason: 'movement_prevented' };
        if (!action.targetPos) return { valid: false, reason: 'no_target_pos' };
        const mv = GE().isValidMove(unit.instanceId, action.targetPos[0], action.targetPos[1]);
        return mv.valid ? { valid: true } : { valid: false, reason: mv.reason };
      }

      case 'attack': {
        if (ts.mainActionUsed) return { valid: false, reason: 'main_action_used' };
        if ((ts.apRemaining || 0) < 1) return { valid: false, reason: 'no_ap' };
        const target = GE().getUnit(action.targetId);
        if (!target) return { valid: false, reason: 'no_target' };
        // Use weapon range (ranged weapons can basic-attack at distance)
        const atkRange = getAttackRange(unit);
        if (GE().footprintDistance(unit, target) > atkRange) {
          return { valid: false, reason: 'target_out_of_range' };
        }
        return { valid: true };
      }

      case 'skill': {
        if (ts.mainActionUsed) return { valid: false, reason: 'main_action_used' };
        // Silence check: preventsSkills status blocks skill usage
        if (SM() && SM().canUseSkills && !SM().canUseSkills(unit)) {
          return { valid: false, reason: 'silenced' };
        }
        const skill = _resolveSkill(unit, action.skillId);
        if (!skill) return { valid: false, reason: 'unknown_skill' };
        // Check skill is known (via SkillResolver — handles both formats)
        const SR = window.CJS.SkillResolver;
        const knownSkillIds = SR
          ? SR.getSkillIds(unit.skills || [])
          : (unit.skills || []).map(s => typeof s === 'string' ? s : s.skillId);
        if (!knownSkillIds.includes(action.skillId)) {
          return { valid: false, reason: 'skill_not_known' };
        }
        if (!_meetsWeaponRequirement(unit, skill)) {
          return { valid: false, reason: 'required_weapon_missing' };
        }
        if ((ts.cooldowns?.[action.skillId] || 0) > 0) {
          return { valid: false, reason: 'on_cooldown' };
        }
        const mpCost = Math.max(0, (skill.mp || 0) + (unit.costMod || 0));
        if ((unit.currentMP || 0) < mpCost) return { valid: false, reason: 'not_enough_mp' };
        const apCost = skill.ap || 1;
        if ((ts.apRemaining || 0) < apCost) return { valid: false, reason: 'not_enough_ap' };
        // Ultimate cost gate: ultimate-flagged skills require a charged meter.
        if (skill.isUltimate) {
          const cost = Number(skill.ultimateCost || 100);
          if ((unit.ultimateMeter || 0) < cost) return { valid: false, reason: 'ultimate_not_ready' };
        }

        // Stealth check: can't target invisible units
        if (action.targetId && SM() && SM().isInvisible) {
          const target = GE().getUnit(action.targetId);
          if (target && SM().isInvisible(target) && target.team !== unit.team) {
            return { valid: false, reason: 'target_invisible' };
          }
        }

        // Range check for single-target skills
        if (action.targetId && !_isAoeSkill(skill)) {
          const target = GE().getUnit(action.targetId);
          if (!target) return { valid: false, reason: 'no_target' };
          const range = _skillRange(unit, skill);
          if (GE().footprintDistance(unit, target) > range) {
            return { valid: false, reason: 'target_out_of_range' };
          }
          if (skill.requiresLoS &&
              !GE().hasLineOfSight(unit.pos[0], unit.pos[1], target.pos[0], target.pos[1], unit.instanceId)) {
            return { valid: false, reason: 'no_line_of_sight' };
          }
        }
        // AoE cell targeting range
        if (action.aoeCenter && _isAoeSkill(skill)) {
          const range = _skillRange(unit, skill);
          if (GE().distance(unit.pos[0], unit.pos[1], action.aoeCenter[0], action.aoeCenter[1]) > range) {
            return { valid: false, reason: 'aoe_center_out_of_range' };
          }
        }
        return { valid: true };
      }

      case 'item': {
        if (ts.mainActionUsed) return { valid: false, reason: 'main_action_used' };
        if (!(unit.equipment || []).includes(action.itemId) &&
            !(unit.inventory || []).includes(action.itemId)) {
          return { valid: false, reason: 'item_not_owned' };
        }
        return { valid: true };
      }

      case 'defend':
        if (ts.mainActionUsed) return { valid: false, reason: 'main_action_used' };
        return { valid: true };

      case 'end_turn':
        return { valid: true };

      default:
        return { valid: false, reason: 'unknown_action_type' };
    }
  }

  // ── EXECUTE ───────────────────────────────────────────────────────
  /**
   * Validate, then perform the action. Decrements AP/MP/cooldowns and routes
   * to the per-action handlers (_doMove/_doAttack/_doSkill/_doItem/_doDefend).
   * @param {CJSCombatUnit} unit
   * @param {CJSCombatAction} action
   * @param {{ turnNumber?: number }} [combatContext]
   * @returns {CJSActionResult}
   */
  function execute(unit, action, combatContext) {
    const check = validate(unit, action);
    if (!check.valid) {
      Log().logNote(`Invalid action by ${unit?.name}: ${check.reason}`, ['invalid_action']);
      return { success: false, reason: check.reason };
    }

    const ts = unit.turnState;
    const ctx = combatContext || { turnNumber: Log().getTurn() };

    switch (action.type) {
      case 'move':    return _doMove(unit, action, ctx);
      case 'attack':  return _doAttack(unit, action, ctx);
      case 'skill':   return _doSkill(unit, action, ctx);
      case 'item':    return _doItem(unit, action, ctx);
      case 'defend':  return _doDefend(unit, action, ctx);
      case 'end_turn':return _doEndTurn(unit, action, ctx);
    }
  }

  // ── MOVE ──────────────────────────────────────────────────────────
  function _doMove(unit, action, ctx) {
    const [tr, tc] = action.targetPos;
    const fromPos = [...unit.pos];
    const result = GE().moveUnit(unit.instanceId, tr, tc);
    if (!result.success) return { success: false, reason: result.reason };

    unit.turnState.hasMoved = true;
    Log().logMove({
      actor: unit, from: fromPos, to: [tr, tc],
      cost: result.cost, terrainEffects: result.terrainEffects
    });

    _anim('unit_move', { unit, from: fromPos, to: [tr, tc] });
    _sfx('move_step', { volume: 0.58 });

    // Fire on_move trigger (terrain effects, caltrops, etc.)
    ER().fireTrigger('on_move', {
      unit, turnNumber: ctx.turnNumber,
      allUnits: GE().getAllUnits(),
      terrainEffects: result.terrainEffects
    });

    // Apply terrain effects for cells traversed
    for (const tEff of (result.terrainEffects || [])) {
      const terrainEffectId = tEff.effectId;
      const master = DS().get('effects', terrainEffectId);
      if (master) {
        ER().executeEffect(master, {
          caster: null, unit, target: unit,
          allUnits: GE().getAllUnits(), turnNumber: ctx.turnNumber
        });
      }
    }

    return { success: true, action: 'move', ...result };
  }

  // ── ATTACK (basic) ────────────────────────────────────────────────
  function _doAttack(unit, action, ctx) {
    const target = GE().getUnit(action.targetId);
    // Get weapon data for element/damageType (null = fists → Physical)
    const weaponData = _getWeaponData(unit);
    _battleSfx(unit, 'attack', { weaponData, target, volume: 0.5 });
    _battleSfx(unit, 'archerAttack', { weaponData, target, volume: 0.62 });
    Log().record({
      type: 'action_used',
      actor: unit,
      target,
      tags: [
        'action_used',
        'basic_attack',
        'attack',
        ...((weaponData?.tags || []).map((tag) => `weapon_tag:${tag}`))
      ],
      data: { action: 'attack', weaponId: weaponData?.itemId || weaponData?.id || null }
    });
    const attack = DC().computeAttack({
      attacker: unit, target, skill: null,
      qteMultiplier: ctx.qteMultiplier || 1.0,
      weaponData  // passed to damage-calc for baseDamage/element/damageType
    });

    unit.turnState.mainActionUsed = true;
    unit.turnState.apRemaining = Math.max(0, (unit.turnState.apRemaining || 0) - 1);

    if (attack.miss) {
      Log().logMiss({ actor: unit, target, skill: null });
      _anim('miss', { attacker: unit, target, skill: null });
      _battleSfx(unit, 'angry', { target, volume: 0.5 });
      _sfx('miss', { volume: 0.58 });
      ER().fireTrigger('on_miss', {
        unit, attacker: unit, target, allUnits: GE().getAllUnits(),
        turnNumber: ctx.turnNumber
      });
      return { success: true, hit: false, missed: true };
    }

    // Use weapon element/damageType if available
    const atkElement    = weaponData?.element    || 'Physical';
    const atkDamageType = weaponData?.damageType || 'Physical';

    const applied = DC().applyDamage({
      attacker: unit, target, amount: attack.damage,
      damageType: atkDamageType, element: atkElement,
      skill: null, isCritical: attack.isCritical, breakdown: attack.breakdown
    });
    if (applied.applied > 0) _battleSfx(target, 'hurt', { attacker: unit, volume: 0.48 });

    // SFX: prefer weapon-shape (slash/pierce/blunt), then element variant,
    // then generic physical. Animation: directional slash + shake.
    const weaponShapeKey = _weaponSfxKey(weaponData);
    const elementKey = `weapon_hit_${String(atkElement || 'physical').toLowerCase()}`;
    _sfx(weaponShapeKey || elementKey, {
      fallbacks: weaponShapeKey ? [elementKey, 'weapon_hit_physical'] : ['weapon_hit_physical']
    });
    _anim('hit', {
      attacker: unit, target,
      damageType: atkDamageType, element: atkElement,
      weaponShape: weaponShapeKey,           // 'weapon_slash' | 'weapon_pierce' | 'weapon_blunt' | null
      isCritical: !!attack.isCritical
    });
    if (attack.isCritical) {
      _sfx('crit_sting', { volume: 0.52, fallbacks: ['critical'] });
      if (!applied.killed) _battleSfx(unit, 'happy', { target, volume: 0.5 });
    }

    // Fire on_hit (attacker-side)
    ER().fireTrigger('on_hit', {
      unit, attacker: unit, target,
      damageDealt: applied.applied,
      damageType: atkDamageType, element: atkElement,
      isCritical: attack.isCritical,
      turnNumber: ctx.turnNumber, allUnits: GE().getAllUnits()
    });
    if (attack.isCritical) {
      ER().fireTrigger('on_crit', {
        unit, attacker: unit, target,
        damageDealt: applied.applied,
        turnNumber: ctx.turnNumber, allUnits: GE().getAllUnits()
      });
    }

    // on_take_damage is fired inside damage-calc/resolver chain

    if (applied.killed) {
      _battleSfx(unit, 'happy', { target, volume: 0.5 });
      ER().fireTrigger('on_kill', {
        unit, attacker: unit, target,
        turnNumber: ctx.turnNumber, allUnits: GE().getAllUnits()
      });
      GE().removeFromBoard(target.instanceId);
    }

    return { success: true, hit: true, damage: applied.applied, killed: applied.killed };
  }

  // ── SKILL ─────────────────────────────────────────────────────────
  function _doSkill(unit, action, ctx) {
    const skill = _resolveSkill(unit, action.skillId);
    if (!skill) return { success: false, reason: 'unknown_skill' };
    const apCost = skill.ap || 1;
    const mpCost = Math.max(0, (skill.mp || 0) + (unit.costMod || 0));
    const cd     = Math.max(0, (skill.cooldown || 0) + (unit.cooldownMod || 0));

    _anim('skill_cast', { unit, skill });
    // Honor skill.castSfx if author set one; else default to magic_cast for
    // Magic skills, no cast SFX for Physical.
    if (skill.castSfx) {
      _sfx(skill.castSfx);
    } else if (skill.damageType === 'Magic') {
      _sfx('magic_cast');
    }

    // Pay costs
    unit.turnState.mainActionUsed = true;
    unit.turnState.apRemaining = Math.max(0, (unit.turnState.apRemaining || 0) - apCost);
    unit.currentMP = Math.max(0, (unit.currentMP || 0) - mpCost);
    if (skill.isUltimate) {
      const ultCost = Number(skill.ultimateCost || 100);
      unit.ultimateMeter = Math.max(0, (unit.ultimateMeter || 0) - ultCost);
    }
    if (cd > 0) {
      unit.turnState.cooldowns = unit.turnState.cooldowns || {};
      unit.turnState.cooldowns[action.skillId] = cd;
    }

    // Pull QTE result from the action (set by UI layer), or default to neutral.
    // Player flow: UI pops QTE → awaits result → submitAction({..., qteResult}).
    // AI flow: combat-manager's AI path simulates a grade based on the unit's
    // stats/archetype and stuffs it into the action before calling execute.
    const qteResult = action.qteResult || _defaultQTEResult(skill);
    const qteMultiplier = qteResult.multiplier || 1.0;
    const qteGrade = qteResult.grade || 'ok';

    const target = action.targetId ? GE().getUnit(action.targetId) : null;
    Log().logSkillUse({ actor: unit, target, skill, apCost, mpCost });

    // Gather targets (single, or AoE)
    let targets = [];
    let aoeOrigin = null;
    if (skill.aoe && skill.aoe !== 'none' && action.aoeCenter) {
      aoeOrigin = action.aoeCenter;
      const dims = GE().getDims();
      const cells = AoE().getCellsForShape(`aoe_${skill.aoe}`, aoeOrigin,
        skill.aoeSize || 2, target ? target.pos : null, dims.width, dims.height);
      targets = AoE().unitsInCells(cells, GE())
        .filter(u => (u.currentHP || 0) > 0 && u.team !== unit.team);
    } else if (target) {
      targets = [target];
    }

    // Resolve damage (if skill has power) for each target
    const hits = [];
    if (skill.power) {
      _battleSfx(unit, 'attack', { skill, volume: 0.48 });
      let missVoicePlayed = false;
      for (const t of targets) {
        const attack = DC().computeAttack({
          attacker: unit, target: t, skill, qteMultiplier, qteGrade
        });
        if (attack.miss) {
          Log().logMiss({ actor: unit, target: t, skill });
          _anim('miss', { attacker: unit, target: t, skill });
          if (!missVoicePlayed) {
            _battleSfx(unit, 'angry', { target: t, skill, volume: 0.5 });
            missVoicePlayed = true;
          }
          _sfx('miss', { volume: 0.58 });
          hits.push({ target: t, missed: true });
          continue;
        }
        const applied = DC().applyDamage({
          attacker: unit, target: t, amount: attack.damage,
          damageType: skill.damageType || 'Physical',
          element:    skill.element    || 'Physical',
          skill, isCritical: attack.isCritical, breakdown: attack.breakdown,
          qteGrade
        });
        hits.push({ target: t, damage: applied.applied, killed: applied.killed, critical: attack.isCritical });
        if (applied.applied > 0) _battleSfx(t, 'hurt', { attacker: unit, skill, volume: 0.46 });

        // SFX routing priority:
        //   1. skill.hitSfx (author override)
        //   2. magic_<element> for Magic skills, falling back to magic_hit
        //   3. weapon_hit_<element> for Physical, falling back to weapon_hit_physical
        if (skill.hitSfx) {
          _sfx(skill.hitSfx, { fallbacks: ['weapon_hit_physical'] });
        } else if (skill.damageType === 'Magic') {
          const elementKey = `magic_${String(skill.element || '').toLowerCase()}`;
          _sfx(elementKey, { fallbacks: ['magic_hit'] });
        } else {
          _sfx(`weapon_hit_${String(skill.element || 'physical').toLowerCase()}`, {
            fallbacks: ['weapon_hit_physical']
          });
        }
        if (attack.isCritical) {
          _sfx('crit_sting', { volume: 0.52, fallbacks: ['critical'] });
          if (!applied.killed) _battleSfx(unit, 'happy', { target: t, skill, volume: 0.5 });
        }

        // Animation: emit hit so combat-ui can render slash + shake
        _anim('hit', {
          attacker: unit, target: t, skill,
          damageType: skill.damageType || 'Physical',
          element: skill.element || 'Physical',
          isCritical: !!attack.isCritical
        });

        ER().fireTrigger('on_hit', {
          unit, attacker: unit, target: t,
          damageDealt: applied.applied,
          damageType: skill.damageType, element: skill.element,
          isCritical: attack.isCritical, skillUsed: skill,
          turnNumber: ctx.turnNumber, allUnits: GE().getAllUnits()
        });
        if (attack.isCritical) {
          ER().fireTrigger('on_crit', {
            unit, attacker: unit, target: t, damageDealt: applied.applied,
            turnNumber: ctx.turnNumber, allUnits: GE().getAllUnits()
          });
        }
        if (applied.killed) {
          _battleSfx(unit, 'happy', { target: t, skill, volume: 0.5 });
          ER().fireTrigger('on_kill', {
            unit, attacker: unit, target: t,
            turnNumber: ctx.turnNumber, allUnits: GE().getAllUnits()
          });
          GE().removeFromBoard(t.instanceId);
        }
      }
    }

    // Apply skill's additional effects (from skill.effects[])
    for (const ref of (skill.effects || [])) {
      const master = DS().get('effects', ref.effectId);
      if (!master) continue;
      const merged = { ...master, ...(ref.overrides || {}) };
      ER().executeEffect(merged, {
        caster: unit, unit, target, skillUsed: skill,
        aoeOrigin, aoeDirection: target?.pos,
        damageDealt: hits.reduce((s, h) => s + (h.damage || 0), 0),
        allUnits: GE().getAllUnits(),
        turnNumber: ctx.turnNumber
      });
    }

    ER().fireTrigger('on_skill_use', {
      unit, attacker: unit, target, skillUsed: skill,
      turnNumber: ctx.turnNumber, allUnits: GE().getAllUnits()
    });

    // Record skill use for post-combat campaign-mode AP gain. This fires
    // for every unit (including AI), but combat-bridge only emits ops for
    // player party members.
    unit.skillUseLog = unit.skillUseLog || {};
    const logEntry = unit.skillUseLog[action.skillId] = unit.skillUseLog[action.skillId]
      || { count: 0, qteCounts: { perfect: 0, good: 0, ok: 0, fail: 0 } };
    logEntry.count = (logEntry.count || 0) + 1;
    if (logEntry.qteCounts[qteGrade] != null) {
      logEntry.qteCounts[qteGrade] += 1;
    }

    return { success: true, action: 'skill', skillId: action.skillId, hits };
  }

  // ── ITEM ──────────────────────────────────────────────────────────
  function _doItem(unit, action, ctx) {
    const item = DS().get('items', action.itemId);
    if (!item) return { success: false, reason: 'no_item' };

    unit.turnState.mainActionUsed = true;
    // Consume if consumable
    if (item.slot === 'consumable') {
      unit.inventory = (unit.inventory || []).filter(id => id !== action.itemId);
    }

    // Fire each item effect
    for (const ref of (item.effects || [])) {
      const master = DS().get('effects', ref.effectId);
      if (!master) continue;
      const merged = { ...master, ...(ref.overrides || {}) };
      const target = action.targetId ? GE().getUnit(action.targetId) : unit;
      ER().executeEffect(merged, {
        caster: unit, unit, target,
        allUnits: GE().getAllUnits(), turnNumber: ctx.turnNumber
      });
    }

    Log().record({
      type: 'item_used', actor: unit, target: null,
      tags: ['item_used', `item_${action.itemId}`],
      data: { itemId: action.itemId }
    });

    ER().fireTrigger('on_item_use', {
      unit, attacker: unit, allUnits: GE().getAllUnits(),
      turnNumber: ctx.turnNumber
    });

    _sfx('item_use');

    return { success: true, action: 'item' };
  }

  // ── DEFEND ────────────────────────────────────────────────────────
  function _doDefend(unit, action, ctx) {
    unit.turnState.mainActionUsed = true;
    unit.turnState.isDefending = true;
    unit.turnState.bonusAP = (unit.turnState.bonusAP || 0) + (C().ACTION_ECONOMY.defendAPBonus || 0);
    // DR boost for this round — expires at turn_start next turn
    unit._defendDRBoost = C().ACTION_ECONOMY.defendDRBonus || 5;
    Log().record({
      type: 'defend', actor: unit, target: null,
      tags: ['defend'], data: { drBoost: unit._defendDRBoost }
    });
    _sfx('defend_guard', { volume: 0.62 });
    _battleSfx(unit, 'expression', { volume: 0.42 });
    return { success: true, action: 'defend' };
  }

  // ── END TURN ──────────────────────────────────────────────────────
  function _doEndTurn(unit, action, ctx) {
    unit.turnState.bonusAP = (unit.turnState.bonusAP || 0) + (C().ACTION_ECONOMY.endTurnAPBonus || 0);
    return { success: true, action: 'end_turn' };
  }

  // ── DEFAULT QTE RESULT ─────────────────────────────────────────────
  // When an action is executed without a pre-resolved qteResult, we assume
  // a neutral "ok" multiplier. Combat-manager overrides this for AI units
  // with a simulated result (so enemies still roll perfect/good/fail).
  function _defaultQTEResult(skill) {
    return { grade: 'ok', multiplier: 1.0, qteType: skill?.qte || 'none' };
  }

  // Simulate a QTE grade for AI units. Based on a simple roll: higher-rank
  // monsters land better grades more often. Returns the same shape a real
  // QTE would produce.
  /**
   * @param {CJSCombatUnit} unit
   * @param {CJSSkill} skill
   * @returns {{ grade: string, multiplier: number }}
   */
  function simulateAIQTE(unit, skill) {
    if (!skill || !skill.qte || skill.qte === 'none') {
      return _defaultQTEResult(skill);
    }
    // Rank-based success chance
    const RANK_SKILL = { F: 0.35, E: 0.45, D: 0.55, C: 0.65, B: 0.72, A: 0.80, S: 0.85, SR: 0.90, SSR: 0.95 };
    const rankSkill = RANK_SKILL[unit?.rank] ?? 0.5;
    const r = Math.random();
    let grade;
    if (r < rankSkill * 0.2)       grade = 'perfect';
    else if (r < rankSkill * 0.6)  grade = 'good';
    else if (r < rankSkill)        grade = 'ok';
    else                           grade = 'fail';
    const multiplier = { perfect: 1.5, good: 1.25, ok: 1.0, fail: 0.75 }[grade];
    return { grade, multiplier, qteType: skill.qte, simulated: true };
  }

  // ── RESOLVE SKILL (uses shared SkillResolver) ──────────────────────
  // Merges base skill from DataStore with per-unit overrides and level.
  function _resolveSkill(unit, skillId) {
    const SR = window.CJS.SkillResolver;
    if (SR) return SR.resolveUnitSkill(unit, skillId);
    // Fallback if SkillResolver not loaded
    const base = DS().get('skills', skillId);
    return base ? { ...base } : null;
  }

  function _meetsWeaponRequirement(unit, skill) {
    const required = _requiredWeaponTypes(skill);
    if (!required.length) return true;
    const weaponType = _equippedWeaponType(unit) || 'unarmed';
    return required.includes(weaponType);
  }

  function _requiredWeaponTypes(skill = {}) {
    const raw = skill.requiredWeaponTypes
      || skill.requiresWeaponTypes
      || skill.requiredWeaponType
      || skill.weaponTypeRequired
      || [];
    return (Array.isArray(raw) ? raw : [raw]).map(_cleanType).filter(Boolean);
  }

  function _equippedWeaponType(unit) {
    const item = _getWeaponItem(unit);
    return item ? _weaponType(item) : '';
  }

  // ── WEAPON DATA ───────────────────────────────────────────────────
  // Get the equipped weapon's data (range, element, damageType, baseDamage).
  // Returns null if no weapon equipped.
  function _getWeaponData(unit) {
    const equipped = _getWeaponItem(unit);
    if (!equipped) return null;
    return {
      ...(equipped.weaponData || {}),
      itemId: equipped.id,
      itemName: equipped.name || equipped.id,
      weaponType: _weaponType(equipped),
      tags: equipped.tags || [],
      type: equipped.type || equipped.weaponType || ''
    };
  }

  function _getWeaponItem(unit) {
    if (!unit.equipment) return null;
    for (const iid of unit.equipment) {
      const item = DS().get('items', iid);
      if (_equipmentKind(item) === 'weapon' && item.weaponData) return { ...item, id: iid };
    }
    return null;
  }

  function _equipmentKind(item = {}) {
    const slot = item?.slot || '';
    if (item?.equipmentCategory) return item.equipmentCategory;
    if (slot === 'weapon' || slot === 'offhand') return 'weapon';
    return '';
  }

  function _weaponType(item = {}) {
    return _cleanType(item.weaponType || item.weaponData?.weaponType || item.type || _inferType(item, C()?.WEAPON_TYPES || []));
  }

  function _inferType(item, types) {
    const text = [item?.id, item?.name, item?.slot, ...(item?.tags || [])].join(' ').toLowerCase();
    const aliases = {
      blade: 'sword', longsword: 'sword', shortsword: 'sword', katana: 'sword',
      fang: 'dagger', knife: 'dagger',
      longbow: 'bow', shortbow: 'bow',
      fist: 'knuckles', claw: 'knuckles', gauntlet: 'knuckles',
      rod: 'staff', tome: 'staff',
      leather: 'light', cloak: 'light', boots: 'light', cloth: 'robe', mail: 'heavy', plate: 'heavy',
      pendant: 'amulet', necklace: 'amulet', coin: 'charm', core: 'trinket'
    };
    for (const [alias, type] of Object.entries(aliases)) {
      if ((types || []).includes(type) && text.includes(alias)) return type;
    }
    return (types || []).find((type) => text.includes(type)) || '';
  }

  function _cleanType(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_ -]+/g, '').replace(/\s+/g, '_');
  }

  // Get the effective attack range for basic attacks.
  // Basic attack range comes from the equipped weapon, or the authored unit range.
  /**
   * @param {CJSCombatUnit} unit
   * @returns {number}
   */
  function getAttackRange(unit) {
    const wd = _getWeaponData(unit);
    const baseRange = wd?.range ?? unit.basicAttackRange ?? unit.attackRange ?? 1;
    const bonus = unit.basicAttackRangeBonus ?? unit.basicRangeBonus ?? 0;
    return Math.max(1, Number(baseRange || 1) + Number(bonus || 0));
  }

  function _skillRange(unit, skill) {
    return Math.max(1, Number(skill?.range || 1) + Number(unit?.rangeBonus || 0));
  }

  function _isAoeSkill(skill) {
    return !!(skill?.aoe && skill.aoe !== 'none');
  }

  // ── QUERIES ────────────────────────────────────────────────────────
  // What actions can this unit take right now? Used by the UI to grey out buttons.
  /**
   * @param {CJSCombatUnit} unit
   * @returns {CJSAvailableActions}
   */
  function getAvailableActions(unit) {
    const ts = unit.turnState || {};
    const canAct = !SM() || SM().canAct(unit);
    const canSkill = canAct && (!SM() || !SM().canUseSkills || SM().canUseSkills(unit));

    const available = {
      move:    !ts.hasMoved && (!SM() || SM().canMove(unit)),
      attack:  !ts.mainActionUsed && (ts.apRemaining || 0) >= 1 && canAct,
      defend:  !ts.mainActionUsed && canAct,
      endTurn: true,
      skills:  [],
      items:   []
    };

    if (!ts.mainActionUsed && canAct) {
      // Build skill list (via SkillResolver — handles both bare IDs and override objects)
      const SR = window.CJS.SkillResolver;
      for (const entry of (unit.skills || [])) {
        const skillId = SR ? SR.getSkillId(entry) : (typeof entry === 'string' ? entry : entry.skillId);
        if (!skillId || skillId === 'basic_attack') continue;
        const skill = _resolveSkill(unit, skillId);
        if (!skill) continue;
        const cdRemaining = ts.cooldowns?.[skillId] || 0;
        const mpCost = Math.max(0, (skill.mp || 0) + (unit.costMod || 0));
        const apCost = skill.ap || 1;
        const weaponReady = _meetsWeaponRequirement(unit, skill);
        const ultCost = skill.isUltimate ? Number(skill.ultimateCost || 100) : 0;
        const ultReady = !skill.isUltimate || (unit.ultimateMeter || 0) >= ultCost;
        available.skills.push({
          id: skillId,
          skill,
          usable: canSkill &&
                  weaponReady &&
                  cdRemaining === 0 &&
                  (unit.currentMP || 0) >= mpCost &&
                  (ts.apRemaining || 0) >= apCost &&
                  ultReady,
          silenced: !canSkill,
          weaponReady,
          requiredWeaponTypes: _requiredWeaponTypes(skill),
          cooldown: cdRemaining,
          apCost, mpCost,
          isUltimate: !!skill.isUltimate,
          ultimateCost: ultCost,
          ultimateReady: ultReady
        });
      }

      // Consumable items — check inventory (not equipment)
      for (const itemId of (unit.inventory || [])) {
        const item = DS().get('items', itemId);
        if (!item || item.slot !== 'consumable') continue;
        available.items.push({ id: itemId, item, usable: true });
      }
    }

    return available;
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    validate, execute, getAvailableActions,
    simulateAIQTE, getAttackRange
  });
})();

