import {
  exact,
  invalid,
  plain,
  requireMechanics,
  step,
  text,
  uniqueTexts
} from './lower-dvina-trace-turn-step-persistence-support.js';

const DIRECT_SCHEMA =
  'rus.lower_dvina_trace_turn_step_direct_operation.v1';
const ACTIVITY_SCHEMA =
  'rus.lower_dvina_trace_turn_step_semantic_activity.v1';
const ITEM_KINDS = new Set([
  'create_entity', 'move_entity', 'change_entity_facts',
  'set_entity_mechanics', 'retire_entity', 'request_container_access'
]);
const DURATION_CLASSES = new Set(['moment', 'brief', 'short', 'extended']);
const EFFORTS = new Set([
  'none', 'light', 'moderate', 'heavy', 'extreme'
]);

export function validateFragment(fragment, batch, index) {
  const value = fragment.value;
  if (fragment.target === 'party_events') {
    exact(value, [
      'version', 'schema', 'activity_id', 'root_turn_id', 'step_index',
      'profile_ref', 'duration_class', 'duration_minutes', 'effort'
    ], index);
    if (value.version !== 1 || value.schema !== ACTIVITY_SCHEMA
        || value.root_turn_id !== batch.root_turn_id
        || !text(value.activity_id) || !text(value.profile_ref)
        || !step(value.step_index)
        || !DURATION_CLASSES.has(value.duration_class)
        || !EFFORTS.has(value.effort)
        || !Number.isSafeInteger(value.duration_minutes)
        || value.duration_minutes < 0) invalid(index, 'semantic activity');
    return;
  }
  if (!['party_items', 'party_containers', 'party_state']
    .includes(fragment.target)) {
    invalid(index, 'write target');
  }
  exact(value, [
    'version', 'schema', 'operation_id', 'root_turn_id', 'step_index',
    'operation_kind', 'payload'
  ], index);
  if (value.version !== 1 || value.schema !== DIRECT_SCHEMA
      || value.root_turn_id !== batch.root_turn_id
      || !text(value.operation_id) || !step(value.step_index)
      || !plain(value.payload)) invalid(index, 'direct operation envelope');
  if (fragment.target === 'party_state') {
    if (value.operation_kind !== 'apply_body_event') {
      invalid(index, 'party_state operation kind');
    }
    exact(value.payload, ['actor_ref', 'body_effect_ref', 'payload'], index);
    if (!text(value.payload.actor_ref)
        || !text(value.payload.body_effect_ref)
        || !plain(value.payload.payload)) invalid(index, 'body event payload');
    return;
  }
  if (!ITEM_KINDS.has(value.operation_kind)) {
    invalid(index, 'item/container operation kind');
  }
  validateItemPayload(value.operation_kind, value.payload, index);
}

export function validatePlacementShape(value, index = null) {
  if (!plain(value)) invalid(index, 'placement');
  if (Object.hasOwn(value, 'relation')) {
    exact(value, ['relation', 'target_ref'], index);
    if (!['held_by', 'worn_by', 'inside', 'located_at', 'attached_to']
      .includes(value.relation) || !text(value.target_ref)) {
      invalid(index, 'placement relation');
    }
    return;
  }
  const fields = [
    'holder_character_id', 'holder_npc_id', 'location_ref', 'container_id',
    'attached_item_id'
  ].filter((key) => value[key] != null);
  const allowed = new Set([
    ...fields, 'physical_position', 'equipment_slot_category_id'
  ]);
  const actorHolder = ['holder_character_id', 'holder_npc_id']
    .includes(fields[0]);
  if (fields.length !== 1
      || Object.keys(value).some((key) => !allowed.has(key))
      || fields.some((key) => !text(value[key]))
      || (actorHolder
        && !['hands', 'worn', 'worn_quick', 'equipped', 'external',
          'external_load'].includes(value.physical_position))
      || (actorHolder && value.physical_position === 'equipped')
        !== Boolean(text(value.equipment_slot_category_id))
      || (!actorHolder
        && (value.physical_position != null
          || value.equipment_slot_category_id != null))) {
    invalid(index, 'placement');
  }
}

