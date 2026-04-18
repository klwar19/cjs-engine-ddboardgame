// status-editor.js
// Browse and understand all status definitions. Shows mechanical behavior,
// which effects use each status, and allows creating custom statuses.
// Reads: constants.js (STATUS_DEFINITIONS), data-store (statuses collection), effect-registry
window.CJS = window.CJS || {};
window.CJS.StatusEditor = (() => {
  'use strict';
  const C  = () => window.CJS.CONST;
  const DS = () => window.CJS.DataStore;
  const ER = () => window.CJS.EffectRegistry;

  let _container, _activeId = null;

  function init(el) {
    _container = el;
    _render();
  }

  function _render() {
    const defs = C().STATUS_DEFINITIONS;
    const cats = C().STATUS_CATEGORIES;
    const custom = DS().getAllAsArray('statuses');

    // Group built-in by category
    const grouped = {};
    for (const [id, def] of Object.entries(defs)) {
      const cat = def.category || 'exotic';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({ id, ...def, isBuiltin: true });
    }
    // Add custom statuses
    for (const s of custom) {
      const cat = s.category || 'exotic';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({ ...s, isBuiltin: false });
    }

    let listHtml = '';
    for (const [cat, items] of Object.entries(grouped)) {
      const catInfo = cats[cat] || { name: cat, color: '#888' };
      listHtml += `<div class="status-cat-header" style="border-left:3px solid ${catInfo.color}">${catInfo.name} (${items.length})</div>`;
      for (const s of items) {
        const active = s.id === _activeId ? 'active' : '';
        listHtml += `<div class="data-list-item ${active}" data-id="${s.id}">
          <span>${s.icon||'✦'}</span> <span>${s.name||s.id}</span>
          ${s.isBuiltin ? '' : '<span class="badge" style="background:var(--accent)">custom</span>'}
        </div>`;
      }
    }

    _container.innerHTML = `
      <div class="flex gap-md" style="height:100%">
        <div style="width:260px;flex-shrink:0;display:flex;flex-direction:column;gap:8px">
          <div class="flex gap-sm items-center">
            <input type="search" id="sts-search" placeholder="Search statuses..." style="flex:1">
            <button class="btn btn-primary btn-sm" id="sts-new">+ Custom</button>
          </div>
          <div class="data-list" id="sts-list" style="flex:1;max-height:none;overflow-y:auto">
            ${listHtml}
          </div>
        </div>
        <div style="flex:1;overflow-y:auto" id="sts-detail">
          <div class="card" style="text-align:center;color:var(--text-mute);padding:40px">
            Select a status to see its mechanical definition
          </div>
        </div>
      </div>`;

    // Click handler for list
    _container.querySelector('#sts-list').onclick = (e) => {
      const item = e.target.closest('[data-id]');
      if (item) { _activeId = item.dataset.id; _showDetail(_activeId); }
    };

    // Search filter
    _container.querySelector('#sts-search').oninput = (e) => {
      const q = e.target.value.toLowerCase();
      _container.querySelectorAll('.data-list-item').forEach(el => {
        el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    };

    // New custom status
    _container.querySelector('#sts-new').onclick = () => _createCustom();

    if (_activeId) _showDetail(_activeId);
  }

  function _showDetail(id) {
    const area = _container.querySelector('#sts-detail');
    const defs = C().STATUS_DEFINITIONS;
    const custom = DS().get('statuses', id);
    const def = defs[id] || custom;
    if (!def) { area.innerHTML = '<div class="card">Status not found</div>'; return; }

    const isBuiltin = !!defs[id];
    const catInfo = C().STATUS_CATEGORIES[def.category] || { name: 'Unknown', color: '#888' };

    // Find effects that reference this status
    const allEffects = ER().getAllEffects();
    const usedBy = allEffects.filter(e => e.statusId === id || (e.action === 'status_apply' && e.statusId === id));

    // Build behavior flags display
    const flags = [];
    if (def.preventsAction)    flags.push('🚫 Cannot act (attack/skills disabled)');
    if (def.preventsMovement)  flags.push('🚫 Cannot move');
    if (def.preventsSkills)    flags.push('🤐 Cannot use skills (basic attack OK)');
    if (def.preventsHealing)   flags.push('🚫 Cannot be healed');
    if (def.breaksOnDamage)    flags.push('💥 Breaks when taking damage');
    if (def.breaksOnAction)    flags.push('⚔️ Breaks after acting');
    if (def.breaksOnAllyDamage) flags.push('💔 Breaks if ally damages this unit');
    if (def.breaksOnElement)   flags.push(`🔥 Breaks from ${def.breaksOnElement} damage`);
    if (def.forcedTarget)      flags.push(`🎯 Forced to target: ${def.forcedTarget === 'source' ? 'the unit that applied this' : def.forcedTarget}`);
    if (def.randomTarget)      flags.push('🎲 Actions target randomly');
    if (def.invisible)         flags.push('👻 Cannot be targeted by enemies');
    if (def.autoCounter)       flags.push('⚔️ Auto counter-attacks when hit');
    if (def.redirectDamage)    flags.push('🛡️ Redirects ally damage to self');
    if (def.killOnExpire)      flags.push('💀 Unit DIES when duration expires');
    if (def.absorbHP)          flags.push('🛡️ Creates a damage-absorbing shield');
    if (def.tickHeal)          flags.push('💚 Heals HP each turn');
    if (def.tickDamageType)    flags.push(`🔥 Deals ${def.tickDamageType} damage each turn`);
    if (def.stackable)         flags.push(`📦 Stackable (max ${def.maxStacks || '∞'} stacks)`);

    const statMods = [];
    if (def.statMod) {
      for (const [stat, val] of Object.entries(def.statMod)) {
        const name = C().STAT_NAMES[stat] || stat;
        statMods.push(`${val > 0 ? '+' : ''}${val} ${name}`);
      }
    }
    if (def.moveMod)      statMods.push(`${def.moveMod > 0 ? '+' : ''}${def.moveMod} Movement`);
    if (def.drMod)         statMods.push(`${def.drMod > 0 ? '+' : ''}${def.drMod} DR`);
    if (def.accuracyMod)   statMods.push(`${def.accuracyMod > 0 ? '+' : ''}${def.accuracyMod}% Accuracy`);
    if (def.critMod)       statMods.push(`+${def.critMod}% Crit Chance`);
    if (def.damageMod)     statMods.push(`+${def.damageMod}% Damage`);

    area.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title" style="font-size:1.2rem">${def.icon||'✦'} ${def.name||id}</span>
          <span class="badge" style="background:${catInfo.color};color:#fff">${catInfo.name}</span>
        </div>

        <p style="color:var(--text);margin:8px 0;font-size:0.9rem">${def.desc || 'No description.'}</p>

        ${flags.length > 0 ? `
        <div style="margin:12px 0">
          <b style="color:var(--accent);font-size:0.85rem">⚙️ Mechanical Behavior:</b>
          <div style="margin-top:4px">
            ${flags.map(f => `<div style="padding:3px 0;font-size:0.85rem">${f}</div>`).join('')}
          </div>
        </div>` : ''}

        ${statMods.length > 0 ? `
        <div style="margin:12px 0">
          <b style="color:var(--gold);font-size:0.85rem">📊 Stat Modifiers While Active:</b>
          <div style="margin-top:4px;font-size:0.85rem">${statMods.join(', ')}</div>
        </div>` : ''}

        ${usedBy.length > 0 ? `
        <div style="margin:12px 0">
          <b style="color:var(--blue);font-size:0.85rem">🔗 Used By Effects:</b>
          <div style="margin-top:4px">
            ${usedBy.map(e => `<span class="chip">${e.icon||'✦'} ${e.name||e.id}</span>`).join(' ')}
          </div>
        </div>` : '<div style="margin:12px 0;font-size:0.82rem;color:var(--text-dim)">No effects currently apply this status.</div>'}

        ${isBuiltin ? `<div style="margin-top:12px;font-size:0.78rem;color:var(--text-dim)">
          ℹ️ This is a built-in status. Its behavior is defined in constants.js.
          Effects can apply it using action "status_apply" with statusId "${id}".
        </div>` : `
        <div style="margin-top:16px">
          <button class="btn btn-danger btn-sm" id="sts-delete">Delete Custom Status</button>
        </div>`}

        <div style="margin-top:8px;font-size:0.78rem;color:var(--text-dim)"><b>ID:</b> ${id}</div>
      </div>`;

    // Highlight active in list
    _container.querySelectorAll('.data-list-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === id);
    });

    // Delete handler for custom
    const delBtn = area.querySelector('#sts-delete');
    if (delBtn) {
      delBtn.onclick = () => {
        DS().remove('statuses', id);
        _activeId = null;
        _render();
      };
    }
  }

  function _createCustom() {
    const name = prompt('Custom status name:');
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    DS().create('statuses', {
      id, name, icon: '✦', category: 'exotic',
      desc: 'Custom status — edit behavior flags here.',
      preventsAction: false, preventsMovement: false,
      breaksOnDamage: false, stackable: false, maxStacks: 1
    });
    _activeId = id;
    _render();
  }

  function refresh() { if (_container) _render(); }
  return Object.freeze({ init, refresh });
})();
