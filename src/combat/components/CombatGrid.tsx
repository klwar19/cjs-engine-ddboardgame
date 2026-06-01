// CombatGrid — owns the <canvas> + zoom controls + FX layers. Initialises
// the vanilla GridRenderer on mount and tears it down on unmount.

import { useEffect, useRef, useState } from "react";
import { FxLayer } from "../fxLayer";
import { WeatherFx } from "../weatherFx";
import type { CombatController } from "../combatController";
import { useCombatVersion } from "../store";
import { getLauncherVisibility, onLauncherVisibilityChange } from "../../shared/embed";

interface CjsAny {
  GridRenderer?: {
    init: (canvas: HTMLCanvasElement, opts: { cellSize?: number; onCellClick?: (r: number, c: number) => void; onCellHover?: (r: number, c: number) => void }) => void;
    destroy: () => void;
    resize: () => void;
    zoomIn: () => number;
    zoomOut: () => number;
    resetZoom: () => number;
    getZoom: () => number;
    getZoomBounds: () => { min: number; max: number };
    setPaused?: (paused: boolean) => void;
    setSelectedUnit?: (id: string | null) => void;
    clearMoveAnimations?: () => void;
    setTheme?: (opts: { image?: string }) => void;
  };
  CombatManager?: {
    getCurrentUnit?: () => { instanceId?: string } | null;
    getState?: () => Record<string, unknown> | null;
  };
  Weather?: { getDef: (id: string) => { id?: string; name?: string; icon?: string; description?: string } | null };
}

function cjs(): CjsAny {
  return (window as unknown as { CJS?: CjsAny }).CJS ?? {};
}

interface Props {
  readonly controller: CombatController;
  readonly fxLayer: FxLayer;
  readonly weatherFx: WeatherFx;
  readonly themeImage?: string;
  readonly onLog: (text: string, type: string) => void;
}

export function CombatGrid({ controller, fxLayer, weatherFx, themeImage, onLog }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const fxLayerRef = useRef<HTMLDivElement | null>(null);
  const weatherFxRef = useRef<HTMLDivElement | null>(null);
  const [zoomLabel, setZoomLabel] = useState("100%");
  const [zoomInDisabled, setZoomInDisabled] = useState(false);
  const [zoomOutDisabled, setZoomOutDisabled] = useState(false);
  const version = useCombatVersion();

  // Mount GridRenderer on the canvas + attach FX subsystems.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const fxEl = fxLayerRef.current;
    const weatherEl = weatherFxRef.current;
    if (!canvas || !wrap || !fxEl || !weatherEl) return;

    cjs().GridRenderer?.init(canvas, {
      cellSize: 64,
      onCellClick: (r, c) => {
        void controller.handleCellClick(r, c, onLog);
      },
      onCellHover: (r, c) => {
        controller.handleCellHover(r, c);
      }
    });
    cjs().GridRenderer?.resize();
    cjs().GridRenderer?.clearMoveAnimations?.();
    cjs().GridRenderer?.setPaused?.(!getLauncherVisibility().active);
    fxLayer.attach(fxEl, canvas, wrap);
    weatherFx.attach(weatherEl);

    updateZoomLabel();
    const onResize = () => {
      cjs().GridRenderer?.resize();
      updateZoomLabel();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      try { fxLayer.detach(); } catch { /* ignore */ }
      try { weatherFx.detach(); } catch { /* ignore */ }
      try { cjs().GridRenderer?.destroy?.(); } catch { /* ignore */ }
    };
    // The controller / fxLayer instances are stable for the screen's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Launcher iframes stay mounted after switching away. Stop the canvas RAF
  // while hidden, then resize on resume in case the frame was restored on a
  // different viewport or sidebar width.
  useEffect(() => {
    const applyVisibility = (active: boolean) => {
      const renderer = cjs().GridRenderer;
      renderer?.setPaused?.(!active);
      if (active) {
        renderer?.resize?.();
        updateZoomLabel();
      }
    };
    applyVisibility(getLauncherVisibility().active);
    return onLauncherVisibilityChange((detail) => applyVisibility(detail.active));
  }, []);

  // Apply theme image when it changes.
  useEffect(() => {
    if (themeImage && cjs().GridRenderer?.setTheme) {
      cjs().GridRenderer.setTheme({ image: themeImage });
    }
  }, [themeImage]);

  // Each engine refresh: update the highlighted unit + render the active
  // weather effect.
  useEffect(() => {
    const cm = cjs().CombatManager;
    const unit = cm?.getCurrentUnit?.();
    cjs().GridRenderer?.setSelectedUnit?.(unit?.instanceId || null);
    const state = cm?.getState?.();
    const env = state?.environment as { id?: string; remaining?: number } | undefined;
    const WX = cjs().Weather;
    const isActive = !!(env && env.id !== "normal" && (env.remaining || 0) > 0 && WX);
    weatherFx.apply(isActive && env?.id ? env.id : null);
  }, [version, weatherFx]);

  function updateZoomLabel() {
    const gr = cjs().GridRenderer;
    if (!gr) return;
    const z = gr.getZoom?.() ?? 1;
    setZoomLabel(Math.round(z * 100) + "%");
    const bounds = gr.getZoomBounds?.() ?? { min: 0.5, max: 2.5 };
    setZoomInDisabled(z >= bounds.max - 0.001);
    setZoomOutDisabled(z <= bounds.min + 0.001);
  }

  return (
    <div className="combat-grid-wrap" ref={wrapRef}>
      <canvas id="cbt-canvas" ref={canvasRef} />
      <div
        id="cbt-weather-fx"
        className="cjs-weather-fx"
        aria-hidden="true"
        ref={weatherFxRef}
      />
      <div id="cbt-fx-layer" className="cjs-fx-layer" ref={fxLayerRef} />
      <div className="combat-zoom-controls" role="group" aria-label="Board zoom">
        <button
          id="btn-zoom-out"
          type="button"
          className="combat-zoom-btn"
          title="Zoom out"
          aria-label="Zoom out"
          disabled={zoomOutDisabled}
          onClick={() => {
            cjs().GridRenderer?.zoomOut?.();
            updateZoomLabel();
          }}
        >
          &minus;
        </button>
        <span
          id="cbt-zoom-level"
          className="combat-zoom-level"
          aria-live="polite"
        >
          {zoomLabel}
        </span>
        <button
          id="btn-zoom-in"
          type="button"
          className="combat-zoom-btn"
          title="Zoom in"
          aria-label="Zoom in"
          disabled={zoomInDisabled}
          onClick={() => {
            cjs().GridRenderer?.zoomIn?.();
            updateZoomLabel();
          }}
        >
          +
        </button>
        <button
          id="btn-zoom-reset"
          type="button"
          className="combat-zoom-btn"
          title="Reset zoom"
          aria-label="Reset zoom"
          onClick={() => {
            cjs().GridRenderer?.resetZoom?.();
            updateZoomLabel();
          }}
        >
          &#x21BA;
        </button>
      </div>
    </div>
  );
}
