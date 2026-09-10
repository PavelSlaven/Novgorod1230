import { validateVisibleContext } from '@rus/visibility-knowledge-memory';
import { projectLowerDvinaTracePlayerSafeState } from
  './lower-dvina-trace-player-safe-state.js';
import { deepFreeze, plain } from
  './lower-dvina-trace-turn-step-runtime-common.js';
import { scenePresentationForLocation } from './lower-dvina-trace-scene-presentation.js';
import { lowerDvinaTraceDirectResultChanges,
  lowerDvinaTraceCarriedItemObservations,
  lowerDvinaTraceVisibleSceneItems,
  uniqueLowerDvinaTraceVisibleObjects } from
  './lower-dvina-trace-visible-scene-items.js';
import { enrichLowerDvinaTraceVisibleNpcCues } from
  './lower-dvina-trace-turn-step-current-scene-npc-cues.js';
export { enrichLowerDvinaTraceVisibleNpcCues } from
  './lower-dvina-trace-turn-step-current-scene-npc-cues.js';

const ARRAY_FIELDS = ['visible_changes', 'sensory_details', 'visible_npc',
  'visible_objects', 'known_context', 'uncertainties', 'allowed_tensions', 'do_not_imply'];
export function withLowerDvinaTraceCurrentScene({ committedState,
  locationProfiles, scenePresentation = null }) {
  const initial = committedState?.current_visible_context;
  const projectionSource = structuredClone(committedState);
  delete projectionSource.current_visible_context;
  const playerSafe = projectLowerDvinaTracePlayerSafeState({
    committed_state: projectionSource,
    actor_id: projectionSource.actor_id
  }).player_safe_state;
  const sceneItems = lowerDvinaTraceVisibleSceneItems(playerSafe.items,
    playerSafe.position,
    playerSafe.actor_id);
  if (Number(committedState?.party_state?.state_version) === 0
      && validCurrentScene(initial)) {
    const current = {
      ...initial,
      sensory_details: unique([...initial.sensory_details,
        ...sceneItems.flatMap(({ physicalFacts }) => physicalFacts)]),
      visible_objects: uniqueLowerDvinaTraceVisibleObjects([
        ...initial.visible_objects,
        ...sceneItems.map(({ visibleObject }) => visibleObject)])
    };
    return {
      ...committedState,
      current_visible_context: enrichLowerDvinaTraceVisibleNpcCues({
        visibleContext: current,
        committedState: projectionSource
      })
    };
  }
  const locationRef = playerSafe.position?.location_ref;
  const profile = scenePresentation == null
    ? historicalLocationProfile(locationProfiles, locationRef)
    : scenePresentationForLocation({ scenePresentation, locationRef });
  const sensoryDetails = unique([...(profile.player_visible_physical_facts ?? []),
    ...sceneItems.flatMap(({ physicalFacts }) => physicalFacts)
  ]);
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
    visible_objects: sceneItems.map(({ visibleObject }) => visibleObject),
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
function historicalLocationProfile(locationProfiles, locationRef) {
  const matches = Array.isArray(locationProfiles)
    ? locationProfiles.filter(({ location_profile_id: id }) => id === locationRef)
    : [];
  if (matches.length !== 1 || !text(matches[0].display_name)) failCurrentScene();
  return { display_name: matches[0].display_name,
    player_visible_physical_facts: [] };
}
export function projectCurrentSceneForNoOperationDirect({ input, directSeedKeys, body }) {
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
export function projectCurrentSceneForVisibleOverlay({ input, directSeedKeys, body }) {
  const current = input?.retrieved_state?.current_visible_context;
  if (!validCurrentScene(current)) failCurrentScene();
  const outcomeConstraints = directOutcomeConstraints(input);
  const directResultChanges = lowerDvinaTraceDirectResultChanges(input,
    playerSafeSceneItems(input?.retrieved_state), body);
  return deepFreeze({
    ...structuredClone(current),
    visible_changes: unique([
      ...current.visible_changes,
      ...projectDirectSeedChanges({ input, directSeedKeys }),
      ...directResultChanges,
      ...(outcomeConstraints.includes('unconfirmed_attempt_success')
        ? input.mode_resolution.decision_trace.step_traces
          .filter(({ approved_plan: plan }) => plan?.resolution === 'direct'
            && plan.goal_result === 'not_achieved')
          .map(({ approved_plan: plan }) =>
            text(plan.interpretation?.player_goal)
              ? `Не удалось достичь цели «${plan.interpretation.player_goal}».`
              : 'Цель попытки не достигнута.') : [])
    ]),
    known_context: unique([
      ...current.known_context,
      ...(Number.isFinite(body.health) ? [`health:${body.health}`] : []),
      ...(Number.isFinite(body.satiety) ? [`satiety:${body.satiety}`] : []),
      ...(Number.isFinite(body.energy) ? [`energy:${body.energy}`] : [])
    ]),
    uncertainties: unique([
      ...current.uncertainties,
      ...(!directResultChanges.includes(
        'Наблюдение завершено по уже доступным вам признакам.') ? [] : [
        'Наблюдение не подтверждает деталей сверх уже видимых признаков.'
      ])
    ]),
    do_not_imply: unique([
      ...current.do_not_imply,
      'hidden_fact',
      'uncommitted_body_delta',
      'uncommitted_time',
      ...outcomeConstraints
    ])
  });
}

function playerSafeSceneItems(state) {
  return lowerDvinaTraceCarriedItemObservations(state?.items,
    state?.current_visible_context?.visible_objects);
}
export function projectDirectSeedChanges({ input, directSeedKeys }) {
  const seed = input?.consequence?.visible_seed ?? {};
  return directSeedKeys.flatMap((key) => directSeedChange(seed[key]))
    .filter(Boolean);
}
function directSeedChange(value) {
  if (value?.kind === 'semantic_activity') {
    const duration = Number(value.duration_minutes);
    if (!Number.isSafeInteger(duration) || duration <= 0) return null;
    const elapsed = value.discovery_kind === 'search'
      ? `Поиск занял ${duration} ${minuteWord(duration)}.`
      : `Прошло ${duration} ${minuteWord(duration)}.`;
    const result = value.discovery_result;
    if (result == null) return elapsed;
    if (value.discovery_kind !== 'search' || !plain(result)
        || Object.keys(result).length !== 2
        || !['no_change', 'authority_required'].includes(result.resolution)
        || !text(result.query) || !result.query.trim()) failCurrentScene();
    return [elapsed,
      `В этой попытке поиска по вопросу «${result.query}» подтверждённой находки нет.`];
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
    recognition: prior?.recognition ?? 'recognized'
  };
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
  throw Object.assign(new Error(
    'The committed current scene cannot be projected safely.'),
  { code: 'TRACE_CURRENT_SCENE_PROJECTION_INVALID', status: 409 });
}

function unique(values) {
  return [...new Set(values)];
}
