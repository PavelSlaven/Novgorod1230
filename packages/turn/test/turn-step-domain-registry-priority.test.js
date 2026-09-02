import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTurnCommandRegistry,
  createTurnStepExecutionRegistry,
  runTurnWorkflow
} from '../src/index.js';
import { isOrdinaryDiscoveryInScope } from '../src/turn-step-admission.js';
import { isSpatialSemanticRemainderInScope } from
  '../src/turn-step-spatial-semantic-remainder.js';
import { resolveTurnStepDomainOwner } from
  '../src/turn-step-domain-owner-resolution.js';
import {
  createServices,
  input,
  turnStepPlan
} from './turn-workflow-fixture.js';

test('registered generic domain handler precedes scenario command bindings',
  async () => {
    let genericCalls = 0;
    let scenarioCalls = 0;
    const { services } = createServices([], {
      command: {
        matches: () => false,
        semantic_binding: {
          binding_id: 'scenario-container',
          operation: 'request_container_access',
          matches() {
            scenarioCalls += 1;
            return true;
          }
        }
      },
      playerSafeStateProjector: async () => ({
        actor: { actor_ref: 'party-1' },
        player_safe_state: {
          visible_entities: [{ entity_ref: 'chest' }]
        }
      }),
      turnStepExecutionRegistry: createTurnStepExecutionRegistry({
        domain: {
          request_container_access: async ({ working_projection: value }) => {
            genericCalls += 1;
            return {
              working_projection: value,
              write_fragments: [{
                target: 'party_hidden_state',
                value: { container_opened: true }
              }],
              player_response_boundary: true
            };
          }
        }
      }),
      turnStepModel: async (request) => turnStepPlan(request, {
        resolution: 'domain_request', goal_result: 'pending',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [{
          op: 'request_container_access', actor_ref: 'party-1',
          container_ref: 'chest', access_kind: 'open_and_view'
        }]
      })
    });
    const result = await runTurnWorkflow({
      ...input(), raw_text: 'Открываю сундук.'
    }, services);
    assert.equal(result.status, 'partial');
    assert.equal(genericCalls, 1);
    assert.equal(scenarioCalls, 0);
  });

test('unbound world-process request reaches only the active exact owner seam',
  async () => {
    let calls = 0;
    const { services } = createServices([], {
      command: { matches: () => false, semantic_binding: {
        binding_id:'unmatched-fire',operation:'request_world_process',
        matches:()=>false } },
      playerSafeStateProjector: async () => ({actor:{actor_ref:'party-1'},
        player_safe_state:{visible_entities:[{entity_ref:'fuel-1'},
          {entity_ref:'ignition-1'}],local_world_process:{
          semantic_grounding_available:true}}}),
      turnStepWorldProcessResolver: async (request) => {
        calls += 1;
        assert.equal(Object.isFrozen(request),true);
        assert.equal(request.schema,'turn_step_world_process_request_v1');
        return {working_projection:request.working_projection,
          write_fragments:[{target:'party_hidden_state',value:{fire:true}}],
          local_fire_atomic_write_plans:[{sealed:true}],
          player_response_boundary:true};
      },
      turnStepModel: async (request) => turnStepPlan(request,{
        resolution:'domain_request',goal_result:'pending',
        activity:{owner:'domain',duration_class:null,effort:null},operations:[{
          op:'request_world_process',actor_ref:'party-1',
          process_action:'start',process_ref:null,process_kind:'fire',
          source_refs:['fuel-1'],target_refs:['ignition-1'],
          description:'разжечь местный огонь'}]})
    });
    const result=await runTurnWorkflow({...input(),raw_text:'Разжигаю огонь.'},
      services);
    assert.equal(result.status,'partial');
    assert.equal(calls,1);
  });

