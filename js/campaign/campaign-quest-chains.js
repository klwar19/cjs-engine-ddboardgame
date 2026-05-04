// campaign-quest-chains.js
// Side quest chain lookup and operation wrappers.

window.CJS = window.CJS || {};

window.CJS.CampaignQuestChains = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const Ops = () => window.CJS.CampaignOps;
  const Loader = () => window.CJS.CampaignDataLoader;
  const Side = () => window.CJS.CampaignSideContent;

  function getAvailable() {
    const active = CS().getState()?.sideContent?.activeQuestChains || {};
    return Loader().getQuestChainTemplates().filter((chain) => !active[chain.id]);
  }

  function getActive() {
    return CS().getActiveQuestChains().map((state) => ({
      ...state,
      template: Loader().getQuestChainTemplate(state.templateId)
    })).filter((chain) => String(chain.status || 'active') === 'active');
  }

  function getFinished() {
    return CS().getActiveQuestChains().map((state) => ({
      ...state,
      template: Loader().getQuestChainTemplate(state.templateId)
    })).filter((chain) => String(chain.status || 'active') !== 'active');
  }

  function getTemplate(templateId) {
    return Loader().getQuestChainTemplate(templateId);
  }

  function start(templateId) {
    const chain = getTemplate(templateId);
    if (!chain) return;
    Ops().apply([
      { op: 'start_quest_chain', templateId, questId: `quest_${templateId}` },
      { op: 'add_quest', quest: toQuest(chain) }
    ], { source: 'quest_chain' });
  }

  function advance(templateId) {
    const active = CS().getState()?.sideContent?.activeQuestChains?.[templateId];
    const chain = getTemplate(templateId);
    const stepId = active?.currentStepId || null;
    const ops = [];
    const questId = active?.questId || `quest_${templateId}`;
    if (chain && !CS().getState()?.quests?.[questId]) ops.push({ op: 'add_quest', quest: toQuest(chain) });
    if (stepId) ops.push({ op: 'update_quest_progress', questId, objectiveId: stepId, amount: 1 });
    ops.push({ op: 'advance_quest_chain_step', templateId, applyRewards: false });
    Ops().apply(ops, { source: 'quest_chain' });
  }

  function completeStep(templateId, stepId) {
    Ops().apply({ op: 'complete_quest_chain_step', templateId, stepId }, { source: 'quest_chain' });
  }

  function complete(templateId) {
    const active = CS().getState()?.sideContent?.activeQuestChains?.[templateId];
    const chain = getTemplate(templateId);
    const questId = active?.questId || `quest_${templateId}`;
    const ops = [];
    if (chain && !CS().getState()?.quests?.[questId]) ops.push({ op: 'add_quest', quest: toQuest(chain) });
    Ops().apply([
      ...ops,
      { op: 'complete_quest', questId },
      { op: 'complete_quest_chain', templateId, applyRewards: false }
    ], { source: 'quest_chain' });
  }

  function fail(templateId) {
    const active = CS().getState()?.sideContent?.activeQuestChains?.[templateId];
    const chain = getTemplate(templateId);
    const questId = active?.questId || `quest_${templateId}`;
    const ops = [];
    if (chain && !CS().getState()?.quests?.[questId]) ops.push({ op: 'add_quest', quest: toQuest(chain) });
    Ops().apply([
      ...ops,
      { op: 'fail_quest', questId },
      { op: 'fail_quest_chain', templateId, applyConsequences: true }
    ], { source: 'quest_chain' });
  }

  function saveAsIdea(templateId) {
    const chain = getTemplate(templateId);
    if (!chain) return;
    Side().saveCard({
      ...chain,
      id: `idea_${chain.id}`,
      templateId: chain.id,
      type: 'quest_chain',
      title: chain.title || chain.name,
      payload: chain
    }, { status: 'saved', source: 'quest_chain' });
  }

  function promoteToQuest(templateId) {
    const chain = getTemplate(templateId);
    if (!chain) return;
    Ops().apply({
      op: 'add_quest',
      quest: toQuest(chain)
    }, { source: 'quest_chain' });
  }

  function toQuest(chain = {}) {
    return {
      id: `quest_${chain.id}`,
      title: chain.title || chain.name || chain.id,
      status: 'active',
      summary: chain.summary || '',
      chainTemplateId: chain.id,
      objectives: (chain.steps || []).map((step) => ({
        id: step.id,
        label: step.label || step.id,
        current: 0,
        required: 1,
        text: step.text || ''
      })),
      rewards: chain.rewardOps || chain.rewards || [],
      failureConsequence: chain.failureOps || chain.failureConsequences || [],
      battleSetIds: chain.battleSetIds || [],
      mapSeedIds: chain.mapSeedIds || [],
      tags: chain.tags || [],
      notes: chain.type || ''
    };
  }

  return Object.freeze({
    getAvailable,
    getActive,
    getFinished,
    getTemplate,
    start,
    advance,
    completeStep,
    complete,
    fail,
    saveAsIdea,
    promoteToQuest,
    toQuest
  });
})();
