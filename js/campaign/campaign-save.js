// campaign-save.js
// Browser slots, import/export, fork, and GitHub save helpers for Campaign Mode.

window.CJS = window.CJS || {};

window.CJS.CampaignSave = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const Save = () => window.CJS.SaveManager;

  const SLOTS_KEY = 'cjs.campaign.slots.v1';
  const ACTIVE_KEY = 'cjs.campaign.activeSlot.v1';

  function _storage() {
    try { return window.localStorage; }
    catch (_) { return null; }
  }

  function _read(key, fallback) {
    try {
      const raw = _storage()?.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function _write(key, value) {
    const store = _storage();
    if (!store) return false;
    store.setItem(key, JSON.stringify(value));
    return true;
  }

  function getSlots() {
    return _read(SLOTS_KEY, {});
  }

  function getActiveSlotId() {
    return _storage()?.getItem(ACTIVE_KEY) || '';
  }

  function setActiveSlotId(slotId) {
    const store = _storage();
    if (store) store.setItem(ACTIVE_KEY, slotId || '');
  }

  function saveCurrent(slotName) {
    const state = CS().getState();
    if (!state) return null;
    const slots = getSlots();
    const save = CS().clone(state);
    if (slotName) save.slotName = slotName;
    save.lastUpdated = new Date().toISOString();
    slots[save.saveId] = save;
    _write(SLOTS_KEY, slots);
    setActiveSlotId(save.saveId);
    return save;
  }

  function loadSlot(slotId) {
    const save = getSlots()[slotId];
    if (!save) return null;
    CS().setState(save, { source: 'load_slot' });
    setActiveSlotId(slotId);
    return save;
  }

  function loadActive() {
    const active = getActiveSlotId();
    return active ? loadSlot(active) : null;
  }

  function deleteSlot(slotId) {
    const slots = getSlots();
    delete slots[slotId];
    _write(SLOTS_KEY, slots);
    if (getActiveSlotId() === slotId) setActiveSlotId('');
  }

  function forkCurrent(label) {
    const state = CS().getState();
    if (!state) return null;
    const clone = CS().clone(state);
    clone.saveId = `save_${Date.now()}`;
    clone.slotName = label || `${state.slotName || 'Campaign'} Fork`;
    clone.createdAt = new Date().toISOString();
    clone.lastUpdated = clone.createdAt;
    CS().setState(clone, { source: 'fork' });
    return saveCurrent();
  }

  function exportCurrent() {
    const state = CS().getState();
    if (!state || !Save()) return null;
    const filename = `${_safeName(state.slotName || state.saveId)}.save.json`;
    Save().downloadTextFile(filename, `${JSON.stringify(state, null, 2)}\n`, 'application/json');
    return filename;
  }

  async function importFile(file) {
    if (!file) return null;
    const text = await file.text();
    const parsed = JSON.parse(text);
    CS().setState(parsed, { source: 'import' });
    saveCurrent(parsed.slotName || 'Imported Campaign Save');
    return parsed;
  }

  async function pushCurrentToGitHub() {
    const state = CS().getState();
    if (!state || !Save()) return null;
    const file = `${_safeName(state.slotName || state.saveId)}.save.json`;
    const path = `data/campaign_saves/${file}`;
    return Save().saveTextFileToGitHub(path, `${JSON.stringify(state, null, 2)}\n`, {
      message: `Update campaign save ${file}`
    });
  }

  function _safeName(value) {
    return String(value || 'campaign_save')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'campaign_save';
  }

  return Object.freeze({
    getSlots,
    getActiveSlotId,
    setActiveSlotId,
    saveCurrent,
    loadSlot,
    loadActive,
    deleteSlot,
    forkCurrent,
    exportCurrent,
    importFile,
    pushCurrentToGitHub
  });
})();
