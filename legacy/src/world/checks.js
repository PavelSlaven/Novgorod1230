import { getCurrentLocation, getCurrentMicroLocation } from './location.js';
import { assessLegalPressure } from './law.js';
import { summarizeActiveDefense, summarizeCombatEquipment, summarizeWeaponDanger } from './combat-model.js';
import { countOccupiedHands, isQuickAccessibleItem, isUsableOwnedResource } from './item-access.js';
import { clampDifficulty, evaluateCheckOutcome } from './formulas.js';
import { buildCheckRollContext, buildRollAuditRecord, rollD20 } from './rng.js';
import { resolveLoadCategory, deriveCarriedWeight } from './load-model.js';
import { assessActionSocialRisk } from './social.js';
import { allowsProceduralSemantics } from './semantic-gate.js';

export function buildActionCheck(world, frame) {
  const intent = frame.intent;
  const location = getCurrentLocation(world);
  const microLocation = getCurrentMicroLocation(world);
  const required = resolveRequired(world, frame, intent);

  if (!required) {
    return {
      required: false,
      roll: null,
      modifier: 0,
      dc: null,
      total: null,
      degree: 'none',
      reason: 'Проверка не нужна'
    };
  }

  const loadBlocker = assessLoadBlocker(intent?.type, world.player ?? {});
  if (loadBlocker.blocked) {
    const profile = buildCheckProfile(world, frame, intent);
    const modifiers = loadModifiers(world.player ?? {});
    return {
      required: true,
      roll: null,
      modifier: modifiers.reduce((sum, item) => sum + item.value, 0),
      dc: null,
      total: null,
      margin: null,
      band: 'blocked_by_load',
      degree: 'failure',
      action_possible: false,
      load_blocker: loadBlocker,
      modifiers,
      profile,
      reason: loadBlocker.reason
    };
  }

  const profile = buildCheckProfile(world, frame, intent);
  if (profile.methodInferredByCode && !allowsProceduralSemantics(world)) {
    const modifiers = loadModifiers(world.player ?? {});
    return {
      required: true,
      roll: null,
      modifier: modifiers.reduce((sum, item) => sum + item.value, 0),
      dc: null,
      total: null,
      margin: null,
      band: 'ambiguous_method',
      degree: 'failure',
      action_possible: false,
      modifiers,
      profile,
      reason: 'Метод действия не зафиксирован. Нужен ruling master-агента или action_method в intent.'
    };
  }
  const actorModifiers = [
    mod(`характеристика (${profile.attributeLabel})`, profile.attributeBonus, 'actor:attribute', 'actor'),
    mod(`навык (${profile.skillLabel})`, profile.skillBonus, 'actor:skill', 'actor'),
    mod(`состояние (${profile.stateLabel})`, profile.stateModifier, 'actor:state', 'actor'),
    mod(`снаряжение (${profile.equipmentLabel})`, profile.equipmentModifier, 'actor:equipment', 'equipment')
  ];
  const circumstanceModifiers = normalizeCircumstanceModifiers(buildModifiers(world, frame, intent, location, microLocation));
  const modifiers = [...actorModifiers, ...circumstanceModifiers];
  const socialRisk = assessActionSocialRisk(world, frame, intent);
  const legal = socialRisk.legal;
  const modifier = modifiers.reduce((sum, item) => sum + item.value, 0);
  const difficulty = buildDifficulty(world, frame, intent, modifiers);
  const dc = difficulty.dc;
  const rollContext = buildCheckRollContext(world, frame, intent);
  const rolled = rollD20({
    auditSeed: rollContext.auditSeed,
    testMode: rollContext.testMode,
    world: rollContext.testMode ? null : world
  });
  const roll = rolled.value;
  const total = roll + modifier;
  const outcome = evaluateCheckOutcome(roll, total, dc);
  const formulaText = buildFormulaText(roll, total, dc, modifiers, profile);
  const rollRecord = buildRollAuditRecord({
    value: roll,
    rngMode: rolled.rng_mode,
    seedRef: rolled.seed_ref,
    algorithm: rolled.algorithm,
    counter: rolled.counter,
    formula: `d20 + modifiers >= DC ${dc}`
  });
  const checkAudit = buildCheckAuditRecord({
    world,
    frame,
    intent,
    profile,
    modifiers,
    difficulty,
    roll,
    total,
    dc,
    outcome,
    rollRecord,
    socialRisk
  });

  return {
    required: true,
    roll,
    modifier,
    dc,
    total,
    margin: outcome.margin,
    band: outcome.band,
    success: outcome.success,
    cost_required: outcome.cost_required,
    severe_failure: outcome.severe_failure,
    degree: outcome.degree,
    roll_note: outcome.roll_note ?? null,
    rollRecord,
    check_audit: checkAudit,
    check_breakdown: checkAudit.check_breakdown,
    modifiers,
    profile,
    legal,
    social_risk: socialRisk,
    formulaText,
    action_possible: true,
    method_inferred_by_code: profile.methodInferredByCode ?? false,
    reason: describeReason(intent, modifiers, dc, legal)
  };
}

