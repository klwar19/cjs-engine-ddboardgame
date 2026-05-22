export {};

declare global {
  interface Window {
    CJS: CJSNamespace;
    CJS_DEV_FREEZE?: boolean;
  }

  interface CJSNamespace {
    CONST?: CJSConstants;
    DataStore?: CJSDataStore;
    StateTools?: CJSStateTools;
    CombatManager?: CJSCombatManager;
    AIConditions?: CJSAIConditions;
    AITargeting?: CJSAITargeting;
    AIController?: CJSAIController;
    SkillResolver?: CJSSkillResolver;
    [key: string]: unknown;
  }

  interface CJSConstants {
    AI_ARCHETYPES: string[];
    AI_TARGET_TYPES: string[];
    ID_PREFIXES?: Record<string, string>;
    [key: string]: unknown;
  }

  interface CJSStateTools {
    clone<T>(value: T): T;
    produce<T>(base: T, recipe: (draft: T) => T | void): T;
    deepFreeze<T>(value: T): T;
    freezeDev<T>(value: T): T;
    isDevFreezeEnabled(): boolean;
  }

  interface CJSDataStore {
    getAll<T = CJSRecord>(type: string): Record<string, T>;
    getAllAsArray<T = CJSRecord>(type: string): T[];
    get<T = CJSRecord>(type: string, id: string): T | null;
    snapshot<T = unknown>(type?: string, id?: string | number): T;
    exists(type: string, id: string): boolean;
    create(type: string, obj: CJSRecord): string | number | null;
    update(type: string, id: string, changes: Partial<CJSRecord>): boolean;
    replace(type: string, id: string, obj: CJSRecord): boolean;
    remove(type: string, id: string): boolean;
    validate(): { errors: string[]; warnings: string[]; valid: boolean };
    loadData(obj: Record<string, unknown>): { success: boolean; validation?: unknown };
    exportJSON(): string;
    reset(): void;
    subscribe(listener: (change: CJSDataChange) => void): () => void;
    [key: string]: unknown;
  }

  interface CJSDataChange {
    action: string;
    type: string;
    id?: string | number;
    before?: unknown;
    after?: unknown;
  }

  interface CJSRecord {
    id?: string;
    name?: string;
    description?: string;
    tags?: string[];
    [key: string]: unknown;
  }

  interface CJSCombatUnit extends CJSRecord {
    instanceId: string;
    baseId?: string;
    team: "player" | "enemy" | string;
    pos?: [number, number];
    currentHP: number;
    maxHP: number;
    currentMP?: number;
    maxMP?: number;
    behaviorAI?: string;
    aiRules?: CJSAIRule[];
    skills?: Array<string | CJSSkillRef>;
    inventory?: string[];
    equipment?: string[];
    turnState?: CJSTurnState;
    compiledStats?: Record<string, number>;
    [key: string]: unknown;
  }

  interface CJSTurnState {
    hasMoved?: boolean;
    mainActionUsed?: boolean;
    apRemaining?: number;
    cooldowns?: Record<string, number>;
    [key: string]: unknown;
  }

  interface CJSSkillRef {
    skillId: string;
    overrides?: Record<string, unknown>;
    level?: number;
  }

  interface CJSSkill extends CJSRecord {
    ap?: number;
    mp?: number;
    range?: number;
    power?: number;
    cooldown?: number;
    qte?: string;
    aoe?: string;
    aoeSize?: number;
    isUltimate?: boolean;
    ultimateCost?: number;
    effects?: Array<Record<string, unknown>>;
  }

  interface CJSAIRule {
    priority?: number;
    condition?: string;
    action?: string;
    target?: string;
  }

  type CJSCombatAction =
    | { type: "move"; targetPos: [number, number] }
    | { type: "attack"; targetId: string; apCost?: number; mpCost?: number }
    | { type: "skill"; skillId: string; targetId?: string; aoeCenter?: [number, number]; apCost?: number; mpCost?: number }
    | { type: "item"; itemId: string; targetId?: string; apCost?: number; mpCost?: number }
    | { type: "defend"; apCost?: number; mpCost?: number }
    | { type: "end_turn" }
    | { type: "wait" };

  interface CJSCombatManager {
    getState(): unknown;
    getStateSnapshot(): unknown;
    getCurrentUnit(): CJSCombatUnit | null;
    getAvailableActionsForCurrent(): unknown;
    submitAction(action: CJSCombatAction): unknown;
    subscribe(listener: (state: unknown) => void): () => void;
    [key: string]: unknown;
  }

  interface CJSAIConditions {
    evaluate(condition: string, ctx: { unit?: CJSCombatUnit; allUnits?: CJSCombatUnit[]; [key: string]: unknown }): boolean;
  }

  interface CJSAITargeting {
    pickTarget(strategy: string, attacker: CJSCombatUnit, allUnits?: CJSCombatUnit[], opts?: Record<string, unknown>): { unit: CJSCombatUnit; score: number } | null;
    bestAoECell?(attacker: CJSCombatUnit, aoeShape: string, aoeSize: number, range: number, opts?: Record<string, unknown>): [number, number] | null;
  }

  interface CJSAIController {
    decide(unit: CJSCombatUnit): CJSCombatAction | null;
  }

  interface CJSSkillResolver {
    getSkillId(entry: string | CJSSkillRef): string;
    getSkillIds(entries: Array<string | CJSSkillRef>): string[];
    hasSkill(unit: CJSCombatUnit, skillId: string): boolean;
    resolveUnitSkill(unit: CJSCombatUnit, skillId: string): CJSSkill | null;
  }
}
