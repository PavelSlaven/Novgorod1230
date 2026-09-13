import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptApprovedOpeningNarration, validateNarrationFlowResult } from '../src/index.js';

function openingAudit() {
  return { version: 1, schema: 'narrator_prose_audit', request_id: 'opening-1', pass: true,
    checks: Object.fromEntries(['schema_and_structure', 'visible_context_compliance', 'new_fact_check',
      'npc_check', 'item_check', 'container_check', 'door_exit_route_check', 'time_light_weather_check',
      'position_check', 'g5_anchor_check', 'knowledge_boundary_check', 'hidden_state_leak_check',
      'rumor_uncertainty_check', 'action_options_check', 'technical_text_check', 'must_include_check',
      'must_not_include_check', 'commit_readiness'].map((key) => [key, { pass: true }])),
    concerns: [], evidence: ['Approved.'], repair_route: null,
    commit_permission: { can_show_to_player: true, can_write_player_visible_message: true,
      can_mark_opening_scene_presented: true } };
}

test('adapts approved new-game Stage 22 and Stage 23 outputs', () => {
  const result = adaptApprovedOpeningNarration({
    stage22Result: {
      version: 1,
      schema: 'stage22_narrator_prose_result',
      request_id: 'opening-1',
      pass: true,
      visible_context_package_digest: 'sha256:visible',
      narrator_starting_prose: {
        version: 1,
        schema: 'narrator_starting_prose',
        request_id: 'opening-1',
        prose_status: 'drafted',
        prose: 'Перед воротами начинается дорога.',
        action_options: [],
        used_visible_context_refs: [],
        self_constraints_check: { no_new_world_facts: true }
      },
      generation_history: []
    },
    stage23Result: {
      version: 1,
      schema: 'stage23_narrator_prose_audit_result',
      request_id: 'opening-1',
      pass: true,
      narrator_starting_prose_digest: 'sha256:prose',
      narrator_prose_audit: openingAudit(),
      repair_route: null,
      audit_history: [],
      commit_permission: { can_show_to_player: true, can_write_player_visible_message: true, can_mark_opening_scene_presented: true }
    }
  });
  assert.equal(result.surface, 'first_game');
  assert.deepEqual(result.final_audit, openingAudit());
  assert.equal(Object.hasOwn(result.final_audit, 'coverage'), false);
  assert.equal(validateNarrationFlowResult({ ...result, surface: 'turn' }).ok, false);
  assert.equal(validateNarrationFlowResult({ ...result, final_audit: {
    version: 1, schema: 'narration_audit', pass: true, artistic_verdict: 'pass', technical_verdict: 'pass',
    coverage: { visible_changes: [], uncertainties: [] }, concerns: [], evidence: ['Grounded.']
  } }).ok, false);
  for (const mutate of [
    (audit) => { audit.request_id = 'foreign'; },
    (audit) => { audit.checks.must_include_check.pass = false; },
    (audit) => { delete audit.checks.technical_text_check; },
    (audit) => { audit.concerns = ['Unresolved.']; },
    (audit) => { audit.evidence = []; },
    (audit) => { audit.repair_route = 'repair'; },
    (audit) => { audit.commit_permission.can_mark_opening_scene_presented = false; }
  ]) {
    const invalid = structuredClone(result);
    mutate(invalid.final_audit);
    assert.equal(validateNarrationFlowResult(invalid).ok, false);
  }
  assert.equal(result.approved_output.prose, 'Перед воротами начинается дорога.');
});
