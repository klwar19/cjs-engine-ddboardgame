// relationships.ts — typed data builder + shared ACTIVITIES table for the
// Relationships tab JSX port. Faithful port of the render-time logic in the
// vanilla `js/ui/relationships-tab.js` island (simple social stats, activity
// buttons, character-event unlock state, acts banner). Pure derivation from the
// CampaignState snapshot + the engine modules on `window.CJS`
// (RelationshipTiers / DataStore / CampaignConditions / CampaignSequences).
//
// `ACTIVITIES` is also imported by `action-handlers/downtime.ts` (the
// rel-activity toast fallback), replacing its old `window.CJS.RelationshipsTab`
// read so the vanilla module can be deleted.

import type { CampaignStateSnapshot } from "../../store";

export interface RelActivityDef {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly hint: string;
  readonly bondField: string;
  readonly requiresRomance?: boolean;
}

export const ACTIVITIES: readonly RelActivityDef[] = [
  { id: "hang_out", label: "Trust", icon: "T", hint: "+1 trust", bondField: "trust" },
  { id: "train", label: "Respect", icon: "R", hint: "+1 respect", bondField: "respect" },
  { id: "romance", label: "Romance", icon: "H", hint: "+1 romance", bondField: "romance", requiresRomance: true }
];

const LEGACY_RESPECT_FIELDS = ["friendship", "empathy", "confidence", "morale", "value"];

// ── Engine surfaces (window.CJS) ─────────────────────────────────────
interface TierInfo {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly score?: number;
}
interface RelationshipTiersModule {
  readonly computeTier?: (bondEntry: unknown) => TierInfo;
  readonly getKnownCharacters?: (state: unknown) => string[];
  readonly getKnownNpcs?: (state: unknown) => string[];
}
interface CharacterRecord {
  id?: string;
  name?: string;
  portrait?: string;
  icon?: string;
  tags?: unknown[];
  romanceEligible?: boolean;
  relationship?: { romanceEligible?: boolean };
}
interface DataStoreSurface {
  readonly get?: (bucket: string, id: string) => CharacterRecord | null | undefined;
}
interface ConditionsModule {
  readonly evaluate?: (
    conditions: unknown,
    state: unknown,
    ctx: { characterId?: string; tags?: unknown[] }
  ) => { ok?: boolean; blockers?: string[] } | undefined;
}
interface SequenceEntry {
  id?: string;
  title?: string;
  summary?: { short?: string; default?: string };
  tags?: unknown[];
  file?: string;
  deliveryStatus?: string;
  deliveryNote?: string;
  conditions?: unknown;
  relationship?: {
    characterId?: string;
    field?: string;
    threshold?: number;
    min?: number;
    summary?: string;
    bonus?: string;
    conditions?: unknown;
  };
}
interface SequencesModule {
  readonly list?: (kind: string, world?: string) => SequenceEntry[];
}
interface RelCjs {
  readonly RelationshipTiers?: RelationshipTiersModule;
  readonly DataStore?: DataStoreSurface;
  readonly CampaignConditions?: ConditionsModule;
  readonly CampaignSequences?: SequencesModule;
}
function cjs(): RelCjs {
  return (window as unknown as { CJS?: RelCjs }).CJS ?? {};
}

type BondEntry = Record<string, unknown> | undefined;

// ── Pure helpers (ported 1:1) ────────────────────────────────────────
function isRomanceEligible(base: CharacterRecord = {}): boolean {
  const tags = (base.tags || []).map((tag) => String(tag || "").toLowerCase());
  return !!(
    base.romanceEligible ||
    base.relationship?.romanceEligible ||
    tags.includes("romanceable") ||
    tags.includes("romance")
  );
}

export interface RelStat {
  readonly id: string;
  readonly label: string;
  readonly value: number;
}

function simpleStats(bondEntry: BondEntry = {}, base: CharacterRecord = {}): RelStat[] {
  const entry = bondEntry || {};
  const trust = Number(entry.trust || 0);
  const respect =
    Number(entry.respect || 0) +
    LEGACY_RESPECT_FIELDS.reduce((sum, field) => sum + Number(entry[field] || 0), 0);
  const romance = Number(entry.romance || 0);
  const out: RelStat[] = [
    { id: "trust", label: "Trust", value: trust },
    { id: "respect", label: "Respect", value: respect }
  ];
  if (isRomanceEligible(base) || romance > 0) {
    out.push({ id: "romance", label: "Romance", value: romance });
  }
  return out;
}

function simpleValue(bondEntry: BondEntry, field: string, base: CharacterRecord): number {
  const stats = simpleStats(bondEntry || {}, base || {});
  const found = stats.find((entry) => entry.id === field)?.value;
  return Number(found || (bondEntry as Record<string, unknown>)?.[field] || 0);
}

function sequenceCompleted(state: RelStateLike, sequenceId: string | undefined): boolean {
  const history = state?.sequenceRuntime?.history || [];
  const eventLog = state?.eventLog?.entries || [];
  return (
    history.some((entry) => entry.sequenceId === sequenceId) ||
    eventLog.some((entry) => entry.relatedId === sequenceId)
  );
}

