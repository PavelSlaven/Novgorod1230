import { addElapsedTime } from '@rus/time-events-history';
import { projectConversationTemporalAdvance } from
  './lower-dvina-trace-m2-conversation-time.js';
import { routePresentationForFact, routePresentationForRoute, scenePresentationForLocation } from
  './lower-dvina-trace-scene-presentation.js';
import { phase3ConversationProjection, playerSafeNpc, visibleGap,
  withPhase3Conversation } from './lower-dvina-trace-phase-3-visible.js';

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
  contracts,
  scenePresentation
}) {
  return Object.freeze({
    async project(input) {
      const consequence = input.consequence;
      if (consequence.phase3_kind == null) {
        return phase2Projector.project(input);
      }
      if (consequence.phase3_kind === 'movement') {
        if (scenePresentation == null) {
          return withPhase3Conversation({ input, contracts,
            movement: historicalMovementProjection(contracts,
              input.retrieved_state?.current_visible_context) });
        }
        if (consequence.generic_known_route === true) {
          const destination = consequence.movement?.destination;
          if (typeof destination?.display_name !== 'string'
              || !destination.display_name
              || typeof consequence.movement?.route_ref !== 'string') {
            throw visibleGap('TRACE_KNOWN_ROUTE_VISIBLE_DESTINATION_INVALID');
          }
          const route = routePresentationForRoute({ scenePresentation,
            routeRef: consequence.movement.route_ref });
          const scene = scenePresentationForLocation({ scenePresentation,
            locationRef: destination.location_ref });
          return withPhase3Conversation({ input, contracts, movement: {
            version: 1,
            schema: 'visible_context_package',
            visible_scene: route.visible_scene,
            visible_changes: [`Перед вами — ${route.visible_scene}.`],
            sensory_details: scene.player_visible_physical_facts,
            visible_npc: contracts.actors.filter(({ anchor_id: anchorId }) =>
              anchorId === destination.g5_anchor_id).map((actor) =>
                playerSafeNpc(actor, null,
                  input.retrieved_state?.current_visible_context)),
            visible_objects: [],
            known_context: [route.known_context], uncertainties: [], allowed_tensions: [],
            do_not_imply: []
          } });
        }
        const route = routePresentationForFact({ scenePresentation,
          routeFactRef: 'trace_ld_v1_route_wreck_to_camp_committed' });
        const scene = scenePresentationForLocation({ scenePresentation,
          locationRef: consequence.movement.destination.location_ref });
        return withPhase3Conversation({ input, contracts, movement: {
          version: 1,
          schema: 'visible_context_package',
          visible_scene: route.visible_scene,
          visible_changes: [route.visible_change],
          sensory_details: scene.player_visible_physical_facts,
          visible_npc: contracts.actors.map((actor) => playerSafeNpc(actor,
            null, input.retrieved_state?.current_visible_context)),
          visible_objects: [],
          known_context: [route.known_context],
          uncertainties: [],
          allowed_tensions: [],
          do_not_imply: [
            'hidden_truth', 'zhdanko_motive', 'ratsha_culprit_identity'
          ]
        } });
      }
      return phase3ConversationProjection(input, contracts);
    }
  });
}

function historicalMovementProjection(contracts, visibleContext) {
  return {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'Микула пришёл в рыбацкий стан.',
    visible_changes: ['Вы добрались от места крушения до рыбацкого стана.'],
    sensory_details: ['Рабочий стан стоит у берега Нижней Двины.'],
    visible_npc: contracts.actors.map((actor) => playerSafeNpc(actor,
      null, visibleContext)),
    visible_objects: [],
    known_context: ['Обратная тропа к месту крушения теперь известна.'],
    uncertainties: [], allowed_tensions: [],
    do_not_imply: ['hidden_truth', 'zhdanko_motive', 'ratsha_culprit_identity']
  };
}
