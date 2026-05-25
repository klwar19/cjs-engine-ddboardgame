// Imperative FX overlay — paints damage/hit/heal/miss/KO/cast/move/banner
// effects on a DOM layer attached to the combat grid. Subscribes to
// AnimationBus and listens for engine events.
//
// We keep this imperative (raw DOM, not React) because:
//   1. Many effects spawn and clean themselves up on timers; tracking
//      every active sprite in React state would churn rerenders.
//   2. Position math depends on canvas/cell pixel metrics, which means
//      we already need a ref to the DOM container.
//   3. The legacy implementation was already raw DOM — staying that way
//      keeps the visual cadence identical to the vanilla version.

interface CjsAny {
  AnimationBus?: {
    on: (event: string, cb: (payload: unknown) => void) => () => void;
  };
  GridRenderer?: {
    getCellSize?: () => number;
    animateUnitMove?: (id: string, from: number[], to: number[], dur: number) => void;
  };
  CombatSettings?: {
    getAnimationsEnabled?: () => boolean;
  };
}

function cjs(): CjsAny {
  return (window as unknown as { CJS?: CjsAny }).CJS ?? {};
}

interface FxEntry {
  el: HTMLElement;
  key: string;
  timer: number;
}

interface FxOpts {
  scale?: number;
  vars?: Record<string, string>;
  dedupeKey?: string;
  extraClass?: string;
  stackKey?: string;
  offsetY?: number;
  maxActive?: number;
}

const MAX_ACTIVE_FX = 24;

export class FxLayer {
  private fxLayerEl: HTMLDivElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private gridWrapEl: HTMLElement | null = null;
  private activeFx: FxEntry[] = [];
  private activeBanner: HTMLElement | null = null;
  private bannerTimer = 0;
  private fxSeq = 0;
  private unsubs: Array<() => void> = [];

  attach(
    fxLayerEl: HTMLDivElement,
    canvasEl: HTMLCanvasElement,
    gridWrapEl: HTMLElement
  ): void {
    this.detach();
    this.fxLayerEl = fxLayerEl;
    this.canvasEl = canvasEl;
    this.gridWrapEl = gridWrapEl;
    const bus = cjs().AnimationBus;
    if (!bus) return;
    this.unsubs.push(bus.on("damage", (p) => this.damageFlash(p as Record<string, unknown>)));
    this.unsubs.push(bus.on("hit", (p) => this.hit(p as Record<string, unknown>)));
    this.unsubs.push(bus.on("heal", (p) => this.healPulse(p as Record<string, unknown>)));
    this.unsubs.push(bus.on("miss", (p) => this.missCue(p as Record<string, unknown>)));
    this.unsubs.push(bus.on("unit_ko", (p) => this.koFade(p as Record<string, unknown>)));
    this.unsubs.push(bus.on("skill_cast", (p) => this.skillCast(p as Record<string, unknown>)));
    this.unsubs.push(bus.on("unit_move", (p) => this.unitMove(p as Record<string, unknown>)));
    this.unsubs.push(bus.on("turn_start", (p) => this.turnBanner(p as Record<string, unknown>)));
  }

  detach(): void {
    for (const off of this.unsubs) {
      try { off(); } catch { /* ignore */ }
    }
    this.unsubs = [];
    this.clearAll();
    this.fxLayerEl = null;
    this.canvasEl = null;
    this.gridWrapEl = null;
  }

  clearAll(): void {
    for (const entry of this.activeFx.slice()) {
      this.removeEntry(entry);
    }
    this.activeFx = [];
    this.fxSeq = 0;
    if (this.bannerTimer) {
      clearTimeout(this.bannerTimer);
      this.bannerTimer = 0;
    }
    if (this.activeBanner) {
      try { this.activeBanner.remove(); } catch { /* ignore */ }
      this.activeBanner = null;
    }
  }

  private enabled(): boolean {
    const cs = cjs().CombatSettings;
    return cs?.getAnimationsEnabled ? cs.getAnimationsEnabled() : true;
  }

  private cellSize(): number {
    return cjs().GridRenderer?.getCellSize?.() ?? 0;
  }