export interface RelEvent {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly field: string;
  readonly threshold: number;
  readonly value: number;
  readonly bonus: string;
  readonly completed: boolean;
  readonly unlocked: boolean;
  readonly blocked: boolean;
  readonly blockers: string[];
  readonly statusText: string;
}

function eventStatusText(event: Omit<RelEvent, "statusText">): string {
  if (event.completed) return event.bonus ? `Done. Bonus: ${event.bonus}` : "Done.";
  if (event.unlocked) return event.bonus ? `Ready. Bonus: ${event.bonus}` : "Ready.";
  if (event.value < event.threshold) {
    return `Needs ${event.field} ${event.threshold} (${event.value}/${event.threshold}).`;
  }
  return (event.blockers || []).join(" ") || "Locked.";
}

function eventViewModel(
  entry: SequenceEntry,
  state: RelStateLike,
  bondEntry: BondEntry,
  base: CharacterRecord
): RelEvent {
  const rel = entry.relationship || {};
  const field = rel.field || "trust";
  const threshold = Number(rel.threshold ?? rel.min ?? 1);
  const value = simpleValue(bondEntry, field, base);
  const conditions = rel.conditions || entry.conditions || null;
  const result = conditions
    ? cjs().CampaignConditions?.evaluate?.(conditions, state, { characterId: base.id, tags: entry.tags || [] })
    : { ok: true, blockers: [] };
  const completed = sequenceCompleted(state, entry.id);
  const deliveryBlocked = !!entry.deliveryStatus && entry.deliveryStatus !== "ready";
  const unlocked =
    !completed && !deliveryBlocked && !!entry.file && value >= threshold && result?.ok !== false;
  const partial: Omit<RelEvent, "statusText"> = {
    id: entry.id || "",
    title: entry.title || entry.id || "",
    summary: rel.summary || entry.summary?.short || entry.summary?.default || "",
    field,
    threshold,
    value,
    bonus: rel.bonus || "",
    completed,
    unlocked,
    blocked: deliveryBlocked || value < threshold || result?.ok === false,
    blockers: deliveryBlocked ? [entry.deliveryNote || "Coming soon."] : result?.blockers || []
  };
  return { ...partial, statusText: eventStatusText(partial) };
}

function relationshipEventsFor(
  charId: string,
  state: RelStateLike,
  bondEntry: BondEntry,
  base: CharacterRecord
): RelEvent[] {
  const entries = cjs().CampaignSequences?.list?.("event", state?.currentWorld) || [];
  const name = String(base?.name || charId || "").toLowerCase();
  const idNeedles = new Set(
    [charId, base?.id, name].filter(Boolean).map((value) => String(value).toLowerCase())
  );
  return entries
    .filter((entry) => {
      const rel = entry.relationship || {};
      const tags = (entry.tags || []).map((tag) => String(tag || "").toLowerCase());
      if (rel.characterId && String(rel.characterId).toLowerCase() === String(charId).toLowerCase()) {
        return true;
      }
      if (tags.includes("character_event") && Array.from(idNeedles).some((needle) => tags.includes(needle))) {
        return true;
      }
      return Array.from(idNeedles).some((needle) => String(entry.id || "").toLowerCase().includes(needle));
    })
    .map((entry) => eventViewModel(entry, state, bondEntry, base))
    .sort(
      (a, b) =>
        Number(b.completed) - Number(a.completed) ||
        Number(b.unlocked) - Number(a.unlocked) ||
        a.threshold - b.threshold
    );
}

function activityLabel(id: string | undefined): string {
  const found = ACTIVITIES.find((a) => a.id === id);
  if (found) return found.label;
  if (id === "listen") return "Trust";
  if (id === "help_task") return "Respect";
  return id || "Activity";
}

// ── View models ──────────────────────────────────────────────────────
export interface RelActivityButton {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly hint: string;
  readonly title: string;
  readonly blocked: boolean;
}

export interface RelPortrait {
  readonly src: string | null;
  readonly alt: string;
  readonly fallbackText: string;
}

export interface RelStoredField {
  readonly key: string;
  readonly value: string;
}

export interface RelCard {
  readonly charId: string;
  readonly name: string;
  readonly tierId: string;
  readonly tierLabel: string;
  readonly tierIcon: string;
  readonly score: number;
  readonly scorePct: number;
  readonly portrait: RelPortrait;
  readonly stats: readonly RelStat[];
  readonly hasStatValues: boolean;
  readonly activities: readonly RelActivityButton[];
  readonly actsRemaining: number;
  readonly events: readonly RelEvent[];
  readonly storedFields: readonly RelStoredField[] | null;
}

export interface RelActSummary {
  readonly remaining: number;
  readonly max: number;
  readonly recent: ReadonlyArray<{ readonly label: string; readonly name: string; readonly amount: number | string; readonly field: string }>;
}

export interface RelationshipsData {
  readonly hasState: boolean;
  readonly knownCount: number;
  readonly acts: RelActSummary;
  readonly cards: readonly RelCard[];
}

