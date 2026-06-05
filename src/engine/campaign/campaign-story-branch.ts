// campaign-story-branch.js
// Lets the GM author runtime "branch" chapters that hang off an existing
// auto-generated chapter (e.g. 1.4 → 1.4.a / 1.4.b). Branches are stored
// in state.storyMode.manualBranches, merged into the Story Controls
// chapter tree, and played through the VN scene system.

// Tier 3 TS port of js/campaign/campaign-story-branch.js (engine cluster:
// campaign). GM-authored runtime "branch" chapters (1.4 -> 1.4.a/1.4.b): create/
// remove/list/play, suffix allocation, chapter-tree merge. Reads window.CJS.*
// lazily. Exports `CampaignStoryBranch` and installs window.CJS.CampaignStoryBranch.
window.CJS = window.CJS || {};

export const CampaignStoryBranch = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const Seq = () => window.CJS.CampaignSequences;
  const Scenes = () => window.CJS.CampaignStoryScenes;

  function _state() {
    return CS()?.getState?.() || {};
  }

  function getBranches(world?) {
    const state = _state();
    const list = state.storyMode?.manualBranches || [];
    return world ? list.filter((b) => !b.world || b.world === world) : list.slice();
  }

  function getBranch(branchId) {
    return getBranches().find((b) => b.id === branchId) || null;
  }

  function getBranchesForParent(parentSequenceId, world) {
    return getBranches(world).filter((b) => b.parentSequenceId === parentSequenceId);
  }

  function nextSuffix(parentSequenceId, world) {
    const used = getBranchesForParent(parentSequenceId, world).map((b) => b.suffix);
    const all = 'abcdefghijklmnopqrstuvwxyz';
    for (const ch of all) {
      if (!used.includes(ch)) return ch;
    }
    return 'z';
  }

  function previewLabel(parentSequenceId, suffix = '', world) {
    const meta = Seq()?.storyMeta?.(parentSequenceId, world) || {};
    const base = meta.chapterLabel || meta.partLabel || parentSequenceId || '?';
    const cleanSuffix = String(suffix || '').toLowerCase().trim() || nextSuffix(parentSequenceId, world);
    return `${base}.${cleanSuffix}`;
  }

  function createBranch(input: any = {}) {
    const world = input.world || _state().currentWorld || 'haven';
    const parentSequenceId = input.parentSequenceId || _state().storyMode?.currentPartId || '';
    if (!parentSequenceId) return { ok: false, reason: 'no_parent' };
    const meta = Seq()?.storyMeta?.(parentSequenceId, world) || {};
    const suffix = String(input.suffix || nextSuffix(parentSequenceId, world)).toLowerCase().trim() || 'a';
    const label = previewLabel(parentSequenceId, suffix, world);
    const branchId = `branch_${meta.partId || parentSequenceId}_${suffix}_${Date.now().toString(36)}`;
    const orderKey = `${meta.orderKey || meta.chapterOrderKey || meta.chapterLabel || parentSequenceId}.${suffix}`;

    const sceneLines = _asLines(input.lines, input.scene, input.title);
    const sceneChoices = _asChoices(input.choices);

    const branch = {
      id: branchId,
      parentSequenceId,
      parentTitle: meta.title || parentSequenceId,
      parentLabel: meta.chapterLabel || meta.partLabel || parentSequenceId,
      suffix,
      chapterLabel: label,
      partLabel: input.partLabel || `Branch ${label}`,
      title: input.title || `${label} — Manual Branch`,
      summary: input.summary || input.scene || '',
      tags: Array.isArray(input.tags) ? input.tags.slice() : [],
      world,
      orderKey,
      createdAt: new Date().toISOString(),
      played: false,
      playedAt: null,
      scene: {
        id: `scene_${branchId}`,
        title: input.title || `${label} — Manual Branch`,
        background: input.background || '',
        lines: sceneLines,
        choices: sceneChoices
      }
    };

    CS().mutate((next) => {
      next.storyMode = next.storyMode || {};
      next.storyMode.manualBranches = Array.isArray(next.storyMode.manualBranches)
        ? next.storyMode.manualBranches.slice()
        : [];
      next.storyMode.manualBranches.push(branch);
    }, { source: 'story_branch_create' });

    return { ok: true, branch };
  }

  function removeBranch(branchId) {
    let removed = false;
    CS().mutate((next) => {
      const list = next.storyMode?.manualBranches || [];
      const before = list.length;
      next.storyMode.manualBranches = list.filter((b) => b.id !== branchId);
      removed = next.storyMode.manualBranches.length !== before;
    }, { source: 'story_branch_remove' });
    return removed;
  }

  function playBranch(branchId, options: any = {}) {
    const branch = getBranch(branchId);
    if (!branch) return false;
    const scene = branch.scene || {};
    const ok = Scenes()?.playScene?.({
      ...scene,
      id: scene.id || branch.id,
      title: scene.title || branch.title,
      lines: scene.lines || [],
      choices: scene.choices || []
    }, {
      ...options,
      onComplete: (info) => {
        markPlayed(branchId);
        if (typeof options.onComplete === 'function') options.onComplete(info);
      }
    });
    return !!ok;
  }

  function markPlayed(branchId) {
    CS().mutate((next) => {
      const list = next.storyMode?.manualBranches || [];
      const item = list.find((b) => b.id === branchId);
      if (item) {
        item.played = true;
        item.playedAt = new Date().toISOString();
      }
    }, { source: 'story_branch_played' });
  }

  // Merge branches into the chapter tree from CampaignSequences.chapterTree(),
  // returning a new tree object that includes branch entries as children of
  // their parent part nodes (or as roots if the parent is missing).
  function applyToTree(tree: any = { roots: [], byPartId: {}, nodes: [] }, world) {
    const branches = getBranches(world);
    if (!branches.length) return tree;
    const next = {
      roots: tree.roots.slice(),
      byPartId: { ...tree.byPartId },
      nodes: tree.nodes.slice()
    };
    for (const branch of branches) {
      const node = _branchTreeNode(branch);
      const parent = next.byPartId[branch.parentSequenceId];
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(node);
      } else {
        next.roots.push(node);
      }
      next.nodes.push(node);
    }
    return next;
  }

  function _branchTreeNode(branch) {
    return {
      id: branch.id,
      partId: branch.id,
      partLabel: branch.partLabel || `Branch ${branch.chapterLabel}`,
      chapterLabel: branch.chapterLabel,
      orderKey: branch.orderKey,
      title: branch.title,
      branchOf: branch.parentSequenceId,
      alsoBranchOf: [],
      branchKey: branch.suffix,
      routeKey: 'manual_branch',
      routeLabel: 'Manual Branch',
      status: {
        id: branch.id,
        meta: { chapterLabel: branch.chapterLabel, title: branch.title },
        record: null,
        applied: !!branch.played,
        completed: !!branch.played,
        defaulted: false,
        replayOnly: !!branch.played,
        deliveryStatus: 'ready',
        deliveryBlocked: false,
        deliveryNote: ''
      },
      eligibility: { eligible: true, reasons: [] },
      meta: { summary: { short: branch.summary || '' } },
      children: [],
      nextCandidates: [],
      isManualBranch: true
    };
  }

  function _asLines(linesInput, sceneText, titleHint) {
    if (Array.isArray(linesInput) && linesInput.length) {
      return linesInput.map((line) => _normalizeLine(line)).filter((l) => l && (l.text || l.speaker));
    }
    const text = String(sceneText || '').trim();
    if (!text) return [{ speaker: 'GM', text: titleHint || 'A new path opens.' }];
    return text.split(/\n{2,}/).map((paragraph) => _parseLine(paragraph.trim())).filter(Boolean);
  }

  function _parseLine(paragraph) {
    if (!paragraph) return null;
    const colonMatch = paragraph.match(/^([A-Z][A-Za-z0-9 _.-]{0,40}):\s*(.+)$/);
    if (colonMatch) {
      return { speaker: colonMatch[1].trim(), text: colonMatch[2].trim() };
    }
    return { speaker: '', text: paragraph };
  }

  function _normalizeLine(line: any = {}) {
    return {
      speaker: line.speaker || line.name || '',
      speakerId: line.speakerId || line.characterId || '',
      text: line.text || line.line || '',
      portrait: line.portrait || '',
      expression: line.expression || '',
      side: line.side || 'left',
      style: line.style || ''
    };
  }

  function _asChoices(choicesInput) {
    if (!Array.isArray(choicesInput)) return [];
    return choicesInput.map((choice, index) => ({
      id: choice.id || `branch_choice_${index + 1}`,
      label: choice.label || choice.text || `Option ${index + 1}`,
      ops: Array.isArray(choice.ops) ? choice.ops.slice() : [],
      nextSceneId: choice.nextSceneId || ''
    })).filter((c) => c.label);
  }

  return Object.freeze({
    createBranch,
    removeBranch,
    getBranches,
    getBranch,
    getBranchesForParent,
    nextSuffix,
    previewLabel,
    playBranch,
    markPlayed,
    applyToTree
  });
})();

// Runtime compatibility install — identical to the legacy IIFE.
window.CJS.CampaignStoryBranch = CampaignStoryBranch;
