import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authoredProof,
  baseState,
  canonicalEnvelope,
  direct,
  factual,
  mechanics,
  prepare
} from './lower-dvina-trace-turn-step-persistence-fixture.js';
import {
  bindCommitEnvelopeToBatch,
  commitEnvelope
} from './lower-dvina-trace-turn-step-envelope-fixture.js';

test('M1 batch collapses create, move, facts and mechanics to atomic final rows',
  () => {
    const state = baseState();
    const operations = [
      direct('create_entity', 'op-create', {
        temp_ref: 'sand-temp',
        entity_ref: 'runtime-item:sand',
        semantic_type: 'material_portion',
        name: 'горсть мокрого песка',
        origin: { kind: 'ambient_ordinary', source_refs: ['shore'] },
        facts: [{ fact_id: 'fact:sand:wet', temp_ref: 'wet',
          text: 'это мокрый речной песок' }],
        runtime_instance_mechanics_snapshot: mechanics('op-create', 300),
        placement: { holder_character_id: 'actor-1',
          physical_position: 'hands' }
      }),
      direct('move_entity', 'op-move', {
        entity_ref: 'runtime-item:sand',
        placement: { location_ref: 'shore' }
      }),
      direct('change_entity_facts', 'op-facts', {
        entity_ref: 'runtime-item:sand',
        remove_fact_refs: ['fact:sand:wet'],
        add_facts: [{ fact_id: 'fact:sand:packed', temp_ref: 'packed',
          text: 'песок собран плотным комком' }]
      }),
      direct('set_entity_mechanics', 'op-mechanics', {
        entity_ref: 'runtime-item:sand',
        reason: 'песок уплотнён',
        runtime_instance_mechanics_snapshot:
          mechanics('op-mechanics', 280)
      })
    ];
    const result = prepare({ state, operations });

    assert.deepEqual(result.writes.inserts.map((write) =>
      `${write.target_table}:${write.id}`), [
      'party_items:runtime-item:sand',
      'party_item_placements:runtime-item:sand',
      'party_character_knowledge:actor-1:fact:sand:packed'
    ]);
    assert.equal(result.writes.updates.length, 0);
    const itemWrite = result.writes.inserts[0].record;
    assert.equal(itemWrite.template_id, null);
    assert.equal(itemWrite.profile_id, null);
    assert.equal(itemWrite.category_id, null);
    assert.equal(itemWrite.run_id, null);
    assert.equal(itemWrite.quantity, 1);
    assert.equal(itemWrite.state.runtime_instance_mechanics_snapshot
      .mechanics.mass_grams, 280);
    assert.deepEqual(itemWrite.state.ordinary_metadata.semantic_facts.map(
      ({ fact_id: id }) => id), ['fact:sand:packed']);
    assert.equal(result.writes.inserts[1].record.anchor_id, 'anchor-shore');
    assert.equal(result.writes.inserts[1].record.scene_position_id, null);
    assert.equal(result.writes.inserts[1].record.holder_character_id, null);
    assert.equal(result.snapshot.items.some(
      ({ item_id: id }) => id === 'authored-item'), true,
    'authored state is preserved');
    assert.equal(result.snapshot.items.find(
      ({ item_id: id }) => id === 'runtime-item:sand')
      .runtime_instance_mechanics_snapshot.mechanics.mass_grams, 280);
    assert.equal(result.snapshot.last_turn.turn_step_operation_batch
      .operations.length, 4);
    assert.deepEqual(result.snapshot.last_turn.decision_trace,
      { decision_protocol: 'turn_step_plan_v1', step_traces: [{ step: 1 }] });
  });

test('M1 retirement preserves the row as retired and removes player projection',
  () => {
    const state = baseState();
    const snapshot = mechanics('seed', 100);
    state.items.push({
      item_id: 'runtime-item:old',
      instance_id: 'runtime-item:old',
      template_id: null,
      profile_id: null,
      category_id: null,
      name: 'щепка',
      quantity: 1,
      condition_state: 'ordinary_runtime_instance',
      legal_status: 'unowned_ordinary_runtime',
      placement: { holder_character_id: 'actor-1',
        physical_position: 'hands' },
      runtime_instance_mechanics_snapshot: snapshot,
      state: {
        lifecycle_status: 'active',
        runtime_instance_mechanics_snapshot: snapshot,
        ordinary_metadata: {
          semantic_type: 'material_portion', name: 'щепка',
          origin: { kind: 'ambient_ordinary', source_refs: ['shore'] },
          semantic_facts: [], operation_history: []
        }
      }
    });
    const result = prepare({ state, operations: [direct(
      'retire_entity', 'op-retire', {
        entity_ref: 'runtime-item:old', reason: 'израсходован'
      })] });
    const retiredSnapshot = result.snapshot.items.find(
      ({ item_id: id }) => id === 'runtime-item:old');
    assert.equal(retiredSnapshot.state.lifecycle_status, 'retired');
    assert.equal(result.writes.deletes.length, 0);
    assert.equal(result.writes.updates[0].target_table, 'party_items');
    assert.equal(result.writes.updates[0].record.condition_state, 'retired');
    assert.equal(result.writes.updates[0].record.state.lifecycle_status,
      'retired');
  });

