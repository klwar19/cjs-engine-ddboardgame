// undo-manager.js
// Centralized undo/redo stack for all editor operations.
// Integrated into DataStore — every create/update/replace/remove
// automatically pushes to the stack (when enabled).
//
// Reads: nothing
// Used by: data-store.js (push), editor.html (undo/redo buttons + Ctrl+Z)
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.UndoManager = (() => {
  'use strict';

  const MAX_HISTORY = 50;

  let _stack = [];     // array of UndoEntry
  let _pointer = -1;   // current position (points to last applied action)
  let _enabled = true; // false during bulk loads / imports
  let _subscribers = [];

  // ── UNDO ENTRY ──────────────────────────────────────────────────
  // {
  //   action:     'create' | 'update' | 'replace' | 'remove',
  //   entityType: 'skills' | 'effects' | ...,
  //   entityId:   'skl_001',
  //   before:     { ...snapshotBefore } | null (for create),
  //   after:      { ...snapshotAfter }  | null (for remove),
  //   label:      'Created skill "Fireball"'  (human-readable)
  //   timestamp:  Date.now()
  // }

  // ── PUSH ────────────────────────────────────────────────────────
  // Called by DataStore on every mutation.
  function push(action, entityType, entityId, before, after, label) {
    if (!_enabled) return;

    // Truncate any redo history beyond pointer
    if (_pointer < _stack.length - 1) {
      _stack = _stack.slice(0, _pointer + 1);
    }

    _stack.push({
      action,
      entityType,
      entityId,
      before: before ? _clone(before) : null,
      after:  after  ? _clone(after)  : null,
      label:  label || _autoLabel(action, entityType, entityId, before, after),
      timestamp: Date.now()
    });

    // Cap size
    if (_stack.length > MAX_HISTORY) {
      _stack.shift();
    }

    _pointer = _stack.length - 1;
    _notify();
  }

  // ── UNDO ────────────────────────────────────────────────────────
  function undo() {
    if (_pointer < 0) return null;
    const entry = _stack[_pointer];
    _pointer--;

    // Apply the reverse operation directly to DataStore (bypass undo tracking)
    _enabled = false;
    try {
      _applyReverse(entry);
    } finally {
      _enabled = true;
    }

    _notify();
    return entry;
  }

  // ── REDO ────────────────────────────────────────────────────────
  function redo() {
    if (_pointer >= _stack.length - 1) return null;
    _pointer++;
    const entry = _stack[_pointer];

    _enabled = false;
    try {
      _applyForward(entry);
    } finally {
      _enabled = true;
    }

    _notify();
    return entry;
  }

  // ── APPLY (internal — writes directly to DataStore) ─────────────
  function _applyReverse(entry) {
    var DS = window.CJS.DataStore;
    switch (entry.action) {
      case 'create':
        // Reverse of create = remove
        DS.remove(entry.entityType, entry.entityId);
        break;
      case 'remove':
        // Reverse of remove = re-create with the before snapshot
        if (entry.before) {
          DS.replace(entry.entityType, entry.entityId, _clone(entry.before));
        }
        break;
      case 'update':
      case 'replace':
        // Reverse = restore the before snapshot
        if (entry.before) {
          DS.replace(entry.entityType, entry.entityId, _clone(entry.before));
        }
        break;
    }
  }

  function _applyForward(entry) {
    var DS = window.CJS.DataStore;
    switch (entry.action) {
      case 'create':
        if (entry.after) {
          DS.replace(entry.entityType, entry.entityId, _clone(entry.after));
        }
        break;
      case 'remove':
        DS.remove(entry.entityType, entry.entityId);
        break;
      case 'update':
      case 'replace':
        if (entry.after) {
          DS.replace(entry.entityType, entry.entityId, _clone(entry.after));
        }
        break;
    }
  }

  // ── STATE QUERIES ──────────────────────────────────────────────
  function canUndo()  { return _pointer >= 0; }
  function canRedo()  { return _pointer < _stack.length - 1; }

  function undoLabel() {
    return _pointer >= 0 ? _stack[_pointer].label : null;
  }

  function redoLabel() {
    return _pointer < _stack.length - 1 ? _stack[_pointer + 1].label : null;
  }

  function stackSize() { return _stack.length; }

  // ── ENABLE / DISABLE ──────────────────────────────────────────
  // Disable during bulk operations (loadData, importJSON, seeding)
  function enable()  { _enabled = true; }
  function disable() { _enabled = false; }
  function isEnabled() { return _enabled; }

  // ── CLEAR ─────────────────────────────────────────────────────
  function clear() {
    _stack = [];
    _pointer = -1;
    _notify();
  }

  // ── SUBSCRIBE ─────────────────────────────────────────────────
  // Callback receives { canUndo, canRedo, undoLabel, redoLabel }
  function subscribe(fn) {
    _subscribers.push(fn);
    return function() {
      _subscribers = _subscribers.filter(function(s) { return s !== fn; });
    };
  }

  function _notify() {
    var state = {
      canUndo: canUndo(),
      canRedo: canRedo(),
      undoLabel: undoLabel(),
      redoLabel: redoLabel(),
      stackSize: _stack.length
    };
    for (var i = 0; i < _subscribers.length; i++) {
      try { _subscribers[i](state); } catch(e) { console.error('UndoManager subscriber error:', e); }
    }
  }

  // ── HELPERS ────────────────────────────────────────────────────
  function _clone(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch(e) {
      return obj;
    }
  }

  function _autoLabel(action, type, id, before, after) {
    var name = (after && after.name) || (before && before.name) || id;
    var typeSingular = type.replace(/s$/, '');
    switch (action) {
      case 'create':  return 'Created ' + typeSingular + ' "' + name + '"';
      case 'remove':  return 'Deleted ' + typeSingular + ' "' + name + '"';
      case 'update':  return 'Updated ' + typeSingular + ' "' + name + '"';
      case 'replace': return 'Saved ' + typeSingular + ' "' + name + '"';
      default:        return action + ' ' + typeSingular + ' ' + id;
    }
  }

  // ── PUBLIC API ────────────────────────────────────────────────
  return Object.freeze({
    push: push,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    undoLabel: undoLabel,
    redoLabel: redoLabel,
    stackSize: stackSize,
    enable: enable,
    disable: disable,
    isEnabled: isEnabled,
    clear: clear,
    subscribe: subscribe
  });
})();
