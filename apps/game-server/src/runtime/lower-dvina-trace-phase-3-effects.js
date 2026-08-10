import { addElapsedTime } from '@rus/time-events-history';
import { projectConversationTemporalAdvance } from
  './lower-dvina-trace-m2-conversation-time.js';

export function createTracePhase3TemporalAdvance({ phase2Advance }) {
  return async function advance(input) {
    const semantic = input.consequence?.conversation?.semantic_exchange;
    if (input.consequence?.phase3_kind == null && semantic == null) {
      return phase2Advance(input);
    }
    const candidates = semantic?.temporal_candidates
      ?? input.relevant_state.temporal_boundary_candidates;
    if (!Array.isArray(candidates)) {
      throw Object.assign(
        new Error('Phase 3 temporal boundary candidates are required.'),
        { code: 'TRACE_PHASE_3_TEMPORAL_STATE_INVALID' }
      );
    }
    if (input.consequence?.phase3_kind === 'movement') {
      const traversal = input.consequence.movement?.traversal;
      const clockUpdate = traversal?.clock_update;
      const result = traversal?.interval_result;
      if (result?.clock_commit_mode !== 'direct_party_clock'
          || result?.actual_time_numerator
            !== input.exact_elapsed?.exact_minutes?.numerator
          || result?.actual_time_denominator
            !== input.exact_elapsed?.exact_minutes?.denominator
          || traversal?.clock_before?.whole_minutes
            !== input.clock_before.whole_minutes
          || traversal?.clock_before?.subminute_numerator
            !== input.clock_before.subminute_numerator
          || traversal?.clock_before?.subminute_denominator
            !== input.clock_before.subminute_denominator) {
        throw Object.assign(
          new Error('Movement traversal does not own one exact clock update.'),
          { code: 'TRACE_PHASE_3_TEMPORAL_STATE_INVALID' }
        );
      }
      return {
        clock_before: structuredClone(traversal.clock_before),
        clock_after: structuredClone(clockUpdate.world_time_after),
        exact_elapsed: input.exact_elapsed,
        nearest_boundary: null,
        boundary_trace: {
          owner: 'movement_route_owner',
          policy: 'movement_route_owner',
          evaluated_candidate_count: candidates.length,
          processed_boundary_ids: []
        }
      };
    }
    if (semantic != null) {
      return projectConversationTemporalAdvance({
        clockBefore: input.clock_before,
        semanticExchange: semantic,
        candidates,
        roots: [{
          activity_ref: input.consequence.conversation.activity_ref,
          duration_minutes: semantic.exact_elapsed_minutes
        }]
      });
    }
    return {
      clock_before: input.clock_before,
      clock_after: addElapsedTime(
        input.clock_before,
        input.exact_elapsed
      ),
      exact_elapsed: input.exact_elapsed,
      nearest_boundary: null,
      boundary_trace: {
        owner: '@rus/time-events-history/temporal-boundaries',
        policy: 'split_before_earliest_boundary',
        evaluated_candidate_count: candidates.length,
        processed_boundary_ids: []
      }
    };
  };
}

