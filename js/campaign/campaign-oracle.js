// campaign-oracle.js
// Non-AI random prompt generator for GM inspiration.

window.CJS = window.CJS || {};

window.CJS.CampaignOracle = (() => {
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

  function roll(overrides = {}) {
    const tables = { ...TABLES, ...(overrides.tables || {}) };
    const result = {
      adjective: pick(tables.adjectives),
      noun: pick(tables.nouns),
      verb: pick(tables.verbs),
      object: pick(tables.objects),
      twist: pick(tables.twists),
      effect: pick(tables.effects)
    };
    result.text = `The ${result.adjective} ${result.noun} ${result.verb} ${result.object}, but ${result.twist}. Suggested effect: ${result.effect}.`;
    return result;
  }

  return Object.freeze({ roll });
})();
