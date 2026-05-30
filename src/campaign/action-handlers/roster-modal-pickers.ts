// roster-modal-pickers.ts — Phase H.3 roster modal picker handlers.
//
// recruit-character / learn-skill / learn-passive are op-picker modals
// over option lists the roster island builds. Phase H.4 — the option
// builders + member math moved into `cui-party-tab.js` (the roster
// island), exposed on `CampaignUIInternal.PartyTab`
// (characterOptions / skillOptions / passiveOptions / skillMetaText /
// memberRankInfo / renderPartySheetHtml). The record-icon HTML comes
// from `CampaignUIInternal.Portraits.icon`. show-skill-detail opens a
// small skill perk-list info modal.
//
// Modal copy, op names, payload keys and the `ui` source mirror the
// deleted closures (`_recruitCharacterModal`, `_learnSkillModal`,
// `_learnPassiveModal`, `_showSkillDetailModal`).

import { applyOp, cs, ds, mod, toast } from "./context";
import { esc, modals, widgets, type PickerOption } from "./modals";
import { getPartySheetData } from "../tabs/data/roster";

export interface MemberRankInfo {
  rank: string;
  effective: string;
  capped: boolean;
  ceiling: string | null;
  label: string;
  next: string | null;
  threshold: number;
  rp: number;
  pct: number;
  atMax: boolean;
}

