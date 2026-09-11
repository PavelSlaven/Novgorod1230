import { ownerFail } from './lower-dvina-trace-turn-step-owner-profiles.js';
import { existingItemInspectionVisibleResult } from './lower-dvina-trace-existing-item-inspection.js';
import { projectLowerDvinaTracePlayerSafeState } from './lower-dvina-trace-player-safe-state.js';
import { projectKnownContext } from './lower-dvina-trace-player-safe-world.js';
import { deepFreeze, plain } from './lower-dvina-trace-turn-step-runtime-common.js';
import { scenePresentationForLocation } from './lower-dvina-trace-scene-presentation.js';
import { lowerDvinaTraceDirectResultChanges,
  lowerDvinaTraceCarriedItemObservations,
  lowerDvinaTraceVisibleSceneItems,
  uniqueLowerDvinaTraceVisibleObjects } from
  './lower-dvina-trace-visible-scene-items.js';
import { enrichLowerDvinaTraceVisibleNpcCues } from './lower-dvina-trace-turn-step-current-scene-npc-cues.js';
import { failCurrentScene, validCurrentScene, visibleNpc } from
  './lower-dvina-trace-turn-step-current-scene-validation.js';
export { enrichLowerDvinaTraceVisibleNpcCues } from './lower-dvina-trace-turn-step-current-scene-npc-cues.js';
export function withLowerDvinaTraceCurrentScene({ committedState,
  locationProfiles, scenePresentation = null }) {
  const initial = committedState?.current_visible_context;
  const projectionSource = structuredClone(committedState);
  delete projectionSource.current_visible_context;
  const { actor, player_safe_state: playerSafe } = projectLowerDvinaTracePlayerSafeState({
    committed_state: projectionSource,
    scene_presentation: scenePresentation,
    actor_id: projectionSource.actor_id
  });
  const selfKnowledge = [...projectKnownContext(actor, playerSafe.knowledge, playerSafe.interactions),
    ...(playerSafe.available_routes ?? []).map(route => route.label).filter(Boolean)];
  const sceneItems = lowerDvinaTraceVisibleSceneItems(playerSafe.items,
    playerSafe.position,
    playerSafe.actor_id);
  if (Number(committedState?.party_state?.state_version) === 0
      && validCurrentScene(initial)) {
    const current = {
      ...initial,
      known_context: unique([...initial.known_context, ...selfKnowledge]),
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
    known_context: [profile.display_name, ...selfKnowledge],
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
      ...directResultChanges
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
      ...outcomeConstraints
    ])
  });
}
function playerSafeSceneItems(state) {
  return lowerDvinaTraceCarriedItemObservations(state?.items,
    state?.current_visible_context?.visible_objects);
}
export function projectDirectSeedChanges({ input, directSeedKeys, appliedPlan = null }) {
  const seed = input?.consequence?.visible_seed ?? {};
  const values = directSeedKeys.map((key) => seed[key]);
  const durations = values.filter((value) => value?.kind === 'semantic_activity'
    && value.discovery_kind == null && value.discovery_result == null
    && Number.isSafeInteger(Number(value.duration_minutes)) && Number(value.duration_minutes) > 0);
  const duration = durations.reduce((total, entry) => total + Number(entry.duration_minutes), 0);
  const speech = appliedPlan?.resolution === 'direct' && appliedPlan.direct_result_kind === 'player_utterance'
    ? `Вы произнесли: «${appliedPlan.utterance.utterance_text}»` : null;
  const observation = appliedPlan?.resolution === 'direct'
    && appliedPlan.direct_result_kind === 'player_safe_observation';
  const attempts = values.filter(value => value?.kind === 'transient_item_use'
    && Object.keys(value).length === 2 && text(value.description));
  const bound = appliedPlan != null && duration > 0
    && (speech != null || observation || attempts.length === 1);
  let emittedDuration = false;
  const changes = values.flatMap((value) => {
    if (bound && value === attempts[0]) return [];
    if (!durations.includes(value)) return directSeedChange(value);
    if (emittedDuration) return [];
    emittedDuration = true;
    if (bound) return speech != null
      ? `За ${duration} ${minuteWord(duration, 'минуту')} вы произнесли: «${appliedPlan.utterance.utterance_text}».`
      : observation
        ? `За ${duration} ${minuteWord(duration, 'минуту')} вы завершили наблюдение по уже доступным вам признакам.`
      : [`Вы в течение ${duration} ${minuteWord(duration, 'минуты', 'минут')} выполняли попытку: «${attempts[0].description}».`,
        'В ходе этой попытки результат наблюдения не установлен.'];
    return directSeedChange({ ...value, duration_minutes: duration });
  }).filter(Boolean);
  return speech != null && !bound ? [speech, ...changes] : changes;
}
export function materializedOrdinaryPresenceChange(value) {
  if (!plain(value) || value.kind !== 'ordinary_presence_seed' || value.resolution !== 'materialized'
      || Object.keys(value).length !== 4 || typeof value.query !== 'string' || !value.query.trim()
      || typeof value.display_name !== 'string' || !value.display_name.trim()) {
    ownerFail('TRACE_TURN_STEP_ORDINARY_PRESENCE_VISIBLE_SEED_INVALID');
  }
  return `Обнаружено: «${value.display_name}».`;
}
function directSeedChange(value) {
  if (value?.kind === 'transient_item_use' && Object.keys(value).length === 2 && text(value.description))
    return [`Вы выполнили попытку: «${value.description}».`,
      'В ходе этой попытки результат наблюдения не установлен.'];
  if (value?.kind === 'ordinary_presence_seed') return materializedOrdinaryPresenceChange(value);
  if (value?.kind === 'existing_item_inspection') {
    return existingItemInspectionVisibleResult(value).changes;
  }
  if (value?.kind === 'semantic_activity') {
    const duration = Number(value.duration_minutes);
    if (!Number.isSafeInteger(duration) || duration <= 0) return null;
    const elapsed = value.discovery_kind === 'search'
      ? `Поиск занял ${duration} ${minuteWord(duration, 'минуту')}.`
      : `${minuteWord(duration) === 'минута' ? 'Прошла' : 'Прошло'} ${duration} ${minuteWord(duration)}.`;
    const result = value.discovery_result;
    if (result == null) return elapsed;
    if (value.discovery_kind !== 'search' || !plain(result)
        || Object.keys(result).length !== 2
        || !['no_change', 'authority_required'].includes(result.resolution)
        || !text(result.query) || !result.query.trim()) failCurrentScene();
    return `За ${duration} ${minuteWord(duration, 'минуту')} поиска по вопросу «${result.query}» подтверждённой находки нет.`;
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
function minuteWord(value, singular = 'минута', paucal = 'минуты') {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'минут';
  if (value % 10 === 1) return singular;
  if (value % 10 >= 2 && value % 10 <= 4) return paucal;
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
function text(value) { return typeof value === 'string' && value.length > 0; }
function unique(values) { return [...new Set(values)]; }
