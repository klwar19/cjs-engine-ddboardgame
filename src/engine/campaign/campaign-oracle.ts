// campaign-oracle.ts — Tier 3 TS port of js/campaign/campaign-oracle.js (engine
// cluster: campaign). Non-AI random prompt generator for GM inspiration (roll).
// DOM-free; reads window.CJS.* lazily. Exports `CampaignOracle` and installs
// window.CJS.CampaignOracle. Body verbatim from the legacy IIFE.

window.CJS = window.CJS || {};

export const CampaignOracle = (() => {
  'use strict';

  const TABLES = {
    adjectives: ['frostbitten', 'suspicious', 'laughing', 'silent', 'hungry', 'broken', 'ancient', 'counterfeit', 'jealous', 'glowing'],
    nouns: ['merchant', 'wolf', 'lantern', 'shrine', 'recipe', 'coin', 'mask', 'contract', 'mushroom', 'bell'],
    verbs: ['whispers to', 'steals from', 'follows', 'demands', 'breaks', 'remembers', 'imitates', 'sells', 'hides', 'reveals'],
    objects: ['the party', 'Bin shadow', 'a quest item', 'the nearest shop', 'a cooking ingredient', 'a farm crop', 'the next battle', 'an old debt'],
    twists: ['it is not hostile', 'someone already paid for it', 'the price is a memory', 'it only reacts to jokes', 'using it increases danger', 'it unlocks a side quest'],
    effects: ['gain 1 random material', 'lose 1 ration', 'gain a next-battle buff', 'gain a next-battle nerf', 'danger +1', 'unlock a recipe', 'trigger optional battle']
  };

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function _activeWorldTable() {
    const CS = window.CJS.CampaignState;
    const Loader = window.CJS.CampaignDataLoader;
    if (!CS || !Loader) return null;
    const world = CS.getState()?.currentWorld;
    const tables = Loader.getOracleTables ? Loader.getOracleTables(world || null) : [];
    return tables[0] || null;
  }

  function roll(overrides: any = {}) {
    const worldTable = _activeWorldTable();
    if (worldTable && Math.random() < 0.5 && Array.isArray(worldTable.prompts) && worldTable.prompts.length) {
      const prompt = pick(worldTable.prompts);
      return {
        id: prompt.id,
        text: prompt.text,
        tableId: worldTable.id,
        tableName: worldTable.name,
        canonRisk: prompt.canonRisk,
        tags: prompt.tags || []
      };
    }
    const merged = {
      adjectives: TABLES.adjectives,
      nouns: TABLES.nouns,
      verbs: TABLES.verbs,
      objects: TABLES.objects,
      twists: TABLES.twists,
      effects: TABLES.effects,
      ...(worldTable?.tables || {}),
      ...(overrides.tables || {})
    };
    const result: any = {
      adjective: pick(merged.adjectives),
      noun: pick(merged.nouns),
      verb: pick(merged.verbs),
      object: pick(merged.objects),
      twist: pick(merged.twists),
      effect: pick(merged.effects)
    };
    result.text = `The ${result.adjective} ${result.noun} ${result.verb} ${result.object}, but ${result.twist}. Suggested effect: ${result.effect}.`;
    if (worldTable) {
      result.tableId = worldTable.id;
      result.tableName = worldTable.name;
    }
    return result;
  }

  return Object.freeze({ roll });
})();

// Runtime compatibility install — identical to the legacy IIFE.
window.CJS.CampaignOracle = CampaignOracle;