export function describeCheckOutcome(check) {
  if (!check?.required) return 'Проверка не требовалась.';
  const base = `d20=${check.roll}, модификатор=${formatSigned(check.modifier)}, DC=${check.dc}, итог=${check.total}.`;
  if (check.degree === 'success') return `${base} Успех.`;
  if (check.degree === 'partial') return `${base} Частичный успех.`;
  return `${base} Провал.`;
}

function buildCheckProfile(world, frame, intent) {
  const player = world.player ?? {};
  const action = intent?.type ?? 'unknown';
  const hasExplicitMethod = Boolean(intent?.action_method ?? intent?.actionMethod ?? intent?.preferred_attribute ?? intent?.preferredAttribute);
  const attributeKey = resolveAttributeKey(action, intent, frame, player);
  const skillKey = resolveSkillKey(action, intent, frame, player);
  const attributeValue = readAttributeValue(player, attributeKey);
  const skillValue = readSkillValue(player, skillKey);
  const stateProfile = buildStateProfile(player, action);
  const equipmentProfile = buildEquipmentProfile(player, action, intent, frame?.world?.combat ?? null);

  return {
    attributeKey,
    attributeLabel: ATTRIBUTE_LABELS[attributeKey] ?? humanizeKey(attributeKey),
    attributeValue,
    attributeBonus: attributeBonus(attributeValue),
    skillKey,
    skillLabel: SKILL_LABELS[skillKey] ?? humanizeKey(skillKey),
    skillBonus: skillValue,
    stateLabel: stateProfile.label,
    stateModifier: stateProfile.value,
    equipmentLabel: equipmentProfile.label,
    equipmentModifier: equipmentProfile.value,
    targetDefense: Number(frame?.world?.combat?.targetDefense ?? NaN),
    targetDefenseLabel: frame?.world?.combat?.target?.name ?? null,
    loadCategory: resolveLoadCategory(player),
    occupiedHands: countOccupiedHands(player),
    methodInferredByCode: !hasExplicitMethod
  };
}

export function assessLoadBlocker(action, player = {}) {
  const loadCategory = String(resolveLoadCategory(player) ?? '').toLowerCase();
  if (loadCategory !== 'overloaded') {
    return { blocked: false, load_modifier: loadCategory, travel_multiplier: 1 };
  }

  const actionKey = String(action ?? '').toLowerCase();
  const sprintLike = new Set(['flee', 'steal', 'attack']);
  if (sprintLike.has(actionKey)) {
    return {
      blocked: true,
      reason: 'предельная нагрузка: нормальное движение и манёвр почти невозможны',
      action_mode: 'drag_or_drop_or_help',
      load_modifier: 'overloaded',
      travel_multiplier: 2
    };
  }

  return {
    blocked: false,
    reason: 'предельная нагрузка: только медленное перемещение или волочение',
    action_mode: 'drag',
    load_modifier: 'overloaded',
    travel_multiplier: 2
  };
}

function resolveAttributeKey(action, intent, frame, player) {
  const method = String(intent?.action_method ?? intent?.actionMethod ?? '').toLowerCase();
  const preferred = String(intent?.preferred_attribute ?? intent?.preferredAttribute ?? '').toLowerCase();
  if (preferred && ATTRIBUTE_LABELS[preferred]) return preferred;

  const focus = String(intent?.focus ?? '').toLowerCase();
  if (action === 'attack') {
    if (method === 'quick_strike') return 'agility';
    if (method === 'ranged_shot') return focus === 'ranged' ? 'agility' : 'attention';
    if (method === 'power_strike') return 'strength';
    if (method === 'grapple' || method === 'shove') return focus === 'agility' ? 'agility' : 'strength';
    if (method === 'intimidation') return 'influence';
    return focus === 'ranged' ? 'agility' : 'strength';
  }
  if (action === 'defend') {
    if (method === 'dodge' || method === 'parry') return 'agility';
    return focus === 'stealth' ? 'agility' : 'strength';
  }
  if (action === 'flee') return focus === 'stealth' ? 'agility' : 'endurance';
  if (action === 'move') return focus === 'stealth' ? 'agility' : 'endurance';
  if (action === 'heal') return focus === 'injury' ? 'attention' : 'reason';
  if (action === 'observe') return 'attention';
  if (action === 'trade' || action === 'talk' || action === 'claim') return 'influence';
  if (action === 'steal') return 'agility';
  return 'reason';
}