function validateItemPayload(kind, payload, index) {
  const fields = {
    create_entity: [
      'temp_ref', 'entity_ref', 'semantic_type', 'name', 'origin', 'facts',
      'runtime_instance_mechanics_snapshot', 'placement'
    ],
    move_entity: payload.authored_source == null
      ? ['entity_ref', 'placement']
      : payload.actor_transition == null
        ? ['entity_ref', 'placement', 'authored_source']
        : [
            'entity_ref', 'placement', 'authored_source', 'actor_transition'
          ],
    change_entity_facts: ['entity_ref', 'remove_fact_refs', 'add_facts'],
    set_entity_mechanics: [
      'entity_ref', 'reason', 'runtime_instance_mechanics_snapshot'
    ],
    retire_entity: ['entity_ref', 'reason'],
    request_container_access: [
      'container_ref', 'access_kind', 'state_patch', 'revealed_refs'
    ]
  }[kind];
  exact(payload, fields, index);
  if (kind !== 'request_container_access' && !text(payload.entity_ref)) {
    invalid(index, 'entity_ref');
  }
  if (kind === 'create_entity') {
    validatePlacementShape(payload.placement, index);
    validateFacts(payload.facts, index);
    if (!text(payload.temp_ref) || !text(payload.semantic_type)
        || !text(payload.name) || !plain(payload.origin)
        || !uniqueTexts(payload.origin.source_refs)) {
      invalid(index, 'create payload');
    }
    exact(payload.origin, ['kind', 'source_refs'], index);
    if (!['direct_partition', 'ambient_ordinary', 'crafted']
      .includes(payload.origin.kind)) invalid(index, 'origin kind');
    requireMechanics(payload.runtime_instance_mechanics_snapshot);
  }
  if (kind === 'move_entity') {
    validatePlacementShape(payload.placement, index);
    if (payload.authored_source != null) {
      exact(payload.authored_source, [
        'item_id', 'template_id', 'profile_id', 'source_digest'
      ], index);
      if (!text(payload.authored_source.item_id)
          || !text(payload.authored_source.template_id)
          || payload.authored_source.profile_id !== null
            && !text(payload.authored_source.profile_id)
          || !text(payload.authored_source.source_digest)) {
        invalid(index, 'authored source proof');
      }
    }
    if (payload.actor_transition != null) {
      exact(payload.actor_transition, ['schema', 'version'], index);
      if (payload.authored_source == null
          || payload.actor_transition.schema
            !== 'rus.approved_actor_item_transition.v1'
          || payload.actor_transition.version !== 1) {
        invalid(index, 'actor item transition');
      }
    }
  }
  if (kind === 'change_entity_facts') {
    if (!uniqueTexts(payload.remove_fact_refs)) {
      invalid(index, 'remove_fact_refs');
    }
    validateFacts(payload.add_facts, index);
  }
  if (kind === 'set_entity_mechanics') {
    if (!text(payload.reason)) invalid(index, 'mechanics reason');
    requireMechanics(payload.runtime_instance_mechanics_snapshot);
  }
  if (kind === 'retire_entity' && !text(payload.reason)) {
    invalid(index, 'retirement reason');
  }
  if (kind === 'request_container_access') {
    if (!text(payload.container_ref)
        || !['open', 'close', 'unlock', 'force', 'open_and_view']
          .includes(payload.access_kind)
        || !uniqueTexts(payload.revealed_refs)
        || payload.state_patch !== null
          && (!plain(payload.state_patch)
            || Object.keys(payload.state_patch).some((key) =>
              !['open_state', 'contents_state', 'access_state']
                .includes(key)))) {
      invalid(index, 'container access payload');
    }
  }
}

function validateFacts(value, index) {
  if (!Array.isArray(value)) invalid(index, 'facts');
  const ids = new Set();
  for (const fact of value) {
    exact(fact, ['fact_id', 'temp_ref', 'text'], index);
    if (!text(fact.fact_id) || !text(fact.temp_ref) || !text(fact.text)
        || ids.has(fact.fact_id)) invalid(index, 'facts');
    ids.add(fact.fact_id);
  }
}
