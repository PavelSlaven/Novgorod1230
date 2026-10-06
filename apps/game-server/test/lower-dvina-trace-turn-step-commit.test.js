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
import { withPhase2CurrentVisibleContext } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-current-visible.js';
import { backgroundNpc, body, fixture, semanticActivity } from
  './lower-dvina-trace-turn-step-commit-fixture.js';
import { SCENE_NPC_SOURCE } from
  '../src/runtime/lower-dvina-trace-scene-presence.js';

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

test('commit keeps open-one-space S1 resolution visible at formal destination',
  async () => {
    const envelope = commitEnvelope({ clarification: false, check: false });
    envelope.consequence.position_transition = {
      owner: '@rus/movement-routes', actor_id: 'actor-1',
      from_position_ref: 'position:outside',
      to_position_ref: 'position:inside'
    };
    const f = fixture({ direct: true, envelopeOverride: envelope,
      stateOverride: {
        position: { location_ref: 'shore', position_id: 'position:outside' },
        journey_location: { id: 'journey',
          scene_position_id: 'position:outside', state_version: 3 },
        spatial_semantic: [{ resolutions: [{
          local_ref: 'local:bank', position_ref: 'position:outside',
          formal_spatial_refs: { structural_variant: 'open_one_space',
            position_ref: 'position:inside' },
          semantics: { kind: 'shelter', name: 'Навес',
            description: 'У берега стоит навес.' }
        }] }]
      } });

    await f.commit();

    const visible = f.plans[0].appends.find(({ target_table: table }) =>
      table === 'party_visible_packages').record.visible_payload.visible_objects;
    assert.deepEqual(visible.find(({ entity_ref }) =>
      entity_ref.entity_id === 'local:bank'), {
      entity_ref: { entity_kind: 'spatial_local_reference',
        entity_id: 'local:bank' },
      display_label: 'Навес', recognition: 'recognized',
      visible_status: 'внутри'
    });
  });

for (const capacityLeft of [true, false]) {
  test(`destination commit keeps the S1 planner marker out of visible context (capacity left: ${capacityLeft})`,
    async () => {
      const envelope = commitEnvelope({ clarification: false, check: false });
      envelope.consequence.position_transition = {
        owner: '@rus/movement-routes', actor_id: 'actor-1',
        from_position_ref: 'position:source', to_position_ref: 'position:destination'
      };
      const { canonical_digest: _digest, ...destination } = envelope.visible_context;
      envelope.consequence.visible_seed = { ...envelope.consequence.visible_seed,
        destination_visible_context: { ...destination, visible_scene: 'Двор у избы.' } };
      let prepared = null;
      const f = fixture({ direct: true, envelopeOverride: envelope,
        stateOverride: {
          journey_location: { id: 'journey', scene_position_id: 'position:source',
            state_version: 3 },
          position: { site_id: 'site', position_id: 'position:source', location_ref: 'site' },
          spatial_semantic: [{ envelope_ref: 'env:destination', status: 'committed',
            envelope: { position_ref: 'position:destination' }, capacity_total: 1,
            consumed_count: capacityLeft ? 0 : 1, resolutions: [] }]
        },
        turnStepApprovedOwners: { async loadPreparedMovementScene({ state }) {
          const { prepared_destination_visible_context: context, ...rest } = state;
          prepared = context;
          return context == null ? rest : withPhase2CurrentVisibleContext(rest, context);
        } } });

      await f.commit();

      assert.ok(prepared, 'destination visible context reached the scene loader');
      assert.equal(Object.hasOwn(prepared, 'spatial_semantic'), false);
      const payload = f.plans[0].appends.find(({ target_table: table }) =>
        table === 'party_visible_packages').record.visible_payload;
      assert.doesNotMatch(JSON.stringify(payload), /semantic_grounding_available/u);
    });
}

