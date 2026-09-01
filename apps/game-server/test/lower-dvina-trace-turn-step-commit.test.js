import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  authoredItemPlacementSourceProof,
  createRuntimeInstanceMechanicsSnapshot
} from '@rus/items-property';
import { createSeededRandomSource } from '@rus/checks-rng';
import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import {
  createTurnStepExecutionRegistry,
  runTurnStepLoop
} from '@rus/turn';
import {
  commitLowerDvinaTracePhase2
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-2-commit.js';
import {
  assertCommittedTurnStepChecks
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-2-replay.js';
import {
  createLowerDvinaTraceTurnStepGenericOwners
} from '../src/runtime/lower-dvina-trace-turn-step-generic-owners.js';
import {
  bindCommitEnvelopeToBatch,
  commitEnvelope
} from './lower-dvina-trace-turn-step-envelope-fixture.js';

test('direct-only semantic turn commits one P16 root with snapshot and pending presentation',
  async () => {
    const f = fixture({ direct: true });
    const committed = await f.commit();

    assert.equal(committed.state_version, 4);
    assert.equal(f.plans.length, 1);
    const plan = f.plans[0];
    assert.equal(plan.schema, 'spatial_v3.combined_write_plan.v2');
    assert.equal(plan.operation_kind, 'trace_turn_step');
    assert.equal(plan.idempotency_key, 'idem-key');
    assert.equal(plan.request_id, 'request-1');
    assert.equal(plan.updates.some(({ target_table: table }) =>
      table === 'party_clocks'), true);
    assert.equal(plan.updates.some(({ target_table: table }) =>
      table === 'party_actor_body_states'), false);
    assert.equal(plan.inserts.filter(({ target_table: table }) =>
      table === 'party_state_snapshots').length, 1);
    assert.equal(plan.inserts.filter(({ target_table: table }) =>
      table === 'party_items').length, 1);
    assert.equal(plan.appends.filter(({ target_table: table }) =>
      table === 'party_v3_change_sets').length, 1);
    assert.equal(plan.appends.filter(({ target_table: table }) =>
      table === 'party_visible_packages').length, 1);
    assert.equal(plan.inserts.filter(({ target_table: table }) =>
      table === 'party_narration_jobs').length, 1);
    const snapshot = plan.inserts.find(({ target_table: table }) =>
      table === 'party_state_snapshots').record.state_payload;
    assert.equal(snapshot.schema, 'rus.lower_dvina_trace_turn_snapshot.v2');
    assert.equal(snapshot.last_turn.turn_step_commit.player_input.raw_text,
      'беру песок');
    assert.equal(snapshot.last_turn.turn_step_operation_batch.operations.length,
      2);
    const session = plan.updates.find(({ target_table: table }) =>
      table === 'party_server_sessions').record;
    assert.equal(session.screen.screen_status,
      'committed_presentation_pending');
  });

test('semantic activity commits owner-mapped temporal writes in the same P16 root',
  async () => {
    const write = {
      target_schema: 'party_runtime',
      target_table: 'party_perception_records',
      id: 'perception:elapsed',
      record: { perception_id: 'perception:elapsed', party_id: 'p' }
    };
    const proposal = sealTemporal({ proposal_id: 'elapsed:perception',
      write_target: 'perception:elapsed', write_set: {
        appends: [write], inserts: [], updates: [], deletes: []
      }, expected_state_versions: [],
      physical_keys: ['party_runtime.party_perception_records:perception:elapsed'] });
    const f = fixture({ direct: true, temporalResults: [sealTemporal({
      combined_change_set: { proposals: [proposal] }
    })] });

    await f.commit();

    assert.equal(f.plans[0].appends.some(({ target_table: table, id }) =>
      table === 'party_perception_records' && id === 'perception:elapsed'), true);
  });

test('authored placement move seals parent item with its P16 child row',
  async () => {
    const f = fixture({ authoredMove: true });
    await f.commit();
    const plan = f.plans[0];
    const updated = plan.updates.map(({ target_table: table, id }) =>
      `${table}:${id}`);
    assert.equal(updated.includes('party_items:authored-item'), true);
    assert.equal(updated.includes('party_item_placements:authored-item'), true);
    const parent = plan.updates.find(({ target_table: table }) =>
      table === 'party_items').record;
    assert.deepEqual(['template_id', 'profile_id'].map((key) =>
      Object.hasOwn(parent, key)), [false, false]);
  });

test('clarification commits identity and presentation with zero mechanics writes',
  async () => {
    const f = fixture({ clarification: true });
    await f.commit();
    const plan = f.plans[0];
    assert.deepEqual(plan.expected_state_versions.map(
      ({ target_table: table }) => table).sort(), [
      'parties', 'party_server_sessions'
    ]);
    assert.equal(plan.inserts.some(({ target_table: table }) =>
      table === 'party_items'), false);
    assert.equal(plan.appends.some(({ target_table: table }) =>
      table === 'party_check_resolutions'), false);
    const snapshot = plan.inserts.find(({ target_table: table }) =>
      table === 'party_state_snapshots').record.state_payload;
    assert.deepEqual(snapshot.last_turn.player_visible_message, {
      question: 'Что именно взять?', target_refs: ['shore']
    });
    assert.equal(snapshot.party_state.clock_state_version, 2);
    assert.equal(snapshot.party_state.body_state_version, 5);
  });

test('zero-batch semantic commits fail closed on missing direct operations and forged state',
  async (t) => {
    await t.test('direct draft without its operation batch', async () => {
      const f = fixture({});
      await assert.rejects(() => f.commit(), {
        code: 'TRACE_TURN_STEP_DIRECT_COMMIT_CONTRACT_GAP'
      });
      assert.equal(f.plans.length, 0);
    });

    await t.test('domain-only clock detached from persisted state', async () => {
      const envelope = commitEnvelope({ clarification: false, check: false });
      markDomainOnly(envelope);
      envelope.time_update.clock_after.whole_minutes = '999';
      const f = fixture({ envelopeOverride: envelope });
      await assert.rejects(() => f.commit(), {
        code: 'TRACE_TURN_STEP_DIRECT_COMMIT_CONTRACT_GAP'
      });
      assert.equal(f.plans.length, 0);
    });

    await t.test('domain-only internally consistent forged clock', async () => {
      const envelope = commitEnvelope({ clarification: false, check: false });
      markDomainOnly(envelope);
      envelope.consequence.duration_minutes = 5;
      envelope.time_update.clock_after.whole_minutes = '15';
      envelope.time_update.exact_elapsed.exact_minutes.numerator = '5';
      const f = fixture({ envelopeOverride: envelope });
      await assert.rejects(() => f.commit(), {
        code: 'TRACE_TURN_STEP_DIRECT_COMMIT_CONTRACT_GAP'
      });
      assert.equal(f.plans.length, 0);
    });

    await t.test('domain-only body detached from persisted state', async () => {
      const envelope = commitEnvelope({ clarification: false, check: false });
      markDomainOnly(envelope);
      envelope.body_update = {
        version: 1,
        schema: 'turn_body_update',
        owner: '@rus/body-state',
        applied: true,
        proposal: {
          exact_deltas: { health: -1, satiety: 0, energy: 0 }
        },
        state_after: { ...body(), health: 99 }
      };
      const f = fixture({ envelopeOverride: envelope });
      await assert.rejects(() => f.commit(), {
        code: 'TRACE_TURN_STEP_DIRECT_COMMIT_CONTRACT_GAP'
      });
      assert.equal(f.plans.length, 0);
    });

    await t.test('registered domain-only command with exact unchanged state',
      async () => {
        const envelope = commitEnvelope({ clarification: false, check: false });
        markDomainOnly(envelope);
        const f = fixture({ envelopeOverride: envelope });
        await f.commit();
        assert.equal(f.plans.length, 1);
      });
  });

test('composite body proposal is bound to its ordered code-owned components',
  async (t) => {
    const cases = [
      ['extra field', (proposal) => { proposal.forged = true; }],
      ['profile revision', (proposal) => { proposal.profile_pin.revision += 1; }],
      ['profile digest', (proposal) => { proposal.profile_pin.digest = 'f'.repeat(64); }],
      ['exact delta', (proposal) => { proposal.exact_deltas.health -= 1; }],
      ['component context', (proposal) => {
        proposal.component_proposals[0].selected_context.severity = 'major';
      }]
    ];
    for (const [name, tamper] of cases) {
      await t.test(name, async () => {
        const f = fixture({ bodyEvent: true });
        tamper(f.envelope.body_update.proposal);
        await assert.rejects(() => f.commit(), {
          code: 'TRACE_TURN_STEP_BODY_EVENT_RECONCILIATION_FAILED'
        });
        assert.equal(f.plans.length, 0);
      });
    }
  });

test('generic check is normalized once and replay cross-checks the same RNG row',
  async () => {
    const f = fixture({ direct: true, check: true });
    await f.commit();
    const plan = f.plans[0];
    const check = plan.appends.find(({ target_table: table }) =>
      table === 'party_check_resolutions');
    assert.equal(check.record.roll_value, 17);
    assert.equal(check.record.modifier_snapshot.attribute, 2);
    assert.equal(check.record.check_policy_ref.entity_id,
      'trace_ld_v1_generic_check_modifiers_v1');
    assert.equal(check.record.check_scope_key.idempotency_record_id,
      plan.idempotency_record_id);
    const payload = plan.inserts.find(({ target_table: table }) =>
      table === 'party_state_snapshots').record.state_payload;
    let queries = 0;
    await assertCommittedTurnStepChecks({
      partyPool: { async query() {
        queries += 1;
        const { party_id: _partyId, ...row } = check.record;
        return { rowCount: 1, rows: [row] };
      } },
      payload,
      changeSetId: plan.change_set_id,
      idempotencyRecordId: plan.idempotency_record_id
    });
    assert.equal(queries, 1);
  });

test('production owner policy identity reaches loop, envelope and normalized row',
  async () => {
    const owners = await productionOwners();
    const loop = await runTurnStepLoop({
      requestId: 'request-1', rootTurnId: 'turn:p:1',
      committedStateVersion: 3, rootPlayerAction: 'держу равновесие',
      actor: { actor_id: 'actor-1', attributes: {
        strength: { value: 12 } }, skills: {}, body: body() },
      initialWorkingProjection: { actor_id: 'actor-1',
        inventory: { load_category: 'light' } }
    }, {
      turnStepModel: async (request) => genericPlan(request),
      projectPlayerSafeState: async ({ working_projection: projection }) =>
        projection,
      revalidateCommittedState: async () => ({ state_version: 3 }),
      randomSource: createSeededRandomSource('approved-policy-route'),
      resolveCheckContext: async (context) =>
        owners.genericCheckContextOwner.resolve(context),
      executionRegistry: createTurnStepExecutionRegistry({
        applySemanticActivity: async ({ working_projection: projection }) => ({
          working_projection: projection, summary: 'проверка завершена',
          write_fragments: []
        })
      })
    });
    const envelope = envelopeFromLoop(loop);
    const f = fixture({ envelopeOverride: envelope });
    await f.commit();
    const row = f.plans[0].appends.find(({ target_table: table }) =>
      table === 'party_check_resolutions').record;
    assert.equal(loop.check_requests[0].check_policy_ref.entity_id,
      'trace_ld_v1_generic_check_modifiers_v1');
    assert.equal(envelope.checks.requests[0].consequence_policy_ref.entity_id,
      'trace_ld_v1_generic_check_five_band_v1');
    assert.equal(row.check_policy_ref.entity_id,
      'trace_ld_v1_generic_check_modifiers_v1');
    assert.equal(row.consequence_policy_ref.entity_id,
      'trace_ld_v1_generic_check_five_band_v1');
  });

test('player-response boundary persists exact compound remaining intent',
  async () => {
    const envelope = commitEnvelope({ clarification: false, check: false });
    envelope.mode_resolution.decision_trace.stop_reason = 'player_response';
    Object.assign(envelope.loop_trace, {
      status: 'player_response_required', stop_reason: 'player_response',
      remaining_intent: 'взять ткань и идти'
    });
    const f = fixture({ envelopeOverride: envelope });
    await f.commit();
    const snapshot = f.plans[0].inserts.find(({ target_table: table }) =>
      table === 'party_state_snapshots').record.state_payload;
    assert.equal(
      snapshot.last_turn.turn_step_commit.loop_trace.remaining_intent,
      'взять ткань и идти'
    );
  });

test('stale semantic base fails before P16 commit', async () => {
  const f = fixture({ direct: true });
  f.state.party_state.state_version = 4;
  await assert.rejects(() => f.commit(), {
    code: 'TRACE_TURN_STEP_STATE_STALE'
  });
  assert.equal(f.plans.length, 0);
});

test('forged check math, duplicate identities and loop progress fail pre-P16',
  async (t) => {
    const cases = [
      ['check math', (envelope) => {
        envelope.checks.results[0].total += 1;
      }],
      ['duplicate check', (envelope) => {
        envelope.checks.requests.push(structuredClone(
          envelope.checks.requests[0]));
        envelope.checks.results.push(structuredClone(
          envelope.checks.results[0]));
        envelope.loop_trace.check_results = structuredClone(
          envelope.checks.results);
      }],
      ['loop progress', (envelope) => {
        envelope.loop_trace.next_step_index = 8;
      }]
    ];
    for (const [name, tamper] of cases) {
      await t.test(name, async () => {
        const f = fixture({ direct: true, check: true });
        tamper(f.envelope);
        await assert.rejects(() => f.commit(), {
          code: 'TRACE_TURN_STEP_COMMIT_ENVELOPE_INVALID'
        });
        assert.equal(f.plans.length, 0);
      });
    }
  });

test('operation batch exactly covers approved physical plan fragments',
  async (t) => {
    await t.test('forged extra item fragment', async () => {
      const f = fixture({ direct: true });
      for (const trace of [f.envelope.loop_trace.step_traces[0],
        f.envelope.mode_resolution.decision_trace.step_traces[0]]) {
        trace.approved_plan.operations = [];
      }
      await assert.rejects(() => f.commit(), {
        code: 'TRACE_TURN_STEP_OPERATION_PLAN_MISMATCH'
      });
    });
    await t.test('approved item fragment omitted', async () => {
      const f = fixture({ direct: true });
      f.batch.value.operations.shift();
      await assert.rejects(() => f.commit(), {
        code: 'TRACE_TURN_STEP_OPERATION_PLAN_MISMATCH'
      });
    });
    await t.test('extra semantic activity fragment', async () => {
      const f = fixture({ direct: true });
      const extra = structuredClone(semanticActivity());
      extra.value.activity_id = 'activity-extra';
      f.batch.value.operations.push(extra);
      await assert.rejects(() => f.commit(), {
        code: 'TRACE_TURN_STEP_OPERATION_PLAN_MISMATCH'
      });
      assert.equal(f.plans.length, 0);
    });
  });

function fixture({ direct = false, clarification = false, check = false,
  bodyEvent = false, authoredMove = false, envelopeOverride = null,
  temporalResults = [] }) {
  const state = baseState();
  if (authoredMove) state.items.push(authoredItem());
  const envelope = envelopeOverride ?? commitEnvelope({ clarification, check });
  if (temporalResults.length > 0) {
    envelope.time_update.temporal_results = structuredClone(temporalResults);
  }
  if (authoredMove) {
    envelope.loop_trace.step_traces[0].plan_request.player_safe_state
      .visible_entities.push({ entity_ref: 'authored-item' });
  }
  const writeTargets = [];
  if (direct) writeTargets.push(operationBatch());
  if (bodyEvent) writeTargets.push(bodyOperationBatch(envelope));
  if (authoredMove) writeTargets.push(authoredMoveBatch(state.items[0]));
  const batch = writeTargets.find(
    ({ target }) => target === 'party_turn_step_operations');
  if (batch) bindCommitEnvelopeToBatch(envelope, batch);
  if (clarification) writeTargets.push({
    target: 'party_player_visible_message',
    value: { clarification: envelope.loop_trace.clarification }
  });
  const writePlan = {
    version: 2,
    schema: 'party_turn_write_plan',
    sealed_by: 'turn_code_planner_v2',
    party_id: 'p',
    turn_id: 'turn:p:1',
    base_state_version: 3,
    write_targets: writeTargets,
    command_trace: envelope.mode_resolution.decision_trace,
    turn_step_commit: envelope
  };
  const inputDigest = canonicalDigest({
    party_id: 'p', request_id: 'request-1',
    idempotency_key: 'idem-key', raw_text: 'беру песок'
  });
  const plans = [];
  return {
    state, envelope, batch,
    plans,
    commit: () => commitLowerDvinaTracePhase2({
      partyId: 'p', writePlan, inputDigest,
      contracts: {}, phase3Contracts: null, phase4Contracts: null,
      phase5Contracts: null, phase6Contracts: null,
      loadState: async () => structuredClone(state),
      committer: { async commit({ plan }) {
        plans.push(plan);
        return { ok: true, replay: false, change_set_id: plan.change_set_id };
      } }
    })
  };
}

function sealTemporal(value) {
  return { ...value, canonical_digest: computeSpatialV3CanonicalDigest(value) };
}

function markDomainOnly(envelope) {
  envelope.mode_resolution.decision_trace.selected_option_id =
    'registered-domain-option';
}

function genericPlan(request) {
  const outcome = {
    goal_result: 'achieved', additional_activity: null,
    operations: [], continuation: null
  };
  return {
    schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, step_index: request.step_index,
    interpretation: { player_goal: request.remaining_intent,
      grounded_attempt: request.remaining_intent, adaptation: 'literal' },
    resolution: 'generic_check', goal_result: 'pending',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    operations: [], check: { purpose: 'удержать равновесие',
      attribute_ref: 'strength', skill_ref: null, difficulty_id: 'risky',
      outcomes: Object.fromEntries([
        'clean_success', 'success', 'success_with_cost',
        'failure_with_consequence', 'severe_failure'
      ].map((band) => [band, outcome])) },
    continuation: null, clarification: null,
    reason_code: 'generic_check', reason: 'production policy route test'
  };
}

function envelopeFromLoop(loop) {
  const envelope = commitEnvelope({ clarification: false, check: false });
  envelope.checks.requests = structuredClone(loop.check_requests);
  envelope.checks.results = structuredClone(loop.check_results);
  Object.assign(envelope.mode_resolution.decision_trace, {
    working_revision: loop.working_revision,
    step_count: loop.step_traces.length,
    stop_reason: loop.stop_reason,
    step_traces: structuredClone(loop.step_traces)
  });
  envelope.loop_trace = {
    version: 1, schema: 'turn_step_commit_trace_v1',
    root_turn_id: loop.root_turn_id, request_id: 'request-1',
    committed_state_version: loop.committed_state_version,
    status: loop.status, stop_reason: loop.stop_reason,
    working_revision: loop.working_revision,
    next_step_index: loop.next_step_index,
    remaining_intent: loop.remaining_intent,
    completed_steps: structuredClone(loop.completed_steps),
    step_traces: structuredClone(loop.step_traces),
    check_results: structuredClone(loop.check_results),
    clarification: loop.clarification
  };
  return envelope;
}

async function productionOwners() {
  const raw = await readFile(new URL(
    '../../../data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m1-content/turn-step-owner-profiles.json',
    import.meta.url
  ));
  return createLowerDvinaTraceTurnStepGenericOwners({
    profiles: JSON.parse(raw),
    artifactPin: {
      digest: createHash('sha256').update(raw).digest('hex')
    }
  });
}

function operationBatch() {
  return { target: 'party_turn_step_operations', value: {
    version: 1, schema: 'party_turn_step_operation_batch_v1',
    root_turn_id: 'turn:p:1', committed_state_version: 3,
    operations: [{ target: 'party_items', value: {
      version: 1,
      schema: 'rus.lower_dvina_trace_turn_step_direct_operation.v1',
      operation_id: 'op-sand', root_turn_id: 'turn:p:1', step_index: 1,
      operation_kind: 'create_entity', payload: {
        temp_ref: 'sand-temp', entity_ref: 'runtime-item:sand',
        semantic_type: 'material_portion', name: 'горсть песка',
        origin: { kind: 'ambient_ordinary', source_refs: ['shore'] },
        facts: [], runtime_instance_mechanics_snapshot: mechanics(),
        placement: { holder_character_id: 'actor-1',
          physical_position: 'hands' }
      }
    }}, semanticActivity()]
  } };
}

function bodyOperationBatch(envelope) {
  const pin = { artifact_id: 'trace_ld_v1_turn_step_owner_profiles', revision: 1,
    digest: '1'.repeat(64) };
  const context = { kind: 'direct_body_event', mechanism: 'impact',
    severity: 'minor', body_part_ref: 'left_arm' };
  const exactDeltas = { health: -1, satiety: 0, energy: 0 };
  const stateAfter = { ...body(), health: 99 };
  const payload = {
    body_effect_ref: 'body:impact:minor',
    profile_pin: structuredClone(pin),
    selected_context: structuredClone(context),
    exact_deltas: structuredClone(exactDeltas),
    state_after: structuredClone(stateAfter),
    selection_policy: 'fixed_approved_effect',
    rng_consumption: 'forbidden'
  };
  envelope.consequence.body_effect_ref = 'body:composite';
  envelope.consequence.state_changes = [{
    kind: 'direct_body_event', operation_id: 'op-body',
    body_effect_profile_ref: payload.body_effect_ref,
    profile_pin: structuredClone(pin),
    body_effect_context: structuredClone(context)
  }];
  envelope.hidden_update.approved_update = structuredClone(payload);
  envelope.body_update = {
    version: 1, schema: 'turn_body_update', owner: '@rus/body-state',
    applied: true,
    proposal: {
      schema: 'rus.body_state.composite_fixed_effect_proposal.v1',
      profile_ref: 'body:composite', profile_pin: structuredClone(pin),
      component_proposals: [{
        schema: 'rus.body_state.fixed_approved_effect_proposal.v1',
        profile_ref: payload.body_effect_ref,
        profile_pin: structuredClone(pin),
        selected_context: structuredClone(context),
        exact_deltas: structuredClone(exactDeltas),
        condition_transitions: [],
        selection_policy: 'fixed_approved_effect',
        rng_consumption: 'forbidden',
        state_after: structuredClone(stateAfter)
      }],
      exact_deltas: structuredClone(exactDeltas),
      selection_policy: 'ordered_committed_step_components',
      rng_consumption: 'forbidden'
    },
    state_after: structuredClone(stateAfter)
  };
  return { target: 'party_turn_step_operations', value: {
    version: 1, schema: 'party_turn_step_operation_batch_v1',
    root_turn_id: 'turn:p:1', committed_state_version: 3,
    operations: [{ target: 'party_state', value: {
      version: 1,
      schema: 'rus.lower_dvina_trace_turn_step_direct_operation.v1',
      operation_id: 'op-body', root_turn_id: 'turn:p:1', step_index: 1,
      operation_kind: 'apply_body_event', payload: {
        actor_ref: 'actor-1', body_effect_ref: payload.body_effect_ref,
        payload: structuredClone(payload)
      }
    }}, semanticActivity()]
  }};
}

function semanticActivity() {
  return { target: 'party_events', value: {
    version: 1,
    schema: 'rus.lower_dvina_trace_turn_step_semantic_activity.v1',
    activity_id: 'activity-1', root_turn_id: 'turn:p:1', step_index: 1,
    profile_ref: 'approved:brief-none', duration_class: 'brief',
    duration_minutes: 1, effort: 'none'
  } };
}

function authoredMoveBatch(item) {
  return { target: 'party_turn_step_operations', value: {
    version: 1, schema: 'party_turn_step_operation_batch_v1',
    root_turn_id: 'turn:p:1', committed_state_version: 3,
    operations: [{ target: 'party_items', value: {
      version: 1,
      schema: 'rus.lower_dvina_trace_turn_step_direct_operation.v1',
      operation_id: 'op-authored-move', root_turn_id: 'turn:p:1',
      step_index: 1, operation_kind: 'move_entity', payload: {
        entity_ref: 'authored-item',
        placement: { holder_character_id: 'actor-1',
          physical_position: 'hands' },
        authored_source: authoredItemPlacementSourceProof(item)
      }
    }}, semanticActivity()]
  } };
}

function mechanics() {
  return createRuntimeInstanceMechanicsSnapshot({
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1,
    provenance: { source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn:p:1', step_index: 1, operation_ref: 'op-sand',
      origin_kind: 'ambient_ordinary', source_refs: ['shore'] },
    mechanics: { mass_grams: 250, external_hand_cost: 1,
      carry_form: 'compact', packing_slot_cost: 1,
      quantity: { value: 1, unit: 'handful' }, container: null }
  });
}

function baseState() {
  return { party_id: 'p', actor_id: 'actor-1',
    schema: 'rus.lower_dvina_trace_turn_snapshot.v2',
    party_state: { state_version: 3, session_state_version: 7,
      clock_state_version: 2, body_state_version: 5, turn_number: 0 },
    player_profile: { attributes: { strength: { value: 10 } } },
    position: { location_ref: 'shore', g5_anchor_id: 'anchor-shore' },
    clock: clock(), clock_weather_light: { clock: clock(), weather: {},
      light: {} }, body_state: body(), items: [], containers: [], npcs: [],
    container_placements: [], container_profiles: [],
    container_compatibility: [],
    knowledge: [{ fact_id: 'shore', knowledge_state: 'known' }],
    opening_identity: { opening_screen_digest: 'opening-digest' } };
}

function authoredItem() {
  return {
    item_id: 'authored-item', template_id: 'template-1',
    profile_id: 'profile-1', category_id: 'container', quantity: 1,
    condition_state: 'sound', legal_status: 'party_owned', state: {},
    inventory_profile: { mass_grams: 100, external_hand_cost: 0,
      carry_form: 'compact', packing_slot_cost: 1,
      packing_bundle_size: 1 },
    placement: { anchor_id: 'anchor-shore' }
  };
}

function clock() {
  return { whole_minutes: '10', subminute_numerator: '0',
    subminute_denominator: '1' };
}

function body() {
  return { health: 100, energy: 100, satiety: 100,
    active_conditions: [] };
}
