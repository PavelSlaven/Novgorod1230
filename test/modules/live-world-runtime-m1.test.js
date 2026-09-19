import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import { stateModifier, validateBodyState } from '@rus/body-state';
import {
  applyApprovedActorItemTransitionProposal,
  planApprovedActorItemTransition,
  validateApprovedActorItemTransitionProfile
} from '@rus/items-property';
import {
  buildNpcActionDecisionRequestFromSnapshots,
  buildNpcDecisionSignal,
  createNpcRoutineState,
  diagnoseNpcStepPlan,
  evaluateNpcDecisionSignals,
  proposeNpcRoutineTransition,
  validateNpcActionDecisionRequest,
  validateNpcRoutineProfile,
  validateNpcStepPlan
} from '@rus/npc-runtime';
import {
  createTurnStepExecutionRegistry,
  executeTurnStepActorStep,
  requestNpcSemanticDecision
} from '@rus/turn';
import { resolveSpatialV3PerceptionKnowledge } from
  '@rus/turn/spatial-v3-perception-reaction-cycle';

const PROFILE_URL = new URL(
  '../../data/world-catalogs/novgorod/live-world-runtime-v1/m1-profiles.json',
  import.meta.url
);
const MANIFEST_URL = new URL(
  '../../data/world-catalogs/novgorod/live-world-runtime-v1/manifest.json',
  import.meta.url
);
const ACTIVITY_PROFILES_URL = new URL(
  '../../data/world-catalogs/novgorod/temporal-v4/datasets/activity_categories_profiles.json',
  import.meta.url
);
const BODY_PROFILES_URL = new URL(
  '../../data/world-catalogs/novgorod/temporal-v4/datasets/body_time_effect_profiles_thresholds.json',
  import.meta.url
);
const AT = Object.freeze({ whole_minutes: '10',
  subminute_numerator: '0', subminute_denominator: '1' });
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const versioned = (entity_kind, entity_id) => ({
  entity_ref: ref(entity_kind, entity_id), authoring_version: '1'
});
const digest = (value) => computeSpatialV3CanonicalDigest(value);
const seal = (value) => ({ ...value, canonical_digest: digest(value) });
const pin = (dependency_role, value) => ({ dependency_role,
  entity_ref: value.entity_ref,
  version_pin: { pin_kind: 'authoring_version', authoring_version: '1' }
});

async function profiles() {
  const [manifest, profileSet] = await Promise.all([
    readFile(MANIFEST_URL, 'utf8').then(JSON.parse),
    readFile(PROFILE_URL, 'utf8').then(JSON.parse)
  ]);
  assert.equal(manifest.activation, 'not_active');
  assert.equal(manifest.profile_sets[0].profile_set_id,
    profileSet.profile_set_id);
  return profileSet;
}

async function canonicalTemporalProfiles(profileSet) {
  const [activities, bodies] = await Promise.all([
    readFile(ACTIVITY_PROFILES_URL, 'utf8').then(JSON.parse),
    readFile(BODY_PROFILES_URL, 'utf8').then(JSON.parse)
  ]);
  const refs = profileSet.profiles.canonical_temporal_records;
  return {
    activity: activities.find(({ record_id }) =>
      record_id === refs.activity_record_id),
    bodies: refs.body_record_ids.map((recordId) =>
      bodies.find(({ record_id }) => record_id === recordId))
  };
}

