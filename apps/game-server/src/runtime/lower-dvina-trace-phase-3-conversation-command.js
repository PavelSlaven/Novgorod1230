import {
  tracePhase3PreconditionSatisfied
} from './lower-dvina-trace-phase-3-admission.js';
import {
  available,
  exact,
  exactMatcher,
  fail,
  mode,
  packageBase,
  phase3WriteTargets
} from './lower-dvina-trace-phase-3-command-shared.js';
import {
  assertTracePhase3ConversationExecution,
  resolveTracePhase3NpcDecision
} from './lower-dvina-trace-phase-3-npc-decision.js';

export function createTracePhase3ConversationCommand({
  contracts,
  inputDigest,
  evidence
}) {
  const ids = contracts.ids;
  const activity = evidence ? contracts.evidenceTalk : contracts.talk;
  const optionId = evidence ? ids.evidenceOption : ids.talkOption;
  const activityPin = contracts.activityPins[evidence ? 2 : 1];
  const preconditions = [{
    kind: 'committed_location',
    location_ref: ids.campLocation
  }, {
    kind: 'approved_access_policy',
    policy_ref: contracts.access.policy_id
  }, {
    kind: 'materialized_present_npc',
    ref: ids.eremeyRef
  }, {
    kind: 'npc_policy_state',
    state: 'guarded'
  }, ...(evidence ? [{
    kind: 'committed_evidence_access',
    evidence_ref: ids.evidence
  }] : [])];
  return {
    command_id: `lower_dvina_trace.${optionId}`,
    option_id: optionId,
    label: evidence
      ? 'Показать Еремею синюю шерсть и попросить содействия'
      : 'Спросить Еремея о крушении',
    target_id: contracts.actors[0].instance_id,
    approved_record: activityPin,
    preconditions,
    expected_cost: {
      kind: 'exact_time',
      value: activity.duration_minutes
    },
    known_risks: evidence ? ['Еремей может остаться настороженным.'] : [],
    reason_visible_to_actor: evidence
      ? 'Найденная синяя шерсть доступна для предъявления.'
      : 'Еремей находится в стане и может ответить.',
    mode: mode('social_npc', [
      'npc_interaction', 'knowledge_memory', 'time_progression'
    ]),
    matches: exactMatcher(optionId),
    availability(context) {
      const state = context.committed_state ?? context.retrievedState;
      const allowed = preconditions.every((precondition) =>
        tracePhase3PreconditionSatisfied(precondition, state, contracts));
      const checkRequests = evidence && allowed ? [{
        check_id: contracts.check.check_id,
        difficulty: contracts.check.dc,
        attribute_value:
          state.player_profile.attributes[contracts.check.attribute].value,
        skill_bonus:
          state.player_profile.skills[contracts.check.skill].bonus,
        state_modifier: contracts.check.modifiers.state,
        equipment_modifier: contracts.check.modifiers.item_or_evidence,
        circumstance_modifier: contracts.check.modifiers.circumstance,
        profile_version: contracts.check.version,
        consequence_refs: structuredClone(contracts.check.outcome_refs),
        retry_policy: contracts.check.retry_policy
      }] : [];
      return available(allowed, checkRequests,
        allowed ? [] : ['conversation_precondition_failed']);
    },
    async consequence({ retrievedState: state, checks }) {
      const checkResult = evidence
        ? checks.results.find(
            ({ check_id: id }) => id === contracts.check.check_id
          )
        : null;
      if (evidence && !checkResult) {
        fail('TRACE_PHASE_3_CHECK_RESULT_MISSING');
      }
      const success = checkResult?.outcome?.success === true;
      const decisionOption = evidence && success
        ? 'bounded_disclosure'
        : 'evade_and_withhold';
      const execution = exact(
        contracts.executions,
        'option_id',
        decisionOption
      );
      const mapping = evidence && success
        ? contracts.disclosureMapping
        : contracts.firstMapping;
      assertTracePhase3ConversationExecution({
        activity,
        execution,
        mapping,
        contracts,
        optionId: decisionOption
      });
      const npcDecision = resolveTracePhase3NpcDecision({
        state,
        contracts,
        optionId: decisionOption,
        execution,
        inputDigest
      });
      const alreadyCommitted = (state.interactions ?? []).some(
        (entry) => entry.statement_ref === mapping.statement_template_ref
      );
      const projectionText = contracts.projectionText[mapping.mapping_id];
      if (!projectionText?.memory_text || !projectionText.journal_text) {
        fail('TRACE_PHASE_3_PROJECTION_TEMPLATE_GAP');
      }
      return packageBase({
        inputDigest,
        duration: activity.duration_minutes,
        kind: 'conversation',
        conversation: {
          activity_ref: activity.profile_id,
          check_result: evidence ? structuredClone(checkResult) : null,
          consequence_ref: evidence
            ? contracts.check.outcome_refs[success ? 'success' : 'failure']
            : null,
          npc_ref: ids.eremeyRef,
          npc_id: contracts.actors[0].instance_id,
          decision: npcDecision,
          execution_ref: execution.execution_binding_id,
          mapping_ref: mapping.mapping_id,
          statement_ref: mapping.statement_template_ref,
          memory_ref: mapping.speaker_memory_projection.template_ref,
          journal_ref: mapping.player_journal_projection.template_ref,
          memory_text: projectionText.memory_text,
          journal_text: projectionText.journal_text,
          statement_is_new: !alreadyCommitted,
          route_knowledge_ref: evidence && success
            ? mapping.route_knowledge_disclosure.route_ref
            : null,
          testimonial_evidence_ref: evidence && success
            ? 'trace_ld_v1_evidence_eremey_words'
            : null,
          evidence_input_ref: evidence ? ids.evidence : null,
          objective_fact_outputs: []
        }
      });
    },
    writeTargets: phase3WriteTargets
  };
}
