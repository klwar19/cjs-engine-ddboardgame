// campaign-save.js
// Browser slots, import/export, fork, and GitHub save helpers for Campaign Mode.
//
// Save compatibility: every save records a CURRENT_SAVE_VERSION at write
// time. When the engine loads a save and the recorded version is below
// the current code version, the slot is flagged as incompatible. The UI
// surfaces a clear "this save is from an older build — start a fresh one
// or delete this slot" instead of silently mutating the old save into an
// undefined state.

window.CJS = window.CJS || {};

window.CJS.CampaignSave = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const Save = () => window.CJS.SaveManager;

  const SLOTS_KEY = 'cjs.campaign.slots.v1';
  const ACTIVE_KEY = 'cjs.campaign.activeSlot.v1';

  // Bump this whenever the save shape changes in a way that makes older
  // saves unsafe to silently load. The chapter rebuild + sequence-VN
  // rework reset the storyMode bookkeeping, so 4 -> 5.
  const CURRENT_SAVE_VERSION = 5;
  const MIN_COMPATIBLE_VERSION = 5;

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

  function isCompatible(save) {
    if (!save) return false;
    const v = Number(save.saveVersion || 0);
    return v >= MIN_COMPATIBLE_VERSION;
  }

  function describeIncompatibility(save) {
    if (!save) return 'No save data.';
    const v = Number(save.saveVersion || 0);
    if (v >= MIN_COMPATIBLE_VERSION) return '';
    if (v === 0) return 'Save is from a pre-versioned build and cannot be migrated.';
    return `Save was made by an older build (version ${v}). Current build requires version ${MIN_COMPATIBLE_VERSION} or newer.`;
  }

  function currentSaveVersion() { return CURRENT_SAVE_VERSION; }
  function minCompatibleVersion() { return MIN_COMPATIBLE_VERSION; }

  function saveCurrent(slotName) {
    const state = CS().getState();
    if (!state) return null;
    const slots = getSlots();
    const save = CS().clone(state);
    if (slotName) save.slotName = slotName;
    save.saveVersion = CURRENT_SAVE_VERSION;
    save.lastUpdated = new Date().toISOString();
    slots[save.saveId] = save;
    _write(SLOTS_KEY, slots);
    setActiveSlotId(save.saveId);
    return save;
  }

  function loadSlot(slotId, options = {}) {
    const save = getSlots()[slotId];
    if (!save) return null;
    if (!options.force && !isCompatible(save)) {
      return { incompatible: true, reason: describeIncompatibility(save), save };
    }
    CS().setState(save, { source: 'load_slot' });
    setActiveSlotId(slotId);
    return save;
  }

  function loadActive() {
    const active = getActiveSlotId();
    if (!active) return null;
    const result = loadSlot(active);
    if (result && result.incompatible) {
      // Surface the incompatibility — caller decides whether to clear or
      // prompt. We never silently overwrite an incompatible save.
      return result;
    }
    return result;
  }

  function deleteSlot(slotId) {
    const slots = getSlots();
    delete slots[slotId];
    _write(SLOTS_KEY, slots);
    if (getActiveSlotId() === slotId) setActiveSlotId('');
  }

  function deleteAllSlots() {
    _write(SLOTS_KEY, {});
    setActiveSlotId('');
  }

  function forkCurrent(label) {
    const state = CS().getState();
    if (!state) return null;
    const clone = CS().clone(state);
    clone.saveId = `save_${Date.now()}`;
    clone.slotName = label || `${state.slotName || 'Campaign'} Fork`;
    clone.saveVersion = CURRENT_SAVE_VERSION;
    clone.createdAt = new Date().toISOString();
    clone.lastUpdated = clone.createdAt;
    CS().setState(clone, { source: 'fork' });
    return saveCurrent();
  }

  function exportCurrent() {
    const state = CS().getState();
    if (!state || !Save()) return null;
    const filename = `${_safeName(state.slotName || state.saveId)}.save.json`;
    state.saveVersion = state.saveVersion || CURRENT_SAVE_VERSION;
    Save().downloadTextFile(filename, `${JSON.stringify(state, null, 2)}\n`, 'application/json');
    return filename;
  }

  async function importFile(file) {
    if (!file) return null;
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!isCompatible(parsed)) {
      const error = new Error(describeIncompatibility(parsed) || 'Incompatible save file.');
      error.incompatible = true;
      throw error;
    }
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
    deleteAllSlots,
    forkCurrent,
    exportCurrent,
    importFile,
    pushCurrentToGitHub,
    isCompatible,
    describeIncompatibility,
    currentSaveVersion,
    minCompatibleVersion
  });
})();
