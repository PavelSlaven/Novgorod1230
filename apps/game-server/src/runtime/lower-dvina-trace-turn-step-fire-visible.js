import { ownerFail } from './lower-dvina-trace-turn-step-owner-profiles.js';
import { bodyStateSummary } from './lower-dvina-trace-opening.js';
import { canonicalDigest } from '@rus/materialization';
import { spatialV3TraversalOutcomeProjection } from '@rus/turn/spatial-v3-execution';
import { lowerDvinaTraceCarriedItemIds,
  uniqueLowerDvinaTraceVisibleObjects,
  lowerDvinaTraceObservedSceneChanges } from './lower-dvina-trace-visible-scene-items.js';
import { existingItemInspectionVisibleResult } from './lower-dvina-trace-existing-item-inspection.js';
import {
  enrichLowerDvinaTraceVisibleNpcCues,
  projectCurrentSceneForNoOperationDirect,
  projectCurrentSceneForVisibleOverlay,
  projectPerceivedPeopleAbsence,
  projectDirectSeedChanges, currentEnvironmentChanges
} from './lower-dvina-trace-turn-step-current-scene.js';
import { deepFreeze, plain } from
  './lower-dvina-trace-turn-step-runtime-common.js';
import { isMovementVisibleObject } from './spatial-v3-movement-objects.js';
const SCHEMA =
  'rus.lower_dvina_trace_turn_step_world_process_visible_result.v1';
const FIRE_SEED_PREFIX = 'turn_step_world_process_';
const SCENES = Object.freeze({
  'start:started:active': 'Огонь разгорелся.',
  'add_fuel:fuel_added:active': 'В огонь добавлено топливо.',
  'affect:no_effect:active': 'Воздействие не изменило огонь.',
  'affect:continue:active': 'Огонь изменился, но продолжает гореть.',
  'affect:complete:completed': 'Огонь погас.'
});
import { ordinaryPresenceResolution, ordinarySceneDetails,
  overlayOrdinaryPresence, overlayOrdinaryScene } from
  './lower-dvina-trace-turn-step-ordinary-visible.js';
