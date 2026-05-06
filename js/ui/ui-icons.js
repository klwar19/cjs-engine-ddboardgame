// ui-icons.js
// Centralized icon/symbol rendering for skills, passives, items, jobs, etc.
//
// Each entity may carry an `icon` field that is one of:
//   - emoji / unicode glyph: "⚔️", "🔮", "💚📿"
//   - short text label:      "Tent", "Potion"
//   - image URL / data URI:  "images/items/sword.png", "data:image/png;base64,..."
//   - data URL (uploaded):   captured by the editor's image input
//
// Future-friendly: the same field accepts uploaded images. UIIcons.normalize()
// returns a structured token { kind, value } so renderers don't need to know.
//
// Usage:
//   UIIcons.renderIcon(skill, { kind: 'skill', size: 'md' })
//   UIIcons.iconString(item, 'item')                      // raw glyph or '' for images
//   UIIcons.isImage(skill.icon)                           // true if URL
//
window.CJS = window.CJS || {};

window.CJS.UIIcons = (() => {
  'use strict';

  const DEFAULTS = {
    skill:     '⚔️',
    passive:   '🛡️',
    item:      '🎁',
    weapon:    '🗡️',
    armor:     '🛡️',
    accessory: '💍',
    consumable: '🧪',
    food:      '🍖',
    job:       '🎖️',
    character: '👤',
    monster:   '👹',
    status:    '✨',
    quest:     '📜',
    rumor:     '🗣️',
    event:     '🎴',
    oracle:    '🔮',
    map:       '🗺️',
    battle:    '⚔️',
    treasure:  '💎',
    generic:   '◆'
  };

  function _isLikelyUrl(value) {
    if (!value) return false;
    const s = String(value);
    return /^(data:image\/|https?:\/\/|\/|\.\/|\.\.\/)/.test(s) ||
           /\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/i.test(s);
  }

  function _esc(value) {
    return String(value || '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // Normalize an icon source into { kind, value, alt }
  function normalize(raw, fallbackKind = 'generic') {
    if (!raw) return { kind: 'glyph', value: DEFAULTS[fallbackKind] || DEFAULTS.generic };
    const s = String(raw).trim();
    if (!s) return { kind: 'glyph', value: DEFAULTS[fallbackKind] || DEFAULTS.generic };
    if (_isLikelyUrl(s)) return { kind: 'image', value: s };
    // Heuristic: if string contains any non-ASCII or any emoji-presentation char,
    // treat as glyph; otherwise short ASCII text falls back to category default.
    const hasGlyph = /[\u{1F000}-\u{1FFFF}]|[☀-➿]|\p{Extended_Pictographic}/u.test(s);
    if (hasGlyph) return { kind: 'glyph', value: s };
    if (s.length <= 3) return { kind: 'glyph', value: s };
    // Long ASCII label like "Tent" — show first letter capitalized as a glyph fallback.
    return { kind: 'letter', value: s.slice(0, 1).toUpperCase(), alt: s };
  }

  // Get the entity's icon source, then default by kind, then category default.
  function iconSource(entity, kind = 'generic') {
    if (!entity) return DEFAULTS[kind] || DEFAULTS.generic;
    return entity.icon
      || entity.symbol
      || entity.glyph
      || entity.iconUrl
      || DEFAULTS[kind]
      || DEFAULTS.generic;
  }

  // Plain string version (caller decides escaping). Returns the glyph or
  // an empty string if it's an image URL.
  function iconString(entity, kind = 'generic') {
    const tok = normalize(iconSource(entity, kind), kind);
    return tok.kind === 'image' ? '' : tok.value;
  }

  // Render an inline icon HTML string.
  // Options:
  //   kind:   category default fallback
  //   size:   'xs' | 'sm' | 'md' | 'lg' | 'xl'  (default 'md')
  //   alt:    accessibility text (default entity.name)
  //   title:  tooltip text
  //   className: extra CSS class
  function renderIcon(entity, options = {}) {
    const kind = options.kind || 'generic';
    const size = options.size || 'md';
    const tok = normalize(iconSource(entity, kind), kind);
    const alt = _esc(options.alt || entity?.name || tok.alt || '');
    const title = options.title ? ` title="${_esc(options.title)}"` : '';
    const cls = `cjs-icon cjs-icon-${size} cjs-icon-${kind} ${options.className || ''}`.trim();
    if (tok.kind === 'image') {
      const fallback = DEFAULTS[kind] || DEFAULTS.generic;
      return `<span class="${cls}"${title}>
        <img src="${_esc(tok.value)}" alt="${alt}"
             onerror="this.style.display='none';this.nextElementSibling.style.display=''">
        <span class="cjs-icon-fallback" style="display:none">${_esc(fallback)}</span>
      </span>`;
    }
    if (tok.kind === 'letter') {
      return `<span class="${cls} cjs-icon-letter"${title}>${_esc(tok.value)}</span>`;
    }
    return `<span class="${cls}"${title}>${_esc(tok.value)}</span>`;
  }

  function defaultFor(kind) {
    return DEFAULTS[kind] || DEFAULTS.generic;
  }

  // True if the configured icon points at an image source.
  function isImage(raw) {
    return normalize(raw).kind === 'image';
  }

  // ── Editor widget binding ─────────────────────────────────────────
  // Auto-bind any `[data-icon-upload]` widget on the page:
  //   - Updates the preview when the text input changes
  //   - Lets the user pick an image file; stores it as a data URL in the input
  //   - Triggers an `input` event so existing listeners pick it up
  function _renderPreview(host, kind) {
    const input = host.querySelector('input[type="text"]');
    const preview = host.querySelector('[data-icon-preview]');
    if (!input || !preview) return;
    const value = input.value || '';
    if (isImage(value)) {
      preview.innerHTML = `<img src="${value.replace(/"/g, '&quot;')}" alt="">`;
    } else {
      preview.textContent = value || defaultFor(kind);
    }
  }

  function bindUploadWidget(host) {
    if (!host || host._cjsIconBound) return;
    host._cjsIconBound = true;
    const kind = host.dataset.iconKind || 'generic';
    const input = host.querySelector('input[type="text"]');
    const fileIn = host.querySelector('[data-icon-upload-input]');
    const trigger = host.querySelector('[data-icon-upload-trigger]');
    if (input) {
      input.addEventListener('input', () => _renderPreview(host, kind));
      input.addEventListener('change', () => _renderPreview(host, kind));
    }
    if (trigger && fileIn) {
      trigger.addEventListener('click', () => fileIn.click());
    }
    if (fileIn) {
      fileIn.addEventListener('change', () => {
        const file = fileIn.files && fileIn.files[0];
        if (!file || !input) return;
        const reader = new FileReader();
        reader.onload = () => {
          input.value = reader.result || '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };
        reader.readAsDataURL(file);
      });
    }
    _renderPreview(host, kind);
  }

  function bindAll(root = document) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[data-icon-upload]').forEach(bindUploadWidget);
  }

  // Re-scan when DOM changes so editor re-renders pick up widgets.
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    const _observer = new MutationObserver((entries) => {
      for (const e of entries) {
        for (const node of e.addedNodes || []) {
          if (node && node.nodeType === 1) {
            if (node.matches && node.matches('[data-icon-upload]')) bindUploadWidget(node);
            if (node.querySelectorAll) bindAll(node);
          }
        }
      }
    });
    if (document.body) _observer.observe(document.body, { childList: true, subtree: true });
    else document.addEventListener('DOMContentLoaded', () => {
      _observer.observe(document.body, { childList: true, subtree: true });
      bindAll(document);
    });
  }

  return Object.freeze({
    normalize,
    iconSource,
    iconString,
    renderIcon,
    defaultFor,
    isImage,
    bindUploadWidget,
    bindAll,
    DEFAULTS
  });
})();
