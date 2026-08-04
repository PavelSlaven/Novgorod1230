import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createLowerDvinaTracePlayerSafeWorkingProjectionAuthority
} from '../src/runtime/lower-dvina-trace-player-safe-working.js';
import {
  createLowerDvinaTraceTurnStepRuntimePorts
} from '../src/runtime/lower-dvina-trace-turn-step-runtime-ports.js';

const ownerProfiles = JSON.parse(await readFile(new URL(
  '../../../data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m1-content/turn-step-owner-profiles.json',
  import.meta.url
)));

test('ordinary matrix preserves exact masses and blocks significant creation',
  async () => {
    const ports = createLowerDvinaTraceTurnStepRuntimePorts({
      ordinaryResultPolicy:
        structuredClone(ownerProfiles.ordinary_result_policy),
      workingProjectionAuthority:
        createLowerDvinaTracePlayerSafeWorkingProjectionAuthority()
    });
    const create = ports.executionRegistry.direct({ op: 'create_entity' });
    const first = await create(execution(sand('sand_1', 'sand_fact_1', 230)));
    const second = await create(execution(
      sand('sand_2', 'sand_fact_2', 410),
      first.working_projection
    ));
    assert.equal(snapshotMass(first), 230);
    assert.equal(snapshotMass(second), 410);
    assert.deepEqual(second.working_projection.items.map(({ item_id: id }) =>
      id), ['sand_1', 'sand_2']);

    const stone = await create(execution({
      ...sand('stone_1', null, 560),
      semantic_type: 'ordinary_stone',
      name: 'обычный камень',
      facts: [],
      mechanics: mechanics(560, 'piece'),
      placement: { relation: 'located_at', target_ref: 'shore' }
    }, second.working_projection));
    assert.equal(stone.write_fragments[0].value.payload.semantic_type,
      'ordinary_stone');
    assert.equal(stone.write_fragments[0].value.payload.origin.kind,
      'ambient_ordinary');

    for (const [semanticType, name] of [
      ['currency', 'серебряная монета'],
      ['letter', 'чужое письмо'],
      ['weapon', 'боевой меч'],
      ['clue', 'сюжетная улика']
    ]) {
      await assert.rejects(async () => create(execution({
        ...sand('forbidden', null, 100),
        semantic_type: semanticType,
        name,
        facts: []
      }, stone.working_projection)), {
        code: 'ITEM_ORDINARY_RESULT_POLICY_DATA_GAP'
      });
    }
  });

function sand(tempRef, factRef, massGrams) {
  return {
    op: 'create_entity',
    temp_ref: tempRef,
    semantic_type: 'material_portion',
    name: 'горсть мокрого песка',
    origin: { kind: 'ambient_ordinary', source_refs: ['shore'] },
    facts: factRef == null ? [] : [{
      temp_ref: factRef,
      text: 'это мокрый речной песок, набранный с берега'
    }],
    mechanics: mechanics(massGrams, 'handful'),
    placement: { relation: 'held_by', target_ref: 'mikula' }
  };
}

function mechanics(massGrams, unit) {
  return {
    mass_grams: massGrams,
    external_hand_cost: 1,
    carry_form: 'compact',
    packing_slot_cost: 1,
    quantity: { value: 1, unit },
    container: null
  };
}

function execution(operation, workingProjection = projection()) {
  return {
    plan: {},
    request: {
      root_turn_id: 'turn:ordinary-matrix:1',
      step_index: 1,
      actor: { actor_id: 'mikula', attributes: { strength: { value: 9 } } }
    },
    operation,
    working_projection: workingProjection,
    check_result: null
  };
}

function projection() {
  return {
    actor_id: 'mikula',
    position: { location_ref: 'shore' },
    destination_refs: [],
    inventory: {
      items: [],
      total_weight: { grams: 0 },
      load_category: 'light',
      occupied_hands: 0
    },
    items: [],
    knowledge: [{ fact_id: 'shore', text: 'доступный речной берег' }]
  };
}

function snapshotMass(result) {
  return result.write_fragments[0].value.payload
    .runtime_instance_mechanics_snapshot.mechanics.mass_grams;
}
