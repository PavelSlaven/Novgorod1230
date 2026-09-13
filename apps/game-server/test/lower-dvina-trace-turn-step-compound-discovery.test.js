import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepSemanticGroundingValidator } from
  '../src/runtime/lower-dvina-trace-turn-step-grounding-audit.js';

test('a lossless focused discovery prefix survives a wrong prerequisite verdict',
  async () => {
    const intent = 'Ищу кусок старой верёвки, беру его и собираю пять сухих веток.';
    const query = 'Ищу кусок старой верёвки';
    const plan = { interpretation: { grounded_attempt: query,
      adaptation: 'literal' }, operations: [{ op: 'request_discovery',
      actor_ref: 'actor_mikula', discovery_kind: 'search',
      target_refs: ['wreck_shore'], query }], check: null,
    continuation: { remaining_intent: 'беру его и собираю пять сухих веток.',
      depends_on_refs: [] } };
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run() { return { output: {
        mode: 'material_prerequisite', consumed_intent: null } }; } } });
    assert.equal(await validate({ plan, request: { remaining_intent: intent,
      actor: { actor_id: 'actor_mikula' }, player_safe_state: {
        position: { location_ref: 'wreck_shore' }, ordinary_resolution: {
          discovery_available: true, container_resolution_available: false,
          scene_seed_available: false } } }, resolved_domain_operations: [{
      path: '$.operations.0', owner_kind: 'ordinary_discovery' }] }), true);
  });
