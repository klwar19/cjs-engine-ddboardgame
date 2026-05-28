// cui-modals.ts — Phase H.4 TypeScript port of the Modals primitives.
//
// `js/campaign/ui/cui-modals.js` exported a frozen `Modals` namespace
// on `window.CJS.CampaignUIInternal.Modals`. The TS port installs the
// same surface; the still-JS callers (campaign-ui.js's manual builders,
// the option modal openers in roster modals) read it lazily so this
// is a drop-in replacement.
//
// Builds small reusable modals (form, textarea, number, op picker)
// on top of the shared `window.CJS.UI` modal helpers + the leaf esc()
// from cui-utils.ts.

import { esc } from "./cui-utils";

// ── Types ────────────────────────────────────────────────────────────
export interface DescRecord {
  readonly description?: string;
  readonly desc?: string;
  readonly flavor?: string;
  readonly notes?: string;
  readonly effectText?: string;
  readonly summary?: string;
  readonly [key: string]: unknown;
}

export interface PickerOption {
  readonly value: string;
  readonly label?: string;
  readonly sub?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly [key: string]: unknown;
}

export interface SearchableSelect {
  appendChild?: (child: Node) => void;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  _getValue: () => string | undefined;
  // The actual return is an HTMLElement-like node, plus the closure
  // method `_getValue` above.
  [key: string]: unknown;
}

export interface NumberSlider {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  _getValue: () => number;
  [key: string]: unknown;
}

export interface SelectControl extends HTMLSelectElement {
  // The vanilla `UI.createSelect` returns a real <select>.
  value: string;
}

export type ToastKind = "info" | "success" | "error" | "warning";

interface UiModalSurface {
  openModal: (opts: {
    title: string;
    content: HTMLElement | string;
    footer?: HTMLElement;
    width?: string;
  }) => unknown;
  closeModal: (overlay: unknown) => void;
  createSearchableSelect: (opts: {
    options: readonly PickerOption[];
    placeholder?: string;
    renderItem?: (option: PickerOption) => string;
  }) => HTMLElement & SearchableSelect;
  createNumberSlider: (opts: {
    value: number;
    min: number;
    max: number;
    step: number;
  }) => HTMLElement & NumberSlider;
  createSelect: (opts: {
    options: readonly { value: string; label: string }[];
    value: string;
  }) => HTMLElement & SelectControl;
  toast: (message: string, kind?: ToastKind, durationMs?: number) => void;
}

function ui(): UiModalSurface | null {
  const cjs = (window as unknown as { CJS?: { UI?: UiModalSurface } }).CJS;
  return cjs?.UI ?? null;
}

// ── Helpers ──────────────────────────────────────────────────────────
export function desc(record: DescRecord = {}): string {
  return record.description || record.desc || record.flavor || record.notes || record.effectText || record.summary || "";
}

export function pickerItem(option: PickerOption): string {
  return `
      <div class="campaign-picker-option">
        <strong>${esc(option.label || option.value)}</strong>
        ${option.sub ? `<small>${esc(option.sub)}</small>` : ""}
        ${option.description ? `<span>${esc(option.description)}</span>` : ""}
      </div>
    `;
}

export function sortOptionLabel(a: PickerOption, b: PickerOption): number {
  return String(a.label || "").localeCompare(String(b.label || ""));
}

export function formLabel(text: string): HTMLLabelElement {
  const lbl = document.createElement("label");
  lbl.className = "form-label";
  lbl.textContent = text;
  lbl.style.marginTop = "10px";
  lbl.style.display = "block";
  return lbl;
}

// ── Form modal ───────────────────────────────────────────────────────
export interface FormModalOptions {
  title: string;
  body: HTMLElement;
  onSubmit: () => boolean | void | undefined;
  primaryLabel?: string;
  width?: string;
}

export function formModal(options: FormModalOptions): unknown {
  const { title, body, onSubmit, primaryLabel = "Apply", width = "480px" } = options;
  const u = ui();
  if (!u) throw new Error("CJS.UI not loaded");
  const footer = document.createElement("div");
  const btn = document.createElement("button");
  btn.className = "btn btn-primary";
  btn.textContent = primaryLabel;
  footer.appendChild(btn);
  const overlay = u.openModal({ title, content: body, footer, width });
  btn.onclick = () => {
    const close = onSubmit();
    if (close !== false) u.closeModal(overlay);
  };
  return overlay;
}

// ── Op picker modal ──────────────────────────────────────────────────
export interface OpPickerModalOptions {
  title: string;
  options: readonly PickerOption[];
  onSubmit: (result: { value: string; qty?: number; duration?: string }) => void;
  primaryLabel?: string;
  placeholder?: string;
  withQty?: boolean;
  qtyLabel?: string;
  qtyMin?: number;
  qtyMax?: number;
  qtyDefault?: number;
  withDuration?: boolean;
  renderItem?: (option: PickerOption) => string;
}