test('world-process affect with no target refs reaches resolver and carries plan',
  async () => {
    let resolvedOperation = null;
    const processPlan = { schema:'local_fire_atomic_write_plan_v1',
      transition_proposal:{outcome:'fuel_added'} };
    const { services } = createServices([], {
      command: { matches: () => false, semantic_binding: {
        binding_id:'unmatched-fire-affect',operation:'request_world_process',
        matches:()=>false } },
      playerSafeStateProjector: async () => ({actor:{actor_ref:'party-1'},
        player_safe_state:{visible_entities:[{entity_ref:'fuel-2'},
          {entity_ref:'process-1'}],local_world_process:{
          semantic_grounding_available:true}}}),
      turnStepWorldProcessResolver: async (request) => {
        resolvedOperation = structuredClone(request.operation);
        return {working_projection:request.working_projection,
          write_fragments:[{target:'party_hidden_state',
            value:{local_fire_fuel_added:true}}],
          local_fire_atomic_write_plans:[processPlan],
          player_response_boundary:true};
      },
      turnStepModel: async (request) => turnStepPlan(request,{
        resolution:'domain_request',goal_result:'pending',
        activity:{owner:'domain',duration_class:null,effort:null},operations:[{
          op:'request_world_process',actor_ref:'party-1',
          process_action:'affect',process_ref:'process-1',process_kind:'fire',
          source_refs:['fuel-2'],target_refs:[],
          description:'добавить подготовленное топливо'}]})
    });
    const result=await runTurnWorkflow({...input(),raw_text:'Подкладываю топливо.'},
      services);
    assert.equal(result.status,'partial');
    assert.deepEqual(resolvedOperation?.target_refs,[]);
    assert.deepEqual(result.checkpoint.stages.persistence_plan
      .local_fire_atomic_write_plans,[processPlan]);
  });

test('same-root world-process steps receive prior plans and projected process',
  async () => {
    const modelRequests = [], resolverPriors = [];
    const plans = [1, 2, 3].map((step_index) => ({
      schema:'local_fire_atomic_write_plan_v1',step_index
    }));
    const { services } = createServices([], {
      command:{matches:()=>false,semantic_binding:{binding_id:'free-fire',
        operation:'request_world_process',matches:()=>false}},
      playerSafeStateProjector:async ({local_fire_atomic_write_plans:prior=[]})=>({
        actor:{actor_ref:'party-1'},player_safe_state:{visible_entities:[
          {entity_ref:'fuel-1'},{entity_ref:'fuel-2'},{entity_ref:'water-1'},
          {entity_ref:'ignition-1'},{entity_ref:'process-1'}],
        local_world_process:{semantic_grounding_available:true,
          active_process_refs:prior.length===0?[]:['process-1']}}}),
      turnStepWorldProcessResolver:async (request)=>{
        resolverPriors.push(request.prior_local_fire_atomic_write_plans);
        return {working_projection:request.working_projection,
          write_fragments:[],local_fire_atomic_write_plans:[
            plans[request.request.step_index-1]],
          player_response_boundary:request.request.step_index===3};
      },
      turnStepModel:async (request)=>{
        modelRequests.push(structuredClone(request));
        const step=request.step_index;
        const operation=step===1?{process_action:'start',process_ref:null,
          source_refs:['fuel-1'],target_refs:['ignition-1']}
          :{process_action:'affect',process_ref:'process-1',
            source_refs:[step===2?'fuel-2':'water-1'],target_refs:[]};
        return turnStepPlan(request,{resolution:'domain_request',
          goal_result:'pending',
          activity:{owner:'domain',duration_class:null,effort:null},
          operations:[{op:'request_world_process',actor_ref:'party-1',
            process_kind:'fire',description:'продолжить огонь',...operation}],
          continuation:step===3?null:{remaining_intent:step===1
            ?'добавить топлива и залить водой':'залить водой',
          depends_on_refs:['process-1']}});
      }
    });
    const result=await runTurnWorkflow({...input(),raw_text:'Развести огонь, '
      +'добавить топлива и залить водой.'},services);
    assert.equal(result.status,'partial');
    assert.deepEqual(modelRequests.slice(1).map((request)=>request
      .player_safe_state.local_world_process.active_process_refs),
    [['process-1'],['process-1']]);
    assert.deepEqual(resolverPriors.map((prior)=>prior.map(
      ({step_index:index})=>index)),
      [[],[1],[1,2]]);
  });

