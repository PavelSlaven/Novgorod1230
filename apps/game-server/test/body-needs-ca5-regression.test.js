import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { accumulateBodyTimeEffects } from '@rus/body-state';
import { canonicalDigest } from '@rus/materialization';
import { loadTargetBodyNeedsProfile } from '../src/internal/target-runtime-profiles.js';
import { createBodyNeedsTemporalAdapter } from '../src/runtime/body-needs-temporal.js';
import { createLowerDvinaTraceTurnStepGenericOwners } from
  '../src/runtime/lower-dvina-trace-turn-step-generic-owners.js';
import { validateBodyComponentOrder } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-body-commit-validation.js';
import { prepareTurnStepBodyHistory } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-body-history.js';
import { assertTurnStepBodyHistoryRows } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-body-read.js';

// D102 / BNB5-01: real approved owners; the SQL port supplies explicit rows.
// Guard, history and readback run independently, without a prepared-ledger gate.
const rootDir = fileURLToPath(new URL('../../../', import.meta.url));
const at = (minutes) => ({ whole_minutes: String(minutes),
  subminute_numerator: '0', subminute_denominator: '1' });
const exactElapsed = { numerator: '1', denominator: '1' };

test('BNB5-01: omitted fixed effect is rejected despite consistent scalar and history', async (t) => {
  const bundle = await approvedBundle();
  const fixture = ownerFixture(bundle, 'extreme');
  assert.equal(fixture.factual.body_update.state_after.health, 99);
  const authenticHistory = history(bundle, fixture);
  const forged = structuredClone(fixture);
  forged.factual.body_update.proposal.fixed_effect_proposals = [];
  const replay = accumulateBodyTimeEffects({ body_state_before: forged.state.body_state,
    slices: [{ exact_elapsed: exactElapsed, fixed_effect_proposals: [],
      component_proposals: forged.factual.body_update.proposal.component_proposals }] });
  assert.equal(replay.ok, true);
  forged.factual.body_update.state_after = structuredClone(replay.state_after);
  forged.factual.body_update.proposal.exact_changes = structuredClone(replay.exact_changes);
  assert.equal(forged.factual.body_update.state_after.health, 100);
  assert.equal(forged.factual.consequence.state_changes.length, 1);

  // Build the forged persisted row from a valid record, without asking the
  // history validator to approve it before the independent readback assertion.
  const forgedHistory = omittedFixedHistory(authenticHistory, forged.factual);
  await t.test('body commit guard rejects the missing proposal', () => {
    assert.throws(() => guard(bundle, forged), {
      code: 'TRACE_TURN_STEP_BODY_EVENT_RECONCILIATION_FAILED'
    });
  });
  await t.test('history writer rejects the missing proposal', () => {
    assert.throws(() => history(bundle, forged), {
      code: 'TRACE_TURN_STEP_BODY_HISTORY_RECONCILIATION_FAILED'
    });
  });
  await t.test('readback rejects independently consistent persisted rows', async () => {
    await assert.rejects(() => readback(bundle, forged, forgedHistory), {
      code: 'TRACE_PHASE_2_SESSION_READ_INVALID'
    });
  });
});

test('BNB5-01: authentic extreme fixed effect is accepted with health 99', async (t) => {
  const bundle = await approvedBundle();
  const fixture = ownerFixture(bundle, 'extreme');
  assert.equal(fixture.factual.body_update.state_after.health, 99);
  assert.equal(fixture.factual.body_update.proposal.fixed_effect_proposals[0]
    .exact_deltas.health, -1);
  await acceptedByEachBoundary(t, bundle, fixture);
});

test('BNB5-01: genuine zero fixed effect is accepted and retained', async (t) => {
  const bundle = await approvedBundle();
  const fixture = ownerFixture(bundle, 'none');
  assert.deepEqual(fixture.factual.body_update.proposal.fixed_effect_proposals[0]
    .exact_deltas, { health: 0, satiety: 0, energy: 0 });
  assert.equal(fixture.factual.body_update.state_after.health, 100);
  assert.ok(fixture.factual.body_update.state_after.satiety < 70);
  assert.ok(fixture.factual.body_update.state_after.energy < 80);
  const record = history(bundle, fixture);
  assert.ok(record.effect_ref.component_effects[0].fixed_effect,
    'a genuine zero proposal remains a covered component in history');
  await acceptedByEachBoundary(t, bundle, fixture);
});

async function approvedBundle() {
  const profile = await loadTargetBodyNeedsProfile({ rootDir,
    worldRevisionId: 'novgorod_spatial_v3_target_contract_approval_001' });
  assert.equal(profile.approved, true);
  const adapter = createBodyNeedsTemporalAdapter({ body_needs_profile: profile });
  const catalog = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/live-world-runtime-v17/target-runtime-profiles-approved.json',
    import.meta.url), 'utf8'));
  const profiles = catalog.profiles.turn_step;
  const pin = { artifact_id: profiles.profile_set_id, revision: profiles.revision,
    digest: canonicalDigest(profiles) };
  const owners = createLowerDvinaTraceTurnStepGenericOwners({ profiles,
    artifactPin: pin, selectedProfilePin: pin, bodyTimeEffectAdapter: adapter });
  return { profile, adapter, owners };
}

