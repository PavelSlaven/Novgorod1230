import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createSeededRandomSource } from '@rus/checks-rng';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import {
  createTurnStepExecutionRegistry,
  runTurnStepLoop
} from '@rus/turn';
import {
  buildLowerDvinaTraceTurnStepRootWrites
} from '../src/infrastructure/postgres/lower-dvina-trace-turn-step-state.js';
import { backgroundNpcFormalStateDigest,
  createBackgroundNpcSemanticAtomicWritePlan } from
  '../src/infrastructure/postgres/background-npc-semantic-atomic-write-plan.js';
import {
  assertCommittedTurnStepChecks
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-2-replay.js';
import {
  createLowerDvinaTraceTurnStepGenericOwners
} from '../src/runtime/lower-dvina-trace-turn-step-generic-owners.js';
import { commitEnvelope } from
  './lower-dvina-trace-turn-step-envelope-fixture.js';
import { backgroundNpc, body, fixture, semanticActivity } from
  './lower-dvina-trace-turn-step-commit-fixture.js';

test('route turn keeps normalized party position with snapshot', () => {
  const writes = buildLowerDvinaTraceTurnStepRootWrites({
    partyId: 'party', state: { party_state: {},
      body_state: { active_conditions: [] } },
    snapshot: { position: { g4_id: 'g4', g5_node_id: 'g5',
      g5_anchor_id: 'anchor' }, body_state: { active_conditions: [] } },
    envelope: { root_turn_id: 'turn', body_update: { applied: false,
      proposal: null },
      consequence: { phase3_kind: 'movement' } },
    nextVersion: 2, turnNumber: 2, changeSetId: 'change', idemId: 'idem',
    pendingScreen: {}, clockChanged: false
  });
  assert.deepEqual(writes.updates.find(({ target_table: table }) =>
    table === 'party_positions').record, {
    party_id: 'party', g4_id: 'g4', g5_node_id: 'g5', g5_anchor_id: 'anchor'
  });
});

test('S1 local turn updates journey position without rewriting G4/G5', () => {
  const writes = buildLowerDvinaTraceTurnStepRootWrites({
    partyId: 'party', state: { actor_id: 'actor', party_state: {},
      journey_location: { id: 'journey', state_version: 3 },
      body_state: { active_conditions: [] } },
    snapshot: { position: { position_id: 'inside', g4_id: 'g4',
      g5_node_id: 'snapshot-only-node', g5_anchor_id: 'anchor' },
    body_state: { active_conditions: [] } },
    envelope: { root_turn_id: 'turn', body_update: { applied: false,
      proposal: null }, consequence: { position_transition: {
      owner: '@rus/movement-routes'
    } } },
    nextVersion: 2, turnNumber: 2, changeSetId: 'change', idemId: 'idem',
    pendingScreen: {}, clockChanged: false
  });
  assert.equal(writes.updates.some(({ target_table: table }) =>
    table === 'party_positions'), false);
  assert.equal(writes.updates.find(({ target_table: table }) =>
    table === 'party_journey_locations').record.scene_position_id, 'inside');
});

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
    assert.equal(Object.hasOwn(snapshot, 'current_visible_context'), false);
    const visible = plan.appends.find(({ target_table: table }) =>
      table === 'party_visible_packages').record;
    assert.deepEqual(visible.visible_payload.visible_npcs,
      f.envelope.visible_context.visible_npc);
    assert.equal(visible.package_digest,
      computeSpatialV3CanonicalDigest(visible.visible_payload));
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

test('N1 remainder joins the same P16 root without changing formal NPC state',
  async () => {
    const npc = backgroundNpc();
    const remainder = {
      schema: 'rus.n1_npc_semantic_remainder.v1', version: 1,
      npc_ref: npc.npc_id,
      profile_ref: 'lower_dvina_trace_n1_background_npc_v1@1',
      ordinary_descriptor: 'Коренастый мужчина в мокрой рубахе.',
      ordinary_activity: 'Он перебирает край сети.',
      causal_basis_refs: [
        'trace_ld_v1_background_fisher_v1@2', 'shore'
      ]
    };
    const n1Plan = createBackgroundNpcSemanticAtomicWritePlan({
      schema: 'background_npc_semantic_atomic_write_plan_v1',
      party_id: 'p', base_party_state_version: 3,
      change_set_id: 'change:p:turn-step:1',
      causal_identity: { request_id: 'request-1:step:1', root_turn_id: 'turn:p:1',
        step_index: 1, actor_ref: 'actor-1', npc_ref: npc.npc_id },
      npc_ref: npc.npc_id,
      formal_state_digest: backgroundNpcFormalStateDigest(npc), remainder
    });
    const f = fixture({ backgroundNpcSemanticPlan: n1Plan });

    await f.commit();

    const update = f.plans[0].updates.find(({ target_table: table }) =>
      table === 'party_npcs');
    assert.deepEqual(update.record.semantic_state.n1_remainder, remainder);
    const snapshot = f.plans[0].inserts.find(({ target_table: table }) =>
      table === 'party_state_snapshots').record.state_payload;
    const committed = snapshot.npcs.find(({ npc_id: id }) => id === npc.npc_id);
    assert.deepEqual(committed.semantic_state.n1_remainder, remainder);
    assert.equal(backgroundNpcFormalStateDigest(committed),
      backgroundNpcFormalStateDigest(npc));
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
