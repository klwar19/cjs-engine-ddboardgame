import { useEffect, useRef, useState } from "react";
import { MODES, buildIframeUrl, type ModeId } from "../modes";

interface FrameViewProps {
  readonly mode: ModeId;
  readonly active: boolean;
}

// One iframe per visited mode. Stays mounted across mode switches so audio,
// in-memory campaign state, and modals survive when the user comes back.
export function FrameView({ mode, active }: FrameViewProps) {
  const [loaded, setLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const el = iframeRef.current;
    if (!el) return;
    const onLoad = () => setLoaded(true);
    el.addEventListener("load", onLoad);
    return () => el.removeEventListener("load", onLoad);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      className="launcher-frame"
      title={MODES[mode].title}
      name={`launcher-frame-${mode}`}
      data-mode={mode}
      data-loaded={loaded ? "1" : "0"}
      allow="autoplay; clipboard-read; clipboard-write"
      loading="lazy"
      src={buildIframeUrl(mode)}
      hidden={!active}
    />
  );
}