function resolveSkillKey(action, intent, frame, player) {
  const method = String(intent?.action_method ?? intent?.actionMethod ?? '').toLowerCase();
  const preferred = String(intent?.preferred_skill ?? intent?.preferredSkill ?? '').toLowerCase();
  if (preferred && SKILL_LABELS[preferred]) return preferred;

  const focus = String(intent?.focus ?? '').toLowerCase();
  if (action === 'attack') {
    if (method === 'quick_strike') return 'melee';
    if (method === 'ranged_shot') return 'ranged';
    if (method === 'grapple' || method === 'shove') return focus === 'athletics' ? 'athletics' : 'melee';
    if (method === 'intimidation') return focus === 'melee' ? 'melee' : 'communication';
    return focus === 'ranged' ? 'ranged' : 'melee';
  }
  if (action === 'defend') return focus === 'stealth' ? 'athletics' : 'melee';
  if (action === 'flee') return focus === 'stealth' ? 'stealth' : 'athletics';
  if (action === 'move') return focus === 'stealth' ? 'stealth' : 'survival';
  if (action === 'heal') return 'healing';
  if (action === 'observe') return 'observation';
  if (action === 'trade' || action === 'talk') return 'communication';
  if (action === 'claim') return 'custom_and_law';
  if (action === 'steal') return 'stealth';
  return 'observation';
}

function buildStateProfile(player, action) {
  const components = collectStateComponents(player, action);
  if (components.length === 0) {
    return {
      value: 0,
      label: action === 'heal' ? 'без заметных помех' : 'в норме'
    };
  }

  const sorted = components
    .slice()
    .sort((a, b) => a.value - b.value || a.priority - b.priority);

  const primary = sorted[0];
  const secondary = sorted.find((item) => item.key !== primary.key && item.value <= -1);
  let value = primary.value;

  if (shouldStackStatePenalties(action, primary, secondary)) {
    value = Math.max(-4, primary.value + secondary.value);
  }

  return {
    value,
    label: primary.label
  };
}

function collectStateComponents(player, action) {
  const components = [];
  const coreStates = [
    { key: 'health', label: 'здоровье', value: readStateValue(player, 'health', 100), priority: 0 },
    { key: 'satiety', label: 'сытость', value: readStateValue(player, 'satiety', 100), priority: 1 },
    { key: 'vigor', label: 'бодрость', value: readStateValue(player, 'vigor', 100), priority: 2 }
  ];
  const activeStates = Array.isArray(player.activeStates) ? player.activeStates : [];

  for (const state of coreStates) {
    if (!isStateRelevantForAction(action, state.key)) continue;
    const penalty = statePenalty(state.value);
    if (penalty !== 0) {
      components.push({ ...state, value: penalty });
    }
  }

  for (const state of activeStates) {
    const stateId = String(state?.id ?? state?.label ?? '').toLowerCase();
    if (!stateId || RESOURCE_ALERT_STATE_IDS.has(stateId)) continue;
    if (!isStateRelevantForAction(action, stateId)) continue;
    const penalty = statePenaltyForActiveState(stateId, Number(state?.value ?? state?.intensity ?? 0));
    if (penalty !== 0) {
      components.push({
        key: stateId,
        label: String(state?.label ?? state?.id ?? 'состояние'),
        value: penalty,
        priority: 3
      });
    }
  }

  return components;
}

function isStateRelevantForAction(action, stateKey) {
  const key = String(stateKey ?? '').toLowerCase();
  if (!key) return false;

  switch (action) {
    case 'attack':
    case 'defend':
      return RELEVANT_STATE_KEYS.physical.has(key);
    case 'flee':
    case 'move':
      return RELEVANT_STATE_KEYS.movement.has(key);
    case 'heal':
      return RELEVANT_STATE_KEYS.healing.has(key);
    case 'observe':
      return RELEVANT_STATE_KEYS.observe.has(key);
    case 'talk':
    case 'trade':
    case 'claim':
      return RELEVANT_STATE_KEYS.social.has(key);
    case 'steal':
      return RELEVANT_STATE_KEYS.hiddenAction.has(key);
    default:
      return RELEVANT_STATE_KEYS.default.has(key);
  }
}

function shouldStackStatePenalties(action, primary, secondary) {
  if (!primary || !secondary) return false;
  if (!SEVERE_STATE_ACTIONS.has(action)) return false;
  if (primary.value > -2) return false;
  if (secondary.value > -1) return false;
  return true;
}

