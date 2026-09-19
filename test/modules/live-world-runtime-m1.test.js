import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import { executeCheck } from '@rus/checks-rng';
import { validateBodyState } from '@rus/body-state';
import {
  planApprovedActorItemTransition
} from '@rus/items-property';
import {
  buildNpcActionDecisionRequestFromSnapshots,
  buildNpcDecisionSignal,
  evaluateNpcDecisionSignals,
  proposeNpcPerception,
  validateNpcActionDecisionRequest
} from '@rus/npc-runtime';
import { requestNpcSemanticDecision } from '@rus/turn';

const PROFILE_URL = new URL(
  '../../data/world-catalogs/novgorod/live-world-runtime-v1/m1-profiles.json',
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
  return JSON.parse(await readFile(PROFILE_URL, 'utf8'));
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
  thiefId, reachable = true } = {}) {
  const sourcePosition = reachable ? 'worn_quick' : 'equipped';
  return {
    party_id: 'm1-party', actor_id: thiefId,
    state_version: 1, expected_state_version: 1,
    item_profiles: { [templateId]: profileSet.profiles.item_mechanics
      .small_personal_item },
    container_profiles: {}, containers: [], container_placements: [],
    items: [{ item_id: itemId, template_id: templateId, quantity: 1 }],
    item_placements: [{ item_id: itemId, holder_npc_id: holderId,
      physical_position: sourcePosition,
      ...(reachable ? {} : { equipment_slot_category_id: 'under_cloak' }) }],
    ownership: [{ item_id: itemId, owner_npc_id: ownerId,
      controller_npc_id: holderId }],
    actor_strengths: { [holderId]: 10, [thiefId]: 10 },
    source: { actor_id: holderId, actor_kind: 'npc',
      controller_actor_id: holderId, physical_position: sourcePosition,
      ...(reachable ? {} : { equipment_slot_category_id: 'under_cloak' }),
      accessibility: reachable ? 'quick' : 'unavailable' },
    destination: { actor_id: thiefId, actor_kind: 'npc',
      controller_actor_id: thiefId, physical_position: 'hands',
      accessibility: 'immediate' },
    approved_transition: profileSet.profiles.property_transition,
    approved_facts: [], item_id: itemId
  };
}

function applyProposal(input, result) {
  return {
    ...input,
    state_version: input.state_version + 1,
    expected_state_version: input.state_version + 1,
    item_placements: [result.proposal.placement],
    ownership: [result.proposal.ownership.next]
  };
}

