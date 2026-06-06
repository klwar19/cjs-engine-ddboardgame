// lazy-l2d.ts — defer the campaign companion dock code and CSS off first paint.
let pending: Promise<void> | null = null;

export function ensureCampaignL2d(): Promise<void> {
  if (!pending) {
    pending = (async () => {
      await import("../../css/l2d-avatar.css");
      await import("../engine/ui/l2d-avatar");
      await import("../engine/ui/l2d-companion");
    })();
  }
  return pending;
}
