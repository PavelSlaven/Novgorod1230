import { projectConversationTemporalAdvance } from
  './lower-dvina-trace-m2-conversation-time.js';

export function createTracePhase9TemporalAdvance({ fallback }) {
  return async function advance(input) {
    const consequence = input.consequence;
    if (consequence?.phase9_kind === 'return_to_camp') {
      const traversal = consequence.phase9.movement.traversal;
      if (traversal?.interval_result?.clock_commit_mode
          !== 'direct_party_clock') fail('TRACE_PHASE_9_TEMPORAL_INVALID');
      return { clock_before: structuredClone(traversal.clock_before),
        clock_after: structuredClone(traversal.clock_update.world_time_after),
        exact_elapsed: structuredClone(input.exact_elapsed),
        nearest_boundary: null, boundary_trace: {
          owner: 'movement_route_owner', policy: 'movement_route_owner',
          evaluated_candidate_count:
            input.relevant_state.temporal_boundary_candidates?.length ?? 0,
          processed_boundary_ids: [] } };
    }
    if (consequence?.phase9_kind === 'onisim_testimony') {
      return projectConversationTemporalAdvance({
        clockBefore: input.clock_before,
        semanticExchange: consequence.phase9.semantic_exchange,
        candidates: input.relevant_state.temporal_boundary_candidates ?? [],
        roots: [{ activity_ref: consequence.phase9.activity_ref,
          duration_minutes: consequence.duration_minutes }] });
    }
    return fallback(input);
  };
}

export function createTracePhase9VisibleProjector({ fallback, contracts }) {
  return Object.freeze({ async project(input) {
    const kind = input.consequence?.phase9_kind;
    if (kind == null) return fallback.project(input);
    const phase9 = input.consequence.phase9;
    const detail = {
      bag_recovery: ['Дорожная сумка теперь под вашим контролем.',
        ['road_bag_recovered'], []],
      bag_opened: ['Сумка открыта; внутри виден свёрток.',
        ['road_bag_opened'], [{ item_id: contracts.packet.item_id,
          label: 'Запечатанный свёрток' }]],
      packet_recovered: [phase9.seal_observation.seal_state === 'intact'
        ? 'Свёрток извлечён; печать цела, содержимое не вскрыто.'
        : 'Свёрток извлечён; печать повреждена.',
      ['sealed_packet_observed'], [{ item_id: contracts.packet.item_id,
        label: 'Свёрток Саввы' }]],
      return_to_camp: ['Группа вернулась к Онисиму в рыбацкий стан.',
        ['guarded_return_completed'], []],
      onisim_testimony: [phase9.semantic_exchange.testimony_committed
        ? 'Показание Онисима сохранено как его слова.'
        : 'Ответ Онисима сохранён как речь; показанием он не признан.',
      ['onisim_statement_committed'], []],
      evidence_resolved: ['Собранные доказательства сопоставлены.',
        ['evidence_resolution_committed'], []],
      temporary_disposition: [
        'Временное решение о людях и имуществе сохранено.',
        ['temporary_disposition_committed'], []]
    }[kind];
    if (!detail) fail('TRACE_PHASE_9_VISIBLE_KIND_INVALID');
    return { version: 1, schema: 'visible_context_package',
      visible_scene: detail[0], visible_changes: detail[1],
      sensory_details: [], visible_npc: [], visible_objects: detail[2],
      known_context: kind === 'packet_recovered'
        ? ['Владелец свёртка — Савва; документ не вскрывался.'] : [],
      uncertainties: [], allowed_tensions: [], do_not_imply: [
        'document_contents', 'hidden_motive', 'objective_truth_from_statement',
        'completion_candidate', 'npc_decision_trace'] };
  } });
}
export function createTracePhase9BodyEffect({ fallback }) {
  return Object.freeze({ apply(input) {
    if (input.consequence?.phase9_kind == null) return fallback.apply(input);
    return { owner: '@rus/body-state', applied: false, proposal: null,
      state_after: structuredClone(input.committed_state.body_state) };
  } });
}
function fail(code) { throw Object.assign(new Error(code), { code }); }
