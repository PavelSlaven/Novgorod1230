import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { createSpatialV3DomainMutationService, createSpatialV3DomainPlacementIntegrator } from '@rus/party-store/spatial-v3-domain-integration';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const placement = { party_id: 'check', entity_ref: ref('container', 'box'), placement_kind: 'scene_position', position_node_id: 'position', occupies_capacity_units: 1 };
const integrator = createSpatialV3DomainPlacementIntegrator();
if (integrator.validatePlacements({ party_id: 'check', active_position_ids: ['position'], placements: [placement] }).ok !== true) throw new Error('P23 semantic placement gate rejected a valid authoritative placement');
if (integrator.validatePlacements({ party_id: 'check', active_position_ids: ['position'], placements: [placement, placement] }).error?.code !== 'dual_location_owner') throw new Error('P23 semantic placement gate permits duplicate ownership');

const requestBody = { party_id: 'check', idempotency_key: 'semantic-check', expected_state_versions: [] };
const repository = { loadSnapshot: async () => ({ party_id: 'check' }), recheck: async () => ({ ok: false }) };
const mutation = createSpatialV3DomainMutationService({ repository, committer: { commit: async () => ({ ok: false }) }, verifyApproval: async () => ({ ok: true }) });
const rejected = await mutation.commit({ ...requestBody, canonical_digest: computeSpatialV3CanonicalDigest(requestBody) });
if (rejected.error?.code !== 'generated_schema_mismatch') throw new Error('P23 sealed-plan entry gate is not fail-closed');
console.log('P23 domain integration semantic contract: OK');
