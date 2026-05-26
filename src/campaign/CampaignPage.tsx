import { CampaignShell } from "./CampaignShell";

// Campaign mode entry point. CampaignShell owns the entire chrome
// (header, mode bar, sub-tabs, recent log strip, body, command rail,
// drawer) and boots the vanilla `CampaignUI.init()` in React-shell mode.
// The old portal-based `CampaignReactTabs` bridge is no longer needed
// because the shell mounts React tab components inline.
export function CampaignPage() {
  return <CampaignShell />;
}
