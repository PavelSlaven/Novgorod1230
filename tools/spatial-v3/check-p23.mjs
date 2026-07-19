import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { createSpatialV3DomainMutationService, createSpatialV3DomainPlacementIntegrator } from '@rus/party-store/spatial-v3-domain-integration';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const placement = { party_id: 'check', entity_ref: ref('container', 'box'), placement_kind: 'scene_position', position_node_id: 'position', occupies_capacity_units: 1 };
const integrator = createSpatialV3DomainPlacementIntegrator();
if (integrator.validatePlacements({ party_id: 'check', active_position_ids: ['position'], placements: [placement] }).ok !== true) throw new Error('P23 semantic placement gate rejected a valid authoritative placement');
if (integrator.validatePlacements({ party_id: 'check', active_position_ids: ['position'], placements: [placement, placement] }).error?.code !== 'dual_location_owner') throw new Error('P23 semantic placement gate permits duplicate ownership');

const requestBody = { party_id: 'check', idempotency_key: 'semantic-check', expected_state_versions: [{ resource: 'entity_placements', id: 'transport:boat', state_version: 1 }] };
// §13.1 requires physical locks before the phase-6 idempotency lease. The
// fake therefore proves a rejected lease still occurs after a lock snapshot.
const repository = { withTransaction: async (work) => work({}), acquireIdempotency: async () => ({ ok: false, code: 'idempotency_conflict' }), loadForUpdate: async () => ({ party_id: 'check', expected_state_versions_valid: true }), applyAtomically: async () => ({ ok: false }), completeIdempotency: async () => ({ ok: false }) };
const mutation = createSpatialV3DomainMutationService({ repository });
const rejected = await mutation.commit({ ...requestBody, canonical_digest: computeSpatialV3CanonicalDigest(requestBody) });
if (rejected.error?.code !== 'idempotency_conflict') throw new Error('P23 semantic transaction gate is not fail-closed');
console.log('P23 domain integration semantic contract: OK');
