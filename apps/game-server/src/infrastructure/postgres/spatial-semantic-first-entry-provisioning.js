import { provisionSpatialSemanticEnvelope } from './spatial-semantic-authority-repository.js';

// S1 authority is installed only during the already locked first-entry P16.
// The profile is the sole source of policy and envelope data; callers pass
// only the physical first-entry binding attested by the common committer.
export function createSpatialSemanticFirstEntryProvisioner({ loadedProfile } = {}) {
  const profile = requireProfile(loadedProfile);
  return Object.freeze({
    async provision({ transaction, partyId, firstEntryBinding, changeSetId }) {
      if (!transaction?.query || !text(partyId) || !text(firstEntryBinding?.g6_instance_id)
          || !text(firstEntryBinding?.position_id) || !text(changeSetId)) {
        fail('S1_SPATIAL_PROVISIONING_INVALID');
      }
      const scope = await lockedScope(transaction, partyId, firstEntryBinding);
      const envelopes = profile.envelopes.filter((entry) => entry.template_id
        === scope.template_id && entry.position_kind === scope.position_kind);
      if (envelopes.length === 0) {
        return Object.freeze({ provisioned: false,
          envelope_refs: Object.freeze([]) });
      }
      const results = [];
      for (const entry of envelopes) {
        const topology = await persistedTopology(transaction, partyId, entry, scope);
        const envelope = buildEnvelope(profile, entry, scope, topology);
        results.push(await provisionSpatialSemanticEnvelope({ client: transaction,
          partyId, envelope, changeSetId }));
      }
      return Object.freeze({ provisioned: results.length > 0,
        envelope_refs: Object.freeze(envelopes.map(({ envelope_ref }) => envelope_ref)) });
    }
  });
}

async function lockedScope(transaction, partyId, binding) {
  const result = await transaction.query(`SELECT b.id AS baseline_ref,b.state_version AS baseline_state_version,
      g5.id AS g5_ref,g5.state_version AS g5_state_version,g6.id AS g6_ref,
      g6.state_version AS g6_state_version,
      g6.source_scene_template_ref#>>'{entity_ref,entity_id}' AS template_id,
      p.id AS position_ref,p.state_version AS position_state_version,
      p.position_type_id AS position_kind
    FROM party_runtime.party_scene_baselines b
    JOIN party_runtime.party_g5_sites g5 ON g5.party_id=b.party_id AND b.host_kind='g5_site' AND b.host_id=g5.id
    JOIN party_runtime.party_g6_instances g6 ON g6.party_id=b.party_id AND g6.scene_baseline_id=b.id
    JOIN party_runtime.scene_position_nodes p ON p.party_id=b.party_id AND p.g6_instance_id=g6.id
    WHERE b.party_id=$1 AND g6.id=$2 AND p.id=$3 AND b.status='active' AND g5.status='active'
      AND g6.status='active' AND p.status='active' FOR UPDATE OF b,g5,g6,p`,
  [partyId, binding.g6_instance_id, binding.position_id]);
  if (result.rowCount !== 1) fail('S1_SPATIAL_SCOPE_STALE');
  return result.rows[0];
}

function buildEnvelope(profile, entry, scope, topology) {
  return { envelope_ref: entry.envelope_ref, kind: entry.kind,
    scope_kind: 'current_position_local_reference', structural_variant: entry.structural_variant,
    available_mechanics: entry.available_mechanics,
    required_semantic_requirements: entry.required_semantic_requirements,
    baseline_ref: scope.baseline_ref, g5_ref: scope.g5_ref, g6_ref: scope.g6_ref,
    position_ref: scope.position_ref,
    property_ref: profile.property_ref, function_ref: profile.function_ref,
    environment_ref: profile.environment_ref,
    semantic_context: entry.semantic_context,
    profile_ref: profile.profile_id, profile_version: profile.revision,
    policy_ref: profile.policy_ref, policy_version: profile.policy_version,
    baseline_state_version: Number(scope.baseline_state_version),
    g5_state_version: Number(scope.g5_state_version), g6_state_version: Number(scope.g6_state_version),
    position_state_version: Number(scope.position_state_version), topology,
    capacity_total: entry.capacity_total, consumed_count: 0, state_version: 1 };
}

