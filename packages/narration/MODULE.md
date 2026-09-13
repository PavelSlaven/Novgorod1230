# @rus/narration

## Назначение

Безопасный workflow генерации и ограниченного ремонта прозы обычного хода;
первый экран получает уже утверждённую прозу через Stage 22/23 opening adapter.
Native `narration_request` и `runNarrationFlow` принимают только `surface: turn`.

## Владеет

- versioned `narration_request`, `narration_output` и `narration_flow_result`;
- проверкой visible-only входа;
- writer → deterministic structural validation → at most one format repair → semantic audit;
- один synthetic whole-prose segment и не более одной цельной semantic rewrite;
- full final semantic audit после semantic repair;
- turn audit: строгая проверка и code-owned сборка полного `coverage`,
  `artistic_verdict`, `technical_verdict` и общего `pass` из private
  source reviews и semantic/literary failures через immutable segment IDs;
- историей генераций и ремонтов.

## Продуктовые принципы прозы

Подробная единая норма художественной подачи и смысловой приёмки —
[ситуационные требования к прозе](../../data/knowledge-source/corpus/DOCUMENTS/situational_prose_requirements.md).
Открытые классы ситуаций не образуют router, enum или набор отдельных writers.
Narrator использует только confirmed player-safe факты; недостающую полноту
сцены обеспечивают upstream owners. Аудитор оценивает цельность всей сцены,
затем фактическую точность; структурные тесты не заменяют model acceptance.

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
- committed transient-attempt required change подтверждает физическое handling/contact; неизвестен только observation/discovery result. Проза конкретно изображает выполненное движение без attempt/status/time metadata. Только явно неисполненный continuation остаётся неначатым; pending goal не отменяет applied operation;
- semantic failure не превращается в deterministic prose fallback;
- format repair и semantic repair независимы: каждый максимум один раз;
- initial malformed public audit допускает единственный whole-prose semantic repair только при явном `pass:false` и непустом содержательном `concern.reason`; repair получает только reasons и code-owned whole-prose segment, без доверия malformed coverage/checks/aliases. Production private auditor не возвращает public verdict/concerns: malformed private report Adapter преобразует в невалидный audit, поэтому flow блокируется fail-closed без синтеза concern;
- malformed repair, не единственная replacement цельного synthetic segment и любой невалидный или failed final audit блокируют flow без второго semantic repair;
- semantic repair заменяет весь текст целиком; code-owned reassembly не смешивает старую и новую прозу;
- normal gameplay вызывает один LLM auditor, без router/senior cascade;
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
собирает public coverage, concerns, artistic/technical verdict и общий pass.
Positional aliases и нормализация не допускаются; malformed private output
fail-closed, final audit строго проверяется по immutable segment IDs
повторно сегментированной approved prose. Длительность хода не входит в private
prose wire: её вычисляет temporal owner и показывает server-owned UI projection.
Любая придуманная narrator временная величина является unsupported fact, а
служебная формулировка дополнительно проваливает elapsed_as_service_report.
При current beat private wire
допускает visible_scene + sensory_details; narrator выбирает только относящиеся
к этому эпизоду признаки, а unrelated/all-facts dump остаётся static_context_dump.
Полный grounded пересказ required sources по одному в исходном порядке является
weak_literary_composition, если действие или воспринятый результат не организует
поддержанные пространственные детали в сцену; выдуманная связка недопустима.

Temporal/aspect grounding не позволяет выводить длительность из действия или
sensory sky/weather/sound. Sensory support связывает сцену. Source review требует все propositions каждого atomic
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
