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
    }));
  }

  function getTemplate(templateId) {
    return Loader().getQuestChainTemplate(templateId);
  }

  function start(templateId) {
    Ops().apply({ op: 'start_quest_chain', templateId }, { source: 'quest_chain' });
  }

  function advance(templateId) {
    Ops().apply({ op: 'advance_quest_chain_step', templateId }, { source: 'quest_chain' });
  }

  function completeStep(templateId, stepId) {
    Ops().apply({ op: 'complete_quest_chain_step', templateId, stepId }, { source: 'quest_chain' });
  }

  function complete(templateId) {
    Ops().apply({ op: 'complete_quest_chain', templateId }, { source: 'quest_chain' });
  }

  function fail(templateId) {
    Ops().apply({ op: 'fail_quest_chain', templateId, applyConsequences: true }, { source: 'quest_chain' });
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
      quest: {
        id: `quest_${chain.id}`,
        title: chain.title,
        summary: chain.summary || '',
        objectives: (chain.steps || []).map((step) => ({ id: step.id, label: step.label || step.id, current: 0, required: 1 })),
        rewards: chain.rewardOps || []
      }
    }, { source: 'quest_chain' });
  }

  return Object.freeze({
    getAvailable,
    getActive,
    getTemplate,
    start,
    advance,
    completeStep,
    complete,
    fail,
    saveAsIdea,
    promoteToQuest
  });
})();
