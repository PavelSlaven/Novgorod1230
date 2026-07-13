function itemLabel(item) {
  return String(item?.label ?? item?.name ?? item?.title ?? item ?? '').trim();
}

function itemType(item) {
  return String(item?.type ?? '').trim().toLowerCase();
}

import { handUsageForItem, isQuickAccessibleItem } from './item-access.js';
import { resolveLoadCategory } from './load-model.js';

function itemCondition(item) {
  return String(item?.condition ?? item?.state ?? 'unknown').trim().toLowerCase();
}

function itemWeight(item) {
  const value = Number(item?.weight ?? item?.mass ?? NaN);
  return Number.isFinite(value) ? value : null;
}

function isCombatReadyWeapon(item) {
  if (!itemLabel(item)) return false;
  if (!isQuickAccessibleItem(item)) return false;
  return itemType(item) === 'weapon';
}

function isCombatReadyArmor(item) {
  if (!itemLabel(item)) return false;
  if (!isQuickAccessibleItem(item)) return false;
  return itemType(item) === 'armor' || itemType(item) === 'clothing';
}

function conditionPenalty(item) {
  const condition = itemCondition(item);
  if (!condition || condition === 'unknown') return 0;
  if (/(broken|слом|разлом|неисправ|ruin)/i.test(condition)) return -2;
  if (/(worn|изнош|damaged|плох|туп|мокр|wet)/i.test(condition)) return -1;
  return 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function weaponDangerBase(item) {
  const label = itemLabel(item).toLowerCase();
  const type = itemType(item);
  if (/арбал|лук/.test(label)) return 4;
  if (/копь|пика|рогатин|гизарм/.test(label)) return 3;
  if (/меч|сабл|шпага/.test(label)) return 3;
  if (/топор/.test(label)) return 3;
  if (/дубин|булав|палиц|посох/.test(label)) return 2;
  if (/нож|кинжал/.test(label)) return 2;
  if (/камень|пращ|метател/.test(label)) return 2;
  if (/палк|клюк|лом/.test(label)) return 1;
  if (type === 'weapon') return 2;
  return 0;
}

function armorProtectionBase(item) {
  const label = itemLabel(item).toLowerCase();
  const type = itemType(item);
  if (/щит/.test(label)) return 2;
  if (/шлем|шиша|шелом/.test(label)) return 2;
  if (/латы|панц|кольчуг|доспех|брон/.test(label)) return 3;
  if (/кожан|стёган|подклад|плотн[а-я]* защит/.test(label)) return 2;
  if (/мех|тёпл|пух|шерст|зимн|толст[а-я]* одежд|плотн[а-я]* одежд/.test(label)) return 1;
  if (type === 'armor') return 2;
  if (type === 'clothing') return 0;
  return 0;
}

function armorGroup(item) {
  const label = itemLabel(item).toLowerCase();
  if (/щит/.test(label)) return 'shield';
  if (/шлем/.test(label)) return 'head';
  if (/кольчуг|доспех|брон/.test(label)) return 'body';
  if (/кожан|стёган|мех|плотн/.test(label)) return 'body';
  if (itemType(item) === 'clothing') return 'clothing';
  return 'other';
}

function armorCoverage(item) {
  const label = itemLabel(item).toLowerCase();
  const type = itemType(item);
  if (/щит/.test(label)) return ['front'];
  if (/шлем/.test(label)) return ['head'];
  if (/кольчуг|доспех|брон/.test(label)) return ['body'];
  if (/кожан|стёган|мех|плотн/.test(label)) return ['body'];
  if (/перчат|рукавиц/.test(label)) return ['arms'];
  if (/сапог|обув/.test(label)) return ['legs'];
  if (type === 'armor') return ['body'];
  if (type === 'clothing') return /плотн|стёган|мех|тёпл|зимн|подклад/.test(label) ? ['body'] : [];
  return [];
}

function isShieldItem(item) {
  const label = itemLabel(item).toLowerCase();
  return /щит/.test(label);
}

function weaponReach(item) {
  const label = itemLabel(item).toLowerCase();
  if (/арбал|лук/.test(label)) return 'ranged';
  if (/копь|пика|рогатин/.test(label)) return 'reach';
  if (/топор|меч|дубин|нож|кинжал|пращ|палк/.test(label)) return 'melee';
  return 'melee';
}

function isWeaponSuitableForFocus(item, focus = null) {
  const reach = weaponReach(item);
  const zone = String(focus?.zone ?? 'body').toLowerCase();
  const direction = String(focus?.direction ?? 'front').toLowerCase();
  if (reach === 'ranged') {
    return zone === 'body' || zone === 'head';
  }
  if (reach === 'reach') {
    return direction !== 'back' || zone === 'body';
  }
  return true;
}

function itemWeightPenalty(item) {
  const weight = itemWeight(item);
  if (!Number.isFinite(weight)) return 0;
  if (weight >= 6) return -1;
  return 0;
}

function attackDirectionFromText(text = '') {
  const value = String(text).toLowerCase();
  if (/(сзади|в спину|из-за спины|со спины)/.test(value)) return 'back';
  if (/(сбоку|в бок|сбоку|влево|вправо|с фланга)/.test(value)) return 'side';
  return 'front';
}

function attackZoneFromText(text = '') {
  const value = String(text).toLowerCase();
  if (/(голов|череп|лиц|высок)/.test(value)) return 'head';
  if (/(рук|кист|локт|плеч)/.test(value)) return 'arms';
  if (/(ног|бедр|колен|голен|ступ)/.test(value)) return 'legs';
  if (/(корпус|груд|живот|брюш|туловищ|грудь|спин|бок)/.test(value)) return 'body';
  return 'body';
}

export function deriveAttackFocus(intent = {}, frame = null) {
  const text = `${intent?.raw ?? ''} ${frame?.input ?? ''}`;
  return {
    zone: attackZoneFromText(text),
    direction: attackDirectionFromText(text)
  };
}

export function armorCoverageSummary(actor = {}) {
  const armorItems = Array.isArray(actor.items?.armor) ? actor.items.armor : [];
  const equipmentItems = Array.isArray(actor.items?.equipment) ? actor.items.equipment : [];
  const items = [...armorItems, ...equipmentItems].filter((item) => isCombatReadyArmor(item));
  const profiles = items.map((item) => {
    const coverage = armorCoverage(item);
    const protection = clamp(armorProtectionBase(item) + conditionPenalty(item), 0, 4);
    return {
      item,
      label: itemLabel(item),
      group: armorGroup(item),
      coverage,
      protection
    };
  }).filter((profile) => profile.protection > 0);

  if (profiles.length === 0) {
    return { value: 0, label: 'нет', items: [] };
  }

  profiles.sort((a, b) => b.protection - a.protection || a.label.localeCompare(b.label));
  const strongest = profiles[0];
  const distinctGroups = new Set(profiles.map((profile) => profile.group));
  const extraLayer = distinctGroups.size > 1 ? 1 : 0;
  return {
    value: clamp(strongest.protection + extraLayer, 0, 4),
    label: strongest.label,
    items: profiles
  };
}

export function summarizeActiveDefense(actor = {}, focus = null) {
  const attackFocus = focus ?? { zone: 'body', direction: 'front' };
  const armorItems = Array.isArray(actor.items?.armor) ? actor.items.armor : [];
  const equipmentItems = Array.isArray(actor.items?.equipment) ? actor.items.equipment : [];
  const items = [...armorItems, ...equipmentItems].filter((item) => isCombatReadyArmor(item) && isShieldItem(item));
  if (items.length === 0) {
    return { value: 0, label: 'нет', items: [] };
  }

  if (attackFocus.direction !== 'front') {
    return { value: 0, label: 'нет', items: [] };
  }

  const profiles = items.map((item) => {
    const protection = clamp(armorProtectionBase(item) + conditionPenalty(item), 0, 4);
    return {
      item,
      label: itemLabel(item),
      coverage: armorCoverage(item),
      protection
    };
  }).filter((profile) => profile.protection > 0);

  if (profiles.length === 0) {
    return { value: 0, label: 'нет', items: [] };
  }

  profiles.sort((a, b) => b.protection - a.protection || a.label.localeCompare(b.label));
  const strongest = profiles[0];
  const fullDefense = String(actor?.combatStance ?? actor?.defenseMode ?? '').toLowerCase() === 'full_defense';
  const value = fullDefense ? 4 : 2;
  return {
    value,
    label: strongest.label,
    items: profiles,
    shield_ready: true,
    full_defense: fullDefense
  };
}

function coverageMatches(profileCoverage, focus) {
  const zones = Array.isArray(profileCoverage) ? profileCoverage : [];
  if (zones.includes('all')) return true;
  if (zones.includes(focus.zone)) return true;
  if (focus.direction === 'front' && zones.includes('front')) {
    return focus.zone !== 'legs';
  }
  return false;
}

export function summarizeWeaponDanger(actor = {}) {
  const items = Array.isArray(actor.items?.weapons) ? actor.items.weapons : [];
  const readyItems = items.filter((item) => isCombatReadyWeapon(item));
  const profiles = readyItems.map((item) => {
    const danger = clamp(weaponDangerBase(item) + conditionPenalty(item) + itemWeightPenalty(item), 0, 5);
    return {
      item,
      label: itemLabel(item),
      reach: weaponReach(item),
      hands: Math.max(1, handUsageForItem(item)),
      ready: true,
      suitable: true,
      danger
    };
  }).filter((profile) => profile.danger > 0);

  if (profiles.length === 0) {
    return { value: 0, label: 'нет', items: [] };
  }

  profiles.sort((a, b) => b.danger - a.danger || a.label.localeCompare(b.label));
  return {
    value: profiles[0].danger,
    label: profiles[0].label,
    items: profiles
  };
}

export function summarizeCombatEquipment(actor = {}, action = 'attack', focus = null) {
  const weaponSummary = summarizeWeaponDanger(actor);
  const armorSummary = summarizeArmorProtection(actor, focus);
  const activeDefenseSummary = summarizeActiveDefense(actor, focus);
  const actionKey = String(action ?? '').toLowerCase();

  if (actionKey === 'defend') {
    if (activeDefenseSummary.value > 0) {
      return {
        value: 0,
        label: activeDefenseSummary.label,
        items: activeDefenseSummary.items,
        active_defense_bonus: activeDefenseSummary.value
      };
    }

    const wornArmorItems = Array.isArray(actor.items?.armor)
      ? actor.items.armor.filter((item) => item && typeof item === 'object')
      : [];
    if (wornArmorItems.length > 0) {
      return {
        value: 1,
        label: itemLabel(wornArmorItems[0]),
        items: armorSummary.items
      };
    }

    if (Array.isArray(weaponSummary.items) && weaponSummary.items.length > 0) {
      return {
        value: 0,
        label: weaponSummary.items[0].label,
        items: weaponSummary.items
      };
    }

    return { value: 0, label: 'нет', items: [] };
  }

  if (actionKey === 'attack') {
    const bestWeapon = Array.isArray(weaponSummary.items)
      ? weaponSummary.items.find((profile) => isWeaponSuitableForFocus(profile.item, focus)) ?? weaponSummary.items[0]
      : null;
    if (!bestWeapon) return { value: 0, label: 'нет', items: [] };
    const suitable = isWeaponSuitableForFocus(bestWeapon.item, focus);
    return {
      value: suitable && bestWeapon.danger >= 2 ? 1 : (suitable ? 0 : -1),
      label: bestWeapon.label,
      items: weaponSummary.items
    };
  }

  if (actionKey === 'flee') {
    return { value: 0, label: 'нет', items: [] };
  }

  return { value: 0, label: 'нет', items: [] };
}

export function summarizeArmorProtection(actor = {}, focus = null) {
  const summary = armorCoverageSummary(actor);
  const attackFocus = focus ?? { zone: 'body', direction: 'front' };
  const profiles = Array.isArray(summary.items)
    ? summary.items
      .filter((profile) => !isShieldItem(profile.item))
      .filter((profile) => coverageMatches(profile.coverage, attackFocus))
    : [];

  if (profiles.length === 0) {
    return { value: 0, label: 'нет', items: [] };
  }

  profiles.sort((a, b) => b.protection - a.protection || a.label.localeCompare(b.label));
  const strongest = profiles[0];
  const distinctGroups = new Set(profiles.map((profile) => profile.group));
  const extraLayer = distinctGroups.size > 1 ? 1 : 0;
  return {
    value: clamp(strongest.protection + extraLayer, 0, 4),
    label: strongest.label,
    items: profiles
  };
}

export function combatQualityFromMargin(margin) {
  const value = Number(margin);
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value >= 15) return 4;
  if (value >= 10) return 3;
  if (value >= 5) return 2;
  return 1;
}

export function combatHealthLossFromDamageScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value) || value <= 1) return 0;
  if (value <= 3) return 5;
  if (value <= 5) return 12;
  if (value <= 7) return 25;
  return 45;
}

export function combatInjuryProfileFromDamageScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value) || value <= 1) {
    return null;
  }
  if (value <= 3) {
    return { severity: 1, bleeding: 0, label: 'лёгкая рана' };
  }
  if (value <= 5) {
    return { severity: 2, bleeding: 1, label: 'средняя рана' };
  }
  if (value <= 7) {
    return { severity: 3, bleeding: 2, label: 'тяжёлая рана' };
  }
  return { severity: 4, bleeding: 3, label: 'критическая рана' };
}

export function summarizeCombatVulnerability(target = {}) {
  let value = 0;
  const health = Number(target?.states?.health ?? target?.health ?? 100);
  const bleeding = Number(target?.bleeding ?? target?.states?.bleeding ?? 0);
  if (health <= 20) value += 1;
  if (bleeding > 0) value += 1;
  if ((Array.isArray(target?.injuries) ? target.injuries.length : 0) > 0) value += 1;
  return clamp(value, 0, 2);
}

function resolveLoadModifier(loadCategory) {
  const text = String(loadCategory ?? '').toLowerCase();
  if (text === 'moderate') return 1;
  if (text === 'heavy') return 2;
  if (text === 'overloaded') return 3;
  return 0;
}

