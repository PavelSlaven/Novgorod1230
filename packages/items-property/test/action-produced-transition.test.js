import assert from 'node:assert/strict';
import test from 'node:test';
import { admitActionProducedResult } from
  '@rus/items-property/action-produced-result';
import { createActionProducedOutputIdentity,
  createActionProducedTransitionPlanner } from
  '@rus/items-property/action-produced-transition';
test('preserved physical source keeps identity and receives owner mechanics',
  () => {
    const planner = createActionProducedTransitionPlanner({
      resolveMechanics: () => mechanicsResolution({
        identityMode: 'preserve_source',
        sourceEffects: [{
          source_ref: 'item:pole',
          requested_decrement: null,
          mechanics_snapshot_after: mechanicsSnapshot({
            operationRef: 'action:turn-1:step-1',
            sourceRefs: ['item:pole']
          })
        }]
      })
    });
    const proposal = planner(ownerInput());
    assert.equal(proposal.causal_identity.step_index, 1);
    assert.equal(proposal.results.length, 1);
    assert.equal(proposal.results[0].entity_ref, 'item:pole');
    assert.equal(proposal.results[0].identity_kind, 'preserved_source');
    assert.equal(proposal.source_transitions[0].before.state_version, '7');
    assert.equal(proposal.source_transitions[0].after.state_version, '8');
    assert.equal(proposal.tool_state_pins[0].before.state_version, '7');
    assert.deepEqual(proposal.tool_state_pins[0].after,
      proposal.tool_state_pins[0].before);
    assert.deepEqual(proposal.results[0].physical_facts,
      ['one end sharpened']);
    assert.equal(Object.isFrozen(proposal), true);
    assert.equal(Object.isFrozen(proposal.results[0].mechanics_snapshot), true);
    assert.equal('write_fragments' in proposal, false);
  });

test('partition creates deterministic independent identities and conserves source',
  () => {
    const handoff = pendingHandoff({
      source_refs: ['item:board'],
      tool_refs: ['item:axe'],
      identity_mode: 'independent_outputs',
      origin: 'direct_partition',
      intended_transformation: 'cut board into wedges',
      result_class: 'ordinary_physical_result',
      result_descriptor: {
        display_name: 'wedge',
        physical_description: 'separated',
        qualitative_facts: ['separated'],
        inscription_text: null
      }
    });
    const finiteResource = {
      schema: 'rus.items.finite_resource_snapshot.v1',
      commit_state: 'committed',
      source_resource_node_id: 'resource:item:board',
      state_version: 3,
      lifecycle_state: 'active',
      quantity: quantity(5, 1, 'board_portion')
    };
    const outputEntityRef = deterministicOutputRef;
    const planner = createActionProducedTransitionPlanner({
      resolveMechanics: () => mechanicsResolution({
        identityMode: 'independent_outputs',
        sourceEffects: [{
          source_ref: 'item:board',
          requested_decrement: quantity(4, 1, 'board_portion'),
          mechanics_snapshot_after: null
        }],
        outputs: [1, 2, 3].map((ordinal) => ({
          ordinal,
          property_source_ref: 'item:board',
          mechanics_snapshot: mechanicsSnapshot({
            operationRef: outputEntityRef(ordinal),
            sourceRefs: ['item:board'],
            originKind: 'direct_partition',
            massGrams: 250
          }),
          material_allocations: [{
            source_ref: 'item:board',
            quantity: quantity(1, 1, 'board_portion')
          }]
        })),
        knownWaste: [{
          source_ref: 'item:board',
          quantity: quantity(1, 1, 'board_portion')
        }]
      })
    });
    const proposal = planner(ownerInput({
      handoff,
      sources: [entitySnapshot('item:board', {
        role: 'source', finiteResource
      })],
      tools: [entitySnapshot('item:axe', { role: 'tool' })],
      committedEntityRefs: ['item:board', 'item:axe']
    }));
    assert.deepEqual(proposal.results.map(({ entity_ref: ref }) => ref), [
      outputEntityRef(1), outputEntityRef(2), outputEntityRef(3)
    ]);
    assert.deepEqual(
      proposal.source_transitions[0].finite_resource_transition.after_quantity,
      quantity(1, 1, 'board_portion')
    );
    assert.deepEqual(proposal.known_waste, [{
      source_ref: 'item:board',
      quantity: quantity(1, 1, 'board_portion')
    }]);
    assert.equal(proposal.results.every((result) =>
      result.source_ref === 'item:board'), true);
  });
