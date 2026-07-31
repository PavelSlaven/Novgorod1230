import { row } from './first-playable/plan-shared.js';
import { phase5ActivityOwnerBindingKind } from
  '../../runtime/lower-dvina-trace-phase-5-activity-records.js';

export function appendPhase5ConsentDecision({ appends, state, factual,
  contracts, changeSetId }) {
  const consent = factual.consequence.treatment.consent;
  if (consent?.option_id !== 'accept_first_aid'
      || consent.elapsed_minutes !== 0
      || consent.trace?.option_id !== 'accept_first_aid') {
    throw new Error('TRACE_PHASE_5_CONSENT_INVALID');
  }
  appends.push(row('party_npc_decision_traces', consent.request.request_id, {
    request_id: consent.request.request_id,
    party_id: state.party_id,
    npc_id: contracts.actors.onisim_boatman.instance_id,
    state_version: Number(consent.trace.state_version),
    options_digest: consent.request.options_digest,
    option_id: consent.trace.option_id,
    command_token: consent.trace.command_token,
    trace_digest: consent.trace.trace_digest,
    status: 'committed',
    validated_at_whole_minutes: consent.trace.validated_at.whole_minutes,
    validated_at_subminute_numerator:
      consent.trace.validated_at.subminute_numerator,
    validated_at_subminute_denominator:
      consent.trace.validated_at.subminute_denominator,
    idempotency_key: consent.trace.idempotency_key,
    change_set_id: changeSetId
  }));
}

export function appendPhase5InitialBindings({ inserts, appends, execution,
  state, contracts, changeSetId, idemId }) {
  const participants = [
    ['player_character', state.actor_id, 'player_clerk'],
    ['npc', contracts.actors.onisim_boatman.instance_id, 'onisim_boatman'],
    ['npc', contracts.actors.eremey_fisher.instance_id, 'eremey_fisher'],
    ['npc', contracts.actors.participating_fisher.instance_id,
      contracts.actors.participating_fisher.participant_slot_ref]
  ];
  for (const [kind, id, role] of participants) {
    inserts.push(row('party_activity_participant_bindings',
      `${execution.id}:${kind}:${id}`, {
        activity_execution_id: execution.id,
        participant_kind: kind,
        participant_id: id,
        role_id: role,
        required: true,
        status: 'active',
        bound_change_set_id: changeSetId,
        terminal_change_set_id: null,
        state_version: 1
      }));
  }
  for (const binding of contracts.activity.resource_bindings) {
    const matches = state.items.filter(
      ({ template_id: id }) => id === binding.resource_ref
    );
    if (matches.length !== 1) {
      throw new Error('TRACE_PHASE_5_RESOURCE_BINDING_MISSING');
    }
    const item = matches[0];
    const ownerBindingKind = phase5ActivityOwnerBindingKind(
      binding.binding_kind
    );
    appends.push(row('party_activity_resource_bindings',
      `${execution.id}:item:${item.item_id}:${ownerBindingKind}`, {
        activity_execution_id: execution.id,
        resource_kind: 'item',
        resource_id: item.item_id,
        binding_kind: ownerBindingKind,
        quantity_numerator: 1,
        quantity_denominator: 1,
        change_set_id: changeSetId,
        idempotency_record_id: idemId,
        consumption_policy_ref: structuredClone(binding),
        state_version: 1
      }));
  }
}
