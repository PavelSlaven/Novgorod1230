import { validateVisibleContext } from '@rus/visibility-knowledge-memory';
import { projectG4NaturalPerception } from './g4-natural-perception.js';
import { serverError } from '../errors.js';

const text = (value) => typeof value === 'string' && value.trim() === value && value.length > 0;
export const SPATIAL_V3_CURRENT_VISIBLE_PROJECTION_POLICY_REF = Object.freeze({
  entity_ref: Object.freeze({ entity_kind: 'visibility_modifier', entity_id: 'spatial_v3_current_visible_context_v1' }),
  authoring_version: '1'
});

/** The P16 caller supplies its transaction; source readers must use that same client. */
export async function readAndProjectSpatialV3CurrentVisibleContext({ transaction, partyId,
  actorId, positionId, readCurrentSources, state, directionalExits } = {}) {
  if (typeof transaction?.query !== 'function' || typeof readCurrentSources !== 'function') {
    gap('current_visible_transaction_and_sources_required');
  }
  const sources = await readCurrentSources({ transaction, partyId, actorId, positionId,
    state, directionalExits });
  return projectSpatialV3CurrentVisibleContext({ ...sources, partyId, actorId, positionId });
}

/** Compose only observations admitted by the current perception and disclosure owners.
 * Inputs may include proposed destination rows from that transaction. */
export function projectSpatialV3CurrentVisibleContext({ naturalInput, partyId, actorId,
  positionId, entityObservations, localEdges, directionalExits } = {}) {
  if (!Array.isArray(entityObservations) || !Array.isArray(localEdges)
    || !Array.isArray(directionalExits)) gap('complete_current_visible_sources_required');
  const natural = projectG4NaturalPerception({ input: naturalInput, partyId, actorId, positionId });
  const seen = new Set();
  const visible_npc = [];
  const visible_objects = [];
  for (const row of entityObservations) {
    const key = `${row?.entity_kind}:${row?.entity_id}`;
    if (!['npc', 'item'].includes(row?.entity_kind) || !text(row.entity_id)
      || !['clear', 'partial'].includes(row.visibility) || !text(row.display_label)
      || !row.exterior || typeof row.exterior !== 'object' || Array.isArray(row.exterior)
      || row.entity_kind === 'npc' && (!row.exterior.appearance
        || !Array.isArray(row.exterior.visible_equipment))
      || row.entity_kind === 'item' && !text(row.exterior.condition_state)
      || seen.has(key)) {
      gap('complete_current_entity_observation_required');
    }
    seen.add(key);
    const record = { entity_ref: { entity_kind: row.entity_kind, entity_id: row.entity_id },
      display_label: row.display_label,
      recognition: row.display_name === row.display_label ? 'recognized' : 'unrecognized',
      ...(row.entity_kind === 'npc' && row.visibility === 'clear' ? { observable_cues: {
        identity: { ...(row.display_name === row.display_label ? { display_name: row.display_name } : {}),
          sex_category: row.exterior.sex_category, age_category: row.exterior.age_category,
          appearance: structuredClone(row.exterior.appearance) },
        equipment: structuredClone(row.exterior.visible_equipment) } }
        : row.entity_kind === 'item' && row.visibility === 'clear'
          ? { visible_status: row.exterior.condition_state } : {}) };
    (row.entity_kind === 'npc' ? visible_npc : visible_objects).push(record);
  }
  for (const [kind, rows, idKey] of [
    ['scene_movement_edge', localEdges, 'edge_id'],
    ['g4_directional_exit', directionalExits, 'directional_exit_id']
  ]) {
    for (const row of rows) {
      const key = `${kind}:${row?.[idKey]}`;
      if (!text(row?.[idKey]) || !text(row.display_label) || seen.has(key)) {
        gap('complete_current_exit_disclosure_required');
      }
      seen.add(key);
      visible_objects.push({ entity_ref: { entity_kind: kind, entity_id: row[idKey] },
        display_label: row.display_label, recognition: 'known' });
    }
  }
  const visible_context = { ...natural.visible_context, visible_npc, visible_objects };
  if (!validateVisibleContext(visible_context).ok) gap('player_safe_visible_context_required');
  return visible_context;
}

function gap(reason) { throw serverError('SPATIAL_V3_VISIBLE_CONTEXT_DATA_GAP',
  'Complete current player-visible facts are required.', { status: 409, details: { reason } }); }
