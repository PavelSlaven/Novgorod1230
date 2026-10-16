# @rus/narration

## Назначение

Безопасный workflow генерации и ограниченного ремонта прозы обычного хода;
первый экран получает уже утверждённую прозу через Stage 22/23 opening adapter.
Для authored opening Stage 22 получает не static prose, а approved rich
player-safe package с persisted entity/topology refs и eight-question reader
control; profile prose остаётся только optional source hint.
Native `narration_request` и `runNarrationFlow` принимают только `surface: turn`.

## Владеет

- versioned `narration_request`, `narration_output` и `narration_flow_result`;
- проверкой visible-only входа;
- writer → deterministic structural validation → at most one format repair → factual/technical semantic audit with a separate literary verdict;
- один synthetic whole-prose segment и не более одной цельной semantic rewrite;
- full final semantic audit после factual/technical semantic repair;
- turn audit: строгая проверка и code-owned сборка полного `coverage`,
  `artistic_verdict`, `technical_verdict` и delivery `pass` из private
  source reviews и semantic/literary failures через immutable segment IDs;
- историей генераций и ремонтов.

`runNarrationFlow` / `createNarrationService.run` принимают необязательный
code-owned `options.outputAdmission(prose)` (null либо finding с category).
Game-server supplies its single public-boundary detector through this port;
the package owns no service-marker patterns. An admission failure prevents
approval even when the model auditor passes, contributes a concern to the same
single semantic repair, and is checked again before final audit/approval.
Repeated rejection returns `blocked` with private phase
`generated_prose_admission_failed`; it is a retryable presentation failure,
not `final_audit_failed` or eligibility for factual terminal delivery.

## Продуктовые принципы прозы

Подробная единая норма художественной подачи и смысловой приёмки —
[ситуационные требования к прозе](../../data/knowledge-source/corpus/DOCUMENTS/situational_prose_requirements.md).
Открытые классы ситуаций не образуют router, enum или набор отдельных writers.
Мир Narrator берёт только из confirmed player-safe сведений, ничего не добавляет к нему и
не меняет переданного; недостающую полноту сведений о мире обеспечивают upstream owners.
К миру относятся: люди и животные; предметы, строения, вода, местность и растительность;
пути, их стороны, направления и куда они ведут; где находятся люди и чем заняты; имена,
родство и должности; события, их причины и исходы; тело, силы, раны, одежда и снаряжение
героя; прошлое героя, его черты и цель; сколько прошло времени. Ощущения, мысли и чувства
героя, мелкие движения его тела и связки — дело рассказа: отдельного факта они не требуют,
если не противоречат миру и не создают зацепок — признаков людей, жилья, воды, добычи,
опасности, следов, которых нет в сведениях (граница мира и рассказа — ситуационная норма
§2.0). Проза идёт в третьем лице, по имени героя (род — по сведениям о нём; имя и пол героя
входят во вход писателя), в прошедшем времени — это форма повествования, а не свобода
рассказа над тем, сколько прошло времени в мире. Даже короткий ход пишется сценой через
восприятие и переживание героя, а не отчётом; невыполненный шаг замысла не изображается
выполненным и не описывается отчётом о несделанном, а причина, по которой шаг не мог
состояться, показывается через воспринятое героем (D162). Аудитор оценивает цельность
всей сцены, затем фактическую точность по той же границе; структурные тесты не заменяют
model acceptance.
Первый приход во время игры идёт тем же turn-путем (`surface: turn` / Strategy B),
не отдельным opening-режимом (D25). Strategy D: auditor + ≤1 format repair + ≤1 semantic rewrite
+ code checks; второго model «revise» нет. Порог выдумок разделён: 0 изобретённых токенов в коде
и прозаический порог CR (§3.1 ситуационной нормы). Порядок при провале проверки 0 токенов в игре:
сначала единственный уже существующий цельный repair без нового role/call, затем, если результат
malformed, невалиден или снова провален, flow блокируется fail-closed; deterministic prose
fallback запрещён.

## Не делает

- не читает hidden state, БД или глобальный runtime context;
- не выбирает LLM provider и не импортирует provider SDK;
- не создаёт факты мира кодом;
- не определяет последствия хода;
- не строит UI и не пишет party state.

## Публичный API

- `runNarrationFlow(request, ports, options)`;
- validators для request/output/audit/result;
- `createNarrationService(ports, defaults)` для workflow composition root;
- константы схем и repair routes.

## Порты

`writer.generate`, `formatRepairer.repair`, `auditor.audit`, `semanticRepairer.repair`.

## Инварианты

