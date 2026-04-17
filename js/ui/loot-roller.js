// loot-roller.js
// Post-combat loot system. Rolls drops from defeated enemy loot tables,
// applies Luck bonuses, and displays results.
//
// Reads: DataStore (monster loot tables, item data), constants (rarity colors)
// Used by: combat-ui.js (battle end screen)
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.LootRoller = (() => {
  'use strict';

  const DS = () => window.CJS.DataStore;
  const C  = () => window.CJS.CONST;

  // ── ROLL LOOT FROM DEFEATED ENEMIES ───────────────────────────────
  // enemies: array of defeated unit objects (compiled units)
  // killerLuck: highest Luck stat among surviving player units
  function rollLoot(enemies, killerLuck) {
    const luck = killerLuck || 5;
    const drops = [];

    for (const enemy of enemies) {
      // Look up monster data for loot table
      const monsterData = DS().get('monsters', enemy.baseId || enemy.id);
      const lootTable = monsterData?.loot || enemy.loot || [];

      if (lootTable.length === 0) continue;

      for (const entry of lootTable) {
        const baseChance = entry.chance || 0.5;
        // Effective Drop Chance = base_chance + (Killer's Luck × 0.02), cap 0.95
        const effectiveChance = Math.min(0.95, baseChance + luck * 0.02);
        const roll = Math.random();

        if (roll <= effectiveChance) {
          const item = DS().get('items', entry.itemId);
          drops.push({
            itemId: entry.itemId,
            name: item?.name || entry.itemId,
            icon: item?.icon || '📦',
            rarity: item?.rarity || 'Common',
            quantity: entry.quantity || 1,
            source: enemy.name || enemy.baseId || 'Unknown',
            roll: Math.round(roll * 100),
            needed: Math.round(effectiveChance * 100)
          });
        }
      }

      // Gold drop (always, based on rank)
      const rankGold = _goldByRank(monsterData?.rank || enemy.rank || 'F');
      const goldAmount = Math.floor(rankGold * (0.8 + Math.random() * 0.4));
      if (goldAmount > 0) {
        drops.push({
          itemId: '__gold__',
          name: 'Gold',
          icon: '🪙',
          rarity: 'Common',
          quantity: goldAmount,
          source: enemy.name || enemy.baseId || 'Unknown',
          isGold: true
        });
      }

      // JP drop (small amount, based on interesting combat)
      const jpAmount = Math.floor(2 + Math.random() * 3);
      drops.push({
        itemId: '__jp__',
        name: 'Jester Points',
        icon: '🃏',
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

  // ── DISPLAY LOOT ──────────────────────────────────────────────────
  function rollAndDisplay(enemies, containerEl) {
    // Find max player luck
    const state = window.CJS.CombatManager?.getState();
    let maxLuck = 5;
    if (state) {
      for (const u of Object.values(state.units)) {
        if (u.team === 'player' && u.currentHP > 0) {
          const luck = u.compiledStats?.L || 5;
          if (luck > maxLuck) maxLuck = luck;
        }
      }
    }

    const drops = rollLoot(enemies, maxLuck);
    _renderLoot(drops, containerEl);
    return drops;
  }

  function _renderLoot(drops, containerEl) {
    const rarityColors = C().RARITY_COLORS || {};

    // Group by type
    const items = drops.filter(d => !d.isGold && !d.isJP);
    const gold = drops.filter(d => d.isGold).reduce((sum, d) => sum + d.quantity, 0);
    const jp = drops.filter(d => d.isJP).reduce((sum, d) => sum + d.quantity, 0);

    let html = '<div class="loot-panel">';
    html += '<h3 class="loot-title">🎁 Loot Drops</h3>';

    // Currency summary
    html += '<div class="loot-currency">';
    if (gold > 0) html += `<span class="loot-gold">🪙 ${gold} Gold</span>`;
    if (jp > 0) html += `<span class="loot-jp">🃏 ${jp} JP</span>`;
    html += '</div>';

    // Item drops
    if (items.length > 0) {
      html += '<div class="loot-items">';
      for (const drop of items) {
        const color = rarityColors[drop.rarity] || '#9ca3af';
        html += `<div class="loot-item" style="border-color:${color}">
          <span class="loot-icon">${drop.icon}</span>
          <div class="loot-details">
            <span class="loot-name" style="color:${color}">${drop.name}</span>
            <span class="loot-rarity">${drop.rarity}</span>
            <span class="loot-source">from ${drop.source}</span>
          </div>
          ${drop.quantity > 1 ? `<span class="loot-qty">×${drop.quantity}</span>` : ''}
        </div>`;
      }
      html += '</div>';
    } else {
      html += '<p class="loot-empty">No item drops this time.</p>';
    }

    html += '<button class="btn btn-primary loot-close">Close</button>';
    html += '</div>';

    containerEl.innerHTML = html;

    // Animate items in
    const lootItems = containerEl.querySelectorAll('.loot-item');
    lootItems.forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      setTimeout(() => {
        el.style.transition = 'opacity 0.3s, transform 0.3s';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, 100 + i * 80);
    });

    containerEl.querySelector('.loot-close')?.addEventListener('click', () => {
      containerEl.innerHTML = '<div class="action-wait">Combat complete.</div>';
    });
  }

  // ── PUBLIC API ────────────────────────────────────────────────────
  return Object.freeze({
    rollLoot,
    rollAndDisplay
  });
})();
