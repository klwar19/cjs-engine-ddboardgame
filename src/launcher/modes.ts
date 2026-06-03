export interface ModeConfig {
  readonly id: ModeId;
  readonly title: string;
  readonly file: string;
  readonly icon: string;
  readonly label: string;
  readonly description: string;
}

export type ModeId = "campaign" | "combat" | "editor" | "minigames" | "tests";

export const MODES: Record<ModeId, ModeConfig> = {
  campaign: {
    id: "campaign",
    title: "Campaign Mode",
    file: "campaign.html",
    icon: "CM",
    label: "Campaign",
    description: "Story Director, world map, quests, party"
  },
  combat: {
    id: "combat",
    title: "Combat Simulator",
    file: "combat.html",
    icon: "BT",
    label: "Combat",
    description: "Tactical battle simulator with AI & QTEs"
  },
  editor: {
    id: "editor",
    title: "Content Editor",
    file: "editor.html",
    icon: "ED",
    label: "Editor",
    description: "Author skills, monsters, items, scenes"
  },
  minigames: {
    id: "minigames",
    title: "Minigames",
    file: "minigames.html",
    icon: "MG",
    label: "Minigames",
    description: "Puzzle, maze, push-box test harness"
  },
  tests: {
    id: "tests",
    title: "System Tests",
    file: "tests.html",
    icon: "TS",
    label: "Tests",
    description: "Engine sanity tests & effect library"
  }
};

export const MODE_IDS = Object.keys(MODES) as ModeId[];

export function isModeId(value: string | null | undefined): value is ModeId {
  return !!value && value in MODES;
}

export const EMBED_FLAG = "embed=launcher";
export const EMBED_PARAM = "embed";
export const EMBED_VALUE = "launcher";
export const CACHE_BUST_PARAM = "cb";

export function appendLauncherEmbedFlag(file: string): string {
  const hashIndex = file.indexOf("#");
  const beforeHash = hashIndex === -1 ? file : file.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : file.slice(hashIndex);
  const keepLeadingSlash = beforeHash.startsWith("/");
  const url = new URL(beforeHash || ".", "https://cjs.local/");
  url.searchParams.set(EMBED_PARAM, EMBED_VALUE);
  const path = keepLeadingSlash || !url.pathname.startsWith("/") ? url.pathname : url.pathname.slice(1);
  return `${path}${url.search}${hash}`;
}

function cleanCacheBust(value: string | null | undefined): string {
  return String(value || "").trim().replace(/[^A-Za-z0-9._-]+/g, "").slice(0, 64);
}

export function launcherCacheBustFromPage(): string {
  if (typeof window === "undefined") return "";
  const explicit = cleanCacheBust(new URLSearchParams(window.location.search).get(CACHE_BUST_PARAM));
  if (explicit) return explicit;
  if (typeof document === "undefined") return "";
  for (const script of Array.from(document.scripts)) {
    const src = script.getAttribute("src") || "";
    const match = src.match(/(?:^|\/)assets\/index-([A-Za-z0-9_-]+)\.js(?:\?|#|$)/);
    if (match?.[1]) return cleanCacheBust(match[1]);
  }
  return "";
}

export function appendCacheBustParam(file: string, cacheBust: string | null | undefined): string {
  const clean = cleanCacheBust(cacheBust);
  if (!clean) return file;
  const hashIndex = file.indexOf("#");
  const beforeHash = hashIndex === -1 ? file : file.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : file.slice(hashIndex);
  const keepLeadingSlash = beforeHash.startsWith("/");
  const url = new URL(beforeHash || ".", "https://cjs.local/");
  url.searchParams.set(CACHE_BUST_PARAM, clean);
  const path = keepLeadingSlash || !url.pathname.startsWith("/") ? url.pathname : url.pathname.slice(1);
  return `${path}${url.search}${hash}`;
}

export function buildIframeUrl(mode: ModeId, cacheBust = launcherCacheBustFromPage()): string {
  return appendCacheBustParam(appendLauncherEmbedFlag(MODES[mode].file), cacheBust);
}