test('M1 rejects a bad later operation and duplicate identity',
  () => {
    const create = direct('create_entity', 'duplicate', {
      temp_ref: 'sand-temp', entity_ref: 'runtime-item:sand',
      semantic_type: 'material_portion', name: 'горсть мокрого песка',
      origin: { kind: 'ambient_ordinary', source_refs: ['shore'] },
      facts: [], runtime_instance_mechanics_snapshot: mechanics('duplicate'),
      placement: { holder_character_id: 'actor-1',
        physical_position: 'hands' }
    });
    assert.throws(() => prepare({ state: baseState(), operations: [
      create,
      { ...direct('move_entity', 'duplicate', {
        entity_ref: 'runtime-item:sand',
        placement: { location_ref: 'shore' }
      }) }
    ] }), { code: 'TRACE_TURN_STEP_OPERATION_DUPLICATE' });
    const forged = structuredClone(create);
    forged.value.schema = 'unknown.v1';
    assert.throws(() => prepare({ state: baseState(), operations: [
      create, forged
    ] }), { code: 'TRACE_TURN_STEP_OPERATION_SCHEMA_UNKNOWN' });
    const authoredState = baseState();
    const proof = authoredProof(authoredState.items[0]);
    const authoredMove = prepare({ state: authoredState, operations: [direct(
      'move_entity', 'authored-move', {
        entity_ref: 'authored-item',
        placement: { holder_character_id: 'actor-1',
          physical_position: 'hands' },
        authored_source: proof
      })] });
    assert.deepEqual(authoredMove.snapshot.items[0].placement, {
      holder_character_id: 'actor-1', physical_position: 'hands'
    });
    assert.equal(authoredMove.writes.updates.some(({ target_table: table,
      id }) => table === 'party_item_placements'
        && id === 'authored-item'), true);
    assert.equal(authoredMove.writes.updates.some(({ target_table: table,
      id }) => table === 'party_items' && id === 'authored-item'), true);
    assert.throws(() => prepare({ state: baseState(), operations: [direct(
      'move_entity', 'authored-unproved', {
        entity_ref: 'authored-item', placement: { location_ref: 'shore' }
      })] }), { code: 'TRACE_TURN_STEP_AUTHORED_SOURCE_PROOF_INVALID' });
    assert.throws(() => prepare({ state: baseState(), operations: [direct(
      'move_entity', 'authored-tampered', {
        entity_ref: 'authored-item', placement: { location_ref: 'shore' },
        authored_source: { ...proof, source_digest: 'tampered' }
      })] }), { code: 'TRACE_TURN_STEP_AUTHORED_SOURCE_PROOF_INVALID' });
  });

test('M1 direct-only persistence fails closed before inventing replay identity',
  () => {
    assert.throws(() => prepare({
      state: baseState(),
      operations: [direct('move_entity', 'op-move', {
        entity_ref: 'runtime-item:missing',
        placement: { location_ref: 'shore' }
      })],
      factual: null
    }), { code: 'TRACE_TURN_STEP_DIRECT_COMMIT_CONTRACT_GAP' });
  });

test('M1 persists formal access on an existing authored container', () => {
  const result = prepare({ state: baseState(), operations: [direct(
    'request_container_access', 'container-open', {
      container_ref: 'authored-item', access_kind: 'open_and_view',
      state_patch: {
        open_state: 'open', contents_state: 'known',
        access_state: { access: 'open' }
      },
      revealed_refs: []
    })] });
  const container = result.snapshot.items.find(
    ({ item_id: ref }) => ref === 'authored-item');
  assert.equal(container.open_state, 'open');
  assert.equal(container.contents_state, 'known');
  assert.equal(result.writes.updates.some(({ target_table: table, id }) =>
    table === 'party_items' && id === 'authored-item'), true);
});

