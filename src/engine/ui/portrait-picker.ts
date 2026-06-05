// portrait-picker.js
// Tier 3 TS port -> src/engine/ui/portrait-picker.ts (exports PortraitPicker + installs window.CJS.PortraitPicker). Body verbatim.
// Shared portrait selection widget and image cache for editor/combat UI.

window.CJS = window.CJS || {};

export const PortraitPicker = (() => {
  'use strict';

  let _manifest = { characters: [], monsters: [], items: [] };
  let _loaded = false;
  let _imageCache = Object.create(null);
  // Paths the user has (re)uploaded — display them with a ?v= query string
  // to bypass stale browser/CDN cache. The stored portrait field on entities
  // stays the clean path. Persisted to localStorage so the cache-bust survives
  // reloads (browser disk cache can otherwise still serve the old image).
  const CACHE_BUST_KEY = 'cjs.editor.portraitCacheBust';
  let _cacheBust = (() => {
    try {
      const raw = localStorage.getItem(CACHE_BUST_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (e) { /* ignore */ }
    return Object.create(null);
  })();

  function _persistCacheBust() {
    try { localStorage.setItem(CACHE_BUST_KEY, JSON.stringify(_cacheBust)); }
    catch (e) { /* ignore */ }
  }

  function _bustedSrc(path) {
    if (!path) return path;
    const v = _cacheBust[path];
    if (!v) return path;
    return path + (path.indexOf('?') >= 0 ? '&' : '?') + 'v=' + v;
  }

  const SIZE_OPTIONS = [
    { label: 'XS', px: 64 },
    { label: 'S',  px: 96 },
    { label: 'M',  px: 128 },
    { label: 'L',  px: 192 },
    { label: 'XL', px: 256 },
    { label: 'XXL', px: 320 }
  ];

  // Default focus: centered, no extra zoom. A portrait with this focus
  // renders identically to the pre-focus behavior (object-fit: cover, centered).
  const FOCUS_DEFAULT = Object.freeze({ x: 50, y: 50, zoom: 100 });
  const FOCUS_ZOOM_MIN = 100;
  const FOCUS_ZOOM_MAX = 400;

  function normalizeFocus(focus) {
    if (!focus || typeof focus !== 'object') return { ...FOCUS_DEFAULT };
    const clamp = (v, lo, hi, fb) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return fb;
      return Math.max(lo, Math.min(hi, n));
    };
    return {
      x: clamp(focus.x, 0, 100, FOCUS_DEFAULT.x),
      y: clamp(focus.y, 0, 100, FOCUS_DEFAULT.y),
      zoom: clamp(focus.zoom, FOCUS_ZOOM_MIN, FOCUS_ZOOM_MAX, FOCUS_DEFAULT.zoom)
    };
  }

  function isDefaultFocus(focus) {
    const f = normalizeFocus(focus);
    return f.x === FOCUS_DEFAULT.x && f.y === FOCUS_DEFAULT.y && f.zoom === FOCUS_DEFAULT.zoom;
  }

  // Inline-style string that places the focus point at the container center
  // and applies the zoom. Pair with an <img class="..." style="object-fit:cover; ...">
  // inside a clipping wrapper.
  function focusStyle(focus) {
    const f = normalizeFocus(focus);
    const parts = [
      `object-fit:cover`,
      `object-position:${f.x}% ${f.y}%`,
      `transform-origin:${f.x}% ${f.y}%`
    ];
    if (f.zoom !== 100) parts.push(`transform:scale(${(f.zoom / 100).toFixed(3)})`);
    return parts.join(';');
  }

  function applyFocusStyle(imgEl, focus) {
    if (!imgEl) return;
    const f = normalizeFocus(focus);
    imgEl.style.objectFit = 'cover';
    imgEl.style.objectPosition = `${f.x}% ${f.y}%`;
    imgEl.style.transformOrigin = `${f.x}% ${f.y}%`;
    imgEl.style.transform = f.zoom !== 100 ? `scale(${(f.zoom / 100).toFixed(3)})` : '';
  }

  // Returns HTML markup that renders a portrait with focus applied. Falls
  // back to an inline icon span when there is no path. Caller controls
  // sizing via the wrapping element's CSS.
  function renderPortraitHTML(path, opts: any = {}) {
    const focus = normalizeFocus(opts.focus);
    const imageClass = opts.imageClass || 'cjs-portrait';
    const fallbackClass = opts.fallbackClass || 'cjs-portrait-fallback';
    const icon = opts.fallbackIcon || '?';
    const alt = opts.alt || '';
    if (!path) {
      return `<span class="${fallbackClass}">${_escAttr(icon)}</span>`;
    }
    const src = _bustedSrc(path);
    const style = focusStyle(focus);
    return `<img src="${_escAttr(src)}" class="${imageClass}" alt="${_escAttr(alt)}" style="${_escAttr(style)}" onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='')"><span class="${fallbackClass}" style="display:none">${_escAttr(icon)}</span>`;
  }

  // Source-rect crop math for canvas drawing. Mirrors what CSS does with
  // object-fit:cover + object-position + scale, but in source pixels so
  // ctx.drawImage paints the correct region.
  function computeSourceRect(naturalW, naturalH, dw, dh, focus) {
    const f = normalizeFocus(focus);
    if (!(naturalW > 0) || !(naturalH > 0) || !(dw > 0) || !(dh > 0)) {
      return { sx: 0, sy: 0, sw: naturalW || 0, sh: naturalH || 0 };
    }
    const baseScale = Math.max(dw / naturalW, dh / naturalH);
    const effScale = baseScale * (f.zoom / 100);
    let sw = dw / effScale;
    let sh = dh / effScale;
    // Source rect can't exceed the natural image. Clamp and re-center if it does.
    if (sw > naturalW) sw = naturalW;
    if (sh > naturalH) sh = naturalH;
    const cx = (f.x / 100) * naturalW;
    const cy = (f.y / 100) * naturalH;
    let sx = cx - sw / 2;
    let sy = cy - sh / 2;
    sx = Math.max(0, Math.min(naturalW - sw, sx));
    sy = Math.max(0, Math.min(naturalH - sh, sy));
    return { sx, sy, sw, sh };
  }

  function drawPortraitToCanvas(ctx, img, dx, dy, dw, dh, focus) {
    if (!ctx || !img) return false;
    if (!img.complete || !(img.naturalWidth > 0)) return false;
    const rect = computeSourceRect(img.naturalWidth, img.naturalHeight, dw, dh, focus);
    try {
      ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, dx, dy, dw, dh);
      return true;
    } catch (e) {
      return false;
    }
  }

  const SIZE_KEY_W = 'cjs.editor.portraitPreviewW';
  const SIZE_KEY_H = 'cjs.editor.portraitPreviewH';
  const DEFAULT_PX = 192;

  function _readDim(key) {
    try {
      const v = parseInt(localStorage.getItem(key), 10);
      if (Number.isFinite(v) && SIZE_OPTIONS.some(o => o.px === v)) return v;
    } catch (e) { /* ignore */ }
    return DEFAULT_PX;
  }
  function _readW() { return _readDim(SIZE_KEY_W); }
  function _readH() { return _readDim(SIZE_KEY_H); }
  function _applySize(w, h) {
    if (typeof document === 'undefined' || !document.documentElement) return;
    document.documentElement.style.setProperty('--portrait-preview-w', `${w}px`);
    document.documentElement.style.setProperty('--portrait-preview-h', `${h}px`);
  }
  function setPreviewSize(w, h) {
    const W = SIZE_OPTIONS.some(o => o.px === w) ? w : _readW();
    const H = SIZE_OPTIONS.some(o => o.px === h) ? h : _readH();
    try {
      localStorage.setItem(SIZE_KEY_W, String(W));
      localStorage.setItem(SIZE_KEY_H, String(H));
    } catch (e) { /* ignore */ }
    _applySize(W, H);
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.portrait-size-w-select').forEach((sel: any) => {
        if (parseInt(sel.value, 10) !== W) sel.value = String(W);
      });
      document.querySelectorAll('.portrait-size-h-select').forEach((sel: any) => {
        if (parseInt(sel.value, 10) !== H) sel.value = String(H);
      });
    }
  }
  function getPreviewSize() { return { w: _readW(), h: _readH() }; }
  // Apply persisted size on module load.
  _applySize(_readW(), _readH());

  async function loadManifest() {
    if (_loaded) return _manifest;
    try {
      const response = await fetch('data/image-manifest.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      _manifest = _normalizeManifest(await response.json());
    } catch (error) {
      console.warn('Portrait manifest unavailable (non-fatal):', error.message);
      _manifest = _normalizeManifest();
    }
    _loaded = true;
    _seedCacheBustFromManifest();
    return _manifest;
  }

  // Make sure every path the manifest lists has a cache-bust stamp. This
  // guarantees a one-time cache flush for portraits that existed before the
  // cache-busting feature landed (otherwise the browser keeps serving the
  // old image at the unchanged URL).
  function _seedCacheBustFromManifest() {
    let dirty = false;
    const ts = Date.now();
    for (const category of ['characters', 'monsters', 'items']) {
      const list = Array.isArray(_manifest[category]) ? _manifest[category] : [];
      for (const file of list) {
        const path = `images/${category}/${file}`;
        if (!_cacheBust[path]) {
          _cacheBust[path] = ts;
          dirty = true;
        }
      }
    }
    if (dirty) _persistCacheBust();
  }

  function getManifest() {
    return _manifest;
  }

  function createWidget(opts: any = {}) {
    const root = document.createElement('div');
    root.className = 'portrait-widget';

    let currentPath = String(opts.currentPath || '').trim();
    let currentFocus = normalizeFocus(opts.currentFocus);
    const category = opts.category || 'characters';
    let fallbackIcon = opts.fallbackIcon || '?';

    const previewWrap = document.createElement('div');
    previewWrap.className = 'portrait-preview-wrap';

    const controls = document.createElement('div');
    controls.className = 'portrait-controls';

    const label = document.createElement('label');
    label.className = 'form-label';
    label.textContent = 'Portrait';
    label.style.marginBottom = '2px';

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '4px';
    row.style.flexWrap = 'wrap';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'portrait-path-input';
    input.placeholder = `images/${category}/hero.png`;
    input.style.flex = '1';
    input.style.minWidth = '120px';
    input.style.fontSize = '0.78rem';

    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'btn btn-success btn-sm portrait-upload-btn';
    uploadBtn.textContent = 'Upload';
    uploadBtn.title = 'Upload an image from your computer';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif,.svg,.tiff,.tif,.ico';
    fileInput.style.display = 'none';

    const browseBtn = document.createElement('button');
    browseBtn.type = 'button';
    browseBtn.className = 'btn btn-ghost btn-sm portrait-browse-btn';
    browseBtn.textContent = 'Browse';
    browseBtn.title = 'Browse available images';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'btn btn-ghost btn-sm portrait-clear-btn';
    clearBtn.textContent = 'Clear';
    clearBtn.title = 'Clear portrait';

    const sizeWrap = document.createElement('span');
    sizeWrap.className = 'portrait-size-wrap dim';
    sizeWrap.style.display = 'inline-flex';
    sizeWrap.style.alignItems = 'center';
    sizeWrap.style.gap = '4px';
    sizeWrap.style.fontSize = '0.78rem';
    sizeWrap.style.marginLeft = 'auto';

    function _buildSizeSelect(className, currentPx) {
      const sel = document.createElement('select');
      sel.className = className;
      sel.style.fontSize = '0.78rem';
      sel.style.padding = '1px 4px';
      for (const opt of SIZE_OPTIONS) {
        const o = document.createElement('option');
        o.value = String(opt.px);
        o.textContent = `${opt.label} (${opt.px})`;
        if (opt.px === currentPx) o.selected = true;
        sel.appendChild(o);
      }
      return sel;
    }
    const wSelect = _buildSizeSelect('portrait-size-w-select', _readW());
    const hSelect = _buildSizeSelect('portrait-size-h-select', _readH());

    wSelect.addEventListener('change', () => {
      const px = parseInt(wSelect.value, 10);
      if (Number.isFinite(px)) setPreviewSize(px, _readH());
    });
    hSelect.addEventListener('change', () => {
      const px = parseInt(hSelect.value, 10);
      if (Number.isFinite(px)) setPreviewSize(_readW(), px);
    });

    const wLabel = document.createElement('span');
    wLabel.textContent = 'W';
    const hLabel = document.createElement('span');
    hLabel.textContent = 'H';
    hLabel.style.marginLeft = '2px';

    sizeWrap.appendChild(wLabel);
    sizeWrap.appendChild(wSelect);
    sizeWrap.appendChild(hLabel);
    sizeWrap.appendChild(hSelect);

    const focusBtn = document.createElement('button');
    focusBtn.type = 'button';
    focusBtn.className = 'btn btn-ghost btn-sm portrait-focus-btn';
    focusBtn.textContent = 'Focus';
    focusBtn.title = 'Choose which part of the picture is shown';

    const focusEditor = document.createElement('div');
    focusEditor.className = 'portrait-focus-editor';
    focusEditor.hidden = true;

    const focusStage = document.createElement('div');
    focusStage.className = 'portrait-focus-stage';
    focusStage.title = 'Click or drag to set the focus point';

    const focusFullImg = document.createElement('img');
    focusFullImg.className = 'portrait-focus-full';
    focusFullImg.alt = '';
    focusFullImg.draggable = false;

    const focusFrame = document.createElement('div');
    focusFrame.className = 'portrait-focus-frame';

    const focusDot = document.createElement('span');
    focusDot.className = 'portrait-focus-dot';

    focusStage.appendChild(focusFullImg);
    focusStage.appendChild(focusFrame);
    focusStage.appendChild(focusDot);

    const focusControls = document.createElement('div');
    focusControls.className = 'portrait-focus-controls';

    const zoomRow = document.createElement('label');
    zoomRow.className = 'portrait-focus-zoom-row';
    const zoomLabelEl = document.createElement('span');
    zoomLabelEl.textContent = 'Zoom';
    const zoomSlider = document.createElement('input');
    zoomSlider.type = 'range';
    zoomSlider.min = String(FOCUS_ZOOM_MIN);
    zoomSlider.max = String(FOCUS_ZOOM_MAX);
    zoomSlider.step = '5';
    zoomSlider.value = String(currentFocus.zoom);
    const zoomReadout = document.createElement('span');
    zoomReadout.className = 'portrait-focus-zoom-readout';
    zoomReadout.textContent = `${currentFocus.zoom}%`;
    zoomRow.appendChild(zoomLabelEl);
    zoomRow.appendChild(zoomSlider);
    zoomRow.appendChild(zoomReadout);

    const focusResetBtn = document.createElement('button');
    focusResetBtn.type = 'button';
    focusResetBtn.className = 'btn btn-ghost btn-sm';
    focusResetBtn.textContent = 'Center';
    focusResetBtn.title = 'Reset focus to centered, no zoom';

    const focusHint = document.createElement('div');
    focusHint.className = 'portrait-focus-hint dim';
    focusHint.textContent = 'Click on the image or drag the box to pick the visible region.';

    focusControls.appendChild(zoomRow);
    focusControls.appendChild(focusResetBtn);

    focusEditor.appendChild(focusStage);
    focusEditor.appendChild(focusControls);
    focusEditor.appendChild(focusHint);

    function _updateFocusFrame() {
      // The frame represents the cropped area expressed as a percentage of
      // the stage. With object-fit:contain in the editor, the image fills
      // the stage exactly (we set stage aspect to match the image), so frame
      // % maps directly onto image %.
      const size = 100 / (currentFocus.zoom / 100);
      const halfSize = size / 2;
      let left = currentFocus.x - halfSize;
      let top  = currentFocus.y - halfSize;
      // Clamp so the frame stays inside the stage
      left = Math.max(0, Math.min(100 - size, left));
      top  = Math.max(0, Math.min(100 - size, top));
      focusFrame.style.left   = `${left}%`;
      focusFrame.style.top    = `${top}%`;
      focusFrame.style.width  = `${size}%`;
      focusFrame.style.height = `${size}%`;
      focusDot.style.left = `${currentFocus.x}%`;
      focusDot.style.top  = `${currentFocus.y}%`;
      zoomReadout.textContent = `${Math.round(currentFocus.zoom)}%`;
      if (Number(zoomSlider.value) !== currentFocus.zoom) {
        zoomSlider.value = String(currentFocus.zoom);
      }
    }

    function _renderFocusEditor() {
      if (focusEditor.hidden) return;
      if (!currentPath) {
        focusFullImg.removeAttribute('src');
        focusEditor.dataset.empty = '1';
        return;
      }
      focusEditor.dataset.empty = '0';
      const desired = _bustedSrc(currentPath);
      if (focusFullImg.getAttribute('src') !== desired) {
        focusFullImg.src = desired;
      }
      _updateFocusFrame();
    }

    function _setFocus(next, source?) {
      const norm = normalizeFocus(next);
      if (norm.x === currentFocus.x && norm.y === currentFocus.y && norm.zoom === currentFocus.zoom) {
        return;
      }
      currentFocus = norm;
      _updateFocusFrame();
      // Live-update the main preview so the user sees the cropped result.
      const mainImg = previewWrap.querySelector('.portrait-preview');
      if (mainImg) applyFocusStyle(mainImg, currentFocus);
      notifyFocusChange();
      if (source !== 'silent') focusBtn.classList.toggle('is-active', !isDefaultFocus(currentFocus));
    }

    function _focusPointFromEvent(ev) {
      const rect = focusStage.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const x = ((ev.clientX - rect.left) / rect.width) * 100;
      const y = ((ev.clientY - rect.top)  / rect.height) * 100;
      return {
        x: Math.max(0, Math.min(100, x)),
        y: Math.max(0, Math.min(100, y))
      };
    }

    let _dragging = false;
    focusStage.addEventListener('pointerdown', (ev) => {
      if (!currentPath) return;
      _dragging = true;
      try { focusStage.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      const p = _focusPointFromEvent(ev);
      if (p) _setFocus({ ...currentFocus, ...p });
    });
    focusStage.addEventListener('pointermove', (ev) => {
      if (!_dragging) return;
      const p = _focusPointFromEvent(ev);
      if (p) _setFocus({ ...currentFocus, ...p });
    });
    const _endDrag = (ev) => {
      _dragging = false;
      try { focusStage.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    };
    focusStage.addEventListener('pointerup', _endDrag);
    focusStage.addEventListener('pointercancel', _endDrag);

    focusStage.addEventListener('wheel', (ev) => {
      if (focusEditor.hidden || !currentPath) return;
      ev.preventDefault();
      const step = ev.deltaY > 0 ? -10 : 10;
      _setFocus({ ...currentFocus, zoom: currentFocus.zoom + step });
    }, { passive: false });

    zoomSlider.addEventListener('input', () => {
      _setFocus({ ...currentFocus, zoom: Number(zoomSlider.value) });
    });

    focusResetBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      _setFocus({ ...FOCUS_DEFAULT });
    });

    focusBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      focusEditor.hidden = !focusEditor.hidden;
      focusBtn.classList.toggle('is-open', !focusEditor.hidden);
      if (!focusEditor.hidden) _renderFocusEditor();
    });

    const statusEl = document.createElement('div');
    statusEl.className = 'portrait-status dim';
    statusEl.style.fontSize = '0.78rem';
    statusEl.style.marginTop = '4px';
    statusEl.style.minHeight = '1em';

    let busy = false;
    function setStatus(text, kind?) {
      statusEl.textContent = text || '';
      statusEl.style.color = kind === 'error' ? 'var(--danger, #f88)'
        : kind === 'success' ? 'var(--success, #7c7)'
        : '';
    }

    async function handleUpload() {
      if (busy) return;
      const SM = window.CJS && window.CJS.SaveManager;
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;

      if (!SM || !SM.uploadBinaryFileToGitHub) {
        setStatus('SaveManager not loaded.', 'error');
        return;
      }
      if (!SM.hasGitHubToken || !SM.hasGitHubToken()) {
        setStatus('Configure your GitHub token first (Editor → GitHub).', 'error');
        return;
      }

      const slug = _slugFor(opts.id, opts.name);
      if (!slug) {
        setStatus('Set an id or name on this entry before uploading.', 'error');
        return;
      }

      busy = true;
      uploadBtn.disabled = true;
      setStatus('Reading file…', 'info');
      try {
        const base64 = await SM.fileToBase64(file);
        const extMatch = String(file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
        const ext = extMatch ? extMatch[0] : '.png';
        const filename = `${slug}${ext}`;
        const path = `images/${category}/${filename}`;

        setStatus('Uploading image to GitHub…', 'info');
        await SM.uploadBinaryFileToGitHub(path, base64, {
          message: `image: upload ${path}`
        });

        setStatus('Updating image-manifest.json…', 'info');
        await loadManifest().catch(() => {});
        _manifest[category] = Array.isArray(_manifest[category]) ? _manifest[category] : [];
        if (!_manifest[category].includes(filename)) _manifest[category].push(filename);
        const json = JSON.stringify(_manifest, null, 2) + '\n';
        await SM.saveTextFileToGitHub('data/image-manifest.json', json, {
          message: `image: register ${category}.${filename}`
        });

        _cacheBust[path] = Date.now();
        _persistCacheBust();
        delete _imageCache[path];
        currentPath = path;
        notifyChange();
        render();

        setStatus(`Uploaded → ${path}`, 'success');
        fileInput.value = '';
      } catch (e) {
        console.error(e);
        setStatus('Upload failed: ' + (e.message || e), 'error');
        try { fileInput.value = ''; } catch (_) { /* ignore */ }
      } finally {
        busy = false;
        uploadBtn.disabled = false;
      }
    }

    uploadBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      try { fileInput.value = ''; } catch (_) { /* ignore */ }
      fileInput.click();
    });
    fileInput.addEventListener('change', handleUpload);

    function renderPreview() {
      previewWrap.innerHTML = '';
      if (currentPath) {
        const img = document.createElement('img');
        img.className = 'portrait-preview';
        img.alt = 'portrait';
        img.src = _bustedSrc(currentPath);
        applyFocusStyle(img, currentFocus);

        const fallback = document.createElement('span');
        fallback.className = 'portrait-fallback';
        fallback.textContent = fallbackIcon;
        fallback.style.display = 'none';

        img.addEventListener('error', () => {
          img.style.display = 'none';
          fallback.style.display = '';
        });

        previewWrap.appendChild(img);
        previewWrap.appendChild(fallback);
      } else {
        const fallback = document.createElement('span');
        fallback.className = 'portrait-fallback';
        fallback.textContent = fallbackIcon;
        previewWrap.appendChild(fallback);
      }
      _renderFocusEditor();
    }

    function notifyChange() {
      if (typeof opts.onChange === 'function') opts.onChange(currentPath);
    }
    function notifyFocusChange() {
      if (typeof opts.onFocusChange === 'function') opts.onFocusChange({ ...currentFocus });
    }

    function render() {
      input.value = currentPath;
      renderPreview();
      clearBtn.style.display = currentPath ? '' : 'none';
    }

    input.addEventListener('change', () => {
      currentPath = input.value.trim();
      notifyChange();
      render();
    });

    browseBtn.addEventListener('click', async () => {
      await loadManifest().catch(() => {});
      openBrowseModal(category, (path) => {
        currentPath = path;
        notifyChange();
        render();
      });
    });

    clearBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      currentPath = '';
      try { fileInput.value = ''; } catch (e) { /* ignore */ }
      setStatus('');
      notifyChange();
      render();
    });

    row.appendChild(input);
    row.appendChild(uploadBtn);
    row.appendChild(browseBtn);
    row.appendChild(focusBtn);
    row.appendChild(clearBtn);
    row.appendChild(sizeWrap);
    controls.appendChild(label);
    controls.appendChild(row);
    controls.appendChild(focusEditor);
    controls.appendChild(statusEl);
    controls.appendChild(fileInput);
    root.appendChild(previewWrap);
    root.appendChild(controls);

    focusBtn.classList.toggle('is-active', !isDefaultFocus(currentFocus));
    render();

    return {
      el: root,
      getValue() {
        currentPath = input.value.trim();
        return currentPath;
      },
      setValue(path) {
        currentPath = String(path || '').trim();
        render();
      },
      setFallbackIcon(icon) {
        fallbackIcon = icon || '?';
        renderPreview();
      },
      getFocus() {
        return { ...currentFocus };
      },
      setFocus(focus) {
        _setFocus(focus, 'silent');
        focusBtn.classList.toggle('is-active', !isDefaultFocus(currentFocus));
        renderPreview();
      }
    };
  }

  function openBrowseModal(category, onPick) {
    const UI = window.CJS.UI;
    const list = Array.isArray(_manifest[category]) ? _manifest[category] : [];

    if (!UI || !UI.openModal || !UI.closeModal) {
      const manualPath = window.prompt(`Enter image path (for example: images/${category}/hero.png):`);
      if (manualPath && typeof onPick === 'function') onPick(manualPath.trim());
      return;
    }

    const body = document.createElement('div');

    if (list.length > 0) {
      const grid = document.createElement('div');
      grid.className = 'portrait-grid';

      for (const file of list) {
        const path = `images/${category}/${file}`;
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'portrait-grid-item';
        item.dataset.path = path;

        const img = document.createElement('img');
        img.src = _bustedSrc(path);
        img.alt = file;

        const name = document.createElement('span');
        name.className = 'portrait-grid-name';
        name.textContent = file;

        item.appendChild(img);
        item.appendChild(name);
        grid.appendChild(item);
      }

      body.appendChild(grid);
    } else {
      const empty = document.createElement('div');
      empty.style.padding = '20px';
      empty.style.textAlign = 'center';
      empty.style.color = 'var(--text-mute)';
      empty.innerHTML = `<p>No images listed for <b>${_escHtml(category)}</b>.</p>
        <p style="font-size:0.82rem;margin-top:8px">Add files to <code>images/${_escHtml(category)}/</code> and list them in <code>data/image-manifest.json</code>.</p>`;
      body.appendChild(empty);
    }

    const manualWrap = document.createElement('div');
    manualWrap.style.marginTop = '12px';
    manualWrap.style.borderTop = '1px solid rgba(255,255,255,0.06)';
    manualWrap.style.paddingTop = '8px';

    const manualLabel = document.createElement('label');
    manualLabel.className = 'form-label';
    manualLabel.textContent = 'Or type a path:';

    const manualRow = document.createElement('div');
    manualRow.style.display = 'flex';
    manualRow.style.gap = '6px';
    manualRow.style.marginTop = '4px';

    const manualInput = document.createElement('input');
    manualInput.type = 'text';
    manualInput.placeholder = `images/${category}/hero.png`;
    manualInput.style.flex = '1';

    const manualBtn = document.createElement('button');
    manualBtn.type = 'button';
    manualBtn.className = 'btn btn-primary btn-sm';
    manualBtn.textContent = 'Use';

    manualRow.appendChild(manualInput);
    manualRow.appendChild(manualBtn);
    manualWrap.appendChild(manualLabel);
    manualWrap.appendChild(manualRow);
    body.appendChild(manualWrap);

    const overlay = UI.openModal({
      title: 'Choose Portrait',
      content: body,
      width: '520px'
    });

    body.querySelectorAll('.portrait-grid-item').forEach((item) => {
      item.addEventListener('click', () => {
        UI.closeModal(overlay);
        if (typeof onPick === 'function') onPick((item as any).dataset.path || '');
      });
    });

    manualBtn.addEventListener('click', () => {
      const value = manualInput.value.trim();
      if (!value) return;
      UI.closeModal(overlay);
      if (typeof onPick === 'function') onPick(value);
    });
  }

  function getCachedImage(path) {
    if (!path) return null;
    if (_imageCache[path]) return _imageCache[path];
    const img = new Image();
    img.src = _bustedSrc(path);
    _imageCache[path] = img;
    return img;
  }

  function preloadImage(path) {
    getCachedImage(path);
  }

  function clearCache() {
    _imageCache = Object.create(null);
  }

  function _slugFor(id, name) {
    const base = String(id || '').trim() || String(name || '').trim();
    if (!base) return '';
    return base.toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function _normalizeManifest(value?) {
    return {
      characters: Array.isArray(value?.characters) ? value.characters : [],
      monsters: Array.isArray(value?.monsters) ? value.monsters : [],
      items: Array.isArray(value?.items) ? value.items : []
    };
  }

  function _escAttr(value) { return _escHtml(value); }
  function _escHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  return Object.freeze({
    loadManifest,
    getManifest,
    createWidget,
    openBrowseModal,
    getCachedImage,
    preloadImage,
    clearCache,
    getPreviewSize,
    setPreviewSize,
    bustedSrc: _bustedSrc,
    normalizeFocus,
    isDefaultFocus,
    focusStyle,
    applyFocusStyle,
    renderPortraitHTML,
    computeSourceRect,
    drawPortraitToCanvas,
    FOCUS_DEFAULT
  });
})();

// Runtime compatibility install — identical to the legacy IIFE.
window.CJS.PortraitPicker = PortraitPicker;