test('ordinary discovery resolver runs only after existing discovery owners',
  async () => {
    let ordinaryCalls = 0;
    let bindingCalls = 0;
    const { services } = createServices([], {
      command: {
        matches: () => false,
        semantic_binding: {
          binding_id: 'authored-discovery',
          operation: 'request_discovery',
          matches() {
            bindingCalls += 1;
            return true;
          }
        }
      },
      playerSafeStateProjector: () => discoveryProjection(),
      turnStepOrdinaryDiscoveryResolver: async () => {
        ordinaryCalls += 1;
        throw new Error('ordinary resolver must not preempt authored discovery');
      },
      turnStepModel: discoveryPlan
    });

    const result = await runTurnWorkflow(input(), services);

    assert.equal(result.status, 'resolved');
    assert.equal(bindingCalls, 1);
    assert.equal(ordinaryCalls, 0);
  });

test('S1 look remainder runs through the final discovery seam', async () => {
  const marker = spatialMarker();
  let spatialCalls = 0;
  const remainder = createServices([], {
    command: { matches: () => false,
      semantic_binding: unmatchedDiscoveryBinding() },
    playerSafeStateProjector: () => discoveryProjection(undefined, marker),
    turnStepSpatialSemanticResolver: async (request) => {
      spatialCalls += 1;
      assert.equal(Object.isFrozen(request), true);
      return ordinaryResult(request);
    },
    turnStepModel: (request) => discoveryPlan(request, 'осматриваю место', 'look')
  }).services;
  await runTurnWorkflow(input(), remainder);
  assert.equal(spatialCalls, 1);
});

test('S1 scope admits visible refs', () => {
  const operation = { op: 'request_discovery', actor_ref: 'party-1',
    discovery_kind: 'look', target_refs: ['place-gate'], query: 'осмотреть' };
  const playerSafeState = discoveryProjection(undefined,
    spatialMarker()).player_safe_state;
  assert.equal(isSpatialSemanticRemainderInScope({ operation,
    playerSafeState }), true);
  assert.equal(isSpatialSemanticRemainderInScope({ operation: {
    ...operation, discovery_kind: 'inspect' }, playerSafeState }), false);
  assert.equal(isSpatialSemanticRemainderInScope({ operation,
    playerSafeState: discoveryProjection(undefined, {
      ...spatialMarker(), extra: true }).player_safe_state }), false);
  const committed={...playerSafeState,visible_objects:[{entity_ref:{entity_kind:'spatial_local_reference',entity_id:'s1-local:resolved'},display_label:'Коряга',recognition:'recognized',visible_status:'замечен'}]};
  assert.equal(isSpatialSemanticRemainderInScope({ operation: { ...operation, target_refs: ['s1-local:resolved'] }, playerSafeState: committed }), true);
  assert.equal(isSpatialSemanticRemainderInScope({ operation: { ...operation, discovery_kind: 'inspect', target_refs: ['s1-local:resolved'] }, playerSafeState: committed }), true);
  const hostileExtra = structuredClone(committed);
  hostileExtra.visible_objects[0].extra = true;
  assert.equal(isSpatialSemanticRemainderInScope({ operation: { ...operation, target_refs: ['s1-local:resolved'] }, playerSafeState: hostileExtra }), false);
  assert.equal(isSpatialSemanticRemainderInScope({ operation: {
    ...operation, target_refs: ['s1-local:forged'] }, playerSafeState: committed }), false);
  assert.equal(isSpatialSemanticRemainderInScope({ operation: {
    op: 'request_item_use', actor_ref: 'party-1', item_ref: 's1-local:resolved',
    use_kind: 'operate', target_refs: []
  }, playerSafeState: committed }), false);
  assert.equal(isSpatialSemanticRemainderInScope({ operation: {
    op: 'request_item_use', actor_ref: 'party-1', item_ref: 's1-local:forged',
    use_kind: 'operate', target_refs: []
  }, playerSafeState: committed }), false);
  let reads = 0;
  const hostile = { ...playerSafeState };
  Object.defineProperty(hostile, 'spatial_semantic', { enumerable: true,
    get() { reads += 1; return spatialMarker(); } });
  assert.equal(isSpatialSemanticRemainderInScope({ operation,
    playerSafeState: hostile }), false);
  assert.equal(reads, 0);
});

