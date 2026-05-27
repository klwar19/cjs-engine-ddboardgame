// roster.ts — Phase H.3 roster action handlers (pure CampaignOps calls).
//
// These back the roster detail-row cards (skills / passives / equipment),
// which stay a bridged HTML island (the K.3 leftover) whose buttons emit
// `data-campaign-action` and route here through the shell `<main>`
// forwarder / the party-sheet modal delegate. Each handler is a thin,
// typed wrapper over the same `Ops().apply` the deleted switch cases ran,
// with the identical op name + `{ source: "ui" }`.
//
// (bench-character / activate-character stay in actions.ts as
// benchCharacter / activateCharacter — the bridge test pins them there.)

import { applyOp } from "./context";

export function unlearnSkill(target: string, skillId: string): void {
  applyOp({ op: "unlearn_skill", target, skillId });
}

export function unlearnPassive(target: string, passiveId: string): void {
  applyOp({ op: "unlearn_passive", target, passiveId });
}

export function unequipItem(target: string, slot: string): void {
  applyOp({ op: "unequip_item", target, slot });
}

export function equipSkill(target: string, skillId: string): void {
  applyOp({ op: "equip_skill", target, skillId });
}

export function unequipSkill(target: string, skillId: string): void {
  applyOp({ op: "unequip_skill", target, skillId });
}

export function equipPassive(target: string, passiveId: string): void {
  applyOp({ op: "equip_passive", target, passiveId });
}

export function unequipPassive(target: string, passiveId: string): void {
  applyOp({ op: "unequip_passive", target, passiveId });
}

export function clearPartyAvailability(target: string): void {
  applyOp({ op: "clear_party_availability", target });
}
