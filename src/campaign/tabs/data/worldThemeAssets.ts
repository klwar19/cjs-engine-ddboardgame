// worldThemeAssets.ts — compatibility resolver for world story art.
//
// World metadata is user-saveable, so deployed browsers can keep older
// world records after source data changes. Keep known legacy art aliases
// here so all campaign tabs resolve the same canonical assets.

export interface WorldThemeAssetConfig {
  readonly id?: string;
  readonly backdrop?: string;
  readonly bannerImage?: string;
  readonly homeBackdrop?: string;
  readonly bannerVideo?: string;
}

const LEGACY_WORLD_THEME_IMAGE_ALIASES: Readonly<Record<string, string>> = {
  "earth|images/story-mode/earth/earth-theme.webp": "images/story-mode/earth/earth-map.webp"
};

function assetKey(worldId: string, path: string): string {
  const cleanPath = String(path || "")
    .trim()
    .split("?")[0]
    .split("#")[0]
    .replace(/^\.?\//, "")
    .toLowerCase();
  return `${String(worldId || "").trim().toLowerCase()}|${cleanPath}`;
}

export function normalizeWorldThemeImage(worldId: string, path: string = ""): string {
  const text = String(path || "").trim();
  if (!text) return "";
  return LEGACY_WORLD_THEME_IMAGE_ALIASES[assetKey(worldId, text)] || text;
}

export function worldThemeBannerImage(
  worldId: string,
  theme: WorldThemeAssetConfig | null | undefined
): string {
  const id = worldId || theme?.id || "";
  return normalizeWorldThemeImage(id, theme?.bannerImage || theme?.backdrop || "");
}

export function worldThemeHomeBackdrop(
  worldId: string,
  theme: WorldThemeAssetConfig | null | undefined
): string {
  const id = worldId || theme?.id || "";
  return normalizeWorldThemeImage(id, theme?.homeBackdrop || theme?.bannerImage || theme?.backdrop || "");
}