test('registered discovery owner preempts the ordinary resolver', async () => {
  let currentDiscoveryCalls = 0;
  let ordinaryCalls = 0;
  const { services } = createServices([], {
    command: {
      matches: () => false,
      semantic_binding: {
        binding_id: 'authored-discovery-fallback',
        operation: 'request_discovery',
        matches: () => true
      }
    },
    playerSafeStateProjector: () => discoveryProjection(),
    turnStepExecutionRegistry: createTurnStepExecutionRegistry({
      domain: {
        request_discovery: async ({ working_projection: value }) => {
          currentDiscoveryCalls += 1;
          return {
            working_projection: value,
            write_fragments: [{
              target: 'party_hidden_state',
              value: { exact_discovery_resolution: true }
            }],
            player_response_boundary: true
          };
        }
      }
    }),
    turnStepOrdinaryDiscoveryResolver: async () => { ordinaryCalls += 1; },
    turnStepModel: discoveryPlan
  });

  await runTurnWorkflow(input(), services);

  assert.equal(currentDiscoveryCalls, 1);
  assert.equal(ordinaryCalls, 0);
});

test('unresolved in-scope inspect and search reach the ordinary seam without query matching',
  async () => {
    const requests = [];
    const { services } = createServices([], {
      command: {
        matches: () => false,
        semantic_binding: unmatchedDiscoveryBinding()
      },
      playerSafeStateProjector: () => discoveryProjection({
        discovery_available: true,
        container_resolution_available: false,
        scene_seed_available: false
      }),
      turnStepOrdinaryDiscoveryResolver: async (request) => {
        requests.push(request);
        return {
          working_projection: {
            ...request.working_projection,
            ordinary_detail_resolved: true
          },
          summary: 'ordinary detail resolved',
          write_fragments: [{
            target: 'party_hidden_state',
            value: { ordinary_detail_resolved: true }
          }],
          player_response_boundary: true
        };
      },
      turnStepModel: (request) => discoveryPlan(request,
        'разглядеть неприметную вещь у старой пристани', 'inspect')
    });

    const result = await runTurnWorkflow(input(), services);

    assert.equal(result.status, 'partial');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].schema,
      'turn_step_ordinary_discovery_request_v1');
    assert.equal(requests[0].operation.query,
      'разглядеть неприметную вещь у старой пристани');
    assert.equal(Object.isFrozen(requests[0]), true);
    assert.equal(Object.isFrozen(requests[0].operation), true);
    assert.equal(Object.isFrozen(requests[0].working_projection), true);
    assert.throws(() => { requests[0].operation.query = 'подмена'; },
      TypeError);
    assert.throws(() => {
      requests[0].working_projection.position.location_ref = 'подмена';
    }, TypeError);

    const search = createServices([], {
      command: {
        matches: () => false,
        semantic_binding: unmatchedDiscoveryBinding()
      },
      playerSafeStateProjector: () => discoveryProjection({
        discovery_available: true,
        container_resolution_available: false,
        scene_seed_available: false
      }),
      turnStepOrdinaryDiscoveryResolver: async (request) => {
        requests.push(request);
        return ordinaryResult(request);
      },
      turnStepModel: (request) => discoveryPlan(request,
        'отыскать то, чего раньше никто не называл', 'search')
    }).services;
    await runTurnWorkflow(input(), search);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].operation.discovery_kind, 'search');
  });

