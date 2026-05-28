// roster-modal-pickers.ts — Phase H.3 roster modal picker handlers.
//
// recruit-character / learn-skill / learn-passive are op-picker modals
// over option lists the still-JS closures (`_characterOptions` /
// `_skillOptions` / `_passiveOptions`) build. The option builders stay
// in JS because the still-JS GM override modal (`_gmOverride`) also
// reads them; they reach the TS handlers through the new
// `CampaignUI.rosterCharacterOptions/SkillOptions/PassiveOptions`
// bridges. show-skill-detail opens a small skill perk-list info modal.
//
// Modal copy, op names, payload keys and the `ui` source mirror the
// deleted closures (`_recruitCharacterModal`, `_learnSkillModal`,
// `_learnPassiveModal`, `_showSkillDetailModal`).

import { applyOp, cs, ds, mod, toast } from "./context";
import { esc, modals, widgets, type PickerOption } from "./modals";

interface RosterBridge {
  rosterCharacterOptions?: () => PickerOption[];
  rosterSkillOptions?: (memberId: string) => PickerOption[];
  rosterPassiveOptions?: (memberId: string) => PickerOption[];
  skillMetaText?: (skill: unknown, entry: { level?: number } | undefined) => string;
  recordIconHtml?: (record: unknown, opts: { kind?: string; size?: string }) => string;
}

function bridge(): RosterBridge | undefined {
  return mod<RosterBridge>("CampaignUI");
}

// Equipment helpers live in window.CJS.CampaignUIInternal.Equipment — a
// stable shared module. Typed accessor here so the handlers don't
// re-declare it.
interface EquipmentApi {
  slotLabel: (slot: string) => string;
  equipmentOptions: (member: Record<string, unknown>, slot: string) => PickerOption[];
  equipmentPickerItem: (option: PickerOption) => string;
}
interface CuiInternalEquipment {
  Equipment?: EquipmentApi;
}
function equipmentApi(): EquipmentApi | undefined {
  return mod<CuiInternalEquipment>("CampaignUIInternal")?.Equipment;
}

interface ConstModule {
  STATS?: string[];
  STAT_NAMES?: Record<string, string>;
}
function constants(): ConstModule | undefined {
  return mod<ConstModule>("CONST");
}
function statName(stat: string): string {
  return constants()?.STAT_NAMES?.[stat] || stat;
}

export function recruitCharacterModal(): void {
  const options = bridge()?.rosterCharacterOptions?.() ?? [];
  if (!options.length) {
    toast("No unrecruited characters found in Edit Mode", "info");
    return;
  }
  modals()?.opPickerModal({
    title: "Recruit Character",
    options,
    placeholder: "Search characters...",
    primaryLabel: "Recruit",
    onSubmit: ({ value }) => {
      applyOp({ op: "recruit_character", characterId: value });
    }
  });
}

export function learnSkillModal(memberId: string): void {
  if (!memberId) return;
  const options = bridge()?.rosterSkillOptions?.(memberId) ?? [];
  if (!options.length) {
    toast("No unlearned skills found in Edit Mode", "info");
    return;
  }
  modals()?.opPickerModal({
    title: "Learn Skill",
    options,
    placeholder: "Search skills...",
    primaryLabel: "Learn",
    onSubmit: ({ value }) => {
      applyOp({ op: "learn_skill", target: memberId, skillId: value });
    }
  });
}

export function learnPassiveModal(memberId: string): void {
  if (!memberId) return;
  const options = bridge()?.rosterPassiveOptions?.(memberId) ?? [];
  if (!options.length) {
    toast("No unlearned passives found in Edit Mode", "info");
    return;
  }
  modals()?.opPickerModal({
    title: "Learn Passive",
    options,
    placeholder: "Search passives...",
    primaryLabel: "Learn",
    onSubmit: ({ value }) => {
      applyOp({ op: "learn_passive", target: memberId, passiveId: value });
    }
  });
}