test('known conservation rejects insufficient, cross-unit and excess allocation',
  () => {
    const cases = [
      { decrement: quantity(6, 1, 'board_portion'),
        allocation: quantity(1, 1, 'board_portion') },
      { decrement: quantity(2, 1, 'board_portion'),
        allocation: quantity(1, 1, 'kilogram') },
      { decrement: quantity(2, 1, 'board_portion'),
        allocation: quantity(3, 1, 'board_portion') },
      { decrement: quantity(2, 1, 'board_portion'),
        allocation: quantity(-1, 1, 'board_portion') },
      { decrement: quantity(2, 2, 'board_portion'),
        allocation: quantity(1, 1, 'board_portion') },
      { decrement: quantity(2, 1, 'board_portion'),
        allocation: quantity(Number.MAX_SAFE_INTEGER, 1, 'board_portion'),
        outputCount: 2 }
    ];
    for (const entry of cases) {
      const scenario = partitionScenario(entry);
      const planner = createActionProducedTransitionPlanner({
        resolveMechanics: () => scenario.resolution
      });
      assert.throws(() => planner(scenario.input), TypeError);
    }
  });
test('independent outputs require finite decrements and material allocations',
  () => {
    const handoff = pendingHandoff({
      source_refs: ['item:board'], tool_refs: ['item:axe'],
      identity_mode: 'independent_outputs', origin: 'direct_partition',
      intended_transformation: 'partition source',
      result_descriptor: {
        display_name: 'part', physical_description: 'separated part',
        qualitative_facts: [], inscription_text: null
      }
    });
    const planner = createActionProducedTransitionPlanner({
      resolveMechanics: () => mechanicsResolution({
        identityMode: 'independent_outputs',
        sourceEffects: [{ source_ref: 'item:board',
          requested_decrement: null, mechanics_snapshot_after: null }],
        outputs: [{
          ordinal: 1, property_source_ref: 'item:board',
          mechanics_snapshot: mechanicsSnapshot({
            operationRef: deterministicOutputRef(1),
            sourceRefs: ['item:board'], originKind: 'direct_partition',
            massGrams: 900000
          }),
          material_allocations: []
        }]
      })
    });
    assert.throws(() => planner(ownerInput({
      handoff,
      sources: [entitySnapshot('item:board', { role: 'source' })],
      tools: [entitySnapshot('item:axe', { role: 'tool' })],
      committedEntityRefs: ['item:board', 'item:axe']
    })), TypeError);
  });
test('whole source retires with conserved mass', () => {
  const s = partitionScenario({ finite: false, decrement: null,
    allocation: quantity(1, 2, 'whole_item'), outputCount: 2,
    outputMass: 400 });
  const planner = createActionProducedTransitionPlanner({
    resolveMechanics: () => s.resolution
  });
  const plan = planner(s.input);
  assert.equal(plan.source_transitions[0].finite_resource_transition,
    null);
  assert.equal(plan.source_transitions[0].after.state_version, '8');
  assert.equal(plan.source_transitions[0].after.mechanics_snapshot, null);
  assert.equal(plan.results.reduce((sum, result) =>
    sum + result.mechanics_snapshot.mechanics.mass_grams, 0), 800);
});
test('duplicate finite resource node identity fails before mechanics resolver',
  () => {
    const handoff = pendingHandoff({
      source_refs: ['item:board', 'item:pole'], tool_refs: ['item:axe'],
      identity_mode: 'independent_outputs', origin: 'direct_partition',
      intended_transformation: 'partition', result_descriptor: {
        display_name: 'part', physical_description: 'separated part',
        qualitative_facts: [], inscription_text: null }
    });
    const duplicateFinite = { schema: 'rus.items.finite_resource_snapshot.v1',
      commit_state: 'committed', source_resource_node_id: 'resource:shared', state_version: 3,
      lifecycle_state: 'active', quantity: quantity(5, 1, 'portion')
    };
    let calls = 0;
    const planner = createActionProducedTransitionPlanner({
      resolveMechanics() { calls += 1; return null; }
    });
    assert.throws(() => planner(ownerInput({
      handoff,
      sources: [entitySnapshot('item:board', { role: 'source',
        finiteResource: duplicateFinite }), entitySnapshot('item:pole', {
        role: 'source', finiteResource: structuredClone(duplicateFinite) })],
      tools: [entitySnapshot('item:axe', { role: 'tool' })],
      committedEntityRefs: ['item:board', 'item:pole', 'item:axe']
    })), TypeError);
    assert.equal(calls, 0);
  });
