// travel.ts — Phase H.3 travel-world-card action handler.
//
// `travelWorldCard(worldId, targetTab)` is the entry point: redirects
// to the world's default tab if already there, then runs the rank
// gate, then either opens the persona-picker modal (when more than
// one persona is meaningful) or completes travel directly.
//
// completeWorldTravel applies the world_transition op (+ any persona
// pre-ops + a default-location landing op) and routes the player to
// the destination's default tab. evaluateTravelRankGate enforces hard
// `requiredRank` and surfaces soft `recommendedRank` / `ceiling`
// warnings as a confirm prompt. defaultTravelLanding picks the world's
// authored default location when the save has none yet.
// hasMeaningfulPersonaChoice and openPreTravelPersonaPicker handle
// the per-member persona pick before travel — out-of-world personas
// keep their loadout but pay combat / social penalties.
//
// All copy, op payloads, mode/tab jumps, mutation sources and modal
// markup mirror the deleted closures.

import { cs, ds, mod, ops, rerender, setActiveModeRaw, setActiveTabRaw, toast } from "./context";
import { esc, modals, widgets, type UiWidgetsApi } from "./modals";
import { goto } from "./nav";

interface FormulasModule {
  rankIndex?: (rank: string) => number;
  meetsRank?: (rank: string, min: string) => boolean;
}

interface WorldDef {
  displayName?: string;
  requiredRank?: string;
  recommendedRank?: string;
  ceiling?: string;
  [key: string]: unknown;
}

interface TravelMap {
  id?: string;
  world?: string;
  defaultLocationId?: string;
  nodes?: Array<{ id?: string; name?: string; zone?: string; hubId?: string }>;
  zone?: string;
  hubId?: string;
}

interface PartyMember {
  name?: string;
  baseCharacterId?: string;
  rank?: string;
  activePersona?: string;
  rosterRole?: string;
  unlockedPersonas?: string[];
  adventurer?: { rank?: string };
  [key: string]: unknown;
}

interface Persona {
  id?: string;
  name?: string;
  icon?: string;
  world?: string;
  unlock?: { default?: boolean };
  [key: string]: unknown;
}

interface PersonaServiceModule {
  personasForCharacter?: (characterId: string) => Persona[];
  personasForCharacterInWorld?: (characterId: string, worldId: string) => Persona[];
}

interface SequencesModule {
  loadWorld?: (worldId: string) => Promise<unknown> | unknown;
}

interface WorldMenuDef {
  defaultTab?: string;
  defaultMode?: string;
  [key: string]: unknown;
}

interface CampaignUiBridge {
  getWorldMenuDef?: (worldId: string) => WorldMenuDef;
  modeForTab?: (tab: string) => string;
}

function formulas(): FormulasModule | undefined {
  return mod<FormulasModule>("Formulas");
}

function personas(): PersonaServiceModule | undefined {
  return mod<PersonaServiceModule>("PersonaService");
}

function sequences(): SequencesModule | undefined {
  return mod<SequencesModule>("CampaignSequences");
}

function worldMenuDef(worldId: string): WorldMenuDef {
  return mod<CampaignUiBridge>("CampaignUI")?.getWorldMenuDef?.(worldId) || {};
}

interface TravelRankDecision {
  allowed: boolean;
  message?: string;
  softWarning?: string | null;
}

// Mirrors `_evaluateTravelRankGate`. Returns { allowed: false, message }
// for hard gate, { allowed: true, softWarning } for soft. The party's
// "top rank" is the highest-rank ACTIVE member (bench excluded), same
// as the deleted closure.
export function evaluateTravelRankGate(toWorld: string): TravelRankDecision {
  const F = formulas();
  const dest = (ds()?.get("worlds", toWorld) as WorldDef | undefined) || {};
  const state = cs().getState() as { party?: Record<string, PartyMember> } | null;
  const active = Object.values(state?.party || {}).filter((m) => (m.rosterRole || "active") !== "bench");
  const topRank = active.reduce<string | null>((best, m) => {
    const r = m.adventurer?.rank || m.rank || "F";
    if (!best) return r;
    return (F?.rankIndex?.(r) ?? 0) > (F?.rankIndex?.(best) ?? 0) ? r : best;
  }, null);

  if (dest.requiredRank && !F?.meetsRank?.(topRank || "F", dest.requiredRank)) {
    return {
      allowed: false,
      message: `${dest.displayName || toWorld} requires rank ${dest.requiredRank}. Party top: ${topRank || "F"}.`
    };
  }
  const warnings: string[] = [];
  if (dest.recommendedRank && !F?.meetsRank?.(topRank || "F", dest.recommendedRank)) {
    warnings.push(
      `Underranked: ${dest.displayName || toWorld} recommends ${dest.recommendedRank} (party top: ${topRank || "F"}). Monsters will spawn tougher.`
    );
  }
  if (dest.ceiling && (F?.rankIndex?.(topRank || "F") ?? 0) > (F?.rankIndex?.(dest.ceiling) ?? 0)) {
    warnings.push(
      `This world caps ranks at ${dest.ceiling}. Higher-rank members are treated as ${dest.ceiling} here; RP rewards taper out.`
    );
  }
  return {
    allowed: true,
    softWarning: warnings.length ? warnings.join("\n\n") : null
  };
}

