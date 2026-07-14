import { clampDifficulty } from './formulas.js';

const MARK_DC = {
  obvious: 5,
  clear: 10,
  worn: 15,
  hidden: 20,
  obscure: 25
};

function itemLabel(item) {
  return String(item?.label ?? item?.name ?? '').trim();
}

function hasDistinguishableMark(item) {
  const marks = Array.isArray(item?.marks) ? item.marks : [];
  return marks.some((mark) => String(mark ?? '').trim().length > 0);
}

function recognitionTier(item) {
  const visibility = String(item?.visibility ?? '').toLowerCase();
  const discoverability = Number(item?.discoverability);
  const condition = String(item?.condition ?? '').toLowerCase();
  if (visibility === 'hidden' || visibility === 'secret') return 'hidden';
  if (Number.isFinite(discoverability) && discoverability < 0.3) return 'obscure';
  if (/(damaged|dirty|worn|изнош|гряз|повреж)/i.test(condition)) return 'worn';
  if (visibility === 'visible' && hasDistinguishableMark(item)) return 'clear';
  if (hasDistinguishableMark(item)) return 'clear';
  return 'obvious';
}

function npcKnowsItemBasis(npc, item) {
  const ownerId = String(item?.owner_id ?? item?.ownerId ?? '').trim();
  const npcId = String(npc?.id ?? '').trim();
  if (ownerId && npcId && ownerId === npcId) return true;
  const knowledge = [
    ...(Array.isArray(npc?.knowledge) ? npc.knowledge : []),
    ...(Array.isArray(npc?.memory) ? npc.memory : []),
    ...(Array.isArray(npc?.actorProfile?.mind?.seen) ? npc.actorProfile.mind.seen : [])
  ].map((entry) => String(entry ?? '').toLowerCase());
  const label = itemLabel(item).toLowerCase();
  if (!label) return false;
  return knowledge.some((entry) => entry.includes(label));
}

export function canNpcRecognizeItem(npc, item, scene = {}) {
  if (!item || typeof item !== 'object') {
    return { obvious: false, checkRequired: false, dc: null, reason: 'no_item', possibleConsequences: [] };
  }

  const visible = item.visible !== false && !['hidden', 'secret', 'unknown'].includes(String(item.visibility ?? '').toLowerCase());
  if (!visible) {
    return {
      obvious: false,
      checkRequired: true,
      dc: MARK_DC.hidden,
      reason: 'item_not_visible',
      possibleConsequences: ['accusation_candidate', 'social_risk_candidate']
    };
  }

  const knowsBasis = npcKnowsItemBasis(npc, item);
  const tier = recognitionTier(item);
  const dc = MARK_DC[tier] ?? MARK_DC.clear;
  const obvious = tier === 'obvious' && knowsBasis;

  if (obvious || (knowsBasis && tier === 'clear')) {
    return {
      obvious: true,
      checkRequired: false,
      dc,
      reason: 'marked_and_known',
      possibleConsequences: ['accusation_candidate', 'theft_risk_candidate']
    };
  }

  const stolen = String(item?.legal_status ?? '').toLowerCase() === 'stolen'
    || String(item?.ownership_status ?? '').toLowerCase() === 'stolen';

  return {
    obvious: false,
    checkRequired: true,
    dc: clampDifficulty(dc),
    reason: knowsBasis ? 'mark_requires_attention' : 'no_prior_knowledge',
    possibleConsequences: stolen
      ? ['accusation_candidate', 'social_risk_candidate']
      : ['social_risk_candidate']
  };
}
