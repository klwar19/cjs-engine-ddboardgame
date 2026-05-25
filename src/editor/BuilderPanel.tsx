// BuilderPanel — generic React wrapper around the vanilla js/builders/*
// modules. Each builder exposes `init(panelEl)` and `refresh()`. We:
//  1. Mount the builder's DOM tree into a host <div> the first time the
//     panel becomes active.
//  2. Call refresh() on every subsequent activation (data may have
//     changed in another panel).

import { useEffect, useRef } from "react";
import { builderFor, type PanelId } from "./editorTypes";

interface Props {
  readonly panel: PanelId;
  readonly active: boolean;
}

export function BuilderPanel({ panel, active }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const initedRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    const host = hostRef.current;
    if (!host) return;
    const builder = builderFor(panel);
    if (!builder) {
      // Builder modules are loaded by src/editor/main.tsx; if one is
      // missing we want the panel to be visibly empty rather than crash.
      host.textContent = `Builder not available: ${panel}`;
      return;
    }
    if (!initedRef.current) {
      builder.init(host);
      initedRef.current = true;
    } else if (builder.refresh) {
      builder.refresh();
    }
  }, [active, panel]);

  return (
    <div
      className={`editor-panel${active ? " active" : ""}`}
      id={`panel-${panel}`}
      ref={hostRef}
    />
  );
}