test('no useful result keeps source and tool state without creating identity',
  () => {
    const handoff = pendingHandoff({
      identity_mode: 'no_useful_result', origin: null,
      output_class: null,
      result_class: 'no_useful_result', result_descriptor: {
        display_name: null, physical_description: null,
        qualitative_facts: [], inscription_text: null }
    });
    const planner = createActionProducedTransitionPlanner({
      resolveMechanics: () => mechanicsResolution({
        identityMode: 'no_useful_result', sourceEffects: [{
          source_ref: 'item:pole', requested_decrement: null,
          mechanics_snapshot_after: null }]
      })
    });
    const proposal = planner(ownerInput({ handoff }));
    assert.deepEqual(proposal.results, []);
    assert.deepEqual(proposal.known_waste, []);
    assert.deepEqual(proposal.source_transitions[0].after, { state_version: '7',
      mechanics_snapshot: null,
      holder_ref: 'actor:mikula',
      controller_ref: 'actor:mikula'
    });
  });
test('mechanics port receives only a frozen detached owner request', () => {
  let request;
  let rawResolution;
  const input = ownerInput();
  const planner = createActionProducedTransitionPlanner({
    resolveMechanics(value) {
      request = value;
      assert.deepEqual(Object.keys(value), [
        'schema', 'causal_identity', 'identity_mode', 'origin',
        'result_class', 'source_inputs', 'tool_inputs',
        'qualitative_intent', 'technical_limits'
      ]);
      assert.equal(value.causal_identity.step_index, 1);
      assert.equal(Object.isFrozen(value), true);
      assert.equal(Object.isFrozen(value.source_inputs[0]), true);
      assert.equal(Object.isFrozen(value.qualitative_intent), true);
      assert.throws(() => {
        value.source_inputs[0].state_version = 'forged';
      }, TypeError);
      rawResolution = mechanicsResolution({
        identityMode: 'preserve_source',
        sourceEffects: [{
          source_ref: 'item:pole',
          requested_decrement: null,
          mechanics_snapshot_after: mechanicsSnapshot({
            operationRef: 'action:turn-1:step-1',
            sourceRefs: ['item:pole']
          })
        }]
      });
      return rawResolution;
    }
  });
  const proposal = planner(input);
  input.source_snapshots[0].state_version = 'forged-after-call';
  rawResolution.source_effects[0].requested_decrement = {
    numerator: 1, denominator: 1, unit: 'forged'
  };
  assert.equal(request.source_inputs[0].state_version, '7');
  assert.equal(proposal.source_transitions[0].before.state_version, '7');
  assert.equal(proposal.source_transitions[0].after.state_version, '8');
  assert.throws(() => {
    proposal.source_transitions[0].after.state_version = 'forged';
  }, TypeError);
});

