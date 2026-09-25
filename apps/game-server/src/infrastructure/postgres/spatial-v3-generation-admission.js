import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';
import { prepareG4NaturalBaseline } from '../../runtime/g4-natural-baseline.js';
import { serverError } from '../../errors.js';

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
    } else if (selection.status === 'terminal') {
      const exit = selection.directional_exit;
      const target = snapshot.sites.find((row) => row.origin === 'canonical' && row.status === 'active'
        && row.canonical_g5_ref?.entity_id === exit.exit_canonical_g5_id
        && Number(row.canonical_g5_ref.authoring_version) === exit.exit_canonical_g5_version);
      const baseline = snapshot.scene_baselines.find((row) => row.host_kind === 'g5_site'
        && row.host_id === target?.id && row.status === 'active');
      const canonical = await worldBaseReader.readPinnedCanonicalG5SceneBinding({
        id: exit.exit_canonical_g5_id, version: exit.exit_canonical_g5_version,
        world_revision_id: request.g4.world_revision_id,
        ...(baseline && { scene_template_ref: { id: baseline.scene_template_ref.entity_id,
          version: Number(baseline.scene_template_ref.authoring_version) } }) });
      if (!canonical?.ok || canonical.value.parent_id !== request.g4.id
        || canonical.value.parent_version !== request.g4.version) gap('exact_terminal_scene_required');
      approvedSceneRules = approvedRules(canonical.value, canonical.value.scene_rules, request.g4.world_revision_id);
      scene_template_ref = { id: canonical.value.scene_template_id, version: canonical.value.scene_template_version };
    } else gap('selected_expansion_required');
    const location = snapshot.journey_locations.filter((row) => row.owner_kind === 'actor'
      && row.owner_id === request.actor_id && row.party_id === request.party_id
      && row.scene_position_id === request.source_position_id && row.location_kind === 'scene');
    if (location.length !== 1) gap('current_actor_at_source_required');
    const session = await transaction.query('SELECT turn_number FROM party_runtime.party_server_sessions WHERE party_id=$1', [request.party_id]);
    const created_at_turn = session.rows[0]?.turn_number;
    if (session.rows.length !== 1 || !Number.isSafeInteger(created_at_turn) || created_at_turn < 0) gap('committed_turn_required');
    const environment = await readCurrentEnvironment({ transaction, partyId: request.party_id });
    const natural = prepareG4NaturalBaseline({ verifiedCatalog, pin, g4_ref: request.g4,
      scene_template_ref, current_environment: environment,
      member_selection: { party_id: request.party_id, g5_site_id: request.source_site_id } });
    const admission = { source_location: location[0], scene_template_ref, created_at_turn, scene_rules: approvedSceneRules,
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
        [request.party_id, location[0].id, request.actor_id]);
        if (current.rows.length !== 1 || canonicalDigest(current.rows[0].location) !== canonicalDigest(location[0])) {
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
function gap(reason) { throw serverError('LIVE_WORLD_GENERATION_ADMISSION_GAP',
  'Generation admission is unavailable.', { status: 409, details: { reason } }); }
