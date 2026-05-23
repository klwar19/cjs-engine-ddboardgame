// touch-gestures.js
// Lightweight, dependency-free touch gesture support. Use it to add tap,
// long-press, swipe, and pinch-zoom recognition to any element. Designed
// for the combat grid + campaign cards on iPad and other touch tablets.
//
// Usage:
//   const detach = window.CJS.TouchGestures.attach(element, {
//     onTap:      ({ x, y }) => {...},
//     onLongPress:({ x, y }) => {...},
//     onSwipe:    ({ direction, dx, dy, velocity }) => {...},
//     onPinch:    ({ scale, centerX, centerY }) => {...},
//     onDoubleTap:({ x, y }) => {...}
//   });
//
// All callbacks are optional. attach() returns a detach function. Multiple
// gestures may be enabled per element — the recognizer disambiguates based
// on movement thresholds and timing.

window.CJS = window.CJS || {};

window.CJS.TouchGestures = (() => {
  'use strict';

  const TAP_MAX_MS = 250;
  const TAP_MAX_DIST = 8;         // px
  const LONGPRESS_MS = 550;
  const LONGPRESS_MAX_DIST = 10;  // px
  const SWIPE_MIN_DIST = 24;
  const SWIPE_MAX_OFFAXIS = 0.6;  // ratio
  const DOUBLE_TAP_MS = 280;

  function attach(element, handlers = {}) {
    if (!element || typeof element.addEventListener !== 'function') return () => {};

    const state = {
      startX: 0,
      startY: 0,
      startTime: 0,
      lastTapTime: 0,
      lastTapX: 0,
      lastTapY: 0,
      longPressTimer: 0,
      activePointers: new Map(),
      pinchStartDist: 0,
      pinchStartScale: 1
    };

    function _now() { return performance.now(); }

    function _dist(a, b) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return Math.hypot(dx, dy);
    }

    function _center(a, b) {
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    function _onPointerDown(ev) {
      // Only track primary fingers / mouse.
      const x = ev.clientX;
      const y = ev.clientY;
      state.activePointers.set(ev.pointerId, { x, y, startX: x, startY: y });

      if (state.activePointers.size === 1) {
        state.startX = x;
        state.startY = y;
        state.startTime = _now();
        // Long-press timer.
        if (handlers.onLongPress) {
          state.longPressTimer = setTimeout(() => {
            const pt = state.activePointers.get(ev.pointerId);
            if (!pt) return;
            const moved = Math.hypot(pt.x - state.startX, pt.y - state.startY);
            if (moved <= LONGPRESS_MAX_DIST) {
              handlers.onLongPress({ x: pt.x, y: pt.y, event: ev });
              state.startTime = 0;  // consume so tap doesn't also fire
            }
          }, LONGPRESS_MS);
        }
      }
      if (state.activePointers.size === 2 && handlers.onPinch) {
        const [a, b] = [...state.activePointers.values()];
        state.pinchStartDist = _dist(a, b) || 1;
        state.pinchStartScale = 1;
      }
      try { element.setPointerCapture(ev.pointerId); } catch (e) {}
    }

    function _onPointerMove(ev) {
      const pt = state.activePointers.get(ev.pointerId);
      if (!pt) return;
      pt.x = ev.clientX;
      pt.y = ev.clientY;

      // If moved past tap distance, cancel longpress.
      const moved = Math.hypot(pt.x - pt.startX, pt.y - pt.startY);
      if (state.longPressTimer && moved > LONGPRESS_MAX_DIST) {
        clearTimeout(state.longPressTimer);
        state.longPressTimer = 0;
      }

      // Two-finger pinch detection.
      if (state.activePointers.size === 2 && handlers.onPinch) {
        const [a, b] = [...state.activePointers.values()];
        const d = _dist(a, b) || 1;
        const scale = d / state.pinchStartDist;
        const c = _center(a, b);
        handlers.onPinch({
          scale,
          delta: scale - state.pinchStartScale,
          centerX: c.x,
          centerY: c.y,
          event: ev
        });
        state.pinchStartScale = scale;
      }
    }

    function _onPointerUp(ev) {
      const pt = state.activePointers.get(ev.pointerId);
      if (!pt) return;
      state.activePointers.delete(ev.pointerId);

      if (state.longPressTimer) {
        clearTimeout(state.longPressTimer);
        state.longPressTimer = 0;
      }

      // Single-finger gestures (only when last pointer up + still had a start).
      if (state.activePointers.size === 0 && state.startTime) {
        const elapsed = _now() - state.startTime;
        const dx = pt.x - state.startX;
        const dy = pt.y - state.startY;
        const dist = Math.hypot(dx, dy);

        if (dist >= SWIPE_MIN_DIST && handlers.onSwipe) {
          const absX = Math.abs(dx);
          const absY = Math.abs(dy);
          let direction = 'none';
          if (absX >= absY) {
            if (absY / Math.max(1, absX) <= SWIPE_MAX_OFFAXIS) direction = dx > 0 ? 'right' : 'left';
          } else {
            if (absX / Math.max(1, absY) <= SWIPE_MAX_OFFAXIS) direction = dy > 0 ? 'down' : 'up';
          }
          if (direction !== 'none') {
            handlers.onSwipe({
              direction, dx, dy,
              velocity: dist / Math.max(1, elapsed),
              event: ev
            });
            state.startTime = 0;
            return;
          }
        }

        if (elapsed <= TAP_MAX_MS && dist <= TAP_MAX_DIST) {
          // Could be a tap or part of a double-tap.
          const sinceLast = _now() - state.lastTapTime;
          const lastDist = Math.hypot(pt.x - state.lastTapX, pt.y - state.lastTapY);
          if (handlers.onDoubleTap && sinceLast <= DOUBLE_TAP_MS && lastDist <= TAP_MAX_DIST * 2) {
            handlers.onDoubleTap({ x: pt.x, y: pt.y, event: ev });
            state.lastTapTime = 0;
          } else {
            if (handlers.onTap) handlers.onTap({ x: pt.x, y: pt.y, event: ev });
            state.lastTapTime = _now();
            state.lastTapX = pt.x;
            state.lastTapY = pt.y;
          }
        }
        state.startTime = 0;
      }
    }

    function _onPointerCancel(ev) {
      state.activePointers.delete(ev.pointerId);
      if (state.longPressTimer) {
        clearTimeout(state.longPressTimer);
        state.longPressTimer = 0;
      }
      state.startTime = 0;
    }

    // Pointer Events covers touch + mouse + stylus on every modern browser.
    element.addEventListener('pointerdown', _onPointerDown);
    element.addEventListener('pointermove', _onPointerMove);
    element.addEventListener('pointerup', _onPointerUp);
    element.addEventListener('pointercancel', _onPointerCancel);
    element.addEventListener('pointerleave', _onPointerCancel);

    return function detach() {
      element.removeEventListener('pointerdown', _onPointerDown);
      element.removeEventListener('pointermove', _onPointerMove);
      element.removeEventListener('pointerup', _onPointerUp);
      element.removeEventListener('pointercancel', _onPointerCancel);
      element.removeEventListener('pointerleave', _onPointerCancel);
      if (state.longPressTimer) clearTimeout(state.longPressTimer);
    };
  }

  return Object.freeze({ attach });
})();