function requireProfile(value) {
  const profile = value?.profile;
  if (value?.schema !== 'rus.lower_dvina_trace_s1_loaded_profile.v1'
      || profile?.schema !== 'rus.lower_dvina_trace_spatial_semantic_profile.v1'
      || profile.status !== 'approved' || profile.scenario_definition_revision !== 24
      || !text(profile.profile_id) || !text(profile.policy_ref)
      || !Number.isSafeInteger(profile.revision) || !Number.isSafeInteger(profile.policy_version)
      || !['property_ref','function_ref','environment_ref'].every((key) => text(profile[key]))
      || !Array.isArray(profile.envelopes) || profile.envelopes.length === 0) {
    throw new TypeError('Exact approved S1 profile is required.');
  }
  for (const entry of profile.envelopes) {
    if (!entry || !text(entry.envelope_ref) || !text(entry.template_id)
        || !text(entry.position_kind) || !['ordinary_structure','local_natural_feature'].includes(entry.kind)
        || entry.scope_kind !== 'current_position_local_reference'
        || !['open_one_space','one_space_controlled_passage','descriptive_local_reference'].includes(entry.structural_variant)
        || ((entry.kind === 'ordinary_structure')
          !== (entry.structural_variant !== 'descriptive_local_reference'))
        || !Array.isArray(entry.available_mechanics)
        || new Set(entry.available_mechanics).size !== entry.available_mechanics.length
        || !entry.available_mechanics.every((mechanic) => ['interaction','projection','perception','interior_space','controlled_passage','movement_constraint','hazard','extractable_resource'].includes(mechanic))
        || !Array.isArray(entry.required_semantic_requirements)
        || new Set(entry.required_semantic_requirements).size !== entry.required_semantic_requirements.length
        || !entry.required_semantic_requirements.every((requirement) => ['interior_space','controlled_passage','movement_constraint','hazard','extractable_resource'].includes(requirement))
        || !Number.isSafeInteger(entry.capacity_total) || entry.capacity_total < 1
        || (entry.structural_variant === 'open_one_space'
          && (!text(entry.slot_key)
            || !entry.required_semantic_requirements.includes('interior_space')))
        || !semanticContext(entry.semantic_context, entry.kind)) {
      throw new TypeError('Exact approved S1 envelope profile is required.');
    }
  }
  return profile;
}

async function persistedTopology(transaction, partyId, entry, scope) {
  if (entry.structural_variant !== 'open_one_space') return null;
  const rows = await transaction.query(`SELECT g6.id AS g6_instance_ref,p.id AS interior_position_ref,
      ARRAY(SELECT id FROM party_runtime.scene_movement_edges
        WHERE party_id=$1 AND scene_baseline_id=$2 ORDER BY id) AS movement_edge_refs,
      ARRAY(SELECT id FROM party_runtime.visibility_links
        WHERE party_id=$1 AND scene_baseline_id=$2 ORDER BY id) AS visibility_link_refs
    FROM party_runtime.party_g6_instances g6
    JOIN party_runtime.scene_position_nodes p ON p.party_id=g6.party_id AND p.g6_instance_id=g6.id
    WHERE g6.party_id=$1 AND g6.scene_baseline_id=$2 AND g6.scene_slot_key=$3
      AND p.template_slot_key=$4 FOR UPDATE OF g6,p`, [partyId, scope.baseline_ref,
    entry.slot_key, `${entry.slot_key}.interior`]);
  const topology = rows.rows[0];
  if (rows.rowCount !== 1 || topology.movement_edge_refs.length !== 2
      || topology.visibility_link_refs.length !== 2) fail('S1_SPATIAL_PROVISIONING_INVALID');
  return { baseline_ref: scope.baseline_ref, g5_ref: scope.g5_ref,
    position_ref: scope.position_ref, ...topology };
}
function semanticContext(value, kind) {
  const keys = ['allowed_kind', 'period', 'region', 'place_type', 'environment',
    'material_culture', 'ordinary_boundary'];
  return value && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length && keys.every((key) => text(value[key]))
    && value.allowed_kind === kind;
}
function text(value) { return typeof value === 'string' && value.trim() === value && value.length > 0; }
function fail(code) { throw Object.assign(new Error(code), { code, spatialCode: 'state_version_conflict' }); }
