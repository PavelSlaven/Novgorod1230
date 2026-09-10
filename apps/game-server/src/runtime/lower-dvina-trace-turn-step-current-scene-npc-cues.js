import { projectLowerDvinaTraceVisibleNpcDetails } from
  './lower-dvina-trace-player-safe-state.js';
import { deepFreeze, plain } from
  './lower-dvina-trace-turn-step-runtime-common.js';
import { validateVisibleContext } from '@rus/visibility-knowledge-memory';
import { projectActor } from './lower-dvina-trace-player-safe-entities.js';
import { projectKnowledge, projectKnownContext } from './lower-dvina-trace-player-safe-world.js';

const ARRAY_FIELDS = ['visible_changes', 'sensory_details', 'visible_npc',
  'visible_objects', 'known_context', 'uncertainties', 'allowed_tensions', 'do_not_imply'];

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
    known_context: [...new Set([...visibleContext.known_context,
      ...projectKnownContext(projectActor({ profile: committedState?.player_profile,
        actorId: committedState?.actor_id }), projectKnowledge([
          ...(committedState?.player_profile?.knowledge?.initial_records ?? []),
          ...(committedState?.knowledge ?? [])]))])],
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
