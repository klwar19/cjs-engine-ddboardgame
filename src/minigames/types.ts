// Lightweight TS shapes for the vanilla JS minigame layer the harness drives.
// Mirrors the contract in js/minigames/minigame-host.js + minigame-registry.js.

export interface MinigameMeta {
  readonly id: string;
  readonly title?: string;
  readonly theme?: string;
  readonly [key: string]: unknown;
}

export interface MinigameLevel {
  readonly id: string;
  readonly title?: string;
  readonly difficulty?: number | string;
  readonly hint?: string;
  readonly tags?: readonly string[];
  readonly layout?: readonly string[];
  readonly width?: number;
  readonly height?: number;
  readonly player?: readonly [number, number];
  readonly exit?: readonly [number, number];
  readonly boxes?: readonly unknown[];
  readonly goals?: readonly unknown[];
  readonly theme?: string;
  readonly narrative?: Record<string, unknown>;
  readonly onWinOps?: readonly unknown[];
  readonly onLoseOps?: readonly unknown[];
}

export interface MinigameInstance {
  readonly mount: () => void;
  readonly unmount?: () => void;
  readonly handleAction: (action: string) => void;
  readonly undo?: () => void;
  readonly reset?: () => void;
  readonly hint?: () => void;
  readonly getState: () => { status: string; [key: string]: unknown };
  readonly _solveNext: (state: unknown) => string | null;
}

export interface MinigameRegistryEntry {
  readonly meta: MinigameMeta;
  readonly factory: (config: {
    canvas: HTMLCanvasElement;
    stage: HTMLElement;
    level: MinigameLevel;
    options: Record<string, unknown>;
    onUpdate: (state: unknown) => void;
    onComplete: (summary: { status: string; turns?: number; hintsUsed?: number }) => void;
  }) => MinigameInstance;
}

export interface MinigameResult {
  readonly gameId: string;
  readonly levelId: string | null;
  readonly status: string;
  readonly turns: number;
  readonly hintsUsed: number;
  readonly score: number;
  readonly tags: readonly string[];
  readonly suggestedOps: readonly unknown[];
}

export interface MinigameSession {
  readonly close: () => void;
  readonly result: MinigameResult | null;
}

export interface OpenMiniGameOpts {
  readonly gameId: string;
  readonly levelId?: string;
  readonly source?: string;
  readonly onComplete?: (result: MinigameResult) => void;
}

interface MinigamesApi {
  readonly listGames: () => readonly MinigameMeta[];
  readonly openMiniGame: (opts: OpenMiniGameOpts) => Promise<MinigameSession | null>;
  readonly useSpriteMap: (urlOrObject: string | object) => void;
}

interface MinigameRegistryApi {
  readonly getGame: (gameId: string) => MinigameRegistryEntry | null;
  readonly listGames: () => readonly MinigameMeta[];
}

export function getMinigamesApi(): MinigamesApi | null {
  const cjs = (window as unknown as { CJS?: { Minigames?: MinigamesApi } }).CJS;
  return cjs?.Minigames ?? null;
}

export function getMinigameRegistry(): MinigameRegistryApi | null {
  const cjs = (window as unknown as { CJS?: { MinigameRegistry?: MinigameRegistryApi } }).CJS;
  return cjs?.MinigameRegistry ?? null;
}