  private cellMetrics(pos: number[] | undefined) {
    if (!pos || !this.canvasEl) return null;
    const cell = this.cellSize();
    if (!cell) return null;
    const ox = this.canvasEl.offsetLeft || 0;
    const oy = this.canvasEl.offsetTop || 0;
    const [r, c] = pos;
    const left = c * cell + ox;
    const top = r * cell + oy;
    return {
      cell,
      left,
      top,
      centerX: left + cell / 2,
      centerY: top + cell / 2
    };
  }

  private themeVars(kind: string | undefined): Record<string, string> {
    const map: Record<string, { accent: string; glow: string; ring: string }> = {
      physical:  { accent: "rgba(255, 112, 112, 0.94)", glow: "rgba(255, 72, 72, 0.34)", ring: "rgba(255,255,255,0.16)" },
      fire:      { accent: "rgba(255, 140, 82, 0.96)", glow: "rgba(255, 102, 54, 0.42)", ring: "rgba(255, 214, 170, 0.22)" },
      ice:       { accent: "rgba(138, 220, 255, 0.96)", glow: "rgba(96, 184, 255, 0.36)", ring: "rgba(224, 246, 255, 0.22)" },
      lightning: { accent: "rgba(255, 236, 124, 0.98)", glow: "rgba(255, 214, 64, 0.42)", ring: "rgba(255, 248, 196, 0.22)" },
      water:     { accent: "rgba(110, 188, 255, 0.95)", glow: "rgba(72, 152, 255, 0.34)", ring: "rgba(196, 232, 255, 0.20)" },
      wind:      { accent: "rgba(192, 255, 224, 0.92)", glow: "rgba(122, 224, 176, 0.28)", ring: "rgba(232, 255, 244, 0.22)" },
      earth:     { accent: "rgba(224, 186, 126, 0.94)", glow: "rgba(164, 120, 74, 0.30)", ring: "rgba(255, 236, 208, 0.18)" },
      magic:     { accent: "rgba(194, 148, 255, 0.94)", glow: "rgba(156, 110, 255, 0.36)", ring: "rgba(240, 222, 255, 0.22)" },
      dark:      { accent: "rgba(160, 104, 224, 0.92)", glow: "rgba(92, 42, 168, 0.36)", ring: "rgba(220, 196, 255, 0.20)" },
      holy:      { accent: "rgba(255, 244, 168, 0.98)", glow: "rgba(255, 226, 124, 0.38)", ring: "rgba(255, 252, 224, 0.26)" },
      light:     { accent: "rgba(255, 244, 168, 0.98)", glow: "rgba(255, 226, 124, 0.38)", ring: "rgba(255, 252, 224, 0.26)" },
      ko:        { accent: "rgba(34, 39, 49, 0.86)", glow: "rgba(0, 0, 0, 0.42)", ring: "rgba(210, 222, 255, 0.12)" },
      move:      { accent: "rgba(136, 214, 255, 0.76)", glow: "rgba(96, 180, 255, 0.26)", ring: "rgba(220, 245, 255, 0.16)" }
    };
    const key = String(kind || "physical").toLowerCase();
    const chosen = map[key] || map.physical;
    return {
      "--cjs-fx-accent": chosen.accent,
      "--cjs-fx-glow": chosen.glow,
      "--cjs-fx-ring": chosen.ring
    };
  }

  private removeEntry(entry: FxEntry | null | undefined): void {
    if (!entry) return;
    try { clearTimeout(entry.timer); } catch { /* ignore */ }
    try { entry.el.remove(); } catch { /* ignore */ }
    this.activeFx = this.activeFx.filter((item) => item !== entry);
  }