// ── show-skill-detail (info modal showing every level perk) ────────

interface SkillPerk {
  level?: number;
  description?: string;
  modifiers?: Record<string, number>;
  addEffects?: Array<{ effectId?: string }>;
}

interface Skill {
  id?: string;
  name?: string;
  description?: string;
  levelPerks?: SkillPerk[];
  [key: string]: unknown;
}

interface Member {
  name?: string;
  skillProgress?: Record<string, { ap?: number | string; level?: number | string }>;
  [key: string]: unknown;
}

interface FormulasModule {
  getSkillMaxLevel?: (skill: unknown) => number;
  calcSkillApToNextLevel?: (skill: unknown, ap: number, level: number) => number | null;
}

interface UiSimpleModal {
  openModal: (cfg: { title: string; content: HTMLElement; width?: string }) => unknown;
}

interface SkillMetaBridge {
  skillMetaText?: (skill: unknown, entry: { level?: number } | undefined) => string;
  recordIconHtml?: (record: unknown, opts: { kind?: string; size?: string }) => string;
}

// Mirrors `_showSkillDetailModal`. Renders the same header (icon, name,
// description, skill meta line + Lv X/cap + AbP X (Y to next)) and
// per-level perk rows (earned ✔ or unlocks-at hint, modifiers, added
// effects). The skill meta + icon HTML come from the still-JS render
// helpers via the new bridges so the modal stays in sync with the
// roster card.
export function showSkillDetailModal(memberId: string, skillId: string): void {
  if (!memberId || !skillId) return;
  const ui = mod<UiSimpleModal>("UI");
  if (!ui?.openModal) return;
  const skill = ds()?.get("skills", skillId) as Skill | undefined;
  if (!skill) {
    toast("Skill not found", "error");
    return;
  }
  const member = (cs().getState() as { party?: Record<string, Member> } | null)?.party?.[memberId];
  const F = mod<FormulasModule>("Formulas");
  const prog = member?.skillProgress?.[skillId] || { ap: 0, level: 1 };
  const cap = F?.getSkillMaxLevel?.(skill) ?? 5;
  const level = Math.max(1, Number(prog.level || 1));
  const ap = Number(prog.ap || 0);
  const apToNext = F?.calcSkillApToNextLevel?.(skill, ap, level) ?? null;

  const bridgeApi = mod<SkillMetaBridge>("CampaignUI");
  const iconHtml = bridgeApi?.recordIconHtml?.(skill, { kind: "skill", size: "sm" }) ?? "";
  const metaText = bridgeApi?.skillMetaText?.(skill, { level }) ?? "";

  const body = document.createElement("div");
  body.innerHTML = `
      <div style="margin-bottom:12px">
        <div><b>${iconHtml} ${esc(skill.name || skillId)}</b></div>
        <div class="campaign-muted">${esc(skill.description || "")}</div>
        <div style="margin-top:6px">
          ${esc(metaText)}
          | <b>Lv ${level}/${cap}</b>
          | AbP ${ap}${apToNext != null ? ` (${apToNext} to next)` : " (max)"}
        </div>
      </div>
      <div class="campaign-section-title">Level Perks</div>
      <div id="skl-detail-perks"></div>
    `;
  const perksArea = body.querySelector("#skl-detail-perks") as HTMLElement | null;
  const perks = Array.isArray(skill.levelPerks)
    ? [...skill.levelPerks].sort((a, b) => Number(a.level || 0) - Number(b.level || 0))
    : [];
  if (perksArea) {
    if (!perks.length) {
      perksArea.innerHTML =
        '<div class="campaign-empty">No authored perks. (Power scales with level via levelScaling.powerPerLevel.)</div>';
    } else {
      perksArea.innerHTML = perks
        .map((perk) => {
          const earned = Number(perk.level || 0) <= level;
          const tag = earned
            ? '<span style="color:var(--green)">✔ earned</span>'
            : `<span class="campaign-muted">unlocks at Lv ${perk.level}</span>`;
          const mods = perk.modifiers
            ? Object.entries(perk.modifiers)
                .filter(([, v]) => v)
                .map(([k, v]) => `${k} ${Number(v) >= 0 ? "+" : ""}${v}`)
                .join(", ")
            : "";
          const addEff = (perk.addEffects || [])
            .map((e) => e.effectId)
            .filter(Boolean)
            .join(", ");
          return `
          <div class="campaign-record-line" style="opacity:${earned ? 1 : 0.6}">
            <div>
              <strong>Lv ${perk.level}</strong>
              <small>${tag}</small>
              <p>${esc(perk.description || "")}</p>
              ${mods ? `<div class="campaign-muted" style="font-size:0.8em">Modifiers: ${esc(mods)}</div>` : ""}
              ${addEff ? `<div class="campaign-muted" style="font-size:0.8em">Adds effects: ${esc(addEff)}</div>` : ""}
            </div>
          </div>`;
        })
        .join("");
    }
  }

  ui.openModal({
    title: `Skill Detail: ${skill.name || skillId}`,
    content: body,
    width: "600px"
  });
  // Reference member name for parity with closure (no UI change).
  void (member?.name || memberId);
}

