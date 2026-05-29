// gm-override.ts — Phase H.4 port of the GM Override modal (`_gmOverride`)
// from campaign-ui.js.
//
// One modal with an op dropdown; selecting an op swaps in the matching
// field widgets (currency/amount, item picker, character target, stat
// picker, job/skill/passive/status pickers, flag/log/custom inputs). On
// Apply it builds the op payload and runs it through CampaignOps with the
// `gm_override` source.
//
// Shares the roster option builders (`characterOptions` / `skillOptions`
// / `passiveOptions`) with the roster island, read through
// `CampaignUIInternal.PartyTab` (same as roster-modal-pickers.ts).
// Behaviour parity with the closure — same op list, same widgets, same
// validation toasts + op payloads.

import { cs, ds, ops, mod } from "./context";
import { modals, options, widgets, type PickerOption, type SliderEl, type SearchableSelectEl } from "./modals";

interface PartyTabBridge {
  characterOptions?: () => PickerOption[];
  skillOptions?: (memberId: string) => PickerOption[];
  passiveOptions?: (memberId: string) => PickerOption[];
}

function partyTab(): PartyTabBridge | undefined {
  return mod<{ PartyTab?: PartyTabBridge }>("CampaignUIInternal")?.PartyTab;
}

interface ConstModule {
  RANKS?: string[];
  STATS?: string[];
  STAT_NAMES?: Record<string, string>;
}
function constants(): ConstModule | undefined {
  return mod<ConstModule>("CONST");
}
function statName(stat: string): string {
  return constants()?.STAT_NAMES?.[stat] || stat;
}

type GmKind =
  | "money" | "jp" | "inv" | "char" | "charxp" | "level" | "rank_points"
  | "rank" | "stat" | "job" | "jobxp" | "recruit" | "skill" | "passive"
  | "status" | "flag" | "log" | "custom";

interface GmOpDef {
  value: string;
  label: string;
  kind: GmKind;
  bucket?: string;
}

// Field widgets the selected op surfaces. Each kind populates a known
// subset; the submit branch reads the matching fields.
interface GmFields {
  currency?: HTMLSelectElement;
  amount?: SliderEl;
  id?: SearchableSelectEl;
  qty?: SliderEl;
  target?: HTMLSelectElement;
  rank?: HTMLSelectElement;
  stat?: HTMLSelectElement;
  character?: SearchableSelectEl;
  job?: SearchableSelectEl;
  skill?: SearchableSelectEl;
  passive?: SearchableSelectEl;
  status?: SearchableSelectEl;
  duration?: HTMLSelectElement;
  flag?: HTMLInputElement;
  value?: HTMLInputElement;
  text?: HTMLTextAreaElement;
  json?: HTMLTextAreaElement;
}

type OpPayload = { op: string; [key: string]: unknown };

interface JobEntry {
  id?: string;
  name?: string;
  rank?: string | number;
}

