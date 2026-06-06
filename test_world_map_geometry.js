// test_world_map_geometry.js — locks the typed SVG-primitive geometry that the
// switch-plan island closeout introduced in campaign-world-map's getTravelMapData.
//
// The travel-map SVG used to be emitted as raw-SVG strings (backdropImageHtml /
// layersHtml / roadsHtml / linksHtml / node.innerSvg) and inserted with
// dangerouslySetInnerHTML. It is now emitted as typed { t: 'rect' | 'path' | … }
// objects that React renders as real elements. This test feeds the engine a
// hand-authored visual + classic map and asserts the structured geometry
// (coordinates, classes, transforms) matches the documented math exactly — the
// engine-side parity check the JSX VR snapshot (which uses a hand-built fixture)
// cannot give on its own. It also guards that the old HTML-string fields are
// gone.
//
// Run: node test_world_map_geometry.js

const vm = require('vm');
const { loadEngineSource } = require('./tools/test/engine-source.cjs');

const sandbox = {
  window: { CJS: {} },
  console, Math, Object, Array, String, Number, Boolean, JSON, Map, Set,
  RegExp, Error, parseInt, parseFloat, isNaN, isFinite, undefined
};
vm.createContext(sandbox);

try {
  vm.runInContext(loadEngineSource('campaign/campaign-world-map'), sandbox);
} catch (e) {
  console.error('LOAD ERROR: campaign/campaign-world-map:', e.message);
  process.exit(1);
}

const CJS = sandbox.window.CJS;
const CWM = CJS.CampaignWorldMap;

// ── Stubbed engine surface getTravelMapData reads ────────────────────────────
const worlds = {
  haven: { displayName: 'Haven', storyModeTheme: { mapBackdrop: 'images/haven/map.webp' } }
};
const travelMaps = {};
let currentState = null;

CJS.CampaignState = { getState: () => currentState };
CJS.DataStore = {
  get: (bucket, id) =>
    bucket === 'worlds' ? (worlds[id] || null)
      : bucket === 'travelMaps' ? (travelMaps[id] || null)
        : null,
  getAllAsArray: (bucket) => (bucket === 'travelMaps' ? Object.values(travelMaps) : [])
};
CJS.CampaignDataLoader = {
  getWorldActivities: () => [
    { id: 'a1', type: 'gather', title: 'Barter at the docks', locationIds: ['n_commons'] },
    { id: 'a2', type: 'rumor', title: 'Listen for rumors', locationIds: ['n_commons'] }
  ],
  getWorldActivityPacks: () => []
};

// ── Fixture map (visual mode = vn_travel) ────────────────────────────────────
function baseMap(extra) {
  return Object.assign({
    id: 'tm_haven',
    world: 'haven',
    name: 'Haven Travel Map',
    canvas: { width: 760, height: 430 },
    visualBackdrop: 'images/haven/map.webp',
    defaultLocationId: 'n_commons',
    visualLayers: [
      { type: 'rect', x: 40, y: 300, width: 680, height: 90, rx: 12, kind: 'water' },
      { type: 'ellipse', cx: 180, cy: 140, rx: 60, ry: 38, kind: 'isle' },
      { type: 'line', x1: 0, y1: 215, x2: 760, y2: 215, kind: 'border' },
      { type: 'polygon', points: '300,80 360,40 420,80', kind: 'ridge' },
      { type: 'polyline', points: '120,360 240,330 380,350', kind: 'trail' },
      { type: 'text', x: 120, y: 60, text: 'North Reach', kind: 'label' },
      { type: 'path', d: 'M 0 260 Q 380 230 760 270', kind: 'coast' }
    ],
    links: [{ from: 'n_commons', to: 'n_crossing', route: 'coastal', risk: 'amber' }],
    legend: [{ kind: 'safe', label: 'Safe route' }, { kind: 'amber', label: 'Caution' }],
    areaButtons: [
      { mapId: 'tm_haven', label: 'Harbor Ward', summary: 'You are here.' },
      { mapId: 'tm_highland', label: 'Highland Pass', summary: "A day's climb north." },
      { label: 'Sunken Vault', status: 'dev', summary: 'Planned for a later update.' }
    ],
    nodes: [
      {
        id: 'n_commons', name: 'Tidewater Commons', type: 'hub',
        description: 'The salt-worn plaza where every road in Haven meets.',
        x: 200, y: 200,
        visual: { shape: 'home', activeMarkerScale: 1.15, activeMarkerOpacity: 0.95, activeLabelScale: 1.1, activeLabelOpacity: 1 },
        people: [{ id: 'p_harbormaster', name: 'Harbormaster Vell', summary: 'Trade routes and tides.' }],
        actions: [{ id: 'a_postbill', name: 'Post a bounty', summary: 'Pin a job to the board.' }]
      },
      { id: 'n_crossing', name: 'Old Crossing', type: 'route', x: 520, y: 150, visual: { shape: 'route' } }
    ]
  }, extra);
}

