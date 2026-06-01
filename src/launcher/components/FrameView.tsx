import { useCallback, useEffect, useRef, useState } from "react";
import { MODES, buildIframeUrl, type ModeId } from "../modes";
import { LAUNCHER_VISIBILITY_EVENT } from "../../shared/embed";

interface FrameViewProps {
  readonly mode: ModeId;
  readonly active: boolean;
}

// One iframe per visited mode. Stays mounted across mode switches so audio,
// in-memory campaign state, and modals survive when the user comes back.
export function FrameView({ mode, active }: FrameViewProps) {
  const [loaded, setLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const postVisibility = useCallback((isActive: boolean) => {
    const el = iframeRef.current;
    if (!el) return;
    const targetOrigin = window.location.origin === "null" ? "*" : window.location.origin;
    el.contentWindow?.postMessage(
      { type: LAUNCHER_VISIBILITY_EVENT, mode, active: isActive },
      targetOrigin
    );
  }, [mode]);

  useEffect(() => {
    if (loaded) postVisibility(active);
  }, [active, loaded, postVisibility]);

  const handleLoad = useCallback(() => {
    setLoaded(true);
    postVisibility(active);
  }, [active, postVisibility]);

  const className = `launcher-frame${active ? " is-active" : ""}`;

  return (
    <>
      <iframe
        ref={iframeRef}
        className={className}
        title={MODES[mode].title}
        name={`launcher-frame-${mode}`}
        data-mode={mode}
        data-active={active ? "1" : "0"}
        data-loaded={loaded ? "1" : "0"}
        aria-hidden={!active}
        tabIndex={active ? 0 : -1}
        allow="autoplay; clipboard-read; clipboard-write"
        loading="lazy"
        src={buildIframeUrl(mode)}
        onLoad={handleLoad}
      />
      {active && !loaded && (
        <div className="launcher-frame-status" role="status">
          Loading {MODES[mode].label}...
        </div>
      )}
    </>
  );
}
