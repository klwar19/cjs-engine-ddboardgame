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
    Dice?: CJSDice;
    DiceService?: CJSDiceService;
    DamageCalc?: CJSDamageCalc;
    CombatLog?: CJSCombatLog;
    CombatSettings?: CJSCombatSettings;
    StatusManager?: CJSStatusManager;
    StatCompiler?: CJSStatCompiler;
    ActionHandler?: CJSActionHandler;
    UndoManager?: CJSUndoManager;
    Formulas?: CJSFormulas;
    [key: string]: any;
  }

  interface CJSConstants {
    AI_ARCHETYPES: string[];
    AI_ARCHETYPE_INFO?: Record<string, { label?: string; desc?: string }>;
    AI_TARGET_TYPES: string[];
    AI_TARGET_INFO?: Record<string, { label?: string; desc?: string }>;
    ID_PREFIXES?: Record<string, string>;
    [key: string]: any;
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
    [key: string]: any;
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
    [key: string]: any;
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
    [key: string]: any;
  }

  interface CJSTurnState {
    hasMoved?: boolean;
    mainActionUsed?: boolean;
    apRemaining?: number;
    cooldowns?: Record<string, number>;
    [key: string]: any;
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
    | { type: "skill"; skillId: string; targetId?: string; aoeCenter?: [number, number]; apCost?: number; mpCost?: number; qteResult?: CJSQTEResult }
    | { type: "item"; itemId: string; targetId?: string; apCost?: number; mpCost?: number }
    | { type: "defend"; apCost?: number; mpCost?: number }
    | { type: "interact"; targetPos: [number, number]; apCost?: number; mpCost?: number }
    | { type: "end_turn" }
    | { type: "wait" };

  interface CJSQTEResult {
    grade?: string;
    multiplier?: number;
    qteType?: string;
    [key: string]: any;
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
    normalize(entry: string | CJSSkillRef | null | undefined): CJSSkillRef | null;
    normalizeArray(skills: Array<string | CJSSkillRef> | null | undefined): CJSSkillRef[];
    getSkillId(entry: string | CJSSkillRef | null | undefined): string | null;
    getSkillIds(entries: Array<string | CJSSkillRef> | null | undefined): string[];
    hasSkill(unit: CJSCombatUnit, skillId: string): boolean;
    resolveUnitSkill(unit: CJSCombatUnit, skillId: string): CJSSkill | null;
    resolveAllUnitSkills(unit: CJSCombatUnit): Array<{ skillId: string; entry: CJSSkillRef | null; resolved: CJSSkill }>;
    mergeWithGrantedSkills(
      baseSkills: Array<string | CJSSkillRef> | null | undefined,
      equipmentIds: string[] | null | undefined
    ): CJSSkillRef[];
  }

  // ── Dice ─────────────────────────────────────────────────────────────
  interface CJSDiceParsed {
    count: number;
    sides: number;
    modifier: number;
  }

  interface CJSDiceResult {
    total: number;
    rolls: number[];
    modifier: number;
    expression: string;
    source?: string;
    manual?: boolean;
    via?: "auto" | "queued" | "prompt";
    rerolled?: boolean;
  }

  type CJSDiceInput = string | number | CJSDiceParsed;

  interface CJSDice {
    parse(input: CJSDiceInput): CJSDiceParsed | null;
    roll(input: CJSDiceInput): CJSDiceResult;
    rollMultiple(input: CJSDiceInput, times: number): CJSDiceResult[];
    min(input: CJSDiceInput): number;
    max(input: CJSDiceInput): number;
    average(input: CJSDiceInput): number;
    toString(input: CJSDiceInput): string;
    d4(): number;
    d6(): number;
    d8(): number;
    d10(): number;
    d12(): number;
    d20(): number;
    d100(): number;
    range(min: number, max: number): number;
    weightedPick<K extends string>(weightMap: Record<K, number>): K | null;
  }

  interface CJSDiceService {
    roll(expression: CJSDiceInput, source?: string): CJSDiceResult;
    rollAsync(expression: CJSDiceInput, source?: string): Promise<CJSDiceResult>;
    d4(source?: string): CJSDiceResult;
    d6(source?: string): CJSDiceResult;
    d8(source?: string): CJSDiceResult;
    d10(source?: string): CJSDiceResult;
    d12(source?: string): CJSDiceResult;
    d20(source?: string): CJSDiceResult;
    percentile(source?: string): CJSDiceResult;
    preview(expression: CJSDiceInput): number;
    rerollLast(): CJSDiceResult | null;
  }

  // ── DamageCalc ───────────────────────────────────────────────────────
  interface CJSAttackBreakdown {
    basePower: number;
    primaryStat: number;
    scalingStat: string;
    luck: number;
    diceRoll: number;
    qteMultiplier: number;
    critMultiplier: number;
    elementMultiplier: number;
    weatherMultiplier: number;
    dr: number;
    damageType: string;
    element: string;
    bonusFlat: number;
    bonusPercent: number;
    base: number;
    withBonuses: number;
    withQTE: number;
    withElement: number;
    final: number;
    overkill: number;
    [key: string]: any;
  }

  interface CJSAttackResult {
    hit: boolean;
    miss: boolean;
    dodged?: boolean;
    isCritical: boolean;
    damage: number;
    breakdown?: (Partial<CJSAttackBreakdown> & { final?: number; reason?: string }) | Record<string, any>;
    attackScore?: number;
    defendScore?: number;
    qteGrade?: string;
    [key: string]: any;
  }

  interface CJSComputeAttackArgs {
    attacker: CJSCombatUnit;
    target: CJSCombatUnit;
    skill?: CJSSkill | null;
    qteMultiplier?: number;
    qteGrade?: string;
    weaponData?: Record<string, unknown> | null;
  }

  interface CJSApplyDamageArgs {
    attacker?: CJSCombatUnit | null;
    target: CJSCombatUnit;
    amount: number;
    element?: string;
    damageType?: string;
    skill?: CJSSkill | null;
    isCritical?: boolean;
    qteGrade?: string;
    breakdown?: Record<string, unknown>;
  }

  interface CJSApplyDamageResult {
    applied: number;
    absorbed: number;
    overkill: number;
    killed: boolean;
    newHP: number;
    negated?: boolean;
  }

  interface CJSDamageCalc {
    computeAttack(args: CJSComputeAttackArgs): CJSAttackResult;
    applyDamage(args: CJSApplyDamageArgs): CJSApplyDamageResult;
    applyHeal(args: { actor?: CJSCombatUnit | null; target: CJSCombatUnit; amount: number; source?: unknown }): { applied: number; newHP: number; blocked: boolean };
    applyMP(args: { target: CJSCombatUnit; delta: number }): number;
    applyTickDamage(args: { source?: CJSCombatUnit | null; target: CJSCombatUnit; amount: number; element?: string; damageType?: string; statusId?: string }): { applied: number; absorbed?: number; killed: boolean };
    applyRawDamage(args: { source?: CJSCombatUnit | null; target: CJSCombatUnit; amount: number; reason?: string; damageType?: string; element?: string }): { applied: number; killed: boolean };
    grantUltimate(unit: CJSCombatUnit, amount: number): void;
    consumeUltimate(unit: CJSCombatUnit, amount: number): boolean;
  }

  // ── CombatLog ────────────────────────────────────────────────────────
  interface CJSLogEntry {
    id: number;
    turn: number;
    phase: string;
    type: string;
    actor: CJSCombatUnit | string | null;
    target: CJSCombatUnit | string | null;
    tags: string[];
    data: Record<string, unknown>;
    message: string | null;
    timestamp: number;
  }

  interface CJSCombatLog {
    record(entry: { type?: string; actor?: CJSCombatUnit | string | null; target?: CJSCombatUnit | string | null; tags?: string[]; data?: Record<string, unknown>; message?: string }): CJSLogEntry;
    logHit(args: { actor: CJSCombatUnit; target: CJSCombatUnit; damage: number; element?: string; damageType?: string; skill?: CJSSkill | null; isCritical?: boolean; qteGrade?: string; breakdown?: Record<string, unknown> }): CJSLogEntry;
    logMiss(args: { actor: CJSCombatUnit; target: CJSCombatUnit; skill?: CJSSkill | null; reason?: string }): CJSLogEntry;
    logDodge(args: { actor: CJSCombatUnit; target: CJSCombatUnit; skill?: CJSSkill | null }): CJSLogEntry;
    logKill(args: { actor?: CJSCombatUnit | null; target: CJSCombatUnit; overkill?: number; finalBlowSkill?: CJSSkill | null }): CJSLogEntry;
    logHeal(args: { actor?: CJSCombatUnit | null; target: CJSCombatUnit; amount: number; source?: unknown }): CJSLogEntry;
    logStatusApplied(args: { actor?: CJSCombatUnit | null; target: CJSCombatUnit; statusId: string; duration?: number; stacks?: number }): CJSLogEntry;
    logStatusRemoved(args: { target: CJSCombatUnit; statusId: string; reason?: string }): CJSLogEntry;
    logStatusTick(args: { target: CJSCombatUnit; statusId: string; effect: string; amount?: number }): CJSLogEntry;
    logMove(args: { actor: CJSCombatUnit; from: [number, number]; to: [number, number]; cost?: number; terrainEffects?: unknown }): CJSLogEntry;
    logKnockback(args: { actor: CJSCombatUnit; target: CJSCombatUnit; distance: number; collisions?: unknown }): CJSLogEntry;
    logSkillUse(args: { actor: CJSCombatUnit; target?: CJSCombatUnit | null; skill: CJSSkill; apCost?: number; mpCost?: number }): CJSLogEntry;
    logEffect(args: { actor?: CJSCombatUnit | null; target?: CJSCombatUnit | null; effect: Record<string, unknown>; result?: unknown }): CJSLogEntry;
    logQTE(args: { actor: CJSCombatUnit; skill: CJSSkill; qteType?: string; grade?: string; multiplier?: number }): CJSLogEntry;
    logTurnStart(actor: CJSCombatUnit): CJSLogEntry;
    logTurnEnd(actor: CJSCombatUnit): CJSLogEntry;
    logBattleStart(units: unknown): CJSLogEntry;
    logBattleEnd(args: { winner: string; reason?: string }): CJSLogEntry;
    logNote(message: string, extraTags?: string[]): CJSLogEntry;
    setTurn(n: number): void;
    setPhase(phase: string): void;
    getTurn(): number;
    getPhase(): string;
    getAll(): CJSLogEntry[];
    getLast(n: number): CJSLogEntry[];
    getLastEntry(): CJSLogEntry | null;
    getByTurn(t: number): CJSLogEntry[];
    getByActor(unitOrId: CJSCombatUnit | string): CJSLogEntry[];
    getByTarget(unitOrId: CJSCombatUnit | string): CJSLogEntry[];
    getByType(type: string): CJSLogEntry[];
    getByTag(tag: string): CJSLogEntry[];
    getSince(id: number): CJSLogEntry[];
    subscribe(fn: (entry: CJSLogEntry) => void): () => void;
    reset(): void;
    summary(): unknown;
  }

  // ── CombatSettings ───────────────────────────────────────────────────
  type CJSControlMode = "manual" | "ai";
  type CJSDiceMode = "auto" | "queued" | "prompt";
  type CJSAutoScope = "turn" | "round" | "until_stop" | null;

  interface CJSCombatSettings {
    setUnitControl(unitId: string, mode: CJSControlMode): void;
    setTeamControl(team: string, mode: CJSControlMode): void;
    setDefaultControl(mode: CJSControlMode): void;
    getControlMode(unit: CJSCombatUnit): CJSControlMode;
    isManual(unit: CJSCombatUnit): boolean;
    isAI(unit: CJSCombatUnit): boolean;
    requestAuto(scope: Exclude<CJSAutoScope, null>, ctx?: Record<string, unknown>): void;
    stopAuto(): void;
    getAutoScope(): CJSAutoScope;
    isAutoActive(): boolean;
    tickAutoScope(ctx: { unitId?: string; turnIndex?: number; rounds?: number }): void;
    shouldAutoThisTurn(unit: CJSCombatUnit): boolean;
    setDiceMode(mode: CJSDiceMode): void;
    getDiceMode(): CJSDiceMode;
    queueDice(values: number[]): void;
    popQueuedDice(): number | null;
    clearDiceQueue(): void;
    diceQueueLength(): number;
    setDicePromptFn(fn: ((expr: CJSDiceInput, source?: string) => number | Promise<number> | null) | null): void;
    getDicePromptFn(): ((expr: CJSDiceInput, source?: string) => number | Promise<number> | null) | null;
    recordDiceRoll(entry: { expr: string; result: number; rolls: number[]; source?: string; manual?: boolean; via?: string }): void;
    getDiceHistory(): Array<Record<string, unknown>>;
    setAnimationsEnabled(flag: boolean): void;
    getAnimationsEnabled(): boolean;
    setDefaultBgmPool(ids: string[]): void;
    getDefaultBgmPool(): string[];
    reset(): void;
    snapshot(): Record<string, unknown>;
  }

  // ── StatusManager ────────────────────────────────────────────────────
  interface CJSStatusInstance {
    statusId: string;
    duration: number;
    stacks: number;
    sourceUnitId?: string | null;
    appliedTurn?: number;
    [key: string]: unknown;
  }

  interface CJSApplyStatusArgs {
    target: CJSCombatUnit;
    statusId: string;
    sourceUnit?: CJSCombatUnit | null;
    overrides?: { duration?: number; stacks?: number; [key: string]: unknown };
    combatContext?: { turnNumber?: number };
  }

  interface CJSStatusManager {
    applyStatus(args: CJSApplyStatusArgs): { applied: boolean; instance?: CJSStatusInstance; resisted?: boolean };
    removeStatus(unit: CJSCombatUnit, statusId: string, reason?: string): boolean;
    cleanse(args: { unit: CJSCombatUnit; filter?: (s: CJSStatusInstance) => boolean }): number;
    tickStatuses(unit: CJSCombatUnit, phase: "turn_start" | "turn_end"): void;
    checkBreakConditions(unit: CJSCombatUnit, event: string, damageElement?: string): void;
    hasStatus(unit: CJSCombatUnit, statusId: string): boolean;
    getStatus(unit: CJSCombatUnit, statusId: string): CJSStatusInstance | null;
    getStatusStacks(unit: CJSCombatUnit, statusId: string): number;
    hasAnyStatusWith(unit: CJSCombatUnit, predicate: (s: CJSStatusInstance) => boolean): boolean;
    canAct(unit: CJSCombatUnit): boolean;
    canMove(unit: CJSCombatUnit): boolean;
    canUseSkills(unit: CJSCombatUnit): boolean;
    canBeHealed(unit: CJSCombatUnit): boolean;
    isInvisible(unit: CJSCombatUnit): boolean;
    getForcedTarget(unit: CJSCombatUnit): string | null;
    hasRandomTarget(unit: CJSCombatUnit): boolean;
    hasAutoCounter(unit: CJSCombatUnit): boolean;
    getActiveStatusesByCategory(unit: CJSCombatUnit): Record<string, CJSStatusInstance[]>;
    getAbsorbShield(unit: CJSCombatUnit): number;
    absorbDamage(unit: CJSCombatUnit, damage: number, damageType?: string): number;
    processRecompileRequests(units: CJSCombatUnit[], baseUnitProvider: (baseId: string) => CJSRecord | null): void;
    getStatusDef(statusId: string): Record<string, unknown> | null;
  }

  // ── StatCompiler ─────────────────────────────────────────────────────
  interface CJSStatCompiler {
    compileUnit(
      baseUnit: CJSRecord,
      instanceId?: string,
      opts?: {
        currentHP?: number;
        currentMP?: number;
        activeStatuses?: CJSStatusInstance[];
        level?: number;
        ultimateMeter?: number;
      }
    ): CJSCombatUnit | null;
    recompile(unit: CJSCombatUnit, baseUnit: CJSRecord): CJSCombatUnit | null;
    previewUnit(baseUnit: CJSRecord): Record<string, unknown> | null;
  }

  // ── ActionHandler ────────────────────────────────────────────────────
  interface CJSActionResult {
    success: boolean;
    reason?: string;
    [key: string]: unknown;
  }

  interface CJSAvailableSkill {
    id: string;
    skill: CJSSkill;
    usable: boolean;
    silenced?: boolean;
    weaponReady: boolean;
    requiredWeaponTypes: string[];
    cooldown: number;
    apCost: number;
    mpCost: number;
    isUltimate: boolean;
    ultimateCost: number;
    ultimateReady: boolean;
  }

  interface CJSAvailableItem {
    id: string;
    item: CJSRecord;
    usable: boolean;
    [key: string]: unknown;
  }

  interface CJSAvailableActions {
    move: boolean;
    attack: boolean;
    defend: boolean;
    endTurn: boolean;
    skills: CJSAvailableSkill[];
    items: CJSAvailableItem[];
    [key: string]: unknown;
  }

  interface CJSActionHandler {
    validate(unit: CJSCombatUnit, action: CJSCombatAction): { valid: boolean; reason?: string };
    execute(unit: CJSCombatUnit, action: CJSCombatAction, combatContext?: { turnNumber?: number }): CJSActionResult;
    getAvailableActions(unit: CJSCombatUnit): CJSAvailableActions;
    simulateAIQTE(unit: CJSCombatUnit, skill: CJSSkill): { grade: string; multiplier: number };
    getAttackRange(unit: CJSCombatUnit): number;
  }

  // ── UndoManager ──────────────────────────────────────────────────────
  interface CJSUndoEntry {
    action: "create" | "update" | "replace" | "remove";
    entityType: string;
    entityId: string | number;
    before: CJSRecord | null;
    after: CJSRecord | null;
    label: string;
    timestamp: number;
  }

  interface CJSUndoState {
    canUndo: boolean;
    canRedo: boolean;
    undoLabel: string | null;
    redoLabel: string | null;
    stackSize: number;
  }

  interface CJSUndoManager {
    push(action: CJSUndoEntry["action"], entityType: string, entityId: string | number, before: CJSRecord | null, after: CJSRecord | null, label?: string): void;
    undo(): CJSUndoEntry | null;
    redo(): CJSUndoEntry | null;
    canUndo(): boolean;
    canRedo(): boolean;
    undoLabel(): string | null;
    redoLabel(): string | null;
    stackSize(): number;
    enable(): void;
    disable(): void;
    isEnabled(): boolean;
    clear(): void;
    subscribe(fn: (state: CJSUndoState) => void): () => void;
  }

  // ── Formulas (key surface) ───────────────────────────────────────────
  interface CJSStats {
    S?: number; P?: number; E?: number; C?: number; I?: number; A?: number; L?: number;
    [key: string]: number | undefined;
  }

  interface CJSHitCheckResult {
    hit: boolean;
    attackScore: number;
    defendScore: number;
  }

  interface CJSCalcFinalDamageArgs {
    skillPower: number;
    primaryStat: number;
    diceRoll: number;
    luckValue?: number;
    qteMultiplier?: number;
    elementMultiplier?: number;
    dr?: number;
    bonusDamageFlat?: number;
    bonusDamagePercent?: number;
  }

  interface CJSCalcFinalDamageResult {
    base: number;
    withBonuses: number;
    withQTE: number;
    withElement: number;
    final: number;
    [key: string]: number;
  }

  interface CJSFormulas {
    calcMaxHP(stats: CJSStats, rank?: string, context?: Record<string, unknown>): number;
    calcPlotArmorHP(rank: string, context?: Record<string, unknown>): number;
    calcMaxMP(stats: CJSStats, rank?: string): number;
    calcPhysicalDR(stats: CJSStats): number;
    calcMagicDR(stats: CJSStats): number;
    calcChaosDR(stats: CJSStats): number;
    calcDR(stats: CJSStats, damageType: string): number;
    calcEffectiveSkillPower(basePower: number, skillLevel: number): number;
    calcBaseDamage(skillPower: number, primaryStat: number, diceRoll: number, luckValue: number): number;
    calcMitigatedDamage(rawDamage: number, defenseRating: number): CJSCalcFinalDamageResult;
    calcFinalDamage(args: CJSCalcFinalDamageArgs): CJSCalcFinalDamageResult;
    getElementMultiplier(attackElement: string, targetUnit: CJSCombatUnit): number;
    calcHitCheck(attackerPerception: number, attackerAccBonus: number, attackerRoll: number, defenderAgility: number, defenderEvaBonus: number, defenderRoll: number): CJSHitCheckResult;
    calcCritChance(luck: number, critBonus?: number): number;
    calcCritMultiplier(critDamageBonus?: number): number;
    rollCrit(luck: number, critBonus?: number): boolean;
    calcInitiative(agility: number, initiativeBonus: number, roll: number): number;
    calcMovement(baseMovement: number, movementBonus?: number): number;
    calcKnockbackDistance(baseDistance: number, targetEndurance: number): number;
    calcWallCollisionDamage(knockbackSourceDamage: number): number;
    calcUnitCollisionDamage(knockbackSourceDamage: number): number;
    calcBarrelExplosionDamage(sourceStrength?: number): number;
    facingFromDelta(dr: number, dc: number): string | null;
    getFlankPosition(attackerPos: [number, number], targetPos: [number, number], targetFacing?: string | null): { position: string; critBonus: number };
    calcElevationBonuses(attackerElevation: number, targetElevation: number, baseRange?: number): { accuracy: number; range: number; advantage: number };
    doesKnockbackChain(pushedSize: string, blockerSize: string): boolean;
    cellBlocksLoS(terrainType: string, unitOnCell?: CJSCombatUnit | null): boolean;
    getTerrainMoveCost(terrainType: string): number;
    calcDropChance(baseChance: number, killerLuck: number): number;
    applyWorldCeiling(actualStat: number, worldCeiling: number): number;
    applyWorldCeilingToStats(stats: CJSStats, worldCeiling: number): CJSStats;
    rankIndex(rank: string): number;
    rankAtIndex(idx: number): string;
    nextRank(rank: string): string;
    meetsRank(rank: string, minRank: string): boolean;
    minRank(a: string, b: string): string;
    effectiveRank(memberRank: string, worldCeiling: string): string;
    calcMonsterLevelScale(level: number): number;
    levelBandForRank(rank: string): { min: number; max: number };
    pickMonsterLevel(rank: string, opts?: Record<string, unknown>): number;
    calcSkillPowerAtLevel(basePower: number, level: number, perLevel?: number): number;
    applySkillLevelPerks(skill: CJSSkill, level: number): CJSSkill;
    getNextSkillPerk(skill: CJSSkill, level: number): Record<string, unknown> | null;
    getEarnedSkillPerks(skill: CJSSkill, level: number): Array<Record<string, unknown>>;
    [key: string]: any;
  }

  // ── Environment / Weather (combat state) ─────────────────────────────
  interface CJSEnvironment {
    id: string;
    remaining: number;
    sourceUnitId?: string | null;
    appliedRound?: number;
    [key: string]: unknown;
  }

  // ── Combat top-level state ───────────────────────────────────────────
  type CJSCombatPhase =
    | "idle"
    | "turn_start"
    | "action"
    | "awaiting_input"
    | "turn_end"
    | "battle_end";

  interface CJSCombatState {
    encounter: CJSRecord;
    units: Record<string, CJSCombatUnit>;
    initiative: string[];
    turnIndex: number;
    roundNumber: number;
    phase: CJSCombatPhase;
    currentUnitId: string | null;
    winner: "player" | "enemy" | "draw" | null;
    subscribers: Array<(state: CJSCombatState) => void>;
    environment: CJSEnvironment;
    [key: string]: unknown;
  }

  interface CJSCombatManager {
    startEncounter(encounterIdOrRecord: string | CJSRecord): CJSCombatState;
    step(): CJSCombatPhase | undefined;
    runUntilInput(maxSteps?: number): CJSCombatPhase | undefined;
    submitAction(action: CJSCombatAction): CJSActionResult;
    getCurrentUnit(): CJSCombatUnit | null;
    getAvailableActionsForCurrent(): CJSAvailableActions | null;
    isAwaitingInput(): boolean;
    isManualTurn(): boolean;
    autoOneTurn(): CJSCombatPhase | undefined;
    autoOneRound(): CJSCombatPhase | undefined;
    autoUntilStop(): CJSCombatPhase | undefined;
    stopAuto(): void;
    getState(): CJSCombatState | null;
    getStateSnapshot(): Omit<CJSCombatState, "subscribers"> | null;
    getUnits(): CJSCombatUnit[];
    getInitiativeOrder(): CJSCombatUnit[];
    subscribe(fn: (state: CJSCombatState) => void): () => void;
    reset(): void;
    getEnvironment(): CJSEnvironment;
    notify(): void;
    gmAddUnit(baseId: string, r: number, c: number, opts?: { team?: string; size?: string }): CJSActionResult;
    gmRemoveUnit(instanceId: string): CJSActionResult;
    gmMoveUnit(instanceId: string, r: number, c: number): CJSActionResult;
    gmAdjustResource(unit: CJSCombatUnit, resource: "HP" | "MP" | "AP", amount: number, mode?: "set" | "delta" | "full" | "pct"): CJSActionResult;
    gmApplyStatus(unit: CJSCombatUnit, statusId: string, duration?: number): CJSActionResult;
    gmCleanseUnit(unit: CJSCombatUnit): CJSActionResult;
    gmSetTerrain(r: number, c: number, terrainType: string): CJSActionResult;
    gmBulkAdjust(scope: "all" | "player" | "enemy", resource: "HP" | "MP" | "AP", amount: number, mode?: "set" | "delta" | "full" | "pct"): CJSActionResult;
    gmBulkStatus(scope: "all" | "player" | "enemy", statusId: string, duration?: number): CJSActionResult;
    gmBulkCleanse(scope: "all" | "player" | "enemy"): CJSActionResult;
    gmBulkTerrain(terrainType: string, mode?: "empty" | "all"): CJSActionResult;
    gmEndBattle(winner?: "player" | "enemy" | "draw"): CJSActionResult;
    gmSkipTurn(): CJSActionResult;
    [key: string]: unknown;
  }
}
