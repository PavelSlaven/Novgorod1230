import { FAILURE_KINDS, narrationCoverage, narrationSources,
  validNarrationAuditModelOutput } from
  './lower-dvina-trace-narration-audit-values.js';

export const WORLD_STORY_BOUNDARY = `Мир сцены задан только сведениями: люди и животные; предметы, строения, вода, местность и растительность; пути, их стороны, направления и куда они ведут; где находятся люди и чем заняты; имена, родство и должности; события, их причины и исходы; тело, физическое состояние, силы, раны, одежда и снаряжение героя; прошлое героя, его черты и цель; сколько прошло времени. К этому проза ничего не добавляет и переданного не меняет. Проза не утверждает, что чего-то нет, если сведения молчат, и не добавляет к миру того, чего они не называют. Имя человека звучит в прозе, только если герой его знает. Переданная подпись видимого человека в разделе «Люди» уже учитывает знание героя: данное там имя ему известно, а описание незнакомого человека не раскрывает его имени. Имена из справки о мире или скрытого прошлого этим не разрешаются. Сведения о мире справочные: проза передаёт их уверенность обычными словами, не дополняет их фактами из собственной памяти и не выдаёт общее знание за то, что есть здесь и сейчас.
Рассказ — то, как герой переживает этот мир, и здесь проза свободна: свет и тень, тепло и прохлада, запахи, фоновые звуки, то, что под ногами, если они естественно следуют из места, растительности, времени года, погоды и времени суток; мысли, чувства, впечатления и оценки героя в эту минуту, в том числе его догадки о других людях, поданные как догадки; мелкие движения тела героя, ничего не меняющие в мире; связки, переходы, ритм и порядок, в котором взгляд выхватывает подробности. Рассказ не противоречит сведениям и не создаёт зацепок, то есть признаков людей, жилья, воды, дичи и иной добычи, опасности или следов, которых нет в сведениях. Звук или запах, который сам выдаёт людей, животных, работу, воду или жильё, — факт мира, а не фон. Чувства героя соразмерны сведениям: тревога и угроза, которых сведения не дают, не нагнетаются. Мысль героя не утверждает новых фактов о мире и его прошлом. Герой не совершает поступков, которых игрок не выбирал. Мелкое движение тела героя, ничего не меняющее в мире, поступком не является.`;

