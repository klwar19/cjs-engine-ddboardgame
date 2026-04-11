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
    const items = q ? DS().search('skills', q) : DS().getAllAsArray('skills');
    UI().renderDataList({ container: _listEl, items, activeId: _activeId, onSelect: (s) => _load(s.id) });
  }

  function _createNew() {
    const id = DS().create('skills', {
      name: 'New Skill', icon: '⚔️', power: 10, ap: 2, mp: 0, cooldown: 0,
      damageType: 'Physical', element: null, scalingStat: 'S',
      range: 1, aoe: null, aoeSize: 0, qte: 'quickpress',
      effects: [], levelScaling: { powerPerLevel: 0.15, maxLevel: 10 }, description: ''
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

        <h3>QTE</h3>
        <div class="form-group">
          <label class="form-label">QTE Type</label>
          <select id="skl-qte">${C().QTE_TYPES.map(q=>`<option value="${q}" ${s.qte===q?'selected':''}>${q}</option>`).join('')}</select>
        </div>

        <h3>Additional Effects</h3>
        <div id="skl-effects-area"></div>

        <h3>Level Scaling</h3>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Power/Level (%)</label><input type="number" id="skl-ppl" value="${(s.levelScaling?.powerPerLevel||0.15)*100}" min="0" max="50" step="1" style="width:100%"></div>
          <div class="form-group"><label class="form-label">Max Level</label><input type="number" id="skl-maxlvl" value="${s.levelScaling?.maxLevel||10}" min="1" max="20" style="width:100%"></div>
        </div>

        <div class="form-group mt-md"><label class="form-label">Description</label><textarea id="skl-desc" rows="2">${_esc(s.description||'')}</textarea></div>

        <div class="card" style="background:var(--surface2);margin-top:8px" id="skl-preview"></div>
        <div style="margin-top:12px"><button class="btn btn-success" id="skl-save">💾 Save Skill</button></div>
      </div>
    `;

    const effectBuilder = UI().createEffectListBuilder({ effects: s.effects || [], onChange: () => _preview() });
    _formEl.querySelector('#skl-effects-area').appendChild(effectBuilder);

    // Live preview on field changes
    _formEl.querySelectorAll('input,select').forEach(el => el.addEventListener('change', _preview));
    _preview();

    _formEl.querySelector('#skl-save').onclick = () => _save(s.id, effectBuilder);
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

  function _save(id, effectBuilder) {
    const f = _formEl;
    DS().replace('skills', id, {
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
      effects: effectBuilder._getEffects(),
      levelScaling: {
        powerPerLevel: (Number(f.querySelector('#skl-ppl').value) || 15) / 100,
        maxLevel: Number(f.querySelector('#skl-maxlvl').value) || 10
      },
      description: f.querySelector('#skl-desc').value
    });
    _renderList(); _load(id);
    UI().toast('Skill saved', 'success');
  }

  function _esc(s) { return String(s).replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  function refresh() { if (_container) _renderList(); }
  return Object.freeze({ init, refresh });
})();
