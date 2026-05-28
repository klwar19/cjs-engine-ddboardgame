// cui-modals.js — Modal + picker primitives for Campaign UI.
//
// Extracted from campaign-ui.js. These build small reusable modals
// (form, textarea, number, op picker) on top of the shared `window.CJS.UI`
// helpers. They depend on `Utils.esc` from `src/campaign/util/cui-utils.ts`.

window.CJS = window.CJS || {};
window.CJS.CampaignUIInternal = window.CJS.CampaignUIInternal || {};

window.CJS.CampaignUIInternal.Modals = (function () {
  'use strict';

  function _esc(value) {
    return window.CJS.CampaignUIInternal.Utils.esc(value);
  }

  function _UI() {
    return window.CJS && window.CJS.UI;
  }

  function desc(record = {}) {
    return record.description || record.desc || record.flavor || record.notes || record.effectText || record.summary || '';
  }

  function pickerItem(option) {
    return `
      <div class="campaign-picker-option">
        <strong>${_esc(option.label || option.value)}</strong>
        ${option.sub ? `<small>${_esc(option.sub)}</small>` : ''}
        ${option.description ? `<span>${_esc(option.description)}</span>` : ''}
      </div>
    `;
  }

  function sortOptionLabel(a, b) {
    return String(a.label || '').localeCompare(String(b.label || ''));
  }

  function formLabel(text) {
    const lbl = document.createElement('label');
    lbl.className = 'form-label';
    lbl.textContent = text;
    lbl.style.marginTop = '10px';
    lbl.style.display = 'block';
    return lbl;
  }

  function formModal({ title, body, onSubmit, primaryLabel = 'Apply', width = '480px' }) {
    const footer = document.createElement('div');
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = primaryLabel;
    footer.appendChild(btn);
    const overlay = _UI().openModal({ title, content: body, footer, width });
    btn.onclick = () => {
      const close = onSubmit();
      if (close !== false) _UI().closeModal(overlay);
    };
    return overlay;
  }

  function opPickerModal({ title, options, primaryLabel = 'Apply', placeholder, withQty, qtyLabel = 'Qty', qtyMin = 1, qtyMax = 99, qtyDefault = 1, withDuration, renderItem = pickerItem, onSubmit }) {
    const body = document.createElement('div');
    body.appendChild(formLabel('Select'));
    const select = _UI().createSearchableSelect({ options, placeholder: placeholder || 'Search...', renderItem });
    body.appendChild(select);

    let qty = null;
    if (withQty) {
      body.appendChild(formLabel(qtyLabel));
      qty = _UI().createNumberSlider({ value: qtyDefault, min: qtyMin, max: qtyMax, step: 1 });
      body.appendChild(qty);
    }

    let duration = null;
    if (withDuration) {
      body.appendChild(formLabel('Duration'));
      duration = _UI().createSelect({
        options: [
          { value: 'manual', label: 'Manual (GM clears)' },
          { value: 'scene', label: 'Scene' },
          { value: 'scenario', label: 'Scenario' },
          { value: '3', label: '3 turns' },
          { value: '5', label: '5 turns' },
          { value: '10', label: '10 turns' }
        ],
        value: 'manual'
      });
      body.appendChild(duration);
    }

    return formModal({
      title,
      body,
      primaryLabel,
      onSubmit: () => {
        const value = select._getValue();
        if (!value) {
          _UI().toast('Pick a value first', 'error');
          return false;
        }
        onSubmit({
          value,
          qty: qty ? qty._getValue() : undefined,
          duration: duration ? duration.value : undefined
        });
      }
    });
  }

  function textareaModal({ title, label, placeholder, primaryLabel = 'Save', onSubmit, width = '520px', defaultValue = '' }) {
    const body = document.createElement('div');
    if (label) body.appendChild(formLabel(label));
    const ta = document.createElement('textarea');
    ta.style.width = '100%';
    ta.style.minHeight = '120px';
    ta.placeholder = placeholder || '';
    ta.value = defaultValue;
    body.appendChild(ta);
    return formModal({
      title,
      body,
      primaryLabel,
      width,
      onSubmit: () => onSubmit(ta.value.trim())
    });
  }

  function numberModal({ title, label, primaryLabel = 'Apply', min = 1, max = 999, value = 5, onSubmit }) {
    const body = document.createElement('div');
    body.appendChild(formLabel(label || 'Amount'));
    const slider = _UI().createNumberSlider({ value, min, max, step: 1 });
    body.appendChild(slider);
    return formModal({
      title,
      body,
      primaryLabel,
      onSubmit: () => onSubmit(slider._getValue())
    });
  }

  return Object.freeze({
    desc,
    pickerItem,
    sortOptionLabel,
    formLabel,
    formModal,
    opPickerModal,
    textareaModal,
    numberModal
  });
})();
