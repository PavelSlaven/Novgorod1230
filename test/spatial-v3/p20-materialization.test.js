import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { createSpatialContextLoader, createSceneMaterializer, createFrontierTopologyResolver, createTargetPreparationService, createCrossDomainProposalComposer } from '@rus/materialization/spatial-v3-materialization';

const digest = (value) => computeSpatialV3CanonicalDigest(value);
const seal = (value) => ({ ...value, canonical_digest: digest(value) });
const pins = () => { const rows = [{ dependency_role: 'source_authoring', entity_ref: { entity_kind: 'world_revision', entity_id: 'world' }, version_pin: { pin_kind: 'authoring_version', authoring_version: '4.2.0' } }]; return { pins: rows, canonical_digest: digest(rows).replace('sha256:', '') }; };
const ref = (kind, value) => ({ entity_ref: { entity_kind: kind, entity_id: value }, authoring_version: '4.2.0' });
const context = (more = {}) => seal({ party_id: 'party', world_revision_id: 'world', dependency_pins: pins(), ...more });
const sceneContext = (more = {}) => { const dependency_pins = pins(); const scene_profile_ref = ref('scene_profile', 'profile'); const scene_template_ref = ref('scene_template', 'template'); const catalog = seal({ kind: 'scene_catalog_bundle', dependency_pins, scene_profile_ref, scene_template_ref }); return seal({ party_id: 'party', world_revision_id: 'world', dependency_pins, scene_host_ref: { entity_kind: 'party_g5_site', entity_id: 'g5' }, scene_profile_ref, scene_template_ref, catalog_bundle: catalog, catalog_digest: catalog.canonical_digest, materializer_version: 'v3', source_kind: 'canonical', idempotency_key: 'idem', required_slots: [{ slot_key: 'arrival', endpoint_role: 'both', matches: [{ g6_id: 'g6', position_id: 'position' }] }], g6: [{ g6_id: 'g6', scene_host_ref: { entity_kind: 'party_g5_site', entity_id: 'g5' }, positions: [{ position_id: 'position', g6_id: 'g6' }] }], relations: [], dynamic_slots: [], ...more }); };
const endpoint = (kind, value) => seal({ endpoint_kind: kind, endpoint_id: value });
const binding = (role, value, host = 'g5') => seal({ party_id: 'party', role, endpoint_ref: endpoint('scene_position', value), scene_host_ref: { entity_kind: 'party_g5_site', entity_id: host }, endpoint_scene_host_ref: { entity_kind: 'party_g5_site', entity_id: host } });

test('P20 loader binds exact catalog kind/ref/pins and never fabricates invalid request pins', async () => {
  const dependency_pins = pins(); const catalog_bundle_ref = ref('catalog_bundle', 'catalog'); const request = seal({ party_id: 'party', trigger_id: 'first-entry', dependency_pins, catalog_bundle_ref, expected_catalog_kind: 'scene_catalog_bundle' });
  const catalog_bundle = seal({ kind: 'scene_catalog_bundle', dependency_pins }); const snapshot = seal({ party_id: 'party', trigger_id: 'first-entry', request_digest: request.canonical_digest, dependency_pins, catalog_bundle_ref, catalog_bundle, catalog_digest: catalog_bundle.canonical_digest });
  const loader = createSpatialContextLoader({ loadSnapshot: async () => ({ ok: true, snapshot }) });
  assert.equal((await loader.load(request)).ok, true);
  assert.equal((await loader.load(seal({ ...request, dependency_pins: { pins: [] } }))).error.diagnostics.invalid_dependency_pins, true);
  assert.equal((await createSpatialContextLoader({ loadSnapshot: async () => ({ ok: true, snapshot: seal({ ...snapshot, catalog_bundle: seal({ ...catalog_bundle, kind: 'other' }) }) }) }).load(request)).ok, false);
});

test('P20 baseline validates catalog/template/pins, exact slots/G6 relations and exact re-entry parity', () => {
  const materializer = createSceneMaterializer(); const input = sceneContext(); const first = materializer.materialize(input);
  assert.equal(first.ok, true); assert.equal(first.reused, false);
  const raw = { ...input }; delete raw.canonical_digest;
  assert.equal(materializer.materialize(sceneContext({ ...raw, existing_baseline: first.proposal })).reused, true);
  assert.equal(materializer.materialize(sceneContext({ ...raw, g6: [{ ...input.g6[0], positions: [] }] })).ok, false);
  const stale = { ...first.proposal, catalog_digest: 'other' }; assert.equal(materializer.materialize(sceneContext({ ...raw, existing_baseline: seal(stale) })).ok, false);
  const { source_kind: _removed, ...removed } = first.proposal; assert.equal(materializer.materialize(sceneContext({ ...raw, existing_baseline: seal(removed) })).ok, false);
});