test('M1 accepts owner-expanded ambient provenance only with a current source', () => {
  const snapshot = structuredClone(mechanics('ambient-op', 500));
  snapshot.provenance.source_kind = 'ordinary_direct_action_result';
  snapshot.provenance.origin_kind = 'ambient_ordinary';
  snapshot.provenance.source_refs = ['shore', 'profile:portion', 'context-digest'];
  const operation = direct('create_entity', 'ambient-op', {
    temp_ref: 'ambient-temp', entity_ref: 'runtime-item:ambient',
    semantic_type: 'material_portion', name: 'горсть мокрого песка',
    origin: { kind: 'ambient_ordinary', source_refs: [...snapshot.provenance.source_refs] },
    facts: [], runtime_instance_mechanics_snapshot: snapshot,
    placement: { holder_character_id: 'actor-1', physical_position: 'hands' }
  });
  assert.doesNotThrow(() => prepare({ state: baseState(), operations: [operation],
    ambientPortionProfileRef: 'profile:portion' }));
  const unknown = structuredClone(operation);
  unknown.value.payload.origin.source_refs = ['profile:portion', 'context-digest'];
  unknown.value.payload.runtime_instance_mechanics_snapshot.provenance.source_refs =
    ['profile:portion', 'context-digest'];
  assert.throws(() => prepare({ state: baseState(), operations: [unknown],
    ambientPortionProfileRef: 'profile:portion' }), {
    code: 'TRACE_TURN_STEP_REF_UNRESOLVED'
  });
  assert.throws(() => prepare({ state: baseState(), operations: [operation],
    ambientPortionProfileRef: 'other:profile' }), {
    code: 'TRACE_TURN_STEP_REF_UNRESOLVED'
  });
});
test('M1 rejects container access payload detached from its code owner', () => {
  const forgedClose = direct('request_container_access', 'container-close', {
    container_ref: 'authored-item', access_kind: 'close',
    state_patch: { open_state: 'open', contents_state: 'known',
      access_state: { access: 'open' } },
    revealed_refs: ['forged-hidden-item']
  });
  const state = baseState();
  state.items.push({ item_id: 'contained-item', template_id: 'template-2',
    profile_id: 'profile-2', placement: { container_id: 'authored-item' } });
  const forgedReveal = direct('request_container_access', 'container-open', {
    container_ref: 'authored-item', access_kind: 'open',
    state_patch: { open_state: 'open', contents_state: 'known',
      access_state: { access: 'open' } },
    revealed_refs: ['forged-hidden-item']
  });
  for (const operation of [forgedClose, forgedReveal]) {
    const envelope = commitEnvelope({ clarification: false, check: false });
    for (const trace of [envelope.loop_trace.step_traces[0],
      envelope.mode_resolution.decision_trace.step_traces[0]]) {
      trace.resolution = 'domain_request';
      trace.approved_plan.resolution = 'domain_request';
      trace.approved_plan.activity = {
        owner: 'domain', duration_class: null, effort: null
      };
    }
    bindCommitEnvelopeToBatch(envelope,
      { value: { operations: [operation] } });
    assert.throws(() => prepare({ state, operations: [operation],
      commitEnvelope: envelope }), {
      code: 'TRACE_TURN_STEP_OPERATION_PLAN_MISMATCH'
    });
  }
});

test('M1 accepts only the exact canonical turn-step commit envelope', () => {
  const operation = direct('request_container_access', 'op-envelope', {
    container_ref: 'authored-item', access_kind: 'open',
    state_patch: { open_state: 'open', contents_state: 'known',
      access_state: { access: 'open' } }, revealed_refs: []
  });
  const envelope = commitEnvelope({ clarification: false, check: false });
  for (const trace of [envelope.loop_trace.step_traces[0],
    envelope.mode_resolution.decision_trace.step_traces[0]]) {
    trace.resolution = 'domain_request';
    trace.approved_plan.resolution = 'domain_request';
    trace.approved_plan.activity = {
      owner: 'domain', duration_class: null, effort: null
    };
  }
  bindCommitEnvelopeToBatch(envelope, { value: { operations: [operation] } });
  assert.doesNotThrow(() => prepare({ state: baseState(),
    operations: [operation], commitEnvelope: envelope }));
  const malformed = canonicalEnvelope(factual());
  malformed.alternate_payload = {};
  assert.throws(() => prepare({
    state: baseState(), operations: [operation], commitEnvelope: malformed
  }), { code: 'TRACE_TURN_STEP_DIRECT_COMMIT_CONTRACT_GAP' });
});