test('hostile inputs and owner output fail before getter reads', () => {
  let reads = 0;
  let resolverCalls = 0;
  const planner = createActionProducedTransitionPlanner({
    resolveMechanics() {
      resolverCalls += 1;
      const result = {};
      Object.defineProperty(result, 'schema', {
        enumerable: true,
        get() { reads += 1; return 'forged'; }
      });
      return result;
    }
  });
  assert.throws(() => planner(ownerInput()), TypeError);
  assert.equal(reads, 0);
  assert.equal(resolverCalls, 1);

  const hostileInput = ownerInput();
  Object.defineProperty(hostileInput, 'source_snapshots', {
    enumerable: true,
    get() { reads += 1; return []; }
  });
  assert.throws(() => planner(hostileInput), TypeError);
  assert.equal(reads, 0);
  assert.equal(resolverCalls, 1);

  const unfrozenHandoff = ownerInput();
  unfrozenHandoff.handoff = structuredClone(unfrozenHandoff.handoff);
  assert.throws(() => planner(unfrozenHandoff), TypeError);
  assert.equal(resolverCalls, 1);

  const symbol = ownerInput();
  symbol[Symbol('forged')] = true;
  const custom = ownerInput();
  custom.source_snapshots[0] = Object.assign(
    Object.create({ hidden: true }), custom.source_snapshots[0]);
  const cycle = ownerInput();
  cycle.loop = cycle;
  const alias = ownerInput();
  alias.tool_snapshots[0] = alias.source_snapshots[0];
  for (const value of [symbol, custom, cycle, alias]) {
    assert.throws(() => planner(value), TypeError);
  }
  assert.equal(resolverCalls, 1);

  const outputCases = [];
  const outputSymbol = mechanicsResolution({
    identityMode: 'preserve_source', sourceEffects: [], outputs: []
  });
  outputSymbol[Symbol('forged')] = true;
  outputCases.push(outputSymbol);
  outputCases.push(Object.assign(Object.create({ hidden: true }),
    mechanicsResolution({
      identityMode: 'preserve_source', sourceEffects: [], outputs: []
    })));
  const outputCycle = mechanicsResolution({
    identityMode: 'preserve_source', sourceEffects: [], outputs: []
  });
  outputCycle.loop = outputCycle;
  outputCases.push(outputCycle);
  const outputAlias = mechanicsResolution({
    identityMode: 'preserve_source', sourceEffects: [], outputs: []
  });
  outputAlias.outputs = outputAlias.source_effects;
  outputCases.push(outputAlias);
  for (const output of outputCases) {
    const hostilePlanner = createActionProducedTransitionPlanner({
      resolveMechanics: () => output
    });
    assert.throws(() => hostilePlanner(ownerInput()), TypeError);
  }

  const factoryOptions = {};
  Object.defineProperty(factoryOptions, 'resolveMechanics', {
    enumerable: true,
    get() { reads += 1; return () => null; }
  });
  assert.throws(() => createActionProducedTransitionPlanner(factoryOptions),
    TypeError);
  assert.equal(reads, 0);
});

test('owner resolution cannot smuggle arbitrary mechanics or extra authority',
  () => {
    for (const forge of [
      (resolution) => { resolution.damage = 8; },
      (resolution) => {
        resolution.source_effects[0].next_entity_state_version = '1';
      },
      (resolution) => {
        resolution.source_effects[0].mechanics_snapshot_after.mechanics.damage
          = 8;
      },
      (resolution) => {
        resolution.source_effects[0].mechanics_snapshot_after.provenance
          .root_turn_id = 'turn:forged';
      },
      (resolution) => {
        resolution.source_effects[0].mechanics_snapshot_after.provenance
          .step_index = 2;
      }
    ]) {
      const resolution = mechanicsResolution({
        identityMode: 'preserve_source',
        sourceEffects: [{
          source_ref: 'item:pole',
          requested_decrement: null,
          mechanics_snapshot_after: mechanicsSnapshot({
            operationRef: 'action:turn-1:step-1',
            sourceRefs: ['item:pole']
          })
        }]
      });
      forge(resolution);
      const planner = createActionProducedTransitionPlanner({
        resolveMechanics: () => resolution
      });
      assert.throws(() => planner(ownerInput()), TypeError);
    }
  });

test('versioned technical limit and committed identity collisions fail closed',
  () => {
    const scenario = partitionScenario({ outputCount: 3 });
    const overLimit = {
      ...scenario.input,
      technical_policy: {
        ...scenario.input.technical_policy,
        max_new_entities: 2
      }
    };
    const resolver = () => scenario.resolution;
    assert.throws(() => createActionProducedTransitionPlanner({
      resolveMechanics: resolver
    })(overLimit), TypeError);

    for (const maxNewEntities of [0, 9]) {
      assert.throws(() => createActionProducedTransitionPlanner({
        resolveMechanics: resolver
      })({
        ...scenario.input,
        technical_policy: {
          ...scenario.input.technical_policy,
          max_new_entities: maxNewEntities
        }
      }), TypeError);
    }

    const collision = structuredClone(scenario.input);
    collision.handoff = scenario.input.handoff;
    collision.committed_entity_refs.push(
      deterministicOutputRef(1));
    assert.throws(() => createActionProducedTransitionPlanner({
      resolveMechanics: resolver
    })(collision), TypeError);
  });

