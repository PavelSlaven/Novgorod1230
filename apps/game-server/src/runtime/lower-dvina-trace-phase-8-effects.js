import { projectConversationTemporalAdvance } from
  './lower-dvina-trace-m2-conversation-time.js';

export function createTracePhase8TemporalAdvance({ fallback }) {
  return async function advance(input) {
    const consequence = input.consequence;
    if (consequence?.combat_kind === 'exchange'
        && consequence.combat?.temporal_advance_results?.length > 0) {
      const temporal = consequence.combat.temporal_advance_results.at(-1);
      return { clock_before: structuredClone(input.clock_before),
        clock_after: structuredClone(temporal.clock_after),
        exact_elapsed: structuredClone(input.exact_elapsed),
        nearest_boundary: temporal.trace?.processed_boundary_ids?.length > 0
          ? { scheduled_at: structuredClone(temporal.clock_after),
            boundary_ids: [...temporal.trace.processed_boundary_ids] }
          : null,
        boundary_trace: { owner:
          '@rus/time-events-history/temporal-boundaries',
        policy: 'split_before_earliest_boundary',
        evaluated_candidate_count:
          input.relevant_state.temporal_boundary_candidates?.length ?? 0,
        processed_boundary_ids: [
          ...(temporal.trace?.processed_boundary_ids ?? [])] } };
    }
    if (consequence?.phase8_kind === 'movement') {
      const traversal = consequence.movement?.traversal;
      if (traversal?.interval_result?.clock_commit_mode
          !== 'direct_party_clock') fail('TRACE_PHASE_8_TEMPORAL_INVALID');
      return { clock_before: structuredClone(traversal.clock_before),
        clock_after: structuredClone(traversal.clock_update.world_time_after),
        exact_elapsed: input.exact_elapsed, nearest_boundary: null,
        boundary_trace: { owner: 'movement_route_owner',
          policy: 'movement_route_owner', evaluated_candidate_count:
            input.relevant_state.temporal_boundary_candidates?.length ?? 0,
          processed_boundary_ids: [] } };
    }
    if (consequence?.phase8_kind === 'accusation') {
      return projectConversationTemporalAdvance({
        clockBefore: input.clock_before,
        semanticExchange: consequence.accusation.semantic_exchange,
        candidates: consequence.accusation.semantic_exchange.temporal_candidates
          ?? input.relevant_state.temporal_boundary_candidates,
        roots: consequence.accusation.activity_roots });
    }
    return fallback(input);
  };
}

export function createTracePhase8VisibleProjector({ fallback, contracts }) {
  return Object.freeze({ async project(input) {
    const consequence = input.consequence;
    if (consequence?.phase8_kind === 'movement') return {
      version: 1, schema: 'visible_context_package',
      visible_scene: 'Группа пришла во двор клети Жданко.',
      visible_changes: ['trace_ld_v1_route_camp_to_storehouse_committed'],
      sensory_details: ['Клеть и двор видны с конца известной тропы.'],
      visible_npc: Object.values(contracts.actors).map((npc) => ({
        npc_id: npc.instance_id,
        label: npc.semantic_profile?.identity?.canonical_name
          ?? npc.participant_slot_ref })),
      visible_objects: [], known_context: [
        'Обратный путь к рыбацкому стану теперь известен.'],
      uncertainties: [], allowed_tensions: ['armed_confrontation'],
      do_not_imply: ['guilt', 'hidden_truth', 'combat_outcome'] };
    if (consequence?.phase8_kind === 'accusation') {
      const combat = consequence.accusation.combat_initialization;
      return { version: 1, schema: 'visible_context_package',
        visible_scene: combat == null
          ? 'Жданко ответил на предъявленное обвинение.'
          : 'Разговор прерван непосредственной угрозой; требуется решение.',
        visible_changes: combat == null ? ['accusation_delivered']
          : ['combat_session_opened'], sensory_details: [],
        visible_npc: Object.values(contracts.actors).map((npc) => ({
          npc_id: npc.instance_id,
          label: npc.semantic_profile?.identity?.canonical_name
            ?? npc.participant_slot_ref })),
        visible_objects: [], known_context: [], uncertainties: [],
        allowed_tensions: ['armed_confrontation'],
        do_not_imply: ['npc_decision_request', 'npc_combat_intent_plan',
          'hidden_truth', 'combat_outcome'] };
    }
    return fallback.project(input);
  } });
}
function fail(code) { throw Object.assign(new Error(code), { code }); }
