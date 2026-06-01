export const LAUNCHER_VISIBILITY_EVENT = "cjs:launcher-visibility";

export interface LauncherVisibilityDetail {
  readonly active: boolean;
  readonly mode?: string;
  readonly source: "launcher";
}
