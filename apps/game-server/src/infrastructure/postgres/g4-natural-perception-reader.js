import { loadApprovedG4NaturalCatalog, loadApprovedG4NaturalPlacementCatalog,
  loadApprovedCanonicalNaturalInitialRule } from '@rus/runtime-catalog';
import { prepareG4NaturalScenePerceptionInput } from '../../runtime/g4-natural-perception.js';
import { resolveG4NaturalPerceptionConditions } from '../../runtime/g4-natural-perception-conditions.js';
import { serverError } from '../../errors.js';
import { createHash } from 'node:crypto';
import { canonicalDigest } from '@rus/materialization';
import { readFileSync } from 'node:fs';
import { currentSceneVisibilityModifiers } from './spatial-v3-current-visibility-inputs.js';

const coverCandidateBytes = readFileSync(new URL('../../../../../data/world-catalogs/novgorod/live-world-runtime-v17/natural-source-stable-cover-candidate.json', import.meta.url));
const coverCandidate = JSON.parse(coverCandidateBytes);
const coverApproval = JSON.parse(readFileSync(new URL('../../../../../data/world-catalogs/novgorod/live-world-runtime-v17/natural-source-stable-cover-approval.json', import.meta.url)));
const naturalCandidate = JSON.parse(readFileSync(new URL('../../../../../data/world-catalogs/novgorod/m2c-natural/candidate.json', import.meta.url)));

export function approvedNaturalStableCover(profile) {
  if (coverApproval.decision !== 'APPROVE_DATA_ONLY'
    || coverApproval.subject !== coverCandidate.candidate_id
    || coverApproval.candidate_sha256 !== createHash('sha256').update(coverCandidateBytes).digest('hex')
    || profile?.g4_ref?.world_revision_id !== coverCandidate.world_revision_id) {
    gap('approved_natural_stable_cover_required');
  }
  const source = naturalCandidate.natural_profiles.filter((row) =>
    row.profile_id === profile?.profile_id && row.profile_version === profile.profile_version
    && row.g4_ref?.id === profile.g4_ref.id && row.g4_ref.version === profile.g4_ref.version
    && canonicalDigest(row.natural_profile) === canonicalDigest(profile.natural_profile));
  if (source.length !== 1) gap('approved_natural_stable_cover_required');
  const landscape = source[0].template_refs?.landscape_template_id;
  const rows = coverCandidate.rows.filter((row) => row.landscape_template_id === landscape);
  if (rows.length !== 1 || !['clear', 'partial', 'none'].includes(rows[0].stable_cover)) {
    gap('approved_natural_stable_cover_required');
  }
  return rows[0].stable_cover;
}

/** Shared committed scene read for natural and entity perception. */
export async function readCurrentSceneSnapshot({ transaction, partyId, actorId, pin,
  observedPositionId = null } = {}) {
  if (typeof transaction?.query !== 'function') gap('current_perception_owner_required');
  const result = await transaction.query(`SELECT party.world_revision_id,party.world_catalog_digest,
    to_jsonb(loc) || jsonb_build_object('scene_position_id',pos.id) AS location,
    to_jsonb(site) AS site,to_jsonb(baseline) AS baseline,
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
    JOIN party_runtime.scene_position_nodes pos ON pos.id=coalesce($3,loc.scene_position_id)
      AND pos.party_id=loc.party_id AND pos.status='active'
    JOIN party_runtime.party_g6_instances g6 ON g6.id=pos.g6_instance_id AND g6.party_id=loc.party_id AND g6.status='active'
    JOIN party_runtime.party_scene_baselines baseline ON baseline.id=g6.scene_baseline_id AND baseline.party_id=loc.party_id AND baseline.status='active'
    JOIN party_runtime.party_g5_sites site ON baseline.host_kind='g5_site' AND site.id=baseline.host_id AND site.party_id=loc.party_id AND site.status='active'
    WHERE loc.party_id=$1 AND loc.owner_kind='actor' AND loc.owner_id=$2 AND loc.location_kind='scene'`,
  [partyId, actorId, observedPositionId]);
  if (result.rows.length !== 1) gap('committed_actor_scene_required');
  const snapshot = result.rows[0];
  if (snapshot.world_revision_id !== pin?.compatible_world_revision_id
    || snapshot.world_catalog_digest !== pin?.compatible_world_catalog_digest) gap('exact_current_world_pin_required');
  return snapshot;
}