export function summarizeBattleExertion(world = {}, intent = null, combatFrame = null) {
  const action = String(intent?.type ?? '').toLowerCase();
  if (!['attack', 'defend', 'flee'].includes(action)) {
    return { value: 0, label: 'нет', items: [] };
  }

  const player = world.player ?? {};
  const items = [];
  const base = action === 'flee' ? 6 : 4;
  items.push({ label: `база (${action})`, value: base });

  const loadCategory = String(resolveLoadCategory(player) ?? player.items?.load_category ?? '').toLowerCase();
  const loadModifier = resolveLoadModifier(loadCategory);
  if (loadModifier > 0) {
    items.push({ label: `нагрузка (${loadCategory || 'неизвестно'})`, value: loadModifier });
  }

  const weather = String(world.scene?.weather ?? '').toLowerCase();
  const light = String(world.scene?.light ?? '').toLowerCase();
  if (/ноч|темно/.test(light) || /ноч|темно/.test(weather)) {
    items.push({ label: 'ночь или темнота', value: 1 });
  }
  if (/дожд|холод|мокр|ветер|снег|гряз/.test(weather)) {
    items.push({ label: 'тяжёлая погода', value: 1 });
  }

  const bleeding = Number(player.bleeding ?? 0);
  if (bleeding > 0) {
    items.push({ label: 'кровопотеря', value: 1 });
  }

  const injuries = Array.isArray(player.injuries) ? player.injuries.length : 0;
  if (injuries > 0) {
    items.push({ label: 'раны', value: Math.min(2, injuries) });
  }

  const witnessCount = Number(world.social?.witnesses?.length ?? world.social?.recentWitnesses?.length ?? 0);
  if (witnessCount > 0 && action === 'attack') {
    items.push({ label: 'свидетели', value: 1 });
  }

  if (action === 'flee') {
    items.push({ label: 'бегство', value: 1 });
  }

  const armorProtection = Number(
    combatFrame?.playerArmorProtection
      ?? summarizeArmorProtection(player, { zone: 'body', direction: 'front' }).value
      ?? 0
  );
  if (armorProtection >= 3) {
    items.push({ label: 'тяжёлый доспех', value: 1 });
  }

  const value = items.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
  return {
    value: clamp(value, 0, 10),
    label: action,
    items
  };
}

