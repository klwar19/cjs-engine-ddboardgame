// Shared React widgets for editor builders.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { BaseEntity } from "./cjs";
import { cm, ui } from "./cjs";

// ── INTERNAL HTML PARSING HELPERS ────────────────────────────────────
function renderRawHtml(html: string): ReactNode {
  // Used for the scope-chip HTML emitted by ContentManager.renderScopeChip.
  // The HTML is built from internal CM data, not user input — safe to
  // splat as-is.
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

// ── DATA LIST ───────────────────────────────────────────────────────
export interface DataListProps<T extends BaseEntity> {
  /** DataStore type id used to look up validation issue counts. */
  entityType?: string;
  items: T[];
  activeId?: string | null;
  onSelect: (item: T) => void;
  renderItem?: (item: T) => ReactNode;
  emptyMessage?: string;
}

export function DataList<T extends BaseEntity>({
  entityType,
  items,
  activeId,
  onSelect,
  renderItem,
  emptyMessage
}: DataListProps<T>) {
  if (items.length === 0) {
    return <div className="data-list-empty">{emptyMessage ?? "No items yet"}</div>;
  }
  return (
    <>
      {items.map((item) => {
        const realIssue = entityType
          ? cm()?.getEntityIssueCount?.(entityType, String(item.id ?? "")) || 0
          : 0;
        const issueLabel = realIssue
          ? `${realIssue} issue${realIssue === 1 ? "" : "s"}`
          : "";
        const scopeChip = cm()?.renderScopeChip?.(item) || "";
        return (
          <div
            key={item.id}
            className={`data-list-item${item.id === activeId ? " active" : ""}`}
            onClick={() => onSelect(item)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                {renderItem ? (
                  renderItem(item)
                ) : (
                  <>
                    <span className="item-icon">{item.icon || "✦"}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="item-name">{item.name || item.id}</div>
                      {item.description ? (
                        <div className="item-sub">{String(item.description).slice(0, 60)}</div>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
              {(realIssue || scopeChip) ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                  {realIssue ? (
                    <span
                      title={issueLabel}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "2px 7px",
                        borderRadius: 999,
                        background: "rgba(239,68,68,0.12)",
                        border: "1px solid rgba(239,68,68,0.35)",
                        color: "#ef4444",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        whiteSpace: "nowrap"
                      }}
                    >
                      {issueLabel}
                    </span>
                  ) : null}
                  {scopeChip ? renderRawHtml(scopeChip) : null}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </>
  );
}

// ── FILTER BAR ──────────────────────────────────────────────────────
export interface FilterButton {
  id: string;
  label: string;
  count?: number;
}

export function FilterBar({
  buttons,
  active,
  onSelect
}: {
  buttons: FilterButton[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="filter-bar">
      {buttons.map((b) => (
        <button
          key={b.id}
          className={`filter-btn${b.id === active ? " active" : ""}`}
          onClick={() => onSelect(b.id)}
          type="button"
        >
          {b.label}
          {typeof b.count === "number" ? ` (${b.count})` : ""}
        </button>
      ))}
    </div>
  );
}

// ── TAG INPUT ────────────────────────────────────────────────────────
export function TagInput({
  tags,
  onChange,
  placeholder = "Add tag + Enter"
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const commit = useCallback(() => {
    const val = input.trim().toLowerCase();
    if (!val) return;
    if (tags.includes(val)) {
      setInput("");
      return;
    }
    onChange([...tags, val]);
    setInput("");
  }, [input, tags, onChange]);

  return (
    <div>
      <div className="tag-list" style={{ marginBottom: 4 }}>
        {tags.map((t) => (
          <span key={t} className="tag">
            {t}{" "}
            <button
              type="button"
              className="tag-remove"
              title="Remove"
              onClick={() => onChange(tags.filter((x) => x !== t))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        placeholder={placeholder}
        value={input}
        style={{ width: 150 }}
        onChange={(e) => setInput(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
      />
    </div>
  );
}

// ── CHIP LIST (used for cleansedBy / overridable / conditions) ─────
export function ChipList({
  items,
  renderLabel,
  onRemove
}: {
  items: string[];
  renderLabel: (item: string, index: number) => ReactNode;
  onRemove: (index: number) => void;
}) {
  return (
    <>
      {items.map((it, i) => (
        <span key={`${it}-${i}`} className="chip">
          {renderLabel(it, i)}{" "}
          <button
            type="button"
            className="chip-x"
            onClick={() => onRemove(i)}
          >
            ×
          </button>
        </span>
      ))}
    </>
  );
}

// ── CONFIRM (uses CJS.UI.confirm) ──────────────────────────────────
export function confirm(message: string, onYes: () => void) {
  ui().confirm(message, onYes);
}

// ── TOAST ──────────────────────────────────────────────────────────
export function toast(
  message: string,
  kind: "info" | "success" | "error" | "warn" = "info",
  duration?: number
) {
  ui().toast(message, kind, duration);
}

// Tiny helper for a search input that debounces / updates immediately
// — for editor work we just need it controlled.
export function SearchInput({
  value,
  onChange,
  placeholder
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="search"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      style={{ flex: 1 }}
    />
  );
}

// useStableHandler — lets effects/event handlers see the latest closure
// without re-binding listeners.
export function useStableHandler<T extends (...args: never[]) => unknown>(
  handler: T
): T {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  return useMemo(() => ((...args) => ref.current(...args)) as T, []);
}