// Equipment / PartyTab / Portraits helpers live on
// `window.CJS.CampaignUIInternal` — stable shared islands. Typed
// accessors here so the handlers don't re-declare them.
interface EquipmentApi {
  slotLabel: (slot: string) => string;
  equipmentOptions: (member: Record<string, unknown>, slot: string) => PickerOption[];
  equipmentPickerItem: (option: PickerOption) => string;
}
interface PartyTabBridge {
  characterOptions?: () => PickerOption[];
  skillOptions?: (memberId: string) => PickerOption[];
  passiveOptions?: (memberId: string) => PickerOption[];
  skillMetaText?: (skill: unknown, entry: { level?: number } | undefined) => string;
  memberRankInfo?: (member: unknown) => MemberRankInfo;
}
interface PortraitsBridge {
  icon?: (record: unknown, opts: { kind?: string; size?: string }) => string;
}
interface CuiInternal {
  Equipment?: EquipmentApi;
  PartyTab?: PartyTabBridge;
  Portraits?: PortraitsBridge;
}
function cuiInternal(): CuiInternal | undefined {
  return mod<CuiInternal>("CampaignUIInternal");
}
function equipmentApi(): EquipmentApi | undefined {
  return cuiInternal()?.Equipment;
}
function partyTab(): PartyTabBridge | undefined {
  return cuiInternal()?.PartyTab;
}
function portraits(): PortraitsBridge | undefined {
  return cuiInternal()?.Portraits;
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
  const options = partyTab()?.characterOptions?.() ?? [];
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
  const options = partyTab()?.skillOptions?.(memberId) ?? [];
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
  const options = partyTab()?.passiveOptions?.(memberId) ?? [];
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

// Mirrors `_showSkillDetailModal`. Renders the same header (icon, name,
// description, skill meta line + Lv X/cap + AbP X (Y to next)) and
// per-level perk rows (earned ✔ or unlocks-at hint, modifiers, added
// effects). The skill meta + icon HTML come from the roster island
// (PartyTab.skillMetaText + Portraits.icon) so the modal stays in sync
// with the roster card.
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

  const iconHtml = portraits()?.icon?.(skill, { kind: "skill", size: "sm" }) ?? "";
  const metaText = partyTab()?.skillMetaText?.(skill, { level }) ?? "";

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

// ── change-job (form modal: job select with allowed/other groups) ──

interface Job {
  id?: string;
  name?: string;
  icon?: string;
  tier?: number;
  branch?: string;
  description?: string;
  levels?: Array<{
    level?: number;
    statBonus?: Record<string, number>;
    grantsSkills?: string[];
    grantsPassives?: string[];
    description?: string;
  }>;
  unlockRequirement?: { jobId?: string; minLevel?: number };
  [key: string]: unknown;
}

interface MemberWithJob extends Member {
  baseCharacterId?: string;
  unlockedJobs?: string[];
  availableBranches?: string[];
  baseAvailableJobs?: string[];
  maxJobs?: number;
  currentJob?: string;
  jobProgress?: Record<string, { xp?: number; level?: number }>;
}

// Mirrors `_changeJobModal`. Builds a 3-section option list:
// (1) "— Remove current job —", (2) jobs in the character's allowed
// set (current job tagged), (3) other jobs flagged "(unlock)".
// On submit: clear / set / unlock+set depending on the choice.
export function changeJobModal(memberId: string): void {
  if (!memberId) return;
  const member = (cs().getState() as { party?: Record<string, MemberWithJob> } | null)?.party?.[memberId];
  if (!member) return;
  const baseChar =
    (ds()?.get("characters", member.baseCharacterId || memberId) as { availableJobs?: string[] } | undefined) || {};
  const allowed = new Set<string>([
    ...((baseChar.availableJobs || []) as string[]),
    ...(member.unlockedJobs || [])
  ]);
  if (member.currentJob) allowed.add(member.currentJob);
  const allJobs = (ds()?.getAllAsArray("jobs") as Job[] | undefined) || [];
  const fromAllowed = allJobs.filter((j) => allowed.has(j.id || ""));
  const others = allJobs.filter((j) => !allowed.has(j.id || ""));
  if (!allJobs.length) {
    toast("No jobs authored yet. Open the editor → Jobs to create some.", "info");
    return;
  }
  const options = [
    { value: "", label: "— Remove current job —" },
    ...fromAllowed.map((j) => ({
      value: j.id || "",
      label: `${j.icon || "🛡️"} ${j.name} ${j.id === member.currentJob ? "(current)" : ""}`
    })),
    ...(others.length ? [{ value: "__hr__", label: "── Other (will unlock) ──", disabled: true }] : []),
    ...others.map((j) => ({ value: j.id || "", label: `${j.icon || "🛡️"} ${j.name} (unlock)` }))
  ];
  const ui = widgets();
  const m = modals();
  if (!ui || !m) return;
  const body = document.createElement("div");
  body.appendChild(m.formLabel("Job"));
  const sel = ui.createSelect({ options, value: member.currentJob || "" });
  body.appendChild(sel);
  m.formModal({
    title: `Change Job: ${member.name || memberId}`,
    body,
    primaryLabel: "Apply",
    onSubmit: () => {
      const value = sel.value;
      if (value === "") {
        applyOp({ op: "set_job", target: memberId, jobId: null });
      } else if (!allowed.has(value)) {
        applyOpList([
          { op: "unlock_job", target: memberId, jobId: value },
          { op: "set_job", target: memberId, jobId: value }
        ]);
      } else {
        applyOp({ op: "set_job", target: memberId, jobId: value });
      }
    }
  });
}

// Helper: applyOp variant that takes an array of ops (matches the
// closure's two-call patterns: unlock_job + set_job).
function applyOpList(opsList: Array<{ op: string; [key: string]: unknown }>): void {
  const ops = mod<{ apply: (op: unknown, opts?: { source?: string }) => unknown }>("CampaignOps");
  ops?.apply(opsList, { source: "ui" });
}

// ── change-persona (form modal: persona select + live preview) ─────

interface Persona {
  id?: string;
  name?: string;
  icon?: string;
  description?: string;
  world?: string;
  unlock?: {
    default?: boolean;
    requiresPhaseNumber?: number;
    requiresChapter?: number;
    requiresFlag?: string;
  };
  crossWorldPenalty?: {
    damageDealtMultiplier?: number;
    damageTakenMultiplier?: number;
    relationshipModifier?: number;
  };
}

interface PersonaServiceModule {
  personasForCharacter?: (charId: string) => Persona[];
}

interface MemberWithPersona extends Member {
  baseCharacterId?: string;
  unlockedPersonas?: string[];
  activePersona?: string;
}

// Mirrors `_changePersonaModal`. Renders a sorted persona select
// (unlocked first, world-matching first) with a live preview pane.
// Submit applies `set_persona` with the chosen id (null when
// "no persona" is picked).
export function changePersonaModal(memberId: string): void {
  if (!memberId) return;
  const state = cs().getState() as { party?: Record<string, MemberWithPersona>; currentWorld?: string } | null;
  const member = state?.party?.[memberId];
  if (!member) return;
  const PS = mod<PersonaServiceModule>("PersonaService");
  if (!PS) {
    toast("Persona system not loaded.", "error");
    return;
  }
  const charId = member.baseCharacterId || memberId;
  const personasList = PS.personasForCharacter?.(charId) || [];
  if (!personasList.length) {
    toast(
      `No personas authored for ${member.name || memberId}. Open the editor → Personas to create one.`,
      "info"
    );
    return;
  }
  const currentWorld = state?.currentWorld || "";
  const unlocked = new Set(member.unlockedPersonas || []);
  const score = (p: Persona): number => {
    let s = 0;
    if (unlocked.has(p.id || "")) s += 10;
    if (p.world === currentWorld) s += 4;
    if (p.unlock?.default) s += 1;
    return s;
  };
  const sorted = personasList.slice().sort(
    (a, b) => score(b) - score(a) || String(a.name || a.id).localeCompare(String(b.name || b.id))
  );

  const options = [
    { value: "", label: "— No persona (use base character) —" },
    ...sorted.map((p) => {
      const isUnlocked = unlocked.has(p.id || "");
      const worldLabel = p.world
        ? (ds()?.get("worlds", p.world) as { displayName?: string } | undefined)?.displayName || p.world
        : "—";
      const outOfWorld = p.world && p.world !== currentWorld;
      const flag = isUnlocked ? "" : " [LOCKED]";
      const here = p.id === member.activePersona ? " (current)" : "";
      const penalty = outOfWorld ? " (out of world)" : "";
      return {
        value: p.id || "",
        label: `${p.icon || "🎭"} ${p.name || p.id} — ${worldLabel}${penalty}${here}${flag}`,
        disabled: !isUnlocked
      };
    })
  ];

  const ui = widgets();
  const m = modals();
  if (!ui || !m) return;
  const body = document.createElement("div");
  body.appendChild(m.formLabel("Persona"));
  const sel = ui.createSelect({ options, value: member.activePersona || "" });
  body.appendChild(sel);
  const preview = document.createElement("div");
  preview.style.marginTop = "12px";
  preview.style.padding = "8px 10px";
  preview.style.borderRadius = "6px";
  preview.style.background = "rgba(255,255,255,0.04)";
  preview.style.fontSize = "0.85rem";
  body.appendChild(preview);
  const renderPreview = (): void => {
    const pid = sel.value;
    if (!pid) {
      preview.innerHTML =
        '<em class="campaign-muted">Clears the active persona. Combat will use the base character record.</em>';
      return;
    }
    const persona = ds()?.get("personas", pid) as Persona | undefined;
    if (!persona) {
      preview.innerHTML = "";
      return;
    }
    const pen = persona.crossWorldPenalty || {};
    const outOfWorld = persona.world && persona.world !== currentWorld;
    const unlockBits: string[] = [];
    if (persona.unlock?.default) unlockBits.push("Default unlock");
    if (persona.unlock?.requiresPhaseNumber) unlockBits.push(`Phase ≥ ${persona.unlock.requiresPhaseNumber}`);
    if (persona.unlock?.requiresChapter) unlockBits.push(`Chapter ≥ ${persona.unlock.requiresChapter}`);
    if (persona.unlock?.requiresFlag) unlockBits.push(`Flag: ${persona.unlock.requiresFlag}`);
    preview.innerHTML = `
        <div><b>${esc(persona.name || "")}</b> ${persona.world ? `<span class="campaign-muted">(${esc(persona.world)})</span>` : ""}</div>
        ${persona.description ? `<div style="margin-top:4px">${esc(persona.description)}</div>` : ""}
        ${unlockBits.length ? `<div class="campaign-muted" style="margin-top:4px">Unlock: ${esc(unlockBits.join(", "))}</div>` : ""}
        ${outOfWorld ? `<div style="margin-top:6px;color:#f59e0b">⚠ Out of world. Damage dealt ×${Number(pen.damageDealtMultiplier ?? 1)}, taken ×${Number(pen.damageTakenMultiplier ?? 1)}, relationship ${Number(pen.relationshipModifier ?? 0)}.</div>` : ""}
      `;
  };
  sel.addEventListener("change", renderPreview);
  renderPreview();

  m.formModal({
    title: `Switch Persona: ${member.name || memberId}`,
    body,
    primaryLabel: "Apply",
    onSubmit: () => {
      applyOp({ op: "set_persona", target: memberId, personaId: sel.value || null });
    }
  });
}

// ── show-job-tree (per-branch job cards with unlock/switch actions) ─

interface FormulasModuleJobs {
  getJobMaxLevel?: (job: Job) => number;
  calcJobXpToNextLevel?: (job: Job, xp: number, level: number) => number | null;
  canUnlockJob?: (job: Job, member: MemberWithJob, jobs: Record<string, Job>) => {
    ok: boolean;
    reason?: string;
    need?: number;
  };
}

interface UiPlain {
  openModal: (cfg: { title: string; content: HTMLElement; footer?: HTMLElement; width?: string }) => unknown;
  closeModal?: (overlay: unknown) => void;
}

function jobLabel(jobId: string): string {
  const job = ds()?.get("jobs", jobId) as Job | undefined;
  return job ? `${job.icon || "🛡️"} ${job.name || jobId}` : jobId;
}

function eligibilityReasonText(
  eligibility: { reason?: string; need?: number } | undefined,
  job: Job
): string {
  if (!eligibility) return "unknown";
  if (eligibility.reason === "max_jobs_reached") return "job slots full";
  if (eligibility.reason === "branch_not_available") return "branch not allowed for this character";
  if (eligibility.reason === "prereq_not_unlocked") return `requires ${job.unlockRequirement?.jobId}`;
  if (eligibility.reason === "prereq_level_low") {
    return `requires ${job.unlockRequirement?.jobId} Lv ${eligibility.need || job.unlockRequirement?.minLevel}`;
  }
  if (eligibility.reason === "prereq_job_missing") return "prereq job missing in DataStore";
  return eligibility.reason || "locked";
}

// Mirrors `_renderBranchColumn`. Returns one HTML string per branch:
// section header + per-job card. Each per-card action button carries
// data-job-action / data-job-id the outer modal's local click delegate
// reads to route through the action runtime (unlock-job-from-tree /
// switch-job-from-tree).
function renderBranchColumn(
  memberId: string,
  member: MemberWithJob,
  branchId: string,
  jobs: Job[],
  jobsCollection: Record<string, Job>,
  F: FormulasModuleJobs | undefined
): string {
  const header = `<div class="campaign-section-title" style="margin-top:8px">${esc(branchId)} branch</div>`;
  const iconBridge = portraits();
  const cards = jobs.map((job) => {
    const unlocked = (member.unlockedJobs || []).includes(job.id || "");
    const isCurrent = member.currentJob === job.id;
    const prog = member.jobProgress?.[job.id || ""] || { xp: 0, level: 1 };
    const cap = F?.getJobMaxLevel?.(job) ?? 5;
    const level = Math.max(1, Number(prog.level || 1));
    const xp = Number(prog.xp || 0);
    const xpToNext = F?.calcJobXpToNextLevel?.(job, xp, level) ?? null;
    const xpMeta =
      level >= cap
        ? `Lv ${level}/${cap} (max)`
        : xpToNext != null
          ? `Lv ${level}/${cap} | XP ${xp} (${xpToNext} to next)`
          : `Lv ${level}/${cap}`;
    const eligibility = F?.canUnlockJob?.(job, member, jobsCollection) ?? { ok: true };
    let statusBadge = "";
    let actionBtn = "";
    if (isCurrent) {
      statusBadge = '<span style="color:var(--green)">● ACTIVE</span>';
    } else if (unlocked) {
      statusBadge = '<span style="color:var(--accent)">● UNLOCKED</span>';
      actionBtn = `<button class="campaign-action" data-job-action="switch" data-job-id="${esc(job.id || "")}">Switch to this job</button>`;
    } else if (eligibility.ok) {
      statusBadge = '<span class="campaign-muted">○ available</span>';
      actionBtn = `<button class="campaign-action" data-job-action="unlock" data-job-id="${esc(job.id || "")}">Unlock &amp; switch</button>`;
    } else {
      statusBadge = `<span class="campaign-muted">🔒 ${esc(eligibilityReasonText(eligibility, job))}</span>`;
    }
    const levels = Array.isArray(job.levels) ? [...job.levels].sort((a, b) => Number(a.level) - Number(b.level)) : [];
    const levelLines = levels
      .map((tier) => {
        const earned = unlocked && Number(tier.level || 0) <= level;
        const star = earned ? "★" : "☆";
        const stat = tier.statBonus
          ? Object.entries(tier.statBonus).filter(([, v]) => v).map(([k, v]) => `${k}+${v}`).join(" ")
          : "";
        const skills = (tier.grantsSkills || []).join(", ");
        const passives = (tier.grantsPassives || []).join(", ");
        const desc =
          tier.description ||
          [stat, skills && `learn ${skills}`, passives && `passive ${passives}`].filter(Boolean).join(" · ");
        return `<div style="opacity:${earned ? 1 : 0.65};font-size:0.85em">${star} <b>Lv ${tier.level}</b> — ${esc(desc || "...")}</div>`;
      })
      .join("");
    const iconHtml = iconBridge?.icon?.(job, { kind: "job", size: "sm" }) ?? "";
    return `
        <div class="campaign-record-line" style="margin-bottom:8px">
          <div>
            <strong>${iconHtml} ${esc(job.name || job.id || "")} <small style="color:var(--text-mute)">tier ${job.tier || 1}</small></strong>
            <small>${statusBadge} | ${esc(xpMeta)}</small>
            <p>${esc(job.description || "")}</p>
            <div style="margin-top:4px">${levelLines || '<i class="campaign-muted">No level data authored.</i>'}</div>
          </div>
          ${actionBtn ? `<div>${actionBtn}</div>` : ""}
        </div>`;
  }).join("");
  // Reference member name for parity (no UI change).
  void (memberId);
  return header + cards;
}

// Mirrors `_showJobTreeModal`. Groups jobs by branch within the
// member's allowed scope, opens an info modal with per-branch cards.
// Local click delegate routes per-card action buttons through the
// runtime registry (fixes a pre-existing bug — the closure modal had
// no delegate, so unlock/switch buttons silently did nothing).
export function showJobTreeModal(memberId: string): void {
  if (!memberId) return;
  const member = (cs().getState() as { party?: Record<string, MemberWithJob> } | null)?.party?.[memberId];
  if (!member) return;
  const ui = mod<UiPlain>("UI");
  if (!ui?.openModal) return;
  const F = mod<FormulasModuleJobs>("Formulas");
  const allJobs = (ds()?.getAllAsArray("jobs") as Job[] | undefined) || [];
  const jobsCollection =
    (ds() as unknown as { getAll?: (type: string) => Record<string, Job> } | undefined)?.getAll?.("jobs") || {};

  const memberBranches = new Set(member.availableBranches || []);
  const memberAllow = new Set(member.baseAvailableJobs || []);
  const groups: Record<string, Job[]> = {};
  for (const job of allJobs) {
    const branch = job.branch || "other";
    const inScope =
      memberBranches.has(branch) ||
      memberAllow.has(job.id || "") ||
      (member.unlockedJobs || []).includes(job.id || "");
    if (!inScope) continue;
    groups[branch] = groups[branch] || [];
    groups[branch].push(job);
  }
  for (const list of Object.values(groups)) {
    list.sort((a, b) => Number(a.tier || 1) - Number(b.tier || 1));
  }

  const body = document.createElement("div");
  const slotInfo = `Slots used: ${(member.unlockedJobs || []).length} / ${member.maxJobs || 3}`;
  const currentLine = member.currentJob
    ? ` — Current: <b>${esc(jobLabel(member.currentJob))}</b>`
    : " — No active job";
  body.innerHTML = `
      <div style="margin-bottom:8px" class="campaign-muted">
        ${esc(member.name || memberId)} — ${slotInfo}
        ${currentLine}
      </div>
      <div id="job-tree-area"></div>
    `;
  const area = body.querySelector("#job-tree-area") as HTMLElement | null;

  if (area) {
    if (!Object.keys(groups).length) {
      area.innerHTML =
        '<div class="campaign-empty">No job branches authored on this character. Add availableBranches or availableJobs in the editor.</div>';
    } else {
      area.innerHTML = Object.entries(groups)
        .map(([branch, list]) => renderBranchColumn(memberId, member, branch, list, jobsCollection, F))
        .join("");
    }
  }

  const runtime = mod<{ run?: (name: string, data?: Record<string, unknown>) => unknown }>("CampaignActionsRuntime");
  body.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const btn = target?.closest("[data-job-action]") as HTMLElement | null;
    if (!btn) return;
    event.preventDefault();
    const action = btn.dataset.jobAction;
    const jobId = btn.dataset.jobId || "";
    if (action === "unlock") runtime?.run?.("unlock-job-from-tree", { id: memberId, jobId });
    else if (action === "switch") runtime?.run?.("switch-job-from-tree", { id: memberId, jobId });
  });

  ui.openModal({
    title: `Job Tree: ${member.name || memberId}`,
    content: body,
    width: "780px"
  });
}