export function createTracePhase3VisibleProjector({
  phase2Projector,
  contracts
}) {
  return Object.freeze({
    async project(input) {
      const consequence = input.consequence;
      if (consequence.phase3_kind == null) {
        return phase2Projector.project(input);
      }
      if (consequence.phase3_kind === 'movement') {
        return {
          version: 1,
          schema: 'visible_context_package',
          visible_scene: 'Микула пришёл в рыбацкий стан.',
          visible_changes: ['trace_ld_v1_route_wreck_to_camp_committed'],
          sensory_details: ['Рабочий стан стоит у берега Нижней Двины.'],
          visible_npc: contracts.actors.map(playerSafeNpc),
          visible_objects: [],
          known_context: ['Обратная тропа к месту крушения теперь известна.'],
          uncertainties: [],
          allowed_tensions: [],
          do_not_imply: [
            'hidden_truth', 'zhdanko_motive', 'ratsha_culprit_identity'
          ]
        };
      }
      const conversation = consequence.conversation;
      const semantic = conversation.semantic_exchange ?? null;
      const responseKind = semantic?.response_kind ?? null;
      const disclosed = semantic
        ? semantic.route_disclosure != null
        : conversation.route_knowledge_ref != null;
      const speechResponse = semantic !== null && [
        'route_disclosure', 'withhold', 'speech'
      ].includes(responseKind);
      const semanticUtterance = speechResponse
        ? perceivedNpcUtterance(
            semantic,
            'TRACE_M2_PHASE_3_VISIBLE_GAP'
          )
        : null;
      const visibleChanges = semantic
        ? semantic.statements.map(({ statement_id: statementId }) =>
            statementId)
        : [conversation.statement_ref];
      return {
        version: 1,
        schema: 'visible_context_package',
        visible_scene: speechResponse
          ? `Еремей говорит: «${semanticUtterance}»`
          : responseKind === 'silence'
            ? 'Еремей молчит.'
            : responseKind === 'leave_conversation'
              ? 'Еремей прекращает разговор.'
              : semantic
                ? 'Разговор с Еремеем остановлен.'
          : disclosed
            ? 'Еремей рассказал, что слышал удар и видел мокрого Ратшу с чужой сумкой.'
            : 'Еремей уклонился от полного ответа о крушении.',
        visible_changes: visibleChanges,
        sensory_details: [],
        visible_npc: contracts.actors.map(playerSafeNpc),
        visible_objects: [],
        known_context: [
          ...(semantic ? [] : [conversation.journal_ref]),
          ...(disclosed ? [
            'Еремей указал существующий путь к сушильне.',
            'Слова Еремея и найденная синяя шерсть остаются независимыми сведениями.'
          ] : [])
        ],
        uncertainties: disclosed
          ? ['Синяя шерсть ещё не сопоставлена с одеждой Ратши.']
          : ['Еремей мог сообщить не всё, что знает.'],
        allowed_tensions: [],
        do_not_imply: [
          'blue_wool_matches_ratsha_caftan',
          'ratsha_participated_blue_wool_route',
          'conclusion:principal_zhdanko'
        ]
      };
    }
  });
}

function perceivedNpcUtterance(semantic, code) {
  const primaryNpcRef = semantic?.resumed_npc_execution?.plan?.speaker_ref
    ?? semantic?.decision_request?.npc_ref;
  const statement = semantic?.statements?.find(
    ({ speaker_ref: speaker }) =>
      speaker?.entity_kind === primaryNpcRef?.entity_kind
      && speaker.entity_id === primaryNpcRef.entity_id
  );
  if (statement == null) throw visibleGap(code);
  const audience = semantic.audiences?.find(
    ({ statement_ref: statementRef }) =>
      statementRef?.entity_kind === 'conversation_statement'
      && statementRef.entity_id === statement.statement_id
  );
  const playerMessages = audience?.received_messages?.filter(
    ({ listener_ref: listener, comprehension, utterance_text: utterance }) =>
      listener?.entity_kind === 'player_character'
      && comprehension === 'full'
      && utterance === statement.utterance_text
  ) ?? [];
  if (playerMessages.length !== 1) throw visibleGap(code);
  return statement.utterance_text;
}

function visibleGap(code) {
  return Object.assign(
    new Error('The semantic NPC utterance is not player-visible.'),
    { code }
  );
}

function playerSafeNpc(actor) {
  return {
    entity_ref: {
      entity_kind: 'npc',
      entity_id: actor.instance_id
    },
    display_label: actor.ref === 'eremey_fisher' ? 'Еремей' : 'рыбак',
    recognition: actor.ref === 'eremey_fisher' ? 'known' : 'unrecognized',
    visible_status: actor.ref === 'eremey_fisher'
      ? 'находится в рабочей зоне стана'
      : 'занят работой в стане'
  };
}
