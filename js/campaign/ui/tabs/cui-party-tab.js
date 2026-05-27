// cui-party-tab.js — Party / Roster tab rendering for Campaign UI.
//
// Owns the HTML for the two roster-shaped tabs:
//   * `roster` — full sheet view (used in the main tab strip)
//   * the sidebar `_renderParty` block (used inside the command rail)
//
// The render functions are pure: they read state + a frozen `helpers`
// object passed in by the campaign-ui shell. Helpers contain the shell's
// closure-bound math (member rank, equipment loadout, persona pills,
// statName, etc.) so this module never has to reach into the shell's
// private state.
//
// Rank/passive math helpers (`passiveRankInfo`, `passiveRankCostText`,
// `passivePerkRank`) and the pool-picker modals live in this file too,
// and are exposed via `window.CJS.CampaignUIInternal.PartyTab` so the
// shell's action handler + rank-up modal can call them by reference.

window.CJS = window.CJS || {};
window.CJS.CampaignUIInternal = window.CJS.CampaignUIInternal || {};

window.CJS.CampaignUIInternal.PartyTab = (function () {
  'use strict';

  // Sub-module accessors so we never resolve dependencies at module-load
  // time. `cui-utils` etc. always exist by the time render fires.
  const _U = () => window.CJS.CampaignUIInternal.Utils;
  const _P = () => window.CJS.CampaignUIInternal.Portraits;
  const _DS = () => window.CJS.DataStore;
  const _CS = () => window.CJS.CampaignState;
  const _UI = () => window.CJS.UI;
  const _Ops = () => window.CJS.CampaignOps;
  const _Bridge = () => window.CJS.CampaignCombatBridge;
  const _F = () => window.CJS.Formulas;

  // ── Pure helpers ───────────────────────────────────────────────────

  function passivePerkRank(perk = {}) {
    return Number(perk.rank ?? perk.level ?? perk.targetRank ?? 0) || '?';
  }

  function passiveRankInfo(memberId, passiveId, passive = null) {
    const member = _CS().getState()?.party?.[memberId] || {};
    const rank = Math.max(1, Number(member.passiveProgress?.[passiveId]?.rank || 1));
    const F = _F();
    const max = F?.getPassiveMaxRank ? F.getPassiveMaxRank(passive || _DS().get('passives', passiveId) || {}) : 5;
    return { rank, max, isMax: rank >= max };
  }

  function passiveRankCostText(passive, currentRank) {
    const F = _F();
    const cost = passive && F?.calcPassiveRankCost ? F.calcPassiveRankCost(passive, currentRank) : null;
    return _U().formatBundleText(cost);
  }

  // ── Renderers ──────────────────────────────────────────────────────

  function renderParty(state, h) {
    const esc = _U().esc;
    const active = Object.entries(state.party || {}).filter(([, member]) => (member.rosterRole || 'active') !== 'bench');
    const bench = Object.entries(state.party || {}).filter(([, member]) => (member.rosterRole || 'active') === 'bench');
    return `
      <div class="campaign-panel-head">
        <h2>Party</h2>
        <button class="campaign-icon-btn" data-campaign-action="open-roster-tab">Roster</button>
      </div>
      ${active.map(([id, member]) => renderPartyCard(id, member, h)).join('') || '<div class="campaign-empty">No active party members.</div>'}
      ${bench.length ? `<div class="campaign-muted campaign-sidebar-label">Bench</div>${bench.map(([id, member]) => renderPartyCard(id, member, h)).join('')}` : ''}
    `;
  }

  function renderPartyCard(id, member, h) {
    const U = _U();
    const P = _P();
    const esc = U.esc;
    const escAttr = U.escAttr;
    const hpPct = Math.round(((member.currentHp || 0) / (member.maxHp || 1)) * 100);
    const mpPct = Math.round(((member.currentMp || 0) / (member.maxMp || 1)) * 100);
    const statuses = (member.statuses || []).map((status) => `<span class="campaign-chip">${esc(status.label || status.id)}</span>`).join('');
    const Bridge = _Bridge();
    const battleReady = Bridge?.isMemberBattleReady ? Bridge.isMemberBattleReady(member) : true;
    const availability = battleReady ? 'Ready' : (Bridge?.availabilityLabel?.(member) || 'Unavailable');
    const isBench = (member.rosterRole || 'active') === 'bench';
    const rankInfo = h.memberRankInfo(member);
    return `
      <section class="campaign-character ${battleReady ? '' : 'is-unavailable'}">
        <div class="campaign-character-head">
          <div class="campaign-avatar">${(() => { const p = P.memberPortrait(member, id); const f = P.memberPortraitFocus(member, id); return p ? `<img src="${escAttr(p)}" alt="" style="${escAttr(P.focusAttrStyle(f))}">` : P.icon(member, { kind: 'character', size: 'lg', alt: member.name || id }); })()}</div>
          <div>
            <strong>${esc(member.name || id)}</strong>
            <div class="campaign-muted">Lv ${member.level || 1} | Rank ${esc(rankInfo.label)}${rankInfo.trialPending ? ' <span class="campaign-chip" title="Ready to rank up — visit the Adventurer Guild">Trial!</span>' : ''}</div>
            ${h.renderRankBar(rankInfo)}
          </div>
          <span class="campaign-pill ${battleReady ? 'is-current' : 'is-blocked'}">${esc(availability)}</span>
        </div>
        <div class="campaign-bar"><span class="hp" style="width:${hpPct}%"></span><b>HP ${member.currentHp}/${member.maxHp}</b></div>
        <div class="campaign-bar"><span class="mp" style="width:${mpPct}%"></span><b>MP ${member.currentMp}/${member.maxMp}</b></div>
        <div class="campaign-chip-row">${statuses || '<span class="campaign-muted">No statuses</span>'}</div>
        <div class="campaign-mini-actions">
          <button data-campaign-action="damage-char" data-id="${escAttr(id)}">Damage</button>
          <button data-campaign-action="heal-char" data-id="${escAttr(id)}">Heal</button>
          <button data-campaign-action="mp-char" data-id="${escAttr(id)}">MP</button>
          <button data-campaign-action="status-char" data-id="${escAttr(id)}">Status</button>
          <button data-campaign-action="party-sheet" data-id="${escAttr(id)}">Sheet</button>
          <button data-campaign-action="${isBench ? 'activate-character' : 'bench-character'}" data-id="${escAttr(id)}">${isBench ? 'Activate' : 'Bench'}</button>
          <button data-campaign-action="party-availability" data-id="${escAttr(id)}">Availability</button>
          ${battleReady ? '' : `<button data-campaign-action="party-available" data-id="${escAttr(id)}">Return</button>`}
        </div>
      </section>
    `;
  }

  // The roster tab body (active / bench panels) is React-owned (K.3) —
  // `src/campaign/tabs/CampaignRosterTab.tsx` reads typed `getRosterData`
  // and renders each member from `rosterMemberData` below.

  // ── Roster member typed data (K.3) ─────────────────────────────────
  // `rosterMemberData` powers the JSX roster card (hero + vitals + stats
  // + affinities). The detail row (skills / passives / statuses /
  // equipment) is a 2-column CSS grid; mixing JSX and bridged cards there
  // breaks the row-height stretch, so its four cards stay one HTML island
  // (`detailCardsHtml`) until their own K.3 step ports them. Every
  // hero/action button moves to JSX onClick; the persona pill (the one
  // hero element carrying data-campaign-action) becomes typed data.

  function _personaPillData(memberId, member = {}) {
    const personaId = member.activePersona || null;
    if (!personaId) return null;
    const persona = _DS().get('personas', personaId);
    if (!persona) return null;
    const state = _CS().getState();
    const outOfWorld = !!(persona.world && state?.currentWorld && persona.world !== state.currentWorld);
    const worldName = persona.world ? (_DS().get('worlds', persona.world)?.displayName || persona.world) : '';
    const jobShort = member.currentJob ? (_DS().get('jobs', member.currentJob)?.name || member.currentJob) : '';
    return {
      icon: String(persona.icon || '🎭'),
      label: jobShort ? `${persona.name} · ${jobShort}` : String(persona.name || personaId),
      tooltip: outOfWorld ? `${persona.name} (${worldName}) — out of world. ⚠` : `${persona.name} (${worldName})`,
      outOfWorld
    };
  }

  // Returns the four detail-row cards (skills / passives / statuses /
  // equipment) WITHOUT the `.campaign-roster-detail-row` grid wrapper, so
  // the JSX tab can own that grid div directly (exact DOM parity) while
  // the party-sheet modal wraps it itself.
  function _rosterDetailCardsHtml(id, member, h) {
    const esc = _U().esc;
    const escAttr = _U().escAttr;
    const skills = h.memberSkillEntries(id, member);
    const passives = h.memberPassives(id, member);
    const statuses = member.statuses || [];
    return `
        <section class="campaign-roster-card campaign-roster-skills">
          <div class="campaign-roster-card-title">
            <span>Skills</span>
            <small class="campaign-muted">${renderSelectionBudgetBadge(id, member, 'skill')}</small>
          </div>
          ${renderSkillSlotView(id, member)}
          <details class="campaign-pool-details"><summary class="campaign-pool-summary">Manage Pool (${memberSkillPoolCount(id, member)} in pool)</summary>${renderSkillPoolList(id, member, skills, h)}</details>
        </section>
        <section class="campaign-roster-card campaign-roster-passives">
          <div class="campaign-roster-card-title">
            <span>Passives</span>
            <small class="campaign-muted">${renderSelectionBudgetBadge(id, member, 'passive')}</small>
          </div>
          ${renderPassiveSlotView(id, member)}
          <details class="campaign-pool-details"><summary class="campaign-pool-summary">Manage Pool (${memberPassivePoolCount(id, member)} in pool)</summary>${renderPassivePoolList(id, member, passives, h)}</details>
        </section>
        <section class="campaign-roster-card campaign-roster-statuses">
          <div class="campaign-roster-card-title">
            <span>Statuses</span>
            <button class="campaign-icon-btn" data-campaign-action="status-char" data-id="${escAttr(id)}">+</button>
          </div>
          ${statuses.length ? statuses.map((status) => renderKnownStatus(status, h)).join('') : '<div class="campaign-empty">No statuses.</div>'}
        </section>
        <section class="campaign-roster-card campaign-roster-equipment">
          <div class="campaign-roster-card-title"><span>Equipment</span></div>
          ${h.renderEquipmentLoadout(id, member)}
        </section>
    `;
  }

  function rosterMemberData(id, member, h) {
    const base = h.memberBase(id, member);
    const stats = h.memberStats(id, member);
    const isBench = (member.rosterRole || 'active') === 'bench';
    const F = _F();
    const charLevel = Number(member.level || 1);
    const charXp = Number(member.xp || 0);
    const xpToNext = F?.calcCharXpToNextLevel ? F.calcCharXpToNextLevel(charXp, charLevel) : null;
    const Bridge = _Bridge();
    const battleReady = Bridge?.isMemberBattleReady ? Bridge.isMemberBattleReady(member) : true;
    const availLabel = battleReady ? 'Ready' : (Bridge?.availabilityLabel?.(member) || 'Unavailable');
    const P = _P();
    const escAttr = _U().escAttr;
    const esc = _U().esc;
    const resolvedPortrait = P.memberPortrait(member, id);
    const resolvedFocus = P.memberPortraitFocus(member, id);
    const portraitHtml = resolvedPortrait
      ? `<img src="${escAttr(resolvedPortrait)}" alt="" style="${escAttr(P.focusAttrStyle(resolvedFocus))}">`
      : `<span class="campaign-roster-portrait-fallback">${esc(member.icon || member.name?.[0] || '?')}</span>`;
    const rankInfo = h.memberRankInfo(member);
    return {
      id: String(id),
      name: String(member.name || base?.name || id),
      baseFrom: (base?.id && base.id !== id) ? String(base.id) : '',
      isBench,
      battleReady,
      availLabel: String(availLabel),
      level: charLevel,
      xp: charXp,
      xpSmall: xpToNext != null ? `(${xpToNext} to next)` : '(max)',
      charXpMeta: xpToNext != null ? `XP ${charXp} (${xpToNext} to next)` : `XP ${charXp} (max)`,
      rank: {
        label: String(rankInfo.label),
        trialPending: !!rankInfo.trialPending,
        tooltip: rankInfo.atMax ? 'Max rank' : `RP ${rankInfo.rp}/${rankInfo.threshold} → ${rankInfo.next || '—'}`
      },
      portraitHtml,
      persona: _personaPillData(id, member),
      jobChipHtml: h.renderJobChip(id, member),
      vitals: {
        hpPct: Math.round(((member.currentHp || 0) / (member.maxHp || 1)) * 100),
        mpPct: Math.round(((member.currentMp || 0) / (member.maxMp || 1)) * 100),
        hp: Number(member.currentHp || 0),
        maxHp: Number(member.maxHp || 0),
        mp: Number(member.currentMp || 0),
        maxMp: Number(member.maxMp || 0)
      },
      stats: Object.entries(stats).map(([stat, value]) => ({
        name: h.statName(stat),
        value: Number(value || 0)
      })),
      resistancesHtml: h.renderResistances(base, member, stats),
      detailCardsHtml: _rosterDetailCardsHtml(id, member, h)
    };
  }

  // renderRosterMember — HTML member sheet for the party-sheet modal
  // (`_partySheetModal`, which has its own click delegation). The roster
  // TAB renders JSX from `rosterMemberData`; this formatter derives from
  // the same typed data so there is one source of truth.
  function renderRosterMember(id, member, h) {
    const esc = _U().esc;
    const escAttr = _U().escAttr;
    const d = rosterMemberData(id, member, h);
    const personaPill = d.persona
      ? `<span class="${d.persona.outOfWorld ? 'campaign-pill is-blocked' : 'campaign-pill'}" title="${escAttr(d.persona.tooltip)}" data-campaign-action="change-persona" data-id="${escAttr(id)}" style="cursor:pointer">${esc(d.persona.icon)} ${esc(d.persona.label)}${d.persona.outOfWorld ? ' ⚠' : ''}</span>`
      : '';
    const rosterToggle = `<button class="campaign-action" data-campaign-action="${d.isBench ? 'activate-character' : 'bench-character'}" data-id="${escAttr(id)}">${d.isBench ? 'Activate' : 'Bench'}</button>`;
    const gameplayActions = `
      ${rosterToggle}
      <button class="campaign-action" data-campaign-action="party-sheet" data-id="${escAttr(id)}">Sheet</button>
      <button class="campaign-action" data-campaign-action="change-job" data-id="${escAttr(id)}">Job Change</button>
      <button class="campaign-action" data-campaign-action="show-job-tree" data-id="${escAttr(id)}">Job Tree</button>
      <button class="campaign-action" data-campaign-action="change-persona" data-id="${escAttr(id)}" title="Switch world persona">Persona</button>
      <button class="campaign-action" data-campaign-action="rank-up-apply" title="Apply for a rank-up trial at the Adventurer Guild.">Rank Trial</button>
      <button class="campaign-action" data-campaign-action="party-availability" data-id="${escAttr(id)}">Availability</button>
    `;
    const gmActions = `
      <button class="campaign-action" data-campaign-action="gm-member-override" data-id="${escAttr(id)}">GM Edit</button>
      <button class="campaign-action" data-campaign-action="level-char" data-id="${escAttr(id)}">Level</button>
      <button class="campaign-action" data-campaign-action="grant-xp" data-id="${escAttr(id)}">+XP</button>
      <button class="campaign-action" data-campaign-action="grant-job-xp" data-id="${escAttr(id)}">+Job XP</button>
      <button class="campaign-action" data-campaign-action="stat-boost" data-id="${escAttr(id)}">Stats</button>
      <button class="campaign-action" data-campaign-action="learn-skill" data-id="${escAttr(id)}">Learn Skill</button>
      <button class="campaign-action" data-campaign-action="learn-passive" data-id="${escAttr(id)}">Learn Passive</button>
      <button class="campaign-action" data-campaign-action="status-char" data-id="${escAttr(id)}">Status</button>
      <button class="campaign-action danger" data-campaign-action="remove-character" data-id="${escAttr(id)}">Remove</button>
    `;
    return `
      <article class="campaign-roster-member ${d.isBench ? 'is-bench' : 'is-active'} ${d.battleReady ? '' : 'is-unavailable'}">
        <header class="campaign-roster-hero">
          <div class="campaign-roster-portrait">${d.portraitHtml}</div>
          <div class="campaign-roster-hero-info">
            <div class="campaign-roster-hero-title">
              <strong class="campaign-roster-name">${esc(d.name)}</strong>
              <span class="campaign-pill ${d.battleReady ? 'is-current' : 'is-blocked'}">${esc(d.availLabel)}</span>
              <span class="campaign-pill">${d.isBench ? 'Bench' : 'Active'}</span>
              ${personaPill}
            </div>
            <div class="campaign-roster-hero-meta">
              <span><b>Lv</b> ${d.level}</span>
              <span title="${escAttr(d.rank.tooltip)}"><b>Rank</b> ${esc(d.rank.label)}${d.rank.trialPending ? ' <span class="campaign-chip">Trial!</span>' : ''}</span>
              <span class="campaign-roster-hero-job">${d.jobChipHtml}</span>
              <span title="${escAttr(d.charXpMeta)}"><b>XP</b> ${d.xp} <small>${esc(d.xpSmall)}</small></span>
              <span class="campaign-muted">${esc(id)}${d.baseFrom ? ` from ${esc(d.baseFrom)}` : ''}</span>
            </div>
            <div class="campaign-roster-action-groups">
              <div class="campaign-roster-action-block">
                <span class="campaign-roster-actions-title">Gameplay</span>
                <div class="campaign-roster-hero-actions campaign-row-actions">${gameplayActions}</div>
              </div>
              <details class="campaign-roster-action-block is-gm">
                <summary class="campaign-roster-actions-title">GM Edit</summary>
                <div class="campaign-roster-hero-actions campaign-row-actions">${gmActions}</div>
              </details>
            </div>
          </div>
        </header>

        <div class="campaign-roster-vitals-row">
          <section class="campaign-roster-card campaign-roster-vitals">
            <div class="campaign-roster-card-title">Vitals</div>
            <div class="campaign-bar"><span class="hp" style="width:${d.vitals.hpPct}%"></span><b>HP ${d.vitals.hp}/${d.vitals.maxHp}</b></div>
            <div class="campaign-bar"><span class="mp" style="width:${d.vitals.mpPct}%"></span><b>MP ${d.vitals.mp}/${d.vitals.maxMp}</b></div>
            <div class="campaign-roster-stats-grid">
              ${d.stats.map((s) => `<div class="campaign-roster-stat"><span>${esc(s.name)}</span><strong>${s.value}</strong></div>`).join('')}
            </div>
          </section>
          <section class="campaign-roster-card campaign-roster-affinities">
            <div class="campaign-roster-card-title">Affinities</div>
            ${d.resistancesHtml}
          </section>
        </div>

        <div class="campaign-roster-detail-row">${d.detailCardsHtml}</div>
      </article>
    `;
  }

  // Selection budget chip — shows "X/Y slots · A/B SP" for a member.
  function renderSelectionBudgetBadge(memberId, member, kind /* 'skill' | 'passive' */) {
    const F = _F();
    if (!F) return '';
    const base = _DS().get('characters', member.baseCharacterId || memberId) || {};
    const eqField = kind === 'skill' ? 'equippedSkills' : 'equippedPassives';
    const slotCap = kind === 'skill'
      ? (F.calcEffectiveSkillSlots ? F.calcEffectiveSkillSlots(member, base) : member.skillSlots || 0)
      : (F.calcEffectivePassiveSlots ? F.calcEffectivePassiveSlots(member, base) : member.passiveSlots || 0);
    const spCap = kind === 'skill'
      ? (F.calcEffectiveSkillPoints ? F.calcEffectiveSkillPoints(member, base) : member.skillPoints || 0)
      : (F.calcEffectivePassivePoints ? F.calcEffectivePassivePoints(member, base) : member.passivePoints || 0);
    const equipped = member[eqField] || [];
    const used = F.calcEquippedSpCost
      ? F.calcEquippedSpCost(equipped, kind === 'skill' ? 'skills' : 'passives')
      : equipped.length;
    return `${equipped.length}/${slotCap} slots · ${used}/${spCap} SP`;
  }

  // Render the FULL skill pool for a member, with equip/unequip controls
  // per row. authoredEntries: the merged list from base + learned (used by
  // renderKnownSkill so per-skill overrides like authored level still apply).
  function renderSkillPoolList(memberId, member, authoredEntries, h) {
    const CS = _CS();
    const DS = _DS();
    const pool = CS.skillPoolIds ? CS.skillPoolIds(member, DS.get('characters', member.baseCharacterId || memberId) || {}) : [];
    if (!pool.length) return '<div class="campaign-empty">No skills in pool. Use the + button to learn one.</div>';
    const equippedSet = new Set(member.equippedSkills || []);
    const entryById = new Map();
    for (const e of authoredEntries || []) {
      const sid = typeof e === 'string' ? e : e?.skillId;
      if (sid) entryById.set(sid, e);
    }
    return pool.map((sid) => {
      const entry = entryById.get(sid) || { skillId: sid };
      return renderKnownSkill(memberId, entry, equippedSet.has(sid), h);
    }).join('');
  }

  function renderPassivePoolList(memberId, member, authoredPassives, h) {
    const CS = _CS();
    const DS = _DS();
    const pool = CS.passivePoolIds ? CS.passivePoolIds(member, DS.get('characters', member.baseCharacterId || memberId) || {}) : [];
    if (!pool.length) return '<div class="campaign-empty">No passives in pool. Use the + button to learn one.</div>';
    const equippedSet = new Set(member.equippedPassives || []);
    return pool.map((pid) => renderKnownPassive(memberId, pid, equippedSet.has(pid), h)).join('');
  }

  // ── Slot-based equip views ──────────────────────────────────────────
  // Show equipped items as filled slots, empty slots as [+] picker buttons.
  function renderSkillSlotView(memberId, member) {
    const U = _U();
    const P = _P();
    const F = _F();
    const DS = _DS();
    if (!F) return '';
    const base = DS.get('characters', member.baseCharacterId || memberId) || {};
    const slotCap = F.calcEffectiveSkillSlots ? F.calcEffectiveSkillSlots(member, base) : (member.skillSlots || 4);
    const equipped = member.equippedSkills || [];
    const esc = U.esc;
    const escAttr = U.escAttr;
    let html = '<div class="campaign-slot-grid">';
    for (let i = 0; i < slotCap; i++) {
      if (i < equipped.length) {
        const sid = equipped[i];
        const skill = DS.get('skills', sid);
        const spCost = F.calcSpCost ? F.calcSpCost(skill) : 1;
        html += `<div class="campaign-slot filled" title="${escAttr(skill?.name || sid)} (SP ${spCost})">
          ${P.icon(skill, { kind: 'skill', size: 'md', alt: skill?.name || sid })}
          <span class="campaign-slot-name">${esc(skill?.name || sid)}</span>
          <button class="campaign-slot-remove" data-campaign-action="unequip-skill" data-id="${escAttr(memberId)}" data-skill-id="${escAttr(sid)}" title="Unequip">✕</button>
        </div>`;
      } else {
        html += `<div class="campaign-slot empty" data-campaign-action="pick-equip-skill" data-id="${escAttr(memberId)}" title="Equip a skill from pool">
          <span class="campaign-slot-plus">+</span>
        </div>`;
      }
    }
    html += '</div>';
    return html;
  }

  function renderPassiveSlotView(memberId, member) {
    const U = _U();
    const P = _P();
    const F = _F();
    const DS = _DS();
    if (!F) return '';
    const base = DS.get('characters', member.baseCharacterId || memberId) || {};
    const slotCap = F.calcEffectivePassiveSlots ? F.calcEffectivePassiveSlots(member, base) : (member.passiveSlots || 3);
    const equipped = member.equippedPassives || [];
    const esc = U.esc;
    const escAttr = U.escAttr;
    let html = '<div class="campaign-slot-grid">';
    for (let i = 0; i < slotCap; i++) {
      if (i < equipped.length) {
        const pid = equipped[i];
        const passive = DS.get('passives', pid) || DS.get('effects', pid);
        const spCost = F.calcSpCost ? F.calcSpCost(passive) : 1;
        const rankInfo = passiveRankInfo(memberId, pid, passive);
        html += `<div class="campaign-slot filled" title="${escAttr(passive?.name || pid)} (SP ${spCost}, Rank ${rankInfo.rank}/${rankInfo.max})">
          ${P.icon(passive, { kind: 'passive', size: 'md', alt: passive?.name || pid })}
          <span class="campaign-slot-name">${esc(passive?.name || pid)} <small>R ${rankInfo.rank}/${rankInfo.max}</small></span>
          <button class="campaign-slot-remove" data-campaign-action="unequip-passive" data-id="${escAttr(memberId)}" data-passive-id="${escAttr(pid)}" title="Unequip">✕</button>
        </div>`;
      } else {
        html += `<div class="campaign-slot empty" data-campaign-action="pick-equip-passive" data-id="${escAttr(memberId)}" title="Equip a passive from pool">
          <span class="campaign-slot-plus">+</span>
        </div>`;
      }
    }
    html += '</div>';
    return html;
  }

  function memberSkillPoolCount(memberId, member) {
    const CS = _CS();
    const DS = _DS();
    const pool = CS.skillPoolIds ? CS.skillPoolIds(member, DS.get('characters', member.baseCharacterId || memberId) || {}) : [];
    return pool.length;
  }

  function memberPassivePoolCount(memberId, member) {
    const CS = _CS();
    const DS = _DS();
    const pool = CS.passivePoolIds ? CS.passivePoolIds(member, DS.get('characters', member.baseCharacterId || memberId) || {}) : [];
    return pool.length;
  }

  // ── Pool picker modals ─────────────────────────────────────────────
  // Imperative DOM modals invoked from the shell's action handler.

  function openSkillPoolPicker(memberId) {
    const CS = _CS();
    const DS = _DS();
    const UI = _UI();
    const Ops = _Ops();
    const U = _U();
    const P = _P();
    const F = _F();
    const member = CS.getState()?.party?.[memberId];
    if (!member) return;
    const base = DS.get('characters', member.baseCharacterId || memberId) || {};
    const pool = CS.skillPoolIds ? CS.skillPoolIds(member, base) : [];
    const equippedSet = new Set(member.equippedSkills || []);
    const available = pool.filter((sid) => !equippedSet.has(sid));

    if (!available.length) return UI.toast('No unequipped skills in pool.', 'info');

    const body = document.createElement('div');
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Search skills...';
    search.style.cssText = 'width:100%;margin-bottom:8px';
    body.appendChild(search);

    const list = document.createElement('div');
    list.className = 'data-list';
    list.style.maxHeight = '400px';
    body.appendChild(list);

    let overlay;
    const esc = U.esc;
    function renderList(q) {
      list.innerHTML = '';
      const query = (q || '').toLowerCase();
      for (const sid of available) {
        const skill = DS.get('skills', sid);
        if (!skill) continue;
        if (query && !(skill.name || '').toLowerCase().includes(query) && !sid.toLowerCase().includes(query)) continue;
        const spCost = F?.calcSpCost ? F.calcSpCost(skill) : 1;
        const prog = member.skillProgress?.[sid] || { level: 1 };
        const row = document.createElement('div');
        row.className = 'data-list-item';
        row.style.cursor = 'pointer';
        row.innerHTML = `${P.icon(skill, { kind: 'skill', size: 'sm', alt: skill.name || sid })}<div><div class="item-name">${esc(skill.name || sid)}</div><div class="item-sub">SP ${spCost} | Lv ${prog.level || 1} | ${esc(skill.description?.substring(0, 60) || '')}</div></div>`;
        row.onclick = () => {
          Ops.apply({ op: 'equip_skill', target: memberId, skillId: sid }, { source: 'ui' });
          UI.closeModal(overlay);
        };
        list.appendChild(row);
      }
      if (!list.children.length) list.innerHTML = '<div class="data-list-empty">No matching skills.</div>';
    }

    search.oninput = () => renderList(search.value);
    renderList('');

    overlay = UI.openModal({ title: 'Equip Skill from Pool', content: body, width: '500px' });
    search.focus();
  }

  function openPassivePoolPicker(memberId) {
    const CS = _CS();
    const DS = _DS();
    const UI = _UI();
    const Ops = _Ops();
    const U = _U();
    const P = _P();
    const F = _F();
    const member = CS.getState()?.party?.[memberId];
    if (!member) return;
    const base = DS.get('characters', member.baseCharacterId || memberId) || {};
    const pool = CS.passivePoolIds ? CS.passivePoolIds(member, base) : [];
    const equippedSet = new Set(member.equippedPassives || []);
    const available = pool.filter((pid) => !equippedSet.has(pid));

    if (!available.length) return UI.toast('No unequipped passives in pool.', 'info');

    const body = document.createElement('div');
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Search passives...';
    search.style.cssText = 'width:100%;margin-bottom:8px';
    body.appendChild(search);

    const list = document.createElement('div');
    list.className = 'data-list';
    list.style.maxHeight = '400px';
    body.appendChild(list);

    let overlay;
    const esc = U.esc;
    function renderList(q) {
      list.innerHTML = '';
      const query = (q || '').toLowerCase();
      for (const pid of available) {
        const passive = DS.get('passives', pid) || DS.get('effects', pid);
        if (!passive) continue;
        if (query && !(passive.name || '').toLowerCase().includes(query) && !pid.toLowerCase().includes(query)) continue;
        const spCost = F?.calcSpCost ? F.calcSpCost(passive) : 1;
        const rankInfo = passiveRankInfo(memberId, pid, passive);
        const row = document.createElement('div');
        row.className = 'data-list-item';
        row.style.cursor = 'pointer';
        row.innerHTML = `${P.icon(passive, { kind: 'passive', size: 'sm', alt: passive.name || pid })}<div><div class="item-name">${esc(passive.name || pid)}</div><div class="item-sub">SP ${spCost} | Rank ${rankInfo.rank}/${rankInfo.max} | ${esc(passive.trigger || passive.category || '')} | ${esc(passive.description?.substring(0, 60) || '')}</div></div>`;
        row.onclick = () => {
          Ops.apply({ op: 'equip_passive', target: memberId, passiveId: pid }, { source: 'ui' });
          UI.closeModal(overlay);
        };
        list.appendChild(row);
      }
      if (!list.children.length) list.innerHTML = '<div class="data-list-empty">No matching passives.</div>';
    }

    search.oninput = () => renderList(search.value);
    renderList('');

    overlay = UI.openModal({ title: 'Equip Passive from Pool', content: body, width: '500px' });
    search.focus();
  }

  // ── Known* rows ────────────────────────────────────────────────────

  function renderKnownSkill(memberId, entry, isEquipped, h) {
    const U = _U();
    const M = window.CJS.CampaignUIInternal.Modals;
    const F = _F();
    const DS = _DS();
    const CS = _CS();
    const esc = U.esc;
    const escAttr = U.escAttr;
    const skillId = h.skillEntryId(entry);
    const skill = DS.get('skills', skillId);
    const learned = entry.source === 'campaign' || h.memberLearnedSkillIds(memberId).includes(skillId);
    const member = CS.getState()?.party?.[memberId] || {};
    const prog = member.skillProgress?.[skillId] || { ap: 0, level: 1 };
    const cap = F?.getSkillMaxLevel ? F.getSkillMaxLevel(skill || {}) : 5;
    const apTotal = Number(prog.ap || 0);
    const level = Math.max(1, Number(prog.level || 1));
    const apToNext = (skill && F?.calcSkillApToNextLevel) ? F.calcSkillApToNextLevel(skill, apTotal, level) : null;
    const apMeta = level >= cap
      ? `Lv ${level}/${cap} (max)`
      : (apToNext != null ? `Lv ${level}/${cap} | ${apToNext} AbP to next` : `Lv ${level}/${cap}`);
    const baseMeta = h.skillMeta(skill, entry);
    const meta = [baseMeta, apMeta].filter(Boolean).join(' | ');
    const apButton = (skill && level < cap)
      ? `<button class="campaign-action" data-campaign-action="grant-skill-ap" data-id="${escAttr(memberId)}" data-skill-id="${escAttr(skillId)}" title="Grant AbP for this skill (edit-mode)">+AbP</button>`
      : '';
    const levelButton = (skill && level < cap)
      ? `<button class="campaign-action" data-campaign-action="level-up-skill" data-id="${escAttr(memberId)}" data-skill-id="${escAttr(skillId)}" title="Force level-up (edit-mode)">+Lv</button>`
      : '';
    const detailButton = skill
      ? `<button class="campaign-action" data-campaign-action="show-skill-detail" data-id="${escAttr(memberId)}" data-skill-id="${escAttr(skillId)}" title="Show full perk tree">Detail</button>`
      : '';
    const equippedFlag = isEquipped === true;
    const spCost = (skill && F?.calcSpCost) ? F.calcSpCost(skill) : 1;
    const equipButton = isEquipped == null
      ? ''
      : (equippedFlag
          ? `<button class="campaign-action danger" data-campaign-action="unequip-skill" data-id="${escAttr(memberId)}" data-skill-id="${escAttr(skillId)}" title="Unequip (frees slot/SP)">Unequip</button>`
          : `<button class="campaign-action" data-campaign-action="equip-skill" data-id="${escAttr(memberId)}" data-skill-id="${escAttr(skillId)}" title="Equip (uses ${spCost} SP)">Equip</button>`);
    const extraActions = `${equipButton}${apButton}${levelButton}${detailButton}`;

    const earned = (skill && F?.getEarnedSkillPerks) ? F.getEarnedSkillPerks(skill, level) : [];
    const next = (skill && F?.getNextSkillPerk) ? F.getNextSkillPerk(skill, level) : null;
    const earnedLine = earned.length
      ? `<div class="campaign-muted" style="font-size:0.8em">Perks: ${earned.map((p) => `Lv${p.level} — ${esc(p.description || '...')}`).join(' • ')}</div>`
      : '';
    const nextLine = next
      ? `<div class="campaign-muted" style="font-size:0.8em;color:var(--accent)">Next at Lv${next.level}: ${esc(next.description || '...')}</div>`
      : '';
    const baseDesc = M.desc(skill) || '';
    const descriptionHtml = `<p>${esc(baseDesc || 'No description yet.')}</p>${earnedLine}${nextLine}`;
    const titlePrefix = isEquipped === true ? '✓ ' : (isEquipped === false ? '☐ ' : '');
    return renderKnownRecord({
      title: `${titlePrefix}${skill?.name || skillId}`,
      meta: `SP ${spCost} | ${meta}`,
      descriptionHtml,
      removeAction: learned ? 'unlearn-skill' : '',
      removeData: learned ? `data-id="${escAttr(memberId)}" data-skill-id="${escAttr(skillId)}"` : '',
      extraActions
    });
  }

  function renderKnownPassive(memberId, passiveId, isEquipped, h) {
    const U = _U();
    const M = window.CJS.CampaignUIInternal.Modals;
    const F = _F();
    const DS = _DS();
    const CS = _CS();
    const esc = U.esc;
    const escAttr = U.escAttr;
    const passiveRecord = DS.get('passives', passiveId);
    const passive = passiveRecord || DS.get('effects', passiveId);
    const learned = (CS.getState()?.party?.[memberId]?.learnedPassives || []).includes(passiveId);
    const spCost = (passive && F?.calcSpCost) ? F.calcSpCost(passive) : 1;
    const rankInfo = passiveRankInfo(memberId, passiveId, passive);
    const rankCostText = passiveRankCostText(passive, rankInfo.rank);
    const equippedFlag = isEquipped === true;
    const equipButton = isEquipped == null
      ? ''
      : (equippedFlag
          ? `<button class="campaign-action danger" data-campaign-action="unequip-passive" data-id="${escAttr(memberId)}" data-passive-id="${escAttr(passiveId)}" title="Unequip (frees slot/SP)">Unequip</button>`
          : `<button class="campaign-action" data-campaign-action="equip-passive" data-id="${escAttr(memberId)}" data-passive-id="${escAttr(passiveId)}" title="Equip (uses ${spCost} SP)">Equip</button>`);
    const rankButton = (passiveRecord && !rankInfo.isMax)
      ? `<button class="campaign-action" data-campaign-action="rank-up-passive" data-id="${escAttr(memberId)}" data-passive-id="${escAttr(passiveId)}" title="Consumes ${escAttr(rankCostText || 'rank material')}">Rank Up</button>`
      : '';
    const earned = (passiveRecord && F?.getEarnedPassiveRankPerks) ? F.getEarnedPassiveRankPerks(passiveRecord, rankInfo.rank) : [];
    const next = (passiveRecord && F?.getNextPassiveRankPerk) ? F.getNextPassiveRankPerk(passiveRecord, rankInfo.rank) : null;
    const earnedLine = earned.length
      ? `<div class="campaign-muted" style="font-size:0.8em">Perks: ${earned.map((p) => `R${passivePerkRank(p)} — ${esc(p.description || '...')}`).join(' | ')}</div>`
      : '';
    const nextLine = next
      ? `<div class="campaign-muted" style="font-size:0.8em;color:var(--accent)">Next at R${passivePerkRank(next)}: ${esc(next.description || '...')}</div>`
      : '';
    const descriptionHtml = `<p>${esc(M.desc(passive) || 'No description yet.')}</p>${earnedLine}${nextLine}`;
    const titlePrefix = isEquipped === true ? '✓ ' : (isEquipped === false ? '☐ ' : '');
    return renderKnownRecord({
      title: `${titlePrefix}${passive?.name || passiveId}`,
      meta: `SP ${spCost} | Rank ${rankInfo.rank}/${rankInfo.max}${rankInfo.isMax ? ' (max)' : ''} | ${passive?.trigger || passive?.category || passiveId}`,
      descriptionHtml,
      removeAction: learned ? 'unlearn-passive' : '',
      removeData: learned ? `data-id="${escAttr(memberId)}" data-passive-id="${escAttr(passiveId)}"` : '',
      extraActions: `${equipButton}${rankButton}`
    });
  }

  function renderKnownStatus(status, h) {
    const M = window.CJS.CampaignUIInternal.Modals;
    const def = h.statusDef(status.id);
    return renderKnownRecord({
      title: def?.name || status.label || status.id,
      meta: `${status.duration || 'manual'} | stacks ${status.stacks || 1}`,
      description: status.notes || M.desc(def)
    });
  }

  function renderKnownRecord({ title, meta, description, descriptionHtml, removeAction, removeData, extraActions }) {
    const esc = _U().esc;
    const body = descriptionHtml != null
      ? descriptionHtml
      : `<p>${esc(description || 'No description yet.')}</p>`;
    return `
      <div class="campaign-record-line">
        <div>
          <strong>${esc(title || '')}</strong>
          <small>${esc(meta || '')}</small>
          ${body}
        </div>
        <div style="display:flex;gap:4px;align-items:center">
          ${extraActions || ''}
          ${removeAction ? `<button class="campaign-icon-btn danger" title="Remove" data-campaign-action="${removeAction}" ${removeData}>-</button>` : ''}
        </div>
      </div>
    `;
  }

  // roster tab is React-owned (K.3) — registered as a React mount point
  // by cui-react-bridge.js, rendered as JSX by the shell from the typed
  // getRosterData bridge.

  return Object.freeze({
    // Sidebar party block (command-rail drawer) + party-sheet modal sheet.
    renderParty,
    renderPartyCard,
    renderRosterMember,
    // Typed roster-tab data (K.3).
    rosterMemberData,
    // Row renderers
    renderKnownSkill,
    renderKnownPassive,
    renderKnownStatus,
    renderKnownRecord,
    // Slot views
    renderSkillSlotView,
    renderPassiveSlotView,
    renderSelectionBudgetBadge,
    renderSkillPoolList,
    renderPassivePoolList,
    memberSkillPoolCount,
    memberPassivePoolCount,
    // Pool pickers (called from shell action handler)
    openSkillPoolPicker,
    openPassivePoolPicker,
    // Passive math (used by shell rank-up modal)
    passivePerkRank,
    passiveRankInfo,
    passiveRankCostText
  });
})();
