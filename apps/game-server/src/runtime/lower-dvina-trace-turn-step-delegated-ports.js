import {
  ACTIVITY_SCHEMA,
  applied,
  collectCurrentRefs,
  deepFreeze,
  directFragment,
  fail,
  nextActivityIdentity,
  nextOperationIdentity,
  plain,
  requireProjection,
  requireRef,
  text,
  visibleKey
} from './lower-dvina-trace-turn-step-runtime-common.js';
const DURATION_CLASSES = new Set(['moment', 'brief', 'short', 'extended']);
const EFFORTS = new Set([
  'none', 'light', 'moderate', 'heavy', 'extreme'
]);

export function resolveLowerDvinaTraceTurnStepCheckContext({
  check,
  actor,
  working_projection: projection
} = {}, genericCheckContextOwner = null) {
  requireProjection(projection);
  if (!plain(check) || !plain(actor)
      || projection.actor_id !== actor.actor_id) {
    fail('TRACE_TURN_STEP_CHECK_CONTEXT_INVALID');
  }
  if (typeof genericCheckContextOwner?.resolve !== 'function') {
    fail('TRACE_TURN_STEP_CHECK_CONTEXT_OWNER_MISSING');
  }
  const resolved = genericCheckContextOwner.resolve(deepFreeze({
    check: structuredClone(check),
    actor: structuredClone(actor),
    working_projection: structuredClone(projection)
  }));
  const keys = [
    'attribute_value', 'skill_bonus', 'state_modifier',
    'equipment_modifier', 'circumstance_modifier', 'policy_profile_ref',
    'policy_profile_pin', 'check_policy_ref', 'consequence_policy_ref'
  ];
  if (!plain(resolved) || !exactKeys(resolved, keys)
      || keys.slice(0, 5).some((key) => !Number.isFinite(resolved[key]))
      || !text(resolved.policy_profile_ref)
      || !validProfilePin(resolved.policy_profile_pin)
      || !validPolicyRef(resolved.check_policy_ref, 'check_policy')
      || resolved.policy_profile_ref
        !== resolved.check_policy_ref.entity_id
      || !validPolicyRef(
        resolved.consequence_policy_ref, 'consequence_policy')) {
    fail('TRACE_TURN_STEP_CHECK_CONTEXT_OWNER_INVALID');
  }
  return deepFreeze(structuredClone(resolved));
}

function validProfilePin(value) {
  return plain(value) && exactKeys(value, [
    'artifact_id', 'revision', 'digest'
  ]) && text(value.artifact_id)
    && Number.isSafeInteger(value.revision) && value.revision >= 1
    && typeof value.digest === 'string'
    && /^[a-f0-9]{64}$/u.test(value.digest);
}

function validPolicyRef(value, kind) {
  return plain(value) && exactKeys(value, [
    'entity_kind', 'entity_id', 'authoring_version'
  ]) && value.entity_kind === kind && text(value.entity_id)
    && text(value.authoring_version);
}

export async function applyBodyEvent(execution, state, bodyEventOwner) {
  const { operation, working_projection: projection } = execution;
  requireProjection(projection);
  const refs = collectCurrentRefs(execution);
  requireRef(operation.actor_ref, refs, 'actor_ref');
  if (operation.actor_ref !== projection.actor_id
      || operation.actor_ref !== execution.request.actor.actor_id) {
    fail('TRACE_TURN_STEP_BODY_ACTOR_INVALID');
  }
  if (operation.body_part_ref != null) {
    requireRef(operation.body_part_ref, refs, 'body_part_ref');
  }
  if (typeof bodyEventOwner?.resolve !== 'function') {
    fail('TRACE_TURN_STEP_BODY_EVENT_OWNER_MISSING');
  }
  const resolved = await bodyEventOwner.resolve(deepFreeze({
    event: structuredClone(operation),
    actor: {
      ...structuredClone(execution.request.actor),
      body: structuredClone(execution.prepared_chain_context?.current_body_state
        ?? execution.request.actor?.body)
    },
    working_projection: structuredClone(projection),
    check_result: structuredClone(execution.check_result)
  }));
  if (!plain(resolved) || !exactKeys(resolved, [
    'body_effect_ref', 'composite_body_effect_ref', 'payload'
  ]) || !text(resolved.body_effect_ref)
      || !text(resolved.composite_body_effect_ref)
      || !plain(resolved.payload)
      || resolved.payload.body_effect_ref !== resolved.body_effect_ref
      || !plain(resolved.payload.profile_pin)
      || !plain(resolved.payload.state_after)) {
    fail('TRACE_TURN_STEP_BODY_EVENT_OWNER_INVALID');
  }
  const identity = nextOperationIdentity(execution, state);
  return deepFreeze({
    ...applied({
    projection,
    summary: `body_event:${operation.mechanism}`,
    fragment: directFragment(identity, 'party_state', {
      actor_ref: operation.actor_ref,
      body_effect_ref: resolved.body_effect_ref,
      payload: structuredClone(resolved.payload)
    }),
    consequence: {
      body_effect_ref: resolved.composite_body_effect_ref,
      hidden_update: {
        [visibleKey(identity)]: structuredClone(resolved.payload)
      },
      visible_seed: {
        [visibleKey(identity)]: {
          kind: 'body_event',
          mechanism: operation.mechanism,
          severity: operation.severity,
          body_part_ref: operation.body_part_ref,
          description: operation.description
        }
      },
      state_changes: [{
        kind: 'direct_body_event',
        operation_id: identity.operation_id,
        body_effect_profile_ref: resolved.body_effect_ref,
        profile_pin: structuredClone(resolved.payload.profile_pin),
        body_effect_context:
          structuredClone(resolved.payload.selected_context)
      }]
    },
      boundary: true
    }),
    body_state_after: structuredClone(resolved.payload.state_after)
  });
}

