import assert from 'node:assert/strict';
import test from 'node:test';
import { selectTemporaryDispositionOptions,
  TemporaryDispositionSelectionError } from '../src/index.js';

const optionSet = Object.freeze({ schema: 'temporary_disposition_option_set_v1',
  contract_ref: 'trace_ld_v1_temporary_disposition_contract',
  contract_revision: 1,
  selection_source: 'raw_intent_to_closed_exact_option_id_per_dimension',
  eligible_option_ids: { custody: ['hold-both'],
    property: ['preserve-property'],
    promise: ['preserve-promise', 'record-breach'] } });

test('turn owner selects exactly one admitted option per dimension', () => {
  const selection = selectTemporaryDispositionOptions({ option_set: optionSet,
    selected_option_refs: ['hold-both', 'preserve-property',
      'preserve-promise'] });
  assert.deepEqual(selection.selected_option_ids, { custody: 'hold-both',
    property: 'preserve-property', promise: 'preserve-promise' });
});

test('turn owner rejects omitted, multiple and ineligible selections', () => {
  for (const selected of [['hold-both', 'preserve-property'],
    ['hold-both', 'preserve-property', 'preserve-promise', 'record-breach'],
    ['not-admitted', 'preserve-property', 'preserve-promise']]) {
    assert.throws(() => selectTemporaryDispositionOptions({
      option_set: optionSet, selected_option_refs: selected }),
    (error) => error instanceof TemporaryDispositionSelectionError);
  }
});
