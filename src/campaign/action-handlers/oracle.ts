// oracle.ts — Phase H.3 oracle / GM-prompt action handlers.
//
// Ports the self-contained oracle handlers: roll a table prompt, pick one
// from a modal, author a custom one, save the last as a pinned note, push
// it to the event log, and the idea-forge oracle roll. Op names, mutation
// sources, toast strings and the lastOracle shape mirror the deleted
// closures. (oracle-to-quest / oracle-to-event-builder / oracle-add-tags
// stay in the switch — they share the manual quest/event/tag modal
// machinery with the event domain.)

import { applyOp, cs, mod, rerender, setActiveModeRaw, setActiveTabRaw, toast } from "./context";

interface OracleRoll {
  id?: string;
  text?: string;
  prompt?: string;
  title?: string;
  source?: string;
  tags?: string[];
  [key: string]: unknown;
}
interface OracleModule {
  roll: () => OracleRoll | null | undefined;
}
interface IdeaForgeModule {
  rollOracle: () => unknown;
}
interface OracleTable {
  id?: string;
  name?: string;
  entries?: Array<{ id?: string; text?: string; prompt?: string; label?: string }>;
  prompts?: Array<{ id?: string; text?: string; prompt?: string; label?: string }>;
}
interface DataLoaderModule {
  getOracleTables?: () => OracleTable[];
}
interface PickerOption {
  value: string;
  label: string;
  sub?: string;
  [key: string]: unknown;
}
interface ModalsModule {
  opPickerModal: (cfg: {
    title: string; options: PickerOption[]; placeholder?: string; primaryLabel: string;
    onSubmit: (result: { value: string }) => void;
  }) => void;
  textareaModal: (cfg: {
    title: string; label: string; placeholder?: string; primaryLabel: string;
    onSubmit: (text: string) => boolean | void;
  }) => void;
}

function modals(): ModalsModule | undefined {
  return mod<{ Modals?: ModalsModule }>("CampaignUIInternal")?.Modals;
}

function lastOracle(): OracleRoll | null {
  return (cs().getState()?.lastOracle as OracleRoll | undefined) ?? null;
}

export function rollOracle(): void {
  const oracle = mod<OracleModule>("CampaignOracle")?.roll();
  if (!oracle) {
    toast("No oracle table available", "info");
    return;
  }
  cs().mutate((state) => {
    state.lastOracle = oracle;
  }, { source: "oracle" });
}

function oracleChoices(): PickerOption[] {
  const tables =
    mod<DataLoaderModule>("CampaignDataLoader")?.getOracleTables?.() ||
    (Object.values((cs().getContent().oracleTables as Record<string, OracleTable>) || {}));
  const seen = new Map<string, PickerOption>();
  for (const table of tables) {
    const entries = table.entries || table.prompts || [];
    for (const entry of entries) {
      const text = entry.text || entry.prompt || entry.label;
      if (!text) continue;
      const value = entry.id || `${table.id}_${seen.size}`;
      seen.set(value, {
        value,
        label: text.length > 80 ? text.slice(0, 80) + "…" : text,
        sub: table.name || table.id,
        _text: text,
        _tableId: table.id
      });
    }
  }
  return Array.from(seen.values());
}

export function pickOracle(): void {
  const choices = oracleChoices();
  if (!choices.length) {
    toast("No oracle prompts available", "info");
    return;
  }
  modals()?.opPickerModal({
    title: "Pick GM Prompt",
    options: choices.map(({ value, label, sub }) => ({ value, label, sub })),
    placeholder: "Search prompts…",
    primaryLabel: "Use Prompt",
    onSubmit: ({ value }) => {
      const opt = choices.find((c) => c.value === value);
      if (!opt) return;
      cs().mutate((state) => {
        state.lastOracle = { id: opt.value, text: opt._text, tableId: opt._tableId, rolledAt: new Date().toISOString() };
      }, { source: "oracle_pick" });
    }
  });
}

export function customOracle(): void {
  modals()?.textareaModal({
    title: "Custom GM Prompt",
    label: "Prompt text",
    placeholder: "A scene seed in your own words…",
    primaryLabel: "Use",
    onSubmit: (text) => {
      if (!text) return false;
      cs().mutate((state) => {
        state.lastOracle = { id: `custom_${Date.now()}`, text, source: "custom", rolledAt: new Date().toISOString() };
      }, { source: "oracle_custom" });
    }
  });
}

export function saveOracleNote(): void {
  const oracle = lastOracle();
  if (!oracle) return;
  cs().mutate((state) => {
    (state.pinnedNotes as Array<{ at: string; text: unknown }>).unshift({ at: new Date().toISOString(), text: oracle.text });
    state.lastOracle = null;
  }, { source: "oracle_note" });
  applyOp({ op: "log", text: "GM prompt saved as note." }, "oracle");
}

export function oracleToEventLog(): void {
  const oracle = lastOracle();
  if (!oracle) return;
  applyOp({
    op: "event_log_add",
    entry: {
      title: oracle.title || "Oracle Prompt",
      summary: oracle.text || oracle.prompt || "",
      source: oracle.source || "oracle",
      scope: "oracle",
      relatedId: oracle.id || null,
      tags: ["oracle", ...(oracle.tags || [])]
    }
  }, "oracle_event_log");
  cs().mutate((state) => {
    state.lastOracle = null;
  }, { source: "oracle_event_log" });
  toast("Oracle summarized in Event Log", "success");
}

export function rollForgeOracle(): void {
  setActiveModeRaw("event");
  setActiveTabRaw("oracleForge");
  const card = mod<IdeaForgeModule>("CampaignIdeaForge")?.rollOracle();
  if (!card) {
    toast("No oracle table available", "info");
    return;
  }
  rerender();
}
