// narrator-data.js
// Loads quips.json and builds a fast search index by tag.
// Each fragment lives in one of four narrative layers:
//   action       — "Bin slashes at the Ice Wolf!"
//   damage       — "12 fire damage! It's not happy."
//   context      — "The wolf is on its last legs."
//   cjs_editorial — "[CJS] Peri's popcorn budget: justified."
//
// Reads: data/quips.json (fetched or injected)
// Used by: narrator-engine.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.NarratorData = (() => {
  'use strict';

  // ── STATE ──────────────────────────────────────────────────────────
  let _fragments = [];         // raw array from quips.json
  let _byLayer = {};           // { layer: [fragment, ...] }
  let _tagIndex = {};          // { tag: Set<fragmentIndex> }
  let _loaded = false;

  const LAYERS = ['action', 'damage', 'context', 'cjs_editorial'];

  // ── LOAD ──────────────────────────────────────────────────────────
  async function load(urlOrData) {
    let data;
    if (typeof urlOrData === 'string') {
      const resp = await fetch(urlOrData);
      data = await resp.json();
    } else if (Array.isArray(urlOrData)) {
      data = urlOrData;
    } else if (urlOrData?.fragments) {
      data = urlOrData.fragments;
    } else {
      console.warn('NarratorData.load: unexpected format');
      data = [];
    }

    _fragments = data.map((f, i) => ({
      idx: i,
      layer: f.layer || 'cjs_editorial',
      text: f.text || '',
      required_tags: f.required_tags || [],
      excluded_tags: f.excluded_tags || [],
      weight: f.weight ?? 5,
      id: f.id || `frag_${i}`
    }));

    _buildIndex();
    _loaded = true;
    console.log(`NarratorData: loaded ${_fragments.length} fragments`);
  }

  function _buildIndex() {
    _byLayer = {};
    _tagIndex = {};

    for (const layer of LAYERS) {
      _byLayer[layer] = [];
    }

    for (let i = 0; i < _fragments.length; i++) {
      const f = _fragments[i];

      // Layer bucket
      if (!_byLayer[f.layer]) _byLayer[f.layer] = [];
      _byLayer[f.layer].push(f);

      // Tag index: index by every required tag
      for (const tag of f.required_tags) {
        if (!_tagIndex[tag]) _tagIndex[tag] = new Set();
        _tagIndex[tag].add(i);
      }
    }
  }

  // ── QUERY ─────────────────────────────────────────────────────────
  // Find fragments for a given layer whose required_tags are ALL present
  // in the provided tagSet, and whose excluded_tags are NONE present.
  // Returns sorted by score (descending).
  function findMatches(layer, tagSet) {
    const candidates = _byLayer[layer] || [];
    const tagArray = tagSet instanceof Set ? tagSet : new Set(tagSet);
    const results = [];

    for (const f of candidates) {
      // All required tags must be present
      const allRequired = f.required_tags.every(t => tagArray.has(t));
      if (!allRequired) continue;

      // No excluded tags present
      if (f.excluded_tags.length > 0) {
        const anyExcluded = f.excluded_tags.some(t => tagArray.has(t));
        if (anyExcluded) continue;
      }

      // Score: weight + 2 per matching required tag (more specific = higher)
      const score = f.weight + (f.required_tags.length * 2);
      results.push({ fragment: f, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  // Quick check: are there any fragments at all?
  function isLoaded() { return _loaded; }
  function count()    { return _fragments.length; }

  function getLayerCounts() {
    const counts = {};
    for (const layer of LAYERS) {
      counts[layer] = (_byLayer[layer] || []).length;
    }
    return counts;
  }

  // Get all unique tags used across all fragments (for debug)
  function getAllTags() {
    return Object.keys(_tagIndex);
  }

  // ── PUBLIC API ────────────────────────────────────────────────────
  return Object.freeze({
    load,
    findMatches,
    isLoaded,
    count,
    getLayerCounts,
    getAllTags,
    LAYERS
  });
})();
