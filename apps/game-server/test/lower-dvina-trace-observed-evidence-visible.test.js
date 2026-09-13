import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepVisibleProjector } from
  '../src/runtime/lower-dvina-trace-turn-step-fire-visible.js';

test('evidence inspection retains the scene and exact unresolved question', async () => {
  const projector = createLowerDvinaTraceTurnStepVisibleProjector({
    fallback: { project: async () => assert.fail('inspection uses the committed scene') }
  });
  for (const query of ['Какие следы перекрывают другие?', 'Совпадают ли отметины на канате и столбе?']) {
    const state = committedState();
    const input = { consequence: { status: 'resolved', visible_seed: {
      completed_steps: [{ step_index: 1, summary: 'Сопоставление наблюдений.' }],
      observed_evidence_inspection_seed: { kind: 'observed_evidence_inspection_seed',
        resolution: 'no_new_supported_conclusion', query,
        scene_support: ['На столбе видна свежая отметина.'] }
    } }, retrieved_state: state, body_update: { state_after: {} },
    mode_resolution: { decision_trace: { remaining_intent: null,
      step_traces: [{ approved_plan: { resolution: 'domain_request',
        goal_result: 'pending', operations: [{ op: 'request_discovery' }], check: null } }] } } };
    const visible = await projector.project(input);
    assert.equal(visible.visible_scene, state.current_visible_context.visible_scene);
    assert.deepEqual(visible.sensory_details, [
      ...state.current_visible_context.sensory_details,
      'На столбе видна свежая отметина.'
    ]);
    assert.deepEqual(visible.visible_changes, []);
    assert.ok(visible.uncertainties.some(value => value.includes(query)));
    assert.doesNotMatch(JSON.stringify(visible), /искомое|находится ли здесь|observed_evidence_inspection_seed/u);
    input.consequence.visible_seed.observed_evidence_inspection_seed.resolution = 'proven';
    await assert.rejects(projector.project(input), {
      code: 'TRACE_TURN_STEP_OBSERVED_EVIDENCE_VISIBLE_SEED_INVALID'
    });
  }
});

function committedState() {
  return { actor_id: 'player', party_state: { state_version: 9 },
    position: { location_ref: 'shed', g5_anchor_id: 'shed-anchor', zone_ref: 'yard' },
    current_visible_context: { version: 1, schema: 'visible_context_package',
      visible_scene: 'У сушильни лежит надрезанный канат.',
      visible_changes: ['На столбе видна свежая отметина.'],
      sensory_details: ['С каната капает вода.'], visible_npc: [],
      visible_objects: [], known_context: [], uncertainties: [],
      allowed_tensions: [], do_not_imply: [] },
    route_history: [], npcs: [], items: [] };
}
