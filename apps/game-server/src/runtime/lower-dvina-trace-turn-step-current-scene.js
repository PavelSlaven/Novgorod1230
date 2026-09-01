import { validateVisibleContext } from '@rus/visibility-knowledge-memory';
import {
  projectLowerDvinaTracePlayerSafeState,
  projectLowerDvinaTraceVisibleNpcDetails
} from
  './lower-dvina-trace-player-safe-state.js';
import { deepFreeze, plain } from
  './lower-dvina-trace-turn-step-runtime-common.js';
import { scenePresentationForLocation } from
  './lower-dvina-trace-scene-presentation.js';

const ARRAY_FIELDS = [
  'visible_changes', 'sensory_details', 'visible_npc', 'visible_objects',
  'known_context', 'uncertainties', 'allowed_tensions', 'do_not_imply'
];

export function withLowerDvinaTraceCurrentScene({
  committedState,
  locationProfiles,
  scenePresentation = null
}) {
  const initial = committedState?.current_visible_context;
  const projectionSource = structuredClone(committedState);
  delete projectionSource.current_visible_context;
  if (Number(committedState?.party_state?.state_version) === 0
      && validCurrentScene(initial)) {
    return {
      ...committedState,
      current_visible_context: enrichLowerDvinaTraceVisibleNpcCues({
        visibleContext: initial,
        committedState: projectionSource
      })
    };
  }
  const playerSafe = projectLowerDvinaTracePlayerSafeState({
    committed_state: projectionSource,
    actor_id: projectionSource.actor_id
  }).player_safe_state;
  const locationRef = playerSafe.position?.location_ref;
  const profile = scenePresentation == null
    ? historicalLocationProfile(locationProfiles, locationRef)
    : scenePresentationForLocation({ scenePresentation, locationRef });
  const sensoryDetails = profile.player_visible_physical_facts ?? [];
  const visibleLabels = new Map((initial?.visible_npc ?? []).map((npc) => [
    npc?.entity_ref?.entity_id, npc
  ]));
  const sceneNpcs = (playerSafe.npcs ?? []).map((npc) => visibleNpc(npc,
    playerSafe.position, visibleLabels)).filter(Boolean);
  const current = enrichLowerDvinaTraceVisibleNpcCues({ visibleContext: {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: profile.display_name,
    visible_changes: [],
    sensory_details: sensoryDetails,
    visible_npc: sceneNpcs,
    visible_objects: visibleSceneObjects(playerSafe.items, playerSafe.position),
    known_context: [profile.display_name],
    uncertainties: [],
    allowed_tensions: [],
    do_not_imply: ['hidden_fact', 'undiscovered_clue']
  }, committedState: projectionSource });
  if (!validCurrentScene(current)) failCurrentScene();
  return {
    ...committedState,
    current_visible_context: deepFreeze(current)
  };
}

function visibleSceneObjects(items, position) {
  return (items ?? []).flatMap((item) => {
    const placement = item?.placement ?? {};
    const coLocated = placement.location_ref === position?.location_ref
      || [position?.g5_anchor_id, position?.anchor_id]
        .includes(placement.g5_anchor_id ?? placement.anchor_id);
    const itemId = item?.item_id ?? item?.instance_id;
    if (!coLocated || !text(itemId) || !text(item?.name)) return [];
    return [{ entity_ref: { entity_kind: 'item', entity_id: itemId },
      display_label: item.name, recognition: 'recognized',
      visible_status: 'available' }];
  });
}

function historicalLocationProfile(locationProfiles, locationRef) {
  const matches = Array.isArray(locationProfiles)
    ? locationProfiles.filter(({ location_profile_id: id }) => id === locationRef)
    : [];
  if (matches.length !== 1 || !text(matches[0].display_name)) failCurrentScene();
  return { display_name: matches[0].display_name,
    player_visible_physical_facts: [] };
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
      || !validCurrentScene(current)) {
    return null;
  }
  return projectCurrentSceneForVisibleOverlay({
    input, directSeedKeys, body
  });
}

export function projectCurrentSceneForVisibleOverlay({
  input,
  directSeedKeys,
  body
}) {
  const current = input?.retrieved_state?.current_visible_context;
  if (!validCurrentScene(current)) failCurrentScene();
  return deepFreeze({
    ...structuredClone(current),
    visible_changes: unique([
      ...current.visible_changes,
      ...projectDirectSeedChanges({ input, directSeedKeys })
    ]),
    known_context: unique([
      ...current.known_context,
      ...(Number.isFinite(body.health) ? [`health:${body.health}`] : []),
      ...(Number.isFinite(body.satiety) ? [`satiety:${body.satiety}`] : []),
      ...(Number.isFinite(body.energy) ? [`energy:${body.energy}`] : [])
    ]),
    uncertainties: unique(current.uncertainties),
    do_not_imply: unique([
      ...current.do_not_imply,
      'hidden_fact',
      'uncommitted_body_delta',
      'uncommitted_time',
      ...directOutcomeConstraints(input)
    ])
  });
}

export function projectDirectSeedChanges({ input, directSeedKeys }) {
  const seed = input?.consequence?.visible_seed ?? {};
  return directSeedKeys.map((key) => directSeedChange(seed[key]))
    .filter(Boolean);
}

