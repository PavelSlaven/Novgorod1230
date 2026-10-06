import { ownerFail } from './lower-dvina-trace-turn-step-owner-profiles.js';
import { existingItemInspectionVisibleResult } from './lower-dvina-trace-existing-item-inspection.js';
import { projectCampFireState, projectLowerDvinaTracePlayerSafeState } from
  './lower-dvina-trace-player-safe-state.js';
import { projectKnownContext } from './lower-dvina-trace-player-safe-world.js';
import { playerSafeHeardNpcIntroduction } from
  './lower-dvina-trace-player-safe-npc-details.js';
import { deepFreeze, plain } from './lower-dvina-trace-turn-step-runtime-common.js';
import { scenePresentationForLocation } from './lower-dvina-trace-scene-presentation.js';
import { lowerDvinaTraceDirectResultChanges,
  lowerDvinaTraceVisibleSceneItems,
  uniqueLowerDvinaTraceVisibleObjects } from
  './lower-dvina-trace-visible-scene-items.js';
import { enrichLowerDvinaTraceVisibleNpcCues } from './lower-dvina-trace-turn-step-current-scene-npc-cues.js';
import { failCurrentScene, validCurrentScene, visibleNpc } from
  './lower-dvina-trace-turn-step-current-scene-validation.js';
