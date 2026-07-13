import { buildHistoricalContext } from './historical-context.js';
import { isQuickAccessibleItem, isUsableOwnedResource } from './item-access.js';
import { syncActorStateProfile } from './profile-v2.js';

export function buildMedicalContext(world) {
  const historical = buildHistoricalContext(world);
  const supplies = buildMedicalSupplyLedger(world);
  return {
    context: historical.medicalContext ?? [],
    careRules: historical.fieldCareContext ?? [],
    supplies,
    playerHealth: world.player?.health ?? 100,
    playerBleeding: world.player?.bleeding ?? 0,
    playerInjuries: Array.isArray(world.player?.injuries) ? world.player.injuries.slice(0, 6) : [],
    nearbyHealer: findHealerNpc(world)
  };
}

export function buildMedicalSupplyLedger(world) {
  const supplies = [];
  const add = (ownerType, ownerId, ownerName, items) => {
    for (const item of items) {
      const label = itemLabel(item);
      if (!label) continue;
      supplies.push({
        id: `medical:${ownerType}:${ownerId}:${slugify(label)}`,
        label,
        ownerType,
        ownerId,
        ownerName,
        available: true
      });
    }
  };

  add('player', 'player', world.player?.name ?? 'игрок', extractMedicalItems(world.player));

  for (const npc of world.npcs ?? []) {
    add('npc', npc.id, npc.name, extractMedicalItems(npc));
  }

  return supplies;
}

export function describeMedicalCare(world, targetEntity, supplies = []) {
  const injuryCount = Array.isArray(targetEntity?.injuries) ? targetEntity.injuries.length : 0;
  const bleeding = targetEntity?.bleeding ?? 0;
  const available = supplies.map((item) => item.label);
  const historical = buildHistoricalContext(world);

  return {
    injuryCount,
    bleeding,
    supplies: available.slice(0, 6),
    rules: historical.fieldCareContext?.slice(0, 4) ?? [],
    context: historical.medicalContext?.slice(0, 4) ?? []
  };
}

export function applyFieldCare(entity, supplies = [], intensity = 'normal') {
  if (!entity) return { treated: false, notes: [] };
  const notes = [];
  const itemLabels = normalizeSupplyLabels(supplies);
  const bandages = itemLabels.some((item) => /бинт|повяз|полотн|ткан|лен/i.test(item));
  const wash = itemLabels.some((item) => /вода|вино|уксус|трав|мёд|мед/i.test(item));
  const splint = itemLabels.some((item) => /палк|шина|дерев|ремен|кож/i.test(item));
  const hasFieldKit = bandages || wash || splint;

  if (Array.isArray(entity.injuries) && entity.injuries.length > 0) {
    const injury = entity.injuries[0];
    injury.treated = true;
    injury.severity = Math.max(0, (injury.severity ?? 1) - (bandages ? 1 : 0) - (wash ? 1 : 0));
    injury.bleeding = Math.max(0, (injury.bleeding ?? 0) - (bandages ? 1 : 0) - (wash ? 1 : 0));
    if (splint) injury.stabilized = true;
    notes.push(`Рана ${injury.label} обработана.`);
    if ((injury.severity ?? 0) === 0) {
      entity.injuries.shift();
    }
  }

  if (typeof entity.bleeding === 'number' && entity.bleeding > 0) {
    entity.bleeding = Math.max(0, entity.bleeding - (bandages ? 1 : 0) - (wash ? 1 : 0));
    notes.push('Кровотечение уменьшено.');
  }

  if (typeof entity.health === 'number') {
    const healGain = intensity === 'strong' ? 4 : intensity === 'light' ? 1 : 2;
    entity.health = Math.min(100, entity.health + (hasFieldKit ? healGain : 0));
    if (!hasFieldKit) {
      entity.health = Math.max(0, entity.health - 1);
      notes.push('Без нормального набора уход ограничен.');
    }
  }

  return {
    treated: hasFieldKit,
    notes
  };
}

export function consumeMedicalSupplies(source, labels = []) {
  if (!source || typeof source !== 'object' || labels.length === 0) return [];
  const carriedItems = ensureMutableCarriedItems(source);
  if (!Array.isArray(carriedItems) || carriedItems.length === 0) return [];
  const consumed = [];
  for (const wanted of labels) {
    const index = carriedItems.findIndex((item) => (
      isUsableOwnedResource(item) && itemLabel(item).toLowerCase().includes(String(wanted).toLowerCase())
    ));
    if (index >= 0) {
      consumed.push(carriedItems.splice(index, 1)[0]);
    }
  }
  if (consumed.length > 0) {
    Object.assign(source, syncActorStateProfile(source, {
      kind: source.id === 'player' ? 'player' : 'npc'
    }));
  }
  return consumed;
}

export function pickMedicalSupplies(source, fallback = []) {
  const inventory = collectCarriedItems(source);
  if (Array.isArray(inventory) && inventory.length > 0) return inventory.slice();
  if (Array.isArray(source)) return source.slice();
  return Array.isArray(fallback) ? fallback.slice() : [];
}

export function findHealerNpc(world) {
  return (world.npcs ?? []).find((npc) => /знах|лекар|монах|целител|бабка|повив|хирург/i.test(String(npc.role ?? '') + ' ' + String(npc.name ?? ''))) ?? null;
}

function extractMedicalItems(source) {
  return collectCarriedItems(source).filter((item) => /бинт|повяз|полотн|ткан|вода|вино|уксус|трав|мёд|мед|шина|палк|кож/i.test(itemLabel(item)));
}

function normalizeSupplyLabels(supplies) {
  return (Array.isArray(supplies) ? supplies : []).map((item) => String(item?.label ?? item).toLowerCase());
}

function collectCarriedItems(source) {
  if (Array.isArray(source)) return source;
  if (!source || typeof source !== 'object') return [];
  return Array.isArray(source.items?.carried_items)
    ? source.items.carried_items.filter((item) => isUsableOwnedResource(item))
    : [];
}

function ensureMutableCarriedItems(source) {
  if (!source || typeof source !== 'object') return [];
  if (Array.isArray(source.items?.carried_items)) return source.items.carried_items;
  return [];
}

function itemLabel(item) {
  return String(item?.label ?? item?.name ?? item?.title ?? item ?? '').trim();
}

function slugify(text) {
  return String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
}
