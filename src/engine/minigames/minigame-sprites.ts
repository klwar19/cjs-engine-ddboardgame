// minigame-sprites.js
// Tier 3 TS port -> src/engine/minigames/minigame-sprites.ts (exports MinigameSprites + installs window.CJS.MinigameSprites). Body verbatim.
// Loads `assets/minigames/spritesheet.json`, fetches the referenced sheets,
// and resolves logical sprite names into a draw helper.
//
// Games call CJS.MinigameSprites.get(gameId).then(api => api.draw(ctx, name, dx, dy, dw, dh)).
// If a sprite is missing, `api.draw` is a no-op and the game's canvas fallback
// path runs instead (each game checks `api.has(name)` before drawing).
//
// The default map path is `assets/minigames/spritesheet.json` relative to the
// page. Hosts can override it by calling
// `CJS.Minigames.useSpriteMap(urlOrObject)` (defined in minigame-host.js) —
// useful for reskinning per-event without editing JS.

window.CJS = window.CJS || {};

export const MinigameSprites = (() => {
  'use strict';

  let mapUrl = 'assets/minigames/spritesheet.json';
  let mapPromise = null;
  const sheetCache = new Map();
  const gameApi = new Map();

  function setMap(urlOrObject) {
    mapPromise = null;
    sheetCache.clear();
    gameApi.clear();
    if (typeof urlOrObject === 'string') {
      mapUrl = urlOrObject;
    } else if (urlOrObject && typeof urlOrObject === 'object') {
      mapPromise = Promise.resolve(urlOrObject);
    }
  }

  function loadMap() {
    if (mapPromise) return mapPromise;
    mapPromise = fetch(mapUrl)
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(`sprite map ${res.status}`)))
      .catch((err) => {
        console.warn('MinigameSprites: sprite map load failed, falling back to canvas only.', err);
        return { sheets: {}, mummy_maze: { sprites: {}, procedural: [] }, push_box: { sprites: {}, procedural: [] } };
      });
    return mapPromise;
  }

  function loadSheet(src) {
    if (sheetCache.has(src)) return sheetCache.get(src);
    const p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        console.warn(`MinigameSprites: sheet failed to load: ${src}`);
        resolve(null);
      };
      img.src = src;
    });
    sheetCache.set(src, p);
    return p;
  }

  async function get(gameId) {
    if (gameApi.has(gameId)) return gameApi.get(gameId);
    const map = await loadMap();
    const gameMap = map?.[gameId];
    const defaultSheetName = gameMap?.sheet || '';
    const defaultMeta = defaultSheetName ? map.sheets?.[defaultSheetName] : null;
    const defaultImg = defaultMeta ? await loadSheet(defaultMeta.src) : null;
    const sprites = (gameMap && gameMap.sprites) || {};

    // Pre-load any per-sprite override sheets the spritesheet.json references.
    const overrideSheets = {};
    for (const name of Object.keys(sprites)) {
      const def = sprites[name] || {};
      if (def.sheet && def.sheet !== defaultSheetName && map.sheets?.[def.sheet]) {
        const meta = map.sheets[def.sheet];
        overrideSheets[def.sheet] = {
          meta,
          imgPromise: loadSheet(meta.src)
        };
      }
    }
    for (const key of Object.keys(overrideSheets)) {
      overrideSheets[key].img = await overrideSheets[key].imgPromise;
    }

    function lookupSheet(def) {
      if (def && def.sheet && def.sheet !== defaultSheetName && overrideSheets[def.sheet]) {
        return { meta: overrideSheets[def.sheet].meta, img: overrideSheets[def.sheet].img };
      }
      return { meta: defaultMeta, img: defaultImg };
    }

    function resolveRect(name) {
      const def = sprites[name];
      if (!def) return null;
      const { meta, img } = lookupSheet(def);
      if (def.tile != null && meta?.tileSize) {
        const t = meta.tileSize;
        const cols = meta.cols || Math.floor(img ? img.naturalWidth / t : 0);
        const col = def.tile % cols;
        const row = Math.floor(def.tile / cols);
        return { x: col * t, y: row * t, w: t, h: t, img };
      }
      // A "frame" reference uses cols/rows from the sheet meta to compute a
      // tile-sized rect. Used for the Bin walk sprite sheet (4x4) and the
      // shadow stalker sheet so games can target frame 0 without computing
      // pixel math.
      if (def.frame != null && img && meta?.cols && meta?.rows) {
        const fw = Math.floor(img.naturalWidth / meta.cols);
        const fh = Math.floor(img.naturalHeight / meta.rows);
        const col = def.frame % meta.cols;
        const row = Math.floor(def.frame / meta.cols);
        return { x: col * fw, y: row * fh, w: fw, h: fh, img };
      }
      return { x: def.x | 0, y: def.y | 0, w: def.w | 0, h: def.h | 0, img };
    }

    const api = {
      ready: !!defaultImg,
      sheet: defaultImg,
      tileSize: defaultMeta?.tileSize || null,
      has(name) {
        const def = sprites[name];
        if (!def) return false;
        const { img } = lookupSheet(def);
        return !!img;
      },
      rect(name) { return resolveRect(name); },
      draw(ctx, name, dx, dy, dw, dh) {
        const r = resolveRect(name);
        if (!r || !r.img) return false;
        const aspect = r.w / r.h;
        let drawW = dw, drawH = dh;
        let offsetX = 0, offsetY = 0;
        if (aspect !== 1) {
          if (aspect > 1) {
            drawH = dw / aspect;
            offsetY = (dh - drawH) / 2;
          } else {
            drawW = dh * aspect;
            offsetX = (dw - drawW) / 2;
          }
        }
        ctx.drawImage(r.img, r.x, r.y, r.w, r.h, dx + offsetX, dy + offsetY, drawW, drawH);
        return true;
      }
    };
    gameApi.set(gameId, api);
    return api;
  }

  return { setMap, get };
})();

// Runtime compatibility install — identical to the legacy IIFE.
window.CJS.MinigameSprites = MinigameSprites;