function directSeedChange(value) {
  if (value?.kind === 'semantic_activity') {
    const duration = Number(value.duration_minutes);
    return Number.isSafeInteger(duration) && duration > 0
      ? `Прошло ${duration} ${minuteWord(duration)}.` : null;
  }
  if (value?.kind === 'body_event') {
    return 'Вы ощутили перемену в своём состоянии.';
  }
  if (value?.change === 'created' && text(value.name)) {
    return `Появился результат вашей работы: ${value.name}.`;
  }
  if (value?.change === 'moved') {
    if (value.relation === 'held_by' && text(value.display_label)) {
      return `Вы взяли в руки ${value.display_label}.`;
    }
    return text(value.display_label)
      ? `Вы переместили ${value.display_label}.`
      : 'Вы переместили доступный предмет.';
  }
  if (value?.change === 'physical_change'
      && text(value.physical_description)) {
    return sentence(value.physical_description);
  }
  if (value?.change === 'container_accessed') {
    return 'Вы изменили состояние доступного вместилища.';
  }
  if (['facts_changed', 'mechanics_changed'].includes(value?.change)) {
    return 'Доступный предмет изменился.';
  }
  if (value?.change === 'retired') {
    return 'Исходный предмет больше не существует отдельно.';
  }
  failCurrentScene();
}

function minuteWord(value) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'минут';
  if (value % 10 === 1) return 'минута';
  if (value % 10 >= 2 && value % 10 <= 4) return 'минуты';
  return 'минут';
}

function sentence(value) {
  return /[.!?…]$/u.test(value) ? value : `${value}.`;
}

function directOutcomeConstraints(input) {
  const trace = input?.mode_resolution?.decision_trace;
  const allPlans = (trace?.step_traces ?? [])
    .map(({ approved_plan: plan }) => plan).filter(Boolean);
  const plans = allPlans.filter((plan) => plan.resolution === 'direct');
  const results = plans.map(({ goal_result: result }) => result).filter(Boolean);
  const productionSources = new Set(allPlans.flatMap((plan) =>
    (plan.operations ?? []).flatMap((operation) =>
      operation?.action_production?.source_refs ?? [])));
  const movedSources = new Set(allPlans.flatMap((plan) =>
    (plan.operations ?? []).filter(({ op }) => op === 'move_entity')
      .map(({ entity_ref: ref }) => ref)));
  const sourceStayedPut = [...productionSources]
    .some((sourceRef) => !movedSources.has(sourceRef));
  const constraints = sourceStayedPut
    ? ['uncommitted_action_production_source_relocation'] : [];
  if (results.length > 0 && results.every((result) => result === 'not_achieved')
      && !text(trace?.remaining_intent)) {
    constraints.push('unconfirmed_attempt_success');
  }
  if (results.includes('partially_achieved') || text(trace?.remaining_intent)
      || (results.length === 0 && input?.consequence?.status === 'partial')) {
    constraints.push('uncompleted_remaining_intent');
  }
  return constraints;
}

function validCurrentScene(value) {
  return plain(value)
    && validateVisibleContext(value).ok
    && ARRAY_FIELDS.every((field) => Array.isArray(value[field]));
}

function visibleNpc(npc, position, visibleLabels) {
  const entityId = npc?.instance_id ?? npc?.actor_id ?? npc?.npc_id;
  const prior = visibleLabels?.get(entityId);
  const displayLabel = prior?.display_label;
  if (!samePositionScope(npc, position) || !text(entityId) || !text(displayLabel)) {
    return null;
  }
  return {
    entity_ref: { entity_kind: 'npc', entity_id: entityId },
    display_label: displayLabel,
    recognition: prior?.recognition ?? 'recognized',
    ...(text(prior?.visible_status)
      ? { visible_status: prior.visible_status } : {})
  };
}

export function enrichLowerDvinaTraceVisibleNpcCues({
  visibleContext,
  committedState
}) {
  if (!validCurrentScene(visibleContext)) failCurrentScene();
  const projectedNpcs = visibleContext.visible_npc.flatMap((npc) =>
    npc?.entity_ref?.entity_kind === 'npc' && text(npc.entity_ref.entity_id)
      ? [{ instance_id: npc.entity_ref.entity_id }] : []);
  const details = new Map(projectLowerDvinaTraceVisibleNpcDetails({
    visibleContext,
    projectedNpcs,
    committedNpcs: committedState?.npcs,
    committedItems: committedState?.items
  }).map((npc) => [npc.instance_id, npc]));
  return deepFreeze({
    ...structuredClone(visibleContext),
    visible_npc: visibleContext.visible_npc.map((npc) => {
      const detail = details.get(npc?.entity_ref?.entity_id);
      const informative = detail != null
        && (detail.visible_equipment.length > 0
          || Object.keys(detail.presentation).length > 0
          || Object.keys(detail.identity_state).some((key) =>
            key !== 'display_name'));
      return !informative ? structuredClone(npc) : {
        ...structuredClone(npc),
        observable_cues: {
          identity: structuredClone(detail.identity_state),
          equipment: structuredClone(detail.visible_equipment),
          outward_presentation: structuredClone(detail.presentation)
        }
      };
    })
  });
}

function samePositionScope(npc, position) {
  const scopes = [['location_ref', 'location_ref'], ['anchor_id', 'g5_anchor_id'],
    ['g5_anchor_id', 'g5_anchor_id'], ['zone_ref', 'zone_ref']]
    .filter(([npcKey, positionKey]) => text(npc?.[npcKey])
      && text(position?.[positionKey]));
  return scopes.length > 0 && scopes.every(([npcKey, positionKey]) =>
    npc[npcKey] === position?.[positionKey]);
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
