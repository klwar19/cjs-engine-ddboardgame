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

export function buildIframeUrl(mode: ModeId): string {
  return appendLauncherEmbedFlag(MODES[mode].file);
}
