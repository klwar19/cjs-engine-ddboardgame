import { useEffect, useRef, useState } from "react";
import { CampaignHelpPopover } from "./HelpPopover";
import { CampaignReactTabs } from "./CampaignReactTabs";

interface CampaignCjs {
  readonly CampaignUI?: {
    readonly init: (root: HTMLElement) => Promise<void> | void;
  };
  readonly ScenePlayer?: { readonly wireCampaign?: () => void };
  readonly CampaignSequenceVN?: { readonly init?: () => void };
  readonly L2DCompanion?: {
    readonly init?: (opts: { mode: string }) => Promise<void>;
  };
}

function getCampaignCjs(): CampaignCjs {
  return (window as unknown as { CJS?: CampaignCjs }).CJS ?? {};
}

export function CampaignPage() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  // Boot once on mount: wait for vanilla CJS modules to self-register, then
  // hand the campaign-root container to CampaignUI.init, exactly as the
  // legacy inline script did.
  useEffect(() => {
    let cancelled = false;
    let tries = 0;

    const boot = async () => {
      if (cancelled) return;
      const cjs = getCampaignCjs();
      if (!cjs.CampaignUI?.init) {
        tries += 1;
        if (tries > 100) {
          setBootError("CJS.CampaignUI never initialised");
          return;
        }
        window.setTimeout(() => void boot(), 40);
        return;
      }
      const mount = rootRef.current;
      if (!mount) {
        setBootError("Campaign mount node not found");
        return;
      }
      try {
        await cjs.CampaignUI.init(mount);
        cjs.ScenePlayer?.wireCampaign?.();
        cjs.CampaignSequenceVN?.init?.();
        if (cjs.L2DCompanion?.init) {
          cjs.L2DCompanion
            .init({ mode: "campaign" })
            .catch((err: unknown) => console.warn("L2D init:", err));
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("Campaign init failed:", error);
        setBootError(msg);
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  // Render the campaign-root with seeded HTML and let the imperative
  // CampaignUI take over its children. dangerouslySetInnerHTML hands React
  // an initial payload it won't try to reconcile again, so CampaignUI's
  // replacements don't fight React.
  const initialHtml = bootError
    ? `<div class="campaign-loading">${escapeHtml(bootError)}</div>`
    : '<div class="campaign-loading">Loading Campaign Mode...</div>';

  return (
    <>
      <div
        id="campaign-root"
        className="campaign-root"
        ref={rootRef}
        dangerouslySetInnerHTML={{ __html: initialHtml }}
      />
      <CampaignReactTabs />
      <CampaignHelpPopover />
    </>
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return ch;
    }
  });
}
