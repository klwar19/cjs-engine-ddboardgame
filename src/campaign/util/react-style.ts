import type { CSSProperties } from "react";

export function cssTextToReactStyle(style: string): CSSProperties {
  const out: Record<string, string> = {};
  for (const part of String(style || "").split(";")) {
    const [rawKey, ...rawValue] = part.split(":");
    const value = rawValue.join(":").trim();
    if (!rawKey || !value) continue;
    const key = rawKey
      .trim()
      .replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
    out[key] = value;
  }
  return out as CSSProperties;
}
