import { canonicalDigest } from '@rus/materialization';
import { provisionSpatialSemanticEnvelope } from './spatial-semantic-authority-repository.js';

// S1 authority is installed only during the already locked first-entry P16.
// The profile is the sole source of policy and descriptor data; callers pass
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
      if (envelopes.length !== profile.envelopes.length) {
        fail('S1_SPATIAL_PROFILE_SCOPE_GAP');
      }
      const results = [];
      for (const entry of envelopes) {
        const envelope = buildEnvelope(profile, entry, scope,
          loadedProfile.artifact_digest);
        results.push(await provisionSpatialSemanticEnvelope({ client: transaction,
          partyId, envelope, capacity: entry.capacity,
          changeSetId }));
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
      g6.source_scene_template_ref AS template_ref,
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

function buildEnvelope(profile, entry, scope, profileDigest) {
  return { envelope_ref: entry.envelope_ref, kind: entry.kind,
    baseline_ref: scope.baseline_ref, g5_ref: scope.g5_ref, g6_ref: scope.g6_ref,
    position_ref: scope.position_ref,
    template_ref: `sha256:${canonicalDigest(scope.template_ref)}`,
    property_ref: profile.property_ref, function_ref: profile.function_ref,
    environment_ref: profile.environment_ref,
    structural_primitive: entry.structural_primitive,
    profile_ref: profile.profile_id, profile_version: profile.revision,
    profile_digest: `sha256:${profileDigest}`,
    policy_ref: profile.policy_ref, policy_version: profile.policy_version,
    baseline_state_version: Number(scope.baseline_state_version),
    g5_state_version: Number(scope.g5_state_version), g6_state_version: Number(scope.g6_state_version),
    position_state_version: Number(scope.position_state_version),
    allowed_descriptors: structuredClone(entry.allowed_descriptors) };
}

function requireProfile(value) {
  const profile = value?.profile;
  if (value?.schema !== 'rus.lower_dvina_trace_s1_loaded_profile.v1'
      || !/^[0-9a-f]{64}$/u.test(value?.artifact_digest)
      || profile?.schema !== 'rus.lower_dvina_trace_spatial_semantic_profile.v1'
      || profile.status !== 'approved' || profile.scenario_definition_revision !== 23
      || !text(profile.profile_id) || !text(profile.policy_ref)
      || !Number.isSafeInteger(profile.revision) || !Number.isSafeInteger(profile.policy_version)
      || !['property_ref','function_ref','environment_ref'].every((key) => text(profile[key]))
      || !Array.isArray(profile.envelopes) || profile.envelopes.length !== 2) {
    throw new TypeError('Exact approved S1 profile is required.');
  }
  const scope = profile.envelopes[0] == null ? null : {
    template_id: profile.envelopes[0].template_id,
    position_kind: profile.envelopes[0].position_kind };
  for (const entry of profile.envelopes) {
    if (!entry || !text(entry.envelope_ref) || !text(entry.template_id)
        || !text(entry.position_kind) || !['ordinary_structure','local_natural_feature'].includes(entry.kind)
        || entry.structural_primitive !== (entry.kind === 'ordinary_structure'
          ? 'party_scoped_ordinary_structure' : 'party_scoped_local_natural_feature')
        || !entry.capacity || entry.capacity.total !== 1 || entry.capacity.reserved !== 0
        || entry.capacity.remaining !== 1 || !Array.isArray(entry.allowed_descriptors)
        || entry.allowed_descriptors.length < 1 || entry.allowed_descriptors.length > 8
        || entry.template_id !== scope?.template_id
        || entry.position_kind !== scope?.position_kind
        || (entry.authored_descriptor_ref != null
          && (entry.kind !== 'ordinary_structure'
            || !entry.allowed_descriptors.some(({ descriptor_ref }) =>
              descriptor_ref === entry.authored_descriptor_ref)))) {
      throw new TypeError('Exact approved S1 envelope profile is required.');
    }
  }
  return profile;
}
function text(value) { return typeof value === 'string' && value.trim() === value && value.length > 0; }
function fail(code) { throw Object.assign(new Error(code), { code, spatialCode: 'state_version_conflict' }); }