test('eligible visible NPC remainder precedes generic ordinary discovery', () => {
  const playerSafeState = {
    position: { location_ref: 'shore' },
    visible_entities: [{ entity_ref: 'npc:fisher' }],
    ordinary_resolution: { discovery_available: true,
      container_resolution_available: false, scene_seed_available: false },
    background_npc_remainder: { semantic_grounding_available: true,
      eligible_npc_refs: ['npc:fisher'] },
    current_visible_context: { visible_npc: [{ entity_ref: {
      entity_kind: 'npc', entity_id: 'npc:fisher' } }] }
  };
  const owner = resolveTurnStepDomainOwner({
    operation: { op: 'request_discovery', actor_ref: 'party-1',
      discovery_kind: 'inspect', target_refs: ['npc:fisher'],
      query: 'присмотреться' }, plan: {}, request: {}, actor: {},
    playerSafeState, committedState: {}, externalRegistry: { domain: () => null },
    semanticBindings: [], availableOptions: new Set(), preparedChainContext: null,
    services: { turnStepOrdinaryDiscoveryResolver() {},
      turnStepBackgroundNpcResolver() {} },
    isOrdinaryDiscoveryInScope,
    isSpatialSemanticRemainderInScope: () => false,
    isBackgroundNpcSemanticRemainderInScope: ({ operation, playerSafeState: state }) =>
      operation.target_refs[0] === state.background_npc_remainder
        .eligible_npc_refs[0],
    isActionProductionOwnerInScope: () => false
  });
  assert.equal(owner.kind, 'background_npc_remainder');
});

test('ordinary resolver is not called outside enabled physical discovery scope',
  async () => {
    let ordinaryCalls = 0;
    const passThrough = createServices([], {
      command: {
        matches: () => false,
        semantic_binding: unmatchedDiscoveryBinding()
      },
      playerSafeStateProjector: () => discoveryProjection(),
      turnStepOrdinaryDiscoveryResolver: async () => { ordinaryCalls += 1; },
      turnStepExecutionRegistry: createTurnStepExecutionRegistry({
        applySemanticActivity: async ({ working_projection: value }) => ({
          working_projection: value,
          write_fragments: [{
            target: 'party_hidden_state', value: { passed_through: true }
          }],
          player_response_boundary: false
        })
      }),
      turnStepModel: async (request) => turnStepPlan(request)
    }).services;
    const passThroughResult = await runTurnWorkflow(
      { ...input(), raw_text: 'иду дальше' }, passThrough
    );
    assert.equal(passThroughResult.status, 'resolved');
    assert.equal(ordinaryCalls, 0);

    for (const ordinaryResolution of [undefined, {
      discovery_available: false, container_resolution_available: false,
      scene_seed_available: false
    }, {
      discovery_available: true, container_resolution_available: true,
      scene_seed_available: false
    }]) {
      const disabledCapability = createServices([], {
        command: {
          matches: () => false,
          semantic_binding: unmatchedDiscoveryBinding()
        },
        playerSafeStateProjector: () => discoveryProjection(ordinaryResolution),
        turnStepOrdinaryDiscoveryResolver: async () => { ordinaryCalls += 1; },
        turnStepModel: discoveryPlan
      }).services;
      await assert.rejects(() => runTurnWorkflow(input(), disabledCapability), {
        code: 'TURN_STEP_PLAN_INVALID'
      });
    }
    assert.equal(ordinaryCalls, 0);

    const outsideVisibleScope = createServices([], {
      command: { matches: () => false,
        semantic_binding: unmatchedDiscoveryBinding() },
      playerSafeStateProjector: () => discoveryProjection({
        discovery_available: true,
        container_resolution_available: false,
        scene_seed_available: false
      }),
      turnStepOrdinaryDiscoveryResolver: async () => { ordinaryCalls += 1; },
      turnStepModel: (request) => {
        const plan = discoveryPlan(request);
        plan.operations[0].target_refs = ['not-visible'];
        return plan;
      }
    }).services;
    await assert.rejects(() => runTurnWorkflow(input(), outsideVisibleScope), {
      code: 'TURN_STEP_PLAN_INVALID'
    });
    assert.equal(ordinaryCalls, 0);

    const missingPort = createServices([], {
      command: { matches: () => false,
        semantic_binding: unmatchedDiscoveryBinding() },
      playerSafeStateProjector: () => discoveryProjection({
        discovery_available: true,
        container_resolution_available: false,
        scene_seed_available: false
      }),
      turnStepModel: discoveryPlan
    }).services;
    await assert.rejects(() => runTurnWorkflow(input(), missingPort), {
      code: 'TURN_STEP_PLAN_INVALID'
    });
  });

