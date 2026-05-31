// icon.ts — Phase K.3.2 icon-as-data path.
//
// `js/ui/ui-icons.js` (UIIcons) already classifies an icon source into a
// structured token `{ kind: 'glyph' | 'letter' | 'image', value, alt }` via
// `UIIcons.normalize` — the data path the JSX `<Icon>` needs. This module is
// the thin typed seam over it: resolve a token for an entity (delegating to
// UIIcons so classification stays single-source) and compose the className
// the same way `UIIcons.renderIcon` does. `<Icon>` (IconView.tsx) maps the token
// to the SAME markup `renderIcon` emits, so JSX icons are DOM-compatible with
// the HTML strings they replace — the only intentional difference is the
// image variant swapping the inline `onerror=` attribute for a React
// `onError` handler (identical runtime behaviour, React-managed).

export type IconTokenKind = "glyph" | "letter" | "image";

export interface IconToken {
  readonly kind: IconTokenKind;
  readonly value: string;
  readonly alt?: string;
}

export interface IconEntitySource {
  readonly icon?: string;
  readonly symbol?: string;
  readonly glyph?: string;
  readonly iconUrl?: string;
  readonly name?: string;
  readonly [key: string]: unknown;
}

interface UIIconsSurface {
  readonly normalize: (raw: unknown, fallbackKind?: string) => IconToken;
  readonly iconSource: (entity: unknown, kind?: string) => unknown;
  readonly defaultFor: (kind: string) => string;
}

function uiIcons(): UIIconsSurface | undefined {
  return (window as unknown as { CJS?: { UIIcons?: UIIconsSurface } }).CJS?.UIIcons;
}

// Resolve the structured token for an entity. Delegates to UIIcons (the
// engine's single source for icon classification); falls back to a plain
// glyph if UIIcons isn't loaded on a given route — mirrors the existing
// `cui-portraits` `icon()` fallback so the campaign page renders standalone.
export function resolveIconToken(
  entity: IconEntitySource | null | undefined,
  kind = "generic"
): IconToken {
  const I = uiIcons();
  if (I) return I.normalize(I.iconSource(entity ?? null, kind), kind);
  return { kind: "glyph", value: entity?.icon || (kind === "passive" ? "🛡️" : "⚔️") };
}

// Category default glyph for the image-fallback span.
export function iconFallbackGlyph(kind = "generic"): string {
  return uiIcons()?.defaultFor(kind) ?? "◆";
}

// Compose the same class string `UIIcons.renderIcon` builds (the letter
// variant appends `cjs-icon-letter` in the component, matching renderIcon).
export function iconClassName(kind = "generic", size = "md", className = ""): string {
  return `cjs-icon cjs-icon-${size} cjs-icon-${kind} ${className || ""}`.trim();
}

// Effective alt text, matching renderIcon's precedence
// (explicit alt → entity.name → token alt → "").
export function iconAltText(
  entity: IconEntitySource | null | undefined,
  token: IconToken,
  alt?: string
): string {
  return alt ?? entity?.name ?? token.alt ?? "";
}