export function summarizeBattleAftermath(world = {}, intent = null, combatFrame = null, combatOutcome = null) {
  const action = String(intent?.type ?? '').toLowerCase();
  const witnessed = Number(combatFrame?.witnesses?.length ?? 0) > 0
    || Number(world.social?.recentWitnesses?.length ?? 0) > 0
    || Number(world.social?.witnesses?.length ?? 0) > 0;
  const healthLoss = Number(combatOutcome?.healthLoss ?? 0);
  const damageScore = Number(combatOutcome?.damageScore ?? 0);
  const injury = combatOutcome?.injury ?? null;

  let suspicion = 0;
  let fear = 0;
  let debts = 0;
  let rumors = 0;

  if (action === 'attack') {
    suspicion += 2;
    debts += 1;
    if (witnessed) suspicion += 1;
    if (damageScore >= 4 || healthLoss >= 12 || injury) {
      fear += 1;
      rumors += 1;
    }
  }

  if (action === 'flee') {
    suspicion += witnessed ? 1 : 0;
    rumors += witnessed ? 1 : 0;
  }

  if (action === 'defend') {
    suspicion += witnessed ? 1 : 0;
  }

  if (combatFrame?.target?.activeDefense > 0 && action === 'attack' && witnessed) {
    fear += 1;
  }

  return {
    suspicion,
    fear,
    debts,
    rumors,
    witnessed,
    label: action || 'none'
  };
}
