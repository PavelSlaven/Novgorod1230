import { getCommittedInventoryLoad } from
  './lower-dvina-trace-committed-inventory.js';
import { executeTraceLocalTraversal } from
  './lower-dvina-trace-local-traversal.js';
import { available, mode, phase3WriteTargets } from
  './lower-dvina-trace-phase-3-command-shared.js';
import { atCamp, dispositionOptions, dispositionPlan, openPlan,
  packetPlan,
  presentParticipantIds, recoveryPlan, resolveEvidence, returnAvailable,
  testimonyStageResolved } from
  './lower-dvina-trace-phase-9-command-plans.js';

const COMMAND = Object.freeze({
  recover: 'lower_dvina_trace.recover_road_bag_control',
  open: 'lower_dvina_trace.open_recovered_road_bag',
  packet: 'lower_dvina_trace.recover_packet_and_inspect_seal',
  return: 'lower_dvina_trace.return_to_fishing_camp_with_group',
  evidence: 'lower_dvina_trace.resolve_case_evidence',
  disposition: 'lower_dvina_trace.commit_temporary_disposition'
});

export function createTracePhase9Commands({ contracts, inputDigest }) {
  return [recoveryCommand(contracts, inputDigest),
    openCommand(contracts, inputDigest), packetCommand(contracts, inputDigest),
    returnCommand(contracts, inputDigest), evidenceCommand(contracts,
      inputDigest), dispositionCommand(contracts, inputDigest)];
}

function recoveryCommand(contracts, inputDigest) {
  return command({ id: COMMAND.recover, option: 'recover_road_bag_control',
    approved: activityPin(contracts, contracts.activities.inspect),
    primary: 'item_property', subsystems: ['item_access', 'inventory',
      'ownership_access', 'time_progression'],
    can: (state) => recoveryPlan(state, contracts).pass,
    resolve: (state) => {
      const result = recoveryPlan(state, contracts);
      if (!result.pass) fail(result.errors[0]?.code);
      const admission = result.proposal.property_history.causal_basis
        .committed_fact_ids[0];
      return consequence(inputDigest, 'bag_recovery', 2, {
        property_transition: result.proposal,
        committed_facts: [admission, recoveryStatusFact(admission),
          'road_bag_recognized_by_physical_marks',
          'trace_ld_v1_evidence_bag_at_zhdanko'].filter(Boolean)
      });
    } });
}

function openCommand(contracts, inputDigest) {
  return command({ id: COMMAND.open, option: 'open_recovered_road_bag',
    approved: activityPin(contracts, contracts.activities.inspect),
    primary: 'item_property', subsystems: ['item_access', 'inventory',
      'ownership_access', 'time_progression'],
    can: (state) => openPlan(state, contracts).pass,
    resolve: (state) => {
      const result = openPlan(state, contracts);
      if (!result.pass) fail(result.errors[0]?.code);
      return consequence(inputDigest, 'bag_opened', 2, {
        property_transition: result.proposal,
        revealed_item_refs: [contracts.packet.item_id]
      });
    } });
}

function packetCommand(contracts, inputDigest) {
  return command({ id: COMMAND.packet,
    approved: activityPin(contracts, contracts.activities.inspect),
    option: 'recover_packet_and_inspect_seal', primary: 'item_property',
    subsystems: ['item_access', 'inventory', 'ownership_access',
      'knowledge_memory', 'time_progression'],
    can: (state) => packetPlan(state, contracts).pass,
    resolve: (state) => {
      const result = packetPlan(state, contracts);
      if (!result.pass) fail(result.errors[0]?.code);
      const seal = result.proposal.next.state.seal_state;
      return consequence(inputDigest, 'packet_recovered', 1, {
        property_transition: result.proposal,
        seal_observation: { seal_state: seal,
          document_contents_state:
            result.proposal.next.state.document_contents_state,
          document_contents_access:
            result.proposal.next.state.document_contents_access,
          objective_content_write: 'forbidden' },
        committed_facts: seal === 'intact'
          ? ['sealed_packet_returned', 'seal_intact',
            'trace_ld_v1_evidence_intact_seal']
          : ['destroyed_packet_state_observed', 'packet_lost_or_destroyed']
      });
    } });
}

