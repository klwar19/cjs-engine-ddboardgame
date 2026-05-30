// virtual.ts — pure windowing math for the variable-height list virtualizer.
//
// Phase I.3. The campaign session log, event ledger, quest list, and save
// slots can each pass 100+ rows; rendering every row into the DOM (and, per
// the equality reality, rebuilding them on every deep-cloned state tick) is
// the dominant cost on a long campaign. `VirtualList.tsx` renders only the
// rows intersecting a bounded scroll viewport (plus an overscan margin).
//
// The geometry is split out here as PURE functions — no React, no DOM — so a
// wrong index never silently drops a visible row or renders a blank gap. They
// are exercised directly (transpiled + evaled) by test_virtual_list.js, the
// same way equality.ts backs the memo/selector layer.
//
// Rows are VARIABLE height: the component measures each rendered row and feeds
// the heights back as `heightAt`; unmeasured rows fall back to an estimate.
// `gap` is the vertical space BETWEEN rows (the CSS grid-gap the inline list
// used), folded into the cumulative offsets so absolute positioning preserves
// the original spacing.

export interface VirtualWindow {
  /** First item index to render (inclusive), already padded by overscan. */
  readonly start: number;
  /** One past the last item index to render (exclusive), padded by overscan. */
  readonly end: number;
  /** Total content height in px (the scroll spacer's height). */
  readonly total: number;
}

/**
 * Cumulative top offsets for `count` rows. `offsets[i]` is the top edge of row
 * `i`; `offsets[count]` is the total content height. `heightAt(i)` returns row
 * i's own height (measured or estimated); `gap` is added between adjacent rows
 * only (no trailing gap after the last row), matching CSS `gap`.
 *
 * O(count) — trivial for the hundreds-to-low-thousands of rows virtualization
 * targets; rebuilt only when the item count, gap, or a measured height change.
 */
export function buildOffsets(
  count: number,
  heightAt: (index: number) => number,
  gap = 0
): number[] {
  const safeCount = count > 0 ? count : 0;
  const offsets = new Array<number>(safeCount + 1);
  let acc = 0;
  for (let i = 0; i < safeCount; i += 1) {
    offsets[i] = acc;
    const raw = heightAt(i);
    const h = Number.isFinite(raw) && raw > 0 ? raw : 0;
    acc += h;
    if (i < safeCount - 1) acc += gap > 0 ? gap : 0;
  }
  offsets[safeCount] = acc;
  return offsets;
}

/**
 * Largest index `i` in `[0, count]` with `offsets[i] <= target`, by binary
 * search over the monotonically non-decreasing offsets. `count` is
 * `offsets.length - 1`. Used to find the first row intersecting a scroll
 * position. Clamped to `[0, count - 1]` so the result is always a real row
 * index when `count > 0`.
 */
export function findIndexForOffset(offsets: number[], target: number): number {
  const count = offsets.length - 1;
  if (count <= 0) return 0;
  if (target <= 0) return 0;
  if (target >= offsets[count]) return count - 1;
  let lo = 0;
  let hi = count; // offsets[count] is the sentinel total
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= target) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The `[start, end)` slice of rows intersecting a viewport of `viewportHeight`
 * px scrolled to `scrollTop`, padded by `overscan` rows on each side so a fast
 * scroll never reveals an un-rendered gap. `end` is exclusive. Both bounds are
 * clamped to the valid range; an empty list yields `{0, 0, 0}`.
 */
export function computeWindow(
  offsets: number[],
  scrollTop: number,
  viewportHeight: number,
  overscan: number
): VirtualWindow {
  const count = offsets.length - 1;
  if (count <= 0) return { start: 0, end: 0, total: 0 };
  const total = offsets[count];
  const top = scrollTop > 0 ? scrollTop : 0;
  const viewport = viewportHeight > 0 ? viewportHeight : 0;
  const bottom = top + viewport;
  const pad = overscan > 0 ? Math.floor(overscan) : 0;

  const firstVisible = findIndexForOffset(offsets, top);
  // The row whose top edge is at/after `bottom` is the first OFF-screen row;
  // include the row that straddles `bottom`, hence +1 on the found index.
  const lastVisible = findIndexForOffset(offsets, bottom) + 1;

  const start = Math.max(0, firstVisible - pad);
  let end = Math.min(count, lastVisible + pad);
  if (end < start) end = start;
  return { start, end, total };
}