// ── rank-up-apply (Adventurer Guild rank-up trial modal) ───────────

interface MemberWithAdventurer extends Member {
  rosterRole?: string;
  adventurer?: { rank?: string; rankPoints?: number; trialPending?: boolean };
  rank?: string;
}

interface FormulasModuleRank {
  rankIndex?: (rank: string) => number;
  rankUpGates?: (
    member: MemberWithAdventurer,
    next: string | null,
    state: Record<string, unknown>
  ) => { ok?: boolean; target?: string; reasons?: string[] } | null;
}

interface WorldDef {
  displayName?: string;
  ceiling?: string;
}

// Mirrors `_rankUpApplyModal`. Lists every active party member with
// RP progress + gate status, with a "Start Trial → X" button when
// they're eligible (gates passed, not above the world's ceiling).
// The button applies start_rank_trial + rank_up_member with the
// `guild_apply` source. The modal's local click delegate (preserved
// from the closure) routes button clicks before closing the overlay.
export function rankUpApplyModal(): void {
  const ui = mod<UiPlain & { closeModal: (overlay: unknown) => void }>("UI");
  if (!ui?.openModal) return;
  const state = (cs().getState() as Record<string, unknown>) || {};
  const F = mod<FormulasModuleRank>("Formulas");
  const world = (ds()?.get("worlds", (state as { currentWorld?: string }).currentWorld || "") as WorldDef | undefined) || {};
  const rankInfo = partyTab()?.memberRankInfo;

  const body = document.createElement("div");
  body.innerHTML = `<div class="hint-box hint-info" style="margin-bottom:10px">
      <b>Adventurer Guild — ${esc(world.displayName || (state as { currentWorld?: string }).currentWorld || "")}</b><br>
      Ceiling here is <b>${esc(world.ceiling || "—")}</b>. Members past the ceiling must travel to a higher-ceiling world for further trials.
    </div>`;
  const list = document.createElement("div");
  list.style.display = "grid";
  list.style.gap = "8px";
  body.appendChild(list);

  const party = ((state as { party?: Record<string, MemberWithAdventurer> }).party) || {};
  for (const [id, member] of Object.entries(party)) {
    if ((member.rosterRole || "active") === "bench") continue;
    const info = rankInfo?.(member);
    if (!info) continue;
    const gates = F?.rankUpGates?.(member, null, state) || null;
    const blockedByCeiling = !!(
      world.ceiling &&
      gates?.target &&
      (F?.rankIndex?.(gates.target) ?? 0) > (F?.rankIndex?.(world.ceiling) ?? 0)
    );
    const row = document.createElement("div");
    row.style.padding = "10px";
    row.style.border = "1px solid rgba(255,255,255,0.1)";
    row.style.borderRadius = "8px";
    const reasons = blockedByCeiling
      ? [`Above ${world.ceiling} ceiling — travel to a higher-ceiling world.`]
      : gates?.reasons || [];
    row.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <b>${esc(member.name || id)}</b>
          <span class="campaign-muted">Rank ${esc(info.label)}${info.atMax ? "" : ` · target ${esc(info.next || "—")}`}</span>
        </div>
        ${info.atMax
          ? '<div class="campaign-muted">At max rank.</div>'
          : `
          <div class="campaign-bar" style="margin-top:4px"><span class="mp" style="width:${info.pct}%"></span><b>RP ${info.rp}/${info.threshold}</b></div>
          ${reasons.length
            ? `<div class="campaign-muted" style="margin-top:6px;font-size:0.8rem">${reasons.map((r: string) => esc(r)).join(" ")}</div>`
            : '<div style="margin-top:6px;color:#9dd8ff;font-size:0.8rem">All gates met — ready for trial.</div>'}
        `}
      `;
    if (!info.atMax && gates?.ok && !blockedByCeiling && gates?.target) {
      const btn = document.createElement("button");
      btn.className = "campaign-action primary";
      btn.style.marginTop = "8px";
      btn.textContent = `Start Trial → ${gates.target}`;
      btn.dataset.startTrialFor = id;
      btn.dataset.startTrialRank = gates.target;
      row.appendChild(btn);
    }
    list.appendChild(row);
  }
  if (!list.children.length) {
    const empty = document.createElement("div");
    empty.className = "campaign-empty";
    empty.textContent = "No active party members.";
    body.appendChild(empty);
  }

  const footer = document.createElement("div");
  const doneBtn = document.createElement("button");
  doneBtn.className = "btn btn-primary";
  doneBtn.textContent = "Done";
  footer.appendChild(doneBtn);
  const overlay = ui.openModal({ title: "Apply for Rank-Up", content: body, footer, width: "520px" });
  doneBtn.onclick = () => ui.closeModal(overlay);
  body.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const btn = target?.closest("[data-start-trial-for]") as HTMLElement | null;
    if (!btn) return;
    const memberId = btn.dataset.startTrialFor || "";
    const toRank = btn.dataset.startTrialRank || "";
    applyOpList([
      { op: "start_rank_trial", target: memberId },
      { op: "rank_up_member", target: memberId, toRank, source: "guild_apply" }
    ]);
    ui.closeModal(overlay);
  });
}

// ── party-sheet (portrait hero + roster card, React-mounted) ──────

interface PartySheetUi {
  openModal: (opts: {
    title: string;
    content: HTMLElement;
    footer?: HTMLElement;
    width?: string;
    onClose?: () => void;
  }) => unknown;
  closeModal: (overlay: unknown) => void;
}

// Mirrors `_partySheetModal`. The body is the shared `<PartySheet>` JSX
// (portrait hero + full member card incl. the detail row) mounted via
// createRoot — the same pattern the editor pickers use. Every action
// button inside dispatches via onClick (dispatchCampaignAction), so the
// modal needs no click delegate; React unmounts on close. React + the
// roster components are lazy-imported so they stay out of the boot chunk.
export function partySheetModal(memberId: string): void {
  if (!memberId) return;
  const member = (cs().getState() as { party?: Record<string, Member & Record<string, unknown>> } | null)?.party?.[memberId];
  if (!member) return;
  const data = getPartySheetData(memberId, member as never);
  if (!data) return;
  void Promise.all([
    import("react"),
    import("react-dom/client"),
    import("../tabs/RosterMember")
  ]).then(([React, { createRoot }, { PartySheet }]) => {
    const u = mod<PartySheetUi>("UI");
    if (!u) return;
    const mount = document.createElement("div");
    const root = createRoot(mount);
    root.render(React.createElement(PartySheet, data));
    const footer = document.createElement("div");
    const btn = document.createElement("button");
    btn.className = "btn btn-primary";
    btn.textContent = "Close";
    footer.appendChild(btn);
    const overlay = u.openModal({
      title: `${member.name || memberId} Sheet`,
      content: mount,
      footer,
      width: "820px",
      onClose: () => {
        try {
          root.unmount();
        } catch {
          /* ignore */
        }
      }
    });
    btn.onclick = () => u.closeModal(overlay);
  });
}
