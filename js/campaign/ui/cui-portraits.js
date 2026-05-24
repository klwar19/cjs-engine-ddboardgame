// cui-portraits.js — Portrait + icon helpers for Campaign UI.
//
// Extracted from campaign-ui.js. These resolve a party member's portrait
// (persona art → saved persona portrait → member portrait → base
// character) and the matching focus crop. The main file binds short
// aliases to these at the top of its IIFE.

window.CJS = window.CJS || {};
window.CJS.CampaignUIInternal = window.CJS.CampaignUIInternal || {};

window.CJS.CampaignUIInternal.Portraits = (function () {
  'use strict';

  function _utils() {
    return window.CJS.CampaignUIInternal.Utils;
  }

  // Render an entity icon using UIIcons; safe fallback if module is missing.
  function icon(entity, opts = {}) {
    const I = window.CJS && window.CJS.UIIcons;
    if (I) return I.renderIcon(entity, opts);
    const fallback = entity?.icon || (opts.kind === 'passive' ? '🛡️' : '⚔️');
    const esc = _utils().esc;
    return `<span class="cjs-icon cjs-icon-${opts.size || 'md'}">${esc(fallback)}</span>`;
  }

  // Resolve a member's portrait, falling back to the base character record so
  // legacy saves still show art if the character file has it.
  function memberPortrait(member, memberId) {
    if (!member) return '';
    // Persona portrait takes precedence so the world-skin's art shows in the
    // roster card. Fallback: member-saved portrait, then base character art.
    const DS = window.CJS && window.CJS.DataStore;
    if (member.activePersona) {
      const persona = DS?.get?.('personas', member.activePersona);
      if (persona?.portrait) return persona.portrait;
    }
    if (member.personaPortrait) return member.personaPortrait;
    if (member.portrait) return member.portrait;
    const baseId = member.baseCharacterId || memberId;
    const base = DS?.get?.('characters', baseId);
    return base?.portrait || '';
  }

  // Resolve the focus crop that matches `memberPortrait` above. Whichever
  // source we ended up using for the path, we want the focus stored next to
  // that same source so the crop tracks the picture.
  function memberPortraitFocus(member, memberId) {
    if (!member) return null;
    const DS = window.CJS && window.CJS.DataStore;
    if (member.activePersona) {
      const persona = DS?.get?.('personas', member.activePersona);
      if (persona?.portrait) return persona.portraitFocus || null;
    }
    if (member.personaPortrait) return member.personaPortraitFocus || null;
    if (member.portrait) return member.portraitFocus || null;
    const baseId = member.baseCharacterId || memberId;
    const base = DS?.get?.('characters', baseId);
    return base?.portraitFocus || null;
  }

  // Inline-style attribute for an <img> so the chosen focus point lands at
  // the container's center. Safe to inject — escapes nothing because the
  // values are clamped numbers from normalizeFocus.
  function focusAttrStyle(focus) {
    const PP = window.CJS && window.CJS.PortraitPicker;
    if (PP && PP.focusStyle) return PP.focusStyle(focus);
    // Tiny inline fallback so the campaign page still works if the portrait
    // picker happens not to be loaded on a given route.
    if (!focus) return 'object-fit:cover';
    const x = Math.max(0, Math.min(100, Number(focus.x) || 50));
    const y = Math.max(0, Math.min(100, Number(focus.y) || 50));
    const z = Math.max(100, Math.min(400, Number(focus.zoom) || 100));
    const parts = [`object-fit:cover`, `object-position:${x}% ${y}%`, `transform-origin:${x}% ${y}%`];
    if (z !== 100) parts.push(`transform:scale(${(z / 100).toFixed(3)})`);
    return parts.join(';');
  }

  return Object.freeze({
    icon,
    memberPortrait,
    memberPortraitFocus,
    focusAttrStyle
  });
})();
