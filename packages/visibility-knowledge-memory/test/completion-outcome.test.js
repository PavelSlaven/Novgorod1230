import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CompletionResolutionError,
  detectHiddenLeaks,
  projectPlayerSafeCompletionOutcome,
  resolveCompositeCompletionOutcome
} from '../src/index.js';

const root = new URL('../../../data/world-catalogs/novgorod/'
  + 'lower-dvina-trace-v1/phase-0d/', import.meta.url);
const completionRules = JSON.parse(await readFile(
  new URL('completion-rules.json', root), 'utf8'));
const epilogueRules = JSON.parse(await readFile(
  new URL('epilogue-rules.json', root), 'utf8'));

test('resolves full, partial and case-open outcomes without negative inference', () => {
  const full = resolveCompositeCompletionOutcome(completionRules, inputs([
    'onisim_found_alive', 'sealed_packet_returned', 'seal_intact',
    'conclusion:physical_attack_pattern', 'conclusion:ratsha_participated',
    'conclusion:principal_zhdanko',
    'temporary_disposition_outcome_committed',
    'promise_current_fulfilled', 'promise_state_admitted_for_full_completion'
  ]), 17);
  assert.equal(full.primary_completion_state,
    'trace_ld_v1_completion_full');
  assert.equal(full.ordered_dimension_outcomes.length, 9);
  assert.equal(value(full, 'principal_resolution'), 'zhdanko_established');

  const partial = resolveCompositeCompletionOutcome(completionRules, inputs([
    'temporary_disposition_outcome_committed'
  ]), 17);
  assert.equal(partial.primary_completion_state,
    'trace_ld_v1_completion_partial');
  assert.equal(value(partial, 'principal_resolution'), 'unresolved');

  const open = resolveCompositeCompletionOutcome(completionRules, inputs([
    'onisim_found_alive'
  ]), 17);
  assert.equal(open.primary_completion_state,
    'trace_ld_v1_completion_case_open');
  assert.equal(value(open, 'principal_presence'), 'unresolved');
});

test('rejects conflicting dimensions, undeclared provenance and forbidden classes', () => {
  assert.throws(() => resolveCompositeCompletionOutcome(completionRules,
    inputs(['sealed_packet_returned', 'packet_lost_or_destroyed',
      'temporary_disposition_outcome_committed']), 17),
  (error) => error instanceof CompletionResolutionError
    && error.code === 'COMPLETION_DIMENSION_CONFLICT');
  assert.throws(() => resolveCompositeCompletionOutcome(completionRules, [{
    input_class: 'committed_objective_fact', fact_id: 'seal_intact',
    producer_kind: 'consequence_profile', producer_ref: 'invented',
    source_commit_version: 17
  }], 17), (error) => error.code
    === 'COMPLETION_FACT_PROVENANCE_UNDECLARED');
  for (const inputClass of ['player_hypothesis', 'uncommitted_statement',
    'single_check_outcome']) {
    const candidate = inputs(['onisim_found_alive'])[0];
    candidate.input_class = inputClass;
    assert.throws(() => resolveCompositeCompletionOutcome(completionRules,
      [candidate], 17), (error) => error.code
        === 'COMPLETION_COMMITTED_INPUT_INVALID');
  }
  const wrongClass = inputs(['onisim_found_alive'])[0];
  wrongClass.input_class = 'committed_promise_state';
  assert.throws(() => resolveCompositeCompletionOutcome(completionRules,
    [wrongClass], 17), (error) => error.code
      === 'COMPLETION_INPUT_CLASS_PROVENANCE_MISMATCH');
});

test('terminal projection reveals only values supported by visible facts', () => {
  const outcome = resolveCompositeCompletionOutcome(completionRules, inputs([
    'sealed_packet_returned', 'seal_intact',
    'temporary_disposition_outcome_committed'
  ]), 17);
  const hiddenPacket = projectPlayerSafeCompletionOutcome({ epilogueRules,
    completionRules, completionOutcome: outcome,
    visibleCommittedFacts: ['temporary_disposition_outcome_committed'],
    elapsedGameTime: { whole_minutes: 90, subminute_numerator: 0,
      subminute_denominator: 1 } });
  assert.equal(visibleValue(hiddenPacket, 'packet_state'), 'unresolved');
  assert.equal(visibleValue(hiddenPacket, 'seal_state'), 'unresolved');
  assert.deepEqual(detectHiddenLeaks(hiddenPacket), []);

  const observed = projectPlayerSafeCompletionOutcome({ epilogueRules,
    completionRules, completionOutcome: outcome,
    visibleCommittedFacts: ['sealed_packet_returned', 'seal_intact',
      'temporary_disposition_outcome_committed'], elapsedGameTime:
      { whole_minutes: 90, subminute_numerator: 0,
        subminute_denominator: 1 } });
  assert.equal(visibleValue(observed, 'packet_state'), 'returned');
  assert.equal(visibleValue(observed, 'seal_state'), 'intact');
  assert.equal(Object.hasOwn(observed, 'objective_completion_outcome'), false);
  assert.throws(() => projectPlayerSafeCompletionOutcome({ epilogueRules,
    completionRules, completionOutcome: outcome,
    visibleCommittedFacts: ['sealed_packet_returned'],
    elapsedGameTime: { whole_minutes: 90, subminute_numerator: 0,
      subminute_denominator: 1 }, visibleDetails: {
      visible_temporary_disposition: { hidden_motive: 'must-not-pass' }
    } }), (error) => error.code === 'EPILOGUE_HIDDEN_FIELD_REJECTED');
});

function inputs(facts) {
  return facts.map((factId) => {
    const producer = [
      ...completionRules.completion_fact_provenance.internal_producers,
      ...completionRules.completion_fact_provenance.external_committed_sources
    ].find(({ fact_ids: ids }) => ids.includes(factId));
    return { input_class: inputClass(factId), fact_id: factId,
      producer_kind: producer.producer_kind ?? producer.source_kind,
      producer_ref: producer.producer_ref ?? producer.source_ref,
      source_commit_version: 17 };
  });
}
function inputClass(factId) {
  if (factId.startsWith('conclusion:') || factId.startsWith('partial_outcome:'))
    return 'committed_evidence_resolution_outcome';
  if (factId.startsWith('promise_')) return 'committed_promise_state';
  if (factId.startsWith('temporary_disposition_'))
    return 'committed_typed_temporary_disposition';
  return 'committed_objective_fact';
}
function value(outcome, dimensionId) {
  return outcome.ordered_dimension_outcomes.find(
    ({ dimension_id: id }) => id === dimensionId).value_id;
}
function visibleValue(projection, dimensionId) {
  return projection.visible_completion_dimensions.find(
    ({ dimension_id: id }) => id === dimensionId).value_id;
}
