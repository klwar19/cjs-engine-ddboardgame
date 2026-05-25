import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCampaignState, type CampaignStateSnapshot } from "./store";
import { CampaignSettingsTab } from "./tabs/CampaignSettingsTab";
import { CampaignLogsTab } from "./tabs/CampaignLogsTab";

// Registry of React components that own a migrated campaign tab. The
// matching vanilla-side tab registration lives in
// `js/campaign/ui/tabs/cui-react-bridge.js`; the ids must agree.
const REACT_TAB_COMPONENTS: Readonly<
  Record<string, (props: { state: CampaignStateSnapshot }) => React.ReactNode>
> = {
  settings: (props) => <CampaignSettingsTab {...props} />,
  logs: (props) => <CampaignLogsTab {...props} />
};

// Bridges React-owned tabs into the vanilla shell. After every vanilla
// re-render, the legacy shell dispatches `campaign:rendered` on the
// campaign-root; we react by re-querying the DOM for each migrated tab's
// stable mount-point div and portaling the matching component into it.
//
// Portals tolerate vanilla swapping the mount node out from under us
// because we re-query on every render: when the placeholder is gone the
// portal entry is just dropped from the tree, and when a fresh
// placeholder reappears a new portal is created.
export function CampaignReactTabs() {
  const { state } = useCampaignState();
  const [renderTick, setRenderTick] = useState(0);

  // Bump the tick whenever the vanilla shell finishes painting so our
  // `document.getElementById` lookups happen against the freshly-built
  // DOM. We listen at the document level because campaign-root is
  // created by React itself (CampaignPage) and we don't have a ref to it
  // here — the event bubble path crosses through `document` for
  // CustomEvents with bubbles:true. The vanilla emit currently uses
  // bubbles:false, so we explicitly listen on `document` with capture.
  useEffect(() => {
    const onRendered = () => setRenderTick((t) => t + 1);
    // The vanilla `render()` dispatches the event on `_root` directly.
    // Use capture so we catch it regardless of whether bubbles is set.
    document.addEventListener("campaign:rendered", onRendered, true);
    return () => {
      document.removeEventListener("campaign:rendered", onRendered, true);
    };
  }, []);

  if (!state) return null;
  // The tick is read implicitly via the re-render trigger; reference it
  // here so the linter knows it's intentional.
  void renderTick;

  const tabIds = Object.keys(REACT_TAB_COMPONENTS);
  return (
    <>
      {tabIds.map((id) => {
        const mount = document.getElementById(`campaign-react-tab-${id}`);
        if (!mount) return null;
        const Component = REACT_TAB_COMPONENTS[id];
        return createPortal(<Component state={state} />, mount, id);
      })}
    </>
  );
}
