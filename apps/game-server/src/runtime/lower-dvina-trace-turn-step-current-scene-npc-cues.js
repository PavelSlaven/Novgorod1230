import { projectLowerDvinaTraceVisibleNpcDetails } from
  './lower-dvina-trace-player-safe-state.js';
import { deepFreeze, plain } from
  './lower-dvina-trace-turn-step-runtime-common.js';
import { validateVisibleContext } from '@rus/visibility-knowledge-memory';
import { projectCalendar } from '@rus/time-events-history/calendar';
import { projectActor, projectBodyState, projectInteractions } from './lower-dvina-trace-player-safe-entities.js';
import { projectKnowledge, projectKnownContext } from './lower-dvina-trace-player-safe-world.js';

const ARRAY_FIELDS = ['visible_changes', 'sensory_details', 'visible_npc',
  'visible_objects', 'known_context', 'uncertainties', 'allowed_tensions', 'do_not_imply'];
const BODY_CHANGE_CONTEXT = 'Изменение состояния тела: ';

export function enrichLowerDvinaTraceVisibleNpcCues({
  visibleContext,
  committedState, bodyAfter = null, clockAfter = null, calendarProfile = null
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
  const beforeContext = currentActorContext(committedState?.body_state, committedState?.clock, calendarProfile);
  const afterContext = currentActorContext(bodyAfter ?? committedState?.body_state,
    clockAfter ?? committedState?.clock, calendarProfile);
  const beforeConditions = projectBodyState(committedState?.body_state)?.active_conditions ?? [];
  const afterConditions = projectBodyState(bodyAfter)?.active_conditions ?? [];
  const removed = beforeConditions.filter(condition =>
    !afterConditions.some(after => JSON.stringify(condition) === JSON.stringify(after)));
  const added = afterConditions.filter(condition =>
    !beforeConditions.some(before => JSON.stringify(condition) === JSON.stringify(before)));
  const conditionChanges = bodyAfter == null
    || removed.length + added.length === 0 ? [] : [
      `${BODY_CHANGE_CONTEXT}${JSON.stringify({ before: removed, after: added })}`];
  return deepFreeze({
    ...structuredClone(visibleContext),
    visible_changes: [...new Set([...visibleContext.visible_changes,
      ...(conditionChanges.length === 0 ? [] : ['Состояние вашего тела изменилось.'])])],
    known_context: [...new Set([...visibleContext.known_context.filter(value =>
      !beforeContext.includes(value) && !value.startsWith(BODY_CHANGE_CONTEXT)),
      ...afterContext, ...conditionChanges,
      ...projectKnownContext(projectActor({ profile: committedState?.player_profile,
        actorId: committedState?.actor_id }), projectKnowledge([
          ...(committedState?.player_profile?.knowledge?.initial_records ?? []),
          ...(committedState?.knowledge ?? [])]), projectInteractions(committedState?.interactions))])],
    visible_npc: visibleContext.visible_npc.map((npc) => {
      const detail = details.get(npc?.entity_ref?.entity_id);
      const informative = detail != null
        && (detail.visible_equipment.length > 0
          || Object.keys(detail.presentation).length > 0
          || detail.ordinary_remainder != null
          || Object.keys(detail.identity_state).some((key) =>
            key !== 'display_name'));
      return !informative ? structuredClone(npc) : {
        ...structuredClone(npc),
        observable_cues: {
          identity: structuredClone(detail.identity_state),
          equipment: structuredClone(detail.visible_equipment),
          outward_presentation: structuredClone(detail.presentation),
          ...(detail.ordinary_remainder == null ? {} : {
            ordinary_remainder: structuredClone(detail.ordinary_remainder)
          })
        }
      };
    })
  });
}

function currentActorContext(body, clock, calendarProfile) {
  const conditions = projectBodyState(body)?.active_conditions ?? [];
  const result = conditions.length === 0 ? [] : [
    `Текущие состояния вашего тела: ${JSON.stringify(conditions)}`];
  if (clock != null && calendarProfile != null) {
    const calendar = projectCalendar(clock, calendarProfile);
    const minutes = BigInt(calendar.local_time_of_day.numerator)
      / BigInt(calendar.local_time_of_day.denominator);
    result.push(`Текущее местное время: ${calendar.day}.${calendar.month}.${calendar.year}, ${String(minutes / 60n).padStart(2, '0')}:${String(minutes % 60n).padStart(2, '0')}.`);
  }
  return result;
}

function validCurrentScene(value) {
  return plain(value)
    && validateVisibleContext(value).ok
    && ARRAY_FIELDS.every((field) => Array.isArray(value[field]));
}

function text(value) {
  return typeof value === 'string' && value.length > 0;
}

function failCurrentScene() {
  throw Object.assign(new Error(
    'The committed current scene cannot be projected safely.'),
  { code: 'TRACE_CURRENT_SCENE_PROJECTION_INVALID', status: 409 });
}
