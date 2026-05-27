// roster-modals.ts — Phase H.3 roster GM stat-modal handlers.
//
// These open a modal (number / form / op-picker) and apply a CampaignOps
// op on submit. They depend only on accessible primitives — the modal
// builders in CampaignUIInternal.Modals, the option builders in
// CampaignUIInternal.Options, the UI helper widgets, DataStore, and
// CampaignOps — with no other campaign-ui.js closure and no `_activeMode`
// / `_activeTab` manipulation, so they port cleanly. Modal titles, op
// names, payload keys, ranges and `source` mirror the deleted closures
// (`_charNumberOp` / `_charMpModal` / `_charStatusModal` / `_grantXpModal`
// / `_grantJobXpModal`) exactly. (stat-boost stays in the switch until
// its `_statName` leaf helper moves to a shared TS util in H.4.)

import { applyOp, cs, ds, mod, toast } from "./context";

interface Member {
  name?: string;
  maxHp?: number;
  maxMp?: number;
  currentJob?: string;
}

function member(id: string): Member | undefined {
  const party = (cs().getState()?.party ?? {}) as Record<string, Member>;
  return party[id];
}

// ── Accessible modal / widget primitives (CampaignUIInternal + UI) ──
interface PickerOption {
  value: string;
  label: string;
  [key: string]: unknown;
}
type SliderEl = HTMLElement & { _getValue: () => number };
interface UiHelpers {
  createSelect: (cfg: { options: Array<{ value: string; label: string }>; value: string }) => HTMLSelectElement;
  createNumberSlider: (cfg: { value: number; min: number; max: number; step: number }) => SliderEl;
}
interface ModalsModule {
  numberModal: (cfg: {
    title: string; label: string; value: number; min: number; max: number;
    primaryLabel: string; onSubmit: (amount: number) => void;
  }) => void;
  formModal: (cfg: {
    title: string; body: HTMLElement; primaryLabel: string; onSubmit: () => boolean | void;
  }) => void;
  formLabel: (text: string) => HTMLElement;
  opPickerModal: (cfg: {
    title: string; options: PickerOption[]; withDuration?: boolean; placeholder?: string;
    primaryLabel: string; onSubmit: (result: { value: string; duration?: string }) => void;
  }) => void;
}
interface OptionsModule {
  statusOptions: () => PickerOption[];
}
interface CuiInternal {
  Modals?: ModalsModule;
  Options?: OptionsModule;
}

function uiHelpers(): UiHelpers | undefined {
  return mod<UiHelpers>("UI");
}
function modals(): ModalsModule | undefined {
  return mod<CuiInternal>("CampaignUIInternal")?.Modals;
}
function statusOptions(): PickerOption[] {
  return mod<CuiInternal>("CampaignUIInternal")?.Options?.statusOptions?.() ?? [];
}

// damage-char / heal-char / level-char
export function charNumberOp(id: string, op: string, label: string): void {
  const m = member(id);
  const max = op === "heal_character" ? Math.max(m?.maxHp || 999, 1) : 999;
  modals()?.numberModal({
    title: `${label}: ${m?.name || id}`,
    label,
    value: 5,
    min: 1,
    max,
    primaryLabel: "Apply",
    onSubmit: (amount) => {
      if (amount) applyOp({ op, target: id, amount });
    }
  });
}

// mp-char
export function charMpModal(id: string): void {
  const m = member(id);
  const helpers = uiHelpers();
  const mods = modals();
  if (!helpers || !mods) return;
  const body = document.createElement("div");
  body.appendChild(mods.formLabel("Direction"));
  const dir = helpers.createSelect({
    options: [
      { value: "restore_mp", label: "Restore MP" },
      { value: "spend_mp", label: "Spend MP" }
    ],
    value: "restore_mp"
  });
  body.appendChild(dir);
  body.appendChild(mods.formLabel("Amount"));
  const slider = helpers.createNumberSlider({ value: 5, min: 1, max: Math.max(m?.maxMp || 99, 1), step: 1 });
  body.appendChild(slider);
  mods.formModal({
    title: `MP: ${m?.name || id}`,
    body,
    primaryLabel: "Apply",
    onSubmit: () => {
      const amount = slider._getValue();
      if (!amount) return false;
      applyOp({ op: dir.value, target: id, amount });
    }
  });
}

// status-char
export function charStatusModal(id: string): void {
  const m = member(id);
  const opts = statusOptions();
  if (!opts.length) {
    toast("No statuses authored yet", "info");
    return;
  }
  modals()?.opPickerModal({
    title: `Add Status: ${m?.name || id}`,
    options: opts,
    withDuration: true,
    placeholder: "Search statuses…",
    primaryLabel: "Apply Status",
    onSubmit: ({ value, duration }) => {
      applyOp({ op: "add_status", target: id, status: value, duration: duration || "manual" });
    }
  });
}

// grant-xp
export function grantXpModal(id: string): void {
  const m = member(id);
  if (!m) return;
  modals()?.numberModal({
    title: `Grant XP: ${m.name || id}`,
    label: "XP amount",
    value: 50,
    min: 1,
    max: 99999,
    primaryLabel: "Grant",
    onSubmit: (amount) => {
      if (amount > 0) applyOp({ op: "add_xp", target: id, amount });
    }
  });
}

// grant-job-xp
export function grantJobXpModal(id: string): void {
  const m = member(id);
  if (!m) return;
  if (!m.currentJob) {
    toast(`${m.name || id} has no active job. Pick one with the Job button first.`, "info");
    return;
  }
  const job = ds()?.get("jobs", m.currentJob);
  const jobName = (job?.name as string | undefined) || m.currentJob;
  modals()?.numberModal({
    title: `Grant Job XP: ${m.name || id} (${jobName})`,
    label: "Job XP amount",
    value: 30,
    min: 1,
    max: 99999,
    primaryLabel: "Grant",
    onSubmit: (amount) => {
      if (amount > 0) applyOp({ op: "gain_job_xp", target: id, amount });
    }
  });
}