function perceptionRequest({ perceptionId, observerId, eventId,
  recognized = true } = {}) {
  const observer = ref('npc', observerId);
  const sourceScope = ref('canonical_spatial_node', 'market-stall');
  const targetScope = ref('canonical_spatial_node', 'market-passage');
  const attention = ref('condition_set', `attention-${observerId}`);
  const recognitionPolicy = versioned('action_contract',
    'ordinary-visual-recognition-v1');
  const visibilityPolicy = versioned('action_contract',
    'ordinary-open-space-visibility-v1');
  const provenance = versioned('source_record', 'm1-profile-set-v1');
  const dependencyPins = seal({ pins: [
    pin('profile', recognitionPolicy), pin('condition', visibilityPolicy),
    pin('source_dependency', provenance)
  ] });
  const payload = {
    perception_id: perceptionId,
    perceiver_ref: observer,
    event_ref: ref('action_contract', eventId),
    perceived_at: AT,
    target_scope_ref: targetScope,
    factual_signal: seal({
      signal_ref: ref('sound_event', `signal-${eventId}`),
      channel: 'visual', source_scope_ref: sourceScope,
      source_ref: ref('item', 'personal-item'), emission_strength: 3,
      signal_state_version: 1,
      player_visibility_class: 'visible_if_perceived'
    }),
    propagation_snapshot: seal({
      source_scope_ref: sourceScope, target_scope_ref: targetScope,
      edges: [seal({
        edge_ref: ref('acoustic_edge', `edge-${observerId}`),
        from_ref: sourceScope, to_ref: targetScope,
        permitted_channels: ['visual'], relation_kind: 'visibility_link',
        relation_state_version: 1, visibility_quality: 'clear',
        distance_band: 'short',
        ...(recognized ? {} : {
          visibility_portal_result: 'blocked',
          portal_ref: ref('portal_entity', `screen-${observerId}`),
          portal_state: 'closed'
        })
      })]
    }),
    environment_snapshot: seal({
      light_state_id: 'bright',
      environment_state_ref: ref('environment_overlay_state', 'market-day'),
      environment_state_version: 1,
      weather_state_ref: ref('weather_state', 'clear-day'),
      weather_state_version: 1, weather_visibility_result: 'clear',
      weather_acoustic_loss: '0',
      target_acoustic_profile_ref: ref('g6_acoustic_profile', 'market'),
      target_acoustic_profile_state_version: 1,
      target_ambient_noise: '0', transient_visibility_result: 'clear',
      transient_acoustic_loss: '0',
      transient_modifier_dependency_pins: dependencyPins,
      visibility_modifiers: []
    }),
    attention_snapshot: seal({
      attention_state_ref: attention, status: 'awake',
      attended_channels: ['visual', 'acoustic'],
      observer_position_ref: { endpoint_kind: 'scene_position',
        endpoint_id: `position-${observerId}` },
      observer_position_state_version: 1, observer_azimuth_mdeg: 0,
      observer_vertical_direction: 'level', visual_capability_level: 3,
      acoustic_capability_level: 3,
      orientation_digest: digest({ azimuth: 0, vertical: 'level' })
    }),
    recognition_snapshot: seal({
      recognition_state_ref: ref('condition_set',
        `recognition-${observerId}`),
      outcome: 'recognized'
    }),
    perception_profile: seal({
      recognition_policy_ref: recognitionPolicy,
      visibility_policy_ref: visibilityPolicy, acoustic_policy_ref: null,
      provenance_ref: provenance, status: 'approved',
      darkness_visual_result_cap: 'perceived_partial',
      sleeping_attention_channels: ['acoustic']
    }),
    expected_state_versions: seal({ entries: [
      { entity_ref: attention, state_version: 1 },
      { entity_ref: observer, state_version: 1 }
    ] }),
    idempotency_key: `perception-${perceptionId}-v1`,
    known_fact_refs: [],
    candidate_knowledge_fact_refs: [ref('knowledge_fact', eventId)],
    dependency_pins: dependencyPins
  };
  return { request: { ...payload, canonical_input_digest: digest(payload) } };
}

function transitionInput({ profileSet, itemId, templateId, ownerId, holderId,
  thiefId, perceptionResult, reachable = true } = {}) {
  const sourcePosition = reachable ? 'worn_quick' : 'equipped';
  return {
    party_id: 'm1-party', actor_id: thiefId,
    state_version: 1, expected_state_version: 1,
    item_profiles: { [templateId]: profileSet.profiles.item_mechanics
      .small_personal_item },
    container_profiles: {}, containers: [], container_placements: [],
    items: [{ item_id: itemId, template_id: templateId,
      instance_class: 'small_personal_item', quantity: 1 }],
    item_placements: [{ item_id: itemId, holder_npc_id: holderId,
      physical_position: sourcePosition,
      ...(reachable ? {} : { equipment_slot_category_id: 'under_cloak' }) }],
    ownership: [{ item_id: itemId, owner_npc_id: ownerId,
      controller_npc_id: holderId }],
    actor_strengths: { [holderId]: 10, [thiefId]: 10 },
    source: { actor_id: holderId, actor_kind: 'npc',
      controller_actor_id: holderId, physical_position: sourcePosition,
      ...(reachable ? {} : { equipment_slot_category_id: 'under_cloak' }),
      accessibility: 'quick' },
    destination: { actor_id: thiefId, actor_kind: 'npc',
      controller_actor_id: thiefId, physical_position: 'hands',
      accessibility: 'immediate' },
    attempting_actor_id: thiefId,
    attempting_actor_scope_ref: 'market-passage',
    source_scope_ref: 'market-passage',
    perceived_item_refs: [itemId],
    attempt_perception: {
      perception_id: perceptionResult.perception_id,
      perceiver_ref: structuredClone(perceptionResult.perceiver_ref),
      result: perceptionResult.result
    },
    approved_transition: profileSet.profiles.property_transition,
    approved_facts: [], item_id: itemId
  };
}