function buildEquipmentProfile(player, action, intent, combatFrame = null) {
  const items = player.items && typeof player.items === 'object' ? player.items : {};
  if (action === 'attack' || action === 'defend' || action === 'flee') {
    const focus = combatFrame?.attackFocus ?? null;
    const equipmentProfile = summarizeCombatEquipment(player, action, focus);
    if (equipmentProfile.label !== 'нет' || equipmentProfile.value !== 0) {
      const primaryItem = pickPrimaryCombatItem(equipmentProfile, action, focus);
      return applyEquipmentContextPenalty(equipmentProfile, primaryItem);
    }
  }
  if (action === 'heal') {
    const medicalItem = firstMatchingItem(
      [...(Array.isArray(items.carried_items) ? items.carried_items : []), ...(Array.isArray(items.equipment) ? items.equipment : [])],
      /(бинт|повяз|полотн|ткан|лен|вода|вино|уксус|трав|мёд|мед|шина|палк|кож)/i
    );
    if (medicalItem) {
      return applyEquipmentContextPenalty({ value: 1, label: itemLabel(medicalItem) }, medicalItem);
    }
  }
  if (action === 'move' || action === 'flee') {
    const loadCategory = String(items.load_category ?? '').toLowerCase();
    if (loadCategory === 'heavy') return { value: 0, label: 'тяжёлая нагрузка' };
    if (loadCategory === 'overloaded') return { value: 0, label: 'перегрузка' };
  }
  return { value: 0, label: 'нет' };
}

function pickPrimaryCombatItem(equipmentProfile, action, focus) {
  const items = Array.isArray(equipmentProfile?.items) ? equipmentProfile.items : [];
  if (items.length === 0) return null;
  if (action === 'attack') {
    return items.find((profile) => isWeaponSuitableForCheck(profile?.item, focus))?.item ?? items[0]?.item ?? null;
  }
  return items[0]?.item ?? null;
}

function isWeaponSuitableForCheck(item, focus = null) {
  const label = itemLabel(item).toLowerCase();
  const zone = String(focus?.zone ?? 'body').toLowerCase();
  const direction = String(focus?.direction ?? 'front').toLowerCase();
  if (/арбал|лук/.test(label)) {
    return zone === 'body' || zone === 'head';
  }
  if (/копь|пика|рогатин/.test(label)) {
    return direction !== 'back' || zone === 'body';
  }
  return true;
}

function applyEquipmentContextPenalty(profile, item) {
  if (!profile || !item) return profile;
  const penalty = contextualItemCheckPenalty(item);
  if (penalty <= 0) return profile;
  return {
    ...profile,
    value: Math.max(-2, Number(profile.value ?? 0) - penalty)
  };
}

function contextualItemCheckPenalty(item) {
  let penalty = 0;
  const access = String(item?.access ?? '').trim().toLowerCase();
  const legalStatus = String(item?.legal_status ?? item?.legalStatus ?? '').trim().toLowerCase();
  const ownerId = String(item?.owner_id ?? item?.ownerId ?? '').trim();
  const holderId = String(item?.holder_id ?? item?.holderId ?? '').trim();
  const risk = Number(item?.risk);

  if (access === 'borrowed' || access === 'held_for_others' || access === 'restricted') {
    penalty = Math.max(penalty, 1);
  }
  if (legalStatus === 'disputed' || legalStatus === 'restricted') {
    penalty = Math.max(penalty, 1);
  }
  if (ownerId && holderId && ownerId !== holderId) {
    penalty = Math.max(penalty, 1);
  }
  if (Number.isFinite(risk) && risk >= 4) {
    penalty = Math.max(penalty, 1);
  }

  return penalty;
}

export { resolveLoadCategory, deriveCarriedWeight } from './load-model.js';

function loadModifiers(player = {}) {
  const loadCategory = String(resolveLoadCategory(player) ?? '').toLowerCase();
  if (loadCategory === 'moderate') return [mod('нагрузка (средняя)', -1, 'load:moderate', 'load')];
  if (loadCategory === 'heavy') return [mod('нагрузка (тяжёлая)', -2, 'load:heavy', 'load')];
  if (loadCategory === 'overloaded') return [mod('нагрузка (предельная)', -4, 'load:overloaded', 'load')];
  return [];
}

function attributeBonus(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.floor((numeric - 10) / 2);
}

function readAttributeValue(player, key) {
  const value = Number(player.attributes?.[key]);
  return Number.isFinite(value) ? value : 10;
}

function readSkillValue(player, key) {
  const value = Number(player.skill_bonuses?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function readStateValue(player, key, fallback = 100) {
  const value = Number(player.states?.[key]);
  if (Number.isFinite(value)) return value;
  return Number.isFinite(Number(fallback)) ? Number(fallback) : 100;
}

function statePenalty(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 0) return -4;
  if (numeric <= 20) return -2;
  if (numeric <= 49) return -1;
  return 0;
}

function statePenaltyForActiveState(stateId, value) {
  if (stateId === 'thirst') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    if (numeric >= 100) return -4;
    if (numeric >= 80) return -2;
    if (numeric >= 50) return -1;
    return 0;
  }

  return statePenalty(value);
}

