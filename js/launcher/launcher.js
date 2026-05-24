// launcher.js — Unified app shell controller
//
// Mounts a sidebar/dock that switches between modes. Each mode runs in its
// own iframe inside the frame wrap. Iframes are created lazily on first
// visit and kept alive after that, so switching modes preserves audio,
// in-memory campaign state, open modals, etc. We just toggle the `hidden`
// attribute to show/hide instead of reloading.
//
// State sync: URL hash (#campaign, #combat...), localStorage last-active,
// hashchange.

(function () {
  'use strict';

  const MODES = {
    campaign:  { title: 'Campaign Mode',    file: 'campaign.html'  },
    combat:    { title: 'Combat Simulator', file: 'combat.html'    },
    editor:    { title: 'Content Editor',   file: 'editor.html'    },
    minigames: { title: 'Minigames',        file: 'minigames.html' },
    tests:     { title: 'System Tests',     file: 'tests.html'     },
  };

  const STORAGE_KEY = 'cjs.launcher.lastMode';
  const COLLAPSE_KEY = 'cjs.launcher.sidebarCollapsed';
  const EMBED_FLAG = 'embed=launcher';

  const shell = document.querySelector('.launcher-shell');
  const sidebar = document.getElementById('launcher-sidebar');
  const welcome = document.getElementById('launcher-welcome');
  const titleEl = document.getElementById('launcher-current-title');
  const popOut = document.getElementById('launcher-pop-out');
  const collapseBtn = document.getElementById('launcher-collapse');
  const menuToggle = document.getElementById('launcher-menu-toggle');
  const frameWrap = document.querySelector('.launcher-frame-wrap');

  // Live iframes, keyed by mode id. Created on first navigate(); never
  // destroyed for the lifetime of the page so state survives switches.
  const iframes = new Map();

  let currentMode = null;
  let suppressHashChange = false;

  function buildIframeUrl(mode) {
    const file = MODES[mode].file;
    return file + (file.includes('?') ? '&' : '?') + EMBED_FLAG;
  }

  function getOrCreateIframe(mode) {
    if (iframes.has(mode)) return iframes.get(mode);
    const iframe = document.createElement('iframe');
    iframe.className = 'launcher-frame';
    iframe.title = MODES[mode].title;
    iframe.name = 'launcher-frame-' + mode;
    iframe.dataset.mode = mode;
    iframe.setAttribute('allow', 'autoplay; clipboard-read; clipboard-write');
    iframe.setAttribute('loading', 'lazy');
    iframe.hidden = true;
    iframe.src = buildIframeUrl(mode);

    iframe.addEventListener('load', () => {
      iframe.dataset.loaded = '1';
      if (currentMode === mode) frameWrap.classList.remove('is-loading');
      // If a child page navigates to a different mode's file by changing
      // its own location, sync the sidebar/title for the user. Same-origin
      // only — cross-origin reads throw and are ignored.
      try {
        const path = iframe.contentWindow.location.pathname;
        const file = path.substring(path.lastIndexOf('/') + 1);
        const detected = Object.keys(MODES).find((k) => MODES[k].file === file);
        if (detected && detected !== mode) {
          // Rebind this iframe to the mode the user navigated it to. Rare,
          // but possible if a child does location.href = '../combat.html'.
          iframes.delete(mode);
          iframe.dataset.mode = detected;
          iframes.set(detected, iframe);
          if (currentMode === mode) {
            currentMode = detected;
            titleEl.textContent = MODES[detected].title;
            popOut.href = MODES[detected].file;
            updateActiveButton(detected);
            suppressHashChange = true;
            const newHash = '#' + detected;
            if (location.hash !== newHash) {
              history.replaceState({ mode: detected }, '', newHash);
            }
            setTimeout(() => { suppressHashChange = false; }, 0);
          }
        }
      } catch (e) {
        // Cross-origin or about:blank — ignore.
      }
    });

    frameWrap.appendChild(iframe);
    iframes.set(mode, iframe);
    return iframe;
  }

  function hideAllIframes() {
    iframes.forEach((iframe) => { iframe.hidden = true; });
  }

  // ── Public navigation ──────────────────────────────────
  function navigate(mode, opts) {
    opts = opts || {};
    if (!MODES[mode]) {
      showWelcome();
      return;
    }
    if (mode === currentMode && !opts.force) {
      return;
    }
    currentMode = mode;

    welcome.hidden = true;

    const iframe = getOrCreateIframe(mode);
    const isLoaded = iframe.dataset.loaded === '1';
    hideAllIframes();
    iframe.hidden = false;
    frameWrap.classList.toggle('is-loading', !isLoaded);

    titleEl.textContent = MODES[mode].title;
    popOut.href = MODES[mode].file;
    popOut.classList.remove('is-disabled');

    updateActiveButton(mode);

    try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) { /* ignore */ }

    if (!opts.skipHash) {
      suppressHashChange = true;
      const newHash = '#' + mode;
      if (location.hash !== newHash) {
        history.pushState({ mode }, '', newHash);
      }
      setTimeout(() => { suppressHashChange = false; }, 0);
    }

    closeMobileSidebar();
  }

  function showWelcome() {
    currentMode = null;
    hideAllIframes();
    frameWrap.classList.remove('is-loading');
    welcome.hidden = false;
    titleEl.textContent = 'Welcome';
    popOut.href = '#';
    popOut.classList.add('is-disabled');
    updateActiveButton(null);
    suppressHashChange = true;
    if (location.hash) {
      history.pushState({ mode: null }, '', location.pathname + location.search);
    }
    setTimeout(() => { suppressHashChange = false; }, 0);
  }

  function updateActiveButton(mode) {
    const all = sidebar.querySelectorAll('.launcher-nav-item');
    all.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.mode === mode);
    });
  }

  // ── Event wiring ───────────────────────────────────────
  sidebar.addEventListener('click', (e) => {
    const btn = e.target.closest('.launcher-nav-item');
    if (!btn) return;
    navigate(btn.dataset.mode);
  });

  welcome.addEventListener('click', (e) => {
    const card = e.target.closest('.launcher-card');
    if (!card) return;
    navigate(card.dataset.mode);
  });

  window.addEventListener('hashchange', () => {
    if (suppressHashChange) return;
    const mode = location.hash.slice(1);
    if (mode && MODES[mode]) {
      navigate(mode, { skipHash: true });
    } else if (!mode) {
      showWelcome();
    }
  });

  collapseBtn.addEventListener('click', () => {
    const collapsed = shell.classList.toggle('is-collapsed');
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch (e) { /* ignore */ }
  });

  menuToggle.addEventListener('click', () => {
    shell.classList.toggle('is-mobile-open');
  });

  function closeMobileSidebar() {
    shell.classList.remove('is-mobile-open');
  }

  // Click outside on mobile closes sidebar
  document.addEventListener('click', (e) => {
    if (!shell.classList.contains('is-mobile-open')) return;
    if (sidebar.contains(e.target)) return;
    if (menuToggle.contains(e.target)) return;
    closeMobileSidebar();
  });

  // ── Initial state ──────────────────────────────────────
  try {
    if (localStorage.getItem(COLLAPSE_KEY) === '1') {
      shell.classList.add('is-collapsed');
    }
  } catch (e) { /* ignore */ }

  function bootstrap() {
    const hashMode = location.hash.slice(1);
    if (hashMode && MODES[hashMode]) {
      navigate(hashMode, { skipHash: true });
      return;
    }
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    if (saved && MODES[saved]) {
      navigate(saved, { skipHash: true });
      return;
    }
    showWelcome();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
