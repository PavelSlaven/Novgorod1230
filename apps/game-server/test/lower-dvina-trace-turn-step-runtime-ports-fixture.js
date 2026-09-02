import { readFile } from 'node:fs/promises';
import { createRuntimeInstanceMechanicsSnapshot } from '@rus/items-property';
import { createLowerDvinaTraceTurnStepRuntimePorts } from
  '../src/runtime/lower-dvina-trace-turn-step-runtime-ports.js';
import { createLowerDvinaTracePlayerSafeWorkingProjectionAuthority } from
  '../src/runtime/lower-dvina-trace-player-safe-working.js';

const ownerProfiles = JSON.parse(await readFile(new URL(
  '../../../data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m1-content/turn-step-owner-profiles.json',
  import.meta.url)));

export function execution(operation, workingProjection = projection(), step = 1) {
  return { plan: {}, request: { root_turn_id: 'turn:party:1',
    step_index: step, actor: actor() }, operation,
  working_projection: workingProjection, check_result: null };
}

export function createPorts(options = {}) {
  return createLowerDvinaTraceTurnStepRuntimePorts({ ...options,
    genericCheckContextOwner: options.genericCheckContextOwner
      ?? projectedCheckOwner(),
    ordinaryResultPolicy: options.ordinaryResultPolicy ?? testOrdinaryPolicy(),
    admitAmbientOrdinaryPortion: options.admitAmbientOrdinaryPortion ?? null,
    workingProjectionAuthority:
      createLowerDvinaTracePlayerSafeWorkingProjectionAuthority() });
}

export function testOrdinaryPolicy() {
  const policy = structuredClone(ownerProfiles.ordinary_result_policy);
  policy.candidates.find(({ semantic_type: type, name }) =>
    type === 'material_portion' && name === 'горсть мокрого песка')
    .approved_fact_texts.push('песок теперь лежит плотным влажным комком');
  return policy;
}

export function authorityCommittedState() {
  return { actor_id: 'mikula', player_profile: {
    attributes: { strength: { value: 9 } },
    skills: { athletics: { bonus: 1 } }, inventory: projection().inventory },
  position: { location_ref: 'shore' }, items: [],
  knowledge: projection().knowledge };
}

export function loopInput() {
  return { requestId: 'turn-step:party:1', rootTurnId: 'turn:party:1',
    committedStateVersion: 7, rootPlayerAction: 'выполнить обычное действие',
    actor: actor(), initialWorkingProjection: projection(), maxInternalSteps: 8 };
}

export function actor() {
  return { actor_id: 'mikula', attributes: { strength: { value: 9, bonus: -1 } },
    skills: { athletics: { bonus: 1 } },
    body: { body_parts: { left_arm: { id: 'left_arm' } } } };
}

export function projection() {
  return { actor_id: 'mikula', position: { location_ref: 'shore' },
    destination_refs: ['camp'], inventory: { items: [],
      total_weight: { grams: 400 }, load_category: 'light', occupied_hands: 0 },
    items: [], knowledge: [{ fact_id: 'shore',
      knowledge_state: 'known_from_committed_source',
      text: 'доступный речной берег' }] };
}

export function createSand() {
  return { op: 'create_entity', temp_ref: 'new_entity_1',
    semantic_type: 'material_portion', name: 'горсть мокрого песка',
    origin: { kind: 'ambient_ordinary', source_refs: ['shore'] },
    facts: [{ temp_ref: 'new_fact_1',
      text: 'это мокрый речной песок, набранный с берега' }],
    mechanics: mechanics(),
    placement: { relation: 'held_by', target_ref: 'mikula' } };
}

export function mechanics(overrides = {}) {
  return { mass_grams: 300, external_hand_cost: 1, carry_form: 'compact',
    packing_slot_cost: 1, quantity: { value: 1, unit: 'handful' },
    container: null, ...overrides };
}

export function preparedOrdinary(itemId) {
  return { resolution: 'materialize', item: { item_id: itemId,
    runtime_placement: { scene_position_id: 'shore-position' },
    item_proposal: { semantic_descriptor: {
      semantic_type: 'ordinary_object_candidate', name: 'длинная доска',
      facts: ['доска лежит на берегу'] } },
    mechanics_snapshot: createRuntimeInstanceMechanicsSnapshot({
      schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1,
      provenance: { source_kind: 'ordinary_direct_action_result',
        root_turn_id: 'turn:party:1', step_index: 1,
        operation_ref: 'ordinary:prepared', origin_kind: 'ambient_ordinary',
        source_refs: ['shore'] }, mechanics: mechanics({ mass_grams: 3000,
        external_hand_cost: 1, carry_form: 'long' }) }) } };
}

export function plan(request, overrides = {}) {
  return { schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, step_index: request.step_index,
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent, adaptation: 'literal' },
    resolution: 'direct', goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    operations: [], check: null, continuation: null, clarification: null,
    reason_code: 'ordinary_direct_action', reason: 'Обычное прямое действие.',
    ...overrides };
}

export function genericCheck() {
  const outcome = { goal_result: 'achieved', additional_activity: null,
    operations: [], continuation: null };
  return { purpose: 'удержать обычный предмет', attribute_ref: 'strength',
    skill_ref: 'athletics', difficulty_id: 'ordinary', outcomes: Object.fromEntries([
      'clean_success', 'success', 'success_with_cost',
      'failure_with_consequence', 'severe_failure'
    ].map((band) => [band, structuredClone(outcome)])) };
}

export function activityOwner(overrides = {}) {
  return { async resolve({ activity }) {
    return { profile_ref: 'approved_activity:moment_none',
      profile_pin: { artifact_id: 'test', revision: 1, digest: '1'.repeat(64) },
      duration_minutes: 0, duration_class: activity.duration_class,
      effort: activity.effort, body_effect_ref: null,
      body_effect_profile_ref: 'approved_body_effect:activity',
      exact_deltas: { health: 0, satiety: 0, energy: 0 },
      body_state_after: { health: 100, satiety: 100, energy: 100,
        active_conditions: [], body_parts: {} }, ...overrides };
  } };
}

export function projectedCheckOwner() {
  return { resolve({ check, actor: value }) {
    const attribute = value.attributes?.[check.attribute_ref];
    if (!Number.isFinite(attribute?.value)) throw Object.assign(
      new Error('attribute gap'), { code: 'TRACE_TURN_STEP_CHECK_ATTRIBUTE_DATA_GAP' });
    const skill = check.skill_ref == null ? { bonus: 0 }
      : value.skills?.[check.skill_ref];
    if (!Number.isFinite(skill?.bonus)) throw Object.assign(
      new Error('skill gap'), { code: 'TRACE_TURN_STEP_CHECK_SKILL_DATA_GAP' });
    return { attribute_value: attribute.value, skill_bonus: skill.bonus,
      state_modifier: 0, equipment_modifier: 0, circumstance_modifier: 0,
      policy_profile_ref: 'test_check_policy',
      policy_profile_pin: testPolicyProfilePin(),
      check_policy_ref: { entity_kind: 'check_policy',
        entity_id: 'test_check_policy', authoring_version: '1' },
      consequence_policy_ref: { entity_kind: 'consequence_policy',
        entity_id: 'test_consequence_policy', authoring_version: '1' } };
  } };
}

export function testPolicyProfilePin() {
  return { artifact_id: 'test_turn_step_owner_profiles', revision: 1,
    digest: 'a'.repeat(64) };
}
