import { visibleItemLabel } from '../../runtime/lower-dvina-trace-visible-scene-items.js';
import { createInventoryPanel } from '@rus/presentation';
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
  const entries = (projection.items ?? []).flatMap(item => {
    const zone = deriveInventoryZone({ ...inventory, instance_id: item.item_id });
    if (!zone.pass || zone.zone === 'not_carried') return [];
    const label = visibleItemLabel({ ...item, name: item.name ?? itemLabels[item.template_id] });
    return [Object.fromEntries(Object.entries({ label, condition: item.condition_state,
      closure_state: item.closure_state,
      access: item.placement?.container_id != null ? 'contained'
        : zone.zone === 'hands' ? 'immediate' : 'quick' }).filter(([, value]) => value !== undefined))];
  });
  return createInventoryPanel({ summary, items: entries });
}