const RELEVANT_STATE_KEYS = {
  physical: new Set(['health', 'satiety', 'vigor', 'thirst', 'bleeding', 'pain', 'fear', 'intoxication', 'sleep', 'injury']),
  movement: new Set(['health', 'satiety', 'vigor', 'thirst', 'bleeding', 'pain', 'fear', 'intoxication', 'sleep', 'injury']),
  healing: new Set(['health', 'vigor', 'thirst', 'bleeding', 'pain', 'fear', 'intoxication', 'sleep', 'injury']),
  observe: new Set(['health', 'vigor', 'thirst', 'fear', 'pain', 'sleep', 'intoxication']),
  social: new Set(['health', 'vigor', 'fear', 'pain', 'sleep', 'intoxication']),
  hiddenAction: new Set(['health', 'vigor', 'fear', 'pain', 'sleep', 'intoxication']),
  default: new Set(['health', 'vigor', 'thirst', 'fear', 'sleep'])
};

const SEVERE_STATE_ACTIONS = new Set(['attack', 'defend', 'flee', 'move', 'heal']);

function firstMatchingItem(items = [], pattern) {
  return (Array.isArray(items) ? items : []).find((item) => isUsableOwnedResource(item) && pattern.test(itemLabel(item)));
}

function itemLabel(item) {
  return String(item?.label ?? item?.name ?? item?.title ?? item ?? '').trim();
}

function humanizeKey(key) {
  return String(key ?? '').replace(/_/g, ' ');
}

const ATTRIBUTE_LABELS = {
  strength: 'Сила',
  agility: 'Ловкость',
  endurance: 'Выносливость',
  reason: 'Разум',
  attention: 'Внимание',
  influence: 'Влияние'
};

const SKILL_LABELS = {
  athletics: 'Атлетика',
  stealth: 'Скрытность',
  melee: 'Ближний бой',
  ranged: 'Дальний бой',
  craft: 'Ремесло',
  household: 'Хозяйство',
  survival: 'Выживание',
  riding: 'Верховая езда',
  healing: 'Лечение',
  observation: 'Наблюдательность',
  communication: 'Общение',
  custom_and_law: 'Обычай и закон'
};

// Hunger/fatigue/sleep may exist as active alerts, but their mechanical penalty
// already comes from core satiety/vigor, so checks must not double-count them.
const RESOURCE_ALERT_STATE_IDS = new Set(['hunger', 'fatigue', 'sleep']);

function isCheckRequired(world, frame, intent) {
  if (!intent || intent.type === 'unknown') return true;
  if (intent.type === 'attack' || intent.type === 'defend' || intent.type === 'flee' || intent.type === 'heal' || intent.type === 'claim') return true;
  if (intent.type === 'trade' || intent.type === 'talk') return Boolean(intent.target || world.social?.suspicion > 2);
  if (intent.type === 'move') {
    if (hasClearRoute(frame, intent)) return false;
    return Boolean(frame.risks.length > 0 || frame.constraints.some((item) => item.includes('не подтверждён')));
  }
  if (intent.type === 'observe') return Boolean(intent.target || world.scene?.attention === 'высокое');
  if (intent.type === 'heal') return Boolean((world.player?.injuries?.length ?? 0) > 0 || (world.player?.bleeding ?? 0) > 0);
  return false;
}

function resolveRequired(world, frame, intent) {
  const audit = frame.riskAudit;
  if (audit && typeof audit.required === 'boolean') {
    return audit.required;
  }
  return isCheckRequired(world, frame, intent);
}

function mod(label, value, sourceId, category) {
  return { label, value, source_id: sourceId, category };
}

function normalizeCircumstanceModifiers(modifiers = []) {
  const circumstance = modifiers.filter((item) => item.category === 'circumstance' || item.category === 'load' || item.category === 'combat');
  const fixed = modifiers.filter((item) => !['circumstance', 'load', 'combat'].includes(item.category));
  const bonuses = circumstance.filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  const penalties = circumstance.filter((item) => item.value < 0).sort((a, b) => a.value - b.value);
  const limited = [
    ...(bonuses.length > 0 ? [bonuses[0]] : []),
    ...(penalties.length > 0 ? [penalties[0]] : [])
  ];
  return [...fixed, ...limited];
}