interface LandingOp {
  op: "travel_location";
  world: string;
  mapId?: string;
  locationId: string;
  title: string;
  zone?: string;
  hubId?: string;
  [key: string]: unknown;
}

// Mirrors `_defaultTravelLanding`. Returns null when the save already
// has a current location in the destination world (so we don't
// overwrite the player's progress).
export function defaultTravelLanding(worldId: string): LandingOp | null {
  const state = cs().getState() as { worldProgress?: Record<string, { currentLocation?: unknown; currentTravelMap?: unknown }> } | null;
  const existing = state?.worldProgress?.[worldId];
  if (existing?.currentLocation && existing?.currentTravelMap) return null;
  const maps = (ds()?.getAllAsArray("travelMaps") as TravelMap[] | undefined) || [];
  const map = maps.find((entry) => entry.world === worldId);
  if (!map?.defaultLocationId) return null;
  const node = (map.nodes || []).find((entry) => entry.id === map.defaultLocationId) || {};
  return {
    op: "travel_location",
    world: worldId,
    mapId: map.id,
    locationId: map.defaultLocationId,
    title: node.name || map.defaultLocationId,
    zone: node.zone || map.zone,
    hubId: node.hubId || map.hubId
  };
}

interface PreOp {
  op: string;
  [key: string]: unknown;
}

// Mirrors `_completeWorldTravel`. Applies the persona pre-ops + the
// world_transition + the landing op together (single ops.apply call),
// then awaits the world's loadWorld() promise before rendering /
// toasting / jumping to the destination tab.
export function completeWorldTravel(
  worldId: string,
  targetTab: string | null = null,
  preOps: PreOp[] = []
): void {
  const tab = targetTab || worldMenuDef(worldId).defaultTab || "storyHome";
  const opsList: PreOp[] = [
    ...preOps,
    { op: "world_transition", toWorld: worldId, carryoverProfile: "carryover_new_world_default" }
  ];
  const landing = defaultTravelLanding(worldId);
  if (landing) opsList.push(landing);
  ops().apply(opsList, { source: "world_gate" });
  const finish = (): void => {
    const bridge = mod<CampaignUiBridge>("CampaignUI");
    setActiveModeRaw(bridge?.modeForTab?.(tab) || "story");
    setActiveTabRaw(tab);
    const worldName = (ds()?.get("worlds", worldId) as WorldDef | undefined)?.displayName || worldId;
    toast(`Loaded ${worldName}.`, "success");
    rerender();
  };
  const load = sequences()?.loadWorld?.(worldId);
  if (load && typeof (load as { then?: unknown }).then === "function") {
    (load as Promise<unknown>).then(finish).catch((error: unknown) => {
      console.warn("World story load failed:", error);
      finish();
    });
  } else {
    finish();
  }
}

// Mirrors `_hasMeaningfulPersonaChoice`. "Meaningful" = the party has
// at least one member with ≥2 eligible personas for the world, or with
// exactly one eligible persona that isn't the currently active one.
export function hasMeaningfulPersonaChoice(targetWorld: string): boolean {
  const PS = personas();
  if (!PS?.personasForCharacterInWorld) return false;
  const state = cs().getState() as { party?: Record<string, PartyMember> } | null;
  if (!state?.party) return false;
  for (const [id, member] of Object.entries(state.party)) {
    const charId = member.baseCharacterId || id;
    const choices = PS.personasForCharacterInWorld(charId, targetWorld) || [];
    if (!choices.length) continue;
    const unlocked = new Set(member.unlockedPersonas || []);
    const eligible = choices.filter((p) => unlocked.has(p.id || "") || p.unlock?.default);
    if (eligible.length >= 2) return true;
    if (eligible.length === 1 && eligible[0]!.id !== member.activePersona) return true;
  }
  return false;
}

// Helper: build the per-member option list for the persona picker.
// Mirrors the closure's three-section layout (current keep + in-world
// + out-of-world divider + out-of-world).
interface PickerOption {
  value: string;
  label: string;
  disabled?: boolean;
}

function personaOptionsForMember(
  member: PartyMember,
  charId: string,
  targetWorld: string
): { options: PickerOption[]; value: string; eligibleWorld: Persona[] } {
  const PS = personas();
  const choices = PS?.personasForCharacterInWorld?.(charId, targetWorld) || [];
  const otherWorlds = (PS?.personasForCharacter?.(charId) || []).filter((p) => p.world !== targetWorld);
  const unlocked = new Set(member.unlockedPersonas || []);
  const eligibleWorld = choices.filter((p) => unlocked.has(p.id || "") || p.unlock?.default);
  const eligibleOther = otherWorlds.filter((p) => unlocked.has(p.id || ""));

  const options: PickerOption[] = [
    { value: "__keep__", label: "— Keep current persona (out-of-world penalty if any) —" },
    ...eligibleWorld.map((p) => ({
      value: p.id || "",
      label: `${p.icon || "🎭"} ${p.name || p.id} ${p.id === member.activePersona ? "(current)" : ""}`
    }))
  ];
  if (eligibleOther.length) {
    options.push({ value: "__hr__", label: "── Out-of-world (penalty applies) ──", disabled: true });
    for (const p of eligibleOther) {
      options.push({
        value: p.id || "",
        label: `${p.icon || "🎭"} ${p.name || p.id} — ${p.world} (penalty)`
      });
    }
  }
  const value =
    eligibleWorld.find((p) => p.id === member.activePersona)?.id || eligibleWorld[0]?.id || "__keep__";
  return { options, value, eligibleWorld };
}