  private spawnFx(cls: string, pos: number[] | undefined, ttl: number, opts: FxOpts = {}): HTMLDivElement | undefined {
    if (!this.enabled() || !this.fxLayerEl || !pos) return undefined;
    const metrics = this.cellMetrics(pos);
    if (!metrics) return undefined;
    const scale = typeof opts.scale === "number" ? Math.max(0.2, opts.scale) : 1;
    const size = metrics.cell * scale;
    const inset = (metrics.cell - size) / 2;
    const el = document.createElement("div");
    const extra = opts.extraClass ? ` ${opts.extraClass}` : "";
    el.className = `cjs-fx-cell ${cls}${extra}`;
    el.style.left = metrics.left + inset + "px";
    el.style.top = metrics.top + inset + "px";
    el.style.width = size + "px";
    el.style.height = size + "px";
    if (opts.vars) {
      for (const [name, value] of Object.entries(opts.vars)) {
        el.style.setProperty(name, value);
      }
    }

    const key = opts.dedupeKey || `${cls}:${pos[0]}:${pos[1]}`;
    const existing = this.activeFx.find((entry) => entry.key === key);
    if (existing) this.removeEntry(existing);
    while (this.activeFx.length >= (opts.maxActive || MAX_ACTIVE_FX)) {
      this.removeEntry(this.activeFx[0]);
    }

    this.fxLayerEl.appendChild(el);
    const entry: FxEntry = { el, key, timer: 0 };
    entry.timer = window.setTimeout(() => this.removeEntry(entry), ttl || 700);
    this.activeFx.push(entry);
    return el;
  }

  private spawnLabel(text: string, pos: number[] | undefined, ttl: number, opts: FxOpts = {}): void {
    if (!this.enabled() || !this.fxLayerEl || !pos || !text) return;
    const metrics = this.cellMetrics(pos);
    if (!metrics) return;
    const stackKey = opts.stackKey || `label:${pos[0]}:${pos[1]}`;
    const stackDepth = this.activeFx.filter((entry) => String(entry.key).startsWith(stackKey)).length;
    while (this.activeFx.length >= (opts.maxActive || MAX_ACTIVE_FX)) {
      this.removeEntry(this.activeFx[0]);
    }
    const el = document.createElement("div");
    const extra = opts.extraClass ? ` ${opts.extraClass}` : "";
    el.className = `cjs-fx-label${extra}`;
    el.textContent = text;
    el.style.left = metrics.centerX + "px";
    el.style.top = metrics.centerY + (opts.offsetY || 0) - stackDepth * 14 + "px";
    if (opts.vars) {
      for (const [name, value] of Object.entries(opts.vars)) {
        el.style.setProperty(name, value);
      }
    }
    this.fxLayerEl.appendChild(el);
    const entry: FxEntry = { el, key: `${stackKey}:${++this.fxSeq}`, timer: 0 };
    entry.timer = window.setTimeout(() => this.removeEntry(entry), ttl || 720);
    this.activeFx.push(entry);
  }

  private spawnTrace(from: number[], to: number[], ttl: number, opts: FxOpts = {}): void {
    if (!this.enabled() || !this.fxLayerEl || !from || !to) return;
    const start = this.cellMetrics(from);
    const end = this.cellMetrics(to);
    if (!start || !end) return;
    const dx = end.centerX - start.centerX;
    const dy = end.centerY - start.centerY;
    const length = Math.hypot(dx, dy);
    if (!length) return;
    const key = opts.dedupeKey || `trace:${from.join(",")}->${to.join(",")}`;
    const existing = this.activeFx.find((entry) => entry.key === key);
    if (existing) this.removeEntry(existing);
    while (this.activeFx.length >= (opts.maxActive || MAX_ACTIVE_FX)) {
      this.removeEntry(this.activeFx[0]);
    }
    const el = document.createElement("div");
    const extra = opts.extraClass ? ` ${opts.extraClass}` : "";
    el.className = `cjs-fx-trace${extra}`;
    el.style.left = start.centerX + "px";
    el.style.top = start.centerY + "px";
    el.style.width = `${Math.max(18, length)}px`;
    el.style.transform = `translateY(-50%) rotate(${Math.atan2(dy, dx)}rad)`;
    if (opts.vars) {
      for (const [name, value] of Object.entries(opts.vars)) {
        el.style.setProperty(name, value);
      }
    }
    this.fxLayerEl.appendChild(el);
    const entry: FxEntry = { el, key, timer: 0 };
    entry.timer = window.setTimeout(() => this.removeEntry(entry), ttl || 280);
    this.activeFx.push(entry);
  }

