import assert from 'node:assert/strict';
import test from 'node:test';
import { runTurnWorkflow } from '../src/index.js';
import { createServices, input } from './turn-workflow-fixture.js';
import { discoveryPlan, discoveryProjection, ordinaryResult, spatialMarker,
  unmatchedDiscoveryBinding } from './turn-step-discovery-priority-fixture.js';

test('ordinary discovery resolver runs only after existing discovery owners',
  async () => {
    let ordinaryCalls = 0;
    let bindingCalls = 0;
    const { services } = createServices([], { command: { matches: () => false,
      semantic_binding: { binding_id: 'authored-discovery',
        operation: 'request_discovery', matches() {
          bindingCalls += 1; return true;
        } } },
    playerSafeStateProjector: () => discoveryProjection(),
    turnStepOrdinaryDiscoveryResolver: async () => {
      ordinaryCalls += 1;
      throw new Error('ordinary resolver must not preempt authored discovery');
    }, turnStepModel: discoveryPlan });
    const result = await runTurnWorkflow(input(), services);
    assert.equal(result.status, 'resolved');
    assert.equal(bindingCalls, 1);
    assert.equal(ordinaryCalls, 0);
  });

test('S1 look remainder runs through the final discovery seam', async () => {
  const marker = spatialMarker();
  let spatialCalls = 0;
  const remainder = createServices([], { command: { matches: () => false,
    semantic_binding: unmatchedDiscoveryBinding() },
  playerSafeStateProjector: () => discoveryProjection(undefined, marker),
  turnStepSpatialSemanticResolver: async (request) => {
    spatialCalls += 1;
    assert.equal(Object.isFrozen(request), true);
    return ordinaryResult(request);
  }, turnStepModel: (request) => discoveryPlan(
    request, 'осматриваю место', 'look') }).services;
  await runTurnWorkflow(input(), remainder);
  assert.equal(spatialCalls, 1);
});

test('exact S1 look preempts the broader ordinary scene seed seam', async () => {
  let spatialCalls = 0;
  let ordinaryCalls = 0;
  const remainder = createServices([], { command: { matches: () => false,
    semantic_binding: unmatchedDiscoveryBinding() },
  playerSafeStateProjector: () => discoveryProjection({
    discovery_available: true, container_resolution_available: false,
    scene_seed_available: true }, spatialMarker()),
  turnStepSpatialSemanticResolver: async (request) => {
    spatialCalls += 1; return ordinaryResult(request);
  }, turnStepOrdinaryDiscoveryResolver: async () => {
    ordinaryCalls += 1;
    throw new Error('ordinary discovery must not preempt exact S1 scope');
  }, turnStepModel: (request) => discoveryPlan(
    request, 'осматриваю место', 'look') }).services;
  await runTurnWorkflow(input(), remainder);
  assert.equal(spatialCalls, 1);
  assert.equal(ordinaryCalls, 0);
});