test('position transition without prepared route loads destination NPCs for pending screen',
  async () => {
    const destinationNpc = {
      instance_id: 'npc:destination', profile_id: 'profile:destination',
      anchor_id: 'anchor-site', position_id: 'position:destination',
      g6_instance_id: 'g6:site', runtime_source: SCENE_NPC_SOURCE
    };
    const sourceNpc = {
      ...destinationNpc, instance_id: 'npc:source',
      position_id: 'position:source'
    };
    const envelope = commitEnvelope({ clarification: false, check: false });
    envelope.consequence.position_transition = {
      owner: '@rus/movement-routes', actor_id: 'actor-1',
      from_position_ref: 'position:source',
      to_position_ref: 'position:destination'
    };
    envelope.visible_context.visible_npc = [{
      entity_ref: { entity_kind: 'npc', entity_id: destinationNpc.instance_id },
      display_label: 'человек', recognition: 'unrecognized'
    }];
    envelope.visible_context.visible_changes = ['Текущий ход завершился у нового места.'];
    envelope.visible_context.uncertainties = ['Пока неясно, кто находится во дворе.'];
    envelope.consequence.visible_seed = {
      ...envelope.consequence.visible_seed,
      destination_visible_context: {
        ...envelope.visible_context,
        visible_scene: 'Двор у избы.',
        visible_changes: ['Перед путником открылся двор.'],
        uncertainties: ['Из избы не видно, кто там.']
      }
    };
    const loadedPositions = [];
    const f = fixture({ direct: true, envelopeOverride: envelope,
      stateOverride: {
        journey_location: { id: 'journey', scene_position_id: 'position:source',
          state_version: 3 },
        position: { site_id: 'site', position_id: 'position:source',
          location_ref: 'site', g6_instance_id: 'g6:site', g6_id: 'g6:site',
          g5_anchor_id: 'anchor-site' },
        npcs: [sourceNpc]
      },
      turnStepApprovedOwners: { async loadPreparedMovementScene({ partyId, state, clock }) {
        loadedPositions.push({ partyId, position: state.position.position_id,
          sourceNpcPersisted: state.npcs.some(({ instance_id }) =>
            instance_id === sourceNpc.instance_id), clock });
        return { ...state, scene_position_g6: {
          'position:source': 'g6:site', 'position:destination': 'g6:site'
        }, npcs: [...state.npcs, destinationNpc] };
      } }
    });

    await f.commit();

    const visible = f.plans[0].appends.find(({ target_table: table }) =>
      table === 'party_visible_packages').record;
    assert.deepEqual(visible.visible_payload.perceived_changes, [
      'Перед путником открылся двор.', 'Текущий ход завершился у нового места.'
    ]);
    assert.deepEqual(visible.visible_payload.uncertainties, [
      'Из избы не видно, кто там.', 'Пока неясно, кто находится во дворе.'
    ]);
    assert.deepEqual(loadedPositions, [{ partyId: 'p',
      position: 'position:destination', sourceNpcPersisted: false,
      clock: envelope.time_update.clock_after }]);
    const screen = f.plans[0].updates.find(({ target_table: table }) =>
      table === 'party_server_sessions').record.screen;
    assert.deepEqual(screen.panels.people.data.visible_npcs.map(
      ({ display_label }) => display_label), ['человек']);
    const snapshot = f.plans[0].inserts.find(({ target_table: table }) =>
      table === 'party_state_snapshots').record.state_payload;
    assert.equal(snapshot.npcs.some(({ runtime_source }) =>
      runtime_source === SCENE_NPC_SOURCE), false);
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

test('Phase2 direct root forwards trusted ambient profile and leaves legacy strict', async () => {
  for (const profileRef of [null, 'other-profile', 'portion-profile']) {
    const f = fixture({ direct: true });
    const payload = f.batch.value.operations.find(({ value }) =>
      value.operation_kind === 'create_entity').value.payload;
    payload.origin.source_refs = ['actor-1', 'context-pin', 'portion-profile'];
    payload.runtime_instance_mechanics_snapshot = structuredClone(
      payload.runtime_instance_mechanics_snapshot);
    payload.runtime_instance_mechanics_snapshot.provenance.source_refs =
      [...payload.origin.source_refs];
    payload.name = 'owner-approved portion';
    for (const trace of [f.envelope.loop_trace.step_traces[0],
      f.envelope.mode_resolution.decision_trace.step_traces[0]]) {
      trace.approved_plan.operations[0].origin.source_refs = ['portion-profile'];
      trace.plan_request.player_safe_state.visible_entities.push({
        entity_ref: 'portion-profile' });
    }
    const commit = () => f.commit({ turnStepAmbientPortionProfileRef: profileRef });
    if (profileRef === 'portion-profile') {
      assert.equal((await commit()).state_version, 4);
      assert.equal(f.plans[0].inserts.filter(({ target_table }) =>
        target_table === 'party_items').length, 1);
    } else {
      await assert.rejects(commit, { code: 'TRACE_TURN_STEP_OPERATION_PLAN_MISMATCH' });
      assert.equal(f.plans.length, 0);
    }
  }
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
      ordinary_activity: 'Работает на рыбацкой стоянке.',
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
      }],
      ['malformed factual event', (envelope) => {
        envelope.loop_trace.factual_events = [{ schema: 'not-an-event' }];
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
    direct_result_kind: null,
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
    factual_events: structuredClone(loop.factual_events ?? []),
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