/** Keep entity placements, local endpoints and mutable modifiers on the same
 * transaction and scene snapshot used by natural perception. */
export async function readCurrentEntityVisibilityScene(args = {}) {
  const snapshot = await readCurrentSceneSnapshot(args);
  const { transaction, partyId } = args;
  const positions = snapshot.positions.map((row) => row.id);
  const result = await transaction.query(`SELECT
    (SELECT coalesce(jsonb_agg(e),'[]') FROM party_runtime.entity_placements e
      WHERE e.party_id=$1 AND e.position_node_id=ANY($2::text[])
        AND e.host_entity_ref IS NULL) AS placements,
    (SELECT coalesce(jsonb_agg(e),'[]') FROM party_runtime.scene_movement_edges e
      WHERE e.party_id=$1 AND e.scene_baseline_id=$3 AND e.status='active') AS movement_edges,
    (SELECT coalesce(jsonb_agg(m),'[]') FROM party_runtime.visibility_modifiers m
      WHERE m.party_id=$1) AS modifiers`, [partyId, positions, snapshot.baseline.id]);
  if (result.rows.length !== 1) gap('complete_current_visibility_required');
  const { placements, movement_edges, modifiers } = result.rows[0];
  if (![placements, movement_edges, modifiers].every(Array.isArray)
    || placements.some((row) => row.party_id !== partyId || !positions.includes(row.position_node_id))
    || movement_edges.some((row) => row.party_id !== partyId
      || !positions.includes(row.from_position_id) || !positions.includes(row.to_position_id))) {
    gap('complete_current_visibility_required');
  }
  return { ...snapshot, placements, movement_edges, modifier_set: { complete: true,
    rows: currentSceneVisibilityModifiers(modifiers, snapshot) } };
}

/** Read inside the caller's consistent read transaction. Temporal/actor/source
 * conditions remain with their current owner; this reader supplies no defaults. */
