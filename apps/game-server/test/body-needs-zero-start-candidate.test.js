import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { canonicalDigest } from '@rus/materialization';
import { loadTargetBodyNeedsProfile } from '../src/internal/target-runtime-profiles.js';
import { createBodyNeedsTemporalAdapter } from '../src/runtime/body-needs-temporal.js';
import { createTracePhase2TemporalAdvance } from
  '../src/runtime/lower-dvina-trace-phase-2-temporal.js';

const rootDir = fileURLToPath(new URL('../../../', import.meta.url));
const worldRevisionId = 'novgorod_spatial_v3_target_contract_approval_001';
const at = (minutes) => ({ whole_minutes: String(minutes),
  subminute_numerator: '0', subminute_denominator: '1' });

test('phase 2 binds an already-critical zero candidate at the window start', async () => {
  const profile = await loadTargetBodyNeedsProfile({ rootDir, worldRevisionId });
  const adapter = createBodyNeedsTemporalAdapter({ body_needs_profile: profile });
  let observed;
  const advance = createTracePhase2TemporalAdvance({
    contracts: { activity: { nearest_temporal_boundary_rule:
      'split_before_earliest_boundary' } },
    bodyTimeEffectAdapter: adapter,
    temporalAdvanceOwner: { advance(input) {
      observed = input;
      return { result: { clock_after: at(3024),
        trace: { stopped_after_current_batch: true, processed_boundary_ids: [] },
        combined_change_set: { proposals: [] } } };
    } }
  });
  const state = {
    party_id: 'party-zero-start', actor_id: 'actor-zero-start',
    party_state: { state_version: 1, turn_number: 1 }, clock: at(3024),
    body_state: { health: 100, satiety: 80, energy: 0, active_conditions: [] },
    environment_snapshot: { schema: 'rus.approved_initial_environment.v1', version: 1,
      season: 'summer', light_state: 'daylight',
      weather_state: { weather_state_id: 'clear' } },
    temporal_boundary_candidates: [], npc_schedule_runtime: [], local_fire_runtime: [],
    temporal_source_proof: { schema: 'lower_dvina_trace_temporal_source_proof', version: 2,
      owner: '@rus/time-events-history/temporal-boundaries',
      same_time_cascade_owner: '@rus/time-events-history/temporal-boundaries:resolveSameTimeCascade',
      pending_event_count: 0, active_schedule_count: 0, candidate_count: 0,
      candidates: [], admission_policy: 'pass_exact_candidates_to_temporal_activity_owner' }
  };

  await advance({ clock_before: state.clock, exact_elapsed: { exact_minutes:
    { numerator: '60', denominator: '1' } }, effect_kind: 'semantic_activity',
  consequence: { state_changes: [{ kind: 'semantic_activity',
    activity_id: 'activity:zero-start', effort: 'none' }] }, relevant_state: state });

  assert.ok(observed, 'phase 2 must submit the zero-start candidate to the temporal owner');
  const candidate = observed.source_candidates.find(({ boundary_kind }) =>
    boundary_kind === 'body_threshold');
  assert.ok(candidate, 'the body adapter must provide a source candidate');
  assert.deepEqual(candidate.scheduled_at, state.clock);
  assert.equal(candidate.boundary_id, 'body-threshold:actor-zero-start:energy-0');
  assert.deepEqual(candidate.primary_subject_ref,
    { entity_kind: 'body_state', entity_id: state.actor_id });
  assert.deepEqual(candidate.scope_ref,
    { entity_kind: 'party', entity_id: state.party_id });
  assert.deepEqual(candidate.source_ref,
    { entity_kind: 'source_record',
      entity_id: profile.profiles.energy_awake_spend_v2.record_id });
  assert.deepEqual(candidate.rule_ref.entity_ref,
    { entity_kind: 'body_effect', entity_id: 'energy_awake_spend_v2' });
  assert.equal(candidate.rule_ref.authoring_version,
    String(profile.profiles.energy_awake_spend_v2.version));
  assert.deepEqual(candidate.policy_ref.entity_ref,
    { entity_kind: 'condition_set',
      entity_id: 'energy_awake_spend_v2:threshold-boundary' });
  assert.deepEqual(candidate.subject_refs, [candidate.primary_subject_ref]);
  assert.deepEqual(candidate.causal_parent_refs, []);

  const projection = observed.request.relevant_state_projection;
  const descriptors = projection.body_threshold_descriptors;
  assert.equal(descriptors.length, 1);
  assert.deepEqual(descriptors[0], {
    candidate_digest: canonicalDigest(candidate),
    boundary_id: candidate.boundary_id, metric: 'energy',
    threshold_value: { numerator: '0', denominator: '1' }, critical: true
  });
});