const stateFor = () => ({
  currentWorld: 'haven',
  worldProgress: {
    haven: {
      currentTravelMap: 'tm_haven', currentLocation: 'n_commons',
      currentZone: 'harbor', visitedLocations: ['n_commons', 'n_crossing']
    }
  }
});

// ── Harness ──────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
function ok(label, cond, info) {
  if (cond) { pass += 1; console.log('  OK  ' + label + (info ? ' (' + info + ')' : '')); }
  else { fail += 1; console.log('  XX  ' + label + (info ? ' (' + info + ')' : '')); }
}
function eq(label, actual, expected) {
  ok(label, JSON.stringify(actual) === JSON.stringify(expected),
    `got ${JSON.stringify(actual)}`);
}

console.log('World-map travel geometry (typed SVG primitives)');

// ── Visual mode ──────────────────────────────────────────────────────────────
travelMaps.tm_haven = baseMap({ visualMode: 'vn_travel' });
currentState = stateFor();
const v = CWM.getTravelMapData(currentState);

ok('visual: hasMap + mode', v && v.hasMap === true && v.mode === 'visual');
eq('visual: canvas', v.canvas, { width: 760, height: 430 });
ok('visual: backdropVar resolves through theme helper',
  v.backdropVar === "url('images/haven/map.webp')", v.backdropVar);

// Old HTML-string island fields must be gone.
ok('visual: no linksHtml/layersHtml/roadsHtml/backdropImageHtml fields',
  !('linksHtml' in v) && !('layersHtml' in v) && !('roadsHtml' in v) && !('backdropImageHtml' in v));

// Backdrop: <image> + shade <rect>.
eq('visual: backdrop image primitive', v.backdrop[0],
  { t: 'image', className: 'campaign-world-map-image', href: 'images/haven/map.webp', x: 0, y: 0, width: 760, height: 430, preserveAspectRatio: 'xMidYMid slice' });
eq('visual: backdrop shade rect primitive', v.backdrop[1],
  { t: 'rect', className: 'campaign-world-map-image-shade', x: 0, y: 0, width: 760, height: 430, rx: 18 });

// Layers: one of every primitive type, class = world-layer + kind + type.
ok('visual: 7 layer primitives', v.layers.length === 7, String(v.layers.length));
eq('visual: rect layer', v.layers[0],
  { t: 'rect', className: 'campaign-world-layer layer-water layer-type-rect', x: 40, y: 300, width: 680, height: 90, rx: 12 });
eq('visual: ellipse layer', v.layers[1],
  { t: 'ellipse', className: 'campaign-world-layer layer-isle layer-type-ellipse', cx: 180, cy: 140, rx: 60, ry: 38 });
eq('visual: line layer', v.layers[2],
  { t: 'line', className: 'campaign-world-layer layer-border layer-type-line', x1: 0, y1: 215, x2: 760, y2: 215 });
eq('visual: polygon layer', v.layers[3],
  { t: 'polygon', className: 'campaign-world-layer layer-ridge layer-type-polygon', points: '300,80 360,40 420,80' });
eq('visual: polyline layer', v.layers[4],
  { t: 'polyline', className: 'campaign-world-layer layer-trail layer-type-polyline', points: '120,360 240,330 380,350' });
eq('visual: text layer', v.layers[5],
  { t: 'text', className: 'campaign-world-layer layer-label layer-type-text', x: 120, y: 60, text: 'North Reach' });
eq('visual: path layer (default branch)', v.layers[6],
  { t: 'path', className: 'campaign-world-layer layer-coast layer-type-path', d: 'M 0 260 Q 380 230 760 270' });

// Roads: quadratic bézier path with route/risk classes (midpoint math).
eq('visual: road bézier primitive', v.roads[0],
  { t: 'path', className: 'campaign-world-road route-coastal risk-amber', d: 'M 200 200 Q 360 175 520 150' });

// Active node (shape 'home', x200 y200): marker group + label + preview.
const home = v.nodes.find((n) => n.nodeId === 'n_commons');
ok('visual: active node classes', home.classes === 'campaign-world-node campaign-world-visual-node is-home is-active is-visited', home.classes);
eq('visual: marker group transform + opacity', { transform: home.marker.transform, opacity: home.marker.opacity, className: home.marker.className },
  { transform: 'translate(200 200) scale(1.15) translate(-200 -200)', opacity: 0.95, className: 'campaign-world-node-marker' });