function activityOperation(actorId, itemId) {
  return { op: 'request_activity', actor_ref: actorId,
    activity_kind: 'other', target_refs: [itemId],
    description: 'Попытаться взять физически доступный предмет.' };
}

function genericCheckPlan(request, operation) {
  const outcome = (apply) => ({
    goal_result: apply ? 'achieved' : 'not_achieved',
    additional_activity: null,
    operations: apply ? [operation] : []
  });
  return {
    schema: 'npc_step_plan_v1', request_id: request.request_id,
    root_turn_id: request.root_turn_id, boundary_id: request.boundary_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    decision_index: request.decision_index, npc_ref: request.npc_ref,
    interpretation: { npc_goal: 'завладеть предметом',
      grounded_attempt: 'попытаться взять физически доступный предмет',
      adaptation: 'literal' },
    resolution: 'generic_check', goal_result: 'pending',
    activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' },
    operations: [],
    check: { purpose: 'взять предмет, не дав владельцу помешать',
      attribute_ref: 'agility', skill_ref: 'sleight',
      difficulty_id: 'ordinary', outcomes: {
        clean_success: outcome(true), success: outcome(true),
        success_with_cost: outcome(false),
        failure_with_consequence: outcome(false),
        severe_failure: outcome(false)
      } },
    reason_code: 'opportunity',
    reason: 'Предмет замечен и кажется физически достижимым.'
  };
}

function actorStepRequest(actorId, itemId) {
  return {
    request_id: `m1-${actorId}-${itemId}`,
    root_turn_id: `m1-turn-${actorId}-${itemId}`,
    boundary_id: `m1-boundary-${actorId}-${itemId}`,
    committed_state_version: 1, working_revision: 0,
    decision_index: 1, npc_ref: actorId,
    decision_scope: { operation_contract: { request_activity: {
      allowed: [{ activity_kind: 'other', target_refs: [itemId] }]
    } } }
  };
}

async function executeItemAttempt({ plan, request, transition, randomSource }) {
  let preflight = null;
  let applyCalls = 0;
  const registry = createTurnStepExecutionRegistry({
    domain: { request_activity: async ({ operation, working_projection,
      check_result: checkResult }) => {
      assert.deepEqual(operation, activityOperation(
        transition.attempting_actor_id, transition.item_id));
      assert.equal(checkResult?.outcome.success, true);
      const applied = applyApprovedActorItemTransitionProposal(
        transition, preflight);
      assert.equal(applied.pass, true, JSON.stringify(applied.errors));
      applyCalls += 1;
      return { working_projection: { ...working_projection,
        item_transition_state: applied.state },
      summary: 'Предмет перешёл к новому держателю.' };
    } },
    applySemanticActivity: async ({ working_projection: projection }) => ({
      working_projection: projection, summary: 'Попытка заняла короткое время.'
    }),
    operationContract: request.decision_scope.operation_contract
  });
  const profileDigest = digest(transition.approved_transition)
    .replace(/^sha256:/u, '');
  const result = await executeTurnStepActorStep({
    plan, request: { ...request, step_index: request.decision_index,
      actor: { actor_id: transition.attempting_actor_id,
        attributes: { agility: { value: 14 } },
        skills: { sleight: { bonus: 2 } },
        body: { health: 100, satiety: 70, energy: 80,
          active_conditions: [] } } },
    workingProjection: {}, preparedChainContext: null,
    preparedOrdinaryPlan: null, preparedActionProductionPlans: [],
    registry,
    ports: { randomSource,
      resolveCheckContext: async () => {
        preflight = planApprovedActorItemTransition(transition);
        if (!preflight.pass) throw Object.assign(
          new Error(preflight.errors[0].code), preflight.errors[0]);
        return { attribute_value: 14, skill_bonus: 2,
          state_modifier: stateModifier({ health: 100, satiety: 70,
            energy: 80 }),
          check_policy_ref: { entity_kind: 'action_contract',
            entity_id: 'm1-item-attempt-check', authoring_version: '1' },
          consequence_policy_ref: { entity_kind: 'action_contract',
            entity_id: 'm1-item-attempt-consequence', authoring_version: '1' },
          policy_profile_ref:
            transition.approved_transition.transition_profile_id,
          policy_profile_pin: { artifact_id:
              transition.approved_transition.transition_profile_id,
            revision: transition.approved_transition.version,
            digest: profileDigest } };
      } }
  });
  return { result, applyCalls };
}

