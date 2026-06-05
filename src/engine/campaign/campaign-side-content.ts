// campaign-side-content.ts — Tier 3 TS port of js/campaign/campaign-side-content.js
// (engine cluster: campaign). Shared side-content card helpers (risk class,
// normalize/save/reject/archive/promote/review, markdown export+copy, pack
// import); mutations route through CampaignOps. Reads window.CJS.* lazily.
// Exports `CampaignSideContent` and installs window.CJS.CampaignSideContent.

window.CJS = window.CJS || {};

export const CampaignSideContent = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const Ops = () => window.CJS.CampaignOps;

  const RISK_ORDER = { green: 0, yellow: 1, red: 2 };

  function risk(value) {
    const raw = String(value || 'green').toLowerCase();
    if (raw.includes('red')) return 'red';
    if (raw.includes('yellow')) return 'yellow';
    return 'green';
  }

  function riskClass(value) {
    return `risk-${risk(value)}`;
  }

  function isRiskAtLeast(value, threshold) {
    return RISK_ORDER[risk(value)] >= RISK_ORDER[risk(threshold)];
  }

  function normalizeCard(card, defaults: any = {}) {
    const next = CS().clone({
      ...defaults,
      ...(card || {})
    });
    next.id = next.id || `idea_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    next.type = next.type || defaults.type || 'side_idea';
    next.title = next.title || next.name || next.id;
    next.canonRisk = risk(next.canonRisk || defaults.canonRisk);
    next.tags = Array.isArray(next.tags) ? next.tags : [];
    next.source = next.source || defaults.source || 'side_content';
    next.createdAtPhase = next.createdAtPhase || CS().getState()?.phase?.number || 1;
    return next;
  }

  function saveCard(card, options: any = {}) {
    const normalized = normalizeCard(card, options.defaults || {});
    Ops().apply({
      op: 'side_idea_save',
      contentCard: normalized,
      status: options.status || normalized.status || 'saved'
    }, { source: options.source || 'side_content' });
    return normalized;
  }

  function rejectCard(contentId, reason = '') {
    Ops().apply({ op: 'side_idea_reject', contentId, reason }, { source: 'side_content' });
  }

  function archiveCard(contentId) {
    Ops().apply({ op: 'side_idea_archive', contentId }, { source: 'side_content' });
  }

  function promoteCard(contentId, targetType, approved = false) {
    Ops().apply({ op: 'side_idea_promote', contentId, targetType, approved }, { source: 'side_content' });
  }

  function reviewCard(card, reason) {
    const normalized = normalizeCard(card);
    saveCard(normalized, { status: normalized.status || 'idea' });
    Ops().apply({
      op: 'review_queue_add',
      contentId: normalized.id,
      canonRisk: normalized.canonRisk,
      reason: reason || normalized.reviewReason || 'Canon-risk content needs GM review.'
    }, { source: 'side_content' });
    return normalized;
  }

  function cardToMarkdown(card) {
    const normalized = normalizeCard(card);
    const lines = [
      `## ${normalized.title}`,
      '',
      `Type: ${normalized.type}`,
      `Canon Risk: ${normalized.canonRisk}`,
      normalized.summary ? `Summary: ${normalized.summary}` : '',
      normalized.prompt ? `Prompt: ${normalized.prompt}` : '',
      normalized.suggestedUse ? `Suggested Use: ${normalized.suggestedUse}` : '',
      normalized.objective ? `Objective: ${normalized.objective}` : '',
      normalized.gimmick ? `Gimmick: ${normalized.gimmick}` : ''
    ].filter(Boolean);

    if (normalized.gmKeywords?.length) lines.push('', `Keywords: ${normalized.gmKeywords.join(', ')}`);
    if (normalized.steps?.length) {
      lines.push('', 'Steps:');
      for (const step of normalized.steps) lines.push(`- ${step.label || step.id}: ${step.text || ''}`);
    }
    if (normalized.nodes?.length) {
      lines.push('', 'Nodes:');
      for (const node of normalized.nodes) lines.push(`- ${node.name || node.id}: ${node.role || node.notes || ''}`);
    }
    if (normalized.rewardOps?.length || normalized.suggestedOps?.length) {
      lines.push('', 'Ops:', '```json', JSON.stringify(normalized.rewardOps || normalized.suggestedOps, null, 2), '```');
    }
    return `${lines.join('\n')}\n`;
  }

  function copyMarkdown(card) {
    const text = cardToMarkdown(card);
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const UI = window.CJS.UI;
    if (UI?.openModal) {
      const body = document.createElement('div');
      const hint = document.createElement('div');
      hint.className = 'campaign-muted';
      hint.style.marginBottom = '8px';
      hint.textContent = 'Clipboard unavailable — copy the text manually:';
      const ta = document.createElement('textarea');
      ta.readOnly = true;
      ta.style.width = '100%';
      ta.style.minHeight = '220px';
      ta.style.fontFamily = 'monospace';
      ta.value = text;
      body.appendChild(hint);
      body.appendChild(ta);
      const overlay = UI.openModal({ title: 'Copy Markdown', content: body, width: '600px' });
      setTimeout(() => { ta.focus(); ta.select(); }, 30);
      void overlay;
    }
    return Promise.resolve();
  }

  function importedPackList() {
    return Object.values(CS().getState()?.sideContent?.importedPacks || {});
  }

  function importPack(pack) {
    const id = pack.id || `imported_pack_${Date.now()}`;
    Ops().apply({ op: 'side_pack_import', id, pack: { ...pack, id } }, { source: 'side_content_import' });
  }

  return Object.freeze({
    risk,
    riskClass,
    isRiskAtLeast,
    normalizeCard,
    saveCard,
    rejectCard,
    archiveCard,
    promoteCard,
    reviewCard,
    cardToMarkdown,
    copyMarkdown,
    importedPackList,
    importPack
  });
})();

// Runtime compatibility install — identical to the legacy IIFE.
window.CJS.CampaignSideContent = CampaignSideContent;
