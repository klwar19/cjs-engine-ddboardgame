// VirtualList.tsx — Phase I.3 variable-height list virtualizer.
//
// Renders only the rows intersecting a bounded scroll viewport (plus an
// overscan margin), so the session log / event ledger / quest list / save
// slots stay cheap at 100s–1000s of rows. The windowing geometry is the pure
// `virtual.ts` math; this component owns the DOM concerns: a measured viewport,
// per-row height measurement (ResizeObserver — rows are content-driven, not
// fixed height), and rAF-throttled scroll.
//
// Two modes, chosen by `items.length` vs `threshold`:
//   • PASSTHROUGH (≤ threshold): renders the exact same `<div className=
//     {listClassName}>{rows}</div>` the call site used inline before, with no
//     scroll container and no hooks running on the windowing path. The common
//     case (a handful of rows) is therefore byte-for-byte unchanged — no new
//     scroll panel, no behavior shift.
//   • VIRTUALIZED (> threshold): a `maxHeight` scroll box whose rows are
//     absolutely positioned at their measured offsets inside a full-height
//     spacer.
//
// Consistent with the repo's perf model (equality.ts / memo.ts): keep the
// per-row component memoized (e.g. `QuestRow = memoDeep(...)`) and pass it as
// `renderItem`; the virtualizer decides WHICH rows mount, memoization decides
// whether a mounted row re-renders.

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { ReactNode } from "react";
import { buildOffsets, computeWindow } from "./virtual";

export interface VirtualListProps<T> {
  readonly items: readonly T[];
  /** Stable key per item (id where available; index for append-only logs). */
  readonly itemKey: (item: T, index: number) => string | number;
  readonly renderItem: (item: T, index: number) => ReactNode;
  /** Initial per-row height guess (px) before measurement refines it. */
  readonly estimateHeight: number;
  /** Rows rendered beyond the viewport on each side. Default 4. */
  readonly overscan?: number;
  /** Below this many rows, render inline (no virtualization). Default 40. */
  readonly threshold?: number;
  /** Scroll-viewport max height (virtualized mode only). Default "70vh". */
  readonly maxHeight?: number | string;
  /** Vertical gap between rows (the inline list's CSS grid-gap). Default 0. */
  readonly gap?: number;
  /** Class on the scroll viewport (virtualized mode). */
  readonly className?: string;
  /** Class on the plain wrapper (passthrough mode) — keep the original. */
  readonly listClassName?: string;
  readonly ariaLabel?: string;
}

export function VirtualList<T>(props: VirtualListProps<T>) {
  const { items, itemKey, renderItem, threshold = 40, listClassName } = props;

  // PASSTHROUGH: short list → original markup, no scroll box, no windowing
  // hooks. A `Fragment` carries the key so the rendered DOM has no extra
  // wrapper node around each row (identical to the prior inline `.map`).
  if (items.length <= threshold) {
    return (
      <div className={listClassName}>
        {items.map((item, i) => (
          <Fragment key={itemKey(item, i)}>{renderItem(item, i)}</Fragment>
        ))}
      </div>
    );
  }
  return <VirtualListInner {...props} />;
}

function VirtualListInner<T>({
  items,
  itemKey,
  renderItem,
  estimateHeight,
  overscan = 4,
  maxHeight = "70vh",
  gap = 0,
  className,
  ariaLabel
}: VirtualListProps<T>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  // Measured row heights keyed by ITEM KEY (not index) so a measurement
  // survives append/reorder. `measureTick` forces the offsets memo to
  // recompute after a height lands.
  const heights = useRef<Map<string | number, number>>(new Map());
  const [measureTick, setMeasureTick] = useState(0);

  const keys = useMemo(
    () => items.map((item, i) => itemKey(item, i)),
    [items, itemKey]
  );

  const heightAt = useCallback(
    (i: number) => {
      const measured = heights.current.get(keys[i]);
      return measured != null && measured > 0 ? measured : estimateHeight;
    },
    [keys, estimateHeight]
  );

  const offsets = useMemo(
    () => buildOffsets(items.length, heightAt, gap),
    // measureTick intentionally in deps: a new measurement changes offsets.
    [items.length, heightAt, gap, measureTick]
  );

  const win = computeWindow(offsets, scrollTop, viewportH, overscan);

  // Viewport height: measured on mount and kept current via ResizeObserver
  // (also fires when a collapsed <details> wrapper opens, revealing the list).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Scroll → scrollTop, throttled to one update per frame.
  const rafRef = useRef(0);
  const onScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = scrollRef.current;
      if (el) setScrollTop(el.scrollTop);
    });
  }, []);
  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const reportHeight = useCallback((key: string | number, h: number) => {
    const prev = heights.current.get(key);
    // Tolerance avoids a measure→render→measure loop on sub-pixel jitter.
    if (prev == null || Math.abs(prev - h) > 0.5) {
      heights.current.set(key, h);
      setMeasureTick((t) => t + 1);
    }
  }, []);

  const rows: ReactNode[] = [];
  for (let i = win.start; i < win.end; i += 1) {
    const key = keys[i];
    rows.push(
      <VirtualRow key={key} rowKey={key} top={offsets[i]} report={reportHeight}>
        {renderItem(items[i], i)}
      </VirtualRow>
    );
  }

  const viewportClass = className ? `campaign-vlist ${className}` : "campaign-vlist";
  return (
    <div
      ref={scrollRef}
      className={viewportClass}
      style={{ maxHeight, overflowY: "auto", position: "relative" }}
      onScroll={onScroll}
      role="list"
      aria-label={ariaLabel}
    >
      <div
        className="campaign-vlist-spacer"
        style={{ height: win.total, position: "relative", width: "100%" }}
      >
        {rows}
      </div>
    </div>
  );
}

interface VirtualRowProps {
  readonly rowKey: string | number;
  readonly top: number;
  readonly report: (key: string | number, height: number) => void;
  readonly children: ReactNode;
}

// One absolutely-positioned, self-measuring row. `getBoundingClientRect`
// returns the border-box height regardless of box-sizing; the configured
// `gap` (added in buildOffsets) supplies the between-row spacing the inline
// grid used, so rows carry no vertical margin of their own here.
function VirtualRow({ rowKey, top, report, children }: VirtualRowProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => report(rowKey, el.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rowKey, report]);
  return (
    <div
      ref={ref}
      className="campaign-vlist-row"
      role="listitem"
      style={{ position: "absolute", top, left: 0, right: 0 }}
    >
      {children}
    </div>
  );
}
