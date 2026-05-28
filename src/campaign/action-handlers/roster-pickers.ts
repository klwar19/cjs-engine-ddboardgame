// roster-pickers.ts — Phase H.3 small roster confirm / number / picker
// handlers.
//
// remove-character / level-up-skill / rank-up-passive /
// unlock-job-from-tree / switch-job-from-tree / grant-skill-ap /
// pick-equip-skill / pick-equip-passive are the cleanly-separable roster
// actions: each is a confirm dialog, a number modal, or a thin delegation
// to a PartyTab primitive. Op names, payload keys, modal copy and the
// `ui` source mirror the deleted closures.
//
// The bigger roster modals (party-sheet, recruit-character, change-job,
// show-job-tree, change-persona, equip-item, learn-skill / learn-passive,
// stat-boost, show-skill-detail, rank-up-apply, party-availability,
// gm-override, gm-member-override) stay in the switch — they own large
// option/render helpers (`_skillOptions` / `_passiveOptions` /
// `_memberSkillEntries` / `_memberPassives` / `_renderJobChip`, etc.) that
// the render/data side of the roster still consumes.

import { applyOp, confirmDialog, cs, ds, mod, ops, toast } from "./context";
import { modals, widgets } from "./modals";

interface Member {
  name?: string;
  unlockedJobs?: string[];
  maxJobs?: number;
  skillProgress?: Record<string, { ap?: number; level?: number }>;
  availability?: { status?: string; reason?: string; expires?: string | null };
}

interface FormulasModule {
  getSkillMaxLevel?: (skill: unknown) => number;
  calcSkillApToNextLevel?: (skill: unknown, ap: number, level: number) => number | null;
}

interface PartyTabModule {
  passiveRankInfo?: (memberId: string, passiveId: string, passive?: unknown) => { rank: number; isMax: boolean };
  passiveRankCostText?: (passive: unknown, currentRank: number) => string | undefined;
  openSkillPoolPicker?: (memberId: string) => unknown;
  openPassivePoolPicker?: (memberId: string) => unknown;
}

function member(id: string): Member | undefined {
  return (cs().getState()?.party as Record<string, Member> | undefined)?.[id];
}
function formulas(): FormulasModule | undefined {
  return mod<FormulasModule>("Formulas");
}
function partyTab(): PartyTabModule | undefined {
  return mod<{ PartyTab?: PartyTabModule }>("CampaignUIInternal")?.PartyTab;
}

export function removeCharacter(id: string): void {
  const m = member(id);
  if (!m) return;
  confirmDialog(`Remove ${m.name || id} from this campaign roster?`, () => {
    applyOp({ op: "remove_character", target: id });
  });
}

export function levelUpSkillConfirm(memberId: string, skillId: string): void {
  const m = member(memberId);
  const skill = ds()?.get("skills", skillId) as { name?: string } | undefined;
  if (!m || !skill) return;
  const prog = m.skillProgress?.[skillId] || { ap: 0, level: 1 };
  const cap = formulas()?.getSkillMaxLevel?.(skill) ?? 5;
  const target = Math.min(cap, Number(prog.level || 1) + 1);
  if (target <= Number(prog.level || 1)) {
    toast("Skill is already at max level.", "info");
    return;
  }
  confirmDialog(`Force ${skill.name || skillId} to Lv ${target}? (Edit-mode only.)`, () => {
    applyOp({ op: "set_skill_level", target: memberId, skillId, level: target });
  });
}

export function rankUpPassiveConfirm(memberId: string, passiveId: string): void {
  const m = member(memberId);
  const passive = ds()?.get("passives", passiveId) as { name?: string } | undefined;
  if (!m || !passive) return;
  const info = partyTab()?.passiveRankInfo?.(memberId, passiveId, passive);
  if (!info) return;
  if (info.isMax) {
    toast("Passive is already at max rank.", "info");
    return;
  }
  const costText = partyTab()?.passiveRankCostText?.(passive, info.rank) || "rank material";
  confirmDialog(
    `Rank up ${passive.name || passiveId} to Rank ${info.rank + 1}? Consumes ${costText}.`,
    () => {
      applyOp({ op: "rank_up_passive", target: memberId, passiveId });
    }
  );
}