export function narrationAuditInstruction(request) {
  const choices = request.segments.map(({ segment_id }) => segment_id);
  const shape = {
    reviewed_segments: choices,
    source_reviews: narrationSources(request).map(({ key: ref }) => ({
      ref, segment_choices: []
    })),
    unsupported: [],
    literary_failures: [],
    evidence: []
  };
  return `Ты — аудитор прозы для исторической игры. Тебе даны сегменты прозы и сведения, по которым она написана. Ты ничего не переписываешь: находишь нарушения и возвращаешь JSON.

Вход: «Отрывки прозы» — сегменты с идентификаторами; «Обязательные положения текущего эпизода» — факты с короткими ключами (сначала изменения, затем неопределённости); остальные русские разделы передают тот же снимок фактов, что получил писатель. «Контекст намерения для проверки» — лишь замысел, не доказательство исполнения. Проза написана в третьем лице и прошедшем времени о герое игрока.

Писатель и ты применяете одно и то же правило границы:

${WORLD_STORY_BOUNDARY}

Проверка мира. Молча раздели каждый сегмент на утверждения о мире и о действиях. Каждое должно опираться на переданные сведения: источник подтверждает ровно свои положения вместе с отношением, движением, причиной и степенью уверенности; правдоподобие, метка, категория и имя ничего не добавляют. Замысел героя не доказывает, что действие выполнено, услышано, удалось или получило ответ. Предмет на месте не доказывает, что герой туда дошёл: переход подтверждается только сведением о совершённом переходе. Совершённая попытка с предметом подтверждает только само действие; успех или неудача без сведений — unsupported_success или unsupported_result. Предположение или вывод в сведениях не должны стать установленным фактом, частный случай — общим правилом. Ощущения, мысли, чувства, впечатления героя, мелкие движения и связки нарушением не являются, пока ничего не утверждают о мире сверх сведений. Нарушения заноси в unsupported с kind:
unsupported_world_state — в мире есть или изменено то, чего нет в сведениях или что им противоречит: человек или животное; предмет, строение, вода, местность, растительность; путь, его сторона или направление; где люди и чем заняты; тело, силы, раны, одежда или снаряжение героя; обстановка, зацепка, в том числе звук или запах, выдающий людей, животных, работу, воду или жильё;
unsupported_npc_state — выдуманное или изменённое действие, слово или состояние названного человека; названного человека заменил герой (источник при этом остаётся непокрытым);
unsupported_attempt — герой совершил поступок, которого игрок не выбирал, или выдумана попытка;
unsupported_success, unsupported_object_use, unsupported_result, unsupported_event — выдуманные успех, использование предмета, результат, событие;
unsupported_fact — прочее: выдуманная длительность или сообщение о том, сколько прошло времени; имя, родство или должность, которых нет в сведениях; имя, которого герой не знает; новое прошлое, черта или цель героя, в том числе в его мыслях.

Покрытие обязательных положений. Положение покрыто, только если каждая его часть передана с той же уверенностью и подтверждённая речь дословно с говорящим. Неизвестный результат должен остаться неизвестным; молчание об исходе не покрывает положение, где сказано, что результат неизвестен. Выполненная попытка без переданного результата и без переданной неопределённости подтверждена сама по себе; не требуй от прозы сообщать её исход, но слова «результат неизвестен» о ней — unsupported_result. Невыполненный шаг замысла героя не должен быть изображён выполненным; изображённый выполненным, текущим или чужим действием — unsupported_attempt; сообщение о несделанном — литературное замечание weak_literary_composition, а не требование. Если проза меняет порядок совершённых действий, делает раннее одновременным с поздним или длящимся внутри него, это unsupported_event; подчинение допустимо, если вид глагола или явный маркер показывает, что раннее действие завершилось до позднего.

Литературная проверка, check в literary_failures; оценивай каждую независимо:
current_beat_buried — обязательное положение есть в прозе, но отодвинуто на второй план; пропущенное положение сюда не относится, оно только [] в source_reviews;
elapsed_as_service_report — сообщение о том, сколько прошло времени, в манере служебного отчёта (длительность в прозе не называется);
static_context_dump — вместо рассказа глазами героя идёт перечень сведений об обстановке подряд; не ставь, если подробности отобраны и поданы как рассказ или есть в обязательных положениях;
weak_literary_composition — Обязательные положения и разрешённые ощущения связываются в цельный эпизод через восприятие и переживание героя; если текст без потери смысла сводится к перечню фактов, это weak_literary_composition даже при полном покрытии обязательных положений. Это касается и короткого хода;
unsupported_response_or_continuation — выдуманный ответ, отсутствие ответа, выполненное продолжение или длящееся действие; только здесь, не в unsupported.
Не считай нарушением порядок, совпадающий с порядком источников, и свободу рассказа из границы выше. Нагнетание тревоги и угрозы, которых сведения не дают, — только литературное замечание (weak_literary_composition).

Return only the exact JSON shape shown below. reviewed_segments must copy every
literal segment ID (for example "s1"), never prose, exactly once and in order.
source_reviews must contain exactly
the shown short refs from «Обязательные положения текущего эпизода» in order; each segment_choices value lists
segments that fully convey that source. Use [] for an omitted or partially
conveyed source. If no required source exists, source_reviews must be [].
unsupported contains only {"segment_choice","kind","reason"}; kind is one of
unsupported_attempt, unsupported_success, unsupported_object_use,
unsupported_result, unsupported_event,
unsupported_world_state, unsupported_npc_state, unsupported_fact.
literary_failures contains only {"check","segment_choice","reason"}.
Every segment_choice field is one literal segment ID, never a comma-separated
list or range; use separate findings when more than one segment fails.
Пиши каждое пояснение reason по-русски; буквальные JSON-ключи, виды нарушений и ключи источников сохраняй.
Output only failures, not supported proposition reviews. evidence is a concise
nonempty list when there are no failures and may be empty otherwise. Shape:
${JSON.stringify(shape)}
Segment choices: ${JSON.stringify(choices)}.`;
}

export function assembleNarrationAuditOutput(output, request) {
  const modelOutput = structuredClone(output);
  if (!validNarrationAuditModelOutput(modelOutput, request)) {
    return {
      version: 1, schema: 'narration_audit', pass: undefined,
      artistic_verdict: undefined, technical_verdict: undefined,
      coverage: undefined, concerns: undefined,
      evidence: structuredClone(modelOutput?.evidence)
    };
  }
  const concerns = [];
  const hasMissingSource = modelOutput.source_reviews.some(
    ({ segment_choices }) => segment_choices.length === 0);
  for (const source of modelOutput.source_reviews) {
    if (source.segment_choices.length === 0) {
      concerns.push({
        segment_id: null,
        kind: 'missing_visible_change',
        reason: `Обязательное положение ${source.ref} передано не полностью.`
      });
    }
  }
  concerns.push(...modelOutput.unsupported.map((finding) => ({
    segment_id: finding.segment_choice,
    kind: finding.kind,
    reason: finding.reason
  })));
  concerns.push(...modelOutput.literary_failures
    .filter(({ check }) => check !== 'current_beat_buried'
      || !hasMissingSource)
    .map((finding) => ({
    segment_id: finding.segment_choice,
    kind: FAILURE_KINDS[finding.check] === 'literary_quality'
      ? 'literary_quality'
      : FAILURE_KINDS[finding.check] === 'technical_presentation'
        ? 'technical_presentation'
        : 'unsupported_event',
    reason: finding.reason
  })));
  const pass = concerns.every(({ kind }) => kind === 'literary_quality');
  return {
    version: 1,
    schema: 'narration_audit',
    pass,
    artistic_verdict: concerns.some(({ kind }) => kind === 'literary_quality')
      ? 'fail' : 'pass',
    technical_verdict: concerns.some(({ kind }) =>
      kind === 'technical_presentation') ? 'fail' : 'pass',
    coverage: narrationCoverage(Object.fromEntries(modelOutput.source_reviews.map(
      ({ ref, segment_choices: choices }) => [ref, choices]
    )), request),
    concerns,
    evidence: structuredClone(modelOutput.evidence)
  };
}
