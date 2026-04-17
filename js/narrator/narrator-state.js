// narrator-state.js
// State machines that track combat drama and produce tags for the
// narrator-engine fragment picker. These run silently — they consume
// CombatLog entries and add/remove contextual tags to each event.
//
// Trackers:
//   Momentum   — consecutive hits → streak tags
//   Rivalry    — who-hit-whom → revenge_kill, nemesis
//   Embarrass  — Bin's misses → bin_whiffing, bin_embarrassing
//   Peri Meter — entertainment value → peri_bored / peri_excited / peri_ecstatic
//   HP Drama   — low-HP situations → dire_straits, almost_dead, comeback
//
// Reads: CombatLog entries
// Used by: narrator-engine.js (calls getTags() before picking fragments)
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.NarratorState = (() => {
  'use strict';

  // ── TRACKER STATE ──────────────────────────────────────────────────
  let _momentum = {
    lastActorId: null,
    consecutiveHits: 0
  };

  let _rivalry = {};
  // { "actorId→targetId": { hitsGiven: N, hitsTaken: N } }

  let _embarrassment = {
    binMisses: 0,        // consecutive misses by any unit with baseId 'bin'
    binId: null           // resolved on first event
  };

  let _peri = {
    entertainment: 50     // 0–100 scale
  };

  let _hpDrama = {};
  // { unitId: { wasAbove20: bool } } — track threshold crossings

  let _recentKills = [];
  // [{ killerId, victimId, turn }] — for revenge detection

  let _turnCounter = 0;

  // ── RESET ──────────────────────────────────────────────────────────
  function reset() {
    _momentum = { lastActorId: null, consecutiveHits: 0 };
    _rivalry = {};
    _embarrassment = { binMisses: 0, binId: null };
    _peri = { entertainment: 50 };
    _hpDrama = {};
    _recentKills = [];
    _turnCounter = 0;
  }

  // ── PROCESS A COMBAT LOG ENTRY ────────────────────────────────────
  // Called by narrator-engine for every log entry. Mutates internal
  // state and returns extra tags to merge into the entry's tag set.
  function processEntry(entry) {
    const extra = [];

    // Resolve Bin's instance ID from first entry that has actor info
    if (!_embarrassment.binId && entry.actor) {
      const id = _actorId(entry.actor);
      const baseId = entry.actor?.baseId || id;
      if (baseId === 'bin' || (id && id.startsWith('bin'))) {
        _embarrassment.binId = id;
      }
    }

    // Track turn transitions
    if (entry.type === 'turn_start') {
      _turnCounter++;
    }

    switch (entry.type) {
      case 'hit':
        extra.push(..._onHit(entry));
        break;
      case 'miss':
      case 'dodge':
        extra.push(..._onMiss(entry));
        break;
      case 'kill':
        extra.push(..._onKill(entry));
        break;
      case 'heal':
        extra.push(..._onHeal(entry));
        break;
      case 'status_applied':
        extra.push(..._onStatusApplied(entry));
        break;
      case 'qte_result':
        extra.push(..._onQTE(entry));
        break;
      case 'skill_used':
        extra.push(..._onSkillUsed(entry));
        break;
      default:
        break;
    }

    // Always compute HP drama tags from current unit states
    extra.push(..._computeHPDrama(entry));

    // Peri mood tag
    extra.push(..._periMoodTags());

    return extra;
  }

  // ── MOMENTUM TRACKER ──────────────────────────────────────────────
  function _onHit(entry) {
    const tags = [];
    const actorId = _actorId(entry.actor);

    // Streak tracking (same actor consecutive hits)
    if (actorId === _momentum.lastActorId) {
      _momentum.consecutiveHits++;
    } else {
      _momentum.lastActorId = actorId;
      _momentum.consecutiveHits = 1;
    }

    if (_momentum.consecutiveHits >= 3) {
      tags.push(`streak_${_momentum.consecutiveHits}`);
    }
    if (_momentum.consecutiveHits >= 5) {
      tags.push('hot_streak');
    }

    // Rivalry: track hits between pairs
    const targetId = _actorId(entry.target);
    if (actorId && targetId) {
      const key = `${actorId}→${targetId}`;
      const rev = `${targetId}→${actorId}`;
      _rivalry[key] = _rivalry[key] || { hitsGiven: 0, hitsTaken: 0 };
      _rivalry[key].hitsGiven++;
      // Mirror: the target has taken a hit from this actor
      _rivalry[rev] = _rivalry[rev] || { hitsGiven: 0, hitsTaken: 0 };
      _rivalry[rev].hitsTaken++;

      // Nemesis: enemy has hit a player unit 3+ times
      if (_rivalry[rev].hitsTaken >= 3) {
        tags.push('nemesis');
      }
    }

    // Element exploit detection
    if (entry.tags?.includes('element_exploit') || (entry.data?.breakdown?.elementMult > 1)) {
      tags.push('element_exploit');
    }

    // Big/massive hit already tagged by combat-log, but boost peri
    if (entry.tags?.includes('big_hit')) {
      _peri.entertainment = Math.min(100, _peri.entertainment + 8);
    }
    if (entry.tags?.includes('massive_hit')) {
      _peri.entertainment = Math.min(100, _peri.entertainment + 12);
    }
    if (entry.tags?.includes('crit')) {
      _peri.entertainment = Math.min(100, _peri.entertainment + 6);
      tags.push('crit_hit');
    }

    // Reset Bin's embarrassment on hit
    if (actorId === _embarrassment.binId) {
      if (_embarrassment.binMisses >= 2) {
        tags.push('bin_redemption');
      }
      _embarrassment.binMisses = 0;
    }

    // Boring hit: no special conditions → peri gets bored
    const interesting = entry.tags?.some(t =>
      t === 'crit' || t === 'big_hit' || t === 'massive_hit' ||
      t === 'element_exploit' || t.startsWith('streak_')
    );
    if (!interesting) {
      _peri.entertainment = Math.max(0, _peri.entertainment - 5);
    } else {
      _peri.entertainment = Math.min(100, _peri.entertainment + 5);
    }

    return tags;
  }

  // ── MISS TRACKER ──────────────────────────────────────────────────
  function _onMiss(entry) {
    const tags = [];
    const actorId = _actorId(entry.actor);

    // Break streak
    if (actorId === _momentum.lastActorId && _momentum.consecutiveHits >= 3) {
      tags.push('streak_broken');
    }
    _momentum.lastActorId = null;
    _momentum.consecutiveHits = 0;

    // Bin embarrassment
    if (actorId === _embarrassment.binId) {
      _embarrassment.binMisses++;
      if (_embarrassment.binMisses === 2) tags.push('bin_whiffing');
      if (_embarrassment.binMisses >= 3)  tags.push('bin_embarrassing');
    }

    // Peri bored by misses
    _peri.entertainment = Math.max(0, _peri.entertainment - 10);

    return tags;
  }

  // ── KILL TRACKER ──────────────────────────────────────────────────
  function _onKill(entry) {
    const tags = [];
    const killerId = _actorId(entry.actor);
    const victimId = _actorId(entry.target);

    _recentKills.push({ killerId, victimId, turn: _turnCounter });

    // Revenge kill: victim had hit killer 3+ times
    const key = `${victimId}→${killerId}`;
    if (_rivalry[key] && _rivalry[key].hitsGiven >= 3) {
      tags.push('revenge_kill');
      _peri.entertainment = Math.min(100, _peri.entertainment + 15);
    }

    // Comeback kill: killer is below 30% HP (already tagged by combat-log)
    if (entry.tags?.includes('comeback')) {
      _peri.entertainment = Math.min(100, _peri.entertainment + 20);
    }

    // General kill excitement
    _peri.entertainment = Math.min(100, _peri.entertainment + 10);

    // First blood
    if (_recentKills.length === 1) {
      tags.push('first_blood');
      _peri.entertainment = Math.min(100, _peri.entertainment + 5);
    }

    return tags;
  }

  // ── HEAL TRACKER ──────────────────────────────────────────────────
  function _onHeal(entry) {
    const tags = [];
    const targetId = _actorId(entry.target);
    const target = entry.target;
    // Clutch heal: target was below 20% before heal
    if (target && target.maxHP && target.currentHP) {
      const hpBeforeHeal = target.currentHP - (entry.data?.amount || 0);
      if (hpBeforeHeal / target.maxHP < 0.2) {
        tags.push('clutch_heal');
        _peri.entertainment = Math.min(100, _peri.entertainment + 8);
      }
    }
    return tags;
  }

  // ── STATUS TRACKER ────────────────────────────────────────────────
  function _onStatusApplied(entry) {
    const tags = [];
    const statusId = entry.data?.statusId;
    if (statusId) {
      // Crowd control applied to a player = drama
      const ccStatuses = ['stun', 'freeze', 'sleep', 'petrify', 'charm', 'confuse', 'silence', 'fear'];
      if (ccStatuses.includes(statusId) && entry.target?.team === 'player') {
        tags.push('player_cc');
        _peri.entertainment = Math.min(100, _peri.entertainment + 5);
      }
    }
    return tags;
  }

  // ── QTE TRACKER ───────────────────────────────────────────────────
  function _onQTE(entry) {
    const tags = [];
    const grade = entry.data?.grade;
    if (grade === 'perfect') {
      _peri.entertainment = Math.min(100, _peri.entertainment + 15);
      tags.push('qte_nailed');
    } else if (grade === 'fail') {
      _peri.entertainment = Math.max(0, _peri.entertainment - 15);
      tags.push('qte_botched');
    }
    return tags;
  }

  // ── SKILL USAGE ───────────────────────────────────────────────────
  function _onSkillUsed(entry) {
    const tags = [];
    // Just mild peri interest for any skill use
    _peri.entertainment = Math.min(100, _peri.entertainment + 2);
    return tags;
  }

  // ── HP DRAMA ──────────────────────────────────────────────────────
  function _computeHPDrama(entry) {
    const tags = [];

    // Check all units mentioned in the entry
    const units = [entry.actor, entry.target].filter(u => u && u.currentHP !== undefined);

    for (const u of units) {
      const id = _actorId(u);
      if (!id) continue;
      const ratio = u.currentHP / (u.maxHP || 1);

      if (u.team === 'player' && ratio < 0.2 && u.currentHP > 0) {
        tags.push('dire_straits');
      }
      if (u.team === 'enemy' && ratio < 0.2 && u.currentHP > 0) {
        tags.push('almost_dead');
      }
    }

    return tags;
  }

  // ── PERI MOOD ─────────────────────────────────────────────────────
  function _periMoodTags() {
    const tags = [];
    if (_peri.entertainment < 30) {
      tags.push('peri_bored');
    } else if (_peri.entertainment >= 90) {
      tags.push('peri_ecstatic');
    } else if (_peri.entertainment >= 70) {
      tags.push('peri_excited');
    }
    return tags;
  }

  // ── HELPERS ───────────────────────────────────────────────────────
  function _actorId(unitOrId) {
    if (!unitOrId) return null;
    if (typeof unitOrId === 'string') return unitOrId;
    return unitOrId.baseId || unitOrId.instanceId || unitOrId.id || null;
  }

  // ── QUERIES (for debug / UI) ──────────────────────────────────────
  function getState() {
    return {
      momentum: { ..._momentum },
      embarrassment: { ..._embarrassment },
      peri: { ..._peri },
      killCount: _recentKills.length,
      turnCount: _turnCounter
    };
  }

  function getPeriEntertainment() { return _peri.entertainment; }
  function getStreak()           { return _momentum.consecutiveHits; }
  function getBinMisses()        { return _embarrassment.binMisses; }

  // ── PUBLIC API ────────────────────────────────────────────────────
  return Object.freeze({
    reset,
    processEntry,
    getState,
    getPeriEntertainment,
    getStreak,
    getBinMisses
  });
})();