export async function applySemanticActivity(execution, state,
  semanticActivityOwner) {
  const activity = execution.operation?.activity;
  requireProjection(execution.working_projection);
  if (!plain(activity) || activity.owner !== 'semantic'
      || !DURATION_CLASSES.has(activity.duration_class)
      || !EFFORTS.has(activity.effort)) {
    fail('TRACE_TURN_STEP_SEMANTIC_ACTIVITY_INVALID');
  }
  if (typeof semanticActivityOwner?.resolve !== 'function') {
    fail('TRACE_TURN_STEP_SEMANTIC_ACTIVITY_OWNER_MISSING');
  }
  const chainContext = execution.prepared_chain_context;
  const bodyStateBefore = structuredClone(chainContext?.current_body_state
    ?? execution.request.actor?.body);
  const resolved = await semanticActivityOwner.resolve(deepFreeze({
    activity: structuredClone(activity),
    actor: {
      ...structuredClone(execution.request.actor),
      body: structuredClone(bodyStateBefore)
    },
    working_projection: structuredClone(execution.working_projection),
    check_result: structuredClone(execution.check_result)
  }));
  if (!plain(resolved) || !exactKeys(resolved, [
    'profile_ref', 'profile_pin', 'duration_class', 'effort',
    'duration_minutes', 'body_effect_ref', 'body_effect_profile_ref',
    'exact_deltas', 'body_state_after'
  ]) || !text(resolved.profile_ref) || !plain(resolved.profile_pin)
      || !Number.isInteger(resolved.duration_minutes)
      || resolved.duration_minutes < 0
      || resolved.duration_class !== activity.duration_class
      || resolved.effort !== activity.effort
      || (resolved.body_effect_ref !== null
        && !text(resolved.body_effect_ref))
      || !text(resolved.body_effect_profile_ref)
      || !plain(resolved.exact_deltas)
      || !plain(resolved.body_state_after)) {
    fail('TRACE_TURN_STEP_SEMANTIC_ACTIVITY_OWNER_INVALID');
  }
  const duration = resolved.duration_minutes;
  if (chainContext?.prior_effect_count > 0 && duration === 0) {
    fail('TRACE_TURN_STEP_PREPARED_SEMANTIC_ACTIVITY_DURATION_INVALID');
  }
  const identity = nextActivityIdentity(execution, state);
  const changesBody = Object.values(resolved.exact_deltas)
    .some((value) => value !== 0);
  const fragment = {
      target: 'party_events',
      value: {
        version: 1,
        schema: ACTIVITY_SCHEMA,
        activity_id: identity.activity_id,
        root_turn_id: identity.root_turn_id,
        step_index: identity.step_index,
        profile_ref: resolved.profile_ref,
        duration_class: activity.duration_class,
        duration_minutes: duration,
        effort: activity.effort
      }
    };
  const consequence = {
      duration_minutes: duration,
      ...(resolved.body_effect_ref == null ? {} : {
        body_effect_ref: resolved.body_effect_ref
      }),
      visible_seed: {
        [visibleKey(identity)]: {
          kind: 'semantic_activity',
          profile_ref: resolved.profile_ref,
          duration_class: activity.duration_class,
          duration_minutes: duration,
          effort: activity.effort
        }
      },
      state_changes: [{
        kind: 'semantic_activity',
        activity_id: identity.activity_id,
        profile_ref: resolved.profile_ref,
        profile_pin: structuredClone(resolved.profile_pin),
        duration_class: activity.duration_class,
        effort: activity.effort,
        body_effect_profile_ref: resolved.body_effect_profile_ref,
        body_effect_context: {
          kind: 'semantic_activity',
          duration_class: activity.duration_class,
          effort: activity.effort
        }
      }]
    };
  let preparedEffectRequest = null;
  if (chainContext?.prior_effect_count > 0) {
    if (changesBody) {
      fail('TRACE_TURN_STEP_PREPARED_BODY_COMPOSITE_REQUIRED');
    }
    preparedEffectRequest = {
      effect_kind: 'semantic_activity',
      owner_ref: resolved.profile_ref,
      operation_ref: identity.activity_id,
      availability: null,
      consequence: structuredClone(consequence)
    };
  }
  const output = applied({
    projection: execution.working_projection,
    summary: `semantic_activity:${activity.duration_class}:${activity.effort}`,
    fragment,
    consequence,
    boundary: duration > 0 || changesBody
  });
  const withBody = {
    ...output,
    body_state_after: structuredClone(resolved.body_state_after)
  };
  return preparedEffectRequest == null ? deepFreeze(withBody) : deepFreeze({
    ...withBody,
    prepared_effect_request: preparedEffectRequest
  });
}

function exactKeys(value, keys) {
  return plain(value) && Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => keys.includes(key));
}