  private slashAngle(fromPos: number[] | undefined, toPos: number[] | undefined): number {
    if (!fromPos || !toPos) return -30;
    const dy = toPos[0] - fromPos[0];
    const dx = toPos[1] - fromPos[1];
    if (dx === 0 && dy === 0) return -30;
    return (Math.atan2(dy, dx) * 180) / Math.PI - 30;
  }

  private slashElementClass(element: string | undefined): string {
    const e = String(element || "").toLowerCase();
    if (e === "fire") return "tone-fire";
    if (e === "ice") return "tone-ice";
    if (e === "lightning") return "tone-lightning";
    if (e === "dark") return "tone-dark";
    if (e === "holy" || e === "light") return "tone-holy";
    return "";
  }

  private spawnSlash(pos: number[], angleDeg: number, extraClass: string, dedupeKey: string): void {
    if (!this.enabled() || !this.fxLayerEl || !pos) return;
    const metrics = this.cellMetrics(pos);
    if (!metrics) return;
    const key = dedupeKey || `slash:${pos[0]}:${pos[1]}`;
    const existing = this.activeFx.find((entry) => entry.key === key);
    if (existing) this.removeEntry(existing);
    while (this.activeFx.length >= MAX_ACTIVE_FX) {
      this.removeEntry(this.activeFx[0]);
    }
    const wrap = document.createElement("div");
    const classes = extraClass ? ` ${extraClass.trim()}` : "";
    wrap.className = `cjs-fx-cell cjs-fx-slash${classes}`;
    wrap.style.left = metrics.left + "px";
    wrap.style.top = metrics.top + "px";
    wrap.style.width = metrics.cell + "px";
    wrap.style.height = metrics.cell + "px";
    const streak = document.createElement("div");
    streak.className = "cjs-slash-streak";
    streak.style.setProperty("--cjs-slash-angle", angleDeg + "deg");
    wrap.appendChild(streak);
    this.fxLayerEl.appendChild(wrap);
    const entry: FxEntry = { el: wrap, key, timer: 0 };
    entry.timer = window.setTimeout(() => this.removeEntry(entry), 320);
    this.activeFx.push(entry);
  }

  private damageFlash(payload: Record<string, unknown>): void {
    const target = payload?.target as Record<string, unknown> | undefined;
    const attacker = payload?.attacker as Record<string, unknown> | undefined;
    const targetId = (target?.instanceId || target?.id || target?.baseId || "target") as string;
    const tone = (payload?.element || payload?.damageType || "physical") as string;
    const theme = this.themeVars(tone);
    if (attacker?.pos && target?.pos) {
      this.spawnTrace(attacker.pos as number[], target.pos as number[], payload?.isCritical ? 320 : 250, {
        dedupeKey: `trace-hit:${targetId}`,
        extraClass: payload?.damageType === "Magic" ? " is-magic" : "",
        vars: theme
      });
    }
    if ((payload?.amount as number) > 0) {
      this.spawnFx("cjs-fx-damage", target?.pos as number[], payload?.isCritical ? 360 : 280, {
        dedupeKey: `hit:${targetId}`,
        extraClass: payload?.isCritical ? "is-crit" : "",
        vars: theme
      });
      this.spawnLabel(`-${payload.amount}`, target?.pos as number[], payload?.isCritical ? 760 : 680, {
        stackKey: `label-dmg:${targetId}`,
        extraClass: payload?.isCritical ? " is-damage is-crit" : " is-damage",
        vars: theme
      });
      if (payload?.isCritical) {
        this.spawnLabel("CRIT", target?.pos as number[], 680, {
          stackKey: `label-crit:${targetId}`,
          extraClass: " is-crit-tag",
          vars: theme,
          offsetY: -18
        });
      }
    }
    if ((payload?.absorbed as number) > 0) {
      this.spawnFx("cjs-fx-guard", target?.pos as number[], 380, {
        dedupeKey: `guard:${targetId}`,
        vars: this.themeVars("light")
      });
      this.spawnLabel(`BLOCK ${payload.absorbed}`, target?.pos as number[], 660, {
        stackKey: `label-guard:${targetId}`,
        extraClass: " is-guard",
        vars: this.themeVars("light"),
        offsetY: 18
      });
    }
  }

