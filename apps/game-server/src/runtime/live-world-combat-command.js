import { serverError } from '../errors.js';
import { npcSharesPlayerScene } from './lower-dvina-trace-scene-presence.js';

const COMMAND_ID = 'live_world.request_combat';
const blocked = (reason) => ({ version: 1, schema: 'turn_availability_decision',
  status: 'blocked', can_attempt: false, reasons: [reason],
  check_requests: [] });

/** One generic live-world entry, with targets derived from the current scene readback. */
export function createLiveWorldCombatCommand({ state, repository, partyId,
  idempotencyKey, turnBudget = null }) {
  if (typeof repository?.loadPhase2State !== 'function'
      || typeof partyId !== 'string' || !partyId) return null;
  if (combatTargetIds(state).length === 0) return null;
  const targets = new Set(combatTargetIds(state));
  const currentSource = (candidate) => candidate?.party_id === partyId
    && candidate.actor_id === state.actor_id
      && combatTargetIds(candidate).some((id) => targets.has(id));

  return {
    command_id: COMMAND_ID,
    option_id: 'live_world_request_combat',
    label: 'Начать непосредственное противостояние',
    target_id: null,
    preconditions: [{ kind: 'current_scene_npc_available' }],
    expected_cost: { kind: 'combat_exchange', value: 2 },
    known_risks: ['Боевое действие может причинить вред участникам.'],
    reason_visible_to_actor: 'Доступный человек находится рядом.',
    mode: { selected_primary_mode: 'combat', secondary_modes: [],
      resolution_plan: { subsystems: ['combat_resolution', 'body_state'],
        checks_to_run: [], expected_writes: [], state_blocks_to_load: [
          'party_state', 'current_position', 'relevant_npcs'
        ] } },
    matches: () => false,
    semantic_binding: { binding_id: 'live_world.request_combat',
      operation: 'request_combat',
      matches: ({ operation }) => validOperation(operation, state.actor_id)
        && targets.has(operation.target_refs[0]) },
    availability({ committed_state: current, retrievedState }) {
      const candidate = current ?? retrievedState;
      const present = candidate?.party_id === partyId
        && candidate.actor_id === state.actor_id
        && combatTargetIds(candidate).length > 0
        && !(candidate.combat_sessions ?? []).some(({ status }) =>
          status !== 'ended');
      if (!present) return blocked('combat_target_unavailable');
      const hasBody = combatTargetIds(candidate).some((targetId) =>
        candidate.npcs.find(({ instance_id: id }) => id === targetId)
          ?.body_state_persisted === true);
      return blocked(hasBody
        ? 'combat_actor_execution_profile_required'
        : 'combat_actor_body_state_required');
    },
    async consequence({ semanticPlan, playerInput }) {
      const raw = semanticPlan?.operations?.[0];
      if (!validOperation(raw, state.actor_id)
          || !targets.has(raw.target_refs[0])) {
        throw gap('combat_actor_unavailable', raw?.target_refs?.[0] ?? null);
      }
      const current = await repository.loadPhase2State(partyId, {
        presentationIdempotencyKey: idempotencyKey,
        turnBudget
      });
      if (!currentSource(current)
          || !validOperation(raw, current.actor_id)
          || !combatTargetIds(current).includes(raw.target_refs[0])) {
        throw gap('combat_actor_unavailable', raw.target_refs[0]);
      }
      const actor = current.npcs.find(({ instance_id: id }) =>
        id === raw.target_refs[0]);
      if (actor?.body_state_persisted !== true) {
        throw gap('combat_actor_body_state_required', raw.target_refs[0]);
      }
      // v17 has no approved generic combat execution profile yet. Do not borrow a
      // scenario binding or activate the candidate bundle at this boundary.
      throw gap('combat_actor_execution_profile_required', raw.target_refs[0]);
    },
    writeTargets: () => []
  };
}

function combatTargetIds(state) {
  const actors = (state?.npcs ?? []).filter((npc) =>
    typeof npc.instance_id === 'string' && npc.instance_id
      && npc.scene_readback_present === true
      && npcSharesPlayerScene(state, npc));
  return actors.map(({ instance_id: id }) => id);
}

function validOperation(operation, actorId) {
  return operation?.op === 'request_combat'
    && operation.actor_ref === actorId
    && ['engage', 'control'].includes(operation.intent_kind)
    && Array.isArray(operation.target_refs)
    && operation.target_refs.length === 1
    && Array.isArray(operation.protected_refs)
    && operation.protected_refs.length === 0
    && operation.scope_ref === null
    && operation.destination_ref === null
    && ['ordinary', 'nonlethal_if_possible'].includes(operation.force_limit)
    && ['ordinary', 'cautious'].includes(operation.risk_posture);
}

function gap(code, actorId) {
  return serverError(code, 'Live-world combat admission is unavailable.', {
    status: 409,
    details: actorId == null ? null : { actor_ref: {
      entity_kind: 'npc', entity_id: actorId
    } }
  });
}