export function createLowerDvinaTraceTurnStepVisibleProjector({
  fallback, calendarProfile = null, locationProfiles = null,
  approvedActivityRecords = null,
  scenePresentation = null, partyId = null,
  loadPreparedMovementScene = null, projectCurrentScene = null,
  recordProjectionGap = null
} = {}) {
  if (typeof fallback?.project !== 'function') {
    throw new TypeError('fallback visibleProjector.project is required');
  }
  return Object.freeze({
    async project(input) {
      const consequence = input?.consequence;
      if (consequence?.position_transition?.owner
          === '@rus/turn/spatial-v3-site-connection-traversal') {
        const rawDestination = consequence.visible_seed?.destination_visible_context;
        const transition = consequence.position_transition;
        const traversal = consequence.spatial_v3_traversal;
        const traversalStep = traversal?.plan?.steps?.[0];
        const traversalOutcome = spatialV3TraversalOutcomeProjection(
          traversal?.result, traversalStep);
        const timedDestinationCompletion = consequence.movement?.cost_kind === 'time'
          && traversal?.result?.result_kind === 'segment_completed'
          && traversalOutcome.endpoint != null
          && traversalOutcome.endpoint?.resolved_position_id === transition.to_position_ref;
        const arrivalEndpoint = traversalStep?.arrival_endpoint_snapshot;
        const legacyDestinationCompletion = consequence.movement?.cost_kind === 'action'
          && traversal?.result?.result_kind === 'completed'
          && plain(arrivalEndpoint)
          && traversal?.result?.endpoint_after?.endpoint_id
            === arrivalEndpoint?.endpoint_ref?.endpoint_id
          && arrivalEndpoint?.resolved_position_id === transition.to_position_ref;
        const destinationCompletion = timedDestinationCompletion
          || legacyDestinationCompletion;
        const destinationDigest = transition.destination_visible_digest;
        const destinationDigestMatches = typeof destinationDigest === 'string'
          && plain(rawDestination)
          && destinationDigest === canonicalDigest(rawDestination);
        if (destinationCompletion && destinationDigest != null
            && !destinationDigestMatches) {
          ownerFail('TRACE_SITE_TRAVERSAL_DESTINATION_PERCEPTION_INVALID');
        }
        const destination = structuredClone(rawDestination);
        if (!plain(destination)
            || destination.sensory_details != null
              && !Array.isArray(destination.sensory_details)) {
          ownerFail('TRACE_SITE_TRAVERSAL_DESTINATION_PERCEPTION_INVALID');
        }
        destination.sensory_details ??= [];
        const fact = destination.sensory_details.find(text);
        const destinationOrigin = consequence.visible_seed?.destination_site_origin;
        if (!['canonical', 'generated'].includes(destinationOrigin)) {
          ownerFail('TRACE_SITE_TRAVERSAL_DESTINATION_ORIGIN_INVALID');
        }
        const clock = input.time_update?.clock_after
          ?? input.retrieved_state?.clock_weather_light?.clock
          ?? input.retrieved_state?.clock ?? null;
        const sourceEndpoint = traversalOutcome.endpoint != null
          && traversalOutcome.endpoint.resolved_position_id === transition.from_position_ref;
        const targetPositionId = sourceEndpoint
          ? transition.from_position_ref : transition.to_position_ref;
        const targetSiteId = sourceEndpoint
          ? transition.source_site_id : transition.destination_site_id;
        const targetG6InstanceId = sourceEndpoint
          ? transition.source_g6_instance_id : transition.destination_g6_instance_id;
        const targetState = {
          ...structuredClone(input.retrieved_state ?? {}),
          position: {
            ...structuredClone(input.retrieved_state?.position ?? {}),
            site_id: targetSiteId,
            position_id: targetPositionId,
            g6_id: targetG6InstanceId,
            g6_instance_id: targetG6InstanceId
          },
          journey_location: {
            ...structuredClone(input.retrieved_state?.journey_location ?? {}),
            scene_position_id: targetPositionId
          },
          current_spatial_context: destination,
          current_spatial_context_is_fresh: true,
          current_spatial_context_filters_entities: true,
          ...(clock == null ? {} : { clock: structuredClone(clock) })
        };
        delete targetState.current_visible_context;
        const committedDestination = destinationOrigin === 'canonical';
        const reusePreparedDestination = destinationCompletion
          && destinationDigestMatches;
        // Reuse keeps the traversal owner's digest-backed final destination seed.
        if (reusePreparedDestination && plain(input.retrieved_state)) {
          const carriedItemIds = lowerDvinaTraceCarriedItemIds(
            targetState.items, targetState.actor_id);
          if (carriedItemIds.size > 0) {
            if (typeof projectCurrentScene !== 'function') {
              ownerFail('TRACE_CURRENT_SCENE_PROJECTION_INVALID');
            }
            const projectedCurrent = projectCurrentScene(targetState)
              ?.current_visible_context;
            if (!plain(projectedCurrent)) {
              ownerFail('TRACE_CURRENT_SCENE_PROJECTION_INVALID');
            }
            const carriedItems = (projectedCurrent.visible_objects ?? [])
              .filter(({ entity_ref: ref }) => ref?.entity_kind === 'item'
                && carriedItemIds.has(ref.entity_id));
            destination.visible_objects = uniqueLowerDvinaTraceVisibleObjects([
              ...carriedItems, ...(destination.visible_objects ?? [])
            ]);
          }
        }
        if (committedDestination && !reusePreparedDestination) {
          if (destinationDigest == null && !sourceEndpoint) {
            if (Object.hasOwn(targetState.position, 'location_ref')) {
              targetState.position.location_ref = transition.destination_site_id;
            }
            delete targetState.position.g5_anchor_id;
            delete targetState.position.anchor_id;
          }
          if (typeof loadPreparedMovementScene !== 'function'
              || typeof projectCurrentScene !== 'function') {
            ownerFail('TRACE_CURRENT_SCENE_PROJECTION_INVALID');
          }
          if (!plain(input.retrieved_state)) {
            ownerFail('TRACE_CURRENT_SCENE_PROJECTION_INVALID');
          }
          const loadedDestination = await loadPreparedMovementScene({
            partyId, state: targetState, clock
          });
          const projectedDestination = projectCurrentScene(loadedDestination)
            ?.current_visible_context;
          if (!plain(projectedDestination)) {
            ownerFail('TRACE_CURRENT_SCENE_PROJECTION_INVALID');
          }
          Object.assign(destination, structuredClone(projectedDestination));
        } else if (!committedDestination) {
          if (plain(input.retrieved_state)) {
            if (typeof projectCurrentScene !== 'function') {
              ownerFail('TRACE_CURRENT_SCENE_PROJECTION_INVALID');
            }
            const projectedDestination = projectCurrentScene(targetState)
              ?.current_visible_context;
            if (!plain(projectedDestination)) {
              ownerFail('TRACE_CURRENT_SCENE_PROJECTION_INVALID');
            }
            const carriedItemIds = lowerDvinaTraceCarriedItemIds(
              targetState.items, targetState.actor_id);
            destination.visible_objects = (projectedDestination.visible_objects ?? [])
              .filter(({ entity_ref: ref }) => isMovementVisibleObject({ entity_ref: ref })
                || (ref?.entity_kind === 'item'
                && carriedItemIds.has(ref.entity_id)));
          } else {
            destination.visible_objects = [];
          }
          destination.visible_npc = [];
        }
        if (destinationCompletion) {
          const route = text(transition.line_name)
            ? 'Пройденный путь: ' + transition.line_name + '.' : null;
          destination.visible_changes = [route,
            fact == null ? 'Вы прибыли.' : arrivalChange(fact)].filter(Boolean);
          if (input.time_update?.nearest_boundary == null) {
            destination.sensory_details = [...new Set([
              ...destination.sensory_details,
              ...currentEnvironmentChanges(targetState)
            ])];
          }
        } else if (sourceEndpoint && traversal?.result?.result_kind === 'returned_to_departure') {
          const route = text(transition.line_name)
            ? 'Пройденный путь: ' + transition.line_name + '.' : null;
          destination.visible_changes = [route, 'Вы вернулись к месту отправления.']
            .filter(Boolean);
        } else if (traversal?.result?.result_kind === 'interrupted_at_anchor'
            && traversalOutcome.endpoint != null) {
          destination.visible_changes = [sourceEndpoint
            ? 'Переход прервался у места отправления.'
            : 'Переход прервался у достигнутой опорной точки.'];
        } else {
          destination.visible_changes = [];
        }
        return overlayTurnStepResults(destination, input, recordProjectionGap);
      }
      const seedEntries = plain(consequence?.visible_seed)
        ? Object.entries(consequence.visible_seed) : [];
      if (!seedEntries.some(([key]) => key.startsWith(FIRE_SEED_PREFIX))) {
        return finishVisibleProjection(await projectWithoutFire({
          input, consequence, seedEntries, fallback,
          locationProfiles: locationProfiles
            ?? input?.retrieved_state?.location_profiles ?? null,
          scenePresentation: scenePresentation
            ?? input?.retrieved_state?.scene_presentation ?? null,
          approvedActivityRecords
        }), input, calendarProfile, recordProjectionGap,
        approvedActivityRecords);
      }
      const fireVisible = projectLowerDvinaTraceFireVisible(seedEntries,
        consequence.visible_seed.clarification);
      const ordinaryDetails = ordinarySceneDetails(seedEntries);
      const ordinaryPresence = uncoveredOrdinaryPresence(seedEntries,
        ordinaryPresenceResolution(seedEntries));
      const base = hasVisibleDomainProjection(consequence)
        ? await fallback.project(input)
        : projectCurrentSceneForVisibleOverlay({
            input,
            directSeedKeys: directSeedKeys(seedEntries),
            body: currentBody(input),
            locationProfiles: locationProfiles
              ?? input?.retrieved_state?.location_profiles ?? null,
            scenePresentation: scenePresentation
              ?? input?.retrieved_state?.scene_presentation ?? null,
            approvedActivityRecords
          });
      return finishVisibleProjection(overlayFireVisible(overlayOrdinaryPresence(
          overlayOrdinaryScene(base, ordinaryDetails), ordinaryPresence,
          input?.ordinary_materialization_atomic_write_plan?.item), fireVisible),
        input, calendarProfile, recordProjectionGap,
        approvedActivityRecords);
    }
  });
}
function finishVisibleProjection(base, input, calendarProfile, recordProjectionGap,
  approvedActivityRecords) {
  let enriched = enrichLowerDvinaTraceVisibleNpcCues({ visibleContext: base,
    committedState: input.retrieved_state, calendarProfile,
    bodyAfter: input.body_update?.state_after, clockAfter: input.time_update?.clock_after,
    temporalResults: input.time_update?.temporal_results,
    approvedActivityRecords });
  // A local move changes the place's passages: the retrieved state still holds those of the position left.
  const arrived = input.consequence?.visible_seed?.destination_movement_objects;
  if (Array.isArray(arrived)) enriched = { ...enriched, visible_objects: [
    ...enriched.visible_objects.filter((row) => !isMovementVisibleObject(row)), ...arrived] };
  const consequence = input.consequence;
  const arrival = consequence?.phase3_kind === 'movement'
    || (consequence?.phase6_kind === 'synchronized_carry'
      && consequence.carry?.intent?.execution_after?.status === 'completed');
  if (arrival) {
    enriched = { ...enriched,
      sensory_details: lowerDvinaTraceObservedSceneChanges(enriched) };
  }
  return overlayTurnStepResults(enriched, input, recordProjectionGap);
}
function arrivalChange(fact) {
  return `Вы прибыли. ${fact}${/[.!?…]$/u.test(fact) ? '' : '.'}`;
}
function overlayTurnStepResults(base, input, recordProjectionGap) {
  const itemInspections = Object.values(input?.consequence?.visible_seed ?? {})
    .filter(seed => seed?.kind === 'existing_item_inspection')
    .map(existingItemInspectionVisibleResult);
  const remaining = input?.mode_resolution?.decision_trace?.remaining_intent;
  const inspection = input?.consequence?.visible_seed?.observed_evidence_inspection_seed;
  if (inspection != null && (!plain(inspection)
      || inspection.kind !== 'observed_evidence_inspection_seed'
      || inspection.resolution !== 'no_new_supported_conclusion'
      || Object.keys(inspection).length !== 4
      || typeof inspection.query !== 'string' || !inspection.query.trim()
      || !Array.isArray(inspection.scene_support)
      || inspection.scene_support.some((value) => !text(value)))) {
    ownerFail('TRACE_TURN_STEP_OBSERVED_EVIDENCE_VISIBLE_SEED_INVALID');
  }
  const traces = (input?.mode_resolution?.decision_trace?.step_traces ?? []).filter(({ applied }) => applied === true);
  const directPlans = traces.map(({ approved_plan: plan }) => plan).filter(plan => plan?.resolution === 'direct');
  const seeds = input?.consequence?.visible_seed ?? {};
  const pendingNpcResponse = seeds.turn_step_post_applied_perception_window
    ?.status === 'pending_npc_decision';
  const slices = input?.time_update?.prepared_effect_ledger?.slices ?? [];
  const availableKeys = directSeedKeys(Object.entries(seeds)), usedKeys = new Set(), components = new Set();
  const orderedChanges = traces.flatMap(({ step_index: step, approved_plan: plan }) => {
    const keys = slices.filter(slice => slice.step_index === step)
      .flatMap(slice => Object.keys(slice.consequence?.visible_seed ?? {})).filter(key => availableKeys.includes(key));
    if (keys.length === 0 && traces.length === 1) keys.push(...availableKeys);
    if (seeds.ordinary_presence_seed?.resolution === 'materialized' && plan.operations?.some(op =>
      op.op === 'request_discovery' && op.query === seeds.ordinary_presence_seed.query)) {
      keys.push(...availableKeys.filter(key =>
        ['search', 'inspect'].includes(seeds[key]?.discovery_kind)),
      'ordinary_presence_seed');
    }
    const actionKey = `turn_step_action_production_${step}`;
    if (Object.hasOwn(seeds, actionKey)) keys.push(actionKey);
    if (Object.hasOwn(seeds, `turn_step_item_use_${step}`)) keys.push(`turn_step_item_use_${step}`);
    const orderedKeys = unique(keys).filter(key => !usedKeys.has(key))
      .sort((a, b) => Number(seeds[b]?.kind === 'semantic_activity') - Number(seeds[a]?.kind === 'semantic_activity'));
    orderedKeys.forEach(key => usedKeys.add(key));
    projectDirectSeedChanges({ input, directSeedKeys: orderedKeys,
      visibleObjects: base.visible_objects }).forEach(change => components.add(change));
    const changes = [
      ...projectDirectSeedChanges({ input, directSeedKeys: orderedKeys,
        appliedPlan: plan, visibleObjects: base.visible_objects })
    ];
    if (plan.direct_result_kind === 'player_safe_observation') {
      components.add('Вы внимательно изучили обстановку.');
      components.add(text(plan.assessment?.text)
        ? plan.assessment.text : 'Вы внимательно изучили обстановку.');
    }
    if (plan.resolution === 'direct' && plan.goal_result === 'not_achieved') {
      const obstacle = orderedKeys.some(key => seeds[key]?.change === 'move_blocked'
        && ['hands_full', 'load_limit'].includes(seeds[key].reason));
      if (!obstacle) {
        const absence = projectPerceivedPeopleAbsence({ currentVisibleContext: base,
          currentSpatialContextIsFresh: input.retrieved_state?.current_spatial_context_is_fresh === true
            && input.retrieved_state.current_spatial_context != null,
          currentSpatialContextFiltersEntities: input.retrieved_state?.current_spatial_context_filters_entities });
        if (absence != null) changes.push(absence);
        // Perception confirms absence here, but does not classify the failed intent's cause.
        try { recordProjectionGap?.({ event: 'turn_step_not_achieved_projection_gap',
          code: 'failure_cause_not_grounded', step_index: step,
          source: 'turn_step_visible_projection' }); }
        catch { /* Diagnostics must not affect gameplay. */ }
      }
    }
    changes.forEach(change => components.add(change));
    return changes;
  });
  projectDirectSeedChanges({ input, directSeedKeys: [...usedKeys],
    visibleObjects: base.visible_objects }).forEach(change => components.add(change));
  if (!text(remaining) && orderedChanges.length === 0 && inspection == null && itemInspections.length === 0
      && !directPlans.some(plan => plan.goal_result === 'not_achieved')) return base;
  return deepFreeze({ ...structuredClone(base),
    visible_changes: [...orderedChanges,
      ...base.visible_changes.filter(change => !components.has(change)),
      ...itemInspections.flatMap(result => result.changes)
        .filter(change => !components.has(change)
          && !base.visible_changes.includes(change))],
    uncertainties: unique([...base.uncertainties,
      ...itemInspections.map(result => result.uncertainty),
      ...(pendingNpcResponse ? [
        'Возможный отклик слушателей ещё не разрешён и не является подтверждённым молчанием.'
      ] : []),
      ...(inspection == null ? [] : [
        `Новый достоверный вывод не установлен. Вопрос остаётся открытым: «${inspection.query}».`])]),
    sensory_details: unique([...base.sensory_details,
      ...(inspection?.scene_support ?? [])]),
    do_not_imply: unique([...base.do_not_imply,
      ...(pendingNpcResponse ? ['unresolved_npc_response_as_absence'] : []),
      ...(text(remaining) ? ['uncompleted_remaining_intent'] : []),
      ...(directPlans.some((plan) => plan.direct_result_kind === 'player_utterance')
        && !Object.values(seeds).some((value) =>
          value?.kind === 'post_applied_perception_window') ? [
        'unconfirmed_speech_audience_or_response', 'player_speech_claims_as_truth'] : [])])
  });
}
export function projectLowerDvinaTraceFireVisible(entries, clarification) {
  const facts = entries.filter(([key]) =>
    key.startsWith(FIRE_SEED_PREFIX))
    .sort(([left], [right]) => stepIndex(left) - stepIndex(right))
    .map(projectSeed);
  const scenes = facts.map(({scene}) => scene);
  if (clarification) scenes.push('Требуется уточнение дальнейшего действия.');
  return {
    scene: scenes.length > 0 ? scenes.join(' ') : null,
    changes: new Map(facts.map(({key,change}) => [key,change]))
  };
}
async function projectWithoutFire({ input, consequence, seedEntries,
  fallback, locationProfiles, scenePresentation, approvedActivityRecords = null }) {
  const ordinaryDetails = ordinarySceneDetails(seedEntries);
  const ordinaryPresence = uncoveredOrdinaryPresence(seedEntries,
    ordinaryPresenceResolution(seedEntries));
  let base;
  if (ordinaryDetails.length > 0 || ordinaryPresence != null
      || seedEntries.some(([key, value]) => key.startsWith('turn_step_')
        && ['semantic_activity', 'existing_item_inspection',
          'background_npc_observation'].includes(value?.kind))
      || seedEntries.some(([key, value]) =>
        /^turn_step_action_production_[1-8]$/u.test(key)
        && value?.change === 'physical_change')
      || seedEntries.some(([key]) => key === 'observed_evidence_inspection_seed')) {
    const body = currentBody(input);
    base = hasVisibleDomainProjection(consequence)
      ? await fallback.project(input)
      : projectCurrentSceneForVisibleOverlay({
            input, directSeedKeys: directSeedKeys(seedEntries),
            body, locationProfiles, scenePresentation, approvedActivityRecords
          });
    return overlayOrdinaryPresence(
      overlayOrdinaryScene(base, ordinaryDetails), ordinaryPresence,
      input?.ordinary_materialization_atomic_write_plan?.item);
  }
  const synthetic = plain(consequence?.visible_seed)
    && Array.isArray(consequence.visible_seed.completed_steps)
    && !hasVisibleDomainProjection(consequence);
  if (!synthetic) return overlayOrdinaryPresence(
    await fallback.project(input), ordinaryPresence,
    input?.ordinary_materialization_atomic_write_plan?.item);
  const directSeeds = seedEntries
    .filter(([key, value]) => key.startsWith('turn_step_') && plain(value));
  const body = currentBody(input);
  const currentScene = projectCurrentSceneForNoOperationDirect({
    input,
    directSeedKeys: directSeeds.map(([key]) => key),
    body, locationProfiles, scenePresentation, approvedActivityRecords
  });
  if (currentScene != null) return overlayOrdinaryPresence(
    currentScene, ordinaryPresence,
    input?.ordinary_materialization_atomic_write_plan?.item);
  // An unfinished domain handoff with no visible effects confirms no part of
  // the player's goal. Keep the committed scene, not a synthetic success.
  if (consequence.status === 'partial' && directSeeds.length === 0
      && consequence.visible_seed.clarification == null) {
    return overlayOrdinaryPresence(projectCurrentSceneForVisibleOverlay({
      input, directSeedKeys: [], body, locationProfiles, scenePresentation,
      approvedActivityRecords }), ordinaryPresence,
      input?.ordinary_materialization_atomic_write_plan?.item);
  }
  return overlayOrdinaryPresence(deepFreeze({
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'Заявленное действие завершено.',
    visible_changes: projectDirectSeedChanges({ input,
      directSeedKeys: directSeeds.map(([key]) => key) }),
    sensory_details: [], visible_npc: [], visible_objects: [],
    known_context: [
      ...([body.health, body.satiety, body.energy].every(Number.isFinite)
        ? [bodyStateSummary(body)] : [])
    ],
    uncertainties: [
      ...(consequence.visible_seed.clarification
        ? ['Фактическое действие не применено до уточнения.'] : []),
      ...(consequence.status === 'partial'
        ? ['Удалось осуществить лишь часть задуманного; остальное ещё не произошло.']
        : [])
    ],
    allowed_tensions: [],
    do_not_imply: [
      'hidden_fact', 'uncommitted_body_delta', 'uncommitted_time'
    ]
  }), ordinaryPresence, input?.ordinary_materialization_atomic_write_plan?.item);
}
function currentBody(input) {
  return input.body_update?.state_after ?? input.retrieved_state?.body_state
    ?? {};
}
function overlayFireVisible(base, fireVisible) {
  return deepFreeze({
    ...structuredClone(base),
    visible_scene: [base.visible_scene, fireVisible.scene]
      .filter(Boolean).join(' '),
    visible_changes: [
      ...base.visible_changes,
      ...fireVisible.changes.values()
    ]
  });
}
function directSeedKeys(entries) {
  return entries.filter(([key, value]) =>
    (key.startsWith('turn_step_') || key === 'ordinary_presence_seed' && value?.resolution === 'materialized')
      && !key.startsWith(FIRE_SEED_PREFIX)
      && plain(value)).map(([key]) => key);
}
function uncoveredOrdinaryPresence(entries, presence) {
  if (!['no_change', 'authority_required'].includes(presence?.resolution)) {
    return presence;
  }
  const covered = entries.some(([key, value]) => key.startsWith('turn_step_')
    && !key.startsWith(FIRE_SEED_PREFIX)
    && value?.kind === 'semantic_activity'
    && ['search', 'inspect'].includes(value.discovery_kind)
    && Number.isSafeInteger(Number(value.duration_minutes))
    && Number(value.duration_minutes) > 0
    && plain(value.discovery_result)
    && [2, 3].includes(Object.keys(value.discovery_result).length)
    && value.discovery_result.resolution === presence.resolution
    && value.discovery_result.query === presence.query
    && value.discovery_result.reason_code === presence.reason_code);
  return covered ? null : presence;
}
function hasVisibleDomainProjection(consequence) {
  return Array.isArray(consequence?.observations)
    || consequence?.combat_kind != null
    || Object.keys(consequence ?? {}).some((key) =>
      /^phase\d+_kind$/u.test(key) && consequence[key] != null);
}
function stepIndex(key) { return Number(key.slice(FIRE_SEED_PREFIX.length)); }
function unique(values) { return [...new Set(values)]; }
function text(value) {
  return typeof value === 'string' && value.length > 0
    && value.trim() === value;
}
function projectSeed([key,value]) {
  const keys = ['schema','process_kind','action','outcome','status'];
  const scene = SCENES[`${value?.action}:${value?.outcome}:${value?.status}`];
  if (!/^turn_step_world_process_[1-8]$/u.test(key)
      || value == null || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Object.keys(value).length !== keys.length
      || keys.some((field) => !Object.hasOwn(value, field))
      || value.schema !== SCHEMA
      || value.process_kind !== 'fire' || scene == null) {
    ownerFail('TRACE_TURN_STEP_WORLD_PROCESS_VISIBLE_SEED_INVALID');
  }
  return { key, scene, change: `${key}:local_fire:${value.outcome}` };
}
