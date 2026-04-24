// status-editor.js
// Browse and understand all status definitions. Shows mechanical behavior,
// which effects use each status. Full editing form for custom statuses.
// "Clone as Custom" for built-in statuses.
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

    // ── Build single merged list: one entry per status ID ──
    // DataStore is the runtime truth (built-ins are seeded at boot).
    // Then add any built-in that somehow isn't in DataStore.
    const merged = new Map(); // id → { ...def, _source }

    // DataStore entries (includes seeded built-ins + custom)
    const dsAll = DS().getAllAsArray('statuses');
    for (const s of dsAll) {
      if (!s.id) continue;
      const isBuiltin = !!defs[s.id];
      // "overridden" = built-in exists AND DataStore has a modified copy
      // "custom" = no built-in counterpart
      // "builtin" = built-in seeded into DataStore, unmodified
      const source = isBuiltin ? 'builtin' : 'custom';
      merged.set(s.id, { ...s, _source: source });
    }

    // Any built-in not yet in DataStore (edge case: editor without combat boot)
    for (const [id, def] of Object.entries(defs)) {
      if (!merged.has(id)) {
        merged.set(id, { id, ...def, _source: 'builtin' });
      }
    }

    // Group by category
    const grouped = {};
    for (const [id, s] of merged) {
      const cat = s.category || 'exotic';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(s);
    }

    let listHtml = '';
    for (const [cat, items] of Object.entries(grouped)) {
      const catInfo = cats[cat] || { name: cat, color: '#888' };
      listHtml += '<div class="status-cat-header" style="border-left:3px solid ' + catInfo.color + '">' + catInfo.name + ' (' + items.length + ')</div>';
      for (const s of items) {
        const active = s.id === _activeId ? 'active' : '';
        const badge = s._source === 'custom'
          ? '<span class="badge" style="background:var(--accent)">custom</span>'
          : '';
        listHtml += '<div class="data-list-item ' + active + '" data-id="' + s.id + '">'
          + '<span>' + (s.icon||'✦') + '</span> <span>' + (s.name||s.id) + '</span>'
          + badge
          + '</div>';
      }
    }

    _container.innerHTML =
      '<div class="flex gap-md" style="height:100%">'
      + '<div style="width:260px;flex-shrink:0;display:flex;flex-direction:column;gap:8px">'
      +   '<div class="flex gap-sm items-center">'
      +     '<input type="search" id="sts-search" placeholder="Search statuses..." style="flex:1">'
      +     '<button class="btn btn-primary btn-sm" id="sts-new">+ Custom</button>'
      +   '</div>'
      +   '<div class="data-list" id="sts-list" style="flex:1;max-height:none;overflow-y:auto">'
      +     listHtml
      +   '</div>'
      + '</div>'
      + '<div style="flex:1;overflow-y:auto" id="sts-detail">'
      +   '<div class="card" style="text-align:center;color:var(--text-mute);padding:40px">'
      +     'Select a status to see its mechanical definition'
      +   '</div>'
      + '</div>'
      + '</div>';

    _container.querySelector('#sts-list').onclick = (e) => {
      const item = e.target.closest('[data-id]');
      if (item) { _activeId = item.dataset.id; _showDetail(_activeId); }
    };

    _container.querySelector('#sts-search').oninput = (e) => {
      const q = e.target.value.toLowerCase();
      _container.querySelectorAll('.data-list-item').forEach(el => {
        el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    };

    _container.querySelector('#sts-new').onclick = () => _createCustom();

    if (_activeId) _showDetail(_activeId);
  }

  function _showDetail(id) {
    const area = _container.querySelector('#sts-detail');
    const defs = C().STATUS_DEFINITIONS;
    const custom = DS().get('statuses', id);
    // DataStore-first (matches runtime: StatusManager, StatCompiler)
    const def = custom || (defs[id] ? { id, ...defs[id] } : null);
    if (!def) { area.innerHTML = '<div class="card">Status not found</div>'; return; }

    // If there's a custom version in DataStore, show editable form (even if
    // a built-in with the same ID exists — the custom one overrides at runtime).
    const isBuiltin = !!defs[id] && !custom;

    if (isBuiltin) {
      _showBuiltinDetail(area, id, def);
    } else {
      _showEditableForm(area, id, def);
    }

    _container.querySelectorAll('.data-list-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === id);
    });
  }

  // ── BUILT-IN STATUS (read-only with Clone button) ─────────────────
  function _showBuiltinDetail(area, id, def) {
    const catInfo = C().STATUS_CATEGORIES[def.category] || { name: 'Unknown', color: '#888' };
    const allEffects = ER().getAllEffects();
    const usedBy = allEffects.filter(e => e.statusId === id);

    const flags = _buildFlagsList(def);
    const statMods = _buildStatModList(def);

    let html = '<div class="card">'
      + '<div class="card-header">'
      +   '<span class="card-title" style="font-size:1.2rem">' + (def.icon||'✦') + ' ' + (def.name||id) + '</span>'
      +   '<span class="badge" style="background:' + catInfo.color + ';color:#fff">' + catInfo.name + '</span>'
      + '</div>'
      + '<p style="color:var(--text);margin:8px 0;font-size:0.9rem">' + (def.desc || 'No description.') + '</p>';

    if (flags.length > 0) {
      html += '<div style="margin:12px 0"><b style="color:var(--accent);font-size:0.85rem">⚙️ Mechanical Behavior:</b>'
        + '<div style="margin-top:4px">'
        + flags.map(f => '<div style="padding:3px 0;font-size:0.85rem">' + f + '</div>').join('')
        + '</div></div>';
    }

    if (statMods.length > 0) {
      html += '<div style="margin:12px 0"><b style="color:var(--gold);font-size:0.85rem">📊 Stat Modifiers:</b>'
        + '<div style="margin-top:4px;font-size:0.85rem">' + statMods.join(', ') + '</div></div>';
    }

    if (usedBy.length > 0) {
      html += '<div style="margin:12px 0"><b style="color:var(--blue);font-size:0.85rem">🔗 Used By Effects:</b>'
        + '<div style="margin-top:4px">'
        + usedBy.map(e => '<span class="chip">' + (e.icon||'✦') + ' ' + (e.name||e.id) + '</span>').join(' ')
        + '</div></div>';
    } else {
      html += '<div style="margin:12px 0;font-size:0.82rem;color:var(--text-dim)">No effects currently apply this status.</div>';
    }

    html += '<div style="margin-top:16px;display:flex;gap:8px">'
      + '<button class="btn btn-primary btn-sm" id="sts-clone">📋 Clone as Custom</button>'
      + '</div>'
      + '<div style="margin-top:8px;font-size:0.78rem;color:var(--text-dim)">'
      + 'ℹ️ Built-in status. Clone it to create a customizable copy.<br><b>ID:</b> ' + id
      + '</div></div>';

    area.innerHTML = html;
    area.querySelector('#sts-clone').onclick = () => _cloneAsCustom(id, def);
  }

  // ── CUSTOM STATUS (editable form) ─────────────────────────────────
  function _showEditableForm(area, id, def) {
    const cats = C().STATUS_CATEGORIES;
    const elements = C().ELEMENTS || ['Fire','Water','Lightning','Nature','Earth','Dark','Light','Wind','Chaos','Physical'];
    const stats = ['S','P','E','C','I','A','L'];
    const statNames = C().STAT_NAMES || { S:'STR', P:'PER', E:'END', C:'CHA', I:'INT', A:'AGI', L:'LCK' };

    const catOpts = Object.entries(cats).map(function(e) {
      return '<option value="' + e[0] + '"' + (def.category===e[0]?' selected':'') + '>' + e[1].name + '</option>';
    }).join('');

    const elementOpts = [''].concat(elements).map(function(e) {
      return '<option value="' + e + '"' + ((def.breaksOnElement||'')===e?' selected':'') + '>' + (e || '— None —') + '</option>';
    }).join('');

    const tickTypeOpts = '<option value="">— None —</option>'
      + elements.map(function(e) { return '<option value="' + e + '"' + (def.tickDamageType===e?' selected':'') + '>' + e + '</option>'; }).join('');

    const statInputs = stats.map(function(s) {
      var val = (def.statMod && def.statMod[s]) || '';
      return '<label style="display:flex;gap:4px;align-items:center;font-size:0.8rem">'
        + '<span style="width:30px;color:var(--text-mute)">' + (statNames[s]||s) + '</span>'
        + '<input type="number" data-stat="' + s + '" class="sts-stat-input" value="' + val + '" style="width:52px;padding:2px 4px;font-size:0.8rem">'
        + '</label>';
    }).join('');

    function ck(field) { return def[field] ? ' checked' : ''; }

    var html = '<div class="card" style="font-size:0.85rem">'
      + '<div class="card-header"><span class="card-title" style="font-size:1.1rem">✏️ Edit: ' + (def.name||id) + '</span></div>'

      // Basic info
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin:12px 0">'
      +   '<div><label class="form-label">Name</label><input type="text" id="sts-name" value="' + (def.name||'') + '" style="width:100%"></div>'
      +   '<div><label class="form-label">Icon (emoji)</label><input type="text" id="sts-icon" value="' + (def.icon||'✦') + '" style="width:100%"></div>'
      +   '<div><label class="form-label">Category</label><select id="sts-category" style="width:100%">' + catOpts + '</select></div>'
      +   '<div><label class="form-label">Description</label><input type="text" id="sts-desc" value="' + _escAttr(def.desc||'') + '" style="width:100%"></div>'
      + '</div>'

      // Behavior flags
      + '<div style="margin:16px 0;border-top:1px solid rgba(255,255,255,0.06);padding-top:12px">'
      + '<b style="color:var(--accent)">⚙️ Behavior Flags</b>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px">'
      +   '<label class="form-check"><input type="checkbox" id="sts-preventsAction"' + ck('preventsAction') + '> 🚫 Prevents Action</label>'
      +   '<label class="form-check"><input type="checkbox" id="sts-preventsMovement"' + ck('preventsMovement') + '> 🚫 Prevents Movement</label>'
      +   '<label class="form-check"><input type="checkbox" id="sts-preventsSkills"' + ck('preventsSkills') + '> 🤐 Prevents Skills</label>'
      +   '<label class="form-check"><input type="checkbox" id="sts-preventsHealing"' + ck('preventsHealing') + '> 🚫 Prevents Healing</label>'
      +   '<label class="form-check"><input type="checkbox" id="sts-breaksOnDamage"' + ck('breaksOnDamage') + '> 💥 Breaks on Damage</label>'
      +   '<label class="form-check"><input type="checkbox" id="sts-breaksOnAction"' + ck('breaksOnAction') + '> ⚔️ Breaks on Action</label>'
      +   '<label class="form-check"><input type="checkbox" id="sts-breaksOnAllyDamage"' + ck('breaksOnAllyDamage') + '> 💔 Breaks on Ally Damage</label>'
      +   '<label class="form-check"><input type="checkbox" id="sts-invisible"' + ck('invisible') + '> 👻 Invisible (untargetable)</label>'
      +   '<label class="form-check"><input type="checkbox" id="sts-autoCounter"' + ck('autoCounter') + '> ⚔️ Auto Counter</label>'
      +   '<label class="form-check"><input type="checkbox" id="sts-redirectDamage"' + ck('redirectDamage') + '> 🛡️ Redirect Ally Damage</label>'
      +   '<label class="form-check"><input type="checkbox" id="sts-killOnExpire"' + ck('killOnExpire') + '> 💀 Kill on Expire</label>'
      +   '<label class="form-check"><input type="checkbox" id="sts-absorbHP"' + ck('absorbHP') + '> 🛡️ Absorb HP (Shield)</label>'
      +   '<label class="form-check"><input type="checkbox" id="sts-tickHeal"' + ck('tickHeal') + '> 💚 Tick Heal</label>'
      +   '<label class="form-check"><input type="checkbox" id="sts-randomTarget"' + ck('randomTarget') + '> 🎲 Random Target</label>'
      +   '<label class="form-check"><input type="checkbox" id="sts-stackable"' + ck('stackable') + '> 📦 Stackable</label>'
      + '</div>'

      // Dropdowns row
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-top:10px">'
      +   '<div><label class="form-label">Duration (turns)</label><input type="number" id="sts-duration" value="' + (def.duration||3) + '" min="0" max="99" style="width:100%"></div>'
      +   '<div><label class="form-label">Max Stacks</label><input type="number" id="sts-maxStacks" value="' + (def.maxStacks||1) + '" min="1" max="99" style="width:100%"></div>'
      +   '<div><label class="form-label">Break Element</label><select id="sts-breaksOnElement" style="width:100%">' + elementOpts + '</select></div>'
      +   '<div><label class="form-label">Tick Damage Type</label><select id="sts-tickDamageType" style="width:100%">' + tickTypeOpts + '</select></div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">'
      +   '<div><label class="form-label">Forced Target</label><select id="sts-forcedTarget" style="width:100%">'
      +     '<option value=""' + (!def.forcedTarget?' selected':'') + '>— None —</option>'
      +     '<option value="source"' + (def.forcedTarget==='source'?' selected':'') + '>Source (taunter)</option>'
      +     '<option value="ally"' + (def.forcedTarget==='ally'?' selected':'') + '>Allies (charm)</option>'
      +   '</select></div>'
      +   '<div><label class="form-label">Absorb Type</label><select id="sts-absorbType" style="width:100%">'
      +     '<option value=""' + (!def.absorbType?' selected':'') + '>All damage</option>'
      +     '<option value="Physical"' + (def.absorbType==='Physical'?' selected':'') + '>Physical only</option>'
      +     '<option value="Magic"' + (def.absorbType==='Magic'?' selected':'') + '>Magic only</option>'
      +   '</select></div>'
      + '</div>'
      + '</div>'

      // Stat modifiers
      + '<div style="margin:16px 0;border-top:1px solid rgba(255,255,255,0.06);padding-top:12px">'
      + '<b style="color:var(--gold)">📊 Stat Modifiers While Active</b>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">' + statInputs + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px">'
      +   '<div><label class="form-label">Move Mod</label><input type="number" id="sts-moveMod" value="' + (def.moveMod||0) + '" style="width:100%"></div>'
      +   '<div><label class="form-label">DR Mod</label><input type="number" id="sts-drMod" value="' + (def.drMod||0) + '" style="width:100%"></div>'
      +   '<div><label class="form-label">Accuracy Mod %</label><input type="number" id="sts-accuracyMod" value="' + (def.accuracyMod||0) + '" style="width:100%"></div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px">'
      +   '<div><label class="form-label">Crit Mod %</label><input type="number" id="sts-critMod" value="' + (def.critMod||0) + '" style="width:100%"></div>'
      +   '<div><label class="form-label">Damage Mod %</label><input type="number" id="sts-damageMod" value="' + (def.damageMod||0) + '" style="width:100%"></div>'
      + '</div>'
      + '</div>'

      // Buttons
      + '<div style="margin-top:16px;display:flex;gap:8px">'
      +   '<button class="btn btn-primary btn-sm" id="sts-save">💾 Save</button>'
      +   '<button class="btn btn-danger btn-sm" id="sts-delete">🗑 Delete</button>'
      + '</div>'
      + '<div style="margin-top:8px;font-size:0.78rem;color:var(--text-dim)"><b>ID:</b> ' + id + '</div>'
      + '</div>';

    area.innerHTML = html;

    area.querySelector('#sts-save').onclick = function() { _saveCustom(id); };
    area.querySelector('#sts-delete').onclick = function() {
      if (confirm('Delete custom status "' + (def.name || id) + '"?')) {
        DS().remove('statuses', id);
        _activeId = null;
        _render();
      }
    };
  }

  // ── SAVE CUSTOM STATUS FROM FORM ──────────────────────────────────
  // Auto-generates engine-compatible fields alongside editor-friendly ones.
  // This bridges the gap between what the editor shows and what the engine needs.
  function _saveCustom(id) {
    var area = _container.querySelector('#sts-detail');
    var f = function(sel) { return area.querySelector(sel); };
    var v = function(sel) { var el = f(sel); return el ? el.value : ''; };
    var n = function(sel) { return parseFloat(v(sel)) || 0; };
    var ch = function(sel) { var el = f(sel); return el ? el.checked : false; };

    var statMod = {};
    area.querySelectorAll('.sts-stat-input').forEach(function(inp) {
      var stat = inp.dataset.stat;
      var val = parseInt(inp.value, 10);
      if (!isNaN(val) && val !== 0) statMod[stat] = val;
    });

    // Read editor-friendly fields
    var preventsAction   = ch('#sts-preventsAction');
    var preventsMovement = ch('#sts-preventsMovement');
    var preventsSkills   = ch('#sts-preventsSkills');
    var preventsHealing  = ch('#sts-preventsHealing');
    var breaksOnDamage   = ch('#sts-breaksOnDamage');
    var breaksOnAction   = ch('#sts-breaksOnAction');
    var breaksOnAllyDmg  = ch('#sts-breaksOnAllyDamage');
    var stackable        = ch('#sts-stackable');
    var tickDmgType      = v('#sts-tickDamageType') || null;
    var category         = v('#sts-category') || 'exotic';

    // ── Auto-generate breakOn array from checkbox flags ──
    var breakOn = [];
    if (breaksOnDamage)  breakOn.push('damage');
    if (breaksOnAction)  breakOn.push('action');
    if (breaksOnAllyDmg) breakOn.push('ally_damage');

    // ── Determine isBuff from category ──
    var isBuff = (category === 'buff');

    // ── Determine element from tickDamageType ──
    var element = tickDmgType || null;

    var updated = {
      id: id,
      name: v('#sts-name') || id,
      icon: v('#sts-icon') || '✦',
      category: category,
      desc: v('#sts-desc') || '',

      // Editor-friendly flags (read by _buildFlagsList for display)
      preventsAction:     preventsAction,
      preventsMovement:   preventsMovement,
      preventsSkills:     preventsSkills,
      preventsHealing:    preventsHealing,
      breaksOnDamage:     breaksOnDamage,
      breaksOnAction:     breaksOnAction,
      breaksOnAllyDamage: breaksOnAllyDmg,
      invisible:          ch('#sts-invisible'),
      autoCounter:        ch('#sts-autoCounter'),
      redirectDamage:     ch('#sts-redirectDamage'),
      killOnExpire:       ch('#sts-killOnExpire'),
      absorbHP:           ch('#sts-absorbHP'),
      tickHeal:           ch('#sts-tickHeal'),
      randomTarget:       ch('#sts-randomTarget'),
      stackable:          stackable,
      maxStacks:          parseInt(v('#sts-maxStacks'), 10) || 1,
      breaksOnElement:    v('#sts-breaksOnElement') || null,
      tickDamageType:     tickDmgType,
      forcedTarget:       v('#sts-forcedTarget') || null,
      absorbType:         v('#sts-absorbType') || null,

      // Inline stat modifiers (read by stat-compiler bridge)
      statMod:     Object.keys(statMod).length > 0 ? statMod : null,
      moveMod:     n('#sts-moveMod') || null,
      drMod:       n('#sts-drMod') || null,
      accuracyMod: n('#sts-accuracyMod') || null,
      critMod:     n('#sts-critMod') || null,
      damageMod:   n('#sts-damageMod') || null,

      // ── ENGINE-COMPATIBLE FIELDS (auto-generated) ──
      // These ensure the engine runtime can read the status correctly
      // without needing to know about the editor's field names.
      preventsActions: preventsAction, // engine uses plural form
      stacks:          stackable,      // engine uses 'stacks' not 'stackable'
      refreshOnReapply: true,          // default: refresh duration on reapply
      isBuff:          isBuff,
      element:         element,
      breakOn:         breakOn.length > 0 ? breakOn : [],
      tickPhase:       'turn_start',   // default tick phase
      duration:        parseInt(v('#sts-duration'), 10) || 3,
      // passiveEffects and tickEffects remain empty arrays — the engine
      // bridges inline modifiers (statMod, etc.) via stat-compiler's
      // _bridgeInlineModifiers, and ticks via tickDamageType/tickHeal.
      passiveEffects:  [],
      tickEffects:     []
    };

    // Clean falsy values for tidiness (keep essentials)
    var keep = ['id','name','icon','category','desc','maxStacks','stackable',
                'preventsActions','stacks','refreshOnReapply','isBuff','breakOn',
                'tickPhase','duration','passiveEffects','tickEffects','element'];
    for (var k in updated) {
      if (keep.indexOf(k) >= 0) continue;
      if (updated[k] === null || updated[k] === false || updated[k] === 0) delete updated[k];
    }
    updated.id = id;
    if (!updated.maxStacks) updated.maxStacks = 1;

    DS().update('statuses', id, updated);
    _render();
    _activeId = id;
    _showDetail(id);
    _toast('Status "' + updated.name + '" saved.');
  }

  // ── CLONE BUILT-IN AS CUSTOM ──────────────────────────────────────
  function _cloneAsCustom(builtinId, def) {
    var baseName = def.name || builtinId;
    var name = prompt('Clone "' + baseName + '" as custom.\nNew name:', 'Custom ' + baseName);
    if (!name) return;
    var newId = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (DS().exists('statuses', newId)) {
      alert('ID "' + newId + '" already exists!');
      return;
    }
    var clone = {};
    for (var k in def) clone[k] = def[k];
    clone.id = newId;
    clone.name = name;
    if (def.statMod) {
      clone.statMod = {};
      for (var s in def.statMod) clone.statMod[s] = def.statMod[s];
    }
    DS().create('statuses', clone);
    _activeId = newId;
    _render();
    _toast('Cloned "' + baseName + '" → "' + name + '"');
  }

  // ── CREATE BLANK CUSTOM ───────────────────────────────────────────
  function _createCustom() {
    var name = prompt('Custom status name:');
    if (!name) return;
    var id = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (DS().exists('statuses', id)) {
      alert('ID "' + id + '" already exists!');
      return;
    }
    DS().create('statuses', {
      id: id, name: name, icon: '✦', category: 'exotic',
      desc: 'Custom status — configure behavior below.',
      stackable: false, maxStacks: 1
    });
    _activeId = id;
    _render();
  }

  // ── HELPERS ────────────────────────────────────────────────────────
  function _buildFlagsList(def) {
    var flags = [];
    if (def.preventsAction)      flags.push('🚫 Cannot act (attack/skills disabled)');
    if (def.preventsMovement)    flags.push('🚫 Cannot move');
    if (def.preventsSkills)      flags.push('🤐 Cannot use skills (basic attack OK)');
    if (def.preventsHealing)     flags.push('🚫 Cannot be healed');
    if (def.breaksOnDamage)      flags.push('💥 Breaks when taking damage');
    if (def.breaksOnAction)      flags.push('⚔️ Breaks after acting');
    if (def.breaksOnAllyDamage)  flags.push('💔 Breaks if ally damages this unit');
    if (def.breaksOnElement)     flags.push('🔥 Breaks from ' + def.breaksOnElement + ' damage');
    if (def.forcedTarget)        flags.push('🎯 Forced target: ' + (def.forcedTarget === 'source' ? 'taunter' : def.forcedTarget));
    if (def.randomTarget)        flags.push('🎲 Actions target randomly');
    if (def.invisible)           flags.push('👻 Cannot be targeted by enemies');
    if (def.autoCounter)         flags.push('⚔️ Auto counter-attacks when hit');
    if (def.redirectDamage)      flags.push('🛡️ Redirects ally damage to self');
    if (def.killOnExpire)        flags.push('💀 Unit DIES when duration expires');
    if (def.absorbHP)            flags.push('🛡️ Creates a damage-absorbing shield');
    if (def.tickHeal)            flags.push('💚 Heals HP each turn');
    if (def.tickDamageType)      flags.push('🔥 Deals ' + def.tickDamageType + ' damage each turn');
    if (def.stackable)           flags.push('📦 Stackable (max ' + (def.maxStacks || '∞') + ')');
    return flags;
  }

  function _buildStatModList(def) {
    var mods = [];
    var names = (C().STAT_NAMES) || {};
    if (def.statMod) {
      for (var s in def.statMod) {
        var val = def.statMod[s];
        mods.push((val > 0 ? '+' : '') + val + ' ' + (names[s] || s));
      }
    }
    if (def.moveMod)      mods.push((def.moveMod > 0 ? '+' : '') + def.moveMod + ' Movement');
    if (def.drMod)         mods.push((def.drMod > 0 ? '+' : '') + def.drMod + ' DR');
    if (def.accuracyMod)   mods.push((def.accuracyMod > 0 ? '+' : '') + def.accuracyMod + '% Accuracy');
    if (def.critMod)       mods.push('+' + def.critMod + '% Crit');
    if (def.damageMod)     mods.push('+' + def.damageMod + '% Damage');
    return mods;
  }

  function _escAttr(s) {
    return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _toast(msg) {
    if (window.CJS.UIHelpers && window.CJS.UIHelpers.toast) {
      window.CJS.UIHelpers.toast(msg);
    } else {
      console.log('[StatusEditor]', msg);
    }
  }

  function refresh() { if (_container) _render(); }
  return Object.freeze({ init: init, refresh: refresh });
})();