function ownerFixture(bundle, effort) {
  const state = { party_id: 'party:ca5', actor_id: 'actor:ca5', clock: at(0),
    party_state: { state_version: 1, turn_number: 1 },
    body_state: { health: 100, satiety: 70, energy: 80, active_conditions: [] },
    environment_snapshot: { schema: 'rus.approved_initial_environment.v1', version: 1,
      season: 'summer', light_state: 'daylight', weather_state: { weather_state_id: 'clear' } },
    npcs: [] };
  const activity = { owner: 'semantic', duration_class: 'moment', effort,
    requested_duration_minutes: 1 };
  const selected = bundle.owners.semanticActivityOwner.resolve({ activity,
    actor: { body: state.body_state } });
  const component = { kind: 'semantic_activity', activity_id: 'activity:ca5',
    profile_ref: selected.profile_ref, profile_pin: selected.profile_pin,
    duration_class: 'moment', effort, body_effect_profile_ref: selected.body_effect_profile_ref,
    body_effect_context: { kind: 'semantic_activity', duration_class: 'moment', effort } };
  const consequence = { body_effect_ref: selected.body_effect_ref,
    duration_minutes: 1, state_changes: [component] };
  const timeUpdate = { version: 2, schema: 'turn_time_update', owner: '@rus/time-events-history',
    clock_before: at(0), clock_after: at(1),
    exact_elapsed: { exact_minutes: exactElapsed }, nearest_boundary: null };
  const update = bundle.owners.bodyEffect.apply({ committed_state: state,
    consequence, time_update: timeUpdate });
  assert.equal(update.applied, true);
  assert.equal(update.proposal.fixed_effect_proposals.length, 1);
  const batch = { root_turn_id: 'turn:ca5', committed_state_version: 1,
    operations: [{ target: 'party_events', value: { ...component,
      step_index: 1, duration_minutes: 1 } }] };
  const factual = { root_turn_id: batch.root_turn_id, base_state_version: 1,
    consequence, time_update: timeUpdate,
    body_update: { version: 1, schema: 'turn_body_update', ...update } };
  return { state, batch, factual };
}

function guard(bundle, fixture) {
  return validateBodyComponentOrder(fixture.batch, fixture.factual, fixture.state,
    bundle.adapter.trustedBindingPin, bundle.profile);
}

function history(bundle, fixture) {
  return prepareTurnStepBodyHistory({ partyId: fixture.state.party_id,
    ...fixture, changeSetId: 'change:ca5', idemId: 'idem:ca5',
    trustedBodyNeedsBindingPin: bundle.adapter.trustedBindingPin,
    trustedBodyNeedsProfile: bundle.profile }).snapshot;
}

async function acceptedByEachBoundary(t, bundle, fixture) {
  await t.test('body commit guard accepts', () => {
    assert.doesNotThrow(() => guard(bundle, fixture));
  });
  let record;
  await t.test('history writer accepts', () => {
    assert.doesNotThrow(() => { record = history(bundle, fixture); });
  });
  await t.test('readback accepts', async () => {
    await assert.doesNotReject(() => readback(bundle, fixture, record));
  });
}

function omittedFixedHistory(original, factual) {
  const record = structuredClone(original);
  const proposal = factual.body_update.proposal;
  record.effect_ref.proposal_digest = canonicalDigest(proposal);
  record.effect_ref.exact_changes_digest = canonicalDigest(proposal.exact_changes);
  record.effect_ref.state_after_digest = canonicalDigest(factual.body_update.state_after);
  record.effect_ref.profile_pins = [...new Map(proposal.component_proposals.map(
    ({ profile_pin }) => [canonicalDigest(profile_pin), profile_pin])).values()];
  record.effect_ref.component_effects[0].fixed_effect = null;
  return record;
}

async function readback(bundle, { state, batch, factual }, record) {
  const body = factual.body_update.state_after;
  const payload = { party_id: state.party_id, actor_id: state.actor_id,
    party_state: { state_version: 2, body_state_version: 2 }, body_state: body,
    turn_step_body_history: [record], last_turn: { turn_step_commit: factual,
      turn_step_operation_batch: batch, turn_step_idempotency_record_id: 'idem:ca5',
      visible_package: { change_set_id: 'change:ca5' } } };
  const head = { body_state_version: '2', body_health: String(body.health),
    body_energy: String(body.energy), body_satiety: String(body.satiety),
    body_updated_change_set_id: 'change:ca5' };
  const pool = { async query(sql, args) {
    if (sql.includes('party_body_temporal_history')) {
      assert.deepEqual(args, [[record.history_id]]);
      return { rows: [structuredClone(record)] };
    }
    if (sql.includes('party_state_snapshots')) {
      assert.deepEqual(args, [state.party_id, factual.base_state_version]);
      return { rows: [{ state_version: '1', state_payload: structuredClone(state),
        state_digest: canonicalDigest(state) }] };
    }
    throw new Error('unexpected readback SQL');
  } };
  return assertTurnStepBodyHistoryRows(pool, payload, head,
    bundle.adapter.trustedBindingPin, bundle.profile);
}