function buildCheckAuditRecord({
  world,
  frame,
  intent,
  profile,
  modifiers,
  difficulty,
  roll,
  total,
  dc,
  outcome,
  rollRecord,
  socialRisk
}) {
  const checkId = `check_${world?.worldId ?? 'world'}_${Date.now()}`;
  const stateSources = profile.stateLabel ? [profile.stateLabel] : [];
  const equipmentSources = profile.equipmentLabel ? [profile.equipmentLabel] : [];
  const circumstanceSources = modifiers
    .filter((item) => ['circumstance', 'load', 'combat'].includes(item.category))
    .map((item) => item.label);
  return {
    check_id: checkId,
    intent: intent?.type ?? null,
    die: 'd20',
    roll,
    attribute: { key: profile.attributeKey, value: profile.attributeValue, bonus: profile.attributeBonus },
    skill: { key: profile.skillKey, bonus: profile.skillBonus },
    state_modifier: { value: profile.stateModifier, sources: stateSources },
    equipment_modifier: { value: profile.equipmentModifier, sources: equipmentSources },
    circumstance_modifier: {
      value: modifiers
        .filter((item) => ['circumstance', 'load', 'combat'].includes(item.category))
        .reduce((sum, item) => sum + item.value, 0),
      sources: circumstanceSources
    },
    dc: { value: dc, basis: difficulty.dc_basis },
    total,
    margin: outcome.margin,
    band: outcome.band,
    roll_note: outcome.roll_note ?? null,
    social_risk: socialRisk,
    rng: {
      mode: rollRecord.rng_mode,
      algorithm: rollRecord.algorithm,
      seed_ref: rollRecord.seed_ref,
      counter: rollRecord.counter
    },
    check_breakdown: {
      dc_basis: difficulty.dc_basis,
      actor_modifiers: modifiers.filter((item) => item.category === 'actor').map((item) => item.source_id),
      equipment_modifiers: modifiers.filter((item) => item.category === 'equipment').map((item) => item.source_id),
      circumstance_modifiers: circumstanceSources,
      social_risk: socialRisk.factors
    }
  };
}

function buildModifiers(world, frame, intent, location, microLocation) {
  const modifiers = [];
  const player = world.player ?? {};
  const social = world.social ?? {};

  if ((player.status ?? '').toLowerCase().includes('чуж')) {
    modifiers.push(mod('чужак', -1, 'circumstance:foreigner', 'circumstance'));
  }
  if ((player.status ?? '').toLowerCase().includes('свой') || (player.status ?? '').toLowerCase().includes('местн')) {
    modifiers.push(mod('местный статус', 1, 'circumstance:local_status', 'circumstance'));
  }
  if ((player.role ?? '').toLowerCase().includes('торгов')) {
    modifiers.push(mod('знакомый торговый статус', 1, 'circumstance:trader_status', 'circumstance'));
  }
  if ((social.reputation ?? 0) > 3) {
    modifiers.push(mod('социальный след', 1, 'circumstance:reputation', 'circumstance'));
  }
  if (frame.world.location.recentTraces.length > 0) {
    modifiers.push(mod('зафиксированные факты', -1, 'circumstance:recent_traces', 'circumstance'));
  }
  if (intent.type === 'move' && (location?.exits?.length ?? 0) > 0) {
    modifiers.push(mod('доступные пути', 1, 'circumstance:available_paths', 'circumstance'));
  }
  if (intent.type === 'defend') {
    modifiers.push(mod('оборона в ответ на угрозу', 1, 'circumstance:defense', 'circumstance'));
  }
  if (intent.type === 'flee') {
    modifiers.push(mod('побег под давлением', -1, 'circumstance:flee_pressure', 'circumstance'));
  }
  if (intent.type === 'claim') {
    modifiers.push(mod('самоутверждение без подтверждения', -2, 'circumstance:claim', 'circumstance'));
  }
  if (intent.type === 'heal') {
    modifiers.push(mod('лечение и перевязка', 1, 'circumstance:heal', 'circumstance'));
    if ((world.player?.injuries?.length ?? 0) > 0) {
      modifiers.push(mod('наличие конкретной раны', 1, 'circumstance:injury_present', 'circumstance'));
    }
  }
  if (intent.target) {
    modifiers.push(mod('конкретная цель', 1, 'circumstance:target', 'circumstance'));
  }
  if (intent.type === 'heal' && (world.player?.bleeding ?? 0) > 0) {
    modifiers.push(mod('актуальное кровотечение', -1, 'circumstance:bleeding', 'circumstance'));
  }
  if (microLocation?.kind === 'край' && intent.type !== 'observe') {
    modifiers.push(mod('край микролокации', -1, 'circumstance:micro_edge', 'circumstance'));
  }
  if (intent.type === 'move') {
    modifiers.push(...loadModifiers(player));
  }
  if (intent.type === 'attack' || intent.type === 'defend' || intent.type === 'flee') {
    modifiers.push(...loadModifiers(player));
    modifiers.push(...combatModifiers(world, intent, location, microLocation));
  }
  if (intent.type === 'heal') {
    modifiers.push(...healingModifiers(world, location, microLocation));
    modifiers.push(...occupiedHandsModifiers(player, intent));
  }
  if (intent.type === 'steal') {
    modifiers.push(...occupiedHandsModifiers(player, intent));
  }

  return modifiers;
}

