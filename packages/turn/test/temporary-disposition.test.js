import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { commitTemporaryDispositionSelection,
  resolveTemporaryDispositionOptions, TemporaryDispositionError } from
  '../src/index.js';

const profiles = JSON.parse(await readFile(new URL(
  '../../../data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-3-content/activity-check-consequence-profiles.json',
  import.meta.url), 'utf8'));
const contract = profiles.temporary_disposition_contracts[0];
const eligibility = Object.freeze({ committed_fact_ids: [
  'ratsha_surrender_without_further_harm_committed',
  'zhdanko_submission_committed', 'sealed_packet_returned',
  'promise_current_active'], committed_actor_predicates: [
    'ratsha_storehouse_helper:at_fishing_camp',
    'ratsha_storehouse_helper:not_in_temporary_custody'],
committed_witness_slots: ['eremey_fisher',
  'trace_ld_v1_audience_slot_participating_fisher'],
committed_property_owner_ref: 'trace_ld_v1_external_owner_savva_tverdich' });

test('turn owner exposes all eligible options and commits only raw-intent selection',
  () => {
    const optionSet = resolveTemporaryDispositionOptions({ ...eligibility,
      contract });
    assert.deepEqual(optionSet.eligible_option_ids.promise, [
      'preserve_active_no_summary_killing_promise',
      'commit_scope_breach_for_active_promise']);
    const proposal = commitTemporaryDispositionSelection({ contract,
      option_set: optionSet, selected_option_refs: [
        'hold_ratsha_and_zhdanko_for_authorized_handover',
        'preserve_recovered_property_for_savva_handover',
        'preserve_active_no_summary_killing_promise'] });
    assert.deepEqual(proposal.selected_option_ids, {
      custody: 'hold_ratsha_and_zhdanko_for_authorized_handover',
      property: 'preserve_recovered_property_for_savva_handover',
      promise: 'preserve_active_no_summary_killing_promise' });
    assert.equal(proposal.legal_effect, 'temporary_disposition_only');
  });

test('turn owner rejects omitted, multiple and ineligible selections', () => {
  const optionSet = resolveTemporaryDispositionOptions({ ...eligibility,
    contract });
  for (const selected of [[
    'hold_ratsha_and_zhdanko_for_authorized_handover',
    'preserve_recovered_property_for_savva_handover'], [
    'hold_ratsha_and_zhdanko_for_authorized_handover',
    'preserve_recovered_property_for_savva_handover',
    'preserve_active_no_summary_killing_promise',
    'commit_scope_breach_for_active_promise'], [
    'hold_ratsha_zhdanko_absent',
    'preserve_recovered_property_for_savva_handover',
    'preserve_active_no_summary_killing_promise']]) {
    assert.throws(() => commitTemporaryDispositionSelection({ contract,
      option_set: optionSet, selected_option_refs: selected }),
    (error) => error instanceof TemporaryDispositionError);
  }
});
