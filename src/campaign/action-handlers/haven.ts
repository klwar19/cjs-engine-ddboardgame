// haven.ts — Phase H.3 Pocket Haven facility ops (the CampaignOps-only
// ones). build/upgrade/ranch-collect delegate to CampaignOps with the
// `pocket_haven_ui` source, matching the deleted closures. The
// train-skill / ranch-assign / trivia / cooking / minigame haven actions
// stay in the switch — they open modals or launch mini-games.

import { applyOp, mod, toast } from "./context";

interface FacilitiesModule {
  getFacilityDef?: (id: string) => { name?: string } | null | undefined;
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
