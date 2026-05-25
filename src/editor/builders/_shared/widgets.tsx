// Shared React widgets for editor builders.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { BaseEntity, Effect, PortraitWidget } from "./cjs";
import { cm, constants, ds, effectRegistry, portraitPicker, ui } from "./cjs";

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

// ── PORTRAIT FIELD ───────────────────────────────────────────────────
// Thin React wrapper around the vanilla CJS.PortraitPicker widget. The
// imperative widget owns its own DOM and exposes getValue/getFocus; we
// give it a host div, store a ref to the widget so callers can read
// the current path/focus on save, and let the fallback icon track an
// external value (usually the item icon input).
export function PortraitField({
  currentPath,
  currentFocus,
  category,
  id,
  name,
  fallbackIcon,
  widgetRef
}: {
  currentPath?: string;
  currentFocus?: unknown;
  category?: string;
  id?: string;
  name?: string;
  fallbackIcon?: string;
  widgetRef: { current: PortraitWidget | null };
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const PP = portraitPicker();
    if (!PP) return;
    const widget = PP.createWidget({
      currentPath,
      currentFocus,
      category,
      id,
      name,
      fallbackIcon
    });
    host.appendChild(widget.el);
    widgetRef.current = widget;
    return () => {
      widgetRef.current = null;
      try { host.removeChild(widget.el); } catch { /* ignore */ }
    };
    // Mount-once: subsequent prop changes are applied via setFallbackIcon below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync fallback icon when the parent input changes.
  useEffect(() => {
    if (widgetRef.current && fallbackIcon != null) {
      widgetRef.current.setFallbackIcon(fallbackIcon || "?");
    }
  }, [fallbackIcon, widgetRef]);

  return <div ref={hostRef} />;
}

// ── EFFECT REF TYPES ────────────────────────────────────────────────
export interface EffectRef {
  effectId: string;
  overrides?: Record<string, unknown>;
}

// ── EFFECT PICKER MODAL ─────────────────────────────────────────────
function EffectPicker({
  onPick,
  onClose
}: {
  onPick: (effect: Effect) => void;
  onClose: () => void;
}) {
  const ER = effectRegistry();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const grouped = useMemo(() => ER.getEffectsGroupedByCategory(), [ER]);
  const allEffects = useMemo(() => ER.getAllEffects(), [ER]);

  const visible = useMemo(() => {
    let effects = search ? ER.searchEffects(search) : ER.getAllEffects();
    if (activeCategory !== "all")
      effects = effects.filter((e) => e.category === activeCategory);
    return effects;
  }, [search, activeCategory, ER]);

  return (
    <div>
      <input
        type="search"
        placeholder="Search effects by name, tag, action..."
        style={{ width: "100%", marginBottom: 8 }}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        autoFocus
      />
      <div className="filter-bar">
        <button
          type="button"
          className={`filter-btn${activeCategory === "all" ? " active" : ""}`}
          onClick={() => setActiveCategory("all")}
        >
          All ({allEffects.length})
        </button>
        {Object.entries(grouped).map(([cat, items]) =>
          items.length === 0 ? null : (
            <button
              key={cat}
              type="button"
              className={`filter-btn${activeCategory === cat ? " active" : ""}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat} ({items.length})
            </button>
          )
        )}
      </div>
      <div className="data-list" style={{ maxHeight: 350 }}>
        {visible.length === 0 ? (
          <div className="data-list-empty">No effects found</div>
        ) : (
          visible.map((eff) => (
            <div
              key={eff.id}
              className="data-list-item"
              onClick={() => {
                onPick(eff);
                onClose();
              }}
            >
              <span className="item-icon">{eff.icon || "✦"}</span>
              <div>
                <div className="item-name">{eff.name}</div>
                <div className="item-sub">
                  {eff.description || ER.autoDescribe(eff)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Opens an effect picker using the CJS modal infrastructure but renders
// the body with React via createRoot.
export function openEffectPicker(onPick: (effect: Effect) => void) {
  // Lazy-load the react-dom client (avoids forcing react-dom into every
  // shared bundle when not needed).
  void import("react-dom/client").then(({ createRoot }) => {
    const mount = document.createElement("div");
    let overlay: HTMLElement | null = null;
    const close = () => {
      if (overlay) ui().closeModal(overlay);
    };
    const root = createRoot(mount);
    root.render(<EffectPicker onPick={onPick} onClose={close} />);
    overlay = ui().openModal({
      title: "Pick Effect",
      content: mount,
      width: "650px",
      onClose: () => {
        try { root.unmount(); } catch { /* ignore */ }
      }
    });
  });
}

// ── OVERRIDE FORM (inline) ──────────────────────────────────────────
function OverrideForm({
  master,
  overrides,
  onChange
}: {
  master: Effect;
  overrides: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const overridable = master.overridable || ["value", "duration"];
  const C = constants();
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...overrides });

  const set = useCallback(
    (key: string, value: unknown) => {
      setDraft((prev) => {
        const next = { ...prev, [key]: value };
        onChange(next);
        return next;
      });
    },
    [onChange]
  );

  return (
    <>
      {overridable.map((field) => {
        const current = draft[field];
        const masterValue = (master as unknown as Record<string, unknown>)[field];
        const label = field.charAt(0).toUpperCase() + field.slice(1);
        let control: ReactNode;
        if (field === "value") {
          const num = typeof current === "number" ? current : (masterValue as number) ?? 0;
          control = (
            <div className="flex items-center gap-sm">
              <input
                type="range"
                min={-100}
                max={200}
                step={1}
                value={num}
                style={{ flex: 1 }}
                onChange={(e) => set("value", Number(e.currentTarget.value) || 0)}
              />
              <input
                type="number"
                value={num}
                style={{ width: 70 }}
                onChange={(e) => set("value", Number(e.currentTarget.value) || 0)}
              />
            </div>
          );
        } else if (field === "duration") {
          control = (
            <input
              type="number"
              min={0}
              max={20}
              value={
                (typeof current === "number" ? current : (masterValue as number)) ?? 0
              }
              onChange={(e) => set("duration", Number(e.currentTarget.value) || null)}
            />
          );
        } else if (field === "stat") {
          control = (
            <select
              value={
                (current as string) ?? (masterValue as string) ?? C.STATS[0]
              }
              onChange={(e) => set("stat", e.currentTarget.value)}
            >
              {C.STATS.map((s) => (
                <option key={s} value={s}>
                  {s} ({C.STAT_NAMES[s]})
                </option>
              ))}
            </select>
          );
        } else if (field === "element") {
          control = (
            <select
              value={(current as string) ?? (masterValue as string) ?? ""}
              onChange={(e) => set("element", e.currentTarget.value || null)}
            >
              <option value="">— None —</option>
              {C.ELEMENTS.map((el) => (
                <option key={el} value={el}>
                  {el}
                </option>
              ))}
            </select>
          );
        } else if (field === "statusId") {
          control = (
            <input
              type="text"
              placeholder="Status ID"
              value={(current as string) ?? (masterValue as string) ?? ""}
              onChange={(e) => set("statusId", e.currentTarget.value)}
            />
          );
        } else if (field === "drType") {
          control = (
            <select
              value={
                (current as string) ?? (masterValue as string) ?? "physical"
              }
              onChange={(e) => set("drType", e.currentTarget.value)}
            >
              {(["physical", "magic", "chaos", "all"] as const).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          );
        } else {
          const masterIsNum = typeof masterValue === "number";
          control = (
            <input
              type={masterIsNum ? "number" : "text"}
              value={
                (current as string | number) ??
                (masterValue as string | number) ??
                ""
              }
              onChange={(e) =>
                set(
                  field,
                  masterIsNum ? Number(e.currentTarget.value) : e.currentTarget.value
                )
              }
            />
          );
        }
        return (
          <div key={field} className="form-group">
            <label className="form-label">{label}</label>
            {control}
          </div>
        );
      })}
    </>
  );
}

// ── EFFECT LIST BUILDER ─────────────────────────────────────────────
// React replacement for UI.createEffectListBuilder. Manages a controlled
// list of EffectRef. Edit opens a modal hosting OverrideForm.
export function EffectListBuilder({
  effects,
  onChange
}: {
  effects: EffectRef[];
  onChange: (next: EffectRef[]) => void;
}) {
  const ER = effectRegistry();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const openEditOverrides = useCallback(
    (index: number) => {
      const ref = effects[index];
      const master = ER.getEffect(ref.effectId);
      if (!master) return;
      void import("react-dom/client").then(({ createRoot }) => {
        const mount = document.createElement("div");
        let overlay: HTMLElement | null = null;
        let liveOverrides: Record<string, unknown> = { ...(ref.overrides || {}) };
        const root = createRoot(mount);
        const footer = document.createElement("div");
        const doneBtn = document.createElement("button");
        doneBtn.className = "btn btn-primary";
        doneBtn.textContent = "Done";
        footer.appendChild(doneBtn);
        root.render(
          <OverrideForm
            master={master}
            overrides={liveOverrides}
            onChange={(ov) => {
              liveOverrides = ov;
            }}
          />
        );
        doneBtn.onclick = () => {
          const next = [...effects];
          next[index] = { ...ref, overrides: liveOverrides };
          onChange(next);
          if (overlay) ui().closeModal(overlay);
        };
        overlay = ui().openModal({
          title: `Override: ${master.name}`,
          content: mount,
          footer,
          width: "450px",
          onClose: () => {
            try { root.unmount(); } catch { /* ignore */ }
            setEditingIndex(null);
          }
        });
        setEditingIndex(index);
      });
    },
    [effects, onChange, ER]
  );

  return (
    <div>
      {effects.map((ref, i) => {
        const master = ER.getEffect(ref.effectId);
        return (
          <div key={`${ref.effectId}-${i}`} className="effect-chip">
            {master ? (
              <>
                <span className="chip-icon">{master.icon || "✦"}</span>
                <span className="chip-name">{master.name}</span>
                <span className="chip-desc">
                  {ER.autoDescribe(ER.mergeWithOverrides(master, ref.overrides || {}))}
                </span>
              </>
            ) : (
              <>
                <span className="chip-icon">⚠️</span>
                <span className="chip-name">{ref.effectId}</span>
                <span className="chip-desc" style={{ color: "var(--red)" }}>
                  Missing effect!
                </span>
              </>
            )}
            <div className="chip-actions">
              {master ? (
                <button
                  type="button"
                  className="btn-icon"
                  title="Edit overrides"
                  onClick={() => openEditOverrides(i)}
                >
                  ✏️
                </button>
              ) : null}
              <button
                type="button"
                className="btn-icon"
                title="Remove"
                onClick={() => onChange(effects.filter((_, idx) => idx !== i))}
              >
                ❌
              </button>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() =>
          openEffectPicker((eff) => onChange([...effects, { effectId: eff.id, overrides: {} }]))
        }
      >
        + Add Effect from Library
      </button>
      {/* editingIndex tracked for cleanup but not visually consumed */}
      {editingIndex === -1 ? null : null}
    </div>
  );
}

// ── GENERIC REFERENCE PICKER MODAL ──────────────────────────────────
// Opens a modal listing items from a DataStore collection, calls
// onPick(item) when a row is clicked. Used for items / passives / jobs
// / skills pickers in character / monster editors.
function ReferencePickerModal({
  type,
  label,
  onPick,
  onClose
}: {
  type: string;
  label: string;
  onPick: (item: BaseEntity) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const items = useMemo<BaseEntity[]>(
    () => (search ? ds().search<BaseEntity>(type, search) : ds().getAllAsArray<BaseEntity>(type)),
    [search, type]
  );
  return (
    <div>
      <input
        type="search"
        placeholder={`Search ${label}s...`}
        style={{ width: "100%", marginBottom: 8 }}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        autoFocus
      />
      <div className="data-list" style={{ maxHeight: 350 }}>
        {items.length === 0 ? (
          <div className="data-list-empty">None found</div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="data-list-item"
              onClick={() => {
                onPick(item);
                onClose();
              }}
            >
              <span className="item-icon">{item.icon || "✦"}</span>
              <div>
                <div className="item-name">{item.name || item.id}</div>
                <div className="item-sub">
                  {(item.description || "").slice(0, 60)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function openReferencePicker(
  type: string,
  label: string,
  onPick: (item: BaseEntity) => void
) {
  void import("react-dom/client").then(({ createRoot }) => {
    const mount = document.createElement("div");
    let overlay: HTMLElement | null = null;
    const close = () => {
      if (overlay) ui().closeModal(overlay);
    };
    const root = createRoot(mount);
    root.render(
      <ReferencePickerModal
        type={type}
        label={label}
        onPick={onPick}
        onClose={close}
      />
    );
    overlay = ui().openModal({
      title: `Pick ${label}`,
      content: mount,
      width: "550px",
      onClose: () => {
        try { root.unmount(); } catch { /* ignore */ }
      }
    });
  });
}

// ── REFERENCE LIST (id-only) ────────────────────────────────────────
// Chip list of DataStore ids for a given collection (items / passives /
// jobs). Resolves each chip against DS().get for icon/name display.
export function ReferenceList({
  type,
  label,
  ids,
  onChange
}: {
  type: string;
  label: string;
  ids: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div>
      {ids.map((id, i) => {
        const item = ds().get<BaseEntity>(type, id);
        return (
          <div key={`${id}-${i}`} className="effect-chip">
            {item ? (
              <>
                <span className="chip-icon">{item.icon || "✦"}</span>
                <span className="chip-name">{item.name || item.id}</span>
                <span className="chip-desc">
                  {(item.description || "").slice(0, 50) || item.id}
                </span>
              </>
            ) : (
              <>
                <span className="chip-icon">⚠️</span>
                <span className="chip-name">{id}</span>
                <span className="chip-desc" style={{ color: "var(--red)" }}>
                  Not found
                </span>
              </>
            )}
            <button
              type="button"
              className="btn-icon"
              onClick={() => onChange(ids.filter((_, idx) => idx !== i))}
            >
              ❌
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() =>
          openReferencePicker(type, label, (picked) => {
            if (!ids.includes(picked.id)) onChange([...ids, picked.id]);
          })
        }
      >
        + Add {label}
      </button>
    </div>
  );
}
