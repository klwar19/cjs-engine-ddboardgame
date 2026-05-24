// cui-log.js — Event-log rendering helpers for Campaign UI.
//
// Extracted from campaign-ui.js. Categorizes a log line by op/text, formats
// metadata (phase + time), and renders an entry row. Uses Utils.esc for
// HTML escaping; no closure state from the main IIFE.

window.CJS = window.CJS || {};
window.CJS.CampaignUIInternal = window.CJS.CampaignUIInternal || {};

window.CJS.CampaignUIInternal.Log = (function () {
  'use strict';

  function _U() { return window.CJS.CampaignUIInternal.Utils; }
  const _esc = (v) => _U().esc(v);
  const _escAttr = (v) => _U().escAttr(v);

  function logKind(line = {}) {
    const op = String(line.op || '').toLowerCase();
    const text = String(line.text || '').toLowerCase();
    const starts = (value) => text.startsWith(value);

    if (op.includes('party') || / hp\b| mp\b|joined the roster|left the roster|availability|learned|forgot|gained status|active party|bench/.test(text)) return { key: 'party', label: 'Party' };
    if (op.includes('battle') || text.includes('battle') || text.includes('combat')) return { key: 'battle', label: 'Battle' };
    if (op.includes('event') || starts('event ') || starts('plot seed')) return { key: 'event', label: 'Event' };
    if (op.includes('quest') || starts('quest ')) return { key: 'quest', label: 'Quest' };
    if (op.includes('oracle') || text.includes('oracle')) return { key: 'oracle', label: 'Oracle' };
    if (op.includes('scenario') || starts('scenario ') || starts('moved ') || starts('move blocked') || text.includes('danger')) return { key: 'run', label: 'Run' };
    if (op.includes('shop') || op.includes('craft') || op.includes('farm') || starts('added ') || starts('removed ') || starts('gained ') || starts('spent ')) return { key: 'loot', label: 'Loot' };
    if (op.includes('hub') || starts('rumor ') || starts('npc ') || starts('bond ') || starts('clock ') || starts('memory shard')) return { key: 'hub', label: 'Hub' };
    if (starts('phase ')) return { key: 'phase', label: 'Phase' };
    return { key: 'system', label: 'Log' };
  }

  function formatLogTime(value, compact = false) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const options = compact
      ? { hour: '2-digit', minute: '2-digit' }
      : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return date.toLocaleString([], options);
  }

  function logMeta(line = {}, compact = false) {
    const phase = line.phase ? `Phase ${line.phase}` : 'Phase ?';
    const time = formatLogTime(line.at, compact);
    return [phase, time].filter(Boolean).join(' | ');
  }

  function renderLogEntry(line, options = {}) {
    const kind = logKind(line);
    return `
      <div class="campaign-log-line campaign-log-${_escAttr(kind.key)}">
        <div class="campaign-log-main">
          <span class="campaign-log-type">${_esc(kind.label)}</span>
          <span>${_esc(line.text || '')}</span>
        </div>
        <small>${_esc(logMeta(line, options.compact))}</small>
      </div>
    `;
  }

  return Object.freeze({
    logKind,
    formatLogTime,
    logMeta,
    renderLogEntry
  });
})();
