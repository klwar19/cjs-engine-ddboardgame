// narrator-engine.js
// The CJS Commentary Engine. Subscribes to CombatLog, feeds events
// through NarratorState (drama trackers), then picks the best fragment
// from NarratorData for each narrative layer and stitches them together.
//
// Output: a narration string per combat event, with variable substitution.
// Avoids repeating the same fragment within 5 turns.
//
// Reads: NarratorState, NarratorData, CombatLog
// Used by: combat-ui.js (renders narration in the battle log panel)
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.NarratorEngine = (() => {
  'use strict';

  const NS   = () => window.CJS.NarratorState;
  const ND   = () => window.CJS.NarratorData;
  const Log  = () => window.CJS.CombatLog;

  // ── STATE ──────────────────────────────────────────────────────────
  let _recentlyUsed = [];   // [{ fragmentId, turn }] — dedup window
  const DEDUP_WINDOW = 5;    // don't repeat same fragment within N turns
  let _currentTurn = 0;
  let _subscribers = [];     // called with (narration, logEntry)
  let _unsubLog = null;      // CombatLog unsubscribe handle

  // Only narrate these event types (skip bookkeeping noise)
  const NARRATE_TYPES = new Set([
    'hit', 'miss', 'dodge', 'kill', 'heal',
    'status_applied', 'qte_result', 'skill_used',
    'knockback', 'terrain_effect',
    'battle_start', 'battle_end'
  ]);

  // ── INIT / CONNECT ────────────────────────────────────────────────
  function init() {
    NS().reset();
    _recentlyUsed = [];
    _currentTurn = 0;

    // Subscribe to combat log to auto-narrate events
    if (_unsubLog) _unsubLog();
    _unsubLog = Log().subscribe(_onLogEntry);
  }

  function destroy() {
    if (_unsubLog) { _unsubLog(); _unsubLog = null; }
    _subscribers = [];
  }

  // ── CORE: PROCESS LOG ENTRY ───────────────────────────────────────
  function _onLogEntry(entry) {
    if (entry.type === 'turn_start') {
      _currentTurn = entry.data?.turn || _currentTurn + 1;
    }

    // Only narrate interesting event types
    if (!NARRATE_TYPES.has(entry.type)) return;

    // Pass through drama trackers → get extra tags
    const extraTags = NS().processEntry(entry);
    const allTags = new Set([...(entry.tags || []), ...extraTags]);

    // If narrator data isn't loaded, skip fragment picking
    if (!ND().isLoaded()) return;

    // Pick fragments across all layers
    const narration = _pickNarration(allTags, entry);

    if (narration) {
      // Substitute variables
      const final = _substitute(narration, entry);

      // Emit to subscribers
      for (const cb of _subscribers) {
        try { cb(final, entry); } catch (e) { console.error('NarratorEngine subscriber error:', e); }
      }
    }
  }

  // ── FRAGMENT PICKER ───────────────────────────────────────────────
  function _pickNarration(tagSet, entry) {
    const layers = ND().LAYERS; // ['action', 'damage', 'context', 'cjs_editorial']
    const parts = {};

    for (const layer of layers) {
      const matches = ND().findMatches(layer, tagSet);

      // Filter out recently used
      const available = matches.filter(m =>
        !_recentlyUsed.some(r =>
          r.fragmentId === m.fragment.id &&
          (_currentTurn - r.turn) < DEDUP_WINDOW
        )
      );

      if (available.length === 0) {
        // Fall back to any match if dedup blocks everything
        if (matches.length > 0) {
          parts[layer] = _pickFromTop(matches);
        }
        continue;
      }

      parts[layer] = _pickFromTop(available);
    }

    // Record used fragments
    for (const layer of layers) {
      if (parts[layer]) {
        _recentlyUsed.push({ fragmentId: parts[layer].id, turn: _currentTurn });
      }
    }

    // Trim dedup history
    _recentlyUsed = _recentlyUsed.filter(r =>
      (_currentTurn - r.turn) < DEDUP_WINDOW + 2
    );

    // Assemble: not all layers need to produce output
    const textParts = [];
    if (parts.action)        textParts.push(parts.action.text);
    if (parts.damage)        textParts.push(parts.damage.text);
    if (parts.context)       textParts.push(parts.context.text);

    const mainText = textParts.join(' ');

    // CJS editorial goes on its own line if present
    if (parts.cjs_editorial) {
      return mainText
        ? mainText + '\n' + parts.cjs_editorial.text
        : parts.cjs_editorial.text;
    }

    return mainText || null;
  }

  // Pick from top-scored matches with slight randomization among ties
  function _pickFromTop(scored) {
    if (scored.length === 0) return null;
    const topScore = scored[0].score;
    // Gather all within 2 points of top (near-ties)
    const nearTop = scored.filter(m => m.score >= topScore - 2);
    const pick = nearTop[Math.floor(Math.random() * nearTop.length)];
    return pick.fragment;
  }

  // ── VARIABLE SUBSTITUTION ─────────────────────────────────────────
  function _substitute(text, entry) {
    const actor = entry.actor || {};
    const target = entry.target || {};
    const data = entry.data || {};

    const vars = {
      '{actor.name}':   actor.name || actor.baseId || 'Someone',
      '{target.name}':  target.name || target.baseId || 'Something',
      '{actor.id}':     actor.baseId || actor.instanceId || '???',
      '{target.id}':    target.baseId || target.instanceId || '???',
      '{damage}':       data.damage ?? data.amount ?? '?',
      '{amount}':       data.amount ?? data.damage ?? '?',
      '{element}':      data.element || 'Physical',
      '{skill}':        data.skill || 'attack',
      '{skill.name}':   _skillName(data.skill),
      '{status}':       data.statusId || '???',
      '{qte_grade}':    data.grade || '???',
      '{qte_type}':     data.qteType || '???',
      '{hp_pct}':       actor.maxHP ? Math.round((actor.currentHP / actor.maxHP) * 100) + '%' : '?%',
      '{target_hp_pct}': target.maxHP ? Math.round((target.currentHP / target.maxHP) * 100) + '%' : '?%',
      '{streak}':       NS().getStreak(),
      '{peri_meter}':   NS().getPeriEntertainment(),
      '{overkill}':     data.overkill || 0,
      '{multiplier}':   data.multiplier || 1
    };

    let result = text;
    for (const [key, val] of Object.entries(vars)) {
      result = result.replaceAll(key, String(val));
    }
    return result;
  }

  function _skillName(skillId) {
    if (!skillId) return 'basic attack';
    // Try to look up display name from DataStore
    try {
      const DS = window.CJS.DataStore;
      if (DS) {
        const skill = DS.get('skills', skillId);
        if (skill?.name) return skill.name;
      }
    } catch (_) {}
    // Fallback: humanize the ID
    return skillId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // ── MANUAL NARRATE (for testing or custom events) ─────────────────
  function narrate(tagArray) {
    if (!ND().isLoaded()) return null;
    const tagSet = new Set(tagArray);
    const text = _pickNarration(tagSet, {});
    return text ? _substitute(text, {}) : null;
  }

  // ── SUBSCRIPTIONS ─────────────────────────────────────────────────
  function subscribe(fn) {
    _subscribers.push(fn);
    return () => {
      const i = _subscribers.indexOf(fn);
      if (i >= 0) _subscribers.splice(i, 1);
    };
  }

  // ── PUBLIC API ────────────────────────────────────────────────────
  return Object.freeze({
    init,
    destroy,
    narrate,
    subscribe
  });
})();