  private hit(payload: Record<string, unknown>): void {
    if (!this.enabled() || !this.fxLayerEl) return;
    const target = payload?.target as Record<string, unknown> | undefined;
    const attacker = payload?.attacker as Record<string, unknown> | undefined;
    if (!target?.pos) return;
    const targetPos = target.pos as number[];
    const targetId = (target.instanceId || target.id || target.baseId || "target") as string;
    const targetTeam = target.team === "player" ? "player" : "enemy";
    this.spawnFx("cjs-fx-shake", targetPos, payload?.isCritical ? 420 : 360, {
      dedupeKey: `shake:${targetId}`,
      extraClass: `team-${targetTeam}${payload?.isCritical ? " is-critical" : ""}`
    });
    if (attacker?.pos) {
      const attackerPos = attacker.pos as number[];
      if (attackerPos[0] !== targetPos[0] || attackerPos[1] !== targetPos[1]) {
        const attackerTeam = attacker.team === "player" ? "player" : "enemy";
        this.spawnFx("cjs-fx-shake", attackerPos, 220, {
          dedupeKey: `lunge:${targetId}`,
          extraClass: `team-${attackerTeam}`,
          scale: 0.68
        });
      }
    }
    const angleDeg = this.slashAngle(attacker?.pos as number[] | undefined, targetPos);
    const elementClass = this.slashElementClass(payload?.element as string | undefined);
    const shapeClass = payload?.weaponShape === "weapon_pierce"
      ? "shape-pierce"
      : payload?.weaponShape === "weapon_blunt"
      ? "shape-blunt"
      : "";
    const extraClass = [elementClass, shapeClass].filter(Boolean).join(" ");
    this.spawnSlash(targetPos, angleDeg, extraClass, `slash:${targetId}`);
  }

  private healPulse(payload: Record<string, unknown>): void {
    const target = payload?.target as Record<string, unknown> | undefined;
    const targetId = (target?.instanceId || target?.id || target?.baseId || "target") as string;
    const theme = {
      "--cjs-fx-accent": "rgba(118, 235, 156, 0.96)",
      "--cjs-fx-glow": "rgba(86, 214, 132, 0.34)",
      "--cjs-fx-ring": "rgba(230, 255, 236, 0.22)"
    };
    this.spawnFx("cjs-fx-heal", target?.pos as number[] | undefined, 420, {
      dedupeKey: `heal:${targetId}`,
      vars: theme
    });
    this.spawnLabel(`+${payload?.amount || 0}`, target?.pos as number[] | undefined, 760, {
      stackKey: `label-heal:${targetId}`,
      extraClass: " is-heal",
      vars: theme
    });
  }

  private missCue(payload: Record<string, unknown>): void {
    const target = payload?.target as Record<string, unknown> | undefined;
    const attacker = payload?.attacker as Record<string, unknown> | undefined;
    const targetId = (target?.instanceId || target?.id || target?.baseId || "target") as string;
    const theme = {
      "--cjs-fx-accent": "rgba(212, 220, 232, 0.96)",
      "--cjs-fx-glow": "rgba(196, 208, 230, 0.22)",
      "--cjs-fx-ring": "rgba(248, 252, 255, 0.20)"
    };
    if (attacker?.pos && target?.pos) {
      this.spawnTrace(attacker.pos as number[], target.pos as number[], 240, {
        dedupeKey: `trace-miss:${targetId}`,
        extraClass: " is-miss",
        vars: theme
      });
    }
    this.spawnFx("cjs-fx-miss", target?.pos as number[] | undefined, 340, {
      dedupeKey: `miss:${targetId}`,
      vars: theme
    });
    this.spawnLabel("MISS", target?.pos as number[] | undefined, 720, {
      stackKey: `label-miss:${targetId}`,
      extraClass: " is-miss",
      vars: theme
    });
  }

