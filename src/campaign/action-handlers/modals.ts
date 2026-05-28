// modals.ts — Shared typed accessors for the campaign modal / widget /
// option-builder primitives. Phase H.3 ports a long tail of modal-driven
// action handlers; rather than re-declare the same `CampaignUIInternal.Modals`
// / `.Options` / `window.CJS.UI` shapes in every handler module, they all
// reach those primitives through the typed accessors here.
//
// The shapes mirror the actual implementations:
//   • Modals  — js/campaign/ui/cui-modals.js
//   • Options — js/campaign/ui/cui-options.js
//   • widgets — js/ui/ui-helpers.js (window.CJS.UI)
// They are accessible (frozen public namespaces), so a missing module
// degrades to `undefined` (callers use `?.`) instead of throwing — the
// same defensive contract `context.mod<T>()` provides everywhere else.

import { mod } from "./context";

export interface PickerOption {
  value: string;
  label: string;
  sub?: string;
  description?: string;
  [key: string]: unknown;
}

// Widget elements expose imperative getters the modal builders read on
// submit (see cui-modals.js / ui-helpers.js).
export type SliderEl = HTMLElement & { _getValue: () => number; _setValue?: (v: number) => void };
export type SearchableSelectEl = HTMLElement & { _getValue: () => string; _setValue?: (v: string) => void };
export type TagInputEl = HTMLElement & { _getTags: () => string[]; _setTags?: (t: string[]) => void };

export interface ModalsApi {
  desc: (record: Record<string, unknown>) => string;
  pickerItem: (option: PickerOption) => string;
  sortOptionLabel: (a: { label?: string }, b: { label?: string }) => number;
  formLabel: (text: string) => HTMLElement;
  formModal: (cfg: {
    title: string;
    body: HTMLElement;
    onSubmit: () => boolean | void;
    primaryLabel?: string;
    width?: string;
  }) => unknown;
  opPickerModal: (cfg: {
    title: string;
    options: PickerOption[];
    primaryLabel?: string;
    placeholder?: string;
    withQty?: boolean;
    qtyLabel?: string;
    qtyMin?: number;
    qtyMax?: number;
    qtyDefault?: number;
    withDuration?: boolean;
    renderItem?: (option: PickerOption) => string;
    onSubmit: (result: { value: string; qty?: number; duration?: string }) => boolean | void;
  }) => unknown;
  textareaModal: (cfg: {
    title: string;
    label?: string;
    placeholder?: string;
    primaryLabel?: string;
    width?: string;
    defaultValue?: string;
    onSubmit: (text: string) => boolean | void;
  }) => unknown;
  numberModal: (cfg: {
    title: string;
    label?: string;
    primaryLabel?: string;
    min?: number;
    max?: number;
    value?: number;
    onSubmit: (amount: number) => boolean | void;
  }) => unknown;
}

export interface OptionsApi {
  bucketOptions: (bucket: string) => PickerOption[];
  statusOptions: () => PickerOption[];
  seedOptions: () => PickerOption[];
  worldOptions: () => PickerOption[];
  tentOptions: () => PickerOption[];
}

export interface UiWidgetsApi {
  toast: (message: string, kind?: string, durationMs?: number) => void;
  openModal: (cfg: {
    title?: string;
    content?: HTMLElement;
    footer?: HTMLElement;
    width?: string;
    onClose?: () => void;
  }) => unknown;
  closeModal: (overlay: unknown, onClose?: () => void) => void;
  confirm: (message: string, onYes?: () => void, onNo?: () => void) => void;
  createSelect: (cfg: {
    options: Array<{ value: string; label: string }> | string[];
    value?: string;
    onChange?: (value: string) => void;
    includeEmpty?: boolean;
    emptyLabel?: string;
  }) => HTMLSelectElement;
  createNumberSlider: (cfg: {
    value?: number;
    min?: number;
    max?: number;
    step?: number;
    onChange?: (value: number) => void;
    label?: string;
  }) => SliderEl;
  createSearchableSelect: (cfg: {
    options: PickerOption[];
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    groupBy?: unknown;
    renderItem?: (option: PickerOption) => string;
  }) => SearchableSelectEl;
  createTagInput: (cfg: {
    tags?: string[];
    onChange?: (tags: string[]) => void;
    placeholder?: string;
    suggestions?: string[];
  }) => TagInputEl;
}

interface CuiInternal {
  Modals?: ModalsApi;
  Options?: OptionsApi;
}

export function modals(): ModalsApi | undefined {
  return mod<CuiInternal>("CampaignUIInternal")?.Modals;
}

export function options(): OptionsApi | undefined {
  return mod<CuiInternal>("CampaignUIInternal")?.Options;
}

export function widgets(): UiWidgetsApi | undefined {
  return mod<UiWidgetsApi>("UI");
}
