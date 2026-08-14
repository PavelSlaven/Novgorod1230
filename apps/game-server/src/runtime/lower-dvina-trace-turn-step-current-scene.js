import { validateVisibleContext } from '@rus/visibility-knowledge-memory';
import { projectLowerDvinaTracePlayerSafeState } from
  './lower-dvina-trace-player-safe-state.js';
import { deepFreeze, plain } from
  './lower-dvina-trace-turn-step-runtime-common.js';

const ARRAY_FIELDS = [
  'visible_changes', 'sensory_details', 'visible_npc', 'visible_objects',
  'known_context', 'uncertainties', 'allowed_tensions', 'do_not_imply'
];

export function withLowerDvinaTraceCurrentScene({
  committedState,
  locationProfiles
}) {
  const initial = committedState?.current_visible_context;
  if (Number(committedState?.party_state?.state_version) === 0
      && validCurrentScene(initial)) {
    return {
      ...committedState,
      current_visible_context: structuredClone(initial)
    };
  }
  const projectionSource = structuredClone(committedState);
  delete projectionSource.current_visible_context;
  const playerSafe = projectLowerDvinaTracePlayerSafeState({
    committed_state: projectionSource,
    actor_id: projectionSource.actor_id
  }).player_safe_state;
  const locationRef = playerSafe.position?.location_ref;
  const matches = Array.isArray(locationProfiles)
    ? locationProfiles.filter(({ location_profile_id: id }) =>
        id === locationRef)
    : [];
  if (matches.length !== 1) failCurrentScene();
  const profile = matches[0];
  const committedEnvironmentFacts = locationRef
      === 'trace_ld_v1_loc_wreck_shore'
    ? projectionSource.environment_snapshot?.facts?.filter(text) ?? []
    : [];
  const sensoryDetails = committedEnvironmentFacts.length > 0
    ? committedEnvironmentFacts
    : [profile.landscape_basis, profile.economic_basis].filter(text);
  if (!text(profile.display_name) || sensoryDetails.length === 0) {
    failCurrentScene();
  }
  const current = {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: profile.display_name,
    visible_changes: [],
    sensory_details: sensoryDetails,
    visible_npc: (playerSafe.npcs ?? []).map(visibleNpc).filter(Boolean),
    visible_objects: [],
    known_context: [profile.display_name],
    uncertainties: [],
    allowed_tensions: [],
    do_not_imply: ['hidden_fact', 'undiscovered_clue']
  };
  if (!validCurrentScene(current)) failCurrentScene();
  return {
    ...committedState,
    current_visible_context: deepFreeze(current)
  };
}

export function projectCurrentSceneForNoOperationDirect({
  input,
  directSeedKeys,
  body
}) {
  if (input?.consequence?.visible_seed?.clarification != null) return null;
  const traces = input?.mode_resolution?.decision_trace?.step_traces;
  const current = input?.retrieved_state?.current_visible_context;
  if (!Array.isArray(traces) || traces.length === 0
      || traces.some(({ approved_plan: plan }) =>
        plan?.resolution !== 'direct'
        || !Array.isArray(plan.operations)
        || plan.operations.length !== 0
        || plan.check !== null)
      || !plain(current)
      || !validateVisibleContext(current).ok
      || ARRAY_FIELDS.some((field) => !Array.isArray(current[field]))) {
    return null;
  }
  return deepFreeze({
    ...structuredClone(current),
    visible_changes: unique([
      ...current.visible_changes,
      ...directSeedKeys
    ]),
    known_context: unique([
      ...current.known_context,
      ...(Number.isFinite(body.health) ? [`health:${body.health}`] : []),
      ...(Number.isFinite(body.satiety) ? [`satiety:${body.satiety}`] : []),
      ...(Number.isFinite(body.energy) ? [`energy:${body.energy}`] : [])
    ]),
    do_not_imply: unique([
      ...current.do_not_imply,
      'hidden_fact',
      'uncommitted_body_delta',
      'uncommitted_time'
    ])
  });
}

function validCurrentScene(value) {
  return plain(value)
    && validateVisibleContext(value).ok
    && ARRAY_FIELDS.every((field) => Array.isArray(value[field]));
}

function visibleNpc(npc) {
  const entityId = npc?.instance_id ?? npc?.actor_id ?? npc?.npc_id;
  const displayLabel = npc?.identity_state?.display_name;
  if (!text(entityId) || !text(displayLabel)) return null;
  return {
    entity_ref: { entity_kind: 'npc', entity_id: entityId },
    display_label: displayLabel
  };
}

function text(value) {
  return typeof value === 'string' && value.length > 0;
}

function failCurrentScene() {
  throw Object.assign(
    new Error('The committed current scene cannot be projected safely.'),
    { code: 'TRACE_CURRENT_SCENE_PROJECTION_INVALID', status: 409 }
  );
}

function unique(values) {
  return [...new Set(values)];
}
