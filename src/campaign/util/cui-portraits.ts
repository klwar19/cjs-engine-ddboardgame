// cui-portraits.ts — Phase H.4 TypeScript port of the Portraits helper.
//
// `js/campaign/ui/cui-portraits.js` exported a frozen `Portraits`
// namespace on `window.CJS.CampaignUIInternal.Portraits`. The TS port
// installs the same surface so the still-JS callers + the TS modules
// in `src/campaign/action-handlers/*.ts` see no observable change.
//
// Resolves a member's portrait through the priority chain (persona
// art → saved persona portrait → member portrait → base character)
// and the matching focus crop. The focus-style helper renders an
// inline CSS attribute for the chosen point.

import { esc } from "./cui-utils";

// ── Types ────────────────────────────────────────────────────────────
export type IconKind = "skill" | "passive" | "item" | "monster" | "character" | string;

export interface IconOptions {
  readonly kind?: IconKind;
  readonly size?: "sm" | "md" | "lg" | string;
}

export interface IconEntity {
  readonly icon?: string;
  readonly id?: string;
  readonly name?: string;
  readonly [key: string]: unknown;
}

export interface PortraitFocus {
  readonly x?: number;
  readonly y?: number;
  readonly zoom?: number;
}

export interface PartyMember {
  readonly activePersona?: string;
  readonly personaPortrait?: string;
  readonly personaPortraitFocus?: PortraitFocus | null;
  readonly portrait?: string;
  readonly portraitFocus?: PortraitFocus | null;
  readonly baseCharacterId?: string;
  readonly [key: string]: unknown;
}

interface PersonaRecord {
  readonly portrait?: string;
  readonly portraitFocus?: PortraitFocus | null;
}

interface BaseCharacterRecord {
  readonly portrait?: string;
  readonly portraitFocus?: PortraitFocus | null;
}

interface DataStoreSurface {
  readonly get?: (bucket: string, id: string) => unknown;
}
interface UiIconsSurface {
  readonly renderIcon: (entity: IconEntity | null | undefined, opts: IconOptions) => string;
}
interface PortraitPickerSurface {
  readonly focusStyle: (focus: PortraitFocus | null | undefined) => string;
}

interface CjsSurface {
  readonly DataStore?: DataStoreSurface;
  readonly UIIcons?: UiIconsSurface;
  readonly PortraitPicker?: PortraitPickerSurface;
}

function cjs(): CjsSurface {
  return (window as unknown as { CJS?: CjsSurface }).CJS ?? {};
}

// ── Icon rendering ───────────────────────────────────────────────────
export function icon(entity: IconEntity | null | undefined, opts: IconOptions = {}): string {
  const I = cjs().UIIcons;
  if (I) return I.renderIcon(entity, opts);
  const fallback = entity?.icon || (opts.kind === "passive" ? "🛡️" : "⚔️");
  return `<span class="cjs-icon cjs-icon-${opts.size || "md"}">${esc(fallback)}</span>`;
}

// ── Portrait resolution ──────────────────────────────────────────────
// Persona portrait wins so the world-skin's art shows in the roster
// card. Fallback chain: persona-saved portrait → member portrait →
// base character art.
export function memberPortrait(member: PartyMember | null | undefined, memberId?: string): string {
  if (!member) return "";
  const DS = cjs().DataStore;
  if (member.activePersona) {
    const persona = DS?.get?.("personas", member.activePersona) as PersonaRecord | undefined;
    if (persona?.portrait) return persona.portrait;
  }
  if (member.personaPortrait) return member.personaPortrait;
  if (member.portrait) return member.portrait;
  const baseId = member.baseCharacterId || memberId;
  if (!baseId) return "";
  const base = DS?.get?.("characters", baseId) as BaseCharacterRecord | undefined;
  return base?.portrait || "";
}

// Resolve the focus crop that matches `memberPortrait` above. Whichever
// source we end up using for the path, the focus comes from the same
// source so the crop tracks the picture.
export function memberPortraitFocus(
  member: PartyMember | null | undefined,
  memberId?: string
): PortraitFocus | null {
  if (!member) return null;
  const DS = cjs().DataStore;
  if (member.activePersona) {
    const persona = DS?.get?.("personas", member.activePersona) as PersonaRecord | undefined;
    if (persona?.portrait) return persona.portraitFocus ?? null;
  }
  if (member.personaPortrait) return member.personaPortraitFocus ?? null;
  if (member.portrait) return member.portraitFocus ?? null;
  const baseId = member.baseCharacterId || memberId;
  if (!baseId) return null;
  const base = DS?.get?.("characters", baseId) as BaseCharacterRecord | undefined;
  return base?.portraitFocus ?? null;
}

// Inline-style attribute for an <img> so the chosen focus point lands
// at the container's center. Safe to inject — escapes nothing because
// the values are clamped numbers from normalizeFocus.
export function focusAttrStyle(focus: PortraitFocus | null | undefined): string {
  const PP = cjs().PortraitPicker;
  if (PP?.focusStyle) return PP.focusStyle(focus);
  // Tiny inline fallback so the campaign page still works if the
  // portrait picker isn't loaded on a given route.
  if (!focus) return "object-fit:cover";
  const x = Math.max(0, Math.min(100, Number(focus.x) || 50));
  const y = Math.max(0, Math.min(100, Number(focus.y) || 50));
  const z = Math.max(100, Math.min(400, Number(focus.zoom) || 100));
  const parts = ["object-fit:cover", `object-position:${x}% ${y}%`, `transform-origin:${x}% ${y}%`];
  if (z !== 100) parts.push(`transform:scale(${(z / 100).toFixed(3)})`);
  return parts.join(";");
}

// ── Legacy namespace install ─────────────────────────────────────────
export interface CuiPortraits {
  readonly icon: typeof icon;
  readonly memberPortrait: typeof memberPortrait;
  readonly memberPortraitFocus: typeof memberPortraitFocus;
  readonly focusAttrStyle: typeof focusAttrStyle;
}

const NAMESPACE: CuiPortraits = Object.freeze({
  icon,
  memberPortrait,
  memberPortraitFocus,
  focusAttrStyle
});

interface CuiInternalWindow {
  CJS?: {
    CampaignUIInternal?: { Portraits?: CuiPortraits; [key: string]: unknown };
    [key: string]: unknown;
  };
}
const w = window as unknown as CuiInternalWindow;
w.CJS = w.CJS || {};
w.CJS.CampaignUIInternal = w.CJS.CampaignUIInternal || {};
w.CJS.CampaignUIInternal.Portraits = NAMESPACE;

export default NAMESPACE;
