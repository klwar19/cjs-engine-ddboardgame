// persona-service.js
// World-specific character "skin" service.
//
// A persona reshapes how a character is played in a specific world:
//   - statOverrides applied on top of the character's universal SPECIAL stats
//   - world-specific defaultJob / availableJobs / availableBranches
//   - world-specific skills / equipment / innatePassives / weapon&armor allowances
//   - phase-locked unlock rules (default / requiresPhase / requiresChapter / requiresFlag)
//   - crossWorldPenalty applied when the persona is used outside its home world
//   - relationshipPerWorld hints for NPC/quip systems
//
// Per-party-member state lives on the campaign save:
//   member.activePersona            – currently active persona id (or null)
//   member.unlockedPersonas         – list of persona ids the player has unlocked
//   member.personaProgress[personaId] = {
//     jobProgress, currentJob, learnedSkills, learnedPassives, statOverrides,
//     equipment, equipmentSlots, equippedSkills, equippedPassives,
//     allowedWeaponTypes, allowedArmorTypes
//   }
//
// Switching personas saves the live loadout into the OLD persona's progress
// slot, then activates the NEW persona by either restoring its saved slot or
// seeding from the authored persona template. Universal character.stats are
// the carry-over baseline; statOverrides accumulate on top.
//
// Reads: DataStore, CampaignState, CONST
// Used by: campaign-state (party build / normalize), campaign-ops (set_persona,
// unlock_persona, evaluate_persona_unlocks), campaign-combat-bridge (snapshot
// + cross-world penalty), campaign-ui (display + switch UI).
// ─────────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.PersonaService = (() => {
  'use strict';

  const DS = () => window.CJS.DataStore;
  const C  = () => window.CJS.CONST;

  function _clone(value) {
    return JSON.parse(JSON.stringify(value || (Array.isArray(value) ? [] : {})));
  }

  // ── Lookups ────────────────────────────────────────────────────────
  function listPersonas() {
    return DS()?.getAllAsArray?.('personas') || [];
  }

  function getPersona(id) {
    if (!id) return null;
    return DS()?.get?.('personas', id) || null;
  }

  function personasForCharacter(characterId) {
    if (!characterId) return [];
    return listPersonas().filter((p) => p.characterId === characterId);
  }

  function personasForCharacterInWorld(characterId, worldId) {
    return personasForCharacter(characterId).filter((p) => p.world === worldId);
  }

  // ── Unlock evaluation ──────────────────────────────────────────────
  // Pass the in-progress save and a member; returns the list of personaIds
  // that should be unlocked given current campaign state. Defaults are always
  // unlocked. Other personas are unlocked when their unlock conditions pass.
  function evaluateUnlocks(member, state) {
    if (!member || !state) return [];
    const charId = member.baseCharacterId || member.id;
    const personas = personasForCharacter(charId);
    const phaseNumber = Number(state.phase?.number || 1);
    const phaseType = String(state.phase?.type || '');
    const chapter = Number(state.currentChapter || 1);
    const world = String(state.currentWorld || '');
    const flags = state.flags || {};

    const unlocked = new Set(member.unlockedPersonas || []);

    for (const persona of personas) {
      const rule = persona.unlock || {};
      // World-scoped rules (including default-unlocked starters for that
      // world) only fire while the player is actually in that world. This
      // is what stops a Last Light starter from showing up in Haven.
      const worldGate = rule.world || persona.world || null;
      if (worldGate && worldGate !== world) continue;
      if (rule.default) {
        unlocked.add(persona.id);
        continue;
      }
      if (rule.requiresChapter != null && chapter < Number(rule.requiresChapter)) continue;
      if (rule.requiresPhaseNumber != null && phaseNumber < Number(rule.requiresPhaseNumber)) continue;
      if (rule.requiresPhaseType && phaseType !== rule.requiresPhaseType) continue;
      if (rule.requiresFlag && !flags[rule.requiresFlag]) continue;
      unlocked.add(persona.id);
    }

    return Array.from(unlocked);
  }

  // ── Loadout snapshot (live → progress slot) ────────────────────────
  // Captures the member's current loadout so a future switch back to this
  // persona can restore it. Universal stats live on the character record so
  // we save only the delta (statOverrides).
  function captureLoadoutFromMember(member) {
    if (!member) return {};
    return {
      currentJob: member.currentJob || null,
      jobProgress: _clone(member.jobProgress || {}),
      learnedSkills: _clone(member.learnedSkills || []),
      learnedPassives: _clone(member.learnedPassives || []),
      statOverrides: _clone(member.statOverrides || {}),
      equipment: _clone(member.equipment || []),
      equipmentSlots: _clone(member.equipmentSlots || {}),
      equippedSkills: _clone(member.equippedSkills || []),
      equippedPassives: _clone(member.equippedPassives || []),
      allowedWeaponTypes: _clone(member.allowedWeaponTypes || []),
      allowedArmorTypes: _clone(member.allowedArmorTypes || []),
      skillProgress: _clone(member.skillProgress || {}),
      passiveProgress: _clone(member.passiveProgress || {})
    };
  }

  // Seed an empty persona progress slot from the persona template + the base
  // character record. The returned shape mirrors captureLoadoutFromMember.
  function seedLoadoutFromPersona(persona, base = {}) {
    if (!persona) return {};
    const PROG = C().PROGRESSION || {};
    const defaultJob = persona.defaultJob || base.defaultJob || null;
    const available = Array.from(new Set([
      ...(persona.availableJobs || []),
      ...(defaultJob ? [defaultJob] : [])
    ]));
    const jobProgress = {};
    for (const jid of available) {
      jobProgress[jid] = { xp: 0, level: 1 };
    }
    if (defaultJob && !jobProgress[defaultJob]) {
      jobProgress[defaultJob] = { xp: 0, level: 1 };
    }

    const skills = Array.isArray(persona.skills) ? persona.skills.slice() : _clone(base.skills || []);
    const equipment = Array.isArray(persona.equipment) ? persona.equipment.slice() : _clone(base.equipment || []);
    const passives = Array.isArray(persona.innatePassives) ? persona.innatePassives.slice() : _clone(base.innatePassives || []);

    const skillProgress = {};
    for (const entry of skills) {
      const sid = typeof entry === 'string' ? entry : entry?.skillId;
      if (sid) skillProgress[sid] = { ap: 0, level: 1 };
    }
    const passiveProgress = {};
    for (const pid of passives) {
      if (pid) passiveProgress[pid] = { rank: 1 };
    }

    return {
      currentJob: defaultJob,
      jobProgress,
      learnedSkills: [],
      learnedPassives: [],
      statOverrides: _clone(persona.statOverrides || {}),
      equipment,
      equipmentSlots: {},
      equippedSkills: [],
      equippedPassives: [],
      allowedWeaponTypes: Array.isArray(persona.allowedWeaponTypes)
        ? persona.allowedWeaponTypes.slice()
        : _clone(base.allowedWeaponTypes || []),
      allowedArmorTypes: Array.isArray(persona.allowedArmorTypes)
        ? persona.allowedArmorTypes.slice()
        : _clone(base.allowedArmorTypes || []),
      skillProgress,
      passiveProgress,
      // The persona-authored skill list is treated as the base pool; learnedSkills
      // collects everything beyond that, identical to how characters work today.
      // Skill list itself is rebuilt at apply-time from persona.skills.
      _seededSkills: skills,
      _seededPassives: passives
    };
  }

  // Apply a previously-captured loadout onto the member object. Pass either
  // a saved progress slot (preferred for switch-back) or a freshly seeded
  // template (for first-time switch). Sets activePersona and refreshes the
  // member fields that combat / snapshot rely on.
  function applyLoadoutToMember(member, loadout = {}, persona = null, base = {}) {
    if (!member) return;
    member.currentJob = loadout.currentJob || persona?.defaultJob || base.defaultJob || null;
    member.jobProgress = _clone(loadout.jobProgress || {});
    member.learnedSkills = _clone(loadout.learnedSkills || []);
    member.learnedPassives = _clone(loadout.learnedPassives || []);
    member.statOverrides = _clone(loadout.statOverrides || persona?.statOverrides || {});
    member.equipment = _clone(loadout.equipment || persona?.equipment || base.equipment || []);
    member.equipmentSlots = _clone(loadout.equipmentSlots || {});
    member.equippedSkills = _clone(loadout.equippedSkills || []);
    member.equippedPassives = _clone(loadout.equippedPassives || []);
    member.allowedWeaponTypes = _clone(loadout.allowedWeaponTypes || persona?.allowedWeaponTypes || base.allowedWeaponTypes || []);
    member.allowedArmorTypes = _clone(loadout.allowedArmorTypes || persona?.allowedArmorTypes || base.allowedArmorTypes || []);
    member.skillProgress = _clone(loadout.skillProgress || {});
    member.passiveProgress = _clone(loadout.passiveProgress || {});
    if (persona) {
      member.activePersona = persona.id;
      if (persona.icon) member.personaIcon = persona.icon;
      if (persona.portrait) member.personaPortrait = persona.portrait;
      // We deliberately DO NOT overwrite base portrait/icon — the persona's
      // visuals are a layer the UI can render alongside the universal ones.
    }
  }

  // ── Active-persona resolution ──────────────────────────────────────
  function getActivePersona(member) {
    if (!member?.activePersona) return null;
    return getPersona(member.activePersona);
  }

  // Determine if the active persona is being used outside its home world.
  function isOutOfWorld(member, currentWorld) {
    const persona = getActivePersona(member);
    if (!persona) return false;
    if (!persona.world) return false;
    return persona.world !== currentWorld;
  }

  function crossWorldPenalty(member, currentWorld) {
    if (!isOutOfWorld(member, currentWorld)) return null;
    const persona = getActivePersona(member);
    return persona?.crossWorldPenalty || null;
  }

  function relationshipModifier(member, currentWorld) {
    const persona = getActivePersona(member);
    if (!persona) return { modifier: 0, tags: [] };
    const world = currentWorld || (window.CJS.CampaignState?.getState?.()?.currentWorld) || '';
    const map = persona.relationshipPerWorld || {};
    if (map[world]) return { modifier: Number(map[world].modifier || 0), tags: map[world].tags || [] };
    if (isOutOfWorld(member, world)) {
      const pen = persona.crossWorldPenalty || {};
      return { modifier: Number(pen.relationshipModifier || 0), tags: pen.tags || [] };
    }
    return { modifier: 0, tags: persona.tags || [] };
  }

  // ── Snapshot-time stat fold ────────────────────────────────────────
  // Returns the SPECIAL stats with persona overrides + cross-world penalty
  // applied. baseStats are the character's universal stats (carry-over);
  // statOverrides are already-banked progression deltas (char level / job).
  function computeSnapshotStats(baseStats = {}, member = {}, currentWorld = '') {
    const stats = { ...(baseStats || {}) };
    const STATS = C().STATS || ['S', 'P', 'E', 'C', 'I', 'A', 'L'];

    // Step 1: member.statOverrides are accumulated char/job-level deltas
    // captured under the current persona. They are independent of the
    // persona template's statOverrides (which is already used as the seed
    // for new persona slots — folding it again would double-apply).
    const overrides = member.statOverrides || {};
    for (const stat of STATS) {
      if (overrides[stat] != null) stats[stat] = Number(stats[stat] || 0) + Number(overrides[stat] || 0);
    }

    // Step 2: cross-world penalty
    const penalty = crossWorldPenalty(member, currentWorld);
    if (penalty) {
      for (const stat of STATS) {
        const flat = Number(penalty.statFlat?.[stat] || 0);
        const mult = Number(penalty.statMultiplier);
        let value = Number(stats[stat] || 0) + flat;
        if (Number.isFinite(mult) && mult > 0 && mult !== 1) {
          value = Math.floor(value * mult);
        }
        stats[stat] = Math.max(0, value);
      }
    }
    return stats;
  }

  // Damage multipliers applied to combat snapshot when out of world.
  function crossWorldDamageMods(member, currentWorld) {
    const penalty = crossWorldPenalty(member, currentWorld);
    if (!penalty) return { dealt: 1, taken: 1 };
    return {
      dealt: Number(penalty.damageDealtMultiplier ?? 1),
      taken: Number(penalty.damageTakenMultiplier ?? 1)
    };
  }

  return Object.freeze({
    listPersonas,
    getPersona,
    personasForCharacter,
    personasForCharacterInWorld,
    evaluateUnlocks,
    captureLoadoutFromMember,
    seedLoadoutFromPersona,
    applyLoadoutToMember,
    getActivePersona,
    isOutOfWorld,
    crossWorldPenalty,
    crossWorldDamageMods,
    relationshipModifier,
    computeSnapshotStats
  });
})();