test('listen and remember never reach ordinary resolver, even when enabled',
  async () => {
    let ordinaryCalls = 0;
    for (const discoveryKind of ['listen', 'remember']) {
      const { services } = createServices([], {
        command: { matches: () => false,
          semantic_binding: unmatchedDiscoveryBinding() },
        playerSafeStateProjector: () => discoveryProjection({
          discovery_available: true,
          container_resolution_available: false,
          scene_seed_available: false
        }),
        turnStepOrdinaryDiscoveryResolver: async () => { ordinaryCalls += 1; },
        turnStepModel: (request) => discoveryPlan(request,
          `unseen ${discoveryKind} request`, discoveryKind)
      });
      await assert.rejects(() => runTurnWorkflow(input(), services), {
        code: 'TURN_STEP_PLAN_INVALID'
      });
    }
    assert.equal(ordinaryCalls, 0);
  });

test('ambiguous authored discovery remains fail-closed before ordinary seam',
  async () => {
    let ordinaryCalls = 0;
    const { services } = createServices([], {
      command: { matches: () => false,
        semantic_binding: unmatchedDiscoveryBinding() },
      playerSafeStateProjector: () => discoveryProjection({
        discovery_available: true,
        container_resolution_available: false,
        scene_seed_available: false
      }),
      turnStepOrdinaryDiscoveryResolver: async () => { ordinaryCalls += 1; },
      turnStepModel: discoveryPlan
    });
    const command = services.commandRegistry.get('inspect_cart');
    services.commandRegistry = createTurnCommandRegistry([
      {
        ...command,
        semantic_binding: {
          binding_id: 'authored-discovery-a',
          operation: 'request_discovery', matches: () => true
        }
      },
      {
        ...command,
        command_id: 'inspect_cart_duplicate',
        option_id: 'inspect_cart_duplicate',
        semantic_binding: {
          binding_id: 'authored-discovery-b',
          operation: 'request_discovery', matches: () => true
        }
      }
    ]);
    await assert.rejects(() => runTurnWorkflow(input(), services), {
      code: 'TURN_STEP_DOMAIN_BINDING_AMBIGUOUS'
    });
    assert.equal(ordinaryCalls, 0);
  });

