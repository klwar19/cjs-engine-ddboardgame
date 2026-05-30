// cui-party-tab.js — Party roster DATA + drawer + pool-picker island.
//
// What remains here after Phase K.3.2:
//   * `rosterMemberData(id, member)` — typed hero / identity / rank /
//     persona pill / job chip / vitals / stats / affinities for a member.
//     The roster TAB and the party-sheet MODAL both render the shared
//     `<RosterMemberCard>` JSX from this data; the detail row (skills /
//     passives / statuses / equipment) is typed `RosterDetailData` from
//     `src/campaign/tabs/data/rosterDetail.ts` rendered as JSX.
//   * `renderParty` / `renderPartyCard` — the command-rail drawer party
//     block (compact cards). Still HTML strings (drawer body bridge).
//   * the option builders (`characterOptions` / `skillOptions` /
//     `passiveOptions`) + member-math helpers consumed by the roster
//     modal/picker action handlers (roster-modal-pickers.ts /
//     gm-override.ts / roster-pickers.ts) via `CampaignUIInternal.PartyTab`.
//   * the imperative pool-picker modals (`openSkillPoolPicker` /
//     `openPassivePoolPicker`).
//
// The icon-heavy detail / sheet / known-row / equipment HTML renderers were
// deleted in K.3.2 — the roster tab + party-sheet modal render JSX now.
//
// The render functions are pure: they read state + a frozen `helpers`
// object (`_tabHelpers()`) carrying the member-math.

window.CJS = window.CJS || {};
window.CJS.CampaignUIInternal = window.CJS.CampaignUIInternal || {};

window.CJS.CampaignUIInternal.PartyTab = (function () {
  'use strict';

  // Sub-module accessors so we never resolve dependencies at module-load
  // time. `cui-utils` etc. always exist by the time render fires.
  const _U = () => window.CJS.CampaignUIInternal.Utils;
  const _P = () => window.CJS.CampaignUIInternal.Portraits;
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

  // ── Member math ────────────────────────────────────────────────────
  // The `_tabHelpers` cluster (member rank / stats / resistances / job
  // chip) feeding `rosterMemberData` + the drawer `renderPartyCard`, plus
  // the option builders the roster modals read.

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
    return (Array.isArray(raw) ? raw : [raw]).map(window.CJS.CampaignUIInternal.Equipment.cleanType).filter(Boolean);
  }

  // Frozen helper bundle the render functions default their `h` arg to.
  // Slimmed in K.3.2 to the member-math `rosterMemberData` + the drawer
  // `renderPartyCard` consume (the detail / known-row / equipment helpers
  // moved to JSX in `src/campaign/tabs/`).
  let _tabHelpersCache = null;
  function _tabHelpers() {
    if (_tabHelpersCache) return _tabHelpersCache;
    _tabHelpersCache = Object.freeze({
      memberBase: _memberBase,
      memberRankInfo: _memberRankInfo,
      renderRankBar: _renderRankBar,
      memberStats: _memberStats,
      renderResistances: _renderResistances,
      renderJobChip: _renderJobChip,
      statName: _statName
    });
    return _tabHelpersCache;
  }

  // ── Renderers ──────────────────────────────────────────────────────

  function renderParty(state, h = _tabHelpers()) {
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

  // ── Roster member typed data (K.3) ─────────────────────────────────
  // `rosterMemberData` powers the shared JSX roster card (hero + vitals +
  // stats + affinities). The detail row (skills / passives / statuses /
  // equipment) is typed `RosterDetailData` from
  // `src/campaign/tabs/data/rosterDetail.ts` rendered as JSX (K.3.2). The
  // portrait / job-chip / affinities arrive as small HTML-bridge strings.

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
      resistancesHtml: h.renderResistances(base, member, stats)
    };
  }

  // ── Pool picker modals ─────────────────────────────────────────────
  // Imperative DOM modals invoked from the shell's action handler
  // (roster-pickers.ts → pick-equip-skill / pick-equip-passive).

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

  // roster tab is React-owned (K.3) — registered as a React mount point
  // by cui-react-bridge.js, rendered as JSX by the shell from the typed
  // getRosterData bridge. The party-sheet modal renders the same shared
  // `<PartySheet>` JSX (mounted via createRoot in roster-modal-pickers.ts).

  return Object.freeze({
    // Sidebar party block (command-rail drawer).
    renderParty,
    renderPartyCard,
    // Typed roster-tab + party-sheet data (K.3 / K.3.2).
    rosterMemberData,
    // Member math + helpers (the roster / GM modals read these).
    getTabHelpers: _tabHelpers,
    memberRankInfo: _memberRankInfo,
    skillMetaText: _skillMeta,
    characterOptions: _characterOptions,
    skillOptions: _skillOptions,
    passiveOptions: _passiveOptions,
    // Pool pickers (called from shell action handler)
    openSkillPoolPicker,
    openPassivePoolPicker,
    // Passive math (used by shell rank-up modal)
    passivePerkRank,
    passiveRankInfo,
    passiveRankCostText
  });
})();
