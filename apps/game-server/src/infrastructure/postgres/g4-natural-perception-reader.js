import { loadApprovedG4NaturalCatalog, loadApprovedCanonicalNaturalInitialRule } from '@rus/runtime-catalog';
import { prepareG4NaturalScenePerceptionInput } from '../../runtime/g4-natural-perception.js';
import { resolveG4NaturalPerceptionConditions } from '../../runtime/g4-natural-perception-conditions.js';
import { serverError } from '../../errors.js';

/** Read inside the caller's consistent read transaction. Temporal/actor/source
 * conditions remain with their current owner; this reader supplies no defaults. */
export async function readCurrentNaturalPerceptionFacts({ transaction, partyId, actorId,
  verifiedCatalog, pin, worldBaseReader, readCurrentSourceState } = {}) {
  if (typeof transaction?.query !== 'function'
    || typeof worldBaseReader?.readPinnedSceneTemplateClosure !== 'function'
    || typeof readCurrentSourceState !== 'function') gap('current_perception_owner_required');
  const result = await transaction.query(`SELECT party.world_revision_id,party.world_catalog_digest,
    to_jsonb(loc) AS location,to_jsonb(site) AS site,to_jsonb(baseline) AS baseline,
    (SELECT coalesce(jsonb_agg(b),'[]') FROM party_runtime.party_site_connection_endpoint_bindings b
      WHERE b.party_id=loc.party_id AND b.g5_site_id=site.id AND b.status='active') AS endpoint_bindings,
    (SELECT coalesce(jsonb_agg(p),'[]') FROM party_runtime.scene_position_nodes p
      JOIN party_runtime.party_g6_instances g ON g.id=p.g6_instance_id AND g.party_id=p.party_id
      WHERE p.party_id=loc.party_id AND g.scene_baseline_id=baseline.id
        AND p.status='active' AND g.status='active') AS positions,
    (SELECT coalesce(jsonb_agg(g),'[]') FROM party_runtime.party_g6_instances g
      WHERE g.party_id=loc.party_id AND g.scene_baseline_id=baseline.id AND g.status='active') AS g6,
    (SELECT coalesce(jsonb_agg(a),'[]') FROM party_runtime.g6_acoustic_profiles a
      JOIN party_runtime.party_g6_instances g ON g.id=a.g6_instance_id AND g.party_id=a.party_id
      WHERE a.party_id=loc.party_id AND g.scene_baseline_id=baseline.id AND g.status='active') AS acoustic_profiles,
    (SELECT coalesce(jsonb_agg(v),'[]') FROM party_runtime.visibility_links v
      WHERE v.party_id=loc.party_id AND v.scene_baseline_id=baseline.id AND v.status='active') AS visibility_links,
    (SELECT coalesce(jsonb_agg(a),'[]') FROM party_runtime.acoustic_edges a
      WHERE a.party_id=loc.party_id AND a.scene_baseline_id=baseline.id AND a.status='active') AS acoustic_edges,
    (SELECT coalesce(jsonb_agg(p),'[]') FROM party_runtime.portal_entities p
      WHERE p.party_id=loc.party_id AND p.scene_baseline_id=baseline.id) AS portals
    FROM party_runtime.party_journey_locations loc
    JOIN party_runtime.parties party ON party.party_id=loc.party_id
    JOIN party_runtime.scene_position_nodes pos ON pos.id=loc.scene_position_id AND pos.party_id=loc.party_id AND pos.status='active'
    JOIN party_runtime.party_g6_instances g6 ON g6.id=pos.g6_instance_id AND g6.party_id=loc.party_id AND g6.status='active'
    JOIN party_runtime.party_scene_baselines baseline ON baseline.id=g6.scene_baseline_id AND baseline.party_id=loc.party_id AND baseline.status='active'
    JOIN party_runtime.party_g5_sites site ON baseline.host_kind='g5_site' AND site.id=baseline.host_id AND site.party_id=loc.party_id AND site.status='active'
    WHERE loc.party_id=$1 AND loc.owner_kind='actor' AND loc.owner_id=$2 AND loc.location_kind='scene'`, [partyId, actorId]);
  if (result.rows.length !== 1) gap('committed_actor_scene_required');
  const snapshot = result.rows[0];
  if (snapshot.world_revision_id !== pin?.compatible_world_revision_id
    || snapshot.world_catalog_digest !== pin?.compatible_world_catalog_digest) gap('exact_current_world_pin_required');
  const catalog = loadApprovedG4NaturalCatalog({ verifiedCatalog, pin });
  const profiles = catalog.profiles.filter(({ payload }) => payload.g4_ref.id === snapshot.site.parent_g4_id
    && payload.g4_ref.world_revision_id === snapshot.world_revision_id);
  if (profiles.length !== 1) gap('exact_scene_natural_binding_required');
  const template = snapshot.baseline.scene_template_ref;
  const scene_template_ref = { id: template.entity_id, version: Number(template.authoring_version) };
  const closure = await worldBaseReader.readPinnedSceneTemplateClosure({ ...scene_template_ref,
    world_revision_id: snapshot.world_revision_id });
  if (!closure?.ok) gap('approved_scene_template_closure_required');
  const current = await readCurrentSourceState({ transaction, partyId, actorId,
    snapshot: structuredClone(snapshot), sceneClosure: closure.value,
    naturalProfile: profiles[0], verifiedCatalog, pin });
  const conditions = resolveG4NaturalPerceptionConditions({ verifiedCatalog, pin,
    snapshot, sceneClosure: closure.value, naturalProfile: profiles[0], current });
  const endpoint = closure.value.endpoint_slots.filter((row) => row.slot_key === conditions?.source_endpoint_slot_key);
  if (endpoint.length !== 1) gap('approved_scene_source_admission_required');
  let canonical_source_binding = null;
  const initial = current.canonical_initial_state;
  if (initial != null) {
    const approved = loadApprovedCanonicalNaturalInitialRule({ verifiedCatalog, pin, rule_ref: initial.rule_ref });
    const rule = approved.rule;
    const canonicalRef = snapshot.site.canonical_g5_ref;
    if (initial.verified !== true || initial.party_id !== partyId || initial.actor_id !== actorId
      || initial.position_id !== snapshot.location.scene_position_id
      || initial.initial_request_identity?.party_id !== partyId
      || initial.initial_request_identity?.scenario_id !== approved.scenario_id
      || !initial.initial_request_identity?.idempotency_key
      || initial.initial_snapshot_identity?.state_version !== 0
      || !initial.initial_snapshot_identity?.state_digest
      || initial.scenario_id !== approved.scenario_id
      || snapshot.world_catalog_digest !== approved.world_pin.world_catalog_digest
      || snapshot.site.origin !== 'canonical' || canonicalRef?.entity_id !== rule.canonical_g5_ref.id
      || Number(canonicalRef.authoring_version) !== rule.canonical_g5_ref.version
      || typeof worldBaseReader.readPinnedCanonicalG5SceneBinding !== 'function') gap('verified_canonical_initial_state_required');
    const canonical = await worldBaseReader.readPinnedCanonicalG5SceneBinding({ ...rule.canonical_g5_ref,
      world_revision_id: rule.world_revision_id });
    if (!canonical?.ok || canonical.value.id !== rule.canonical_g5_ref.id
      || canonical.value.version !== rule.canonical_g5_ref.version
      || canonical.value.world_revision_id !== rule.world_revision_id
      || canonical.value.parent_id !== rule.g4_ref.id || canonical.value.parent_version !== rule.g4_ref.version
      || canonical.value.scene_template_id !== rule.scene_template_ref.id
      || canonical.value.scene_template_version !== rule.scene_template_ref.version
      || snapshot.site.parent_g4_id !== rule.g4_ref.id
      || scene_template_ref.id !== rule.scene_template_ref.id || scene_template_ref.version !== rule.scene_template_ref.version
      || closure.value.header.canonical_digest !== rule.scene_template_ref.canonical_digest) gap('canonical_initial_authoring_binding_required');
    canonical_source_binding = { schema: 'rus.verified_canonical_initial_natural_source.v1',
      ...structuredClone(initial), g5_site_id: snapshot.site.id, baseline_id: snapshot.baseline.id };
  }
  // Relations need the exact P22 condition profile adapter. Raw portal state alone
  // never means transparent/inaudible, and missing profiles never mean clear.
  const conditionRef = (ref) => ref == null ? null
    : `${ref.entity_id}@${ref.authoring_version}`;
  const portals = Object.fromEntries(snapshot.portals.map((portal) => {
    const profile = conditions?.portal_profiles?.[portal.id];
    if (!profile || conditionRef(portal.portal_template_ref) !== profile.portal_template_ref) {
      gap('p22_relation_conditions_required');
    }
    return [portal.id, { ...profile, state: portal.state }];
  }));
  const currentFacts = { observer: { actor_id: actorId, party_id: partyId,
    position_id: snapshot.location.scene_position_id,
    visual_capability: conditions?.visual_capability,
    hearing_capability: conditions?.hearing_capability },
  scene: { party_id: partyId, baseline_id: snapshot.baseline.id, site_id: snapshot.site.id,
    g4_ref: profiles[0].payload.g4_ref, scene_template_ref,
    visible_scene: conditions?.visible_scene, positions: snapshot.positions,
    g6: snapshot.g6, acoustic_profiles: snapshot.acoustic_profiles,
    visibility_links: snapshot.visibility_links.map((row) => ({
      from_position_id: row.from_position_id, to_position_id: row.to_position_id,
      base_result: row.quality, portal_id: row.portal_entity_id })),
    acoustic_edges: snapshot.acoustic_edges.map((row) => ({
      from_g6_id: row.from_g6_instance_id, to_g6_id: row.to_g6_instance_id,
      base_loss: row.base_loss, portal_id: row.portal_entity_id,
      condition_profile_ref: conditionRef(row.condition_profile_ref) })), portals },
  source_endpoint: { ...endpoint[0], scene_template_id: scene_template_ref.id,
    scene_template_version: scene_template_ref.version },
  source_bindings: snapshot.endpoint_bindings.filter((row) => row.source_slot_key === endpoint[0].slot_key),
  canonical_source_binding,
  current_environment: conditions?.current_environment,
  layer_admissions: conditions?.layer_admissions };
  prepareG4NaturalScenePerceptionInput({ verifiedCatalog, pin, currentFacts });
  return currentFacts;
}
function gap(reason) { throw serverError('NATURAL_SCENE_PERCEPTION_DATA_GAP',
  'Current natural perception facts are unavailable.', { status: 409, details: { reason } }); }