test('M1 public exports execute a portable causal holder-transfer chain',
  async () => {
    const profileSet = await profiles();
    const temporalProfiles = await canonicalTemporalProfiles(profileSet);
    assert.equal(profileSet.status, 'approved');
    assert.equal(profileSet.applicability.scenario_ref, null);
    assert.equal(validateApprovedActorItemTransitionProfile(
      profileSet.profiles.property_transition).ok, true);
    assert.equal(validateNpcRoutineProfile(
      profileSet.profiles.npc_schedule).profile_id,
    'ordinary_local_work_cycle_v1');
    assert.equal(temporalProfiles.activity.status, 'approved');
    assert.equal(temporalProfiles.bodies.every((record) =>
      record?.status === 'approved'), true);
    assert.equal(validateBodyState({ health: 100, satiety: 70, energy: 80,
      active_conditions: [] }).ok, true);

    const routine = createNpcRoutineState({
      profile: profileSet.profiles.npc_schedule, started_at: {
        whole_minutes: '0', subminute_numerator: '0',
        subminute_denominator: '1'
      }, current_activity: { activity_ref: 'market-help',
        summary: 'Ищет обычную работу на торгу.' }
    });
    const routineTransition = proposeNpcRoutineTransition({
      runtime: routine, scheduled_at: { whole_minutes: '60',
        subminute_numerator: '0', subminute_denominator: '1' },
      npc_state: { npc_ref: ref('npc', 'thief'), state_version: '1',
        current_activity_execution_ref: null,
        placement_ref: ref('entity_placement', 'position-thief'),
        attention_state_ref: ref('condition_set', 'attention-thief'),
        body_state_ref: ref('body_state', 'body-thief'),
        knowledge_state_ref: ref('knowledge_fact', 'knowledge-thief'),
        relationship_state_ref: ref('condition_set', 'relations-thief') },
      recheck_snapshot: { observed_state_version: '1',
        placement_ref: ref('entity_placement', 'position-thief'),
        access_ok: true, orders_ok: true, danger_ok: true, body_ok: true,
        activity_ok: true }
    });
    assert.equal(routineTransition.ok, true);
    assert.equal(routineTransition.factual_transition.decision_required, true);

    const initialPerceptionInput = perceptionRequest({
      perceptionId: 'thief-sees-pouch', observerId: 'thief',
      eventId: 'owner-shows-pouch'
    });
    assert.deepEqual(validateSpatialV3Contract('npc_perception_request',
      initialPerceptionInput.request), []);
    const initialPerception = resolveSpatialV3PerceptionKnowledge({
      perception_request: initialPerceptionInput.request,
      knowledge_state_before: { fact_refs: [], hypothesis_refs: [],
        state_version: 1 }
    });
    assert.equal(initialPerception.ok, true, JSON.stringify(initialPerception));
    assert.equal(initialPerception.perception_result.result, 'recognized');
    assert.deepEqual(validateSpatialV3Contract('perception_result',
      initialPerception.perception_result), []);
    assert.equal(initialPerception.knowledge_merge_result.state_version_after,
      2);

    const signal = buildNpcDecisionSignal({
      occurred_at: AT, category: 'others', significance: 'material',
      source_event_ref: ref('action_contract', 'owner-shows-pouch'),
      subject_ref: ref('npc', 'thief'), scope_refs: [],
      perception_required: true,
      source_perception_ref: ref('perception_result',
        initialPerception.perception_result.perception_id),
      causal_parent_refs: []
    });
    const evaluated = evaluateNpcDecisionSignals({
      npc_ref: ref('npc', 'thief'), active_mode: 'autonomous',
      current_intent: null, decision_capability: true,
      resolved_signals: [signal], consumed_signal_ids: [],
      same_time_batch_ref: ref('temporal_batch', 'm1-batch'),
      state_version: '1'
    });
    assert.equal(evaluated.boundary.decision_mode, 'autonomous');

    const request = buildNpcActionDecisionRequestFromSnapshots({
      request_identity: { request_id: 'm1-decision', root_turn_id: 'm1-turn',
        committed_state_version: 1, working_revision: 0,
        decision_index: 1 },
      boundary: evaluated.boundary,
      npc_snapshot: {
        instance_id: 'thief', profile_level: 'scene',
        identity_state: { canonical_name: 'Гаврила',
          hidden_secret: 'owner-keeps-silver-at-home' },
        social_role: { role_ref: 'market-helper' },
        attributes: [{ attribute_ref: 'agility', label: 'Ловкость',
          value: 14 }],
        skills: [{ skill_ref: 'sleight', label: 'Ловкость рук', value: 2 }],
        machine_state: {}
      },
      current_activity_snapshot: routineTransition.activity_after,
      body_snapshot: { summary: 'может действовать', conditions: [] },
      resource_snapshots: [{ resource_ref: 'pouch', template_ref: 'pouch',
        holder_npc_id: 'owner' }],
      perception_snapshot: {
        perceived_changes: [{
          source_event_ref: ref('action_contract', 'owner-shows-pouch'),
          summary: 'Хозяин показал небольшой поясной кошель.'
        }],
        visible_objects: [{ object_ref: 'pouch', summary: 'поясной кошель',
          source_event_ref: ref('action_contract', 'owner-shows-pouch') }]
      },
      knowledge_snapshot: { known_facts: [] },
      memory_snapshot: { recent_events: [] },
      resolved_signals: [signal],
      operation_contract: { request_activity: {
        allowed: [{ activity_kind: 'other',
          target_refs: ['pouch'] }]
      } }
    });
    assert.equal(validateNpcActionDecisionRequest(request), true);
    assert.doesNotMatch(JSON.stringify(request), /owner-keeps-silver/u);
    assert.deepEqual(request.npc.available_resources, []);

    const forcedPlan = genericCheckPlan(request,
      activityOperation('thief', 'pouch'));
    assert.equal(validateNpcStepPlan(forcedPlan, request), true,
      JSON.stringify(diagnoseNpcStepPlan(forcedPlan, request)));
    const unrelatedPlan = genericCheckPlan(request, {
      ...activityOperation('thief', 'pouch'),
      activity_kind: 'work', target_refs: ['hidden-house']
    });
    assert.equal(validateNpcStepPlan(unrelatedPlan, request), false);
    const forcedDecision = await requestNpcSemanticDecision({
      boundary: evaluated.boundary,
      request,
      semanticModel: async () => forcedPlan,
      revalidateStateVersion: async () => 1
    });
    assert.equal(forcedDecision.status, 'planned');

    const input = transitionInput({ profileSet, itemId: 'pouch',
      templateId: 'small-personal-item', ownerId: 'owner', holderId: 'owner',
      thiefId: 'thief',
      perceptionResult: initialPerception.perception_result });
    const executed = await executeItemAttempt({ plan: forcedDecision.plan,
      request, transition: input, randomSource: { next: () => 0.75 } });
    assert.equal(executed.result.checkResult.outcome.success, true);
    assert.equal(executed.applyCalls, 1);
    const after = executed.result.workingProjection.item_transition_state;
    assert.equal(after.item_placements[0].holder_npc_id, 'thief');
    assert.equal(after.ownership[0].owner_npc_id, 'owner');
    assert.equal(after.ownership[0].controller_npc_id, 'thief');

    const ownerPerception = resolveSpatialV3PerceptionKnowledge({
      perception_request: perceptionRequest({ perceptionId: 'owner-sees-loss',
        observerId: 'owner', eventId: 'pouch-holder-changed' }).request,
      knowledge_state_before: { fact_refs: [], hypothesis_refs: [],
        state_version: 1 }
    });
    const distantPerception = resolveSpatialV3PerceptionKnowledge({
      perception_request: perceptionRequest({
        perceptionId: 'porter-misses-loss', observerId: 'porter',
        eventId: 'pouch-holder-changed', recognized: false }).request,
      knowledge_state_before: { fact_refs: [], hypothesis_refs: [],
        state_version: 1 }
    });
    assert.equal(ownerPerception.perception_result.result, 'recognized');
    assert.equal(distantPerception.perception_result.result, 'not_perceived');

    const nextInput = {
      ...after,
      approved_transition: profileSet.profiles.property_transition,
      approved_facts: [], item_id: 'pouch',
      source: { actor_id: 'thief', actor_kind: 'npc',
        controller_actor_id: 'thief', physical_position: 'hands',
        accessibility: 'immediate' },
      destination: { actor_id: 'accomplice', actor_kind: 'npc',
        controller_actor_id: 'accomplice', physical_position: 'hands',
        accessibility: 'immediate' },
      actor_strengths: { ...after.actor_strengths, accomplice: 10 }
    };
    const nextAction = planApprovedActorItemTransition(nextInput);
    assert.equal(nextAction.pass, true, JSON.stringify(nextAction.errors));
    assert.equal(nextAction.proposal.placement.item_id, 'pouch');
    assert.equal(nextAction.proposal.ownership.next.owner_npc_id, 'owner');
    assert.equal(nextAction.proposal.ownership.next.controller_npc_id,
      'accomplice');
  });

