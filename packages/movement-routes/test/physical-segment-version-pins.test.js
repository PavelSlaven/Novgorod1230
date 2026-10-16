import test from 'node:test';
import assert from 'node:assert/strict';
import { validStaticSnapshot } from '../src/spatial-v3-validation.js';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';

const seal = (value) => ({ ...value, canonical_digest: digest(value) });
const pinSet = (pins) => ({ pins, canonical_digest: digest(pins).replace('sha256:', '') });
const pins = pinSet([{ dependency_role: 'segment',
  entity_ref: { entity_kind: 'site_connection', entity_id: 'line' },
  version_pin: { pin_kind: 'party_state_version', state_version: 4,
    authoring_version: null } }]);

function traversalSnapshot(segmentKind, versionPin) {
  return seal({ snapshot_kind: 'timed_traversal', action_snapshot: null,
    activity_snapshot: null, traversal_snapshot: seal({
      physical_segment_ref: { segment_ref: { segment_kind: segmentKind,
        segment_id: segmentKind === 'site_connection' ? 'line' : 'route-segment' },
      version_pin: versionPin },
      selected_movement_method_id: 'movement.foot',
      movement_carrier_ref: { entity_kind: 'actor', entity_id: 'actor' },
      movement_capacity_units: 1,
      environment_profile_ref: { entity_ref: { entity_kind: 'environment_profile', entity_id: 'env' }, authoring_version: '1' },
      orientation_profile_ref: { entity_ref: { entity_kind: 'orientation_profile', entity_id: 'orientation' }, authoring_version: '1' },
      cost_profile_ref: { entity_ref: { entity_kind: 'cost_profile', entity_id: 'cost' }, authoring_version: '1' },
      recheck_policy_ref: { entity_ref: { entity_kind: 'recheck_policy', entity_id: 'recheck' }, authoring_version: '1' },
      factual_context_snapshot: {}, dependency_pins: pins }) });
}

test('P18 accepts normative site-connection party-state and world-route authoring pins', () => {
  const site = traversalSnapshot('site_connection', { pin_kind: 'party_state_version',
    state_version: 4, authoring_version: null });
  const routePins = pinSet([{ dependency_role: 'segment',
    entity_ref: { entity_kind: 'world_route_segment', entity_id: 'route-segment' },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '7',
      state_version: null } }]);
  const route = traversalSnapshot('world_route_segment', { pin_kind: 'authoring_version',
    authoring_version: '7', state_version: null });
  route.traversal_snapshot.dependency_pins = routePins;
  route.traversal_snapshot.canonical_digest = digest(Object.fromEntries(
    Object.entries(route.traversal_snapshot).filter(([key]) => key !== 'canonical_digest')));
  route.canonical_digest = digest(Object.fromEntries(
    Object.entries(route).filter(([key]) => key !== 'canonical_digest')));

  assert.equal(validStaticSnapshot('timed_traversal', site), true);
  assert.equal(validStaticSnapshot('timed_traversal', route), true);
  assert.equal(validStaticSnapshot('timed_traversal', traversalSnapshot('site_connection', {
    pin_kind: 'authoring_version', authoring_version: '1', state_version: null })), false);
});
