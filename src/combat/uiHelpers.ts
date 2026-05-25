// Small helpers shared across the combat React components: status icons,
// portrait markup, entity icons. These mirror the helpers that lived
// privately inside the original combat-ui.js so the visual output of the
// React tree matches the vanilla version exactly.

interface CjsAny {
  UIIcons?: { renderIcon: (entity: unknown, opts: { kind: string; size: string }) => string };
  PortraitPicker?: {
    bustedSrc?: (path: string) => string;
    focusStyle?: (focus: unknown) => string;
  };
}

function cjs(): CjsAny {
  return (window as unknown as { CJS?: CjsAny }).CJS ?? {};
}

export function statusIcon(id: string): string {
  const icons: Record<string, string> = {
    burn: "B",
    poison: "P",
    bleed: "L",
    stun: "S",
    freeze: "F",
    sleep: "Z",
    silence: "Q",
    regen: "+",
    shield: "#",
    haste: "H",
    berserk: "!",
    slow: "-",
    root: "R",
    blind: "O",
    confuse: "?",
    fear: "!",
    charm: "C",
    doom: "D",
    taunt: "T",
    petrify: "X"
  };
  return icons[id] || "*";
}

export function renderEntityIconHtml(entity: unknown, kind: string, size: string): string {
  const I = cjs().UIIcons;
  if (I?.renderIcon) return I.renderIcon(entity || {}, { kind, size });
  const fb = (entity as { icon?: string })?.icon || (kind === "item" ? "🎁" : "⚔️");
  return `<span class="cjs-icon cjs-icon-${size}">${escHtml(fb)}</span>`;
}

export function escHtml(value: unknown): string {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char] as string);
}

export interface PortraitProps {
  readonly path?: string;
  readonly imageClass: string;
  readonly fallbackClass: string;
  readonly icon?: string;
  readonly focus?: unknown;
}

export function portraitHtml(props: PortraitProps): string {
  const { path, imageClass, fallbackClass, icon, focus } = props;
  if (!path) {
    return `<span class="${fallbackClass}">${escHtml(icon || "?")}</span>`;
  }
  const PP = cjs().PortraitPicker;
  const src = PP?.bustedSrc ? PP.bustedSrc(path) : path;
  const style = PP?.focusStyle ? PP.focusStyle(focus) : "";
  return `<img src="${escHtml(src)}" class="${imageClass}" style="${escHtml(style)}" onerror="this.style.display='none';this.nextElementSibling.style.display=''" alt=""><span class="${fallbackClass}" style="display:none">${escHtml(icon || "?")}</span>`;
}
