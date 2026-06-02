// env.cjs — a minimal browser-global shim for server-rendering the campaign
// React tree in Node (no jsdom dependency).
//
// `react-dom/server.renderToStaticMarkup` never touches the DOM, so we only
// need the globals the component/util/store modules reference at module-load
// or inside render (e.g. `window.CJS`, `document.querySelector`, the
// `ResizeObserver` the VirtualList captures). All of it is inert: stores write
// nowhere, queries return null/empty. This mirrors the sandbox in
// test_campaign_ui_bootstrap.js, widened for the render path.

// Pin date formatting so snapshots are identical on any host. The campaign
// code calls `date.toLocaleString(...)` (session log, event log, save slots),
// whose output depends on the machine's timezone AND default locale — a
// guaranteed source of flaky cross-machine diffs. We force en-US + UTC for
// every toLocale* call (respecting the caller's field options), and set TZ=UTC
// for any raw Date math. This is a harness shim, exactly like the DOM stubs.
function pinDateFormatting() {
  process.env.TZ = "UTC";
  const force = (orig) =>
    function (_locales, options) {
      return orig.call(this, "en-US", Object.assign({}, options, { timeZone: "UTC" }));
    };
  if (!Date.prototype.__cjsVrPinned) {
    Date.prototype.toLocaleString = force(Date.prototype.toLocaleString);
    Date.prototype.toLocaleDateString = force(Date.prototype.toLocaleDateString);
    Date.prototype.toLocaleTimeString = force(Date.prototype.toLocaleTimeString);
    Object.defineProperty(Date.prototype, "__cjsVrPinned", { value: true });
  }
}

function installEnv() {
  pinDateFormatting();
  if (globalThis.window && globalThis.window.__cjsVrEnv) return globalThis.window;

  const noop = () => {};
  const elementStub = () => ({
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    style: {},
    dataset: {},
    setAttribute: noop,
    removeAttribute: noop,
    appendChild: noop,
    removeChild: noop,
    addEventListener: noop,
    removeEventListener: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null
  });

  const documentStub = {
    addEventListener: noop,
    removeEventListener: noop,
    createElement: elementStub,
    createTextNode: (t) => ({ textContent: t }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { classList: { contains: () => false, add: noop, remove: noop }, appendChild: noop },
    documentElement: { style: { setProperty: noop } }
  };

  const win = {
    __cjsVrEnv: true,
    CJS: {},
    document: documentStub,
    addEventListener: noop,
    removeEventListener: noop,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    location: {
      href: "http://localhost/cjs-engine-ddboardgame/campaign.html",
      search: "",
      hash: "",
      pathname: "/cjs-engine-ddboardgame/campaign.html"
    },
    navigator: { userAgent: "node-vr", clipboard: { writeText: () => Promise.resolve() } },
    devicePixelRatio: 1
  };
  win.window = win;

  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  class IntersectionObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  globalThis.window = win;
  globalThis.document = documentStub;
  globalThis.navigator = win.navigator;
  globalThis.location = win.location;
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  globalThis.cancelAnimationFrame = noop;
  globalThis.matchMedia = win.matchMedia;
  globalThis.getComputedStyle = win.getComputedStyle;
  globalThis.ResizeObserver = ResizeObserverStub;
  globalThis.IntersectionObserver = IntersectionObserverStub;
  globalThis.devicePixelRatio = 1;

  return win;
}

module.exports = { installEnv };
