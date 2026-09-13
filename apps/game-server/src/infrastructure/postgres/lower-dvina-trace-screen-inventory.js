import { visibleItemLabel } from '../../runtime/lower-dvina-trace-visible-scene-items.js';
import { createInventoryPanel, createInventoryPanelContract } from '@rus/presentation';
import { deriveInventoryZone } from '@rus/items-property';
import { getCommittedInventoryLoad } from '../../runtime/lower-dvina-trace-committed-inventory.js';

export function projectTraceInventoryPanel({ payload, projection, itemLabels }) {
  if (payload.player_profile?.attributes?.strength?.value == null) return null;
  const { inventory, mass, hands, load } = getCommittedInventoryLoad(payload);
  if (!mass.pass || !hands.pass || !load.pass) throw Object.assign(
    new Error('Committed inventory cannot be projected'), {
      code: 'TRACE_SCREEN_INVENTORY_INVALID', details: [...mass.errors, ...hands.errors, ...load.errors]
    });
  const summary = { total_mass_grams: mass.total_mass_grams,
    load_category: load.load_category, at_limit: load.at_limit,
    hands_used: hands.hands_used, hands_total: hands.hands_total,
    hands_free: hands.hands_free };
  const zones = { hands: [], worn_quick: [], equipped: [], quick_containers: [],
    primary_container: null, external_load: [] };
  const contents = [];
  for (const item of projection.items ?? []) {
    const zone = deriveInventoryZone({ ...inventory, instance_id: item.item_id });
    if (!zone.pass || zone.zone === 'not_carried') continue;
    const label = visibleItemLabel({ ...item, name: item.name ?? itemLabels[item.template_id] });
    const entry = Object.fromEntries(Object.entries({ label, condition: item.condition_state,
      closure_state: item.closure_state,
      access: item.placement?.container_id != null ? 'contained'
        : zone.zone === 'hands' ? 'immediate' : 'quick' }).filter(([, value]) => value !== undefined));
    if (item.placement?.container_id != null) contents.push(entry);
    else if (zone.zone === 'primary_container') zones.primary_container = entry;
    else zones[zone.zone === 'quick_container' ? 'quick_containers' : zone.zone].push(entry);
  }
  return createInventoryPanel({ ...createInventoryPanelContract({ summary, zones }),
    ...(contents.length ? { items: contents } : {}) });
}
