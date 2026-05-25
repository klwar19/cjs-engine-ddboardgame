// CombatScreen — replaces the legacy combat-ui.js. Composes all the React
// panels and owns the imperative pieces (controller, FX layer, weather
// FX, keyboard handler) that talk to the vanilla engine modules.
//
// Lifecycle: parent (CombatPage) calls into the engine's startCombat /
// reset / runUntilInput; CombatScreen subscribes to CombatManager,
// CombatLog, and NarratorEngine through the store and renders.

import { useEffect, useMemo, useRef, useState } from "react";
import { combatStore } from "../store";
import { CombatController } from "../combatController";
import { FxLayer } from "../fxLayer";
import { WeatherFx } from "../weatherFx";
import { CombatGrid } from "./CombatGrid";
import { CombatTopBar } from "./CombatTopBar";
import { ActorPanel } from "./ActorPanel";
import { ActionBar } from "./ActionBar";
import { CombatLog } from "./CombatLog";
import { NarratorPanel } from "./NarratorPanel";
import { BgmControls } from "./BgmControls";
import { BattleAssist } from "./BattleAssist";
import { GmControlsPanel } from "./GmControlsPanel";
import { BattleEndPanel } from "./BattleEndPanel";
import { ModeHint } from "./ModeHint";
import { useCombatVersion } from "../store";

interface CjsAny {
  CombatManager?: {
    getState?: () => { phase?: string } | null;
    notify?: () => void;
  };
  GMControls?: {
    isToolActive?: () => boolean;
    cancelTool?: () => void;
  };
  CombatSettings?: {
    isAutoActive?: () => boolean;
    stopAuto?: () => unknown;
  };
}

function cjs(): CjsAny {
  return (window as unknown as { CJS?: CjsAny }).CJS ?? {};
}

export interface CombatScreenHandle {
  readonly logMessage: (text: string, type: string) => void;
}

interface Props {
  readonly themeImage?: string;
  readonly onReturnToSetup?: () => void;
  readonly onRestart?: () => void;
}

export function CombatScreen({ themeImage, onReturnToSetup, onRestart }: Props) {
  const version = useCombatVersion();
  const controllerRef = useRef<CombatController | null>(null);
  const fxLayerRef = useRef<FxLayer | null>(null);
  const weatherFxRef = useRef<WeatherFx | null>(null);
  const qteOverlayRef = useRef<HTMLDivElement | null>(null);
  // Local fallback log channel — used for action-failed messages that the
  // engine's CombatLog doesn't surface (e.g. validation errors before the
  // action is even submitted).
  const [localLog, setLocalLog] = useState<Array<{ text: string; type: string }>>([]);

  // Build (and stabilise) the controller, fxLayer, weatherFx instances for
  // the lifetime of this CombatScreen mount.
  if (!controllerRef.current) controllerRef.current = new CombatController();
  if (!fxLayerRef.current) fxLayerRef.current = new FxLayer();
  if (!weatherFxRef.current) weatherFxRef.current = new WeatherFx();

  const controller = controllerRef.current;
  const fxLayer = fxLayerRef.current;
  const weatherFx = weatherFxRef.current;

  const logMessage = useMemo(
    () =>
      (text: string, type: string) => {
        // Push to local log channel so the user sees action errors. Capped
        // to 200 entries like the legacy log.
        setLocalLog((cur) => {
          const next = [...cur, { text, type }];
          while (next.length > 50) next.shift();
          return next;
        });
      },
    []
  );

  // Wire the QTE overlay into the controller exactly once.
  useEffect(() => {
    controller.setQteOverlay(qteOverlayRef.current);
  }, [controller]);

  // Global keyboard: Esc cancels GM tool / click mode.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const gm = cjs().GMControls;
      if (gm?.isToolActive?.()) {
        gm.cancelTool?.();
        cjs().CombatManager?.notify?.();
        return;
      }
      const mode = controller.getState().mode;
      if (mode !== "idle" && mode !== "qte") {
        controller.cancel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [controller]);

  // The store updates a single version counter on each engine notify;
  // most child components read that via useCombatVersion. We additionally
  // hide ActionBar during battle_end so it doesn't fight BattleEndPanel
  // for the same slot.
  const state = cjs().CombatManager?.getState?.();
  const battleEnd = state?.phase === "battle_end";
  void version;

  return (
    <div className="combat-screen">
      <CombatTopBar />
      <div className="combat-middle">
        <CombatGrid
          controller={controller}
          fxLayer={fxLayer}
          weatherFx={weatherFx}
          themeImage={themeImage}
          onLog={logMessage}
        />
        <div className="combat-sidebar">
          <BgmControls />
          <ActorPanel />
          {battleEnd ? (
            <BattleEndPanel
              showReturnButton={!!onReturnToSetup}
              onReturn={() => onReturnToSetup?.()}
              onRestart={() => onRestart?.()}
            />
          ) : (
            <>
              <ActionBar controller={controller} />
              <ModeHint controller={controller} />
            </>
          )}
          <BattleAssist />
          <GmControlsPanel
            onHint={(text) => controller.setHint(text)}
            onClearHint={() => controller.setHint("")}
          />
        </div>
      </div>
      <div className="combat-bottom">
        <NarratorPanel />
        <CombatLog />
        {localLog.length > 0 ? (
          <div className="combat-local-log" aria-live="polite">
            {localLog.slice(-5).map((entry, idx) => (
              <div key={idx} className={`log-entry log-${entry.type}`}>
                {entry.text}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div
        id="cbt-qte-overlay"
        className="qte-overlay"
        ref={qteOverlayRef}
        style={{ display: "none" }}
      />
    </div>
  );
}

// Module-level helper so CombatPage can clear the combat feed before
// starting a new battle without reaching into the store directly.
export function resetCombatFeed(): void {
  combatStore.resetFeed();
}
