// loot-roller.js
// Post-combat loot system. Rolls drops from defeated enemy loot tables,
// applies Luck bonuses, and displays results.

window.CJS = window.CJS || {};

window.CJS.LootRoller = (() => {
  'use strict';

  const DS = () => window.CJS.DataStore;
  const C  = () => window.CJS.CONST;

  function rollLoot(enemies, killerLuck) {
    const luck = killerLuck || 5;
    const drops = [];

    for (const enemy of enemies || []) {
      const monsterData = DS().get('monsters', enemy.baseId || enemy.id);
      const lootTable = monsterData?.loot || enemy.loot || [];
      const modifierLootBoost = Math.max(1, Number(enemy.modifierLootBoost || 1));

      for (const entry of lootTable) {
        const baseChance = entry.chance || 0.5;
        const effectiveChance = Math.min(0.95, (baseChance + luck * 0.02) * modifierLootBoost);
        const roll = Math.random();
        if (roll > effectiveChance) continue;
        const item = DS().get('items', entry.itemId);
        drops.push({
          itemId: entry.itemId,
          name: item?.name || entry.itemId,
          icon: item?.icon || '*',
          rarity: item?.rarity || 'Common',
          quantity: entry.quantity || 1,
          source: enemy.name || enemy.baseId || 'Unknown',
          roll: Math.round(roll * 100),
          needed: Math.round(effectiveChance * 100)
        });
      }

      const rankGold = _goldByRank(monsterData?.rank || enemy.rank || 'F');
      const goldAmount = Math.floor(rankGold * (0.8 + Math.random() * 0.4) * modifierLootBoost);
      if (goldAmount > 0) {
        drops.push({
          itemId: '__gold__',
          name: 'Gold',
          icon: '$',
          rarity: 'Common',
          quantity: goldAmount,
          source: enemy.name || enemy.baseId || 'Unknown',
          isGold: true
        });
      }

      const jpAmount = Math.max(1, Math.floor((2 + Math.random() * 3) * modifierLootBoost));
      drops.push({
        itemId: '__jp__',
        name: 'Jester Points',
        icon: 'JP',
        rarity: 'Legendary',
        quantity: jpAmount,
        source: 'CJS Reward',
        isJP: true
      });
    }

    return drops;
  }

  function _goldByRank(rank) {
    const table = {
      F: 10, E: 25, D: 60, C: 120, B: 250,
      A: 500, S: 1000, SR: 2500, SSR: 5000
    };
    return table[rank] || 10;
  }

  function rollAndDisplay(enemies, containerEl) {
    const state = window.CJS.CombatManager?.getState?.();
    let maxLuck = 5;
    if (state) {
      for (const unit of Object.values(state.units || {})) {
        if (unit.team === 'player' && unit.currentHP > 0) {
          const luck = unit.compiledStats?.L || 5;
          if (luck > maxLuck) maxLuck = luck;
        }
      }
    }

    const drops = rollLoot(enemies, maxLuck);
    _renderLoot(drops, containerEl);
    return drops;
  }

  function _renderLoot(drops, containerEl) {
    if (!containerEl) return;
    const rarityColors = C().RARITY_COLORS || {};
    const items = drops.filter((drop) => !drop.isGold && !drop.isJP);
    const gold = drops.filter((drop) => drop.isGold).reduce((sum, drop) => sum + drop.quantity, 0);
    const jp = drops.filter((drop) => drop.isJP).reduce((sum, drop) => sum + drop.quantity, 0);

    let html = '<div class="loot-panel">';
    html += '<h3 class="loot-title">Loot Drops</h3>';
    html += '<div class="loot-currency">';
    if (gold > 0) html += `<span class="loot-gold">$ ${gold} Gold</span>`;
    if (jp > 0) html += `<span class="loot-jp">JP ${jp}</span>`;
    html += '</div>';

    if (items.length > 0) {
      html += '<div class="loot-items">';
      for (const drop of items) {
        const color = rarityColors[drop.rarity] || '#9ca3af';
        html += `<div class="loot-item" style="border-color:${_escAttr(color)}">
          <span class="loot-icon">${_escHtml(drop.icon)}</span>
          <div class="loot-details">
            <span class="loot-name" style="color:${_escAttr(color)}">${_escHtml(drop.name)}</span>
            <span class="loot-rarity">${_escHtml(drop.rarity)}</span>
            <span class="loot-source">from ${_escHtml(drop.source)}</span>
          </div>
          ${drop.quantity > 1 ? `<span class="loot-qty">x${drop.quantity}</span>` : ''}
        </div>`;
      }
      html += '</div>';
    } else {
      html += '<p class="loot-empty">No item drops this time.</p>';
    }

    html += '<button class="btn btn-primary loot-close">Close</button>';
    html += '</div>';
    containerEl.innerHTML = html;

    const lootItems = containerEl.querySelectorAll('.loot-item');
    lootItems.forEach((el, index) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      setTimeout(() => {
        el.style.transition = 'opacity 0.3s, transform 0.3s';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, 100 + index * 80);
    });

    containerEl.querySelector('.loot-close')?.addEventListener('click', () => {
      containerEl.innerHTML = '<div class="action-wait">Combat complete.</div>';
    });
  }

  function _escHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function _escAttr(value) {
    return _escHtml(value);
  }

  return Object.freeze({
    rollLoot,
    rollAndDisplay
  });
})();
