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
    icon: "🗺️",
    label: "Campaign",
    description: "Story Director, world map, quests, party"
  },
  combat: {
    id: "combat",
    title: "Combat Simulator",
    file: "combat.html",
    icon: "⚔️",
    label: "Combat",
    description: "Tactical battle simulator with AI & QTEs"
  },
  editor: {
    id: "editor",
    title: "Content Editor",
    file: "editor.html",
    icon: "🛠️",
    label: "Editor",
    description: "Author skills, monsters, items, scenes"
  },
  minigames: {
    id: "minigames",
    title: "Minigames",
    file: "minigames.html",
    icon: "🎮",
    label: "Minigames",
    description: "Puzzle, maze, push-box test harness"
  },
  tests: {
    id: "tests",
    title: "System Tests",
    file: "tests.html",
    icon: "🧪",
    label: "Tests",
    description: "Engine sanity tests & effect library"
  }
};

export const MODE_IDS = Object.keys(MODES) as ModeId[];

export function isModeId(value: string | null | undefined): value is ModeId {
  return !!value && value in MODES;
}

export const EMBED_FLAG = "embed=launcher";

export function buildIframeUrl(mode: ModeId): string {
  const file = MODES[mode].file;
  return file + (file.includes("?") ? "&" : "?") + EMBED_FLAG;
}