function returnCommand(contracts, inputDigest) {
  return command({ id: COMMAND.return, option: 'return_to_fishing_camp',
    approved: activityPin(contracts, contracts.activities.return),
    primary: 'movement_route', subsystems: ['movement', 'route',
      'time_progression'], can: (state) => returnAvailable(state, contracts),
    resolve: (state, playerInput) => {
      const inventory = getCommittedInventoryLoad(state);
      if (!inventory.mass.pass || !inventory.hands.pass || !inventory.load.pass) {
        fail('TRACE_PHASE_9_INVENTORY_LOAD_INVALID');
      }
      const participants = presentParticipantIds(state);
      const traversal = executeTraceLocalTraversal({ state, playerInput,
        inputDigest, namespace: 'trace-phase9-return', route: contracts.route,
        activity: contracts.activities.return,
        sourceEndpoint: contracts.sourceEndpoint,
        destinationEndpoint: contracts.destinationEndpoint,
        destinationLocationRef: contracts.ids.camp,
        destinationAnchorId: contracts.campAnchor,
        accessPolicy: contracts.access, capacityContract: contracts.capacity,
        inventoryLoad: { total_mass_grams: inventory.mass.total_mass_grams,
          hands_used: inventory.hands.hands_used,
          load_category: inventory.load.load_category },
        participantGroup: participants });
      if (!traversal.terminal) fail('TRACE_PHASE_9_RETURN_INCOMPLETE');
      return consequence(inputDigest, 'return_to_camp', 15, { movement: {
        owner: '@rus/movement-routes', route_ref: contracts.route.route_id,
        activity_ref: contracts.activities.return.profile_id,
        source: { location_ref: state.position.location_ref,
          g5_anchor_id: state.position.g5_anchor_id },
        destination: { location_ref: contracts.ids.camp,
          g5_anchor_id: contracts.campAnchor,
          g5_node_id: contracts.campNode }, participants, traversal,
        inventory_load: structuredClone(traversal.inventory_load) } });
    } });
}

function evidenceCommand(contracts, inputDigest) {
  return command({ id: COMMAND.evidence, option: 'resolve_case_evidence',
    approved: contracts.activityPins[0],
    primary: 'knowledge_history', subsystems: ['knowledge_memory'],
    can: (state) => atCamp(state, contracts)
      && testimonyStageResolved(state),
    resolve: (state) => {
      const result = resolveEvidence(state, contracts.evidenceGraph);
      if (!result.ok) fail(result.error_code);
      return consequence(inputDigest, 'evidence_resolved', 0, {
        evidence_resolution: result,
        temporary_disposition_options: dispositionOptions(state, contracts) });
    } });
}

function dispositionCommand(contracts, inputDigest) {
  return command({ id: COMMAND.disposition,
    approved: activityPin(contracts, contracts.activities.disposition),
    option: 'commit_temporary_disposition', primary: 'social_npc',
    subsystems: ['social_status', 'time_progression'],
    can: (state) => atCamp(state, contracts)
      && state.phase9?.evidence_resolution?.ok === true
      && state.phase9?.temporary_disposition_options?.schema
        === 'temporary_disposition_option_set_v1'
      && state.phase9?.temporary_disposition == null,
    resolve: (state, _playerInput, semanticPlan) => {
      const selected = semanticPlan?.operations?.[0]?.target_refs ?? [];
      const proposal = dispositionPlan(state, contracts, selected);
      return consequence(inputDigest, 'temporary_disposition', 5,
        { temporary_disposition: proposal,
          committed_facts: proposal.committed_fact_outputs });
    } });
}

function command({ id, option, approved, primary, subsystems, can, resolve }) {
  return Object.freeze({ command_id: id, option_id: option, label: option,
    target_id: option, approved_record: approved,
    preconditions: [{ kind: `phase9_${option}` }], expected_cost: null,
    known_risks: [], reason_visible_to_actor: option,
    mode: mode(primary, subsystems), matches: () => false,
    availability({ committed_state: committed, retrievedState }) {
      const ok = can(committed ?? retrievedState);
      return available(ok, [], ok ? [] : [`phase9_${option}_unavailable`]);
    },
    consequence({ retrievedState: state, playerInput, semanticPlan }) {
      if (!can(state)) fail(`TRACE_PHASE_9_${option.toUpperCase()}_BLOCKED`);
      return resolve(state, playerInput, semanticPlan);
    }, writeTargets: phase3WriteTargets });
}

function consequence(inputDigest, kind, duration, phase9) {
  return { version: 1, schema: 'turn_consequence_package', status: 'resolved',
    activity_attempt_id: `attempt:${inputDigest.slice(0, 32)}`,
    duration_minutes: duration, phase9_kind: kind, phase9,
    visible_seed: {}, hidden_update: {}, state_changes: [],
    suggested_actions: [] };
}

function fail(code) { throw Object.assign(new Error(code), { code }); }
function activityPin(contracts, profile) { return contracts.activityPins.find(
  ({ id }) => id === profile.profile_id); }
function recoveryStatusFact(admission) {
  return {
    road_bag_recovery_after_zhdanko_disarm_admitted:
      'zhdanko_disarmed_and_temporarily_restrained',
    road_bag_recovery_after_zhdanko_submission_admitted:
      'zhdanko_submission_committed',
    road_bag_recovery_after_zhdanko_departure_admitted: 'zhdanko_fled'
  }[admission] ?? null;
}

export const TRACE_PHASE_9_COMMANDS = COMMAND;

export function tracePhase9PreconditionSatisfied(precondition, state,
  contracts) {
  if (!precondition?.kind?.startsWith('phase9_')) return false;
  const command = createTracePhase9Commands({ contracts,
    inputDigest: 'precondition'.padEnd(32, '0') }).find(({ preconditions }) =>
    preconditions[0].kind === precondition.kind);
  if (!command) return false;
  return command.availability({ committed_state: state,
    action_set_evaluation: true }).can_attempt;
}