function buildDifficulty(world, frame, intent, modifiers) {
  const modifierSourceIds = new Set(modifiers.map((item) => item.source_id).filter(Boolean));
  const dcBasis = [];
  const blockedSources = new Set([
    'social:suspicion',
    'social:witnesses',
    'social:known_by',
    'social:violence',
    'social:theft',
    'social:legal_pressure'
  ]);

  if (intent.type === 'attack') {
    const combatDefense = Number(frame?.world?.combat?.targetDefense);
    if (Number.isFinite(combatDefense)) {
      dcBasis.push('target_defense');
      return { dc: clampDifficulty(combatDefense), dc_basis: dcBasis };
    }
  }

  let dc = 10;
  dcBasis.push('base_ordinary');

  if (world.scene?.attention === 'высокое') {
    dc += 2;
    dcBasis.push('scene_attention');
  }
  if ((world.clock?.hour ?? 0) >= 20 || (world.clock?.hour ?? 0) < 6) {
    dc += 1;
    dcBasis.push('night');
  }
  if ((world.region?.tensions?.length ?? 0) > 0) {
    dc += 1;
    dcBasis.push('regional_tension');
  }
  if (intent.type === 'defend') {
    dc += 2;
    dcBasis.push('defend');
  }
  if (intent.type === 'flee') {
    dc += 2;
    dcBasis.push('flee');
  }
  if (intent.type === 'claim') {
    dc += 3;
    dcBasis.push('claim');
  }
  if (intent.type === 'heal') {
    dc += 1;
    dcBasis.push('heal');
    if ((world.player?.bleeding ?? 0) > 0) {
      dc += 1;
      dcBasis.push('bleeding');
    }
  }
  if (intent.type === 'trade') {
    dc += 2;
    dcBasis.push('trade');
  }
  if (intent.type === 'move') {
    if (frame.risks.length > 0) {
      dc += 2;
      dcBasis.push('movement_risk');
    }
    if (frame.risks.length > 2) {
      dc += 3;
      dcBasis.push('movement_risk_high');
    }
    if (frame.risks.length > 3) {
      dc += 5;
      dcBasis.push('movement_risk_extreme');
    }
  }
  if (intent.type === 'move' && /брод|болот|метел|шторм|опасн/i.test(String(intent.raw ?? intent.target ?? ''))) {
    dc += 5;
    dcBasis.push('dangerous_terrain');
  }
  if (intent.type === 'move' && /почти невозмож|безнадёж/i.test(String(intent.raw ?? intent.target ?? ''))) {
    dc += 10;
    dcBasis.push('nearly_impossible');
  }

  for (const sourceId of blockedSources) {
    if (modifierSourceIds.has(sourceId)) {
      // ponytail: guard against double-counting if social factors return to modifiers
      dcBasis.push(`blocked_double_count:${sourceId}`);
    }
  }

  return { dc: clampDifficulty(dc), dc_basis: dcBasis };
}

function describeReason(intent, modifiers, dc, legal = null) {
  const factors = modifiers.slice(0, 4).map((item) => `${item.label}${formatSigned(item.value)}`);
  const legalText = legal?.label ? ` Правовой риск: ${legal.label}.` : '';
  return `Проверка для ${intent.type} с DC ${dc}: ${factors.join(', ') || 'без модификаторов'}.${legalText}`;
}

function buildFormulaText(roll, total, dc, modifiers, profile) {
  const parts = [
    `d20=${roll}`,
    `характеристика (${profile.attributeLabel})${formatSigned(profile.attributeBonus)}`,
    `навык (${profile.skillLabel})${formatSigned(profile.skillBonus)}`,
    `состояние (${profile.stateLabel})${formatSigned(profile.stateModifier)}`,
    `снаряжение (${profile.equipmentLabel})${formatSigned(profile.equipmentModifier)}`
  ];

  if (Number.isFinite(profile.targetDefense) && profile.targetDefense > 0) {
    parts.push(`защита цели${profile.targetDefenseLabel ? ` (${profile.targetDefenseLabel})` : ''}=${profile.targetDefense}`);
  }

  for (const item of modifiers) {
    if (!item || typeof item !== 'object') continue;
    const label = String(item.label ?? '').trim();
    if (!label || parts.some((part) => part.includes(label))) continue;
    parts.push(`${label}${formatSigned(item.value)}`);
  }

  return `${parts.join(', ')}; итог=${total}; DC=${dc}`;
}