function ownerInput({ handoff = pendingHandoff(), sources = [
  entitySnapshot('item:pole', { role: 'source' })
], tools = [entitySnapshot('item:knife', { role: 'tool' })],
committedEntityRefs = ['item:pole', 'item:knife'], maxNewEntities = 4 } = {}) {
  return { handoff, source_snapshots: sources, tool_snapshots: tools,
    committed_entity_refs: committedEntityRefs,
    technical_policy: {
      schema: 'rus.items.action_produced_technical_policy.v1',
      version: 1,
      status: 'committed',
      policy_ref: 'policy:a1:mechanics:1',
      profile_ref: 'profile:a1:test',
      profile_version: '1',
      max_new_entities: maxNewEntities
    }, output_destination: handoff.identity_mode === 'independent_outputs'
      ? outputDestinationFixture() : null
  };
}

function outputDestinationFixture() {
  return { schema: 'rus.items.action_produced_output_destination.v1',
    placement_kind: 'anchor', target_ref: 'output-anchor',
    holder_ref: null, controller_ref: 'actor:mikula'
  };
}

function pendingHandoff(overrides = {}) {
  const result = admitActionProducedResult(phaseOneInput(overrides));
  assert.equal(result.pass, true);
  return result.handoff;
}

function phaseOneInput(overrides = {}) {
  const entities = [
    phaseOneEntity('item:pole', ['source']), phaseOneEntity('item:knife', ['tool']),
    phaseOneEntity('item:board', ['source']), phaseOneEntity('item:axe', ['tool']),
    phaseOneEntity('item:bark', ['source']), phaseOneEntity('item:charcoal', ['tool'])
  ];
  const proposal = {
    schema: 'action_produced_result_plan_v1',
    request_id: 'a1:turn-1:step-1',
    root_turn_id: 'turn:party-1:1',
    action_ref: 'action:turn-1:step-1',
    step_index: 1,
    committed_state_version: '7',
    context_ref: 'context:party:7',
    profile_ref: 'profile:a1:test',
    profile_version: '1',
    causal_mode: 'action_produced',
    actor_ref: 'actor:mikula',
    source_refs: ['item:pole'],
    tool_refs: ['item:knife'],
    identity_mode: 'preserve_source',
    origin: null,
    intended_transformation: 'sharpen one end of pole', material_extent:
      overrides.identity_mode === 'independent_outputs' ? 'whole' : null,
    result_class: 'ordinary_physical_result',
    result_descriptor: {
      display_name: 'sharpened pole',
      physical_description: 'one end is physically sharpened',
      qualitative_facts: ['one end sharpened'],
      inscription_text: null
    },
    output_class: 'ordinary_mundane',
    ...overrides
  };
  return {
    committed_context: {
      schema: 'rus.items.action_produced_committed_context.v1',
      context_ref: 'context:party:7',
      state_version: '7',
      commit_state: 'committed',
      root_turn_id: 'turn:party-1:1',
      action_ref: 'action:turn-1:step-1',
      step_index: 1,
      actor_ref: 'actor:mikula',
      entities
    },
    profile: {
      schema: 'rus.items.action_produced_admission_profile.v1',
      profile_ref: 'profile:a1:test',
      profile_version: '1',
      status: 'committed',
      context_ref: 'context:party:7',
      context_state_version: '7',
      allowed_access_states: ['immediate'],
      allowed_identity_modes: ['preserve_source', 'independent_outputs',
        'no_useful_result'],
      allowed_origins: ['direct_partition', 'crafted'],
      allowed_result_classes: ['ordinary_physical_result',
        'partial_transformation', 'nonworking_construction', 'waste',
        'written_carrier', 'no_useful_result']
    },
    proposal
  };
}

