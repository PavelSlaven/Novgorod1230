# CDDA P3: семантическая граница, NPC и речь

**Статус:** REFERENCE / DOMAIN GUIDE; план изолированного эксперимента,
не production contract и не свидетельство успешной приёмки.
**Дата:** 2026-10-18. **CR:** [#767](https://github.com/PavelSlaven/Novgorod1230/issues/767).
**Основание:** P3/T06–T10
[плана #754](../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md).
P0–P2 приняты в #757; технический P4 принят в #768. Речевые T11/T12
остаются открытыми в #758. Durable published outcome и P5/P6 требуют
успешного общего P3/P4 checkpoint с настоящим речевым результатом.

## Граница реализации

Основная реализация — `tools/cataclysm-prototype`: один native semantic-input overlay,
его focused C++ probe и не более двух небольших JS-файлов для typed boundary
и запуска. Production packages, bindings, schemas, governance и P7–P9
не изменяются. Новый общий RPC, scenario handlers и второй physical state
не нужны. Неизвестная операция или native failure не превращаются в успех.

Одобренное уточнение scope для T10 (2026-10-19):
из существующего `projectPlayerPerception` в
`apps/game-server/src/runtime/lower-dvina-trace-m2-conversation-statements.js`
выделить helper применения уже проверенной audience projection. Текущий
production caller продолжает строить свою проекцию и вызывает этот же helper;
его поведение сохраняется. Prototype вызывает существующие `applyPlayerPlan`
и `projectConversationAudience`, затем общий helper. Новый schema или writer
не вводится. Scoped Contract Auditor `p3_social_contract_seam` дал
`PASS_WITH_NOTES`; ведущий `/root` одобрил этот refactor с его обязательными
guards и focused regression. Это разрешение на реализацию, не приёмка P3.

Native hearing задаёт слышавших; общий язык и comprehension задаются явно
в semantic fixture для реальных native NPC IDs. Неизвестное распознавание
speaker остаётся неизвестным. Production anchors и JS acoustic path не
подставляются ради совпадения аудитории. Helper проверяет привязку projection
к statement и разрешённым listener refs. Focused regression должна доказать
неизменность текущего production caller, а prototype — exact utterance,
native время, исключение deaf listener и replay без повторной записи.

`@rus/turn` принимает свободное намерение через `requestTurnStepPlan` и
существующий typed execution registry. Native projection даёт реальные actor,
item и target references; локальное отображение references не хранит физику.
Movement, pickup и item use исполняются существующими native primitives через
обычный loop. Недостающий test-mode ввод выбирает native item/method/target,
не вычисляя эффект и не ветвясь по названию предмета либо тексту сценария.

Для pickup существующий typed `move_entity` с наблюдаемым ground item reference
и `placement: { relation: 'held_by', target_ref: 'avatar' }` означает запрос
подбора. Prototype handler передаёт конкретный UID штатному native pickup owner;
остальные placements отклоняются. JS не меняет holder, количество, положение
или inventory. Выбор всех вещей вместо запрошенного UID недопустим. Эта граница
прошла независимое рассмотрение `p3_seam_review` и одобрена ведущим 2026-10-19;
новая production schema не вводится.

Native preflight выявил отдельную потерю UID при успешном pickup:
upstream копирует переносимую вещь, а копия получает новый UID. Одобренное
ведущим исправление 2026-10-19 остаётся в native item/pickup owner:
после успешного переноса целой вещи в новый отдельный destination перемещается
исходный UID; для контейнера сначала проверяется совпадение всей структуры,
затем переносятся вложенные UID. Speculative copies сохраняют прежнюю
семантику новых UID. При отказе, частичном переносе charges, слиянии стеков
или несовпадении структур identity не переписывается. До runtime проверки
этого общего изменения требуется независимое source review; после него —
whole/nested transfer, отказ, partial/merge и save/reload regression.

Второй подтверждённый native gap: RLE serializer для одинаковых map items
сохранял одну вещь и количество, теряя UID остальных экземпляров. Разрешён
узкий guard существующего serializer: разные UID не объединяются в RLE.
Формат и legacy reader сохраняются; ранее потерянные UID не реконструируются.
Регрессия должна сравнивать точные UID нескольких одинаковых вещей и их
содержимого после настоящего save/reload, включая NPC-visible projection.

Handoff — один JSON request file в disposable userdir и один JSON readback
native probe. После typed validation adapter переводит только references из
последнего native observation в actor ID, item UID и target; неизвестный или
устаревший reference отвергается. Envelope содержит operation identity,
observation revision, actor, общий native primitive и его явные аргументы.
Native probe повторно проверяет identity/preconditions перед исполнением и
возвращает ту же operation identity с actual before/after либо refusal.
Текст модели не является shell command, координатой или test filter.

Уточнение интерфейса для T11/T12, одобренное ведущим 2026-10-19:
native observation дополнительно несёт внутренний `native_snapshot`,
сериализованный тем же native owner и с теми же полями, что `before`/`after`
operation readback. Coordinator сравнивает полный `after` с новым snapshot
после настоящего reload candidate; скопированный JSON sidecar не заменяет
reload. UID, charges, activity, время и NPC assignment нельзя исключать из
сравнения ради прохождения проверки. Этот snapshot предназначен только для
coordinator и не входит в player-safe вход LLM или UI.

Один существующий P4 coordinator принимает полный неизменяемый request,
исполняет P3 adapter на staging userdir и публикует physical readback вместе
с результатом существующего conversation owner в одной generation.
Слышавших определяет native delivery. Повтор принятого operation ID возвращает
сохранённый outcome до нового model/native apply; иной payload с тем же ID
отвергается. Прежние semantic entries сохраняются. Cold correctness и стоимость
применения/reload проверяются отдельно; технический P4 PASS не доказывает
прохождение этих речевых проверок.

`@rus/npc-runtime` строит NPC-safe request; `requestNpcSemanticDecision`
проводит одну decision boundary и replay по прежней identity без нового вызова.
Назначенный Novgorod NPC имеет ровно одного арбитра: accepted intent исполняет
native код, а автономный выбор цели для этого actor подавлен. Safety interrupt
возвращает фактическую причину и ожидает следующей semantic boundary, сохраняя
назначение Novgorod. Остальные NPC продолжают штатное native поведение.
Если external intent остаётся незавершённым на native save boundary, его
назначение, progress и ожидание следующего решения сохраняет native NPC owner
в том же save. После reload нельзя молча включать второго арбитра. Coordinator
по-прежнему один владеет публикацией поколения и executed operation IDs;
native intent identity связывает физический progress с принятым решением.
Native faction/opinion/hostility/physical ownership и semantic trust/debt
получают явную таблицу используемых полей; один и тот же field не имеет двух writers.

Свободная реплика проходит native speech/sound и native hearing. Readback
содержит точную utterance, speaker/listener IDs, фактическую слышимость и время.
Для короткой тестовой реплики ведущий задаёт стоимость 3 игровых секунды;
расход moves и продвижение clock выполняет native actor/activity loop.
При отсутствии готового timed speech action разрешён минимальный test-only
native seam: emission через существующий sound/speech owner и стоимость через
обычную native wait/activity, без присваивания `calendar::turn` и расчёта времени
в JS. Фактические duration и audience проверяются до первого model call.
Одно социальное последствие пишет существующий Novgorod conversation owner
после actual delivery; неслышащий actor не получает его. JSON/проза LLM
не являются доказательством физического исполнения.

Минимальное социальное последствие T10 — сохранённая точная реплика и её
audience projection у существующего conversation owner. Delivery metadata
сама по себе последствием не считается. Это ограничение эксперимента;
изменение отношений или долга не требуется для этого случая.

| Поля | Единственный writer в эксперименте |
|---|---|
| Положение, inventory/UID, native clock/RNG, activity и физическое владение | CDDA; JS получает readback |
| Native faction, opinion, hostility | CDDA; semantic adapter их не изменяет |
| Назначение NPC, progress, completed/interrupt status | Native NPC owner; semantic boundary только задаёт intent |
| Точная социальная запись и audience projection | Существующий Novgorod conversation owner после native delivery |
| Semantic trust/debt | Не используются и не изменяются в этом эксперименте |
| Published generation, executed operation IDs, сохранённый outcome | Один P4 coordinator |

## Зафиксированный протокол модели

Read-only resolution существующего runtime из текущего process environment
подтвердил доступные `turn_step_planner` и `npc_autonomous_decider`:
DeepSeek `deepseek-v4-flash`, max tokens 20000, timeout 120000 ms, ключ присутствует.
Первичная resolution показывала null для temperature/top_p; полный capture
production-запроса перед стендом уточнил фактические значения: temperature=0,
top_p=null. Ведущий `/root` заранее одобряет prototype override temperature=0
и top_p=1; effective nonsecret config
проверяется и сохраняется до первого model call. Conversation responder
проверяется отдельно: тот же provider/model, temperature=0, top_p=1,
max tokens 1000 и timeout 120000 ms. Любое несовпадение останавливает запуск
до пересмотра протокола; production settings не переписываются.

Три чистых reset на каждый sealed вариант, включая парафразы и held-out,
native seed 17. Каждый вариант имеет отдельный `variant_id` внутри T06–T10;
повторение одного варианта не заменяет проверку другого. Существующий bounded
repair допускает максимум один повтор после подходящей ошибки; все попытки
и причины сохраняются. Blind retry и выбор только удачных ответов запрещены.
Бюджет одного приёмочного пакета — максимум 72 provider attempts, включая repair.
Один общий счётчик в runner оборачивает role runner и увеличивается до каждого
transport attempt, включая repair всех ролей. Превышение отклоняет вызов.
Evidence directory создаётся один раз; повторный запуск того же пакета
отвергается, чтобы restart не сбрасывал уже потраченный лимит молча.
Дополнительный диагностический пакет требует отдельного решения ведущего
и не заменяет результаты прежнего пакета. До запуска сохраняются revision
prompt/schema, exact visible inputs, native code/build identity и pass/block rules.
Секреты, headers и содержимое credentials не попадают в evidence.

## Матрица до реализации

Все reset используют отдельный disposable userdir и один native fixture.
Это техническая сцена проверки механик, не доказательство исторической карты.
Положение, предметы, доступность target и свойства инструментов проверяются
native preflight до model calls; неподтверждённый item ID не используется.

| Case | Наблюдаемый критерий |
|---|---|
| T06 | Две формулировки одного шага по свободному западному проходу и независимая held-out парафраза дают ту же native механику. Контраст «открой дверь, оставаясь на месте» даёт другой эффект. Никакого exact text matching. |
| T07 | Видимый general item-use control и независимый held-out ordinary item/action используют один native primitive/input seam. Реальный effect и UID подтверждены. Отсутствие primitive означает BLOCK и пересмотр общего seam, не новый scenario handler. |
| T08 | Попытка пройти северную стену даёт native refusal/partial с фактическим положением; нет fabricated entity, второго RNG или придуманного успеха. |
| T09 | Один native duty/activity и одна открытая NPC boundary: реальный actor, исполнение intent, один semantic выбор, replay без выбора, native safety interrupt и возврат следующему semantic owner. Между boundaries нет LLM calls. |
| T10 | Свободная точная utterance, близкий слышащий listener и native deaf listener, 3 секунды native времени, одна социальная запись только для действительной delivery. |

Независимый проверяющий фиксирует held-out T06/T07 после заморозки adapters;
автор реализации не подгоняет их текст или ожидаемый effect. Ни один case
не считается пройденным только по schema/unit tests. Любой ложный physical
success, повторный writer/decision, утечка hidden state или потеря identity
блокирует P3. До успешного P4 результаты помечаются volatile native readback.

## Проверки и приёмка

Focused JS schema/identity/replay/call-count checks; реальные native probes
item use, NPC arbitration/interrupt и speech/audience/time; затем весь sealed
пакет T06–T10 с sanitised inputs, replies, validated plans и native before/after.
Сохраняются неудачные прогоны. P2 regression требуется при изменении общего seam.
После P3 и успешного P4 повторяются T11/T12 с utterance/audience/social facts
и execution identity. Полные fault/latency gates P4 остаются самостоятельными.

Нужны независимые review конкретного native seam до его запуска, проверка
fixture/expected values и final Contract Auditor по фактическому коду/evidence.
Этот документ фиксирует протокол и разрешённый scope, но не выдаёт PASS.
