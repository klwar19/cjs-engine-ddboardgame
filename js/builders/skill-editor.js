// skill-editor.js
// UI: build skills by picking effects + setting damage/targeting/QTE params.
// Reads: data-store.js, effect-registry.js, ui-helpers.js, constants.js, formulas.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.SkillEditor = (() => {
  'use strict';

  const C  = () => window.CJS.CONST;
  const DS = () => window.CJS.DataStore;
  const ER = () => window.CJS.EffectRegistry;
  const UI = () => window.CJS.UI;
  const F  = () => window.CJS.Formulas;
  const CM = () => window.CJS.ContentManager;

  let _container, _listEl, _formEl, _activeId = null;

  function init(containerEl) {
    _container = containerEl;
    _container.innerHTML = `
      <div class="flex gap-md" style="height:100%">
        <div style="width:260px;flex-shrink:0;display:flex;flex-direction:column;gap:8px">
          <div class="flex gap-sm items-center">
            <input type="search" id="skl-search" placeholder="Search skills..." style="flex:1">
            <button class="btn btn-primary btn-sm" id="skl-new">+ New</button>
          </div>
          <div class="data-list" id="skl-list" style="flex:1;max-height:none"></div>
        </div>
        <div style="flex:1;overflow-y:auto" id="skl-form-area">
          <div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select a skill or create a new one</div>
        </div>
      </div>
    `;
    _listEl = _container.querySelector('#skl-list');
    _formEl = _container.querySelector('#skl-form-area');
    _container.querySelector('#skl-new').onclick = _createNew;
    _container.querySelector('#skl-search').oninput = (e) => _renderList(e.target.value);
    _renderList();
  }

  function _renderList(q) {
    const items = CM()?.getVisibleItems?.('skills', q) || (q ? DS().search('skills', q) : DS().getAllAsArray('skills'));
    UI().renderDataList({ container: _listEl, items, activeId: _activeId, onSelect: (s) => _load(s.id) });
  }

  function _createNew() {
    const id = DS().create('skills', {
      name: 'New Skill', icon: '⚔️', power: 10, ap: 2, mp: 0, cooldown: 0,
      damageType: 'Physical', element: null, scalingStat: 'S',
      range: 1, aoe: null, aoeSize: 0, qte: 'quickpress',
      requiredWeaponTypes: [],
      effects: [], levelScaling: { powerPerLevel: 0.15, maxLevel: 5 },
      apGain: 1,
      apThresholds: null,
      spCost: 1,
      description: ''
    });
    _activeId = id; _renderList(); _load(id);
    UI().toast('Skill created', 'success');
  }

  function _load(id) {
    _activeId = id;
    _renderList(_container.querySelector('#skl-search')?.value);
    const s = DS().get('skills', id);
    if (!s) return;
    _renderForm(s);
  }

  function _renderForm(s) {
    _formEl.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">${s.icon||'⚔️'} ${s.name||'Unnamed'}</span>
          <div class="btn-group">
            <button class="btn btn-ghost btn-sm" id="skl-dup">Duplicate</button>
            <button class="btn btn-danger btn-sm" id="skl-del">Delete</button>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group"><label class="form-label">Name</label><input type="text" id="skl-name" value="${_esc(s.name||'')}"></div>
          <div class="form-group" style="flex:0 0 80px"><label class="form-label">Icon</label><input type="text" id="skl-icon" value="${_esc(s.icon||'⚔️')}" style="text-align:center;font-size:1.2em"></div>
        </div>

        <h3>Base Stats</h3>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Power</label><input type="number" id="skl-power" value="${s.power||0}" min="0" style="width:100%"></div>
          <div class="form-group"><label class="form-label">AP Cost</label><input type="number" id="skl-ap" value="${s.ap||0}" min="0" max="10" style="width:100%"></div>
          <div class="form-group"><label class="form-label">MP Cost</label><input type="number" id="skl-mp" value="${s.mp||0}" min="0" style="width:100%"></div>
          <div class="form-group"><label class="form-label">Cooldown</label><input type="number" id="skl-cd" value="${s.cooldown||0}" min="0" max="20" style="width:100%"></div>
        </div>

        <div class="form-row">
          <div class="form-group"><label class="form-label">Damage Type</label>
            <select id="skl-dmgtype">${C().DAMAGE_TYPES.map(d=>`<option value="${d}" ${s.damageType===d?'selected':''}>${d}</option>`).join('')}</select>
          </div>
          <div class="form-group"><label class="form-label">Element</label>
            <select id="skl-element"><option value="">— None —</option>${C().ELEMENTS.map(e=>`<option value="${e}" ${s.element===e?'selected':''}>${e}</option>`).join('')}</select>
          </div>
          <div class="form-group"><label class="form-label">Scaling Stat</label>
            <select id="skl-scaling">${C().STATS.map(st=>`<option value="${st}" ${s.scalingStat===st?'selected':''}>${st} — ${C().STAT_NAMES[st]}</option>`).join('')}</select>
          </div>
        </div>

        <h3>Targeting</h3>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Range (cells)</label><input type="number" id="skl-range" value="${s.range||1}" min="0" max="12" style="width:100%"></div>
          <div class="form-group"><label class="form-label">AoE Shape</label>
            <select id="skl-aoe"><option value="">None (single target)</option>${['cone','line','circle','cross'].map(a=>`<option value="${a}" ${s.aoe===a?'selected':''}>${a}</option>`).join('')}</select>
          </div>
          <div class="form-group"><label class="form-label">AoE Size</label><input type="number" id="skl-aoesize" value="${s.aoeSize||0}" min="0" max="6" style="width:100%"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Required Weapon Types</label>
          <div id="skl-weapon-req-area"></div>
          <div class="dim" style="font-size:0.78rem;margin-top:4px">Leave empty for any weapon. Examples: sword, bow, staff, knuckles.</div>
        </div>

        <h3>QTE</h3>
        <div class="form-group">
          <label class="form-label">QTE Type</label>
          <select id="skl-qte">${C().QTE_TYPES.map(q=>`<option value="${q}" ${s.qte===q?'selected':''}>${q}</option>`).join('')}</select>
        </div>

        <h3>Audio <span class="dim" style="font-size:0.78em">— optional per-skill SFX overrides</span></h3>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">On Cast</label>
            <select id="skl-castsfx"></select>
          </div>
          <div class="form-group">
            <label class="form-label">On Hit</label>
            <select id="skl-hitsfx"></select>
          </div>
        </div>
        <div class="dim" style="font-size:0.78rem;margin-top:-2px">
          Leave blank to use the default routing (Magic → magic_&lt;element&gt;, Physical → weapon_hit_&lt;element&gt;).
          Built-in keys (synth fallback) are listed below user-uploaded MP3 ids.
        </div>

        <h3>Additional Effects</h3>
        <div id="skl-effects-area"></div>

        <h3>Level Scaling <span class="dim" style="font-size:0.78em">— gain Ability Points by using this skill in combat</span></h3>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Power/Level (%)</label><input type="number" id="skl-ppl" value="${(s.levelScaling?.powerPerLevel||0.15)*100}" min="0" max="50" step="1" style="width:100%"></div>
          <div class="form-group"><label class="form-label">Max Level</label><input type="number" id="skl-maxlvl" value="${s.levelScaling?.maxLevel||5}" min="1" max="20" style="width:100%"></div>
          <div class="form-group"><label class="form-label">AP per Use</label><input type="number" id="skl-apgain" value="${s.apGain != null ? s.apGain : 1}" min="0" max="20" style="width:100%"></div>
          <div class="form-group"><label class="form-label">SP Cost</label><input type="number" id="skl-spcost" value="${s.spCost != null ? s.spCost : 1}" min="0" max="20" style="width:100%" title="Skill points required to equip this skill"></div>
        </div>
        <div class="form-group">
          <label class="form-label">AP Thresholds <span class="dim" style="font-size:0.78em">(comma-separated cumulative; blank = use default curve)</span></label>
          <input type="text" id="skl-apthresholds" value="${_esc(_apThresholdsToText(s.apThresholds))}" placeholder="0, 8, 20, 36, 56, 80, 110, 145, 185, 230, 280">
          <div class="dim" style="font-size:0.78rem;margin-top:4px">Leave blank to use the default curve from CONST.PROGRESSION.skillApThresholds.</div>
        </div>

        <h3>Level Perks <span class="dim" style="font-size:0.78em">— bonus/ability unlocked at specific skill levels</span></h3>
        <div class="hint-box">Define what changes at each level: stat modifiers (power, AP cost, MP cost, range, cooldown) and/or extra effects. These stack cumulatively.</div>
        <div id="skl-perks-area"></div>

        <div class="form-group mt-md"><label class="form-label">Description</label><textarea id="skl-desc" rows="2">${_esc(s.description||'')}</textarea></div>

        <div class="card" style="background:var(--surface2);margin-top:8px" id="skl-preview"></div>
        <div style="margin-top:12px"><button class="btn btn-success" id="skl-save">💾 Save Skill</button></div>
      </div>
    `;

    const effectBuilder = UI().createEffectListBuilder({ effects: s.effects || [], onChange: () => _preview() });
    _formEl.querySelector('#skl-effects-area').appendChild(effectBuilder);
    const weaponReqWidget = UI().createTagInput({
      tags: Array.isArray(s.requiredWeaponTypes) ? s.requiredWeaponTypes : [s.requiredWeaponTypes].filter(Boolean),
      placeholder: 'bow + Enter',
      suggestions: C().WEAPON_TYPES || []
    });
    _formEl.querySelector('#skl-weapon-req-area').appendChild(weaponReqWidget);

    // Level perks builder
    const perksBuilder = _createLevelPerksBuilder(s.levelPerks || [], Number(s.levelScaling?.maxLevel || 5));
    _formEl.querySelector('#skl-perks-area').appendChild(perksBuilder.el);
    // Refresh perk builder when max level changes
    _formEl.querySelector('#skl-maxlvl').addEventListener('change', () => {
      perksBuilder.setMaxLevel(Number(_formEl.querySelector('#skl-maxlvl').value) || 5);
    });

    _populateSfxSelects(s);

    // Live preview on field changes
    _formEl.querySelectorAll('input,select').forEach(el => el.addEventListener('change', _preview));
    _preview();

    _formEl.querySelector('#skl-save').onclick = () => _save(s.id, effectBuilder, weaponReqWidget, perksBuilder);
    _formEl.querySelector('#skl-dup').onclick = () => { const nid = DS().duplicate('skills', s.id); if(nid){_activeId=nid;_renderList();_load(nid);UI().toast('Duplicated','success');} };
    _formEl.querySelector('#skl-del').onclick = () => { UI().confirm(`Delete "${s.name}"?`, () => { DS().remove('skills', s.id); _activeId=null; _renderList(); _formEl.innerHTML='<div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select a skill</div>'; UI().toast('Deleted','info'); }); };
  }

  function _preview() {
    const el = _formEl.querySelector('#skl-preview');
    if (!el) return;
    const power = Number(_formEl.querySelector('#skl-power')?.value) || 0;
    const stat = 6; // assumed F-rank avg stat
    const avgDmg = Math.floor(Math.sqrt(power) * Math.sqrt(stat));
    el.innerHTML = `<div class="dim" style="font-size:0.82rem">
      <b>Estimated base damage vs F-rank (stat 6):</b> ~${avgDmg}
      | <b>At lvl 10:</b> ~${Math.floor(avgDmg * 2.35)}
      | <b>ID:</b> ${_activeId}
    </div>`;
  }

  function _save(id, effectBuilder, weaponReqWidget, perksBuilder) {
    const f = _formEl;
    const castSfx = f.querySelector('#skl-castsfx')?.value || '';
    const hitSfx  = f.querySelector('#skl-hitsfx')?.value  || '';
    const payload = {
      id,
      name: f.querySelector('#skl-name').value,
      icon: f.querySelector('#skl-icon').value,
      power: Number(f.querySelector('#skl-power').value) || 0,
      ap: Number(f.querySelector('#skl-ap').value) || 0,
      mp: Number(f.querySelector('#skl-mp').value) || 0,
      cooldown: Number(f.querySelector('#skl-cd').value) || 0,
      damageType: f.querySelector('#skl-dmgtype').value,
      element: f.querySelector('#skl-element').value || null,
      scalingStat: f.querySelector('#skl-scaling').value,
      range: Number(f.querySelector('#skl-range').value) || 1,
      aoe: f.querySelector('#skl-aoe').value || null,
      aoeSize: Number(f.querySelector('#skl-aoesize').value) || 0,
      qte: f.querySelector('#skl-qte').value,
      requiredWeaponTypes: weaponReqWidget?._getTags?.() || [],
      effects: effectBuilder._getEffects(),
      levelScaling: {
        powerPerLevel: (Number(f.querySelector('#skl-ppl').value) || 15) / 100,
        maxLevel: Number(f.querySelector('#skl-maxlvl').value) || 10
      },
      apGain: Math.max(0, Number(f.querySelector('#skl-apgain').value) || 0),
      apThresholds: _parseApThresholds(f.querySelector('#skl-apthresholds').value),
      spCost: Math.max(0, Number(f.querySelector('#skl-spcost').value) || 0),
      levelPerks: perksBuilder ? perksBuilder.getPerks() : [],
      description: f.querySelector('#skl-desc').value
    };
    if (castSfx) payload.castSfx = castSfx;
    if (hitSfx)  payload.hitSfx  = hitSfx;
    DS().replace('skills', id, payload);
    _renderList(); _load(id);
    UI().toast('Skill saved', 'success');
  }

  // Populate the cast/hit SFX selects with manifest entries plus built-in
  // synth keys. Both are valid values for AudioManager.playSfx.
  function _populateSfxSelects(s) {
    const castSel = _formEl.querySelector('#skl-castsfx');
    const hitSel  = _formEl.querySelector('#skl-hitsfx');
    if (!castSel || !hitSel) return;

    const AM = window.CJS.AudioManager;
    const finish = () => {
      const manifest = AM?.getManifest ? AM.getManifest() : { sfx: {} };
      const manifestIds = Object.keys(manifest.sfx || {}).sort();
      const builtIns = [
        'magic_cast', 'magic_hit', 'magic_fire', 'magic_ice', 'magic_lightning',
        'magic_holy', 'magic_dark',
        'weapon_slash', 'weapon_pierce', 'weapon_blunt',
        'weapon_hit_physical', 'weapon_hit_fire', 'weapon_hit_ice',
        'weapon_hit_lightning', 'weapon_hit_water', 'weapon_hit_wind',
        'weapon_hit_earth', 'weapon_hit_holy', 'weapon_hit_dark',
        'weapon_bow_shot',
        'voice_attack', 'voice_hurt', 'voice_happy', 'voice_expression',
        'monster_attack', 'monster_hurt',
        'critical', 'heal', 'item_use', 'item_potion', 'item_buff', 'item_throw'
      ];

      function buildOptions(currentVal) {
        let html = '<option value="">-- default --</option>';
        if (manifestIds.length) {
          html += '<optgroup label="Uploaded MP3s">';
          html += manifestIds.map(id =>
            `<option value="${_esc(id)}"${id === currentVal ? ' selected' : ''}>${_esc(id)}</option>`
          ).join('');
          html += '</optgroup>';
        }
        html += '<optgroup label="Built-in (synth fallback)">';
        html += builtIns.map(id =>
          `<option value="${_esc(id)}"${id === currentVal ? ' selected' : ''}>${_esc(id)}</option>`
        ).join('');
        html += '</optgroup>';
        return html;
      }

      castSel.innerHTML = buildOptions(s.castSfx || '');
      hitSel.innerHTML  = buildOptions(s.hitSfx  || '');

      // Preview button next to each select would be nice; skip for now —
      // AudioManager.playSfx(value) from the console works as a quick check.
    };

    if (AM && AM.loadManifest) {
      AM.loadManifest().then(finish).catch(finish);
    } else {
      finish();
    }
  }

  function _apThresholdsToText(thresholds) {
    if (!Array.isArray(thresholds) || !thresholds.length) return '';
    return thresholds.join(', ');
  }

  function _parseApThresholds(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    const parts = text.split(/[\s,]+/).map((part) => Number(part.trim()));
    if (!parts.length || parts.some((n) => Number.isNaN(n))) return null;
    return parts.map((n) => Math.max(0, Math.floor(n)));
  }

  // ── Level Perks Builder ────────────────────────────────────────────
  // Dynamic builder for the skill.levelPerks array.
  // Each perk: { level, description, modifiers: { power, ap, mp, range, cooldown }, addEffects: [] }
  function _createLevelPerksBuilder(initialPerks, maxLevel) {
    const el = document.createElement('div');
    let perks = JSON.parse(JSON.stringify(initialPerks || []));
    let _maxLevel = maxLevel || 5;

    function render() {
      el.innerHTML = '';
      // Sort perks by level
      perks.sort((a, b) => (a.level || 0) - (b.level || 0));

      for (let i = 0; i < perks.length; i++) {
        const perk = perks[i];
        const m = perk.modifiers || {};
        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = 'background:var(--surface2);margin-bottom:8px;padding:10px';
        card.innerHTML = `
          <div class="form-row" style="align-items:flex-end;gap:8px;margin-bottom:6px">
            <div class="form-group" style="flex:0 0 80px">
              <label class="form-label">Level</label>
              <input type="number" class="perk-level" value="${perk.level || 2}" min="2" max="${_maxLevel}" style="width:100%">
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label">Description</label>
              <input type="text" class="perk-desc" value="${_esc(perk.description || '')}" placeholder="e.g. Reduces MP cost, increases range" style="width:100%">
            </div>
            <button class="btn btn-danger btn-sm perk-remove" style="flex:0 0 auto;margin-bottom:2px">✕</button>
          </div>
          <div class="form-row" style="gap:6px">
            <div class="form-group" style="flex:1">
              <label class="form-label" style="font-size:0.75em">Power ±</label>
              <input type="number" class="perk-mod-power" value="${m.power || 0}" style="width:100%">
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label" style="font-size:0.75em">AP ±</label>
              <input type="number" class="perk-mod-ap" value="${m.ap || 0}" style="width:100%">
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label" style="font-size:0.75em">MP ±</label>
              <input type="number" class="perk-mod-mp" value="${m.mp || 0}" style="width:100%">
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label" style="font-size:0.75em">Range ±</label>
              <input type="number" class="perk-mod-range" value="${m.range || 0}" style="width:100%">
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label" style="font-size:0.75em">Cooldown ±</label>
              <input type="number" class="perk-mod-cd" value="${m.cooldown || 0}" style="width:100%">
            </div>
          </div>
          <div class="form-group" style="margin-top:6px">
            <label class="form-label" style="font-size:0.75em">Add Effect IDs <span class="dim">(comma-separated)</span></label>
            <input type="text" class="perk-effects" value="${_esc((perk.addEffects || []).map(e => e.effectId || e).filter(Boolean).join(', '))}" placeholder="e.g. burn_on_hit, extra_damage" style="width:100%">
          </div>
        `;

        // Remove handler
        card.querySelector('.perk-remove').onclick = () => { perks.splice(i, 1); render(); };

        // Live sync on any change
        card.querySelectorAll('input').forEach(inp => {
          inp.addEventListener('change', () => _syncPerk(i, card));
        });

        el.appendChild(card);
      }

      // Add perk button
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-ghost btn-sm';
      addBtn.textContent = '+ Add Level Perk';
      addBtn.onclick = () => {
        // Find next unused level
        const usedLevels = new Set(perks.map(p => p.level));
        let nextLevel = 2;
        while (usedLevels.has(nextLevel) && nextLevel <= _maxLevel) nextLevel++;
        perks.push({ level: Math.min(nextLevel, _maxLevel), description: '', modifiers: {}, addEffects: [] });
        render();
      };
      el.appendChild(addBtn);

      if (!perks.length) {
        const hint = document.createElement('div');
        hint.className = 'dim';
        hint.style.cssText = 'font-size:0.82rem;margin-bottom:6px';
        hint.textContent = 'No level perks yet. Power still scales via Power/Level (%) above. Add perks for extra bonuses at specific levels.';
        el.insertBefore(hint, addBtn);
      }
    }

    function _syncPerk(index, card) {
      const perk = perks[index];
      perk.level = Math.max(2, Number(card.querySelector('.perk-level').value) || 2);
      perk.description = card.querySelector('.perk-desc').value;
      perk.modifiers = {
        power:    Number(card.querySelector('.perk-mod-power').value) || 0,
        ap:       Number(card.querySelector('.perk-mod-ap').value) || 0,
        mp:       Number(card.querySelector('.perk-mod-mp').value) || 0,
        range:    Number(card.querySelector('.perk-mod-range').value) || 0,
        cooldown: Number(card.querySelector('.perk-mod-cd').value) || 0
      };
      // Clean zero modifiers
      for (const [k, v] of Object.entries(perk.modifiers)) { if (!v) delete perk.modifiers[k]; }
      const effectsText = card.querySelector('.perk-effects').value;
      perk.addEffects = effectsText.split(/[,;]+/).map(s => s.trim()).filter(Boolean).map(id => ({ effectId: id }));
    }

    render();
    return {
      el,
      getPerks: () => {
        // Final sync all cards before returning
        const cards = el.querySelectorAll('.card');
        cards.forEach((card, i) => { if (perks[i]) _syncPerk(i, card); });
        return JSON.parse(JSON.stringify(perks.filter(p => p.level > 1)));
      },
      setMaxLevel: (ml) => { _maxLevel = Math.max(1, ml); render(); }
    };
  }

  function _esc(s) { return String(s).replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  function refresh() { if (_container) _renderList(); }
  return Object.freeze({ init, refresh });
})();
