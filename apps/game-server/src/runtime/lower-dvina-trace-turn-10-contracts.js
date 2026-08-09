import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../errors.js';

export function resolveTraceTurn10Contracts({ state, bundle, phase3Contracts,
  phase5Contracts }) {
  const binding = bundle.turn_10_companion_bindings;
  const actors = {
    eremey: withRef(actor(state, 'eremey_fisher'), 'eremey_fisher'),
    ratsha: withRef(actor(state, 'ratsha_storehouse_helper'),
      'ratsha_storehouse_helper'),
    onisim: withRef(actor(state, 'onisim_boatman'), 'onisim_boatman')
  };
  actors.participatingFisher = withRef(
    phase5Contracts?.actors?.participating_fisher,
    'resolved_participating_fisher');
  const fishers = (state.npcs ?? []).filter(({ participant_slot_ref: slot }) =>
    ['background_fisher_1', 'background_fisher_2'].includes(slot));
  const otherFisher = fishers.find(({ instance_id: id }) =>
    id !== actors.participatingFisher?.instance_id);
  actors.otherFisher = withRef(otherFisher,
    otherFisher?.participant_slot_ref);
  if (binding?.schema
      !== 'rus.lower_dvina_trace_turn_10_companion_bindings.v1'
      || binding.scenario_definition_revision !== 15
      || binding.status !== 'approved'
      || binding.fallback_policy !== 'forbidden'
      || binding.command_binding?.operation !== 'emit_interaction'
      || binding.conversation_activity?.duration_minutes !== 5
      || binding.conversation_activity?.time_mode
        !== 'parent_activity_final_segment'
      || binding.conversation_activity?.parent_activity_ref
        !== 'trace_ld_v1_activity_fire_rest'
      || binding.conversation_activity?.contribution_slots !== 5
      || binding.route_ref !== 'trace_ld_v1_route_camp_to_storehouse'
      || binding.route_activity_ref
        !== 'trace_ld_v1_activity_route_to_storehouse'
      || !actors.participatingFisher?.instance_id
      || !actors.otherFisher?.instance_id
      || !phase3Contracts?.conversationBindings) {
    gap('TRACE_TURN10_CONTRACT_GAP');
  }
  return Object.freeze({
    binding: structuredClone(binding),
    actors: structuredClone(actors),
    conversationBindings:
      structuredClone(phase3Contracts.conversationBindings),
    check: null,
    campLocationRef: 'trace_ld_v1_loc_fishing_camp',
    activityPin: {
      id: binding.conversation_activity.profile_id,
      version: binding.conversation_activity.version,
      digest: canonicalDigest(binding.conversation_activity)
    }
  });
}

function withRef(actorValue, ref) {
  return actorValue == null ? actorValue : { ...actorValue, ref };
}

function actor(state, slot) {
  const found = (state.npcs ?? []).filter(
    ({ participant_slot_ref: candidate }) => candidate === slot);
  if (found.length !== 1 || !found[0].instance_id) {
    gap('TRACE_TURN10_ACTOR_GAP');
  }
  return found[0];
}

function gap(code) {
  throw serverError(code,
    'The exact approved Turn 10 companion contract is incomplete.',
    { status: 409 });
}
