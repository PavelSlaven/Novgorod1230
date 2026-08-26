import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalPhase11LlmResponder } from './lower-dvina-phase-11-llm.js';

test('canonical local fixture serves the active S1 descriptor role', async () => {
  const response = await createCanonicalPhase11LlmResponder()({
    model: 'fixture-spatial-semantic-descriptor',
    input: { request_id: 's1-local', approved_envelope: {
      required_semantic_requirements: ['interior_space'] } }
  });
  assert.deepEqual(response, {
    schema: 'rus.s1_spatial_semantic_proposal.v1', request_id: 's1-local',
    name: 'Низкая плетёная загородка',
    description: 'Сырая плетёная загородка у берега, без особого значения.',
    semantic_requirements: ['interior_space']
  });
});

test('canonical local fixture routes a free general look into the shared planner',
  async () => {
    const plan = await createCanonicalPhase11LlmResponder()({
      model: 'fixture-turn-step-planner', input: {
        request_id: 'look-local', committed_state_version: 1,
        working_revision: 0, step_index: 1,
        root_player_action: 'Осматриваюсь вокруг.',
        remaining_intent: 'Осматриваюсь вокруг.',
        actor: { actor_id: 'player-local' },
        player_safe_state: { spatial_semantic: {
          semantic_grounding_available: true, position_ref: 'position:local' } }
      }
    });
    assert.deepEqual(plan.operations, [{ op: 'request_discovery',
      actor_ref: 'player-local', discovery_kind: 'look',
      target_refs: ['position:local'], query: 'осмотреться' }]);
  });
