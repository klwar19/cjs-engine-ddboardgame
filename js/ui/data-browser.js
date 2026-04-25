// data-browser.js
// Read-only spreadsheet view of all game data. Filterable, sortable tables
// for effects, skills, items, characters, monsters. Helps track everything
// when content gets large.
window.CJS = window.CJS || {};
window.CJS.DataBrowser = (() => {
  'use strict';
  const C  = () => window.CJS.CONST;
  const DS = () => window.CJS.DataStore;
  const ER = () => window.CJS.EffectRegistry;
  const CM = () => window.CJS.ContentManager;

  let _container, _activeTab = 'effects';

  function init(el) {
    _container = el;
    _render();
  }

  function _render() {
    _container.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;gap:8px">
        <div class="flex gap-sm items-center" style="flex-shrink:0">
          <h3 style="margin:0;color:var(--accent)">📊 Data Browser</h3>
          <div class="btn-group" id="db-tabs">
            ${['effects','skills','items','food','materials','passives','characters','monsters','encounters','crafting','crops','shops','zones','stories','worlds'].map(t =>
              `<button class="btn btn-sm ${t===_activeTab?'btn-primary':''}" data-tab="${t}">${t}</button>`
            ).join('')}
          </div>
          <input type="search" id="db-search" placeholder="Filter..." style="margin-left:auto;width:200px">
        </div>
        <div style="flex:1;overflow:auto" id="db-table-area"></div>
        <div style="flex-shrink:0;font-size:0.78rem;color:var(--text-dim)" id="db-status"></div>
      </div>`;

    _container.querySelector('#db-tabs').onclick = (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      _activeTab = btn.dataset.tab;
      _container.querySelectorAll('#db-tabs .btn').forEach(b => b.classList.remove('btn-primary'));
      btn.classList.add('btn-primary');
      _renderTable();
    };
    _container.querySelector('#db-search').oninput = () => _renderTable();
    _renderTable();
  }

  function _renderTable() {
    const area = _container.querySelector('#db-table-area');
    const status = _container.querySelector('#db-status');
    const q = (_container.querySelector('#db-search')?.value || '').toLowerCase();

    switch (_activeTab) {
      case 'effects':    _renderEffects(area, status, q); break;
      case 'skills':     _renderSkills(area, status, q); break;
      case 'items':      _renderItems(area, status, q); break;
      case 'food':       _renderGeneric(area, status, 'food', q, ['ID','Name','Description','Scope','World','Origin']); break;
      case 'materials':  _renderGeneric(area, status, 'materials', q, ['ID','Name','Description','Scope','World','Origin']); break;
      case 'passives':   _renderPassives(area, status, q); break;
      case 'characters': _renderChars(area, status, q); break;
      case 'monsters':   _renderMonsters(area, status, q); break;
      case 'encounters': _renderEncounters(area, status, q); break;
      case 'crafting':   _renderGeneric(area, status, 'crafting', q, ['ID','Name','Description','Scope','World','Origin']); break;
      case 'crops':      _renderGeneric(area, status, 'crops', q, ['ID','Name','Description','Scope','World','Origin']); break;
      case 'shops':      _renderGeneric(area, status, 'shops', q, ['ID','Name','Description','Scope','World','Origin']); break;
      case 'zones':      _renderGeneric(area, status, 'zones', q, ['ID','Name','Description','Scope','World','Origin']); break;
      case 'stories':    _renderGeneric(area, status, 'stories', q, ['ID','Name','Description','Scope','World','Origin']); break;
      case 'worlds':     _renderWorlds(area, status, q); break;
    }
  }

  function _renderEffects(area, status, q) {
    let items = ER().getAllEffects();
    if (q) items = items.filter(e => _match(e, q));
    const cols = ['ID','Icon','Name','Trigger','Action','Target','Value','Source','Element','Duration','Tags'];
    let rows = items.map(e => [
      e.id, e.icon||'', e.name||'', e.trigger||'', e.action||'', e.target||'',
      e.value??'', e.source||'', e.element||'—', e.duration||'perm',
      (e.tags||[]).join(', ')
    ]);
    area.innerHTML = _table(cols, rows);
    status.textContent = `${items.length} effects`;
  }

  function _renderSkills(area, status, q) {
    let items = CM()?.getVisibleItems?.('skills', q) || DS().getAllAsArray('skills');
    if (q) items = items.filter(e => _match(e, q));
    const cols = ['ID','Icon','Name','Power','AP','MP','CD','Type','Element','Scaling','Range','AoE','QTE','Effects#'];
    let rows = items.map(s => [
      s.id, s.icon||'', s.name||'', s.power||0, s.ap||0, s.mp||0, s.cooldown||0,
      s.damageType||'', s.element||'—', s.scalingStat||'', s.range||1,
      s.aoe||'none', s.qte||'none', (s.effects||[]).length
    ]);
    area.innerHTML = _table(cols, rows);
    status.textContent = `${items.length} skills`;
  }

  function _renderItems(area, status, q) {
    let items = CM()?.getVisibleItems?.('items', q) || DS().getAllAsArray('items');
    if (q) items = items.filter(e => _match(e, q));
    const cols = ['ID','Icon','Name','Slot','Rarity','Effects#','Granted Skills','Base Dmg','Element'];
    let rows = items.map(i => [
      i.id, i.icon||'', i.name||'', i.slot||'', i.rarity||'',
      (i.effects||[]).length, (i.grantedSkills||[]).join(', ')||'—',
      i.weaponData?.baseDamage||'—', i.weaponData?.element||'—'
    ]);
    area.innerHTML = _table(cols, rows);
    status.textContent = `${items.length} items`;
  }

  function _renderPassives(area, status, q) {
    let items = CM()?.getVisibleItems?.('passives', q) || DS().getAllAsArray('passives');
    if (q) items = items.filter(e => _match(e, q));
    const cols = ['ID','Icon','Name','Effects#','Tags','Description'];
    let rows = items.map(p => [
      p.id, p.icon||'', p.name||'', (p.effects||[]).length,
      (p.tags||[]).join(', '), (p.description||'').substring(0,60)
    ]);
    area.innerHTML = _table(cols, rows);
    status.textContent = `${items.length} passives`;
  }

  function _renderChars(area, status, q) {
    let items = CM()?.getVisibleItems?.('characters', q) || DS().getAllAsArray('characters');
    if (q) items = items.filter(e => _match(e, q));
    const cols = ['ID','Icon','Name','Team','Rank','Type','S','P','E','C','I','A','L','Skills#','Items#','Move'];
    let rows = items.map(c => {
      const s = c.stats||{};
      return [c.id, c.icon||'', c.name||'', c.team||'', c.rank||'', c.type||'',
        s.S||0,s.P||0,s.E||0,s.C||0,s.I||0,s.A||0,s.L||0,
        (c.skills||[]).length, (c.equipment||[]).length, c.movement||3];
    });
    area.innerHTML = _table(cols, rows);
    status.textContent = `${items.length} characters`;
  }

  function _renderMonsters(area, status, q) {
    let items = CM()?.getVisibleItems?.('monsters', q) || DS().getAllAsArray('monsters');
    if (q) items = items.filter(e => _match(e, q));
    const cols = ['ID','Icon','Name','Rank','Type','S','P','E','C','I','A','L','Skills#','AI Rules#','Loot#','Move'];
    let rows = items.map(m => {
      const s = m.stats||{};
      return [m.id, m.icon||'', m.name||'', m.rank||'', m.type||'',
        s.S||0,s.P||0,s.E||0,s.C||0,s.I||0,s.A||0,s.L||0,
        (m.skills||[]).length, (m.aiRules||[]).length, (m.loot||[]).length, m.movement||3];
    });
    area.innerHTML = _table(cols, rows);
    status.textContent = `${items.length} monsters`;
  }

  function _renderEncounters(area, status, q) {
    let items = CM()?.getVisibleItems?.('encounters', q) || DS().getAllAsArray('encounters');
    if (q) items = items.filter(e => _match(e, q));
    const cols = ['ID','Name','Grid','Units#','Player Units','Enemy Units'];
    let rows = items.map(e => {
      const units = e.units||[];
      const pUnits = units.filter(u => {
        const c = DS().get('characters', u.id);
        return c && c.team === 'player';
      });
      const eUnits = units.filter(u => {
        const m = DS().get('monsters', u.id);
        return m || (DS().get('characters', u.id)?.team === 'enemy');
      });
      return [e.id, e.name||'', `${e.width||8}×${e.height||8}`, units.length,
        pUnits.map(u=>u.id).join(', '), eUnits.map(u=>u.id).join(', ')];
    });
    area.innerHTML = _table(cols, rows);
    status.textContent = `${items.length} encounters`;
  }

  function _renderGeneric(area, status, type, q, cols) {
    let items = CM()?.getVisibleItems?.(type, q) || DS().getAllAsArray(type);
    if (q) items = items.filter(e => _match(e, q));
    const rows = items.map((item) => [
      item.id || '',
      item.name || '',
      (item.description || item.desc || '').substring(0, 80),
      item._scope || '',
      item._world || '',
      item._origin || ''
    ]);
    area.innerHTML = _table(cols, rows);
    status.textContent = `${items.length} ${type}`;
  }

  function _renderWorlds(area, status, q) {
    let items = DS().getAllAsArray('worlds');
    if (q) items = items.filter(e => _match(e, q));
    const cols = ['ID','Display Name','Ceiling','Order','Tone','Color','Status'];
    const rows = items.map((world) => [
      world.id || '',
      world.displayName || '',
      world.ceiling || '',
      world.order || '',
      world.tone || '',
      world.color || '',
      world.status || ''
    ]);
    area.innerHTML = _table(cols, rows);
    status.textContent = `${items.length} worlds`;
  }

  function _match(obj, q) {
    const str = JSON.stringify(obj).toLowerCase();
    return str.includes(q);
  }

  function _table(cols, rows) {
    let h = '<table class="db-table"><thead><tr>';
    for (const c of cols) h += `<th>${c}</th>`;
    h += '</tr></thead><tbody>';
    if (rows.length === 0) {
      h += `<tr><td colspan="${cols.length}" style="text-align:center;color:var(--text-mute)">No data</td></tr>`;
    }
    for (const row of rows) {
      h += '<tr>';
      for (const cell of row) {
        const val = cell === null || cell === undefined ? '—' : cell;
        h += `<td>${_esc(String(val))}</td>`;
      }
      h += '</tr>';
    }
    h += '</tbody></table>';
    return h;
  }

  function _esc(s) { return s.replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function refresh() { if (_container) _renderTable(); }
  return Object.freeze({ init, refresh });
})();