interface RelStateLike {
  bonds?: Record<string, BondEntry>;
  relationshipActs?: { remaining?: number; max?: number; history?: Array<{ characterId?: string; activityId?: string; amount?: number | string; field?: string }> };
  currentWorld?: string;
  sequenceRuntime?: { history?: Array<{ sequenceId?: string }> };
  eventLog?: { entries?: Array<{ relatedId?: string }> };
}

function buildPortrait(charId: string, base: CharacterRecord): RelPortrait {
  const portrait = base?.portrait || "";
  const icon = base?.icon || (base?.name || charId || "?").slice(0, 1).toUpperCase();
  return {
    src: portrait || null,
    alt: base?.name || charId,
    fallbackText: icon
  };
}

function buildActivityButtons(charId: string, actsRemaining: number, base: CharacterRecord): RelActivityButton[] {
  const noActs = actsRemaining <= 0;
  const romanceEligible = isRomanceEligible(base);
  return ACTIVITIES.map((a) => {
    const blocked = noActs || (!!a.requiresRomance && !romanceEligible);
    const title =
      a.requiresRomance && !romanceEligible
        ? "Romance is not available for this character"
        : `${a.hint} with this character`;
    return { id: a.id, label: a.label, icon: a.icon, hint: a.hint, title, blocked };
  });
}

// null (no bond entry) → render nothing; [] → "No stored values yet."; else list.
function buildStoredFields(bondEntry: BondEntry): RelStoredField[] | null {
  if (!bondEntry) return null;
  return Object.entries(bondEntry)
    .filter(([k]) => !k.startsWith("_"))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, value: String(value ?? "") }));
}

function buildCard(charId: string, bondEntry: BondEntry, actsRemaining: number, state: RelStateLike): RelCard {
  const ds = cjs().DataStore;
  const base: CharacterRecord = ds?.get?.("characters", charId) || { id: charId };
  base.id = base.id || charId;
  const tiers = cjs().RelationshipTiers;
  const tier: TierInfo = tiers?.computeTier
    ? tiers.computeTier(bondEntry)
    : { id: "stranger", label: "Stranger", icon: "", score: 0 };
  const name = base.name || charId;
  const score = Number(tier.score) || 0;
  const scorePct = Math.max(0, Math.min(100, score));
  const stats = simpleStats(bondEntry, base);
  return {
    charId,
    name,
    tierId: tier.id,
    tierLabel: tier.label,
    tierIcon: tier.icon || "",
    score,
    scorePct,
    portrait: buildPortrait(charId, base),
    stats,
    hasStatValues: stats.some((entry) => !!entry.value),
    activities: buildActivityButtons(charId, actsRemaining, base),
    actsRemaining,
    events: relationshipEventsFor(charId, state, bondEntry || {}, base),
    storedFields: buildStoredFields(bondEntry)
  };
}

function buildActSummary(state: RelStateLike): RelActSummary {
  const ds = cjs().DataStore;
  const acts = state.relationshipActs || { remaining: 0, max: 3, history: [] };
  const recent = (acts.history || []).slice(0, 3).map((entry) => ({
    label: activityLabel(entry.activityId),
    name: ds?.get?.("characters", entry.characterId || "")?.name || entry.characterId || "someone",
    amount: entry.amount ?? 0,
    field: entry.field || ""
  }));
  return { remaining: Number(acts.remaining || 0), max: Number(acts.max || 3), recent };
}

export function getRelationshipsData(state: CampaignStateSnapshot | null): RelationshipsData {
  if (!state) {
    return { hasState: false, knownCount: 0, acts: { remaining: 0, max: 3, recent: [] }, cards: [] };
  }
  const s = state as unknown as RelStateLike;
  const tiers = cjs().RelationshipTiers;
  const charIds = tiers
    ? tiers.getKnownCharacters
      ? tiers.getKnownCharacters(s)
      : tiers.getKnownNpcs?.(s) || []
    : Object.keys(s.bonds || {});
  const acts = s.relationshipActs || { remaining: 0, max: 3 };
  const actsRemaining = Number(acts.remaining || 0);
  const actSummary = buildActSummary(s);

  if (!charIds.length) {
    return { hasState: true, knownCount: 0, acts: actSummary, cards: [] };
  }

  const sorted = charIds.slice().sort((a, b) => {
    const ta = tiers?.computeTier ? tiers.computeTier(s.bonds?.[a]) : { id: "stranger", score: 0 };
    const tb = tiers?.computeTier ? tiers.computeTier(s.bonds?.[b]) : { id: "stranger", score: 0 };
    if (ta.id === "rival" && tb.id !== "rival") return -1;
    if (tb.id === "rival" && ta.id !== "rival") return 1;
    return (Number(tb.score) || 0) - (Number(ta.score) || 0);
  });

  return {
    hasState: true,
    knownCount: charIds.length,
    acts: actSummary,
    cards: sorted.map((id) => buildCard(id, s.bonds?.[id], actsRemaining, s))
  };
}
