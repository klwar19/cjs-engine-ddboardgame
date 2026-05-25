// GmControlsPanel — collapsible wrapper around the vanilla GMControls
// mount(). The legacy module still owns its own DOM tree; React just
// gives it a host element and forwards refresh / hint callbacks.

import { useEffect, useRef } from "react";

interface CjsAny {
  GMControls?: {
    mount: (
      host: HTMLElement,
      opts: { onRefresh?: () => void; onHint?: (text: string) => void; onClearHint?: () => void }
    ) => void;
    unmount: () => void;
  };
  CombatManager?: { notify?: () => void };
}

function cjs(): CjsAny {
  return (window as unknown as { CJS?: CjsAny }).CJS ?? {};
}

interface Props {
  readonly onHint: (text: string) => void;
  readonly onClearHint: () => void;
}

export function GmControlsPanel({ onHint, onClearHint }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const gm = cjs().GMControls;
    if (!host || !gm) return;
    gm.mount(host, {
      onRefresh: () => cjs().CombatManager?.notify?.(),
      onHint,
      onClearHint
    });
    return () => {
      try { cjs().GMControls?.unmount?.(); } catch { /* ignore */ }
    };
    // onHint / onClearHint refs are stable per CombatScreen mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <details className="combat-assist-menu gm-menu">
      <summary className="combat-assist-summary">GM Controls</summary>
      <div id="cbt-gm-panel" className="combat-assist-panel" ref={hostRef} />
    </details>
  );
}
