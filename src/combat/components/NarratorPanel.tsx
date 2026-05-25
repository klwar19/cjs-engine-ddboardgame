// NarratorPanel — narration feed driven by NarratorEngine. Each subscription
// payload may contain multiple lines (split on '\n'); the store has
// already stripped [CJS] editorial lines.

import { useLayoutEffect, useRef } from "react";
import { useNarratorLines } from "../store";

export function NarratorPanel() {
  const lines = useNarratorLines();
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div id="cbt-narrator" className="narrator-panel" ref={ref}>
      {lines.map((block, idx) => (
        <div key={idx} className="narrator-line">
          {block.split("\n").map((para, p) => (
            <p key={p}>{para}</p>
          ))}
        </div>
      ))}
    </div>
  );
}
