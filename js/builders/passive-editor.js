// passive-editor.js
// UI: build passives by composing effects from the master library.
// Reads: data-store.js, effect-registry.js, ui-helpers.js, constants.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.PassiveEditor = (() => {
  'use strict';

  const DS = () => window.CJS.DataStore;
  const ER = () => window.CJS.EffectRegistry;
  const UI = () => window.CJS.UI;
  const CM = () => window.CJS.ContentManager;
  const C  = () => window.CJS.CONST;

  let _container = null, _listEl = null, _formEl = null, _activeId = null;

  function init(containerEl) {
    _container = containerEl;
    _container.innerHTML = `
      <div class="flex gap-md" style="height:100%">
        <div style="width:260px;flex-shrink:0;display:flex;flex-direction:column;gap:8px">
          <div class="flex gap-sm items-center">
            <input type="search" id="pas-search" placeholder="Search passives..." style="flex:1">
            <button class="btn btn-primary btn-sm" id="pas-new">+ New</button>
          </div>
          <div class="data-list" id="pas-list" style="flex:1;max-height:none"></div>
        </div>
        <div style="flex:1;overflow-y:auto" id="pas-form-area">
          <div class="card" style="text-align:center;color:var(--text-mute);padding:40px">
            Select a passive or create a new one
          </div>
        </div>
      </div>
    `;
    _listEl = _container.querySelector('#pas-list');
    _formEl = _container.querySelector('#pas-form-area');
    _container.querySelector('#pas-new').onclick = () => _createNew();
    _container.querySelector('#pas-search').oninput = (e) => _renderList(e.target.value);
    _renderList();
  }

  function _renderList(query) {
    let items = CM()?.getVisibleItems?.('passives', query) || (query ? DS().search('passives', query) : DS().getAllAsArray('passives'));
    UI().renderDataList({
      container: _listEl, items, activeId: _activeId,
      onSelect: (p) => _load(p.id)
    });
  }

  function _createNew() {
    const PROG = C()?.PROGRESSION || {};
    const id = DS().create('passives', {
      name: 'New Passive', icon: '🛡️', description: '', tags: [], effects: [],
      spCost: 1,
      rankPerks: [],
      rankScaling: {
        maxRank: Number(PROG.passiveMaxRankDefault || 5),
        valuePerRank: Number(PROG.passiveRankValuePerRank ?? 0.15)
      },
      rankUpCost: {
        materialId: PROG.passiveRankMaterialDefault || 'haven_memory_shard',
        baseQty: 1,
        qtyPerRank: 1
      }
    });
    _activeId = id;
    _renderList();
    _load(id);
    UI().toast('Passive created', 'success');
  }

  function _load(id) {
    _activeId = id;
    _renderList(_container.querySelector('#pas-search')?.value);
    const p = DS().get('passives', id);
    if (!p) return;
    _renderForm(p);
  }

  function _renderForm(p) {
    const PROG = C()?.PROGRESSION || {};
    const rankScaling = p.rankScaling || {};
    const rankCost = p.rankUpCost || {};
    const rankMaterial = rankCost.materialId || p.rankMaterialId || PROG.passiveRankMaterialDefault || 'haven_memory_shard';
    const maxRankCap = Number(PROG.passiveMaxRankCap || 20);
    _formEl.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">${p.icon || '🛡️'} ${p.name || 'Unnamed'}</span>
          <div class="btn-group">
            <button class="btn btn-ghost btn-sm" id="pas-dup">Duplicate</button>
            <button class="btn btn-danger btn-sm" id="pas-del">Delete</button>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Name</label>
            <input type="text" id="pas-name" value="${_esc(p.name||'')}">
          </div>
          <div class="form-group" style="flex:0 0 240px"><label class="form-label">Icon (emoji or image)</label>
            <div class="cjs-icon-upload" data-icon-upload data-icon-target="pas-icon" data-icon-kind="passive">
              <span class="cjs-icon-preview" data-icon-preview></span>
              <input type="text" id="pas-icon" value="${_esc(p.icon||'🛡️')}" placeholder="emoji or image URL">
              <button type="button" class="btn btn-sm btn-ghost" data-icon-upload-trigger title="Upload image">📁</button>
              <input type="file" accept="image/*" data-icon-upload-input style="display:none">
            </div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:0 0 110px"><label class="form-label">SP Cost</label>
            <input type="number" id="pas-spcost" value="${p.spCost != null ? p.spCost : 1}" min="0" max="20" title="Passive points required to equip this passive">
          </div>
          <div class="form-group" id="pas-tags-area" style="flex:1"><label class="form-label">Tags</label></div>
        </div>
        <h3>Rank Up</h3>
        <div class="form-row">
          <div class="form-group" style="flex:0 0 120px"><label class="form-label">Max Rank</label>
            <input type="number" id="pas-max-rank" value="${Number(rankScaling.maxRank ?? p.maxRank ?? PROG.passiveMaxRankDefault ?? 5)}" min="1" max="${maxRankCap}">
          </div>
          <div class="form-group" style="flex:0 0 140px"><label class="form-label">Value/Rank (%)</label>
            <input type="number" id="pas-rank-value" value="${Number(rankScaling.valuePerRank ?? PROG.passiveRankValuePerRank ?? 0.15) * 100}" min="0" max="100" step="1">
          </div>
          <div class="form-group" style="flex:1"><label class="form-label">Rank Material ID</label>
            <input type="text" id="pas-rank-material" value="${_esc(rankMaterial)}" placeholder="haven_memory_shard">
          </div>
          <div class="form-group" style="flex:0 0 120px"><label class="form-label">Base Qty</label>
            <input type="number" id="pas-rank-base-qty" value="${Number(rankCost.baseQty ?? 1)}" min="1" max="99">
          </div>
          <div class="form-group" style="flex:0 0 120px"><label class="form-label">Qty/Rank</label>
            <input type="number" id="pas-rank-qty-step" value="${Number(rankCost.qtyPerRank ?? 1)}" min="0" max="99">
          </div>
        </div>
        <h3>Rank Perks</h3>
        <div id="pas-rank-perks-area"></div>
        <h3>Effects</h3>
        <div id="pas-effects-area"></div>
        <div class="form-group mt-md"><label class="form-label">Description (auto-generated if blank)</label>
          <textarea id="pas-desc" rows="2">${_esc(p.description||'')}</textarea>
        </div>
        <div class="card" style="background:var(--surface2);margin-top:8px" id="pas-preview"></div>
        <div style="margin-top:12px">
          <button class="btn btn-success" id="pas-save">💾 Save Passive</button>
        </div>
      </div>
    `;

    const tagWidget = UI().createTagInput({ tags: p.tags || [] });
    _formEl.querySelector('#pas-tags-area').appendChild(tagWidget);

    const rankPerksBuilder = _createRankPerksBuilder(p.rankPerks || [], Number(rankScaling.maxRank ?? p.maxRank ?? PROG.passiveMaxRankDefault ?? 5));
    _formEl.querySelector('#pas-rank-perks-area').appendChild(rankPerksBuilder.el);
    _formEl.querySelector('#pas-max-rank').addEventListener('change', () => {
      rankPerksBuilder.setMaxRank(Number(_formEl.querySelector('#pas-max-rank').value) || 5);
    });

    const effectBuilder = UI().createEffectListBuilder({
      effects: p.effects || [],
      onChange: (effs) => _updatePreview(effs)
    });
    _formEl.querySelector('#pas-effects-area').appendChild(effectBuilder);

    _updatePreview(p.effects || []);

    _formEl.querySelector('#pas-save').onclick = () => {
      const materialId = (_formEl.querySelector('#pas-rank-material').value || '').trim() || (PROG.passiveRankMaterialDefault || 'haven_memory_shard');
      DS().replace('passives', p.id, {
        ...p,
        id: p.id,
        name: _formEl.querySelector('#pas-name').value,
        icon: _formEl.querySelector('#pas-icon').value,
        tags: tagWidget._getTags(),
        spCost: Math.max(0, Number(_formEl.querySelector('#pas-spcost').value) || 0),
        rankScaling: {
          ...(p.rankScaling || {}),
          maxRank: Math.min(maxRankCap, Math.max(1, Number(_formEl.querySelector('#pas-max-rank').value) || 1)),
          valuePerRank: Math.max(0, Number(_formEl.querySelector('#pas-rank-value').value) || 0) / 100
        },
        rankUpCost: {
          ...(p.rankUpCost || {}),
          materialId,
          baseQty: Math.max(1, Number(_formEl.querySelector('#pas-rank-base-qty').value) || 1),
          qtyPerRank: Math.max(0, Number(_formEl.querySelector('#pas-rank-qty-step').value) || 0)
        },
        rankPerks: rankPerksBuilder.getPerks(),
        effects: effectBuilder._getEffects(),
        description: _formEl.querySelector('#pas-desc').value || _autoDesc(effectBuilder._getEffects())
      });
      _renderList();
      _load(p.id);
      UI().toast(`"${_formEl.querySelector('#pas-name').value}" saved`, 'success');
    };

    _formEl.querySelector('#pas-dup').onclick = () => {
      const newId = DS().duplicate('passives', p.id);
      if (newId) { _activeId = newId; _renderList(); _load(newId); UI().toast('Duplicated', 'success'); }
    };
    _formEl.querySelector('#pas-del').onclick = () => {
      UI().confirm(`Delete "${p.name}"?`, () => {
        DS().remove('passives', p.id);
        _activeId = null; _renderList();
        _formEl.innerHTML = '<div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select a passive or create a new one</div>';
        UI().toast('Deleted', 'info');
      });
    };
  }

  function _updatePreview(effects) {
    const el = _formEl.querySelector('#pas-preview');
    if (!el) return;
    const resolved = ER().resolveRefs(effects);
    const descs = resolved.map(e => ER().autoDescribe(e));
    el.innerHTML = `<div class="dim" style="font-size:0.82rem"><b>Preview:</b> ${descs.join(', ') || 'No effects'}</div>`;
  }

  function _autoDesc(effects) {
    return ER().resolveRefs(effects).map(e => ER().autoDescribe(e)).join(', ');
  }

  function _createRankPerksBuilder(initialPerks, maxRank) {
    const el = document.createElement('div');
    let perks = JSON.parse(JSON.stringify(initialPerks || [])).map(_normalizeRankPerk);
    let _maxRank = Math.max(1, Number(maxRank || 5));

    function render() {
      el.innerHTML = '';
      perks.sort((a, b) => Number(a.rank || 0) - Number(b.rank || 0));

      for (let i = 0; i < perks.length; i++) {
        const perk = perks[i];
        const m = perk.modifiers || {};
        const row = document.createElement('div');
        row.className = 'rank-perk-row';
        row.dataset.rankPerkRow = String(i);
        row.style.cssText = 'background:var(--surface2);border:1px solid var(--border);border-radius:6px;margin-bottom:8px;padding:10px';
        row.innerHTML = `
          <div class="form-row" style="align-items:flex-end;gap:8px;margin-bottom:6px">
            <div class="form-group" style="flex:0 0 80px">
              <label class="form-label">Rank</label>
              <input type="number" class="rank-perk-rank" value="${Number(perk.rank || 2)}" min="2" max="${_maxRank}" style="width:100%">
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label">Description</label>
              <input type="text" class="rank-perk-desc" value="${_esc(perk.description || '')}" placeholder="PER +1" style="width:100%">
            </div>
            <button type="button" class="btn btn-danger btn-sm rank-perk-remove" style="flex:0 0 auto;margin-bottom:2px">Remove</button>
          </div>
          <div class="form-row" style="gap:8px">
            <div class="form-group" style="flex:0 0 130px">
              <label class="form-label">Base Value +/-</label>
              <input type="number" class="rank-perk-value" value="${_cleanNumber(m.value ?? m.effectValue)}" step="1" style="width:100%">
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label">Add Effects</label>
              <input type="text" class="rank-perk-effects" value="${_esc(_formatEffectRefs(perk.addEffects || perk.effects || []))}" placeholder="stat_mod_per:1, crit_rate_mod:2" style="width:100%">
            </div>
          </div>
        `;

        row.querySelector('.rank-perk-remove').onclick = () => { perks.splice(i, 1); render(); };
        row.querySelectorAll('input').forEach((input) => {
          input.addEventListener('change', () => _syncPerk(i, row));
        });
        el.appendChild(row);
      }

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn btn-ghost btn-sm';
      addBtn.textContent = '+ Add Rank Perk';
      addBtn.disabled = _maxRank < 2;
      addBtn.onclick = () => {
        if (_maxRank < 2) return;
        const usedRanks = new Set(perks.map((p) => Number(p.rank || 0)));
        let nextRank = 2;
        while (usedRanks.has(nextRank) && nextRank <= _maxRank) nextRank++;
        perks.push({ rank: Math.min(nextRank, _maxRank), description: '', modifiers: {}, addEffects: [] });
        render();
      };
      el.appendChild(addBtn);
    }

    function _syncPerk(index, row) {
      const perk = perks[index];
      if (!perk) return;
      perk.rank = Math.min(_maxRank, Math.max(2, Math.floor(Number(row.querySelector('.rank-perk-rank').value) || 2)));
      perk.description = row.querySelector('.rank-perk-desc').value;

      const valueDelta = _cleanNumber(row.querySelector('.rank-perk-value').value);
      perk.modifiers = {};
      if (valueDelta) perk.modifiers.value = valueDelta;
      if (!Object.keys(perk.modifiers).length) delete perk.modifiers;

      const addEffects = _parseEffectRefs(row.querySelector('.rank-perk-effects').value);
      if (addEffects.length) perk.addEffects = addEffects;
      else delete perk.addEffects;
      delete perk.effects;
    }

    render();
    return {
      el,
      getPerks: () => {
        el.querySelectorAll('.rank-perk-row').forEach((row, i) => _syncPerk(i, row));
        return JSON.parse(JSON.stringify(perks.filter((p) => Number(p.rank || 0) > 1).sort((a, b) => Number(a.rank) - Number(b.rank))));
      },
      setMaxRank: (mr) => {
        _maxRank = Math.max(1, Number(mr || 1));
        perks.forEach((p) => { p.rank = Math.min(_maxRank, Math.max(2, Number(p.rank || 2))); });
        render();
      }
    };
  }

  function _normalizeRankPerk(perk = {}) {
    const copy = JSON.parse(JSON.stringify(perk || {}));
    const out = {
      rank: Math.max(2, Number(copy.rank ?? copy.level ?? copy.targetRank ?? 2) || 2),
      description: copy.description || ''
    };
    const valueDelta = _cleanNumber(copy.modifiers?.value ?? copy.modifiers?.effectValue);
    if (valueDelta) out.modifiers = { value: valueDelta };
    const effects = [...(copy.addEffects || []), ...(copy.effects || [])]
      .map(_normalizeEffectRef)
      .filter((ref) => ref.effectId);
    if (effects.length) out.addEffects = effects;
    return out;
  }

  function _normalizeEffectRef(ref) {
    if (!ref) return null;
    if (typeof ref === 'string') return { effectId: ref };
    const out = { ...ref };
    if (!out.effectId && out.id) {
      out.effectId = out.id;
      delete out.id;
    }
    if (out.overrides) out.overrides = { ...out.overrides };
    return out;
  }

  function _formatEffectRefs(refs = []) {
    const normalized = refs.map(_normalizeEffectRef).filter((ref) => ref?.effectId);
    if (!normalized.length) return '';
    const simple = normalized.every((ref) => {
      const keys = Object.keys(ref.overrides || {});
      return keys.length === 0 || (keys.length === 1 && keys[0] === 'value');
    });
    if (!simple) return JSON.stringify(normalized);
    return normalized.map((ref) => {
      const value = ref.overrides?.value;
      return value == null || value === '' ? ref.effectId : `${ref.effectId}:${value}`;
    }).join(', ');
  }

  function _parseEffectRefs(text) {
    const raw = String(text || '').trim();
    if (!raw) return [];
    if (raw.startsWith('[') || raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        return arr.map(_normalizeEffectRef).filter((ref) => ref?.effectId);
      } catch (error) {
        UI().toast('Rank perk effects JSON is invalid', 'error');
        return [];
      }
    }
    return raw.split(/[,;]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [effectId, valueText] = part.split(':').map((s) => s.trim());
        const ref = { effectId };
        if (valueText !== undefined && valueText !== '') {
          const value = Number(valueText);
          if (Number.isFinite(value)) ref.overrides = { value };
        }
        return ref;
      })
      .filter((ref) => ref.effectId);
  }

  function _cleanNumber(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  }

  function _esc(s) { return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function refresh() { if (_container) _renderList(); }

  return Object.freeze({ init, refresh });
})();
