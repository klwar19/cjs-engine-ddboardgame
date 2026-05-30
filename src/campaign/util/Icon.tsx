// Icon.tsx — Phase K.3.2 JSX icon, the React twin of `UIIcons.renderIcon`.
//
// Maps the structured token from `resolveIconToken` (icon.ts) to the SAME
// markup `js/ui/ui-icons.js::renderIcon` emits, so JSX icons in the roster
// detail row (and anywhere else) render identically to the HTML strings they
// replace. The single intentional difference: the image variant uses a React
// `onError` handler instead of the inline `onerror=` attribute — same runtime
// behaviour (hide the broken img, reveal the glyph fallback), React-managed.

import {
  resolveIconToken,
  iconFallbackGlyph,
  iconClassName,
  iconAltText,
  type IconEntitySource
} from "./icon";

export interface IconProps {
  readonly entity?: IconEntitySource | null;
  readonly kind?: string;
  readonly size?: string;
  readonly alt?: string;
  readonly title?: string;
  readonly className?: string;
}

export function Icon({ entity, kind = "generic", size = "md", alt, title, className }: IconProps) {
  const token = resolveIconToken(entity, kind);
  const cls = iconClassName(kind, size, className);
  const titleAttr = title || undefined;

  if (token.kind === "image") {
    return (
      <span className={cls} title={titleAttr}>
        <img
          src={token.value}
          alt={iconAltText(entity, token, alt)}
          onError={(e) => {
            const img = e.currentTarget;
            img.style.display = "none";
            const fallback = img.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = "";
          }}
        />
        <span className="cjs-icon-fallback" style={{ display: "none" }}>
          {iconFallbackGlyph(kind)}
        </span>
      </span>
    );
  }

  if (token.kind === "letter") {
    return (
      <span className={`${cls} cjs-icon-letter`} title={titleAttr}>
        {token.value}
      </span>
    );
  }

  return (
    <span className={cls} title={titleAttr}>
      {token.value}
    </span>
  );
}