- writer и format repair получают confirmed outcome в исходном request; auditor и semantic repair получают его отдельным evidence-полем `confirmed_outcome`; auditor отдельно получает optional player-safe `action_intent_context` с `evidence_scope: intent_only_non_evidence_of_execution_or_success`: это только заявленное намерение, не доказательство начала или продолжения действия, совершённой попытки, произнесённой речи либо успеха. Исполнение требует отдельного confirmed source; явно переданный остаток намерения ещё не исполнен, включая формулировки настоящего длительного действия;
- committed transient-attempt required change подтверждает физическое handling/contact; неизвестен только observation/discovery result. Проза конкретно изображает выполненное движение без attempt/status/time metadata. Невыполненный шаг замысла не изображается выполненным, и проза о нём не сообщает (D162); pending goal не отменяет applied operation;
- semantic failure не превращается в deterministic prose fallback;
- format repair и semantic repair независимы: каждый максимум один раз;
- initial malformed public audit допускает единственный whole-prose semantic repair только при явном `pass:false` и непустом содержательном `concern.reason`; repair получает только reasons и code-owned whole-prose segment, без доверия malformed coverage/checks/aliases. Production private auditor не возвращает public verdict/concerns: malformed private report Adapter преобразует в невалидный audit, поэтому flow блокируется fail-closed без синтеза concern;
- malformed repair, не единственная replacement цельного synthetic segment и любой невалидный либо factual/technical failed final audit блокируют flow без второго semantic repair; чисто литературный fail сохраняется в final audit, но не блокирует delivery;
- semantic repair заменяет весь текст целиком; code-owned reassembly не смешивает старую и новую прозу;
- normal gameplay вызывает один LLM auditor, без router/senior cascade;
- auditor и semantic repair применяют ту же границу мира и рассказа, что и writer (ситуационная
  норма §2.0): semantic `unsupported` — это утверждение о мире, которого нет в сведениях (люди
  и животные; предметы, строения, вода, местность и растительность; пути, их стороны,
  направления и куда они ведут; где находятся люди и чем заняты; имена, родство и должности;
  события, их причины и исходы; тело, силы, раны, одежда и снаряжение героя; прошлое героя,
  его черты и цель; сколько прошло времени), изменение переданного, противоречие миру,
  зацепка (признак людей, жилья, воды, добычи, опасности или следов, которого нет в
  сведениях; звук или запах, выдающий людей, животных, работу, воду или жильё, — тоже факт
  мира), мысль героя с новым фактом о мире или его прошлом, поступок героя, которого игрок не
  выбирал; ощущение, мысль, чувство героя, мелкое движение его тела и связка, следующие из
  переданных места, растительности, сезона, погоды и времени суток, unsupported не являются.
  Несоразмерное нагнетание тревоги и угрозы — литературный сбой, не unsupported;
- approved result содержит ровно один утверждённый output;
- flow и result validator используют общий внутренний владелец сегментации:
  terminal punctuation включает закрывающие кавычки/скобки; ссылки final audit
  проверяются по сегментам `approved_output.prose`;
- `final_audit` определяется surface: `turn` требует строгий `narration_audit`,
  `first_game` сохраняет исходный утверждённый Stage 23 `narrator_prose_audit`
  с его checks/permissions. Перекрёстные схемы запрещены; adapter не изобретает
  coverage, artistic verdict или fallback evidence для opening;
- upstream repair не вызывает persistence.

Production private auditor возвращает exact ordered `reviewed_segments`, ordered
`source_reviews` `{ref,segment_choices}`, semantic `unsupported`,
`literary_failures` и evidence. Он атомизирует propositions каждого source и
помечает source покрытым только целиком. Adapter строго проверяет shape, порядок,
refs, canonical choices, failure kinds/checks и reasons; затем детерминированно
собирает public coverage, concerns, artistic/technical verdict и delivery pass.
Модель обязана сама вернуть полный ordered `reviewed_segments` и evidence;
  server их не синтезирует. Непокрытый source получает `missing_visible_change`
  с `segment_id: null`, а не ложную ссылку на первый сегмент; whole-prose repair
  использует отдельный code-owned synthetic target. Positional/prose aliases и нормализация не допускаются; malformed private output
fail-closed, final audit строго проверяется по immutable segment IDs
повторно сегментированной approved prose. Длительность хода не входит в private
prose wire: её вычисляет temporal owner и показывает server-owned UI projection.
Любая придуманная narrator временная величина является unsupported fact, а
служебная формулировка дополнительно проваливает elapsed_as_service_report.
При любом change или uncertainty `optional_support` содержит `visible_scene` и
материал сцены для рассказа (D158): людей и животных с положением и занятиями,
пути с их сторонами и направлением, рельеф, растительность и землю, свет и звуки
по времени суток и сезону, а о герое — имя, пол, характер, цель и откуда он пришёл.
Материал поступает writer/auditor/repair одним снимком (§3.2); это не пункты для
пересказа: центр остаётся у текущего beat (§4.4), подробности неизменившейся
обстановки писатель берёт, когда они нужны эпизоду, а статическая сводка вместо
текущего beat — `static_context_dump`.
Новые изменения, относящиеся к текущему beat, должны приходить через
`required_current_beat.visible_changes`. При отсутствии current beat scene-only wire
сохраняет `visible_scene` и материал сцены.
Сырые static NPC/object/inventory/body arrays, known_context и snapshot metadata
как DTO не поступают writer/auditor/repair; их применимое к сцене содержание
поступает русскими предложениями по §3.4.
Полный grounded пересказ required sources по одному в исходном порядке является
weak_literary_composition, если действие или воспринятый результат не организует
поддержанные пространственные детали в сцену; связки, переходы и ритм допустимы, если не
добавляют фактов мира и не противоречат им.

Temporal/aspect grounding не позволяет выводить длительность из действия или
sensory sky/weather/sound; свобода ощущений этого права не даёт. Sensory support связывает сцену. Source review требует все propositions каждого atomic
required source; неизвестный результат нельзя опустить или заменить
failure/success. Речь передаётся естественно с дословным
содержанием и speaker, discovery — через подтверждённое восприятие без status report.
Грамматически подчинённое раннее действие допустимо при однозначном
completed-before смысле; reversal и simultaneous/ongoing embedding запрещены.

Applied-step causal projection оставляет semantic_activity duration temporal owner;
single transient_item_use получает два соседних atomic current-beat source:
выполненную попытку с exact description, затем отдельно неизвестный observation result.
Каждый source получает собственный ref и проверяется независимо. Отдельный elapsed component этого step
удаляется перед финальной сборкой; search передаёт только выполненное действие и результат.
Narrator переводит evidence wording в естественную речь и конкретное движение,
не копирует служебные слова step/attempt и не добавляет минуты.
