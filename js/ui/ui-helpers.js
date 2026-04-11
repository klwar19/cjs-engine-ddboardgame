// ui-helpers.js
// Shared UI components: searchable dropdowns, tag chips, number sliders,
// form validation, toast notifications, modal dialogs, data list rendering.
// Reads: constants.js (for enums)
// Used by: all builder editors
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.UI = (() => {
  'use strict';

  const C = () => window.CJS.CONST;

  // ── TOAST NOTIFICATIONS ─────────────────────────────────────────
  let _toastContainer = null;

  function _ensureToastContainer() {
    if (!_toastContainer) {
      _toastContainer = document.createElement('div');
      _toastContainer.className = 'toast-container';
      document.body.appendChild(_toastContainer);
    }
    return _toastContainer;
  }

  function toast(message, type = 'info', duration = 3000) {
    const container = _ensureToastContainer();
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => { el.remove(); }, duration);
  }

  // ── MODAL DIALOGS ──────────────────────────────────────────────
  function openModal({ title, content, onClose, footer, width }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) closeModal(overlay, onClose); };

    const modal = document.createElement('div');
    modal.className = 'modal';
    if (width) modal.style.maxWidth = width;

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<span class="modal-title">${title || ''}</span>`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => closeModal(overlay, onClose);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    if (typeof content === 'string') {
      const body = document.createElement('div');
      body.innerHTML = content;
      modal.appendChild(body);
    } else if (content instanceof HTMLElement) {
      modal.appendChild(content);
    }

    if (footer) {
      const ft = document.createElement('div');
      ft.className = 'modal-footer';
      if (typeof footer === 'string') ft.innerHTML = footer;
      else if (footer instanceof HTMLElement) ft.appendChild(footer);
      modal.appendChild(ft);
    }

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    return overlay;
  }

  function closeModal(overlay, onClose) {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (typeof onClose === 'function') onClose();
  }

  // ── CONFIRM DIALOG ─────────────────────────────────────────────
  function confirm(message, onYes, onNo) {
    const body = document.createElement('div');
    body.innerHTML = `<p style="margin-bottom:12px">${message}</p>`;

    const footer = document.createElement('div');
    const yesBtn = document.createElement('button');
    yesBtn.className = 'btn btn-danger';
    yesBtn.textContent = 'Yes';
    const noBtn = document.createElement('button');
    noBtn.className = 'btn btn-ghost';
    noBtn.textContent = 'Cancel';

    footer.appendChild(noBtn);
    footer.appendChild(yesBtn);

    const overlay = openModal({ title: 'Confirm', content: body, footer, width: '400px' });
    yesBtn.onclick = () => { closeModal(overlay); if (onYes) onYes(); };
    noBtn.onclick = () => { closeModal(overlay); if (onNo) onNo(); };
  }

  // ── SEARCHABLE SELECT / DROPDOWN ───────────────────────────────
  // Creates a text input that filters a dropdown list
  function createSearchableSelect({ options, value, onChange, placeholder, groupBy, renderItem }) {
    // options: [{ value, label, group?, icon?, sub? }]
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder || 'Search...';
    input.value = _findLabel(options, value) || '';
    input.autocomplete = 'off';

    const dropdown = document.createElement('div');
    dropdown.style.cssText = `
      position:absolute; top:100%; left:0; right:0; z-index:100;
      background:var(--surface2); border:1px solid var(--border);
      border-radius:var(--radius); max-height:250px; overflow-y:auto;
      display:none; box-shadow:var(--shadow);
    `;

    let selectedValue = value;
    let isOpen = false;

    function renderDropdown(filter) {
      const q = (filter || '').toLowerCase();
      let filtered = options;
      if (q) filtered = options.filter(o =>
        (o.label || '').toLowerCase().includes(q) ||
        (o.value || '').toLowerCase().includes(q) ||
        (o.group || '').toLowerCase().includes(q)
      );

      if (groupBy) {
        const groups = {};
        for (const o of filtered) {
          const g = o.group || 'Other';
          if (!groups[g]) groups[g] = [];
          groups[g].push(o);
        }
        dropdown.innerHTML = '';
        for (const [groupName, items] of Object.entries(groups)) {
          const gh = document.createElement('div');
          gh.style.cssText = 'padding:4px 10px;font-size:0.75rem;color:var(--text-mute);font-weight:600;text-transform:uppercase;';
          gh.textContent = groupName;
          dropdown.appendChild(gh);
          for (const item of items) dropdown.appendChild(_makeOption(item));
        }
      } else {
        dropdown.innerHTML = '';
        for (const o of filtered) dropdown.appendChild(_makeOption(o));
      }

      if (filtered.length === 0) {
        dropdown.innerHTML = '<div style="padding:10px;color:var(--text-mute);text-align:center">No results</div>';
      }
    }

    function _makeOption(o) {
      const div = document.createElement('div');
      div.style.cssText = 'padding:6px 10px;cursor:pointer;display:flex;align-items:center;gap:6px;font-size:0.88rem;';
      div.onmouseenter = () => div.style.background = 'var(--surface3)';
      div.onmouseleave = () => div.style.background = '';
      if (renderItem) {
        div.innerHTML = renderItem(o);
      } else {
        div.innerHTML = `${o.icon ? `<span>${o.icon}</span>` : ''}<span>${o.label}</span>${o.sub ? `<span style="margin-left:auto;color:var(--text-dim);font-size:0.8em">${o.sub}</span>` : ''}`;
      }
      div.onclick = () => {
        selectedValue = o.value;
        input.value = o.label;
        dropdown.style.display = 'none';
        isOpen = false;
        if (onChange) onChange(o.value, o);
      };
      return div;
    }

    input.onfocus = () => {
      renderDropdown(input.value === _findLabel(options, selectedValue) ? '' : input.value);
      dropdown.style.display = 'block';
      isOpen = true;
      input.select();
    };
    input.oninput = () => {
      renderDropdown(input.value);
      dropdown.style.display = 'block';
      isOpen = true;
    };
    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target) && isOpen) {
        dropdown.style.display = 'none';
        isOpen = false;
        // Restore display if no change
        input.value = _findLabel(options, selectedValue) || '';
      }
    });

    wrapper.appendChild(input);
    wrapper.appendChild(dropdown);
    wrapper._getValue = () => selectedValue;
    wrapper._setValue = (v) => {
      selectedValue = v;
      input.value = _findLabel(options, v) || '';
    };
    return wrapper;
  }

  function _findLabel(options, value) {
    const o = options.find(o => o.value === value);
    return o ? o.label : null;
  }

  // ── TAG INPUT ──────────────────────────────────────────────────
  function createTagInput({ tags, onChange, placeholder, suggestions }) {
    const wrapper = document.createElement('div');
    const list = document.createElement('div');
    list.className = 'tag-list';
    list.style.marginBottom = '4px';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder || 'Add tag + Enter';
    input.style.width = '150px';

    let currentTags = [...(tags || [])];

    function render() {
      list.innerHTML = '';
      for (const t of currentTags) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.innerHTML = `${t} <button class="tag-remove" title="Remove">&times;</button>`;
        tag.querySelector('.tag-remove').onclick = () => {
          currentTags = currentTags.filter(x => x !== t);
          render();
          if (onChange) onChange(currentTags);
        };
        list.appendChild(tag);
      }
    }

    input.onkeydown = (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        e.preventDefault();
        const val = input.value.trim().toLowerCase();
        if (!currentTags.includes(val)) {
          currentTags.push(val);
          render();
          if (onChange) onChange(currentTags);
        }
        input.value = '';
      }
    };

    render();
    wrapper.appendChild(list);
    wrapper.appendChild(input);
    wrapper._getTags = () => [...currentTags];
    wrapper._setTags = (t) => { currentTags = [...t]; render(); };
    return wrapper;
  }

  // ── NUMBER INPUT WITH SLIDER ───────────────────────────────────
  function createNumberSlider({ value, min, max, step, onChange, label }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'flex items-center gap-sm';

    if (label) {
      const lbl = document.createElement('span');
      lbl.className = 'form-label';
      lbl.textContent = label;
      lbl.style.marginBottom = '0';
      lbl.style.width = '60px';
      wrapper.appendChild(lbl);
    }

    const range = document.createElement('input');
    range.type = 'range';
    range.min = min ?? -50;
    range.max = max ?? 50;
    range.step = step ?? 1;
    range.value = value ?? 0;
    range.style.flex = '1';

    const num = document.createElement('input');
    num.type = 'number';
    num.min = min ?? -99;
    num.max = max ?? 999;
    num.step = step ?? 1;
    num.value = value ?? 0;
    num.style.width = '70px';

    range.oninput = () => {
      num.value = range.value;
      if (onChange) onChange(Number(range.value));
    };
    num.oninput = () => {
      range.value = num.value;
      if (onChange) onChange(Number(num.value));
    };

    wrapper.appendChild(range);
    wrapper.appendChild(num);
    wrapper._getValue = () => Number(num.value);
    wrapper._setValue = (v) => { num.value = v; range.value = v; };
    return wrapper;
  }

  // ── SIMPLE SELECT ──────────────────────────────────────────────
  function createSelect({ options, value, onChange, includeEmpty, emptyLabel }) {
    const sel = document.createElement('select');
    if (includeEmpty) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = emptyLabel || '— Select —';
      sel.appendChild(opt);
    }
    for (const o of options) {
      const opt = document.createElement('option');
      if (typeof o === 'string') {
        opt.value = o; opt.textContent = o;
      } else {
        opt.value = o.value; opt.textContent = o.label;
      }
      if (opt.value === value) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.onchange = () => { if (onChange) onChange(sel.value); };
    sel._getValue = () => sel.value;
    sel._setValue = (v) => { sel.value = v; };
    return sel;
  }

  // ── EFFECT PICKER MODAL ────────────────────────────────────────
  // Opens a modal with searchable effect library, returns chosen effect
  function openEffectPicker(onPick) {
    const ER = window.CJS.EffectRegistry;
    const body = document.createElement('div');

    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Search effects by name, tag, action...';
    search.style.width = '100%';
    search.style.marginBottom = '8px';

    const filterBar = document.createElement('div');
    filterBar.className = 'filter-bar';

    const list = document.createElement('div');
    list.className = 'data-list';
    list.style.maxHeight = '350px';

    let activeCategory = 'all';

    function render(query) {
      let effects;
      if (query) {
        effects = ER.searchEffects(query);
      } else {
        effects = ER.getAllEffects();
      }
      if (activeCategory !== 'all') {
        effects = effects.filter(e => e.category === activeCategory);
      }

      list.innerHTML = '';
      if (effects.length === 0) {
        list.innerHTML = '<div class="data-list-empty">No effects found</div>';
        return;
      }
      for (const eff of effects) {
        const item = document.createElement('div');
        item.className = 'data-list-item';
        item.innerHTML = `
          <span class="item-icon">${eff.icon || '✦'}</span>
          <div>
            <div class="item-name">${eff.name}</div>
            <div class="item-sub">${eff.description || ER.autoDescribe(eff)}</div>
          </div>
        `;
        item.onclick = () => {
          closeModal(overlay);
          if (onPick) onPick(eff);
        };
        list.appendChild(item);
      }
    }

    // Build filter buttons
    const grouped = ER.getEffectsGroupedByCategory();
    const all = ER.getAllEffects();
    filterBar.innerHTML = `<button class="filter-btn active" data-cat="all">All (${all.length})</button>`;
    for (const [cat, items] of Object.entries(grouped)) {
      if (items.length === 0) continue;
      filterBar.innerHTML += `<button class="filter-btn" data-cat="${cat}">${cat} (${items.length})</button>`;
    }
    filterBar.onclick = (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.cat;
      render(search.value);
    };

    search.oninput = () => render(search.value);

    body.appendChild(search);
    body.appendChild(filterBar);
    body.appendChild(list);

    const overlay = openModal({ title: 'Pick Effect', content: body, width: '650px' });
    render('');
    search.focus();
  }

  // ── EFFECT OVERRIDE FORM ───────────────────────────────────────
  // Given an effect, show editable overridable fields
  function createOverrideForm(effect, overrides, onChange) {
    const form = document.createElement('div');
    const overridable = effect.overridable || ['value', 'duration'];
    const current = { ...(overrides || {}) };

    for (const field of overridable) {
      const group = document.createElement('div');
      group.className = 'form-group';
      const label = document.createElement('label');
      label.className = 'form-label';
      label.textContent = field.charAt(0).toUpperCase() + field.slice(1);
      group.appendChild(label);

      if (field === 'value') {
        const slider = createNumberSlider({
          value: current.value ?? effect.value ?? 0,
          min: -100, max: 200,
          onChange: (v) => { current.value = v; if (onChange) onChange(current); }
        });
        group.appendChild(slider);
      } else if (field === 'duration') {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.min = 0; inp.max = 20;
        inp.value = current.duration ?? effect.duration ?? 0;
        inp.onchange = () => { current.duration = Number(inp.value) || null; if (onChange) onChange(current); };
        group.appendChild(inp);
      } else if (field === 'stat') {
        const sel = createSelect({
          options: C().STATS.map(s => ({ value: s, label: `${s} (${C().STAT_NAMES[s]})` })),
          value: current.stat || effect.stat || 'S',
          onChange: (v) => { current.stat = v; if (onChange) onChange(current); }
        });
        group.appendChild(sel);
      } else if (field === 'element') {
        const sel = createSelect({
          options: C().ELEMENTS,
          value: current.element || effect.element || '',
          includeEmpty: true, emptyLabel: '— None —',
          onChange: (v) => { current.element = v || null; if (onChange) onChange(current); }
        });
        group.appendChild(sel);
      } else if (field === 'statusId') {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = current.statusId || effect.statusId || '';
        inp.placeholder = 'Status ID';
        inp.onchange = () => { current.statusId = inp.value; if (onChange) onChange(current); };
        group.appendChild(inp);
      } else if (field === 'drType') {
        const sel = createSelect({
          options: ['physical', 'magic', 'chaos', 'all'],
          value: current.drType || effect.drType || 'physical',
          onChange: (v) => { current.drType = v; if (onChange) onChange(current); }
        });
        group.appendChild(sel);
      } else {
        const inp = document.createElement('input');
        inp.type = typeof effect[field] === 'number' ? 'number' : 'text';
        inp.value = current[field] ?? effect[field] ?? '';
        inp.onchange = () => {
          current[field] = inp.type === 'number' ? Number(inp.value) : inp.value;
          if (onChange) onChange(current);
        };
        group.appendChild(inp);
      }

      form.appendChild(group);
    }

    form._getOverrides = () => ({ ...current });
    return form;
  }

  // ── EFFECT LIST BUILDER ────────────────────────────────────────
  // Reusable "add effects from library" component used by passive/skill/item editors
  function createEffectListBuilder({ effects, onChange }) {
    const container = document.createElement('div');
    let currentEffects = [...(effects || [])]; // [{ effectId, overrides }]

    function render() {
      container.innerHTML = '';

      for (let i = 0; i < currentEffects.length; i++) {
        const ref = currentEffects[i];
        const ER = window.CJS.EffectRegistry;
        const master = ER.getEffect(ref.effectId);
        const chip = document.createElement('div');
        chip.className = 'effect-chip';

        if (master) {
          const resolved = ER.mergeWithOverrides(master, ref.overrides);
          chip.innerHTML = `
            <span class="chip-icon">${master.icon || '✦'}</span>
            <span class="chip-name">${master.name}</span>
            <span class="chip-desc">${ER.autoDescribe(resolved)}</span>
          `;
        } else {
          chip.innerHTML = `
            <span class="chip-icon">⚠️</span>
            <span class="chip-name">${ref.effectId}</span>
            <span class="chip-desc" style="color:var(--red)">Missing effect!</span>
          `;
        }

        const actions = document.createElement('div');
        actions.className = 'chip-actions';

        if (master) {
          const editBtn = document.createElement('button');
          editBtn.className = 'btn-icon';
          editBtn.textContent = '✏️';
          editBtn.title = 'Edit overrides';
          editBtn.onclick = () => _openOverrideEditor(i, ref, master);
          actions.appendChild(editBtn);
        }

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-icon';
        removeBtn.textContent = '❌';
        removeBtn.title = 'Remove';
        removeBtn.onclick = () => {
          currentEffects.splice(i, 1);
          render();
          if (onChange) onChange(currentEffects);
        };
        actions.appendChild(removeBtn);
        chip.appendChild(actions);
        container.appendChild(chip);
      }

      // Add button
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-ghost';
      addBtn.textContent = '+ Add Effect from Library';
      addBtn.onclick = () => {
        openEffectPicker((eff) => {
          currentEffects.push({ effectId: eff.id, overrides: {} });
          render();
          if (onChange) onChange(currentEffects);
        });
      };
      container.appendChild(addBtn);
    }

    function _openOverrideEditor(index, ref, master) {
      const form = createOverrideForm(master, ref.overrides, (ov) => {
        currentEffects[index].overrides = ov;
        if (onChange) onChange(currentEffects);
      });

      const footer = document.createElement('div');
      const doneBtn = document.createElement('button');
      doneBtn.className = 'btn btn-primary';
      doneBtn.textContent = 'Done';
      footer.appendChild(doneBtn);

      const overlay = openModal({
        title: `Override: ${master.name}`,
        content: form,
        footer,
        width: '450px'
      });
      doneBtn.onclick = () => {
        currentEffects[index].overrides = form._getOverrides();
        closeModal(overlay);
        render();
        if (onChange) onChange(currentEffects);
      };
    }

    render();
    container._getEffects = () => JSON.parse(JSON.stringify(currentEffects));
    container._setEffects = (e) => { currentEffects = [...e]; render(); };
    return container;
  }

  // ── DATA LIST RENDERER ────────────────────────────────────────
  function renderDataList({ container, items, activeId, onSelect, renderItem }) {
    container.innerHTML = '';
    if (items.length === 0) {
      container.innerHTML = '<div class="data-list-empty">No items yet</div>';
      return;
    }
    for (const item of items) {
      const el = document.createElement('div');
      el.className = `data-list-item${item.id === activeId ? ' active' : ''}`;
      if (renderItem) {
        el.innerHTML = renderItem(item);
      } else {
        el.innerHTML = `
          <span class="item-icon">${item.icon || '✦'}</span>
          <div>
            <div class="item-name">${item.name || item.id}</div>
            ${item.description ? `<div class="item-sub">${item.description.substring(0, 60)}</div>` : ''}
          </div>
        `;
      }
      el.onclick = () => { if (onSelect) onSelect(item); };
      container.appendChild(el);
    }
  }

  // ── HELPER: build options arrays from constants ────────────────
  function enumOptions(arr, labelFn) {
    return arr.map(v => ({ value: v, label: labelFn ? labelFn(v) : v }));
  }

  function statOptions() {
    return C().STATS.map(s => ({ value: s, label: `${s} — ${C().STAT_NAMES[s]}` }));
  }

  // ── PUBLIC API ─────────────────────────────────────────────────
  return Object.freeze({
    toast, openModal, closeModal, confirm,
    createSearchableSelect, createTagInput, createNumberSlider, createSelect,
    openEffectPicker, createOverrideForm, createEffectListBuilder,
    renderDataList, enumOptions, statOptions
  });
})();