// Mirrors `_openPreTravelPersonaPicker`. Builds a one-column grid of
// per-member <select>s. Submit applies `unlock_persona` + `set_persona`
// for every changed pick, then calls completeWorldTravel with the pre-ops.
export function openPreTravelPersonaPicker(targetWorld: string, targetTab: string | null = null): void {
  const ui = widgets();
  const m = modals();
  if (!ui || !m) return;
  const state = cs().getState() as { party?: Record<string, PartyMember> } | null;
  const worldName = (ds()?.get("worlds", targetWorld) as WorldDef | undefined)?.displayName || targetWorld;

  const body = document.createElement("div");
  body.innerHTML = `<div class="hint-box hint-info" style="margin-bottom:10px">
      Heading to <b>${esc(worldName)}</b>. Pick a persona for each member who has one — out-of-world personas keep their loadout but pay penalties in combat and with the locals. Unset members will auto-switch on arrival.
    </div>`;
  const choicesArea = document.createElement("div");
  choicesArea.style.display = "grid";
  choicesArea.style.gridTemplateColumns = "1fr";
  choicesArea.style.gap = "10px";
  body.appendChild(choicesArea);

  type SelectHandle = ReturnType<UiWidgetsApi["createSelect"]>;
  const memberChoices = new Map<string, SelectHandle>();
  for (const [id, member] of Object.entries(state?.party || {})) {
    const charId = member.baseCharacterId || id;
    const { options: opts, value } = personaOptionsForMember(member, charId, targetWorld);
    if (opts.length <= 1) continue;
    const sel = ui.createSelect({ options: opts, value });
    const card = document.createElement("div");
    card.style.padding = "10px";
    card.style.border = "1px solid rgba(255,255,255,0.1)";
    card.style.borderRadius = "8px";
    card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <b>${esc(member.name || id)}</b>
        <span class="campaign-muted" style="font-size:0.78rem">${esc(charId)}</span>
      </div>`;
    const labelEl = document.createElement("div");
    labelEl.innerHTML = '<div class="form-label" style="font-size:0.78rem">Persona for ' + esc(worldName) + "</div>";
    card.appendChild(labelEl);
    card.appendChild(sel);
    choicesArea.appendChild(card);
    memberChoices.set(id, sel);
  }

  if (!memberChoices.size) {
    completeWorldTravel(targetWorld, targetTab || worldMenuDef(targetWorld).defaultTab || null);
    return;
  }

  m.formModal({
    title: `Travel: → ${worldName}`,
    body,
    primaryLabel: "Travel",
    onSubmit: () => {
      const preOps: PreOp[] = [];
      for (const [id, sel] of memberChoices) {
        const value = sel.value;
        if (!value || value === "__keep__" || value === "__hr__") continue;
        preOps.push({ op: "unlock_persona", target: id, personaId: value });
        preOps.push({ op: "set_persona", target: id, personaId: value });
      }
      completeWorldTravel(targetWorld, targetTab || worldMenuDef(targetWorld).defaultTab || null, preOps);
    }
  });
}

// Mirrors `_travelWorldCard` (action: `travel-world-card`). If the
// player is already in the destination world, redirect to its default
// tab. Otherwise run the rank gate, then either open the persona
// picker (meaningful choice) or complete travel directly.
export function travelWorldCard(worldId: string, targetTab: string | null = null): void {
  if (!worldId) return;
  const state = cs().getState() as { currentWorld?: string } | null;
  if (worldId === state?.currentWorld) {
    const tab = targetTab || worldMenuDef(worldId).defaultTab || "worldGate";
    const bridge = mod<CampaignUiBridge>("CampaignUI");
    goto(bridge?.modeForTab?.(tab) || "story", tab);
    return;
  }
  const gate = evaluateTravelRankGate(worldId);
  if (!gate.allowed) {
    toast(gate.message || "Travel blocked", "warning");
    return;
  }
  const proceed = (): void => {
    const tab = targetTab || worldMenuDef(worldId).defaultTab || "storyHome";
    if (hasMeaningfulPersonaChoice(worldId)) {
      openPreTravelPersonaPicker(worldId, tab);
    } else {
      completeWorldTravel(worldId, tab);
    }
  };
  if (gate.softWarning) {
    const ok = window.confirm(gate.softWarning + "\n\nTravel anyway?");
    if (!ok) return;
  }
  proceed();
}