test('M1 preflight blocks unreachable target before RNG and failure keeps state',
  async () => {
    const profileSet = await profiles();
    const attemptPerception = resolveSpatialV3PerceptionKnowledge({
      perception_request: perceptionRequest({
        perceptionId: 'apprentice-sees-brooch', observerId: 'apprentice',
        eventId: 'merchant-shows-brooch' }).request,
      knowledge_state_before: { fact_refs: [], hypothesis_refs: [],
        state_version: 1 }
    }).perception_result;
    const inaccessible = transitionInput({ profileSet, itemId: 'brooch',
      templateId: 'small-personal-item', ownerId: 'merchant',
      holderId: 'merchant', thiefId: 'apprentice',
      perceptionResult: attemptPerception, reachable: false });
    let rolls = 0;
    const request = actorStepRequest('apprentice', 'brooch');
    const plan = genericCheckPlan(request,
      activityOperation('apprentice', 'brooch'));
    await assert.rejects(executeItemAttempt({ plan, request,
      transition: inaccessible, randomSource: {
        next() { rolls += 1; return 0.99; }
      } }), ({ code }) =>
      code === 'APPROVED_TRANSITION_ATTEMPT_ACCESS_DENIED');
    assert.equal(rolls, 0);

    const wrongClass = structuredClone(inaccessible);
    wrongClass.items[0].instance_class = 'bulky_trade_goods';
    wrongClass.source.physical_position = 'worn_quick';
    delete wrongClass.source.equipment_slot_category_id;
    wrongClass.item_placements[0].physical_position = 'worn_quick';
    delete wrongClass.item_placements[0].equipment_slot_category_id;
    assert.equal(planApprovedActorItemTransition(wrongClass).errors[0].code,
      'APPROVED_TRANSITION_INSTANCE_CLASS_MISMATCH');
    assert.equal(rolls, 0);

    const reachable = transitionInput({ profileSet, itemId: 'brooch',
      templateId: 'small-personal-item', ownerId: 'merchant',
      holderId: 'merchant', thiefId: 'apprentice',
      perceptionResult: attemptPerception });
    const validPlan = planApprovedActorItemTransition(reachable);
    assert.equal(validPlan.pass, true);
    const forged = structuredClone(validPlan);
    forged.proposal.ownership.next.owner_npc_id = 'apprentice';
    assert.equal(applyApprovedActorItemTransitionProposal(
      reachable, forged).pass, false);
    const failed = await executeItemAttempt({ plan, request,
      transition: reachable, randomSource: {
        next() { rolls += 1; return 0; }
      } });
    assert.equal(failed.result.checkResult.outcome.success, false);
    assert.equal(failed.applyCalls, 0);
    assert.equal(failed.result.workingProjection.item_transition_state,
      undefined);
    assert.equal(rolls, 1);
    assert.equal(reachable.item_placements[0].holder_npc_id, 'merchant');
    assert.equal(reachable.ownership[0].owner_npc_id, 'merchant');
  });