export function confirmUnlockJob(memberId: string, jobId: string): void {
  const m = member(memberId);
  const job = ds()?.get("jobs", jobId) as { name?: string } | undefined;
  if (!m || !job) return;
  const slots = (m.unlockedJobs || []).length;
  confirmDialog(
    `Unlock ${job.name || jobId} for ${m.name || memberId}? (${slots + 1}/${m.maxJobs || 3} slots will be used.)`,
    () => {
      ops().apply([
        { op: "unlock_job", target: memberId, jobId },
        { op: "set_job", target: memberId, jobId }
      ], { source: "ui" });
    }
  );
}

export function switchJob(memberId: string, jobId: string): void {
  const job = ds()?.get("jobs", jobId);
  if (!job) return;
  applyOp({ op: "set_job", target: memberId, jobId });
}

export function grantSkillApModal(memberId: string, skillId: string): void {
  const m = member(memberId);
  const skill = ds()?.get("skills", skillId) as { name?: string } | undefined;
  if (!m || !skill) return;
  const prog = m.skillProgress?.[skillId] || { ap: 0, level: 1 };
  const apToNext = formulas()?.calcSkillApToNextLevel?.(skill, Number(prog.ap || 0), Number(prog.level || 1));
  modals()?.numberModal({
    title: `Grant ${skill.name || skillId} AbP: ${m.name || memberId}`,
    label: `Current AbP: ${prog.ap}, Lv ${prog.level} (${apToNext != null ? `${apToNext} to next` : "max"})`,
    value: Math.max(1, apToNext || 5),
    min: 1,
    max: 9999,
    primaryLabel: "Grant",
    onSubmit: (amount) => {
      if (amount > 0) applyOp({ op: "gain_skill_ap", target: memberId, skillId, amount });
    }
  });
}

export function openSkillPoolPicker(memberId: string): void {
  partyTab()?.openSkillPoolPicker?.(memberId);
}

export function openPassivePoolPicker(memberId: string): void {
  partyTab()?.openPassivePoolPicker?.(memberId);
}

export function partyAvailabilityModal(id: string): void {
  const m = member(id);
  if (!m) return;
  const ui = widgets();
  const mods = modals();
  if (!ui || !mods) return;
  const body = document.createElement("div");
  body.appendChild(mods.formLabel("Status"));
  const status = ui.createSelect({
    options: [
      { value: "available", label: "Available" },
      { value: "unavailable", label: "Unavailable" },
      { value: "busy", label: "Busy" },
      { value: "injured", label: "Injured" },
      { value: "story_locked", label: "Story Locked" }
    ],
    value: m.availability?.status || "available"
  });
  body.appendChild(status);
  body.appendChild(mods.formLabel("Reason"));
  const reason = document.createElement("input");
  reason.type = "text";
  reason.style.width = "100%";
  reason.placeholder = "guarding the sled, recovering, story split...";
  reason.value = m.availability?.reason || "";
  body.appendChild(reason);
  body.appendChild(mods.formLabel("Expires"));
  const expires = ui.createSelect({
    options: [
      { value: "", label: "Manual" },
      { value: "scenario", label: "Scenario" },
      { value: "phase", label: "Phase" },
      { value: "battle", label: "Battle" }
    ],
    value: m.availability?.expires || ""
  });
  body.appendChild(expires);
  mods.formModal({
    title: `Availability: ${m.name || id}`,
    body,
    primaryLabel: "Save",
    onSubmit: () => {
      if (status.value === "available") {
        applyOp({ op: "clear_party_availability", target: id });
      } else {
        applyOp({
          op: "set_party_availability",
          target: id,
          status: status.value,
          reason: reason.value.trim(),
          expires: expires.value || null,
          source: "manual"
        });
      }
    }
  });
}
