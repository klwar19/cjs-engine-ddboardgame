// guild-trivia.js
// Guild Trivia Nights — tavern event using the qte-quiz UI for short
// trivia rounds. Questions ask about world lore, history, and party
// member backstories. Winners earn JP and small relationship boosts
// with whoever is currently in the party.
//
// API:
//   await window.CJS.GuildTrivia.run({
//     world?,            // filter the question pool (defaults to current)
//     category?,         // 'lore' | 'world_history' | 'character_backstory'
//     questionCount?,    // default 5
//     difficulty?,       // 'EASY' | 'MEDIUM' | 'HARD' | 'INSANE'
//     onWinOps?          // optional extra ops to fire on success
//   });
//
// Returns: { ok, correct, total, jp, relationship, finishedAt }
//
// Used by: campaign-ui (tavern event button), event tables that include
// the guild_trivia entry.

window.CJS = window.CJS || {};

window.CJS.GuildTrivia = (() => {
  'use strict';

  const DS = () => window.CJS.DataStore;
  const CS = () => window.CJS.CampaignState;
  const Ops = () => window.CJS.CampaignOps;
  const Quiz = () => window.CJS.QteQuiz;

  // Reward table: tuned to feel like a meaningful sidequest reward but
  // not strictly better than a story battle.
  const REWARD = {
    perCorrect: { jp: 4, relationship: 1 },
    fullClearBonus: { jp: 12, relationship: 2 },
    flawlessBonus: { jp: 20, relationship: 3 }
  };

  async function run(opts = {}) {
    const state = CS().getState();
    const world = opts.world || state.currentWorld || 'haven';
    const total = Math.max(1, Math.min(10, Number(opts.questionCount || 5)));
    const difficulty = opts.difficulty || _pickDifficulty(state);

    const pool = _buildPool(world, opts.category);
    if (!pool.length) {
      return { ok: false, reason: 'no_questions', total: 0, correct: 0, jp: 0 };
    }

    const root = _buildHostUI(world, total);
    document.body.appendChild(root);
    const stage = root.querySelector('[data-trivia="stage"]');
    const progress = root.querySelector('[data-trivia="progress"]');
    const score = root.querySelector('[data-trivia="score"]');
    const closeBtn = root.querySelector('[data-trivia="close"]');

    const used = new Set();
    let correct = 0;
    let answered = 0;
    let aborted = false;
    closeBtn.addEventListener('click', () => { aborted = true; });

    for (let i = 0; i < total; i++) {
      if (aborted) break;
      // Pick a question we haven't used in this session.
      const candidates = pool.filter((q) => !used.has(q.id));
      if (!candidates.length) break;
      const question = candidates[Math.floor(Math.random() * candidates.length)];
      used.add(question.id);

      progress.textContent = `Question ${i + 1} / ${total}`;
      score.textContent = `Score: ${correct} / ${answered}`;
      stage.innerHTML = '';

      // Reuse QteQuiz by temporarily injecting our question into the
      // recent-ids history so the picker doesn't repeat. We give it a
      // single-question fake skill so the timer overlay shows.
      const result = await _askOne(stage, question, difficulty);
      answered++;
      if (result?.grade === 'perfect' || result?.grade === 'good') correct++;
    }

    const finishedAt = new Date().toISOString();
    // Reward calculation.
    const jpBase = correct * REWARD.perCorrect.jp;
    const relBase = correct * REWARD.perCorrect.relationship;
    const flawless = correct === total && answered === total;
    const fullClear = !flawless && correct >= Math.ceil(total * 0.8);
    const jp = jpBase + (flawless ? REWARD.flawlessBonus.jp : fullClear ? REWARD.fullClearBonus.jp : 0);
    const relGain = relBase + (flawless ? REWARD.flawlessBonus.relationship : fullClear ? REWARD.fullClearBonus.relationship : 0);

    // Apply rewards via ops so they show in the campaign log.
    const ops = [];
    if (jp > 0) ops.push({ op: 'give_jp', amount: jp });
    if (relGain > 0) {
      // Distribute relationship bumps across currently-present party
      // members. Bin always counts; others split evenly.
      const presentIds = Object.entries(state.party || {})
        .filter(([, m]) => (m.rosterRole || 'active') !== 'bench')
        .map(([id]) => id);
      for (const npcId of presentIds) {
        ops.push({ op: 'bond_change', npcId, amount: relGain, source: 'guild_trivia' });
      }
    }
    ops.push({ op: 'log', text: `Guild Trivia Night: ${correct}/${answered} correct (${flawless ? 'flawless!' : fullClear ? 'full clear bonus' : 'standard payout'}).` });
    // Event log entry so the player can find it later.
    ops.push({
      op: 'event_log_add',
      entry: {
        id: `trivia_${Date.now()}`,
        title: 'Guild Trivia Night',
        summary: `Answered ${correct} / ${answered} correctly. +${jp} JP, +${relGain} relationship.`,
        tags: ['trivia', 'tavern', 'social', 'guild'],
        source: 'guild_trivia',
        scope: 'event'
      }
    });
    if (Array.isArray(opts.onWinOps)) ops.push(...opts.onWinOps);
    Ops().apply(ops, { source: 'guild_trivia' });

    // Tell the user what happened, then close the overlay.
    progress.textContent = 'Trivia Night Complete';
    score.textContent = `${correct} / ${answered} correct`;
    stage.innerHTML = `
      <div class="trivia-result" style="text-align:center;padding:18px">
        <div style="font-size:1.4rem;margin-bottom:6px">${flawless ? '⭐ FLAWLESS ⭐' : fullClear ? '✨ Full Clear ✨' : '🍺 Cheers!'}</div>
        <div>+${jp} JP · +${relGain} relationship with present party.</div>
        <button data-trivia="final-close" class="campaign-action primary" style="margin-top:14px">Close</button>
      </div>
    `;
    await new Promise((resolve) => {
      root.querySelector('[data-trivia="final-close"]')?.addEventListener('click', () => resolve());
      closeBtn.addEventListener('click', () => resolve());
    });
    if (root.parentNode) root.parentNode.removeChild(root);

    return { ok: true, correct, total: answered, jp, relationship: relGain, finishedAt, flawless, fullClear };
  }

  function _askOne(container, question, difficulty) {
    // QteQuiz isn't directly question-driven, so we synthesize a tiny
    // overlay that mirrors its visual style. We reimplement minimal
    // logic here to keep the trivia path self-contained.
    return new Promise((resolve) => {
      const timeMs = ({ EASY: 18000, MEDIUM: 14000, HARD: 10000, INSANE: 7000 })[difficulty] || 14000;
      const start = performance.now();
      const optsHtml = question.options.map((opt, i) => `
        <button class="qte-quiz-option" data-index="${i}">
          <b>${'ABCD'[i]}.</b> ${_esc(opt)}
        </button>
      `).join('');
      container.innerHTML = `
        <div class="qte-quiz" style="padding:8px">
          <div class="qte-subtitle">${_categoryLabel(question.category)} · <span data-trivia="timer">${(timeMs/1000).toFixed(1)}s</span></div>
          <div class="qte-quiz-question">${_esc(question.sentence)}</div>
          <div class="qte-quiz-options">${optsHtml}</div>
        </div>
      `;
      const timerEl = container.querySelector('[data-trivia="timer"]');
      const optEls = container.querySelectorAll('.qte-quiz-option');
      let resolved = false;
      let raf = 0;
      function tick() {
        const elapsed = performance.now() - start;
        const remaining = Math.max(0, timeMs - elapsed);
        timerEl.textContent = `${(remaining / 1000).toFixed(1)}s`;
        if (remaining > 0 && !resolved) raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);
      function finalize(chosenIdx, grade) {
        if (resolved) return;
        resolved = true;
        cancelAnimationFrame(raf);
        if (chosenIdx != null && optEls[chosenIdx]) {
          optEls[chosenIdx].classList.add(grade === 'perfect' || grade === 'good' ? 'correct' : 'wrong');
        }
        if (grade !== 'perfect' && grade !== 'good' && optEls[question.correct]) {
          optEls[question.correct].classList.add('correct');
        }
        setTimeout(() => resolve({ grade, chosen: chosenIdx, question }), 900);
      }
      optEls.forEach((el, i) => {
        el.addEventListener('click', () => {
          const elapsed = performance.now() - start;
          if (i === question.correct) {
            finalize(i, elapsed < timeMs * 0.4 ? 'perfect' : 'good');
          } else {
            finalize(i, 'fail');
          }
        });
      });
      setTimeout(() => finalize(null, 'fail'), timeMs);
    });
  }

  function _buildPool(world, category) {
    // Combine system quiz-bank entries with any world-specific lore
    // questions stored under category 'triviaBank'. Filter by category.
    const bank = DS().getAllAsArray('quizBank') || [];
    const trivia = DS().getAllAsArray('triviaBank') || [];
    const lore = bank.concat(trivia).filter((q) => {
      if (!q?.options || !q?.sentence) return false;
      // Trivia categories preferred; fall back to grammar if no trivia
      // questions are authored in this world yet (so the night still
      // runs and feels populated).
      const cat = String(q.category || '').toLowerCase();
      const isTrivia = ['lore', 'world_history', 'character_backstory', 'world_lore', 'character'].includes(cat);
      if (category && cat !== category.toLowerCase()) return false;
      if (q.world && q.world !== world) return false;
      return isTrivia || !category;
    });
    if (!lore.length) {
      // Fallback: surface the regular grammar bank so the player isn't
      // staring at an empty room. Authors should add trivia entries.
      return bank.filter((q) => q.options && q.sentence).slice(0, 50);
    }
    return lore;
  }

  function _pickDifficulty(state) {
    // Scale difficulty roughly to chapter so late-campaign trivia is
    // tougher than chapter 1.
    const ch = Number(state.currentChapter || 1);
    if (ch >= 5) return 'HARD';
    if (ch >= 3) return 'MEDIUM';
    return 'EASY';
  }

  function _categoryLabel(cat) {
    return {
      lore: 'World Lore',
      world_history: 'World History',
      character_backstory: 'Character Backstory',
      world_lore: 'World Lore',
      character: 'Character Backstory',
      phrasal_verb: 'Phrasal Verb',
      collocation: 'Collocation',
      advanced_grammar: 'Advanced Grammar',
      confusing_pair: 'Confusing Pair'
    }[String(cat || '').toLowerCase()] || 'Trivia';
  }

  function _buildHostUI(world, total) {
    const root = document.createElement('div');
    root.className = 'qte-overlay trivia-overlay';
    root.innerHTML = `
      <div class="qte-dialog trivia-dialog" style="min-width:560px;max-width:96vw">
        <div class="qte-title">🍺 Guild Trivia Night</div>
        <div class="qte-subtitle">Tavern in ${_esc(world)} · ${total} questions</div>
        <div class="trivia-hud" style="display:flex;justify-content:space-between;margin:8px 0;padding:6px 10px;background:rgba(0,0,0,0.25);border-radius:6px">
          <span data-trivia="progress">Question 1 / ${total}</span>
          <span data-trivia="score">Score: 0 / 0</span>
        </div>
        <div data-trivia="stage" class="trivia-stage" style="min-height:240px"></div>
        <div style="text-align:right;margin-top:10px">
          <button data-trivia="close" class="campaign-action">Leave Early</button>
        </div>
      </div>
    `;
    return root;
  }

  function _esc(s) {
    return String(s || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  return Object.freeze({ run, REWARD });
})();
