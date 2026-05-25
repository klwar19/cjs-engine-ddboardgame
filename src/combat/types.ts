// TS shapes for the vanilla JS combat layer the React shell talks to.

export interface CombatState {
  readonly phase?: string;
  readonly [key: string]: unknown;
}

export interface CombatManagerApi {
  readonly getState?: () => CombatState | null;
  readonly subscribe?: (cb: (state: CombatState) => void) => () => void;
  readonly reset?: () => void;
  readonly startEncounter?: (encounterId: string) => unknown;
  readonly runUntilInput?: (maxSteps?: number) => unknown;
}

export interface BattleSetupApi {
  readonly init: (container: HTMLElement, onStart: (id: string) => void) => void;
  readonly show: () => void;
  readonly hide: () => void;
  readonly reset: () => void;
}

export interface CombatSettingsApi {
  readonly reset?: () => void;
  readonly setTeamControl?: (team: string, mode: string) => void;
}

export interface DataStoreApi {
  readonly getAll: <T = unknown>(type: string) => Record<string, T>;
  readonly getAllAsArray: <T = unknown>(type: string) => T[];
  readonly get: <T = unknown>(type: string, id: string) => T | null;
  readonly replace: (type: string, id: string, value: unknown) => void;
  readonly remove: (type: string, id: string) => void;
  readonly loadData: (data: unknown) => void;
  readonly getCounts?: () => Record<string, number>;
}

export interface NarratorDataApi {
  readonly load: (quips: unknown[]) => Promise<void>;
}

export interface ContentManagerApi {
  readonly loadDefaultData: () => Promise<{ mode: string }>;
}

export interface CampaignBridgeApi {
  readonly readRequest: () => CampaignRequest | null;
  readonly clearRequest: () => void;
  readonly writeResult: (result: unknown) => void;
  readonly summarizeLoot: (result: unknown) => string;
  readonly buildResultFromCombat: (
    request: CampaignRequest,
    state: CombatState
  ) => CombatResult;
  readonly createRuntimeEncounterFromRequest: (
    request: CampaignRequest | null
  ) => string | null;
}

export interface CampaignRequest {
  readonly returnUrl?: string;
  readonly label?: string;
  readonly encounterId?: string;
  readonly partyOverlay?: Record<string, PartyOverlayEntry>;
  readonly [key: string]: unknown;
}

export interface PartyOverlayEntry {
  readonly unit?: {
    readonly activePersona?: string;
    readonly personaName?: string;
    readonly personaOutOfWorld?: boolean;
    readonly damageDealtMultiplier?: number;
    readonly damageTakenMultiplier?: number;
    readonly name?: string;
  };
}

export interface CombatResult {
  readonly result?: string;
  readonly rounds?: number;
  readonly [key: string]: unknown;
}

export interface ScenePlayerApi {
  readonly wireCombat?: () => void;
}

export interface PortraitPickerApi {
  readonly loadManifest?: () => Promise<void>;
}

export interface L2DCompanionApi {
  readonly init?: (opts: { mode: string }) => Promise<void>;
}

export interface GridRendererApi {
  readonly setTheme?: (opts: { image: string }) => void;
}

interface CJSCombat {
  CombatManager?: CombatManagerApi;
  BattleSetup?: BattleSetupApi;
  CombatSettings?: CombatSettingsApi;
  DataStore?: DataStoreApi;
  NarratorData?: NarratorDataApi;
  ContentManager?: ContentManagerApi;
  CampaignCombatBridge?: CampaignBridgeApi;
  ScenePlayer?: ScenePlayerApi;
  PortraitPicker?: PortraitPickerApi;
  L2DCompanion?: L2DCompanionApi;
  GridRenderer?: GridRendererApi;
}

export function getCombatCjs(): CJSCombat {
  return (window as unknown as { CJS?: CJSCombat }).CJS ?? {};
}
