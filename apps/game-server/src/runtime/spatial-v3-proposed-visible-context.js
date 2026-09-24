import { buildPlayerSafeVisiblePackageEnvelope, detectHiddenLeaks,
  validateVisibleContext } from '@rus/visibility-knowledge-memory';
import { projectSpatialV3CurrentVisibleContext } from './spatial-v3-current-visible-context.js';
import { serverError } from '../errors.js';

const tables = { party_g5_sites: 'sites', party_scene_baselines: 'scene_baselines',
  party_g6_instances: 'g6_instances', scene_position_nodes: 'scene_positions',
  g6_acoustic_profiles: 'acoustic_profiles',
  visibility_links: 'visibility_links', portal_entities: 'portals',
  scene_movement_edges: 'movement_edges',
  party_site_connection_endpoint_bindings: 'endpoint_bindings',
  entity_placements: 'placements' };
const required = Object.values(tables);
const fail = () => { throw serverError('SPATIAL_V3_VISIBLE_CONTEXT_DATA_GAP',
  'Complete proposed player-visible facts are required.',
  { status: 409, details: { reason: 'place_visible_context_source_required' } }); };

/** Apply the exact P16 write order in memory. Never query an uncommitted destination. */
export function overlaySpatialV3VisibleRows({ snapshot, proposal, firstEntry } = {}) {
  if (!snapshot || required.some((key) => !Array.isArray(snapshot[key]))
    || !Array.isArray(proposal?.inserts) || !Array.isArray(proposal?.updates)
    || !Array.isArray(firstEntry?.approved_write_sets)) fail();
  const identity = (key, row) => key === 'placements'
    ? `${row.entity_kind}:${row.entity_id}`
    : key === 'acoustic_profiles' ? row.g6_instance_id : row.id;
  const rows = Object.fromEntries(required.map((key) =>
    [key, new Map(snapshot[key].map((row) => [identity(key, row), row]))]));
  const writes = [...proposal.inserts, ...proposal.updates,
    ...firstEntry.approved_write_sets.flatMap((set) => {
      if (![set?.inserts, set?.updates, set?.appends].every((rows) => rows == null || Array.isArray(rows))) fail();
      return [...(set.inserts ?? []), ...(set.updates ?? []), ...(set.appends ?? [])];
    })];
  for (const write of writes) {
    const key = tables[write?.target_table];
    if (!key) continue;
    if (!write.id || !write.record || identity(key, write.record) !== write.id) fail();
    rows[key].set(write.id, write.record);
  }
  const site = rows.sites.get(proposal.target_site_id);
  const position = rows.scene_positions.get(proposal.target_position_id);
  const g6 = rows.g6_instances.get(position?.g6_instance_id);
  const baseline = rows.scene_baselines.get(g6?.scene_baseline_id);
  if (!site || site.status !== 'active' || !position || position.status !== 'active'
    || !g6 || g6.status !== 'active' || !baseline || baseline.status !== 'active'
    || baseline.host_kind !== 'g5_site' || baseline.host_id !== site.id
    || g6.host_id !== site.id || position.party_id !== site.party_id
    || g6.party_id !== site.party_id || baseline.party_id !== site.party_id
    || !rows.acoustic_profiles.has(g6.id)
    || ![...rows.endpoint_bindings.values()].some((row) => row.status === 'active'
      && row.endpoint_role === 'to' && row.g5_site_id === site.id
      && row.position_id === position.id)) fail();
  const result = Object.fromEntries(required.map((key) => [key, [...rows[key].values()]]));
  return { ...result, site, baseline, g6, position };
}

/** Source owner reads committed environment, exterior and knowledge on this transaction. */
export async function projectSpatialV3ProposedVisiblePackage({ transaction, snapshot,
  proposal, firstEntry, readSources, envelopeInput } = {}) {
  if (typeof transaction?.query !== 'function' || typeof readSources !== 'function') fail();
  const overlay = overlaySpatialV3VisibleRows({ snapshot, proposal, firstEntry });
  const sources = await readSources({ transaction, overlay });
  if (!sources || sources.positionId !== overlay.position.id
    || sources.partyId !== overlay.site.party_id
    || sources.naturalInput?.scene?.site_id !== overlay.site.id
    || sources.naturalInput.scene.baseline_id !== overlay.baseline.id) fail();
  const visible_context = projectSpatialV3CurrentVisibleContext(sources);
  if (!validateVisibleContext(visible_context).ok || detectHiddenLeaks(visible_context).length) fail();
  const visible_payload = { schema: 'temporal_visible_package.v1',
    perceived_scene: visible_context.visible_scene,
    perceived_changes: visible_context.visible_changes ?? [],
    sensory_details: visible_context.sensory_details ?? [],
    visible_npcs: visible_context.visible_npc ?? [],
    visible_objects: visible_context.visible_objects ?? [],
    known_context: visible_context.known_context ?? [],
    uncertainties: visible_context.uncertainties ?? [], hypotheses: [],
    player_safe_interruption: null, allowed_action_affordances: [] };
  const built = buildPlayerSafeVisiblePackageEnvelope({ ...envelopeInput,
    visible_payload });
  if (!built.ok) fail();
  return { ok: true, envelope: built.envelope, visible_context };
}
