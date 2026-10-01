import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';
import { prepareG4NaturalBaseline } from '../../runtime/g4-natural-baseline.js';
import { serverError } from '../../errors.js';
import { recheckOrderedLocalEdgePath } from './first-playable/recheck-site-connection-traversal.js';

/** Admission of the existing exact-source, single-candidate scene policy.
 * Unknown rule versions require their owner; they are never treated as true. */
export function createSpatialV3GenerationAdmission({ worldBaseReader, verifiedCatalog, pin,
  readCurrentEnvironment } = {}) {
  return async function admitGeneration({ transaction, request, closure, snapshot, selection,
    scene_candidates, dependency_pins }) {
    if (typeof readCurrentEnvironment !== 'function') gap('current_temporal_owner_required');
    let scene_template_ref; let approvedSceneRules;
    if (selection.status === 'generation') {
      const template = selection.selected_template;
      const profiles = closure.scene_materialization_profiles.filter((row) =>
        row.id === template.scene_materialization_profile_id && row.version === template.scene_materialization_profile_version);
      if (profiles.length !== 1 || scene_candidates.length !== 1) gap('exact_single_scene_candidate_required');
      const profile = profiles[0]; const candidate = scene_candidates[0];
      if (profile.status !== 'approved' || profile.world_revision_id !== request.g4.world_revision_id
        || profile.source_kind !== 'g5_generation_template' || profile.source_entity_id !== template.template_id
        || profile.source_entity_version !== template.template_version
        || profile.selection_rule_id !== 'scene_selection_single_candidate_v1' || profile.selection_rule_version !== 1
        || candidate.profile_id !== profile.id || candidate.profile_version !== profile.version
        || candidate.applicability_rule_id !== 'scene_applicability_exact_source_ref_v1' || candidate.applicability_rule_version !== 1
        || !Number.isSafeInteger(candidate.weight) || candidate.weight <= 0) gap('scene_policy_owner_required');
      approvedSceneRules = approvedRules({ ...profile, ...candidate }, closure.scene_rules, request.g4.world_revision_id);
      scene_template_ref = { id: candidate.scene_template_id, version: candidate.scene_template_version };
    } else if (['terminal', 'canonical_connection'].includes(selection.status)) {
      // A terminal exit and an intra-G4 connection both arrive at a canonical place.
      const destination = selection.status === 'terminal'
        ? { id: selection.directional_exit.exit_canonical_g5_id,
          version: selection.directional_exit.exit_canonical_g5_version }
        : selection.target_canonical_g5;
      const target = snapshot.sites.find((row) => row.origin === 'canonical' && row.status === 'active'
        && row.canonical_g5_ref?.entity_id === destination.id
        && Number(row.canonical_g5_ref.authoring_version) === destination.version);
      const baseline = snapshot.scene_baselines.find((row) => row.host_kind === 'g5_site'
        && row.host_id === target?.id && row.status === 'active');
      const canonical = await worldBaseReader.readPinnedCanonicalG5SceneBinding({
        id: destination.id, version: destination.version,
        world_revision_id: request.g4.world_revision_id,
        ...(baseline && { scene_template_ref: { id: baseline.scene_template_ref.entity_id,
          version: Number(baseline.scene_template_ref.authoring_version) } }) });
      if (!canonical?.ok || canonical.value.parent_id !== request.g4.id
        || canonical.value.parent_version !== request.g4.version) gap('exact_terminal_scene_required');
      approvedSceneRules = approvedRules(canonical.value, canonical.value.scene_rules, request.g4.world_revision_id);
      scene_template_ref = { id: canonical.value.scene_template_id, version: canonical.value.scene_template_version };
    } else gap('selected_expansion_required');
    const actorLocations = snapshot.journey_locations.filter((row) => row.owner_kind === 'actor'
      && row.owner_id === request.actor_id && row.party_id === request.party_id
      && row.location_kind === 'scene');
    if (actorLocations.length !== 1) gap('current_actor_at_source_required', { diagnostic_context: {
      exact_source_location_count: actorLocations.filter((row) =>
        row.scene_position_id === request.source_position_id).length,
      actor_scene_location_count: actorLocations.length,
      source_position_id: request.source_position_id,
      actor_scene_position_id: actorLocations.length === 1 ? actorLocations[0].scene_position_id : null
    } });
    const location = actorLocations[0];
    const approachPath = request.ordered_local_edge_path ?? [];
    const approachProofs = request.local_edge_path_proofs ?? [];
    const atSource = location.scene_position_id === request.source_position_id;
    const orderedApproachValid = Array.isArray(approachPath)
      && validOrderedApproach({ request, snapshot, location, path: approachPath });
    const pathProofsMatch = Array.isArray(approachProofs) && approachProofs.length === approachPath.length
      && approachProofs.every((proof, index) => proof.edge_id === approachPath[index]?.edge_id
        && proof.from_position_id === approachPath[index]?.from_position_id
        && proof.to_position_id === approachPath[index]?.to_position_id);
    const pathProofsRechecked = atSource || (orderedApproachValid && pathProofsMatch
      && await recheckOrderedLocalEdgePath({ transaction, partyId: request.party_id,
        path: approachProofs, originPositionId: location.scene_position_id,
        destinationPositionId: request.source_position_id }));
    if ((!Array.isArray(approachPath) || (atSource && approachPath.length > 0)
      || (!atSource && (!orderedApproachValid || !pathProofsMatch || !pathProofsRechecked)))) {
      gap('current_actor_at_source_required', { diagnostic_context: {
        exact_source_location_count: atSource ? 1 : 0,
        actor_scene_location_count: actorLocations.length,
        source_position_in_snapshot: (snapshot.scene_positions ?? []).some((row) => row.id === request.source_position_id),
        source_position_id: request.source_position_id,
        actor_scene_position_id: location.scene_position_id,
        approach_path_length: Array.isArray(approachPath) ? approachPath.length : null,
        approach_origin_matches_actor: request.approach_origin_position_id === location.scene_position_id,
        ordered_approach_valid: orderedApproachValid,
        local_path_proofs_match: pathProofsMatch,
        local_path_proofs_rechecked: pathProofsRechecked
      } });
    }
    const session = await transaction.query('SELECT turn_number FROM party_runtime.party_server_sessions WHERE party_id=$1', [request.party_id]);
    const created_at_turn = session.rows[0]?.turn_number;
    if (session.rows.length !== 1 || !Number.isSafeInteger(created_at_turn) || created_at_turn < 0) gap('committed_turn_required');
    const environment = await readCurrentEnvironment({ transaction, partyId: request.party_id });
    const natural = prepareG4NaturalBaseline({ verifiedCatalog, pin, g4_ref: request.g4,
      scene_template_ref, current_environment: environment,
      member_selection: { party_id: request.party_id, g5_site_id: request.source_site_id } });
    const admission = { source_location: location, effective_source_position_id: request.source_position_id,
      ordered_local_edge_path: approachPath, scene_template_ref, created_at_turn, scene_rules: approvedSceneRules,
      natural_profile_ref: natural.profile_ref, current_environment: environment, dependency_pins };
    const admissionDigest = canonicalDigest(admission);
    const checks = ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set']
      .map((kind) => ({ kind, digest: digest({ kind, admissionDigest }) }));
    return { ok: true, scene_template_ref, created_at_turn,
      validation_report: { status: 'pass', digest: digest(admission), natural_profile_ref: natural.profile_ref,
        scene_rules: approvedSceneRules },
      commit_rechecks: checks,
      async recheck({ transaction: currentTransaction }) {
        const current = await currentTransaction.query(`SELECT to_jsonb(loc) AS location FROM party_runtime.party_journey_locations loc
          WHERE party_id=$1 AND id=$2 AND owner_kind='actor' AND owner_id=$3 FOR UPDATE`,
        [request.party_id, location.id, request.actor_id]);
        if (current.rows.length !== 1 || canonicalDigest(current.rows[0].location) !== canonicalDigest(location)) {
          return { ok: false, code: 'state_version_conflict' };
        }
        const currentEnvironment = await readCurrentEnvironment({ transaction: currentTransaction, partyId: request.party_id });
        // Re-materialize the same machine baseline against the exact current
        // Temporal pins. Presentation remains at the P22 boundary.
        const currentNatural = prepareG4NaturalBaseline({ verifiedCatalog, pin, g4_ref: request.g4,
          scene_template_ref, current_environment: currentEnvironment,
          member_selection: { party_id: request.party_id, g5_site_id: request.source_site_id } });
        return { ok: canonicalDigest({ ...admission, current_environment: currentEnvironment,
          natural_profile_ref: currentNatural.profile_ref }) === admissionDigest, code: 'state_version_conflict' };
      }
    };
  };
}
function validOrderedApproach({ request, snapshot, location, path }) {
  if (typeof request.approach_origin_position_id !== 'string'
    || request.approach_origin_position_id !== location.scene_position_id
    || !Array.isArray(path) || path.length === 0
    || !Array.isArray(snapshot.scene_baselines) || !Array.isArray(snapshot.scene_positions)
    || !Array.isArray(snapshot.g6_instances) || !Array.isArray(snapshot.movement_edges)) return false;
  const baselines = snapshot.scene_baselines.filter((row) => row.host_kind === 'g5_site'
    && row.host_id === request.source_site_id && row.status === 'active');
  if (baselines.length !== 1) return false;
  const baseline = baselines[0];
  const positions = new Map(snapshot.scene_positions.map((row) => [row.id, row]));
  const g6ById = new Map(snapshot.g6_instances.map((row) => [row.id, row]));
  const origin = positions.get(location.scene_position_id);
  const source = positions.get(request.source_position_id);
  const belongsToSource = (position) => {
    const g6 = g6ById.get(position?.g6_instance_id);
    return g6?.scene_baseline_id === baseline.id;
  };
  if (!belongsToSource(origin) || !belongsToSource(source)) return false;
  let positionId = origin.id;
  const visited = new Set([positionId]);
  for (const item of path) {
    if (item == null || typeof item !== 'object'
      || typeof item.edge_id !== 'string' || typeof item.from_position_id !== 'string'
      || typeof item.to_position_id !== 'string' || item.from_position_id !== positionId) return false;
    const edges = snapshot.movement_edges.filter((row) => row.id === item.edge_id
      && row.status === 'active' && row.scene_baseline_id === baseline.id
      && row.from_position_id === item.from_position_id && row.to_position_id === item.to_position_id);
    if (edges.length !== 1 || !belongsToSource(positions.get(item.to_position_id))
      || visited.has(item.to_position_id)) return false;
    positionId = item.to_position_id;
    visited.add(positionId);
  }
  return positionId === source.id;
}
function approvedRules(source, rows, revision) {
  if (source.selection_rule_id !== 'scene_selection_single_candidate_v1' || source.selection_rule_version !== 1
    || source.applicability_rule_id !== 'scene_applicability_exact_source_ref_v1' || source.applicability_rule_version !== 1) gap('scene_policy_owner_required');
  return [['scene_selection_rule', source.selection_rule_id, source.selection_rule_version],
    ['scene_applicability_rule', source.applicability_rule_id, source.applicability_rule_version]].map(([entity_kind, id, version]) => {
    const exact = (rows ?? []).filter((row) => row.entity_kind === entity_kind
      && row.id === id && row.version === version && row.status === 'approved'
      && row.world_revision_id === revision && /^[a-f0-9]{64}$/u.test(row.canonical_digest ?? ''));
    if (exact.length !== 1) gap('approved_scene_rule_pin_required');
    return exact[0];
  });
}
function gap(reason, extraDetails = {}) { throw serverError('LIVE_WORLD_GENERATION_ADMISSION_GAP',
  'Generation admission is unavailable.', { status: 409, details: { reason, ...extraDetails } }); }
