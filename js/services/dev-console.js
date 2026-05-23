// dev-console.js
// In-app developer console. Toggle with backtick (`) on any CJS page.
// Lets developers inspect live state, run quick expressions against the
// CJS namespace, and trigger common dev actions without reloading.
//
// Tabs:
//   Eval     — JS REPL bound to `window.CJS`. Each call is scoped to the
//              global namespace and prints the return value (JSON.stringified
//              for objects).
//   State    — Live JSON dump of CampaignState + CombatManager state, updates
//              when either store mutates.
//   Data     — DataStore inspector: type counts, last-changed entries.
//   Validate — Runs ContentValidator and shows results.
//
// Reads:  CJS.DataStore, CJS.CampaignState, CJS.CombatManager
// Used by: any HTML page that imports it via the entry file.

window.CJS = window.CJS || {};

window.CJS.DevConsole = (() => {
  'use strict';

  let _root = null;
  let _activeTab = 'eval';
  let _bodyEl = null;
  let _tabsEl = null;
  let _inputEl = null;
  let _historyIdx = -1;
  const _history = [];
  let _unsubCM = null;
  let _unsubCS = null;
  let _unsubDS = null;
  let _enabled = false;
  let _toggleBound = false;

  function init() {
    if (_root) return;
    if (typeof document === 'undefined' || !document.body) {
      document.addEventListener?.('DOMContentLoaded', init, { once: true });
      return;
    }
    _build();
    _bindToggle();
  }

  function _bindToggle() {
    if (_toggleBound) return;
    document.addEventListener('keydown', (ev) => {
      // Backtick (and ~) toggles. Ignore when typing in an input.
      if (ev.key !== '`' && ev.key !== '~') return;
      const tag = (ev.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || ev.target?.isContentEditable) return;
      ev.preventDefault();
      toggle();
    });
    _toggleBound = true;
  }

  function toggle() {
    _enabled = !_enabled;
    if (!_root) _build();
    if (_root) _root.hidden = !_enabled;
    if (_enabled) {
      _attachSubscriptions();
      _refreshActiveTab();
    } else {
      _detachSubscriptions();
    }
  }

  function _build() {
    _root = document.createElement('div');
    _root.className = 'cjs-debug-console';
    _root.hidden = true;
    _root.innerHTML = `
      <div class="cjs-debug-console-header">
        <span>⌨ CJS Debug Console</span>
        <span style="opacity:0.6;font-size:11px">backtick toggles · ESC closes</span>
      </div>
      <div class="cjs-debug-console-tabs" role="tablist">
        <button type="button" class="cjs-debug-tab is-active" data-tab="eval">Eval</button>
        <button type="button" class="cjs-debug-tab" data-tab="state">State</button>
        <button type="button" class="cjs-debug-tab" data-tab="data">Data</button>
        <button type="button" class="cjs-debug-tab" data-tab="events">Events</button>
        <button type="button" class="cjs-debug-tab" data-tab="validate">Validate</button>
      </div>
      <div class="cjs-debug-console-body" role="tabpanel"></div>
      <div class="cjs-debug-console-input">
        <input type="text" placeholder="window.CJS.CombatManager.getState() — Enter to run" autocomplete="off" spellcheck="false">
        <button type="button" class="cjs-debug-run">Run</button>
      </div>
    `;
    document.body.appendChild(_root);

    _bodyEl = _root.querySelector('.cjs-debug-console-body');
    _tabsEl = _root.querySelector('.cjs-debug-console-tabs');
    _inputEl = _root.querySelector('input');

    _tabsEl.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.cjs-debug-tab');
      if (!btn) return;
      const tab = btn.dataset.tab;
      if (tab) _switchTab(tab);
    });

    _inputEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        _runInput(_inputEl.value);
        _inputEl.value = '';
      } else if (ev.key === 'ArrowUp' && _history.length) {
        _historyIdx = Math.min(_history.length - 1, _historyIdx + 1);
        _inputEl.value = _history[_history.length - 1 - _historyIdx] || '';
      } else if (ev.key === 'ArrowDown') {
        _historyIdx = Math.max(-1, _historyIdx - 1);
        _inputEl.value = _historyIdx < 0 ? '' : (_history[_history.length - 1 - _historyIdx] || '');
      } else if (ev.key === 'Escape') {
        toggle();
      }
    });

    _root.querySelector('.cjs-debug-run').addEventListener('click', () => {
      _runInput(_inputEl.value);
      _inputEl.value = '';
    });

    _renderEval('Type any JavaScript and press Enter. Examples:\n' +
      '  CJS.CombatManager.getState()\n' +
      '  CJS.CampaignWorldEvents.start("wev_double_materials")\n' +
      '  CJS.FishingMinigame.open({ biome: "lake" })\n');
  }

  function _switchTab(tab) {
    _activeTab = tab;
    _tabsEl.querySelectorAll('.cjs-debug-tab').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.tab === tab);
    });
    _refreshActiveTab();
  }

  function _refreshActiveTab() {
    if (!_bodyEl) return;
    switch (_activeTab) {
      case 'eval':   /* eval keeps existing body */ break;
      case 'state':  _renderState(); break;
      case 'data':   _renderData(); break;
      case 'events': _renderEvents(); break;
      case 'validate': _renderValidate(); break;
    }
  }

  function _renderEval(text) {
    if (!_bodyEl) return;
    _bodyEl.textContent = text || '';
  }

  function _renderState() {
    const cs = window.CJS.CampaignState?.getState?.();
    const cm = window.CJS.CombatManager?.getStateSnapshot?.();
    const slim = {
      campaign: cs ? _slimCampaignState(cs) : null,
      combat: cm ? _slimCombatState(cm) : null
    };
    _bodyEl.textContent = JSON.stringify(slim, _replacer, 2);
  }

  function _slimCampaignState(state) {
    return {
      phase: state.phase,
      currentWorld: state.currentWorld,
      partySize: Object.keys(state.party || {}).length,
      currencies: state.currencies,
      activeScenarioRun: state.activeScenarioRun ? {
        scenarioId: state.activeScenarioRun.scenarioId,
        travelMode: state.activeScenarioRun.travelMode,
        currentNode: state.activeScenarioRun.currentNode,
        objective: state.activeScenarioRun.objectiveState?.label
      } : null,
      worldEvents: state.worldEvents,
      fishingCollection: state.fishingCollection
    };
  }

  function _slimCombatState(state) {
    return {
      phase: state.phase,
      round: state.roundNumber,
      currentUnit: state.currentUnitId,
      winner: state.winner,
      environment: state.environment,
      objective: state.objective ? {
        kind: state.objective.kind,
        captureProgress: state.objective.captureProgress,
        targetKilled: state.objective.targetKilled
      } : null,
      unitCount: Object.keys(state.units || {}).length
    };
  }

  function _renderData() {
    const DS = window.CJS.DataStore;
    if (!DS) { _bodyEl.textContent = 'DataStore not loaded.'; return; }
    const counts = {};
    const types = ['effects','skills','items','food','materials','crafting','crops','shops','zones',
      'stories','campaigns','scenarios','scenarioMaps','travelMaps','campaignEvents','campaignQuests',
      'characters','monsters','encounters','statuses','weathers','passives','jobs','personas',
      'worldEvents','fishCatalog','battleSets','questChains'];
    for (const t of types) {
      const arr = DS.getAllAsArray?.(t) || [];
      counts[t] = arr.length;
    }
    _bodyEl.textContent = 'DataStore content counts:\n\n' +
      Object.entries(counts).map(([k, v]) => `  ${k.padEnd(20, ' ')} ${v}`).join('\n');
  }

  function _renderEvents() {
    const WE = window.CJS.CampaignWorldEvents;
    if (!WE) { _bodyEl.textContent = 'CampaignWorldEvents not loaded.'; return; }
    const active = WE.getActive() || [];
    const catalog = WE.getCatalog() || [];
    const history = WE.getHistory() || [];
    const lines = [];
    lines.push('ACTIVE EVENTS:');
    if (active.length) {
      for (const ev of active) lines.push(`  ${ev.icon || '✨'} ${ev.name} — ${ev.remainingPhases} phases left`);
    } else lines.push('  (none)');
    lines.push('\nCATALOG (clickable):');
    for (const def of catalog) {
      lines.push(`  ${def.icon || '✨'} ${def.name} [${def.id}] — ${def.summary || ''}`);
    }
    lines.push('\nHISTORY:');
    for (const h of history.slice(0, 10)) {
      lines.push(`  ${h.icon || ''} ${h.name} (${h.reason}, ended phase ${h.endedAtPhase})`);
    }
    lines.push('\nUse Eval tab: CJS.CampaignWorldEvents.start("wev_double_materials")');
    _bodyEl.textContent = lines.join('\n');
  }

  function _renderValidate() {
    const CV = window.CJS.ContentValidator;
    if (!CV?.run) { _bodyEl.textContent = 'ContentValidator not available.'; return; }
    const report = CV.run();
    const lines = [];
    lines.push(`Validation: ${report.errors.length} errors, ${report.warnings.length} warnings`);
    lines.push('');
    if (report.errors.length) {
      lines.push('ERRORS:');
      for (const e of report.errors.slice(0, 30)) lines.push(`  ❌ [${e.category}/${e.id}] ${e.message}`);
      if (report.errors.length > 30) lines.push(`  …and ${report.errors.length - 30} more`);
      lines.push('');
    }
    if (report.warnings.length) {
      lines.push('WARNINGS:');
      for (const w of report.warnings.slice(0, 30)) lines.push(`  ⚠ [${w.category}/${w.id}] ${w.message}`);
      if (report.warnings.length > 30) lines.push(`  …and ${report.warnings.length - 30} more`);
    }
    if (!report.errors.length && !report.warnings.length) lines.push('✅ Content looks healthy.');
    _bodyEl.textContent = lines.join('\n');
  }

  function _runInput(raw) {
    const text = String(raw || '').trim();
    if (!text) return;
    _history.push(text);
    if (_history.length > 50) _history.shift();
    _historyIdx = -1;
    _switchTab('eval');
    try {
      // Evaluate in the global scope so the user can reach window.CJS.*.
      // eslint-disable-next-line no-new-func
      const result = (new Function(`with (this) { return (${text}); }`)).call(window);
      let output;
      if (result && typeof result.then === 'function') {
        output = '⏳ awaiting Promise…';
        Promise.resolve(result)
          .then((value) => { _appendEval(`✓ ${_format(value)}`); })
          .catch((err) => { _appendEval(`✗ ${err?.message || err}`); });
      } else {
        output = _format(result);
      }
      _appendEval(`> ${text}\n${output}\n`);
    } catch (err) {
      _appendEval(`> ${text}\n✗ ${err?.message || err}\n`);
    }
  }

  function _appendEval(text) {
    if (!_bodyEl) return;
    _bodyEl.textContent = `${text}\n${_bodyEl.textContent || ''}`.slice(0, 12000);
  }

  function _format(value) {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
    if (typeof value === 'object') {
      try { return JSON.stringify(value, _replacer, 2); }
      catch (e) { return `[object: ${e.message}]`; }
    }
    return String(value);
  }

  function _replacer(key, value) {
    if (key === 'subscribers' || key === '_listeners') return '[…]';
    if (Array.isArray(value) && value.length > 50) {
      return [...value.slice(0, 50), `…(${value.length - 50} more)`];
    }
    return value;
  }

  function _attachSubscriptions() {
    const CM = window.CJS.CombatManager;
    const CS = window.CJS.CampaignState;
    const DS = window.CJS.DataStore;
    try { if (CM?.subscribe) _unsubCM = CM.subscribe(() => _activeTab === 'state' && _refreshActiveTab()); } catch (e) {}
    try { if (CS?.subscribe) _unsubCS = CS.subscribe(() => _activeTab === 'state' && _refreshActiveTab()); } catch (e) {}
    try {
      if (DS?.subscribe) _unsubDS = DS.subscribe(() => {
        if (_activeTab === 'data') _refreshActiveTab();
      });
    } catch (e) {}
  }

  function _detachSubscriptions() {
    if (_unsubCM) { try { _unsubCM(); } catch (e) {} _unsubCM = null; }
    if (_unsubCS) { try { _unsubCS(); } catch (e) {} _unsubCS = null; }
    if (_unsubDS) { try { _unsubDS(); } catch (e) {} _unsubDS = null; }
  }

  return Object.freeze({ init, toggle });
})();

// Auto-init: bind the keyboard shortcut. The console itself stays hidden
// until the developer toggles it.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.CJS.DevConsole.init());
  } else {
    window.CJS.DevConsole.init();
  }
}
