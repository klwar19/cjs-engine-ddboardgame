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
  const _E = () => window.CJS.CampaignUIInternal.Equipment;
  const _M = () => window.CJS.CampaignUIInternal.Modals;
  const _DS = () => window.CJS.DataStore;
  const _CS = () => window.CJS.CampaignState;
  const _CM = () => window.CJS.ContentManager;
  const _C = () => window.CJS.CONST;
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

  // ── Member math + sheet sub-renderers ──────────────────────────────
  // Phase H.4 — these were the `_tabHelpers` cluster threaded into this
  // module from campaign-ui.js. They now live here (the roster island is
  // their only consumer) and are bundled by `_tabHelpers()` below, which
  // the render functions default their `h` argument to. The party-sheet
  // modal + GM-override / roster modals read the exposed surface on
  // `CampaignUIInternal.PartyTab` (skillMetaText / memberRankInfo /
  // characterOptions / skillOptions / passiveOptions / renderPartySheetHtml).

  function _memberBase(id, member = {}) {
    return _DS().get('characters', member.baseCharacterId || id) || {};
  }

  // Adventurer rank summary for a member. Effective rank reflects the
  // current world's ceiling cap so the player sees the cap at a glance.
  // RP progress shows the gap to the next-rank threshold.
  function _memberRankInfo(member = {}) {
    const F = _F();
    const adv = member.adventurer || { rank: member.rank || 'F', rankPoints: 0, trialPending: false };
    const rank = adv.rank || 'F';
    const world = _DS().get('worlds', _CS().getState()?.currentWorld) || {};
    const ceiling = world.ceiling || null;
    const effective = F?.effectiveRank ? F.effectiveRank(rank, ceiling) : rank;
    const capped = ceiling && effective !== rank;
    const next = F?.nextRank ? F.nextRank(rank) : null;
    const threshold = next && F?.rpThresholdFor ? F.rpThresholdFor(next) : 0;
    const rp = Math.max(0, Number(adv.rankPoints || 0));
    const pct = threshold > 0 ? Math.max(0, Math.min(100, Math.round((rp / threshold) * 100))) : 0;
    return {
      rank,
      effective,
      capped,
      ceiling,
      label: capped ? `${rank} (eff ${effective})` : rank,
      next,
      threshold,
      rp,
      pct,
      atMax: !next,
      trialPending: !!adv.trialPending
    };
  }

  function _renderRankBar(info) {
    if (!info || info.atMax) {
      return '<div class="campaign-muted" style="font-size:0.72rem">Rank maxed (SSR)</div>';
    }
    if (info.threshold <= 0) return '';
    return `<div class="campaign-bar" style="margin-top:4px"><span class="mp" style="width:${info.pct}%"></span><b>RP ${info.rp}/${info.threshold} → ${_U().esc(info.next)}</b></div>`;
  }

  function _memberStats(id, member = {}) {
    const base = _memberBase(id, member);
    const stats = { ...(base.stats || {}) };
    for (const [stat, amount] of Object.entries(member.statOverrides || {})) {
      stats[stat] = Number(stats[stat] || 0) + Number(amount || 0);
    }
    const ordered = {};
    for (const stat of _C()?.STATS || Object.keys(stats)) ordered[stat] = stats[stat] || 0;
    return ordered;
  }

  function _renderResistances(base, member, stats) {
    const F = _F();
    const esc = _U().esc;
    const escAttr = _U().escAttr;
    const weak = [...(base.weak || []), ...(member.weak || [])].filter((v, i, a) => a.indexOf(v) === i);
    const resist = [...(base.resist || []), ...(member.resist || [])].filter((v, i, a) => a.indexOf(v) === i);
    const immune = [...(base.immune || []), ...(member.immune || [])].filter((v, i, a) => a.indexOf(v) === i);

    const elements = _C()?.ELEMENTS || ['Physical', 'Fire', 'Water', 'Lightning', 'Earth', 'Wind', 'Nature', 'Light', 'Dark', 'Chaos'];

    let html = '<div class="campaign-affinity-grid">';

    for (const el of elements) {
      const slug = String(el).toLowerCase();
      let stateClass = 'is-neutral';
      let stateText = '<span class="campaign-affinity-state">--</span>';
      if (immune.includes(el)) { stateClass = 'is-immune'; stateText = '<strong class="campaign-affinity-state">Nu</strong>'; }
      else if (resist.includes(el)) { stateClass = 'is-resist'; stateText = '<strong class="campaign-affinity-state">Rs</strong>'; }
      else if (weak.includes(el)) { stateClass = 'is-weak'; stateText = '<strong class="campaign-affinity-state">Wk</strong>'; }

      html += `<div class="campaign-affinity-pill el-${slug} ${stateClass}" data-element="${slug}" title="${escAttr(el + ': ' + (immune.includes(el) ? 'Immune (Nu)' : resist.includes(el) ? 'Resists (Rs)' : weak.includes(el) ? 'Weak (Wk)' : 'Neutral'))}">
        <span class="campaign-affinity-name">${esc(el)}</span>
        ${stateText}
      </div>`;
    }
    html += '</div>';

    const physDR = F?.calcPhysicalDR ? F.calcPhysicalDR(stats) : 0;
    const magDR = F?.calcMagicDR ? F.calcMagicDR(stats) : 0;
    const chaosDR = F?.calcChaosDR ? F.calcChaosDR(stats) : 0;

    html += '<div class="campaign-affinity-subheading">Damage Reduction</div>';
    html += `<div class="campaign-dr-row">
      <span class="campaign-dr-chip" title="Reduces incoming Physical damage"><b class="campaign-dr-icon">🗡</b><span class="campaign-dr-label">Phys</span><b class="campaign-dr-value">${physDR}</b></span>
      <span class="campaign-dr-chip" title="Reduces incoming Magical damage"><b class="campaign-dr-icon">✨</b><span class="campaign-dr-label">Magic</span><b class="campaign-dr-value">${magDR}</b></span>
      <span class="campaign-dr-chip" title="Reduces incoming Chaos damage"><b class="campaign-dr-icon">🌀</b><span class="campaign-dr-label">Chaos</span><b class="campaign-dr-value">${chaosDR}</b></span>
    </div>`;

    return html;
  }

  function _renderEquipmentLoadout(memberId, member = {}) {
    const E = _E();
    const P = _P();
    const DS = _DS();
    const esc = _U().esc;
    const escAttr = _U().escAttr;
    const label = _U().label;
    const slots = E.normalizeEquipmentSlots(member.equipmentSlots, member.equipment);
    const weaponTypes = E.allowedTypes(member, 'allowedWeaponTypes').map(label).join(', ') || 'Any';
    const armorTypes = E.allowedTypes(member, 'allowedArmorTypes').map(label).join(', ') || 'Any';
    const rows = ['weapon', 'armor', 'accessory1', 'accessory2'].map((slot) => {
      const itemId = slots[slot];
      const item = DS.get('items', itemId);
      const itemName = item?.name || itemId || 'Empty';
      const type = item ? E.equipmentType(item) : '';
      const meta = item ? [type, item.rarity].filter(Boolean).join(' | ') : 'Empty';
      const slotKind = E.slotKind(slot) || 'item';
      const iconHtml = item
        ? P.icon(item, { kind: slotKind, size: 'md', alt: itemName })
        : `<span class="cjs-icon cjs-icon-md cjs-icon-${slotKind}" style="opacity:.4">+</span>`;
      return `
        <div class="campaign-equipment-line">
          <div class="campaign-equipment-icon">${iconHtml}</div>
          <div>
            <strong>${esc(E.slotLabel(slot))}</strong>
            <small>${esc(itemName)}${meta ? ` | ${esc(meta)}` : ''}</small>
            ${item ? `<p>${esc(E.equipmentDesc(item))}</p>` : ''}
          </div>
          <div class="campaign-row-actions">
            <button class="campaign-icon-btn" data-campaign-action="equip-item" data-id="${escAttr(memberId)}" data-slot="${escAttr(slot)}">Equip</button>
            ${item ? `<button class="campaign-icon-btn danger" data-campaign-action="unequip-item" data-id="${escAttr(memberId)}" data-slot="${escAttr(slot)}">-</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
    return `
      <div class="campaign-equipment-proficiency">Weapons: ${esc(weaponTypes)} | Armor: ${esc(armorTypes)} | Accessories: any two different types</div>
      ${rows}
    `;
  }

  function _memberSkillEntries(id, member = _CS().getState()?.party?.[id] || {}) {
    const base = _memberBase(id, member);
    const out = [];
    const seen = new Set();
    for (const entry of [...(base.skills || []), ...(member.learnedSkills || [])]) {
      const skillId = _skillEntryId(entry);
      if (!skillId || seen.has(skillId)) continue;
      seen.add(skillId);
      out.push(typeof entry === 'string' ? { skillId } : entry);
    }
    return out;
  }

  function _memberLearnedSkillIds(id) {
    const member = _CS().getState()?.party?.[id] || {};
    return (member.learnedSkills || []).map(_skillEntryId).filter(Boolean);
  }

  function _skillEntryId(entry) {
    return typeof entry === 'string' ? entry : entry?.skillId || null;
  }

  function _memberPassives(id, member = {}) {
    const base = _memberBase(id, member);
    return Array.from(new Set([...(base.innatePassives || []), ...(member.learnedPassives || [])].filter(Boolean)));
  }

  function _characterOptions() {
    const state = _CS().getState();
    const current = new Set(Object.keys(state?.party || {}));
    const source = _CM()?.getVisibleItems?.('characters') || _DS().getAllAsArray('characters');
    return source
      .filter((entry) => entry?.id && !current.has(entry.id) && (entry.team || 'player') !== 'enemy')
      .map((entry) => ({
        value: entry.id,
        label: entry.name || entry.id,
        sub: `${entry.rank || 'F'} | ${(entry.skills || []).length} skills`,
        description: _M().desc(entry),
        tags: entry.tags || []
      }))
      .sort(_M().sortOptionLabel);
  }

  function _skillOptions(memberId) {
    const known = new Set(_memberSkillEntries(memberId).map(_skillEntryId));
    const source = _CM()?.getVisibleItems?.('skills') || _DS().getAllAsArray('skills');
    return source
      .filter((entry) => entry?.id && !known.has(entry.id))
      .map((entry) => ({
        value: entry.id,
        label: entry.name || entry.id,
        sub: _skillMeta(entry),
        description: _M().desc(entry),
        tags: entry.tags || []
      }))
      .sort(_M().sortOptionLabel);
  }

  function _passiveOptions(memberId) {
    const member = _CS().getState()?.party?.[memberId] || {};
    const known = new Set(_memberPassives(memberId, member));
    const passiveSource = _CM()?.getVisibleItems?.('passives') || _DS().getAllAsArray('passives');
    const passiveOptions = passiveSource.map((entry) => ({
      value: entry.id,
      label: entry.name || entry.id,
      sub: 'Passive',
      description: _M().desc(entry),
      tags: entry.tags || []
    }));
    const passiveTriggers = new Set(['stat_mod', 'dr_mod', 'element_mod', 'crit_mod', 'evasion_mod', 'accuracy_mod', 'ap_mod', 'movement_mod', 'range_mod', 'cost_mod', 'cooldown_mod', 'damage_mod', 'hp_mod', 'mp_mod', 'status_resist_mod', 'double_action', 'triple_action']);
    const effectOptions = _DS().getAllAsArray('effects')
      .filter((entry) => passiveTriggers.has(entry.trigger))
      .map((entry) => ({
        value: entry.id,
        label: entry.name || entry.id,
        sub: `Effect | ${entry.trigger || ''}`,
        description: _M().desc(entry),
        tags: entry.tags || []
      }));
    return [...passiveOptions, ...effectOptions]
      .filter((entry) => entry.value && !known.has(entry.value))
      .sort(_M().sortOptionLabel);
  }

  function _statusDef(statusId) {
    const custom = _DS().get('statuses', statusId);
    if (custom) return custom;
    const builtins = _C()?.STATUS_DEFINITIONS || {};
    return builtins[statusId] ? { id: statusId, ...builtins[statusId] } : null;
  }

  function _renderJobChip(memberId, member = {}) {
    const F = _F();
    const DS = _DS();
    const esc = _U().esc;
    const jobId = member.currentJob || null;
    if (!jobId) return `<span class="campaign-muted">No job</span>`;
    const job = DS.get('jobs', jobId);
    if (!job) return `<span class="campaign-muted">Unknown job: ${esc(jobId)}</span>`;
    const prog = member.jobProgress?.[jobId] || { xp: 0, level: 1 };
    const cap = F?.getJobMaxLevel ? F.getJobMaxLevel(job) : 10;
    const level = Math.max(1, Number(prog.level || 1));
    const xp = Number(prog.xp || 0);
    const xpToNext = F?.calcJobXpToNextLevel ? F.calcJobXpToNextLevel(job, xp, level) : null;
    const meta = level >= cap ? `(max)` : (xpToNext != null ? `(${xpToNext} XP to next)` : '');
    const personaChip = _renderPersonaChip(memberId, member);
    const personaSuffix = personaChip ? ` <span class="campaign-muted">·</span> ${personaChip}` : '';
    return `${_P().icon(job, { kind: 'job', size: 'xs' })} ${esc(job.name || jobId)} Lv ${level}/${cap} | XP ${xp} ${meta}${personaSuffix}`;
  }

  function _renderPersonaChip(memberId, member = {}) {
    const DS = _DS();
    const esc = _U().esc;
    const escAttr = _U().escAttr;
    const personaId = member.activePersona || null;
    if (!personaId) return '';
    const persona = DS.get('personas', personaId);
    if (!persona) return `<span class="campaign-muted" title="Unknown persona">${esc(personaId)}</span>`;
    const state = _CS().getState();
    const outOfWorld = persona.world && state?.currentWorld && persona.world !== state.currentWorld;
    const worldChip = persona.world ? (DS.get('worlds', persona.world)?.displayName || persona.world) : '';
    const tooltip = outOfWorld
      ? `${persona.name} (${worldChip}) — out of world. Damage dealt ×${Number(persona.crossWorldPenalty?.damageDealtMultiplier ?? 1)}, taken ×${Number(persona.crossWorldPenalty?.damageTakenMultiplier ?? 1)}.`
      : `${persona.name}${worldChip ? ` (${worldChip})` : ''}`;
    const style = outOfWorld ? ' style="color:#f59e0b"' : '';
    return `<span title="${escAttr(tooltip)}"${style}>${esc(persona.icon || '🎭')} ${esc(persona.name)}${outOfWorld ? ' ⚠' : ''}</span>`;
  }

  function _skillMeta(skill = {}, entry = {}) {
    const label = _U().label;
    const parts = [];
    if (skill.ap != null) parts.push(`${skill.ap} AP`);
    if (skill.mp != null) parts.push(`${skill.mp} MP`);
    if (skill.range != null) parts.push(`Range ${skill.range}`);
    if (skill.power != null) parts.push(`Power ${skill.power}`);
    const requiredWeapons = _skillWeaponTypes(skill);
    if (requiredWeapons.length) parts.push(`Weapon ${requiredWeapons.map(label).join('/')}`);
    if (entry.level) parts.push(`Lv ${entry.level}`);
    return parts.join(' | ') || skill.category || skill.type || '';
  }

  function _statName(stat) {
    return _C()?.STAT_NAMES?.[stat] || stat;
  }

  function _skillWeaponTypes(skill = {}) {
    const raw = skill.requiredWeaponTypes || skill.requiredWeaponType || skill.weaponTypeRequired || [];
    return (Array.isArray(raw) ? raw : [raw]).map(_E().cleanType).filter(Boolean);
  }

  // Portrait hero block for the party-sheet modal header. Pairs with
  // `renderRosterMember` in `renderPartySheetHtml` below.
  function _renderPortraitHero(id, member) {
    const P = _P();
    const esc = _U().esc;
    const escAttr = _U().escAttr;
    const initial = (member.name || id || '?').trim().charAt(0).toUpperCase() || '?';
    const portraitSrc = P.memberPortrait(member, id);
    const portraitFocus = P.memberPortraitFocus(member, id);
    const portrait = portraitSrc
      ? `<img src="${escAttr(portraitSrc)}" alt="${escAttr(member.name || id)}" style="${escAttr(P.focusAttrStyle(portraitFocus))}">`
      : `<div class="fallback">${esc(initial)}</div>`;
    const lvl = member.level || 1;
    const rank = member.rank || 'F';
    const klass = member.class || member.archetype || '';
    return `
      <div class="campaign-portrait-hero">
        <div class="campaign-portrait-frame is-large">${portrait}</div>
        <div class="campaign-portrait-meta">
          <h2>${esc(member.name || id)}</h2>
          <div class="campaign-portrait-sub">${esc(klass || 'Adventurer')} · Lv ${lvl} · Rank ${esc(rank)}</div>
          <div class="campaign-chip-row">
            ${(member.tags || []).slice(0, 6).map((t) => `<span class="campaign-chip">${esc(t)}</span>`).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // Frozen helper bundle the render functions default their `h` arg to.
  // Mirrors the old `CampaignUI._tabHelpers()` shape (minus the dead
  // renderPersonaPill / renderSoloNotice / pendingSoloHookCard entries).
  let _tabHelpersCache = null;
  function _tabHelpers() {
    if (_tabHelpersCache) return _tabHelpersCache;
    _tabHelpersCache = Object.freeze({
      memberBase: _memberBase,
      memberRankInfo: _memberRankInfo,
      renderRankBar: _renderRankBar,
      memberStats: _memberStats,
      renderResistances: _renderResistances,
      renderEquipmentLoadout: _renderEquipmentLoadout,
      memberSkillEntries: _memberSkillEntries,
      memberPassives: _memberPassives,
      memberLearnedSkillIds: _memberLearnedSkillIds,
      renderJobChip: _renderJobChip,
      statName: _statName,
      skillMeta: _skillMeta,
      skillEntryId: _skillEntryId,
      statusDef: _statusDef
    });
    return _tabHelpersCache;
  }

  // Party-sheet modal body (portrait hero + full roster member sheet).
  // The party-sheet modal (roster-modal-pickers.ts) has its own click
  // delegate; it just needs the HTML body for both pieces.
  function renderPartySheetHtml(id, member) {
    return _renderPortraitHero(id, member) + renderRosterMember(id, member);
  }

  // ── Renderers ──────────────────────────────────────────────────────

  function renderParty(state, h = _tabHelpers()) {
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

  function renderPartyCard(id, member, h = _tabHelpers()) {
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

  function rosterMemberData(id, member, h = _tabHelpers()) {
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
  function renderRosterMember(id, member, h = _tabHelpers()) {
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
    // Party-sheet modal body (portrait hero + roster member sheet).
    renderPartySheetHtml,
    // Typed roster-tab data (K.3).
    rosterMemberData,
    // Member math + sheet helpers (Phase H.4 — moved here from
    // campaign-ui.js's _tabHelpers cluster). The roster / GM modals read
    // these instead of the old CampaignUI bridges.
    getTabHelpers: _tabHelpers,
    memberRankInfo: _memberRankInfo,
    skillMetaText: _skillMeta,
    characterOptions: _characterOptions,
    skillOptions: _skillOptions,
    passiveOptions: _passiveOptions,
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
