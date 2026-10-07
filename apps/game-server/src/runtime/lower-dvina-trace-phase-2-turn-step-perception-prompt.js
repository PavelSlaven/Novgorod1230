export const TURN_STEP_PERCEPTION_INSTRUCTION = 'Оцени всё remaining_intent и сохраняй порядок действий. Обращение к активному собеседнику предшествует краткому взгляду на уже переданного человека; поиск новой подробности остаётся более ранним целенаправленным восприятием. Проверка идентичности, размещения или состояния переданных переносимых/надетых предметов — прямое achieved или partially_achieved наблюдение с direct_result_kind player_safe_item_observation. Осмотр тела актора при наличии request.actor.body использует прямое achieved или partially_achieved player_safe_body_observation: он подтверждает только переданное состояние тела, а новая запрошенная травма или диагноз остаются неподтверждёнными. Упоминание одежды только как закрывающей тело не превращает действие в осмотр предмета или обычный discovery. Для проверки других фактов, уже явно указанных в player-safe чувственном контексте, используй player_safe_observation. Каждый current_visible_context.visible_npc visible_status — уже переданное текущее наблюдение именно об этом видимом NPC; запрос, полностью покрытый этими статусами, — прямой achieved player_safe_observation без discovery и continuation. Двоеточие или вопрос, уточняющий, что именно наблюдается при том же взгляде, не является независимым continuation. Сохраняй неопределённость. Осмотр или поиск новой физической подробности — целенаправленное восприятие: сначала используй подходящие available_domain_operations, иначе focused_ordinary_discovery при ordinary_resolution.discovery_available равном true, и только при отсутствии обоих — reality_limited not_achieved. Точно выбери подходящий переданный discovery choice_id и сохрани последующую независимую речь в continuation. Пассивный взгляд не поглощает целенаправленную часть намерения. Для общего осмотра текущей обстановки, занятий или людей поблизости используй ordinary_scene_seed, пока scene_seed_available равно true, а затем visible_general_look, даже если игрок формулирует это как попытку понять происходящее.';

export const OBSERVED_EVIDENCE_PLAN_MAPPING = {
  interpretation: { adaptation: 'literal' },
  resolution: 'domain_request', goal_result: 'pending',
  activity: { owner: 'domain', duration_class: null, effort: null },
  operations: [{ op: 'request_discovery',
    actor_ref: '<скопируй ref текущего актора из request>',
    discovery_kind: 'inspect',
    target_refs: ['<скопируй точно каждую подходящую ссылку fact_ref из request>'],
    query: '<полный вопрос об осмотре свидетельств из request>' }], check: null
};

export const OBSERVED_EVIDENCE_PLAN_INSTRUCTION = 'Если player_safe_state.observed_evidence_inspection.semantic_grounding_available равно true и каждый физический факт или объект для осмотра либо сравнения представлен текстом кандидата, используй observed_evidence_inspection раньше focused_ordinary_discovery. Точно скопируй только каждый подходящий переданный candidate fact_ref и сохрани полный вопрос в query; никогда не указывай текущую локацию или обычную область. Если какая-либо сторона сравнения или запрошенная подробность не передана, сначала используй focused_ordinary_discovery для одной текущей видимой области с query, называющим только недостающий объект, и сохрани полное сравнение в continuation; никогда не используй кандидата свидетельства только для одной стороны. Владелец свидетельств может сообщить лишь, что наблюдения не поддерживают нового скрытого вывода; они никогда не устанавливают идентичность, направление, травму, причину или иной факт, отсутствующий в player-safe state.';

export const OBSERVED_EVIDENCE_REPAIR_INSTRUCTION = 'При operation_semantic_grounding отбрось отклонённую операцию. Если каждый сравниваемый объект представлен в player_safe_state.observed_evidence_inspection, восстанови план через него, используя только точные переданные refs кандидатов. Если стороны сравнения или запрошенной подробности недостаёт, используй focused_ordinary_discovery только для этого недостающего объекта и сохрани полное сравнение в continuation.';

export function observedEvidencePrompts(request, repairing) {
  return request.player_safe_state?.observed_evidence_inspection
    ?.semantic_grounding_available === true
    ? [OBSERVED_EVIDENCE_PLAN_INSTRUCTION,
        ...(repairing ? [OBSERVED_EVIDENCE_REPAIR_INSTRUCTION] : [])]
    : [];
}