test('ordinary capability gate accepts only an exact own marker without getters',
  () => {
    const operation = {
      op: 'request_discovery', discovery_kind: 'inspect',
      target_refs: ['place-gate'], query: 'необычная формулировка'
    };
    const enabled = discoveryProjection({
      discovery_available: true, container_resolution_available: false,
      scene_seed_available: false
    }).player_safe_state;
    assert.equal(isOrdinaryDiscoveryInScope({
      operation, playerSafeState: enabled
    }), true);
    const sceneLook = { ...operation, discovery_kind: 'look',
      query: 'общий вид ближайшего окружения' };
    assert.equal(isOrdinaryDiscoveryInScope({
      operation: sceneLook, playerSafeState: enabled
    }), false);
    assert.equal(isOrdinaryDiscoveryInScope({
      operation: sceneLook,
      playerSafeState: discoveryProjection({ discovery_available: true,
        container_resolution_available: false,
        scene_seed_available: true }).player_safe_state
    }), true);
    assert.equal(isOrdinaryDiscoveryInScope({
      operation: { ...operation, target_refs: ['position-current'] },
      playerSafeState: discoveryProjection({ discovery_available: true,
        container_resolution_available: false,
        scene_seed_available: false }, {
        semantic_grounding_available: true,
        position_ref: 'position-current'
      }).player_safe_state
    }), true);
    for (const marker of [
      { discovery_available: true },
      { discovery_available: true, container_resolution_available: false,
        scene_seed_available: false,
        unexpected: true }
    ]) {
      assert.equal(isOrdinaryDiscoveryInScope({
        operation, playerSafeState: discoveryProjection(marker).player_safe_state
      }), false);
    }
    const inherited = Object.create({ ordinary_resolution: {
      discovery_available: true, container_resolution_available: false,
      scene_seed_available: false
    } });
    inherited.position = { location_ref: 'place-gate' };
    inherited.visible_entities = [{ entity_ref: 'place-gate' }];
    assert.equal(isOrdinaryDiscoveryInScope({
      operation, playerSafeState: inherited
    }), false);

    let reads = 0;
    const topAccessor = discoveryProjection().player_safe_state;
    Object.defineProperty(topAccessor, 'ordinary_resolution', {
      enumerable: true,
      get() { reads += 1; return enabled.ordinary_resolution; }
    });
    assert.equal(isOrdinaryDiscoveryInScope({
      operation, playerSafeState: topAccessor
    }), false);
    const nestedAccessor = {};
    Object.defineProperty(nestedAccessor, 'discovery_available', {
      enumerable: true,
      get() { reads += 1; return true; }
    });
    Object.defineProperty(nestedAccessor, 'container_resolution_available', {
      enumerable: true, value: false
    });
    Object.defineProperty(nestedAccessor, 'scene_seed_available', {
      enumerable: true, value: false
    });
    assert.equal(isOrdinaryDiscoveryInScope({
      operation,
      playerSafeState: discoveryProjection(nestedAccessor).player_safe_state
    }), false);
    assert.equal(reads, 0);
    assert.equal(isOrdinaryDiscoveryInScope({
      operation: { ...operation, target_refs: ['place-gate', 'another-visible'] },
      playerSafeState: enabled
    }), false);
  });

function unmatchedDiscoveryBinding() {
  return {
    binding_id: 'unmatched-authored-discovery',
    operation: 'request_discovery',
    matches: () => false
  };
}

function discoveryProjection(ordinaryResolution = undefined,
  spatialSemantic = undefined) {
  return {
    actor: { actor_ref: 'party-1' },
    player_safe_state: {
      position: { location_ref: 'place-gate' },
      visible_entities: [{ entity_ref: 'place-gate' }],
      ...(ordinaryResolution === undefined ? {} : {
        ordinary_resolution: ordinaryResolution
      }),
      ...(spatialSemantic === undefined ? {} : {
        spatial_semantic: spatialSemantic
      })
    }
  };
}

function spatialMarker() {
  return { semantic_grounding_available: true,
    position_ref: 'place-gate' };
}

function discoveryPlan(request, query = 'осмотреть неизвестную деталь',
  discoveryKind = 'inspect') {
  return turnStepPlan(request, {
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{
      op: 'request_discovery',
      actor_ref: 'party-1',
      discovery_kind: discoveryKind,
      target_refs: ['place-gate'],
      query
    }],
    continuation: null
  });
}

function ordinaryResult(request) {
  return {
    working_projection: {
      ...request.working_projection,
      ordinary_detail_resolved: true
    },
    summary: 'ordinary detail resolved',
    write_fragments: [{
      target: 'party_hidden_state',
      value: { ordinary_detail_resolved: true }
    }],
    player_response_boundary: true
  };
}