export function opPickerModal(options: OpPickerModalOptions): unknown {
  const {
    title,
    options: opts,
    primaryLabel = "Apply",
    placeholder,
    withQty,
    qtyLabel = "Qty",
    qtyMin = 1,
    qtyMax = 99,
    qtyDefault = 1,
    withDuration,
    renderItem = pickerItem,
    onSubmit
  } = options;
  const u = ui();
  if (!u) throw new Error("CJS.UI not loaded");
  const body = document.createElement("div");
  body.appendChild(formLabel("Select"));
  const select = u.createSearchableSelect({
    options: opts,
    placeholder: placeholder || "Search...",
    renderItem
  });
  body.appendChild(select);

  let qty: (HTMLElement & NumberSlider) | null = null;
  if (withQty) {
    body.appendChild(formLabel(qtyLabel));
    qty = u.createNumberSlider({ value: qtyDefault, min: qtyMin, max: qtyMax, step: 1 });
    body.appendChild(qty);
  }

  let duration: (HTMLElement & SelectControl) | null = null;
  if (withDuration) {
    body.appendChild(formLabel("Duration"));
    duration = u.createSelect({
      options: [
        { value: "manual", label: "Manual (GM clears)" },
        { value: "scene", label: "Scene" },
        { value: "scenario", label: "Scenario" },
        { value: "3", label: "3 turns" },
        { value: "5", label: "5 turns" },
        { value: "10", label: "10 turns" }
      ],
      value: "manual"
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
        u.toast("Pick a value first", "error");
        return false;
      }
      onSubmit({
        value,
        qty: qty ? qty._getValue() : undefined,
        duration: duration ? duration.value : undefined
      });
      return undefined;
    }
  });
}

// ── Textarea modal ───────────────────────────────────────────────────
export interface TextareaModalOptions {
  title: string;
  onSubmit: (value: string) => boolean | void | undefined;
  label?: string;
  placeholder?: string;
  primaryLabel?: string;
  width?: string;
  defaultValue?: string;
}

export function textareaModal(options: TextareaModalOptions): unknown {
  const { title, label, placeholder, primaryLabel = "Save", onSubmit, width = "520px", defaultValue = "" } = options;
  const body = document.createElement("div");
  if (label) body.appendChild(formLabel(label));
  const ta = document.createElement("textarea");
  ta.style.width = "100%";
  ta.style.minHeight = "120px";
  ta.placeholder = placeholder || "";
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

// ── Number modal ─────────────────────────────────────────────────────
export interface NumberModalOptions {
  title: string;
  onSubmit: (value: number) => boolean | void | undefined;
  label?: string;
  primaryLabel?: string;
  min?: number;
  max?: number;
  value?: number;
}

export function numberModal(options: NumberModalOptions): unknown {
  const { title, label, primaryLabel = "Apply", min = 1, max = 999, value = 5, onSubmit } = options;
  const u = ui();
  if (!u) throw new Error("CJS.UI not loaded");
  const body = document.createElement("div");
  body.appendChild(formLabel(label || "Amount"));
  const slider = u.createNumberSlider({ value, min, max, step: 1 });
  body.appendChild(slider);
  return formModal({
    title,
    body,
    primaryLabel,
    onSubmit: () => onSubmit(slider._getValue())
  });
}

// ── Legacy namespace install ─────────────────────────────────────────
export interface CuiModals {
  readonly desc: typeof desc;
  readonly pickerItem: typeof pickerItem;
  readonly sortOptionLabel: typeof sortOptionLabel;
  readonly formLabel: typeof formLabel;
  readonly formModal: typeof formModal;
  readonly opPickerModal: typeof opPickerModal;
  readonly textareaModal: typeof textareaModal;
  readonly numberModal: typeof numberModal;
}

const NAMESPACE: CuiModals = Object.freeze({
  desc,
  pickerItem,
  sortOptionLabel,
  formLabel,
  formModal,
  opPickerModal,
  textareaModal,
  numberModal
});

interface CuiInternalWindow {
  CJS?: {
    CampaignUIInternal?: { Modals?: CuiModals; [key: string]: unknown };
    [key: string]: unknown;
  };
}
const w = window as unknown as CuiInternalWindow;
w.CJS = w.CJS || {};
w.CJS.CampaignUIInternal = w.CJS.CampaignUIInternal || {};
w.CJS.CampaignUIInternal.Modals = NAMESPACE;

export default NAMESPACE;
