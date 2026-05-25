// CombatTopBar — weather banner + objective banner + initiative bar.

import { useCombatVersion } from "../store";
import { escHtml, portraitHtml } from "../uiHelpers";

interface CjsAny {
  CombatManager?: {
    getInitiativeOrder?: () => Array<Record<string, unknown>>;
    getState?: () => Record<string, unknown> | null;
  };
  CombatObjectives?: {
    describe?: (
      tracker: unknown,
      state: unknown
    ) => { kind: string; broken?: boolean; icon?: string; title?: string; detail?: string; progressPct?: number };
  };
  Weather?: {
    getDef: (id: string) => { id?: string; name?: string; icon?: string; description?: string } | null;
  };
}

function cjs(): CjsAny {
  return (window as unknown as { CJS?: CjsAny }).CJS ?? {};
}

export function CombatTopBar() {
  useCombatVersion();
  const cm = cjs().CombatManager;
  const state = cm?.getState?.() || null;

  return (
    <div className="combat-top">
      <WeatherBanner state={state} />
      <ObjectiveBanner state={state} />
      <InitiativeBar />
    </div>
  );
}

function WeatherBanner({ state }: { state: Record<string, unknown> | null }) {
  const env = state?.environment as { id?: string; remaining?: number } | undefined;
  const WX = cjs().Weather;
  const isActive = !!(env && env.id !== "normal" && (env.remaining || 0) > 0 && WX);
  if (!isActive || !env?.id) {
    return <div id="cbt-weather" className="weather-banner" hidden />;
  }
  const def =
    WX?.getDef(env.id) || { id: env.id, name: env.id, icon: "🌫", description: "" };
  return (
    <div
      id="cbt-weather"
      className={`weather-banner weather-${env.id}`}
      hidden={false}
    >
      <span className="weather-icon" aria-hidden="true">
        {def.icon || "🌫"}
      </span>
      <span className="weather-name">{def.name || env.id}</span>
      <span className="weather-remaining">
        {env.remaining} turn{env.remaining === 1 ? "" : "s"} left
      </span>
      <span className="weather-desc">{def.description || ""}</span>
    </div>
  );
}

function ObjectiveBanner({ state }: { state: Record<string, unknown> | null }) {
  const tracker = state?.objective;
  const OBJ = cjs().CombatObjectives;
  if (!tracker || !OBJ?.describe) {
    return <div id="cbt-objective" className="combat-objective-banner" hidden />;
  }
  const info = OBJ.describe(tracker, state);
  const cls = info.broken ? " is-contested" : "";
  const pct = Math.max(0, Math.min(100, Number(info.progressPct || 0)));
  return (
    <div
      id="cbt-objective"
      className={`combat-objective-banner objective-${info.kind}${cls}`}
    >
      <span className="objective-icon" aria-hidden="true">
        {info.icon || "⚔"}
      </span>
      <div className="objective-body">
        <div className="objective-title">{info.title || ""}</div>
        {info.detail ? (
          <div className="objective-detail">{info.detail}</div>
        ) : null}
      </div>
      <div
        className="objective-meter"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="objective-meter-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function InitiativeBar() {
  const cm = cjs().CombatManager;
  const state = cm?.getState?.() || null;
  const order = cm?.getInitiativeOrder?.() ?? [];
  const currentUnitId = state?.currentUnitId as string | undefined;
  return (
    <div id="cbt-initiative" className="initiative-bar">
      {order.map((unit) => {
        if (!unit) return null;
        const u = unit as {
          instanceId?: string;
          currentHP?: number;
          maxHP?: number;
          team?: string;
          name?: string;
          baseId?: string;
          portrait?: string;
          icon?: string;
          portraitFocus?: unknown;
        };
        const active = u.instanceId === currentUnitId;
        const dead = (u.currentHP || 0) <= 0;
        const teamClass = u.team === "player" ? "init-player" : "init-enemy";
        const classes = `init-unit ${teamClass}${active ? " init-active" : ""}${dead ? " init-dead" : ""}`;
        const hpPct = Math.round(
          ((u.currentHP || 0) / (u.maxHP || 1)) * 100
        );
        const portrait = portraitHtml({
          path: u.portrait,
          imageClass: "init-portrait",
          fallbackClass: "init-icon",
          icon: u.icon || "?",
          focus: u.portraitFocus
        });
        const title = `${u.name || u.baseId || "?"} (${u.currentHP || 0}/${u.maxHP || 0} HP)`;
        return (
          <div
            key={u.instanceId}
            className={classes}
            title={title}
          >
            <span dangerouslySetInnerHTML={{ __html: portrait }} />
            <span className="init-name">
              {(u.name || u.baseId || "?").substring(0, 6)}
            </span>
            <div className="init-hp-bar">
              <div className="init-hp-fill" style={{ width: `${hpPct}%` }} />
            </div>
          </div>
        );
      })}
      {/*
        We escape the title via dangerouslySetInnerHTML so the React tree
        emits identical markup to the vanilla template. escHtml is only
        used by direct string consumers; React handles attribute escaping
        for the title prop on its own.
      */}
      <i style={{ display: "none" }} aria-hidden="true">
        {escHtml("")}
      </i>
    </div>
  );
}