  private koFade(payload: Record<string, unknown>): void {
    const unit = payload?.unit as Record<string, unknown> | undefined;
    const unitId = (unit?.instanceId || unit?.id || unit?.baseId || "unit") as string;
    this.spawnFx("cjs-fx-ko", unit?.pos as number[] | undefined, 700, {
      dedupeKey: `ko:${unitId}`,
      vars: this.themeVars("ko")
    });
  }

  private skillCast(payload: Record<string, unknown>): void {
    const skill = (payload?.skill as Record<string, unknown>) || {};
    const tone = (skill.element || skill.damageType || "magic") as string;
    const unit = payload?.unit as Record<string, unknown> | undefined;
    const unitId = (unit?.instanceId || unit?.id || unit?.baseId || "caster") as string;
    this.spawnFx("cjs-fx-cast", unit?.pos as number[] | undefined, 480, {
      dedupeKey: `cast:${unitId}`,
      extraClass: skill.damageType === "Magic" ? "is-magic" : "is-physical",
      vars: this.themeVars(tone)
    });
  }

  private unitMove(payload: Record<string, unknown>): void {
    const from = payload?.from as number[] | undefined;
    const to = payload?.to as number[] | undefined;
    const cell = this.cellSize();
    if (!from || !to || !cell) return;
    if (this.enabled() && cjs().GridRenderer?.animateUnitMove) {
      const dr = to[0] - from[0];
      const dc = to[1] - from[1];
      const steps = Math.max(Math.abs(dr), Math.abs(dc), 1);
      const dur = Math.max(220, Math.min(900, 120 * steps + 80));
      const unit = payload?.unit as Record<string, unknown> | undefined;
      const unitId = unit?.instanceId as string | undefined;
      if (unitId) cjs().GridRenderer!.animateUnitMove!(unitId, from, to, dur);
    }
    const dx = (to[1] - from[1]) * cell;
    const dy = (to[0] - from[0]) * cell;
    this.spawnFx("cjs-fx-move-trail", from, 340, {
      dedupeKey: `move:${from.join(",")}->${to.join(",")}`,
      vars: {
        ...this.themeVars("move"),
        "--cjs-travel-x": `${dx}px`,
        "--cjs-travel-y": `${dy}px`
      }
    });
    this.spawnFx("cjs-fx-move-arrive", to, 280, {
      dedupeKey: `move-arrive:${to.join(",")}`,
      vars: this.themeVars("move")
    });
    const dr = to[0] - from[0];
    const dc = to[1] - from[1];
    const steps = Math.max(Math.abs(dr), Math.abs(dc));
    for (let i = 1; i < steps; i++) {
      const r = from[0] + Math.round(dr * (i / steps));
      const c = from[1] + Math.round(dc * (i / steps));
      window.setTimeout(() => {
        this.spawnFx("cjs-fx-trail", [r, c], 260, {
          dedupeKey: `move-dot:${from.join(",")}->${to.join(",")}:${i}`,
          scale: 0.48
        });
      }, i * 55);
    }
  }

  private turnBanner(payload: Record<string, unknown>): void {
    if (!this.enabled() || !this.gridWrapEl) return;
    const unit = payload?.unit as Record<string, unknown> | undefined;
    if (!unit) return;
    if (this.bannerTimer) {
      clearTimeout(this.bannerTimer);
      this.bannerTimer = 0;
    }
    if (this.activeBanner) {
      try { this.activeBanner.remove(); } catch { /* ignore */ }
      this.activeBanner = null;
    }
    const banner = document.createElement("div");
    banner.className = "cjs-turn-banner team-" + (unit.team === "player" ? "player" : "enemy");
    banner.textContent = `Round ${payload?.round || 1} | ${unit.name || "Unit"}'s turn`;
    this.gridWrapEl.appendChild(banner);
    this.activeBanner = banner;
    this.bannerTimer = window.setTimeout(() => {
      if (this.activeBanner === banner) this.activeBanner = null;
      try { banner.remove(); } catch { /* ignore */ }
      this.bannerTimer = 0;
    }, 1200);
  }
}