test('P20 frontier claims sealed locked reservation, enforces candidate membership/successor bindings and exact terminal owner', async () => {
  const candidate = seal({ candidate_id: 'candidate', status: 'approved', template_ref: ref('generated_g5_template', 'template'), generated_site_id: 'site' });
  const capacity = { committed_residual_capacity: 1, reservable_residual_capacity: 1 }; const locked = seal({ party_id: 'party', frontier_id: 'frontier', lock_id: 'lock', lease_expires_at: '2030-01-01T00:00:00Z', state_version: 1 }); const reservation_request = seal({ party_id: 'party', frontier_id: 'frontier', requested_units: 1, idempotency_key: 'idem', frontier_state_version: 1, capacity_snapshot_digest: digest(capacity), lock_id: locked.lock_id, lock_digest: locked.canonical_digest, lock_lease_expires_at: locked.lease_expires_at });
  const { canonical_digest: _reservationRequestDigest, ...reservationFields } = reservation_request; const reservation = seal({ ...reservationFields, status: 'active', expires_at: '2030-01-01T00:00:00Z' });
  const resolver = createFrontierTopologyResolver({ acquireExclusiveReservation: async () => ({ ok: true, reservation }), selectTemplate: async () => seal({ ok: true, selected_candidate_id: 'candidate', selected_template_ref: candidate.template_ref, candidate_set_digest: digest([candidate]) }) });
  const base = { scene_host_ref: { entity_kind: 'party_g5_site', entity_id: 'g5' }, frontier: { id: 'frontier', state_version: 1, slot_role: 'through', ordinal: 0, terminal_ordinal: 1 }, locked, capacity, approved_candidates: [candidate], reservation_request, successor_rule: seal({ source_frontier_id: 'frontier', successor_frontier_id: 'next', source_endpoint_ref: endpoint('scene_position', 'from'), successor_endpoint_ref: endpoint('scene_position', 'to'), endpoint_bindings: [binding('departure', 'from', 'site'), binding('arrival', 'to')], generated_site_id: 'site', target_projection_host_ref: { entity_kind: 'party_g5_site', entity_id: 'g5' } }), idempotency_key: 'idem' };
  const proposal = await resolver.resolve(context(base)); assert.equal(proposal.ok, true); assert.equal(proposal.proposal.moves_traveller, false); assert.equal(proposal.proposal.advances_time, false);
  const rejectedSelection = createFrontierTopologyResolver({ acquireExclusiveReservation: async () => ({ ok: true, reservation }), selectTemplate: async () => seal({ ok: true, selected_candidate_id: 'forged', selected_template_ref: candidate.template_ref, candidate_set_digest: digest([candidate]) }) });
  assert.equal((await rejectedSelection.resolve(context(base))).ok, false);
  const { canonical_digest: _successorDigest, ...successorFields } = base.successor_rule; const fakeHost = { ...successorFields, endpoint_bindings: [binding('departure', 'from', 'fake'), binding('arrival', 'to')] }; assert.equal((await resolver.resolve(context({ ...base, successor_rule: seal(fakeHost) }))).ok, false);
  const terminal = await resolver.resolve(context({ ...base, frontier: { ...base.frontier, ordinal: 1 }, terminal_resolution: seal({ kind: 'physical_boundary', owner_ref: base.scene_host_ref, boundary_ref: ref('boundary', 'b'), endpoint_bindings: [] }) })); assert.equal(terminal.proposal.kind, 'frontier_terminal_proposal');
  assert.equal((await resolver.resolve(context({ ...base, frontier: { ...base.frontier, ordinal: 1 }, terminal_resolution: seal({ kind: 'physical_boundary', owner_ref: { entity_kind: 'party_g5_site', entity_id: 'other' }, boundary_ref: ref('boundary', 'b'), endpoint_bindings: [] }) }))).ok, false);
});

test('P20 preparation reuses sealed same-request snapshot without rematerialization and writes only through claim protocol', async () => {
  const scene = createSceneMaterializer(); const member = seal({ kind: 'endpoint', member_id: 'member', dependency_digest: 'dependency', share_mode: 'reusable', scene_context: sceneContext() }); const input = context({ request_id: 'request', request_digest: 'request-digest', idempotency_key: 'idem', members: [member] });
  let calls = 0; let saved = null; let releases = 0; const ports = { materializeScene: async (value) => { calls += 1; return scene.materialize(value); }, readSnapshot: async () => saved ? { ok: true, snapshot: saved } : { ok: false, code: 'not_found' }, claimPreparation: async () => ({ ok: true, claim: seal({ id: 'claim', party_id: 'party', request_id: 'request', idempotency_key: 'idem', share_mode: 'reusable', state_version: 1 }) }), writeSnapshot: async ({ snapshot }) => { saved = snapshot; return { ok: true, snapshot }; }, releasePreparation: async () => { releases += 1; return { ok: true }; } }; const service = createTargetPreparationService(ports);
  assert.equal((await service.prepare(input)).ok, true); assert.equal(calls, 1); assert.equal((await service.prepare(input)).reused, true); assert.equal(calls, 1);
  const failing = createTargetPreparationService({ ...ports, readSnapshot: async () => ({ ok: false, code: 'not_found' }), materializeScene: async () => ({ ok: false }) }); assert.equal((await failing.prepare(input)).ok, false); assert.equal(releases, 1);
});

test('P20 composition binds each domain placement to exact spatial slot/G6 and shared party/pins/idempotency', () => {
  const dependency_pins = pins(); const spatial = seal({ party_id: 'party', dependency_pins, idempotency_key: 'idem', slots: [{ slot_key: 'arrival', position_id: 'position', g6_id: 'g6' }] }); const npc = seal({ domain: 'npc', party_id: 'party', dependency_pins, idempotency_key: 'idem', placements: [{ slot_key: 'guard', position_id: 'position', g6_id: 'g6' }] }); const composer = createCrossDomainProposalComposer();
  const input = seal({ party_id: 'party', dependency_pins, idempotency_key: 'idem', spatial_proposal: spatial, required_slots: [{ domain: 'npc', slot_key: 'guard', spatial_slot_key: 'arrival' }], domain_proposals: { npc } });
  assert.equal(composer.compose(input).ok, true);
  assert.equal(composer.compose(seal({ ...input, domain_proposals: { npc: seal({ ...npc, placements: [{ slot_key: 'guard', position_id: 'wrong', g6_id: 'g6' }] }) } })).ok, false);
});