export async function readCurrentNaturalPerceptionFacts({ transaction, partyId, actorId,
  verifiedCatalog, pin, worldBaseReader, readCurrentSourceState, readCurrentEnvironment,
  observedPositionId } = {}) {
  if (typeof worldBaseReader?.readPinnedSceneTemplateClosure !== 'function'
    || typeof readCurrentSourceState !== 'function') gap('current_perception_owner_required');
  const snapshot = await readCurrentSceneSnapshot({ transaction, partyId, actorId, pin,
    observedPositionId });
  const catalog = loadApprovedG4NaturalCatalog({ verifiedCatalog, pin });
  const profiles = catalog.profiles.filter(({ payload }) => payload.g4_ref.id === snapshot.site.parent_g4_id
    && payload.g4_ref.world_revision_id === snapshot.world_revision_id);
  if (profiles.length !== 1) gap('exact_scene_natural_binding_required');
  const template = snapshot.baseline.scene_template_ref;
  const scene_template_ref = { id: template.entity_id, version: Number(template.authoring_version) };
  const closure = await worldBaseReader.readPinnedSceneTemplateClosure({ ...scene_template_ref,
    world_revision_id: snapshot.world_revision_id });
  if (!closure?.ok) gap('approved_scene_template_closure_required');
  const source = await readCurrentSourceState({ transaction, partyId, actorId,
    snapshot: structuredClone(snapshot), sceneClosure: closure.value,
    naturalProfile: profiles[0], verifiedCatalog, pin });
  if (readCurrentEnvironment != null && typeof readCurrentEnvironment !== 'function') {
    gap('current_temporal_owner_required');
  }
  const current = { ...source, ...(readCurrentEnvironment == null ? {} : {
    current_environment: await readCurrentEnvironment({ transaction, partyId, actorId }) }) };
  const stableCover = approvedNaturalStableCover(profiles[0].payload);
  if (!Array.isArray(current?.source_observations)
    || current.source_observations.some((row) => row.stable_cover != null
      && row.stable_cover !== stableCover)) {
    gap('current_natural_stable_cover_mismatch');
  }
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
  } else if (snapshot.site.origin === 'canonical'
    && !snapshot.endpoint_bindings.some((row) => row.source_slot_key === endpoint[0].slot_key)) {
    const ref = snapshot.site.canonical_g5_ref;
    if (typeof worldBaseReader.readPinnedCanonicalG5SceneBinding !== 'function'
      || !ref?.entity_id || !Number.isInteger(Number(ref.authoring_version))) {
      gap('canonical_scene_source_binding_required');
    }
    const canonical = await worldBaseReader.readPinnedCanonicalG5SceneBinding({
      id: ref.entity_id, version: Number(ref.authoring_version),
      world_revision_id: snapshot.world_revision_id });
    if (!canonical?.ok || canonical.value.id !== ref.entity_id
      || canonical.value.version !== Number(ref.authoring_version)
      || canonical.value.world_revision_id !== snapshot.world_revision_id
      || canonical.value.parent_id !== snapshot.site.parent_g4_id
      || canonical.value.scene_template_id !== scene_template_ref.id
      || canonical.value.scene_template_version !== scene_template_ref.version) {
      gap('canonical_scene_source_binding_required');
    }
    canonical_source_binding = { schema: 'rus.verified_canonical_scene_natural_source.v1',
      verified: true, party_id: partyId, actor_id: actorId,
      position_id: snapshot.location.scene_position_id,
      g5_site_id: snapshot.site.id, baseline_id: snapshot.baseline.id,
      source_slot_key: endpoint[0].slot_key };
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
  const placementCatalog = loadApprovedG4NaturalPlacementCatalog({ verifiedCatalog, pin });
  const placements = placementCatalog.placements.filter((row) =>
    row.natural_profile_ref.id === profiles[0].payload.profile_id
    && row.natural_profile_ref.version === profiles[0].payload.profile_version
    && row.natural_profile_ref.payload_digest === profiles[0].payload_digest
    && row.scene_template_ref.id === scene_template_ref.id
    && row.scene_template_ref.version === scene_template_ref.version
    && row.scene_template_ref.canonical_digest === closure.value.header.canonical_digest);
  const policy = placementCatalog.condition_policies.find((row) =>
    row.id === placements[0]?.condition_policy_ref.id
    && row.version === placements[0]?.condition_policy_ref.version);
  const sourcePositions = snapshot.positions.filter((row) =>
    row.template_slot_key === endpoint[0].required_position_slot_key
    && row.template_instance_ordinal === endpoint[0].required_position_instance_ordinal
    && row.g6_instance_id === snapshot.g6.find((g6) =>
      g6.scene_slot_key === placements[0]?.g6_scene_slot_key)?.id
  );
  const lighting = policy?.lighting_by_light_state[currentFacts.current_environment.light_state];
  const weather = policy?.weather_by_visibility[currentFacts.current_environment.weather_state?.visibility];
  return { ...currentFacts, ambient_visibility: placements.length === 1 && policy
    && sourcePositions.length === 1 && ['clear', 'partial', 'none'].includes(lighting)
    && ['clear', 'partial', 'none'].includes(weather)
    ? { g6_instance_id: sourcePositions[0].g6_instance_id,
      lighting, weather, stable_cover: stableCover }
    : null };
}
function gap(reason) { throw serverError('NATURAL_SCENE_PERCEPTION_DATA_GAP',
  'Current natural perception facts are unavailable.', { status: 409, details: { reason } }); }