test('M1 public exports execute a portable causal holder-transfer chain',
  async () => {
    const profileSet = await profiles();
    assert.equal(profileSet.status, 'approved');
    assert.equal(profileSet.applicability.scenario_ref, null);
    assert.deepEqual(Object.values(profileSet.profiles)
      .filter((value) => value?.owner)
      .map(({ owner }) => owner).sort(), [
      '@rus/body-state', '@rus/items-property', '@rus/npc-runtime', '@rus/turn'
    ]);
    assert.equal(validateBodyState({ health: 100, satiety: 70, energy: 80,
      active_conditions: [] }).ok, true);

    const initialPerceptionInput = perceptionRequest({
      perceptionId: 'thief-sees-pouch', observerId: 'thief',
      eventId: 'owner-shows-pouch'
    });
    assert.deepEqual(validateSpatialV3Contract('npc_perception_request',
      initialPerceptionInput.request), []);
    const initialPerception = proposeNpcPerception(initialPerceptionInput);
    assert.equal(initialPerception.ok, true, JSON.stringify(initialPerception));
    assert.equal(initialPerception.perception.result, 'recognized');
    assert.deepEqual(validateSpatialV3Contract('perception_result',
      initialPerception.perception), []);

    const signal = buildNpcDecisionSignal({
      occurred_at: AT, category: 'others', significance: 'material',
      source_event_ref: ref('action_contract', 'owner-shows-pouch'),
      subject_ref: ref('npc', 'thief'), scope_refs: [],
      perception_required: true,
      source_perception_ref: ref('perception_result',
        initialPerception.perception.perception_id),
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
        social_role: { role_ref: 'market-helper' }, attributes: [], skills: [],
        machine_state: {}
      },
      current_activity_snapshot: { activity_ref:
          profileSet.profiles.npc_schedule.profile_id, summary: 'ожидает работу',
        status: 'idle', can_continue_automatically: false },
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
        activity_refs: [profileSet.profiles.activity.profile_id]
      } }
    });
    assert.equal(validateNpcActionDecisionRequest(request), true);
    assert.doesNotMatch(JSON.stringify(request), /owner-keeps-silver/u);
    assert.deepEqual(request.npc.available_resources, []);

    const forcedDecision = await requestNpcSemanticDecision({
      boundary: evaluated.boundary,
      request,
      semanticModel: async () => ({
        schema: 'npc_step_plan_v1', request_id: request.request_id,
        root_turn_id: request.root_turn_id,
        boundary_id: request.boundary_id,
        committed_state_version: request.committed_state_version,
        working_revision: request.working_revision,
        decision_index: request.decision_index, npc_ref: request.npc_ref,
        interpretation: { npc_goal: 'завладеть кошелём',
          grounded_attempt: 'попытаться незаметно снять доступный кошель',
          adaptation: 'literal' },
        resolution: 'domain_request', goal_result: 'pending',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [{ op: 'request_activity', actor_ref: request.npc_ref,
          activity_kind: 'work', target_refs: ['pouch'],
          description: 'Попытаться снять доступный кошель.' }],
        check: null, reason_code: 'opportunity',
        reason: 'Кошель доступен и привлёк внимание.'
      }),
      revalidateStateVersion: async () => 1,
      validatePlan: () => true
    });
    assert.equal(forcedDecision.status, 'planned');
    assert.equal(forcedDecision.plan.interpretation.grounded_attempt,
      'попытаться незаметно снять доступный кошель');

    const input = transitionInput({ profileSet, itemId: 'pouch',
      templateId: 'small-personal-item', ownerId: 'owner', holderId: 'owner',
      thiefId: 'thief' });
    const preflight = planApprovedActorItemTransition(input);
    assert.equal(preflight.pass, true, JSON.stringify(preflight.errors));
    const check = executeCheck({ check_id: 'm1-pouch-reach', difficulty: 10,
      attribute_value: 14, skill_bonus: 2 }, { next: () => 0.75 });
    assert.equal(check.outcome.success, true);
    const after = applyProposal(input, preflight);
    assert.equal(after.item_placements[0].holder_npc_id, 'thief');
    assert.equal(after.ownership[0].owner_npc_id, 'owner');
    assert.equal(after.ownership[0].controller_npc_id, 'thief');

    const ownerPerception = proposeNpcPerception(perceptionRequest({
      perceptionId: 'owner-sees-loss', observerId: 'owner',
      eventId: 'pouch-holder-changed'
    }));
    const distantPerception = proposeNpcPerception(perceptionRequest({
      perceptionId: 'porter-misses-loss', observerId: 'porter',
      eventId: 'pouch-holder-changed', recognized: false
    }));
    assert.equal(ownerPerception.perception.result, 'recognized');
    assert.equal(distantPerception.perception.result, 'not_perceived');

    const nextInput = {
      ...after,
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
    const inaccessible = transitionInput({ profileSet, itemId: 'brooch',
      templateId: 'small-personal-item', ownerId: 'merchant',
      holderId: 'merchant', thiefId: 'apprentice', reachable: false });
    let rolls = 0;
    const preflight = planApprovedActorItemTransition(inaccessible);
    if (preflight.pass) executeCheck({ difficulty: 10 }, {
      next() { rolls += 1; return 0.99; }
    });
    assert.equal(preflight.pass, false);
    assert.equal(preflight.errors[0].code,
      'APPROVED_TRANSITION_SOURCE_ACCESS_MISMATCH');
    assert.equal(rolls, 0);

    const reachable = transitionInput({ profileSet, itemId: 'brooch',
      templateId: 'small-personal-item', ownerId: 'merchant',
      holderId: 'merchant', thiefId: 'apprentice' });
    const validPlan = planApprovedActorItemTransition(reachable);
    assert.equal(validPlan.pass, true);
    const failedCheck = executeCheck({ difficulty: 20, attribute_value: 8 },
      { next: () => 0 });
    assert.equal(failedCheck.outcome.success, false);
    assert.equal(reachable.item_placements[0].holder_npc_id, 'merchant');
    assert.equal(reachable.ownership[0].owner_npc_id, 'merchant');
  });
