import assert from 'node:assert/strict';

export function existingInspectionFixtureResponse(request) {
  const targets = request.player_safe_state.items.filter(item =>
    item.placement?.holder_character_id === request.actor.actor_id).slice(0, 2);
  assert.equal(targets.length, 2);
  return {
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent, adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_discovery', actor_ref: request.actor.actor_id,
      discovery_kind: 'inspect', target_refs: targets.map(item => item.item_id),
      query: request.remaining_intent }], check: null,
    continuation: { remaining_intent: 'Затем решить, куда идти.', depends_on_refs: [] },
    clarification: null, direct_result_kind: null, reason_code: 'known_item_inspection',
    reason: 'Inspect supplied existing objects; additional causes remain unknown.'
  };
}

export function assertPersistedExistingInspection({ before, after, roleInputs, result }) {
  assert.deepEqual(after.clock, before.clock);
  assert.deepEqual(after.body, before.body);
  assert.deepEqual(after.item_ids, before.item_ids);
  assert.deepEqual(after.activities, before.activities);
  assert.equal(after.state_version, before.state_version + 1);
  assert.equal(roleInputs.filter(input => input?.schema === 'ordinary_materialization_request_v1').length, 0);
  const plans = roleInputs.filter(input => input?.schema === 'turn_step_request_v1');
  assert.equal(plans.length, 1, 'queued target uses the existing canonicalizer');
  const trace = after.state_payload.last_turn.semantic_trace;
  assert.equal(trace.step_traces.length, 2);
  assert.equal(trace.remaining_intent, 'Затем решить, куда идти.');
  const targets = trace.step_traces.map(step => step.approved_plan.operations[0].target_refs[0]);
  const names = targets.map(id => plans[0].player_safe_state.items.find(item => item.item_id === id).name);
  const narrations = roleInputs.filter(input => input?.schema === 'narration_request');
  assert.ok(narrations.length > 0);
  for (const { optional_support: visible, required_current_beat: beat } of narrations) {
    assert.equal(visible.visible_scene, plans[0].player_safe_state.current_visible_context.visible_scene);
    for (const name of names) assert.ok(beat.changes.some(({ text }) => text.includes(name)));
    assert.ok(beat.changes.some(({ text }) => text.includes('пригодно к обычному использованию')));
    assert.ok(beat.uncertainties.some(({ text }) => text.includes(plans[0].remaining_intent)));
    assert.ok(beat.uncertainties.some(({ text }) => text.includes(trace.remaining_intent)));
  }
  assert.equal(result.screen.panels.inventory.visible, true);
}
