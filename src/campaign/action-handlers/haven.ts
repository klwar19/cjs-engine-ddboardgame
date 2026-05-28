// haven.ts — Phase H.3 Pocket Haven facility / activity actions.
//
// build/upgrade/ranch-collect delegate to CampaignOps with the
// `pocket_haven_ui` source. train-skill / ranch-assign open nested
// op-picker modals then commit a train_skill / ranch_assign op. open-trivia
// launches the standalone GuildTrivia module. Op names, payload keys,
// modal titles, toast strings and the `pocket_haven_ui` source mirror the
// deleted closures. (haven-open-cooking → cooking.ts; haven-play-minigame
// stays in the switch until the mini-game session machinery ports.)

import { applyOp, cs, ds, mod, rerender, toast } from "./context";
import { modals, PickerOption } from "./modals";

interface FacilitiesModule {
  getFacilityDef?: (id: string) => { name?: string } | null | undefined;
}

interface Member {
  name?: string;
  rosterRole?: string;
  learnedSkills?: string[];
  baseCharacterId?: string;
  skillProgress?: Record<string, { ap?: number; level?: number }>;
}
interface CharacterDef {
  skills?: Array<string | { skillId?: string }>;
}
interface MonsterDef {
  id?: string;
  name?: string;
  icon?: string;
  tameable?: boolean;
  tags?: string[];
  ranchOutputs?: unknown;
}

interface GuildTriviaModule {
  run?: (cfg: { world?: string; questionCount?: number }) => Promise<{ ok?: boolean; correct?: number; total?: number; jp?: number } | undefined>;
}

export function buildFacility(facilityId: string): void {
  if (!facilityId) return;
  const def = mod<FacilitiesModule>("PocketHavenFacilities")?.getFacilityDef?.(facilityId);
  if (!def) {
    toast("Unknown facility", "error");
    return;
  }
  applyOp({ op: "build_facility", facilityId }, "pocket_haven_ui");
  toast(`Built ${def.name}`, "success");
}

export function upgradeFacility(facilityId: string): void {
  if (!facilityId) return;
  applyOp({ op: "upgrade_facility", facilityId }, "pocket_haven_ui");
}

export function ranchCollect(facilityId: string): void {
  applyOp({ op: "ranch_collect", facilityId }, "pocket_haven_ui");
}

export function havenTrainSkill(facilityId: string): void {
  const party = (cs().getState()?.party ?? {}) as Record<string, Member>;
  // Build a list of [member, skill] candidates from the active party.
  const memberOptions = Object.entries(party)
    .filter(([, m]) => (m.rosterRole || "active") !== "bench")
    .map(([id, m]) => ({ id, name: m.name || id, member: m }));
  if (!memberOptions.length) {
    toast("No active party members", "info");
    return;
  }
  // First pick a member, then pick a skill, then commit.
  modals()?.opPickerModal({
    title: "Pick member to train",
    options: memberOptions.map((m) => ({ value: m.id, label: `${m.name}` })),
    primaryLabel: "Next",
    onSubmit: ({ value: memberId }) => {
      const member = memberOptions.find((m) => m.id === memberId)?.member;
      if (!member) return;
      const charSkills = ((ds()?.get("characters", member.baseCharacterId || memberId) as CharacterDef | undefined)?.skills || [])
        .map((s) => (typeof s === "string" ? s : s.skillId))
        .filter((s): s is string => Boolean(s));
      const skillIds = Array.from(new Set([...(member.learnedSkills || []), ...charSkills]));
      if (!skillIds.length) {
        toast(`${member.name || memberId} has no trainable skills`, "info");
        return;
      }
      const skillOpts: PickerOption[] = skillIds.map((sid) => {
        const def = ds()?.get("skills", sid) as { name?: string } | undefined;
        const prog = member.skillProgress?.[sid] || { ap: 0, level: 1 };
        return { value: sid, label: `${def?.name || sid} (L${prog.level || 1} · ${prog.ap || 0} AP)` };
      });
      modals()?.opPickerModal({
        title: "Pick skill to train",
        options: skillOpts,
        primaryLabel: "Train",
        onSubmit: ({ value: skillId }) => {
          applyOp({ op: "train_skill", facilityId, memberId, skillId }, "pocket_haven_ui");
        }
      });
    }
  });
}

export function havenRanchAssign(facilityId: string): void {
  const all = (ds()?.getAllAsArray("monsters") ?? []) as MonsterDef[];
  // List known monsters whose data declares ranchOutputs OR tag them as
  // "tameable", plus a fallback that includes all monster ids.
  const tameable = all
    .filter((m) => m?.tameable || (m?.tags || []).includes("tameable") || m?.ranchOutputs)
    .slice(0, 50);
  const pool = tameable.length ? tameable : all.slice(0, 30);
  const options: PickerOption[] = pool.map((m) => ({ value: m.id || "", label: `${m.icon || "🐾"} ${m.name || m.id}` }));
  if (!options.length) {
    toast("No tameable beasts in this world", "info");
    return;
  }
  modals()?.opPickerModal({
    title: "Assign beast to ranch",
    options,
    primaryLabel: "Assign",
    onSubmit: ({ value: beastId }) => {
      applyOp({ op: "ranch_assign", facilityId, beastId }, "pocket_haven_ui");
    }
  });
}

export async function openGuildTrivia(worldHint: string): Promise<void> {
  const trivia = mod<GuildTriviaModule>("GuildTrivia");
  if (!trivia?.run) {
    toast("Trivia module not loaded", "error");
    return;
  }
  const state = cs().getState();
  const result = await trivia.run({
    world: worldHint || (state?.currentWorld as string | undefined),
    questionCount: 5
  });
  rerender();
  if (result?.ok) {
    toast(`Trivia: ${result.correct}/${result.total} correct · +${result.jp} JP`, "success");
  }
}
