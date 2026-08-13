import assert from 'node:assert/strict';

const EVIDENCE = Object.freeze([
  'trace_ld_v1_evidence_cut_fastening',
  'trace_ld_v1_evidence_side_dent',
  'trace_ld_v1_evidence_second_boat_trace',
  'trace_ld_v1_evidence_boot_track',
  'trace_ld_v1_evidence_blue_wool',
  'trace_ld_v1_evidence_bag_at_zhdanko',
  'trace_ld_v1_evidence_eremey_words',
  'trace_ld_v1_evidence_ratsha_confession'
]);

export function addCanonicalPhase10Evidence(state) {
  state.knowledge = [...(state.knowledge ?? []), ...EVIDENCE.map(
    (factId) => ({ fact_id: factId,
      knowledge_state: 'known_from_committed_scenario_event',
      evidence_refs: [`event:${factId}`] }))];
  state.perceptions = [...(state.perceptions ?? []), {
    perception_id: 'perception:canonical:onisim-alive',
    observation_ref: 'trace_ld_v1_observation_onisim_alive_at_drying_shed',
    fact_id: 'onisim_found_alive',
    causal_route_execution_id: 'activity:canonical:camp-to-shed'
  }];
}

export function assertCanonicalPhase10({ runtime, result, versionBefore,
  turnBefore, clockBefore, commitsBefore, turnStepsBefore }) {
  assert.equal(runtime.state.completion.status, 'committed');
  assert.equal(runtime.state.completion.source_commit_version,
    versionBefore + 1);
  assert.equal(runtime.state.party_state.state_version, versionBefore + 2);
  assert.equal(runtime.state.party_state.turn_number, turnBefore + 1);
  assert.equal(runtime.commitCount(), commitsBefore + 2);
  assert.equal(runtime.turnStepCount(), turnStepsBefore + 1);
  assert.equal(Number(runtime.state.clock.whole_minutes),
    Number(clockBefore.whole_minutes) + 5);
  assert.equal(result.completion.status, 'committed');
  assert.equal(runtime.state.last_turn.consequence.phase9_kind,
    'temporary_disposition');
  assert.equal(runtime.state.completion.outcome.primary_completion_state,
    'trace_ld_v1_completion_full');
  const narrationInput = JSON.stringify(runtime.narratorInput());
  assert.match(narrationInput, /мир и его жители продолжают существовать/u);
  for (const forbidden of ['hidden_truth', 'culprit', 'motive',
    'document_contents', 'relevant_hidden_state']) {
    assert.equal(narrationInput.includes(forbidden), false, forbidden);
  }
}