import { isMovementVisibleObject } from './spatial-v3-movement-objects.js';
export { enrichLowerDvinaTraceVisibleNpcCues } from './lower-dvina-trace-turn-step-current-scene-npc-cues.js';
export function withLowerDvinaTraceCurrentScene({ committedState,
  locationProfiles = committedState?.location_profiles ?? null,
  scenePresentation = committedState?.scene_presentation ?? null,
  currentSpatialContext = committedState?.current_spatial_context ?? null,
  currentSpatialContextIsFresh = committedState?.current_spatial_context_is_fresh
    ?? currentSpatialContext != null }) {
  if (committedState == null || typeof committedState !== 'object'
      || Array.isArray(committedState)) failCurrentScene();
  const projectionSource = structuredClone(committedState);
  projectionSource.current_visible_context = null;
  const { actor, player_safe_state: playerSafe } = projectLowerDvinaTracePlayerSafeState({
    committed_state: projectionSource,
    scene_presentation: scenePresentation,
    actor_id: projectionSource.actor_id
  });
  const selfKnowledge = [...projectKnownContext(actor, playerSafe.knowledge, playerSafe.interactions),
    ...(playerSafe.available_routes ?? []).map(route => route.label).filter(Boolean)];
  const sceneItems = lowerDvinaTraceVisibleSceneItems(playerSafe.items,
    playerSafe.position, playerSafe.actor_id);
  const locationRef = playerSafe.position?.location_ref;
  const presentationMatches = scenePresentation?.locations?.filter((row) =>
    row?.location_ref === locationRef) ?? [];
  const presented = presentationMatches.length === 0 ? null
    : scenePresentationForLocation({ scenePresentation, locationRef });
  const currentSpatial = !currentSpatialContextIsFresh
      || currentSpatialContext == null ? null
    : projectCampFireState(currentSpatialContext, projectionSource,
      playerSafe.position);
  const movementObservedContext = currentSpatial;
  const visibleSceneItems = sceneItems;
  const profile = currentSpatial != null && text(currentSpatial.visible_scene)
    ? { display_name: currentSpatial.visible_scene,
      player_visible_physical_facts: currentSpatial.sensory_details ?? [] }
    : presented ?? { display_name: null, player_visible_physical_facts: [] };
  const sceneNpcs = (playerSafe.npcs ?? []).map((npc) => {
    const id = npc?.instance_id ?? npc?.actor_id ?? npc?.npc_id;
    const knownName = playerSafeHeardNpcIntroduction({
      committedNpcs: committedState.npcs,
      conversationStatements: committedState.conversation_statements,
      receivedMessages: committedState.received_messages,
      playerId: committedState.actor_id,
      npcId: id
    });
    return visibleNpc(npc, playerSafe.position, knownName);
  }).filter(Boolean);
  const placeFacts = currentSpatial?.sensory_details
    ?? presented?.player_visible_physical_facts
    ?? profile.player_visible_physical_facts;
  const currentItemRows = visibleSceneItems.map(({ visibleObject }) => visibleObject);
  const sensoryDetails = unique([...(placeFacts ?? []),
    ...visibleSceneItems.flatMap(({ physicalFacts }) => physicalFacts)]);
  const current = enrichLowerDvinaTraceVisibleNpcCues({ visibleContext: {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: profile.display_name,
    visible_changes: [],
    sensory_details: sensoryDetails,
    visible_npc: sceneNpcs,
    visible_objects: uniqueLowerDvinaTraceVisibleObjects([
      ...currentItemRows,
      ...(movementObservedContext?.visible_objects ?? [])
        .filter((object) => isMovementVisibleObject(object))]),
    known_context: unique([...(text(profile.display_name)
      ? [profile.display_name] : []),
      ...(currentSpatial?.known_context ?? []),
      ...selfKnowledge]),
    uncertainties: [],
    allowed_tensions: [],
    do_not_imply: ['hidden_fact', 'undiscovered_clue']
  }, committedState: projectionSource });
  if (!validCurrentScene(current)) failCurrentScene();
  const { current_spatial_context: _currentSpatialContext,
    current_spatial_context_is_fresh: _currentSpatialContextIsFresh,
    current_spatial_context_filters_entities: _currentSpatialContextFiltersEntities,
    ...projectedState } = committedState;
  return { ...projectedState, current_visible_context: deepFreeze(current) };
}
export function projectCurrentSceneForNoOperationDirect({ input, directSeedKeys, body,
  locationProfiles = input?.retrieved_state?.location_profiles ?? null,
  scenePresentation = input?.retrieved_state?.scene_presentation ?? null }) {
  if (input?.consequence?.visible_seed?.clarification != null) return null;
  const traces = input?.mode_resolution?.decision_trace?.step_traces;
  if (!Array.isArray(traces) || traces.length === 0
      || traces.some(({ approved_plan: plan }) =>
        plan?.resolution !== 'direct'
        || !Array.isArray(plan.operations)
        || plan.operations.length !== 0
        || plan.check !== null)) {
    return null;
  }
  return projectCurrentSceneForVisibleOverlay({
    input, directSeedKeys, body,
    currentSpatialContext: input?.retrieved_state?.current_spatial_context,
    locationProfiles, scenePresentation
  });
}
export function projectCurrentSceneForVisibleOverlay({ input, directSeedKeys, body,
  currentSpatialContext = input?.retrieved_state?.current_spatial_context,
  locationProfiles = input?.retrieved_state?.location_profiles ?? null,
  scenePresentation = input?.retrieved_state?.scene_presentation ?? null }) {
  const state = input?.retrieved_state;
  const isFresh = state?.current_spatial_context_is_fresh === true
    && currentSpatialContext != null;
  const current = withLowerDvinaTraceCurrentScene({
    committedState: state, locationProfiles, scenePresentation,
    currentSpatialContext, currentSpatialContextIsFresh: isFresh
  }).current_visible_context;
  if (!validCurrentScene(current)) failCurrentScene();
  const outcomeConstraints = directOutcomeConstraints(input);
  const directResultChanges = lowerDvinaTraceDirectResultChanges(input,
    playerSafeSceneItems(input?.retrieved_state), body, current);
  return deepFreeze({
    ...structuredClone(current),
    visible_changes: unique([
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
  return lowerDvinaTraceVisibleSceneItems(state?.items, state?.position,
    state?.actor_id);
}
export function projectDirectSeedChanges({ input, directSeedKeys, appliedPlan = null }) {
  const seed = input?.consequence?.visible_seed ?? {};
  const values = directSeedKeys.map((key) => seed[key]);
  const speech = appliedPlan?.resolution === 'direct' && appliedPlan.direct_result_kind === 'player_utterance'
    ? spokenChange(appliedPlan.utterance.utterance_text) : null;
  const observation = appliedPlan?.resolution === 'direct'
    && appliedPlan.direct_result_kind === 'player_safe_observation';
  const activityCompleted = input?.time_update?.semantic_activity_resolutions
    ?.some(({ execution }) => execution?.status === 'completed') === true;
  const directActivity = appliedPlan?.resolution === 'direct'
    && appliedPlan.direct_result_kind == null
    && activityCompleted
    && values.some((value) => value?.kind === 'semantic_activity')
    ? appliedPlan.interpretation?.grounded_attempt : null;
  const attempts = values.filter(value => value?.kind === 'transient_item_use'
    && Object.keys(value).length === 2 && text(value.description));
  const changes = values.flatMap((value) => {
    if (appliedPlan != null && (
        (value?.kind === 'semantic_activity'
          && (appliedPlan.resolution === 'direct'
            || value.discovery_result == null))
        || (attempts.length === 1 && value === attempts[0]))) return [];
    return directSeedChange(value);
  }).filter(Boolean);
  if (speech != null) return [speech, ...changes];
  if (text(directActivity)) return [sentence(directActivity), ...changes];
  if (observation) return [text(appliedPlan.assessment?.text)
    ? appliedPlan.assessment.text : 'Вы внимательно изучили обстановку.',
  ...changes];
  if (appliedPlan != null && attempts.length === 1) return [
    ...directSeedChange(attempts[0]), ...changes
  ];
  return changes;
}
export function materializedOrdinaryPresenceChange(value) {
  if (!plain(value) || value.kind !== 'ordinary_presence_seed' || value.resolution !== 'materialized'
      || Object.keys(value).length !== 4 || typeof value.query !== 'string' || !value.query.trim()
      || typeof value.display_name !== 'string' || !value.display_name.trim()) {
    ownerFail('TRACE_TURN_STEP_ORDINARY_PRESENCE_VISIBLE_SEED_INVALID');
  }
  return `Вы нашли предмет — ${value.display_name}.`;
}
function directSeedChange(value) {
  if (value?.kind === 'local_movement_signature') {
    failCurrentScene();
  }
  if (value?.kind === 'background_npc_observation') {
    if (!plain(value) || Object.keys(value).length !== 4
        || !text(value.npc_ref) || !text(value.display_label)
        || !text(value.ordinary_descriptor)) failCurrentScene();
    return `Вы рассмотрели ${value.display_label}: ${sentence(
      value.ordinary_descriptor)}`;
  }
  if (value?.kind === 'transient_item_use' && Object.keys(value).length === 2 && text(value.description))
    return [`Вы выполнили попытку: «${value.description}»${/[.!?…]$/u.test(value.description) ? '' : '.'}`];
  if (value?.kind === 'ordinary_presence_seed') return materializedOrdinaryPresenceChange(value);
  if (value?.kind === 'existing_item_inspection') {
    return existingItemInspectionVisibleResult(value).changes;
  }
  if (value?.kind === 'semantic_activity') {
    const duration = Number(value.duration_minutes);
    if (!Number.isSafeInteger(duration) || duration <= 0) return null;
    const result = value.discovery_result;
    if (result == null) return value.discovery_kind === 'search'
      ? 'Вы завершили поиск.'
      : value.discovery_kind === 'inspect' ? 'Вы завершили осмотр.' : null;
    if (!['search', 'inspect'].includes(value.discovery_kind) || !plain(result)
        || Object.keys(result).length !== 2
        || !['no_change', 'authority_required'].includes(result.resolution)
        || !text(result.query) || !result.query.trim()) failCurrentScene();
    const action = value.discovery_kind === 'search' ? 'Поиск' : 'Осмотр';
    return `${action} по вопросу «${result.query}» не дал подтверждённой находки.`;
  }
  if (value?.kind === 'body_event') {
    return 'Вы ощутили перемену в своём состоянии.';
  }
  if (value?.kind === 'post_applied_perception_window'
      && value.status === 'completed'
      && Array.isArray(value.observable_response_event_refs)
      && value.observable_response_event_refs.length === 0) {
    return 'Непосредственного наблюдаемого отклика на ваше действие не последовало.';
  }
  if (value?.kind === 'post_applied_perception_window'
      && value.status === 'pending_npc_decision'
      && Array.isArray(value.observable_response_event_refs)
      && value.observable_response_event_refs.length === 0
      && Array.isArray(value.pending_npc_decision_refs)
      && value.pending_npc_decision_refs.length > 0
      && value.pending_npc_decision_refs.every(text)) {
    return null;
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
  if (value?.change === 'move_blocked' && text(value.display_label)) {
    return value.reason === 'hands_full'
      ? `Вы не смогли взять ${value.display_label}: руки заняты.`
      : value.reason === 'load_limit'
        ? `Вы не смогли взять ${value.display_label}: ноша слишком тяжела.`
        : failCurrentScene();
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
function sentence(value) {
  return /[.!?…]$/u.test(value) ? value : `${value}.`;
}
function spokenChange(value) {
  return `Вы произнесли: «${value}»${/[.!?…]$/u.test(value) ? '' : '.'}`;
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