// ── equip-item (slot equipment picker) ─────────────────────────────

// Mirrors `_equipItemModal`. Builds a slot-aware option list, uses the
// equipment-specific picker-item renderer (so the modal shows stat
// deltas), and applies `equip_item` with the slot kebab-name.
export function equipItemModal(memberId: string, slot: string): void {
  if (!memberId || !slot) return;
  const member = (cs().getState() as { party?: Record<string, Member> } | null)?.party?.[memberId] as
    | (Member & Record<string, unknown>)
    | undefined;
  if (!member) return;
  const equipment = equipmentApi();
  const options = equipment?.equipmentOptions(member as Record<string, unknown>, slot) ?? [];
  if (!options.length) {
    const label = equipment?.slotLabel(slot) || slot;
    toast(`No ${label.toLowerCase()} options found in Edit Mode`, "info");
    return;
  }
  const label = equipment?.slotLabel(slot) || slot;
  modals()?.opPickerModal({
    title: `Equip ${label}: ${member.name || memberId}`,
    options,
    placeholder: "Search equipment...",
    primaryLabel: "Equip",
    renderItem: equipment?.equipmentPickerItem,
    onSubmit: ({ value }) => {
      applyOp({ op: "equip_item", target: memberId, itemId: value, slot });
    }
  });
}

// ── stat-boost (form modal with stat select + amount slider) ───────

// Mirrors `_statBoostModal`. Renders a Stat select + Change slider
// (-20..20). The Stat options use the same C().STATS list +
// C().STAT_NAMES the deleted closure read; falls back to S/P/E/C/I/A/L.
export function statBoostModal(memberId: string): void {
  if (!memberId) return;
  const member = (cs().getState() as { party?: Record<string, Member> } | null)?.party?.[memberId];
  if (!member) return;
  const ui = widgets();
  const m = modals();
  if (!ui || !m) return;

  const body = document.createElement("div");
  body.appendChild(m.formLabel("Stat"));
  const stats = constants()?.STATS || ["S", "P", "E", "C", "I", "A", "L"];
  const stat = ui.createSelect({
    options: stats.map((value) => ({ value, label: `${value} - ${statName(value)}` })),
    value: "S"
  });
  body.appendChild(stat);
  body.appendChild(m.formLabel("Change"));
  const amount = ui.createNumberSlider({ value: 1, min: -20, max: 20, step: 1 });
  body.appendChild(amount);
  m.formModal({
    title: `Stat Growth: ${member.name || memberId}`,
    body,
    primaryLabel: "Apply",
    onSubmit: () => {
      applyOp({
        op: "change_stat",
        target: memberId,
        stat: stat.value,
        amount: amount._getValue() || 0
      });
    }
  });
}