function phaseOneEntity(entityRef, roles) {
  return { entity_ref: entityRef, state_version: '7', lifecycle_state: 'active',
    access_state: 'immediate', accessible_actor_ref: 'actor:mikula',
    holder_ref: 'actor:mikula', controller_ref: 'actor:mikula',
    role_membership: roles };
}

function entitySnapshot(entityRef, { role, finiteResource = null } = {}) {
  const ownership = ownershipFor(entityRef);
  return { schema: 'rus.items.action_produced_committed_entity_snapshot.v1', commit_state: 'committed',
    role, entity_ref: entityRef, state_version: '7', lifecycle_state: 'active',
    access_state: 'immediate', holder_ref: 'actor:mikula', controller_ref: 'actor:mikula',
    ownership_snapshot: ownership,
    finite_resource: finiteResource };
}

function ownershipFor(entityRef) {
  return { ownership_id: `ownership:${entityRef}`, owner_npc_id: null,
    owner_character_id: 'actor:mikula', owner_party: false, controller_npc_id: null,
    controller_character_id: 'actor:mikula', claim_state: 'owned' };
}

function mechanicsResolution({ identityMode, sourceEffects,
  outputs = [], knownWaste = [] }) {
  return { schema: 'rus.items.action_produced_owner_resolution.v1',
    identity_mode: identityMode, source_effects: sourceEffects,
    outputs, known_waste: knownWaste };
}

function mechanicsSnapshot({ operationRef, sourceRefs,
  originKind = 'crafted', massGrams = 900 } = {}) {
  return { schema: 'rus.items.runtime_instance_mechanics_snapshot.v1',
    version: 1, provenance: {
      source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn:party-1:1', step_index: 1,
      operation_ref: operationRef, origin_kind: originKind,
      source_refs: sourceRefs },
    mechanics: { mass_grams: massGrams, external_hand_cost: 1,
      carry_form: 'long', packing_slot_cost: 3,
      quantity: { value: 1, unit: 'item' }, container: null } };
}

function quantity(numerator, denominator, unit) {
  return { numerator, denominator, unit };
}

function partitionScenario({
  decrement = quantity(2, 1, 'board_portion'),
  allocation = quantity(1, 1, 'board_portion'),
  outputCount = 1, outputMass = 100, finite = true
} = {}) {
  const handoff = pendingHandoff({
    source_refs: ['item:board'], tool_refs: ['item:axe'],
    identity_mode: 'independent_outputs',
    origin: 'direct_partition', intended_transformation: 'разделить доску',
    result_descriptor: {
      display_name: 'деревянная деталь',
      physical_description: 'отделённая часть доски',
      qualitative_facts: [], inscription_text: null
    }
  });
  const source = entitySnapshot('item:board', { role: 'source',
    finiteResource: finite ? {
      schema: 'rus.items.finite_resource_snapshot.v1',
      commit_state: 'committed',
      source_resource_node_id: 'resource:item:board',
      state_version: 3, lifecycle_state: 'active',
      quantity: quantity(5, 1, 'board_portion')
    } : null
  });
  const outputEntityRef = deterministicOutputRef;
  const resolution = mechanicsResolution({
    identityMode: 'independent_outputs',
    sourceEffects: [{ source_ref: 'item:board',
      requested_decrement: decrement, mechanics_snapshot_after: null }],
    outputs: Array.from({ length: outputCount }, (_, index) => {
      const ordinal = index + 1;
      return { ordinal, property_source_ref: 'item:board',
        mechanics_snapshot: mechanicsSnapshot({
          operationRef: outputEntityRef(ordinal), sourceRefs: ['item:board'],
          originKind: 'direct_partition', massGrams: outputMass
        }),
        material_allocations: [{ source_ref: 'item:board',
          quantity: { ...allocation } }]
      };
    })
  });
  return { input: ownerInput({ handoff, sources: [source],
      tools: [entitySnapshot('item:axe', { role: 'tool' })],
      committedEntityRefs: ['item:board', 'item:axe'],
      maxNewEntities: 4
    }), resolution };
}

function deterministicOutputRef(ordinal) {
  return createActionProducedOutputIdentity({
    root_turn_id: 'turn:party-1:1',
    action_ref: 'action:turn-1:step-1',
    ordinal
  });
}
