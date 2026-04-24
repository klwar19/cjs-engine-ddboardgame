// portrait-picker.js
// Shared portrait selection widget and image cache for editor/combat UI.

window.CJS = window.CJS || {};

window.CJS.PortraitPicker = (() => {
  'use strict';

  let _manifest = { characters: [], monsters: [], items: [] };
  let _loaded = false;
  let _imageCache = Object.create(null);

  async function loadManifest() {
    if (_loaded) return _manifest;
    try {
      const response = await fetch('data/image-manifest.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      _manifest = _normalizeManifest(await response.json());
    } catch (error) {
      console.warn('Portrait manifest unavailable (non-fatal):', error.message);
      _manifest = _normalizeManifest();
    }
    _loaded = true;
    return _manifest;
  }

  function getManifest() {
    return _manifest;
  }

  function createWidget(opts = {}) {
    const root = document.createElement('div');
    root.className = 'portrait-widget';

    let currentPath = String(opts.currentPath || '').trim();
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

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'portrait-path-input';
    input.placeholder = `images/${category}/hero.png`;
    input.style.flex = '1';
    input.style.fontSize = '0.78rem';

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

    function renderPreview() {
      previewWrap.innerHTML = '';
      if (currentPath) {
        const img = document.createElement('img');
        img.className = 'portrait-preview';
        img.alt = 'portrait';
        img.src = currentPath;

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
    }

    function notifyChange() {
      if (typeof opts.onChange === 'function') opts.onChange(currentPath);
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

    clearBtn.addEventListener('click', () => {
      currentPath = '';
      notifyChange();
      render();
    });

    row.appendChild(input);
    row.appendChild(browseBtn);
    row.appendChild(clearBtn);
    controls.appendChild(label);
    controls.appendChild(row);
    root.appendChild(previewWrap);
    root.appendChild(controls);

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
        img.src = path;
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
        if (typeof onPick === 'function') onPick(item.dataset.path || '');
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
    img.src = path;
    _imageCache[path] = img;
    return img;
  }

  function preloadImage(path) {
    getCachedImage(path);
  }

  function clearCache() {
    _imageCache = Object.create(null);
  }

  function _normalizeManifest(value) {
    return {
      characters: Array.isArray(value?.characters) ? value.characters : [],
      monsters: Array.isArray(value?.monsters) ? value.monsters : [],
      items: Array.isArray(value?.items) ? value.items : []
    };
  }

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
    clearCache
  });
})();