ok('visual: home marker has 4 shapes', home.marker.shapes.length === 4, String(home.marker.shapes.length));
eq('visual: home main rect', home.marker.shapes[0],
  { t: 'rect', className: 'node-building node-building-main', x: 163, y: 185, width: 74, height: 46, rx: 5 });
eq('visual: home roof polygon', home.marker.shapes[1],
  { t: 'polygon', className: 'node-building node-building-roof', points: '200,174 237,192 163,192' });
eq('visual: home window rects', [home.marker.shapes[2], home.marker.shapes[3]], [
  { t: 'rect', className: 'node-window', x: 176, y: 198, width: 10, height: 10 },
  { t: 'rect', className: 'node-window', x: 214, y: 198, width: 10, height: 10 }
]);
eq('visual: label box geometry + text', home.label,
  { x: 126, y: 234, width: 148, height: 34, transform: 'translate(200 251) scale(1.1) translate(-200 -251)', opacity: 1, text: 'Tidewater Commons' });
eq('visual: preview panel', home.preview,
  { x: 218, y: 88, width: 214, height: 98, name: 'Tidewater Commons', description: 'The salt-worn plaza where every road in Haven meets.', activityText: '2 activities here' });

// Inactive node (shape 'route'): no marker transform/opacity (scale==1).
const cross = v.nodes.find((n) => n.nodeId === 'n_crossing');
ok('visual: inactive node omits marker transform/opacity',
  cross.marker.transform === undefined && cross.marker.opacity === undefined);
eq('visual: route marker shapes', cross.marker.shapes, [
  { t: 'circle', className: 'node-route-ring', cx: 520, cy: 150, r: 24 },
  { t: 'path', className: 'node-route-line', d: 'M 497 155 C 512 137, 528 169, 544 150' },
  { t: 'circle', className: 'node-route-dot', cx: 520, cy: 150, r: 5 }
]);

// Area switcher: current / travel / dev classification.
ok('visual: area switcher 3 buttons', v.areaSwitcher && v.areaSwitcher.buttons.length === 3);
eq('visual: area buttons', v.areaSwitcher.buttons, [
  { label: 'Harbor Ward', sublabel: 'Current', active: true, dev: false, switchMapId: null, title: 'You are here.' },
  { label: 'Highland Pass', sublabel: 'Travel', active: false, dev: false, switchMapId: 'tm_highland', title: "A day's climb north." },
  { label: 'Sunken Vault', sublabel: 'Future', active: false, dev: true, switchMapId: null, title: 'Planned for a later update.' }
]);

// No leftover innerSvg on nodes.
ok('visual: nodes carry no innerSvg string', v.nodes.every((n) => !('innerSvg' in n)));

// ── Classic mode (no visualMode) ─────────────────────────────────────────────
travelMaps.tm_haven = baseMap({});
currentState = stateFor();
const c = CWM.getTravelMapData(currentState);

ok('classic: hasMap + mode', c && c.hasMap === true && c.mode === 'classic');
ok('classic: no layers/roads/backdrop fields',
  !('layers' in c) && !('roads' in c) && !('backdrop' in c) && !('linksHtml' in c));
eq('classic: link line primitive', c.links[0],
  { t: 'line', className: 'campaign-world-link', x1: 200, y1: 200, x2: 520, y2: 150 });
const cCommons = c.nodes.find((n) => n.nodeId === 'n_commons');
ok('classic: active node classes', cCommons.classes === 'campaign-world-node is-active is-visited', cCommons.classes);
eq('classic: active node circle', cCommons.circle, { cx: 200, cy: 200, r: 20 });
eq('classic: active node label', cCommons.label, { x: 200, y: 234, text: 'Tidewater Commons' });
const cCross = c.nodes.find((n) => n.nodeId === 'n_crossing');
eq('classic: inactive node circle radius', cCross.circle, { cx: 520, cy: 150, r: 16 });
ok('classic: nodes carry no innerSvg string', c.nodes.every((n) => !('innerSvg' in n)));

// ── No-map guards ─────────────────────────────────────────────────────────────
ok('returns hasMap:false when state is null', CWM.getTravelMapData(null).hasMap === false);
delete travelMaps.tm_haven;
currentState = stateFor();
ok('returns hasMap:false when no map resolves', CWM.getTravelMapData(currentState).hasMap === false);

console.log('');
console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
