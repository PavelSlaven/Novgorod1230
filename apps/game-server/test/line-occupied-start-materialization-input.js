import assert from 'node:assert/strict';
import { canonicalDigest } from '@rus/materialization';

export const OCCUPIED_LINE_SCENARIO = 'novgorod_vikhtuy_work_storage_v1';

// Тестовый вход: один NPC из исходных утверждённых профилей занимает focus
// вместимостью один. Production materializer и Stage 24 строят всю партию.
export function projectOccupiedLineStartInput({ materializationInput, startRuntime }) {
  if (startRuntime.profile.scenario_id !== OCCUPIED_LINE_SCENARIO) return materializationInput;
  const world = structuredClone(materializationInput.world_base_reference_snapshot);
  const closure = structuredClone(materializationInput.canonical_npc_closure);
  const placement = startRuntime.profile.canonical_start.start.initial_placement;
  const scene = world.scene_template_closures.find(({ header }) =>
    header.id === placement.scene_template_ref.id
      && header.version === placement.scene_template_ref.version);
  assert.ok(scene, 'the test input retains the approved source scene');
  const arrival = scene.endpoint_slots.find(({ slot_key }) => slot_key === placement.scene_endpoint_slot_key);
  assert.equal(arrival.required_position_slot_key, 'arrival');
  const firstEdge = scene.movement_edges.filter((edge) =>
    edge.from_position_slot_key === arrival.required_position_slot_key);
  assert.equal(firstEdge.length, 1, 'the approved arrival has one hidden first step');
  assert.equal(firstEdge[0].to_position_slot_key, 'focus');
  const destination = scene.position_slots.find(({ position_slot_key }) =>
    position_slot_key === firstEdge[0].to_position_slot_key);
  assert.equal(destination.instance_count, 1);
  destination.capacity = 1;
  closure.composition.min_count = 1;
  closure.composition.max_count = 1;
  closure.composition.payload.count_weights = [1];
  closure.composition.payload.placement_policy.position_slot_order = [destination.position_slot_key];
  // Only the test composition and position capacity differ; NPC profiles stay exact.
  const { canonical_digest: sourceDigest, authoring_digest: sourceAuthoringDigest,
    ...composition } = closure.composition;
  assert.ok(sourceDigest);
  closure.composition.canonical_digest = canonicalDigest(composition);
  if (sourceAuthoringDigest != null) closure.composition.authoring_digest = closure.composition.canonical_digest;
  const { readonly_checksum: sourceChecksum, ...worldInput } = world;
  assert.ok(sourceChecksum);
  world.readonly_checksum = canonicalDigest(worldInput);
  return { ...materializationInput, canonical_npc_closure: closure,
    world_base_reference_snapshot: world };
}
