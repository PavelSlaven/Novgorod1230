import { deepFreeze } from '@rus/kernel';

const ZONES = new Set(['hands', 'worn_quick', 'equipped', 'quick_container', 'primary_container', 'external_load', 'not_carried']);
const PHYSICAL_POSITIONS = new Set(['hands', 'worn', 'worn_quick', 'equipped', 'external', 'external_load']);

export function deriveInventoryZone(input = {}) {
  const id = input.instance_id;
  const item = list(input.items).find((value) => value.item_id === id);
  const container = list(input.containers).find((value) => value.container_id === id);
  if (!item && !container) return deepFreeze({ pass: false, zone: null, errors: [error('INVENTORY_ITEM_NOT_FOUND', { instance_id: id })] });
  const placement = item ? findPlacement(input.item_placements, 'item_id', id) : findPlacement(input.container_placements, 'container_id', id);
  if (!placement) return deepFreeze({ pass: false, zone: null, errors: [error('INVENTORY_PLACEMENT_NOT_FOUND', { instance_id: id })] });
  if (item?.container_id ?? placement.container_id) return zoneFromContainerPath(input, item?.container_id ?? placement.container_id);
  if (container) return zoneFromContainerPath(input, container.container_id);
  if (placement.holder_character_id && !PHYSICAL_POSITIONS.has(placement.physical_position)) return deepFreeze({ pass: false, zone: null, errors: [error('INVENTORY_PHYSICAL_POSITION_REQUIRED', { instance_id: id })] });
  if (!placement.holder_character_id && placement.physical_position != null) return deepFreeze({ pass: false, zone: null, errors: [error('INVENTORY_PHYSICAL_POSITION_INVALID', { instance_id: id })] });
  let zone = 'not_carried';
  if (placement?.holder_character_id === input.actor_id) {
    if (container) {
      const role = profileFor(input.container_profiles, container.template_id)?.inventory_role;
      zone = role === 'primary_container' ? 'primary_container' : role === 'quick_container' ? 'quick_container' : positionZone(placement.physical_position);
    } else zone = positionZone(placement.physical_position);
  }
  return deepFreeze({ pass: ZONES.has(zone), zone, errors: [] });
}

function zoneFromContainerPath(input, containerId) {
  const seen = new Set();
  let current = containerId;
  while (current) {
    if (seen.has(current)) return failed('INVENTORY_CYCLE_DETECTED', { container_id: current });
    seen.add(current);
    const container = list(input.containers).find((value) => value.container_id === current);
    const placement = findPlacement(input.container_placements, 'container_id', current);
    if (!container || !placement) return failed('INVENTORY_CONTAINER_NOT_FOUND', { container_id: current });
    if (placement.holder_character_id) {
      if (!PHYSICAL_POSITIONS.has(placement.physical_position)) return failed('INVENTORY_PHYSICAL_POSITION_REQUIRED', { container_id: current });
      if (placement.holder_character_id !== input.actor_id) return passed('not_carried');
      const role = profileFor(input.container_profiles, container.template_id)?.inventory_role;
      return passed(role === 'quick_container' ? 'quick_container' : role === 'primary_container' ? 'primary_container' : positionZone(placement.physical_position));
    }
    if (!placement.parent_container_id) return passed('not_carried');
    current = placement.parent_container_id;
  }
  return passed('not_carried');
}

function error(code, details) { return deepFreeze({ code, category: 'topology', retryable: false, message: code, details: deepFreeze(structuredClone(details)) }); }
function failed(code, details) { return deepFreeze({ pass: false, zone: null, errors: [error(code, details)] }); }
function passed(zone) { return deepFreeze({ pass: true, zone, errors: [] }); }
function list(value) { return Array.isArray(value) ? value : []; }
function profileFor(collection, templateId) { return Array.isArray(collection) ? collection.find((value) => value?.template_id === templateId) ?? null : collection?.[templateId] ?? null; }
function findPlacement(values, key, id) { return list(values).find((value) => value?.[key] === id) ?? null; }
function positionZone(position) { return position === 'hands' ? 'hands' : position === 'worn_quick' ? 'worn_quick' : position === 'equipped' ? 'equipped' : position === 'external' || position === 'external_load' ? 'external_load' : 'not_carried'; }