export function openGmOverride(defaultTarget = ""): void {
  const ui = widgets();
  const m = modals();
  const opt = options();
  if (!ui || !m) return;

  const GM_OPS: GmOpDef[] = [
    { value: "give_money", label: "Give Money", kind: "money" },
    { value: "take_money", label: "Take Money", kind: "money" },
    { value: "give_jp", label: "Give JP", kind: "jp" },
    { value: "take_jp", label: "Take JP", kind: "jp" },
    { value: "give_item", label: "Give Item", kind: "inv", bucket: "items" },
    { value: "take_item", label: "Take Item", kind: "inv", bucket: "items" },
    { value: "give_material", label: "Give Material", kind: "inv", bucket: "materials" },
    { value: "take_material", label: "Take Material", kind: "inv", bucket: "materials" },
    { value: "give_food", label: "Give Food", kind: "inv", bucket: "food" },
    { value: "take_food", label: "Take Food", kind: "inv", bucket: "food" },
    { value: "damage_character", label: "Damage Character", kind: "char" },
    { value: "heal_character", label: "Heal Character", kind: "char" },
    { value: "add_xp", label: "Add Character XP", kind: "charxp" },
    { value: "add_level", label: "Add Level", kind: "level" },
    { value: "add_rank_points", label: "Add Rank Points", kind: "rank_points" },
    { value: "rank_up_member", label: "Force Rank Up", kind: "rank" },
    { value: "change_stat", label: "Change Stat", kind: "stat" },
    { value: "unlock_job", label: "Unlock Job", kind: "job" },
    { value: "set_job", label: "Set Job", kind: "job" },
    { value: "gain_job_xp", label: "Add Job XP", kind: "jobxp" },
    { value: "recruit_character", label: "Recruit Character", kind: "recruit" },
    { value: "learn_skill", label: "Learn Skill", kind: "skill" },
    { value: "learn_passive", label: "Learn Passive", kind: "passive" },
    { value: "add_status", label: "Add Status", kind: "status" },
    { value: "remove_status", label: "Remove Status", kind: "status" },
    { value: "set_flag", label: "Set Flag", kind: "flag" },
    { value: "clear_flag", label: "Clear Flag", kind: "flag" },
    { value: "log", label: "Log Note", kind: "log" },
    { value: "custom", label: "Custom JSON", kind: "custom" }
  ];

  const body = document.createElement("div");
  body.appendChild(m.formLabel("Operation"));
  const opSelect = ui.createSelect({
    options: GM_OPS.map((o) => ({ value: o.value, label: o.label })),
    value: defaultTarget ? "add_xp" : "give_money",
    onChange: () => renderFields()
  });
  body.appendChild(opSelect);

  const fields = document.createElement("div");
  body.appendChild(fields);

  const partyOptions = (): Array<{ value: string; label: string }> =>
    Object.entries((cs().getState()?.party as Record<string, { name?: string }>) || {}).map(([id, mm]) => ({
      value: id,
      label: mm.name || id
    }));
  const defaultPartyTarget = (): string => {
    const opts = partyOptions();
    return opts.some((entry) => entry.value === defaultTarget) ? defaultTarget : opts[0]?.value || "";
  };
  const jobOptions = (): PickerOption[] =>
    ((ds()?.getAllAsArray("jobs") as JobEntry[]) || [])
      .filter((entry) => entry?.id)
      .map((entry) => ({
        value: String(entry.id),
        label: entry.name || String(entry.id),
        sub: entry.rank ? `Rank ${entry.rank}` : "Job"
      }))
      .sort(m.sortOptionLabel);

  let active: GmFields = {};

  function renderFields(): void {
    fields.innerHTML = "";
    active = {};
    const def = GM_OPS.find((o) => o.value === opSelect.value) || GM_OPS[0];

    if (def.kind === "money") {
      fields.appendChild(m!.formLabel("Currency"));
      const wid = cs().getState()?.currentWorld;
      const currencyOptions = [
        { value: `${wid}_gold`, label: `${wid} gold` },
        { value: "jp", label: "JP" }
      ];
      active.currency = ui!.createSelect({ options: currencyOptions, value: `${wid}_gold` });
      fields.appendChild(active.currency);
      fields.appendChild(m!.formLabel("Amount"));
      active.amount = ui!.createNumberSlider({ value: 10, min: 1, max: 9999, step: 1 });
      fields.appendChild(active.amount);
    } else if (def.kind === "jp") {
      fields.appendChild(m!.formLabel("Amount"));
      active.amount = ui!.createNumberSlider({ value: 1, min: 1, max: 999, step: 1 });
      fields.appendChild(active.amount);
    } else if (def.kind === "inv") {
      const opts = opt?.bucketOptions(def.bucket || "items") || [];
      fields.appendChild(m!.formLabel(def.bucket === "materials" ? "Material" : def.bucket === "food" ? "Food" : "Item"));
      active.id = ui!.createSearchableSelect({ options: opts, placeholder: "Search…" });
      fields.appendChild(active.id);
      fields.appendChild(m!.formLabel("Quantity"));
      active.qty = ui!.createNumberSlider({ value: 1, min: 1, max: 99, step: 1 });
      fields.appendChild(active.qty);
    } else if (def.kind === "char") {
      fields.appendChild(m!.formLabel("Character"));
      active.target = ui!.createSelect({ options: partyOptions(), value: defaultPartyTarget() });
      fields.appendChild(active.target);
      fields.appendChild(m!.formLabel("Amount"));
      active.amount = ui!.createNumberSlider({ value: 5, min: 1, max: 999, step: 1 });
      fields.appendChild(active.amount);
    } else if (def.kind === "charxp") {
      fields.appendChild(m!.formLabel("Character"));
      active.target = ui!.createSelect({ options: partyOptions(), value: defaultPartyTarget() });
      fields.appendChild(active.target);
      fields.appendChild(m!.formLabel("XP"));
      active.amount = ui!.createNumberSlider({ value: 25, min: 1, max: 9999, step: 1 });
      fields.appendChild(active.amount);
    } else if (def.kind === "level") {
      fields.appendChild(m!.formLabel("Character"));
      active.target = ui!.createSelect({ options: partyOptions(), value: defaultPartyTarget() });
      fields.appendChild(active.target);
      fields.appendChild(m!.formLabel("Levels"));
      active.amount = ui!.createNumberSlider({ value: 1, min: 1, max: 20, step: 1 });
      fields.appendChild(active.amount);
    } else if (def.kind === "rank_points") {
      fields.appendChild(m!.formLabel("Character"));
      active.target = ui!.createSelect({ options: partyOptions(), value: defaultPartyTarget() });
      fields.appendChild(active.target);
      fields.appendChild(m!.formLabel("Rank Points"));
      active.amount = ui!.createNumberSlider({ value: 5, min: 1, max: 999, step: 1 });
      fields.appendChild(active.amount);
    } else if (def.kind === "rank") {
      fields.appendChild(m!.formLabel("Character"));
      active.target = ui!.createSelect({ options: partyOptions(), value: defaultPartyTarget() });
      fields.appendChild(active.target);
      fields.appendChild(m!.formLabel("Target Rank"));
      active.rank = ui!.createSelect({
        options: (constants()?.RANKS || ["F", "E", "D", "C", "B", "A", "S", "SR", "SSR"]).map((rank) => ({ value: rank, label: rank })),
        value: "E"
      });
      fields.appendChild(active.rank);
    } else if (def.kind === "stat") {
      fields.appendChild(m!.formLabel("Character"));
      active.target = ui!.createSelect({ options: partyOptions(), value: defaultPartyTarget() });
      fields.appendChild(active.target);
      fields.appendChild(m!.formLabel("Stat"));
      active.stat = ui!.createSelect({
        options: (constants()?.STATS || ["S", "P", "E", "C", "I", "A", "L"]).map((value) => ({ value, label: `${value} - ${statName(value)}` })),
        value: "S"
      });
      fields.appendChild(active.stat);
      fields.appendChild(m!.formLabel("Change"));
      active.amount = ui!.createNumberSlider({ value: 1, min: -20, max: 20, step: 1 });
      fields.appendChild(active.amount);
    } else if (def.kind === "recruit") {
      active.character = ui!.createSearchableSelect({
        options: partyTab()?.characterOptions?.() || [],
        placeholder: "Search characters...",
        renderItem: m!.pickerItem
      });
      fields.appendChild(active.character);
    } else if (def.kind === "job" || def.kind === "jobxp") {
      fields.appendChild(m!.formLabel("Character"));
      active.target = ui!.createSelect({ options: partyOptions(), value: defaultPartyTarget() });
      fields.appendChild(active.target);
      fields.appendChild(m!.formLabel("Job"));
      active.job = ui!.createSearchableSelect({ options: jobOptions(), placeholder: "Search jobs...", renderItem: m!.pickerItem });
      fields.appendChild(active.job);
      if (def.kind === "jobxp") {
        fields.appendChild(m!.formLabel("Job XP"));
        active.amount = ui!.createNumberSlider({ value: 25, min: 1, max: 9999, step: 1 });
        fields.appendChild(active.amount);
      }
    } else if (def.kind === "skill") {
      fields.appendChild(m!.formLabel("Character"));
      active.target = ui!.createSelect({ options: partyOptions(), value: defaultPartyTarget() });
      fields.appendChild(active.target);
      fields.appendChild(m!.formLabel("Skill"));
      active.skill = ui!.createSearchableSelect({
        options: partyTab()?.skillOptions?.(active.target.value) || [],
        placeholder: "Search skills...",
        renderItem: m!.pickerItem
      });
      fields.appendChild(active.skill);
    } else if (def.kind === "passive") {
      fields.appendChild(m!.formLabel("Character"));
      active.target = ui!.createSelect({ options: partyOptions(), value: defaultPartyTarget() });
      fields.appendChild(active.target);
      fields.appendChild(m!.formLabel("Passive"));
      active.passive = ui!.createSearchableSelect({
        options: partyTab()?.passiveOptions?.(active.target.value) || [],
        placeholder: "Search passives...",
        renderItem: m!.pickerItem
      });
      fields.appendChild(active.passive);
    } else if (def.kind === "status") {
      fields.appendChild(m!.formLabel("Character"));
      active.target = ui!.createSelect({ options: partyOptions(), value: defaultPartyTarget() });
      fields.appendChild(active.target);
      fields.appendChild(m!.formLabel("Status"));
      active.status = ui!.createSearchableSelect({ options: opt?.statusOptions() || [], placeholder: "Search statuses…" });
      fields.appendChild(active.status);
      if (def.value === "add_status") {
        fields.appendChild(m!.formLabel("Duration"));
        active.duration = ui!.createSelect({
          options: [
            { value: "manual", label: "Manual" },
            { value: "scene", label: "Scene" },
            { value: "scenario", label: "Scenario" },
            { value: "3", label: "3 turns" },
            { value: "5", label: "5 turns" }
          ],
          value: "manual"
        });
        fields.appendChild(active.duration);
      }
    } else if (def.kind === "flag") {
      fields.appendChild(m!.formLabel("Flag name"));
      active.flag = document.createElement("input");
      active.flag.type = "text";
      active.flag.placeholder = "flag_id";
      active.flag.style.width = "100%";
      fields.appendChild(active.flag);
      if (def.value === "set_flag") {
        fields.appendChild(m!.formLabel("Value (text or true)"));
        active.value = document.createElement("input");
        active.value.type = "text";
        active.value.placeholder = "leave blank for true";
        active.value.style.width = "100%";
        fields.appendChild(active.value);
      }
    } else if (def.kind === "log") {
      fields.appendChild(m!.formLabel("Log text"));
      active.text = document.createElement("textarea");
      active.text.style.width = "100%";
      active.text.style.minHeight = "90px";
      fields.appendChild(active.text);
    } else if (def.kind === "custom") {
      fields.appendChild(m!.formLabel("Custom JSON op"));
      active.json = document.createElement("textarea");
      active.json.style.width = "100%";
      active.json.style.minHeight = "120px";
      active.json.placeholder = '{"op":"give_material","id":"haven_wolf_pelt","qty":2}';
      fields.appendChild(active.json);
    }
  }

  renderFields();

  m.formModal({
    title: "GM Override",
    body,
    width: "560px",
    primaryLabel: "Apply",
    onSubmit: () => {
      try {
        const def = GM_OPS.find((o) => o.value === opSelect.value) || GM_OPS[0];
        let op: OpPayload | undefined;
        if (def.kind === "money") {
          op = { op: def.value, currency: active.currency!.value, amount: active.amount!._getValue() };
        } else if (def.kind === "jp") {
          op = { op: def.value, amount: active.amount!._getValue() };
        } else if (def.kind === "inv") {
          const id = active.id!._getValue();
          if (!id) { ui.toast("Pick an item", "error"); return false; }
          op = { op: def.value, id, qty: active.qty!._getValue() || 1 };
        } else if (def.kind === "char") {
          op = { op: def.value, target: active.target!.value, amount: active.amount!._getValue() };
        } else if (def.kind === "charxp") {
          op = { op: def.value, target: active.target!.value, amount: active.amount!._getValue() || 0 };
        } else if (def.kind === "level") {
          op = { op: def.value, target: active.target!.value, amount: active.amount!._getValue() || 1 };
        } else if (def.kind === "rank_points") {
          op = { op: def.value, target: active.target!.value, amount: active.amount!._getValue() || 0 };
        } else if (def.kind === "rank") {
          op = { op: def.value, target: active.target!.value, toRank: active.rank!.value, force: true, source: "gm_override" };
        } else if (def.kind === "stat") {
          op = { op: def.value, target: active.target!.value, stat: active.stat!.value, amount: active.amount!._getValue() || 0 };
        } else if (def.kind === "recruit") {
          const characterId = active.character!._getValue();
          if (!characterId) { ui.toast("Pick a character", "error"); return false; }
          op = { op: def.value, characterId };
        } else if (def.kind === "job" || def.kind === "jobxp") {
          const jobId = active.job!._getValue();
          if (!jobId) { ui.toast("Pick a job", "error"); return false; }
          op = { op: def.value, target: active.target!.value, jobId, force: true };
          if (def.kind === "jobxp") op.amount = active.amount!._getValue() || 0;
        } else if (def.kind === "skill") {
          const skillId = active.skill!._getValue();
          if (!skillId) { ui.toast("Pick a skill", "error"); return false; }
          op = { op: def.value, target: active.target!.value, skillId };
        } else if (def.kind === "passive") {
          const passiveId = active.passive!._getValue();
          if (!passiveId) { ui.toast("Pick a passive", "error"); return false; }
          op = { op: def.value, target: active.target!.value, passiveId };
        } else if (def.kind === "status") {
          const status = active.status!._getValue();
          if (!status) { ui.toast("Pick a status", "error"); return false; }
          op = { op: def.value, target: active.target!.value, status };
          if (def.value === "add_status") op.duration = active.duration!.value || "manual";
        } else if (def.kind === "flag") {
          const flag = active.flag!.value.trim();
          if (!flag) { ui.toast("Flag name required", "error"); return false; }
          op = { op: def.value, flag };
          if (def.value === "set_flag") op.value = active.value!.value.trim() || true;
        } else if (def.kind === "log") {
          op = { op: "log", text: active.text!.value.trim() };
        } else if (def.kind === "custom") {
          op = JSON.parse(active.json!.value.trim() || "{}");
        }
        ops().apply(op as OpPayload, { source: "gm_override" });
      } catch (error) {
        ui.toast((error as Error)?.message || "Invalid override", "error");
        return false;
      }
    }
  });
}
