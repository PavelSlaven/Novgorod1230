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
    if (consequence?.phase8_kind === 'combat_start') {
      return { clock_before: structuredClone(input.clock_before),
        clock_after: structuredClone(input.clock_before),
        exact_elapsed: input.exact_elapsed, nearest_boundary: null,
        boundary_trace: { owner: 'combat_start', policy: 'instant',
          evaluated_candidate_count: 0, processed_boundary_ids: [] } };
    }
    return fallback(input);
  };
}

export function createTracePhase8VisibleProjector({ fallback, contracts }) {
  return Object.freeze({ async project(input) {
    const consequence = input.consequence;
    if (consequence?.combat_kind === 'exchange') {
      return projectCombatVisible(input, contracts);
    }
    if (consequence?.phase8_kind === 'movement') return {
      version: 1, schema: 'visible_context_package',
      visible_scene: 'Группа пришла во двор клети.',
      visible_changes: ['Группа дошла от рыбацкого стана до двора клети.'],
      sensory_details: ['Клеть и двор видны с конца известной тропы.'],
      visible_npc: visibleNpcSummaries(contracts),
      visible_objects: [], known_context: [
        'Обратный путь к рыбацкому стану теперь известен.'],
      uncertainties: [], allowed_tensions: ['armed_confrontation'],
      do_not_imply: ['guilt', 'hidden_truth', 'combat_outcome'] };
    if (consequence?.phase8_kind === 'accusation') {
      const combat = consequence.accusation.combat_initialization;
      const semantic = consequence.accusation.semantic_exchange;
      const npcSpeech = playerVisibleNpcSpeech(semantic, contracts.actors.zhdanko);
      return { version: 1, schema: 'visible_context_package',
      visible_scene: combat == null
          ? npcSpeech == null
            ? 'Хозяин клети ответил на предъявленное обвинение.'
            : `Хозяин клети говорит: «${npcSpeech}»`
          : 'Разговор прерван непосредственной угрозой; требуется решение.',
        visible_changes: combat == null
          ? ['Обвинение высказано хозяину клети.']
          : ['Разговор перешёл в открытую угрозу.'], sensory_details: [],
        visible_npc: visibleNpcSummaries(contracts),
        visible_objects: [], known_context: [], uncertainties: [],
        allowed_tensions: ['armed_confrontation'],
        do_not_imply: ['npc_decision_request', 'npc_combat_intent_plan',
          'hidden_truth', 'combat_outcome'] };
    }
    if (consequence?.phase8_kind === 'combat_start') return {
      version: 1, schema: 'visible_context_package',
      visible_scene: 'Вы вступаете в непосредственное противостояние с хозяином клети.',
      visible_changes: ['Началось открытое противостояние.'], sensory_details: [],
      visible_npc: visibleNpcSummaries(contracts), visible_objects: [],
      known_context: [], uncertainties: [], allowed_tensions: ['armed_confrontation'],
      do_not_imply: ['npc_decision_request', 'npc_combat_intent_plan',
        'hidden_truth', 'combat_outcome'] };
    return fallback.project(input);
  } });
}

function projectCombatVisible(input, contracts) {
  const combat = input.consequence.combat;
  const actorId = input.retrieved_state?.actor_id;
  const session = combat?.session_after;
  if (!session || typeof actorId !== 'string'
      || !Array.isArray(combat.harm_packages)
      || !Array.isArray(session.participant_states)) {
    fail('TRACE_COMBAT_VISIBLE_RESULT_GAP');
  }
  const playerStep = combat.exchange?.technical_steps?.find(({ actor_ref: actor }) =>
    actor?.entity_kind === 'player_character' && actor.entity_id === actorId);
  const targetId = playerStep?.check_request?.target_id ?? null;
  const changes = combat.harm_packages.filter(({ health_loss: loss }) =>
    Number(loss) > 0).map((harm) => {
    const injury = typeof harm.injury?.label === 'string'
      ? harm.injury.label : 'видимое повреждение';
    if (harm.target_id === actorId) return `Вы ранены: ${injury}.`;
    if (harm.target_id === targetId) return `У вашего противника — ${injury}.`;
    return `Один из участников ранен: ${injury}.`;
  });
  changes.push(...combatStatusChanges(combat.session_before, session,
    actorId, targetId));
  const status = session.status === 'ended'
    ? 'Схватка закончилась.' : 'Схватка продолжается.';
  return { version: 1, schema: 'visible_context_package',
    visible_scene: [...changes, status].join(' '),
    visible_changes: changes,
    sensory_details: [], visible_npc: visibleNpcSummaries(contracts),
    visible_objects: [], known_context: [], uncertainties: [],
    allowed_tensions: session.status === 'ended' ? [] : ['armed_confrontation'],
    do_not_imply: ['hidden_intent', 'exact_combat_mechanics', 'check_result'] };
}

function combatStatusChanges(before, after, actorId, targetId) {
  const prior = new Map((before?.participant_states ?? []).map((state) => [
    state.actor_ref?.entity_id, state.combat_status]));
  return after.participant_states.flatMap(({ actor_ref: actor,
    combat_status: status }) => {
    if (prior.get(actor?.entity_id) === status || status === 'active') return [];
    const subject = actor.entity_id === actorId ? 'Вы'
      : actor.entity_id === targetId ? 'Ваш противник' : 'Один из участников';
    const result = { restrained: 'удержан', surrendered: 'сдался',
      incapacitated: 'больше не может продолжать бой', left: 'вышел из схватки',
      disengaging: 'пытается выйти из схватки' }[status];
    return result == null ? [] : [`${subject} ${result}.`];
  });
}
function playerVisibleNpcSpeech(semantic, npc) {
  if (semantic?.response_kind !== 'speech') return null;
  const statement = semantic.statements?.find(({ speaker_ref: speaker }) =>
    speaker?.entity_kind === 'npc' && speaker.entity_id === npc.instance_id);
  const audience = semantic.audiences?.find(({ statement_ref: ref }) =>
    ref?.entity_kind === 'conversation_statement'
      && ref.entity_id === statement?.statement_id);
  return audience?.received_messages?.some(({ listener_ref: listener,
    comprehension, utterance_text: text }) =>
    listener?.entity_kind === 'player_character' && comprehension === 'full'
      && text === statement?.utterance_text) === true
    ? statement.utterance_text : null;
}
function visibleNpcSummaries(contracts) {
  return [contracts.actors.zhdanko, contracts.actors.eremey,
    contracts.actors.ratsha, ...contracts.participatingFishers]
    .map((npc) => ({
    entity_ref: { entity_kind: 'npc', entity_id: npc.instance_id },
    display_label: npc === contracts.actors.eremey
      ? npc.semantic_profile?.identity?.canonical_name ?? 'знакомый рыбак'
      : npc === contracts.actors.zhdanko ? 'хозяин клети'
        : npc === contracts.actors.ratsha ? 'мужчина из сушильни' : 'рыбак',
    recognition: npc === contracts.actors.eremey ? 'known' : 'recognized'
  }));
}
function fail(code) { throw Object.assign(new Error(code), { code }); }
