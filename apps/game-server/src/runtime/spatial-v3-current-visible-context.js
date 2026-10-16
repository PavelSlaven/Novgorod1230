import { validateVisibleContext } from '@rus/visibility-knowledge-memory';
import { projectG4NaturalPerception } from './g4-natural-perception.js';
import { serverError } from '../errors.js';
import { LOCAL_EDGE_OCCUPIED_STATUS } from './local-edge-occupancy.js';
import { isVisibleItemLabelGap, resolveVisibleItemLabel } from
  './lower-dvina-trace-visible-item-label.js';

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
  positionId, entityObservations, localEdges, directionalExits, siteConnections = [] } = {}) {
  if (!Array.isArray(entityObservations) || !Array.isArray(localEdges)
    || !Array.isArray(directionalExits) || !Array.isArray(siteConnections)) gap('complete_current_visible_sources_required');
  const natural = projectG4NaturalPerception({ input: naturalInput, partyId, actorId, positionId });
  const seen = new Set();
  const visible_npc = [];
  const visible_objects = [];
  for (const row of entityObservations) {
    const key = `${row?.entity_kind}:${row?.entity_id}`;
    const itemLabel = row?.entity_kind === 'item'
      ? resolveVisibleItemLabel({ name: row.display_label }) : null;
    const suppliedItemGap = row?.entity_kind === 'item'
      && row.label_gap != null
      && isVisibleItemLabelGap({ ...row.label_gap, kind: 'gap' });
    const itemLabelGap = row?.entity_kind === 'item'
      && (suppliedItemGap || itemLabel.kind === 'gap');
    if (!['npc', 'item'].includes(row?.entity_kind) || !text(row.entity_id)
      || !['clear', 'partial'].includes(row.visibility)
      || !(itemLabelGap || text(row.display_label))
      || row.label_gap != null && !suppliedItemGap
      || suppliedItemGap && row.display_label != null
      || !row.exterior || typeof row.exterior !== 'object' || Array.isArray(row.exterior)
      || row.entity_kind === 'npc' && (!row.exterior.appearance
        || !Array.isArray(row.exterior.visible_equipment))
      || row.entity_kind === 'item' && !text(row.exterior.condition_state)
      || seen.has(key)) {
      gap('complete_current_entity_observation_required');
    }
    seen.add(key);
    if (row.entity_kind === 'npc') {
      visible_npc.push(projectVisibleNpcObservation(row));
      continue;
    }
    const record = { entity_ref: { entity_kind: row.entity_kind, entity_id: row.entity_id },
      ...(itemLabelGap ? { label_gap: {
        code: 'player_safe_item_label_required' } } : {
        display_label: row.entity_kind === 'item' ? itemLabel.label : row.display_label,
        recognition: row.display_name === row.display_label ? 'recognized' : 'unrecognized'
      }),
      ...(row.visibility === 'clear' ? { visible_status: row.exterior.condition_state } : {}) };
    visible_objects.push(record);
  }
  for (const [kind, rows, idKey] of [
    ['scene_movement_edge', localEdges, 'edge_id'],
    ['g4_directional_exit', directionalExits, 'directional_exit_id'],
    ['g5_site_connection', siteConnections, 'connection_binding_id']
  ]) {
    for (const row of rows) {
      const key = `${kind}:${row?.[idKey]}`;
      if (!text(row?.[idKey]) || !text(row.display_label) || seen.has(key)
        || (row.destination_status !== undefined
          && !['open', 'occupied'].includes(row.destination_status))) {
        gap('complete_current_exit_disclosure_required');
      }
      seen.add(key);
      visible_objects.push({ entity_ref: { entity_kind: kind, entity_id: row[idKey] },
        display_label: row.display_label, recognition: 'known',
        ...(row.destination_status === 'occupied'
          ? { visible_status: LOCAL_EDGE_OCCUPIED_STATUS } : {}) });
    }
  }
  const visible_context = { ...natural.visible_context, visible_npc, visible_objects };
  if (!validateVisibleContext(visible_context).ok) gap('player_safe_visible_context_required');
  return visible_context;
}

export function projectSpatialV3CurrentVisibleNpcs(entityObservations) {
  if (!Array.isArray(entityObservations)) gap('complete_current_entity_observations_required');
  const seen = new Set();
  return entityObservations.flatMap((row) => {
    if (row?.entity_kind !== 'npc') return [];
    const key = row.entity_id;
    if (!text(key) || !['clear', 'partial'].includes(row.visibility)
        || !text(row.display_label) || !row.exterior
        || typeof row.exterior !== 'object' || Array.isArray(row.exterior)
        || !row.exterior.appearance || !Array.isArray(row.exterior.visible_equipment)
        || seen.has(key)) gap('complete_current_entity_observation_required');
    seen.add(key);
    return [projectVisibleNpcObservation(row)];
  });
}

function projectVisibleNpcObservation(row) {
  return { entity_ref: { entity_kind: 'npc', entity_id: row.entity_id },
    display_label: row.display_label,
    recognition: row.display_name === row.display_label ? 'recognized' : 'unrecognized',
    ...(row.visibility === 'clear' ? { observable_cues: {
      identity: { ...(row.display_name === row.display_label
        ? { display_name: row.display_name } : {}),
        sex_category: row.exterior.sex_category,
        // actor appearance says young_adult; the player-safe payload word is young
        age_category: row.exterior.age_category === 'young_adult'
          ? 'young' : row.exterior.age_category,
        appearance: structuredClone(row.exterior.appearance) },
      equipment: structuredClone(row.exterior.visible_equipment) } } : {}) };
}

function gap(reason) { throw serverError('SPATIAL_V3_VISIBLE_CONTEXT_DATA_GAP',
  'Complete current player-visible facts are required.', { status: 409, details: { reason } }); }