function formatSigned(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function hasClearRoute(frame, intent) {
  const target = String(intent.target ?? intent.raw ?? '').toLowerCase();
  if (!target) return false;
  const exits = frame.world?.location?.exits ?? [];
  const routeNames = exits.map((item) => String(item).toLowerCase());
  return routeNames.some((label) => label.includes(target) || target.includes(label));
}

function legalModifiers(legal, intent) {
  if (!legal) return [];
  const mods = [];
  if (legal.severity >= 1) mods.push({ label: 'правовое давление', value: -1 });
  if (legal.severity >= 2) mods.push({ label: 'свидетели и собственность', value: -1 });
  if (intent.type === 'steal' && legal.severity >= 3) mods.push({ label: 'практически гарантированное разоблачение', value: -2 });
  return mods;
}

function healingModifiers(world, location, microLocation) {
  const mods = [];
  const player = world.player ?? {};
  const supplies = collectCarriedItemLabels(player).filter((item) => /ткан|полотн|бинт|хлеб|вино|вода|трав|зель|мёд|сало|уксус/i.test(item));
  if (supplies.length > 0) {
    mods.push({ label: 'есть перевязочный материал', value: 2 });
  } else {
    mods.push({ label: 'нехватка лечебных средств', value: -1 });
  }
  if ((player.injuries?.length ?? 0) > 0) {
    mods.push({ label: 'есть конкретная рана', value: 1 });
  }
  if ((player.bleeding ?? 0) > 0) {
    mods.push({ label: 'активное кровотечение', value: -1 });
  }
  if (/ноч|темно/.test(String(world.scene?.light ?? '').toLowerCase())) {
    mods.push({ label: 'темно лечить труднее', value: -1 });
  }
  if (/дожд|холод|мокр|ветер/.test(String(world.scene?.weather ?? '').toLowerCase())) {
    mods.push({ label: 'погода мешает перевязке', value: -1 });
  }
  if (microLocation?.kind === 'вход' || microLocation?.kind === 'ядро') {
    mods.push({ label: 'есть место для осмотра', value: 1 });
  }
  return mods;
}

function occupiedHandsModifiers(player = {}, intent = {}) {
  const occupiedHands = countOccupiedHands(player);
  if (occupiedHands < 2) return [];
  if (intent.type === 'heal') {
    return [{ label: 'обе руки заняты', value: -2 }];
  }
  if (intent.type === 'steal') {
    return [{ label: 'обе руки заняты', value: -1 }];
  }
  return [];
}

function combatModifiers(world, intent, location, microLocation) {
  const mods = [];
  const player = world.player ?? {};
  const weaponProfile = summarizeWeaponDanger(player);
  const activeDefenseProfile = summarizeActiveDefense(player, { zone: 'body', direction: 'front' });
  const armorItems = Array.isArray(player.items?.armor) ? player.items.armor.filter((item) => item && typeof item === 'object') : [];
  const enemyCount = (location?.occupants ?? []).filter((name) => name && name !== player.name).length;
  const weather = String(world.scene?.weather ?? '').toLowerCase();
  const light = String(world.scene?.light ?? '').toLowerCase();

  if (weaponProfile.value > 0 && (intent.type === 'attack' || intent.type === 'defend')) {
    mods.push({ label: `оружие (${weaponProfile.label})`, value: 0 });
  }
  if (intent.type === 'defend' && armorItems.length > 0) {
    mods.push({ label: `броня (${itemLabel(armorItems[0])})`, value: 0 });
  }
  if (intent.type === 'defend' && activeDefenseProfile.value > 0) {
    mods.push({ label: `щит (${activeDefenseProfile.label})`, value: 0 });
  }

  if (enemyCount > 1 && intent.type === 'attack') {
    mods.push({ label: 'численный перевес противника', value: -2 });
  }
  if (enemyCount === 1 && intent.type === 'defend') {
    mods.push({ label: 'локальная оборона', value: 1 });
  }
  if (/ноч|темно/.test(light)) {
    mods.push({ label: 'слабая видимость', value: -1 });
  }
  if (/дожд|туман|ветер|холод|мокр/.test(weather)) {
    mods.push({ label: 'погода мешает', value: -1 });
  }
  if (microLocation?.kind === 'вход' && intent.type === 'flee') {
    mods.push({ label: 'близкий выход', value: 1 });
  }
  if (microLocation?.kind === 'край' && intent.type === 'attack') {
    mods.push({ label: 'узкое пространство', value: 1 });
  }

  return mods;
}

function collectCarriedItemLabels(actor = {}) {
  const items = Array.isArray(actor.items?.carried_items) ? actor.items.carried_items : [];
  return items
    .filter((item) => isUsableOwnedResource(item))
    .map((item) => itemLabel(item))
    .filter(Boolean);
}

