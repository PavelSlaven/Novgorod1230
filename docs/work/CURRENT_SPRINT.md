# Current sprint

> **Производная выжимка.** Истина — GitHub Issues и milestones, для Runtime — описание Draft PR #98 и его ветка. Эта редакция сверена в локальном checkout `fleet/docs-2a`, HEAD `96066df6d614f2131bd0b58c44f77810762c65b2` (2026-10-02); это не проверка свежести `main`, remote, PR #98, CI или production. Коммиты в ветке PR не означают merge в `main`, закрытие issue или приёмку этапа. Текущие статусы задач флота — в [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133).

## Цели

| Трек | Цель | Где истина |
|---|---|---|
| Runtime | переход к общему рантайму живого мира: сначала M2c «Процедурная материализация мест», затем M3–M8 | [PR #98](https://github.com/PavelSlaven/Novgorod1230/pull/98), milestone [Runtime M3–M8](https://github.com/PavelSlaven/Novgorod1230/milestone/2); текущий этап подтверждает владелец |
| Backlog | снять временные оговорки роутера и индекса, затем техдолг по LW | issues без milestone, label `P2` раньше `P3` |
| World Knowledge | исправить цепочку WK по аудиту [#151](https://github.com/PavelSlaven/Novgorod1230/issues/151) | CR [#152](https://github.com/PavelSlaven/Novgorod1230/issues/152), [#153](https://github.com/PavelSlaven/Novgorod1230/issues/153); очерёдность относительно M2c назначает владелец |
| Экономика | базовая условная единица (БУЕ = 1 мг чистого серебра), курсы по регионам и эпохам, якорные цены и ценовые полосы c1230; модуль экономики — отдельным CR после данных (D44) | [#184](https://github.com/PavelSlaven/Novgorod1230/issues/184) |

Трек Docs (DOC-01…03, #99–#101) завершён: milestone «Docs & agent context 2026-09» закрыт.

## Вечерние разборы #216 и #228

### Решения владельца

Решения D61–D66 записаны в [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133) (текст решения доступен в рабочем пакете triage):

- **D61 (2026-10-01):** для корела — календарное правило крестильных имён с низкой уверенностью и утверждением Opus; немецкие и готландские торговые гости — только мужские профили.
- **D62 (2026-10-01):** NPC общаются живо через LLM, без скриптованных фраз; обучение у NPC выделено в #222; по стартовым типам верфь остаётся исключением, пробел песка решено устранить, сад, бортничество и каменоломня требуют исследования.
- **D63 (2026-10-01):** по домашним животным двора (#223) приняты ответы владельца по четырём вопросам и задан план «сейчас / потом».
- **D64 (2026-10-01):** свободные ресурсы Codex направлять армиям luna на исследование открытых issues; боевая система — #224.
- **D65 (2026-10-01):** для #224 — минимальный бой сразу после O1, последствия следом, быстрый обмен ударами, время боя по контрактам в секундах на действие без раундов; длительности исследовать.
- **D66 (2026-10-01):** механики сценарных профилей Lower Dvina общие; сценарий задаёт только сюжет и NPC и проходит внутри свободной игры (#225).
- **D67 (10-01):** при лимите Claude промежуточные Contract Auditor и утверждения данных идут задачами Codex sol 6.1; окончательное решение — ведущий.
- **D68 (10-01):** фаза 2 #220 утверждена: порядок пакетов шага 4, код — после npc-claims. Гипотезы извлечения wk-gaps (#153) проверяются по одной.
- **D69 (10-01):** направления исследований: #221 — первым; #223 — CR, код после O1; #170 и #222 — после O1 и минимального боя.
- **D70 (10-02):** wk-gaps, фаза 3 — отдельный однофакторный эксперимент по `max_facts`. Изменение production — только через общий CR с npc-claims и CA.
- **D71 (10-02):** ресурсы #171: числа — игровая калибровка (стенд D41, плейтест); исторические аналогии — только как границы; метка калибровки внутренняя, не для игрока и не для модели; после O1 v1.
- **D72 (10-02):** никакие служебные метки не попадают на экран игрока и в тексты для модели: id, статусы обработки, калибровка, метаданные. Норма — `situational_prose_requirements.md` §2.2, влита в PR #98 (`4b7cdc67`); runtime-защита — отдельная задача.
- **D73 (10-02):** Codex расходовать активнее: армии по открытым issue, параллельность субагентов поднята до максимума сервера.
- **D74 (10-02):** глобальный сброс лимитов Codex 2026-10-03 не накопительный. При исчерпании лимита сначала расходуются кредиты, затем сбросы. Данные проекта не удалять — переносить в архив на большом диске.

Это решения и направления работ, не свидетельство реализации, проверки или приёмки. Подробные предложения вечерних разборов: [#216](https://github.com/PavelSlaven/Novgorod1230/issues/216) и [#228](https://github.com/PavelSlaven/Novgorod1230/issues/228).

### Реализация и проверки по #216/#228

В #228 предложена заморозка слияний PR #98 до зелёных meet и CI; владелец её не утвердил, поэтому это предложение, а не правило. Статус пунктов — в [#216](https://github.com/PavelSlaven/Novgorod1230/issues/216) и [#228](https://github.com/PavelSlaven/Novgorod1230/issues/228).

## Задачи по порядку

### Runtime

Этапы по порядку — [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133) **M2c** (текущий, `IN_PROGRESS`; 2026-09-25 перезапущен с проектирования, открытая ordinary-материализация перенесена в него из M3 — [решения владельца](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5836830425)), [#105](https://github.com/PavelSlaven/Novgorod1230/issues/105) M3, [#106](https://github.com/PavelSlaven/Novgorod1230/issues/106) M4, [#107](https://github.com/PavelSlaven/Novgorod1230/issues/107) M5, [#108](https://github.com/PavelSlaven/Novgorod1230/issues/108) M6, [#109](https://github.com/PavelSlaven/Novgorod1230/issues/109) M7, [#110](https://github.com/PavelSlaven/Novgorod1230/issues/110) M8. Порядок этапов — в плане:
[Novgorod1230_Runtime_Plan.md в ветке PR #98](https://github.com/PavelSlaven/Novgorod1230/blob/codex/live-world-runtime/docs/plans/Novgorod1230_Runtime_Plan.md).

Задание владельца к M2c — [Novgorod1230_Procedural_Materialization_Task.md](https://github.com/PavelSlaven/Novgorod1230/blob/codex/live-world-runtime/docs/plans/Novgorod1230_Procedural_Materialization_Task.md). Приоритетные разделы плана: §1 (начало исполнения и источники), §4 (общий критерий готовности), §5.1–5.3 (уровни готовности, тяжесть дефектов, проверки), текущий этап в §6 (M2c), §9 (решения владельца), §7 (порядок, статус, вердикты). Читать нужные разделы, а не весь план (~200 КБ): решение владельца 2026-09-25, правка §7.3 плана — задача M2c.

Единица работы и проверки — задача с CR, ревью после каждой задачи. Актуальные исполнители и модели — [HOW_WE_WORK](../process/HOW_WE_WORK.md), разделы 5 и 10.

#### Срез Runtime на 2026-10-01

На `codex/live-world-runtime` влиты следующие подтверждённые изменения (короткие hash ведут на коммиты в ветке PR #98):

- перемещение и разговоры — [`5fdeed3f`](https://github.com/PavelSlaven/Novgorod1230/commit/5fdeed3f), [`e72dfab3`](https://github.com/PavelSlaven/Novgorod1230/commit/e72dfab3); вещи и действие «сделать» — [`f41c53cb`](https://github.com/PavelSlaven/Novgorod1230/commit/f41c53cb);
- драйвер живого прогона v17 — [`5840fd78`](https://github.com/PavelSlaven/Novgorod1230/commit/5840fd78); имена и seeded character — [`1fe85e5b`](https://github.com/PavelSlaven/Novgorod1230/commit/1fe85e5b); координаты стартовых ячеек — [`ccacd68f`](https://github.com/PavelSlaven/Novgorod1230/commit/ccacd68f);
- люди и данные среза — [`215201cd`](https://github.com/PavelSlaven/Novgorod1230/commit/215201cd), [`8201d43c`](https://github.com/PavelSlaven/Novgorod1230/commit/8201d43c), [`27f91015`](https://github.com/PavelSlaven/Novgorod1230/commit/27f91015); «сделать» в перемещённых местах — [`c3b6fc0d`](https://github.com/PavelSlaven/Novgorod1230/commit/c3b6fc0d);
- удаление сторожа переправы и Spatial CR — [`3d2cf5fb`](https://github.com/PavelSlaven/Novgorod1230/commit/3d2cf5fb), [`05a40b2c`](https://github.com/PavelSlaven/Novgorod1230/commit/05a40b2c); Spatial amendment и линии, только фаза a — [`422e72ba`](https://github.com/PavelSlaven/Novgorod1230/commit/422e72ba). Импорт wave `m2c-lines-v1` этим коммитом не разрешён: в его описании указан запрет до b1;
- follow-ups — [`eed0aa27`](https://github.com/PavelSlaven/Novgorod1230/commit/eed0aa27); фильтр `needs_check` по D59 — [`d30c327d`](https://github.com/PavelSlaven/Novgorod1230/commit/d30c327d).

Это список вливаний в ветку PR #98 по её Git log; он не подтверждает закрытие связанных issues, импорт данных, runtime activation или приёмку M2c. [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133) открыт, M2c — `IN_PROGRESS`; [PR #98](https://github.com/PavelSlaven/Novgorod1230/pull/98) открыт как Draft с base `main`. В описании PR остаются условия merge: bootstrap/rebuild v17, сквозной UI с real provider, runtime activation richness/stock, финальные audit и CI. D60 (`npc-epoch-guard`) — исследование/стенд; реализация и приёмка не подтверждены ([решение D60](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5928266458)).

Плановые M2c issues и зависимости остаются в [Runtime_Plan §6](https://github.com/PavelSlaven/Novgorod1230/blob/codex/live-world-runtime/docs/plans/Novgorod1230_Runtime_Plan.md) и [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133); отдельные коммиты выше сами по себе не заменяют их статусы.

Данные игровой базы — параллельно блокам. Импорт находок из архивов (D46 в [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133)): сначала вещи и следы, одежда и быт, сезонность блюд, затем занятия, сословия и право, психология и речь, имена; шаги ремёсел — как аналогия вместе с [#170](https://github.com/PavelSlaven/Novgorod1230/issues/170); каркас карты и путей — отдельный CR [#187](https://github.com/PavelSlaven/Novgorod1230/issues/187). Нормы и обычаи как сущности мира — [#183](https://github.com/PavelSlaven/Novgorod1230/issues/183). Одноходовая переправа — [#185](https://github.com/PavelSlaven/Novgorod1230/issues/185), после B1.

Гипотезы, зависящие от поведения нейросети, до плана проверяются на стенде вне игры ([HOW_WE_WORK](../process/HOW_WE_WORK.md) §11, каталог стендов [#181](https://github.com/PavelSlaven/Novgorod1230/issues/181)).

Правки DDL `world_base` — по одной, у каждой свой проход Contract Auditor: сначала #158 R-1, затем схема пула имён (B2; в срезе D49 — задача `rt-names`, DDL идёт со своим Contract Auditor), затем пулы надписей (B3). PR данных игровой базы сливаются по одному после независимой проверки Opus и зелёного CI (решение владельца D45).

### Срез D49 и решения D47–D60

Журнал решений — [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133): D47 ([комментарий](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5884226430)), D48 ([комментарий](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5886848018)), D49 ([комментарий](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5889785976)). дополнение D49 по карте и движению ([комментарий](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5898354540)), D50 ([комментарий](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5898355145)).

- **D47 (2026-09-29):**
  - B1 (`m2c/b1-passages`) и `fleet/weapon-schema` идут в PR #98;
  - экономика: шаг ценовой полосы k = 4 как параметр, N — в нормы ([#183](https://github.com/PavelSlaven/Novgorod1230/issues/183));
  - D27 включается после Contract Auditor по R-2a;
  - если Cursor ещё раз ослабит тест ради зелёного, R-2a переходит к Claude (исполнено: `r2a-claude`).
- **D48 (2026-09-29):**
  - Codex: `gpt-6.1-sol` или `gpt-6-sol`; luna — по умолчанию, sol — план и короткие проходы на суждение; параллельность Codex не снижается (8 субагентов на задачу);
  - Opus — один проход на сдачу (утверждение и Contract Auditor); workflows — Sonnet 5.5, до 6 агентов; Cursor — `composer-2.5`, не fast;
  - незапланированные расходы не считаются в план, недельный резерв ≈ 15%.
- **D49 (2026-09-29): приоритет — играбельный срез v17 из PR #98.**
  - Срез: старт в Вихтуе → выйти → люди с именами и характером → поговорить → взять или сделать вещь. «Готово» = живой плейтест, а не зелёные тесты.
  - Runtime-задачи идут параллельно на разных исполнителях; данные не на паузе (Codex luna: imp-crafts PR-B, `needs_check`, imp-routed, #201).
  - Вечерний живой прогон на servak; PR #98 вливается в main, когда срез играбелен, а не в конце M2c.
  - Люди появляются после выхода из стартового места, не меньше одного на каждом месте среза; пул имён — через DDL `world_base` со своим Contract Auditor; характер: 1 темперамент + 2 ценности + 1–2 цели занятия + 1 страх.
  - Туман и темнота — один класс «плохая видимость», симметричный для игрока и NPC; движение не блокируется.
  - Карта (решения владельца по обзорам карты): проход называется линией («тропинкой вдоль ручья»), не целью и не «Проход N»; позиции внутри места скрыты, проход через место — одна фраза перехода; единая модель линий для любого перехода между местами; время перехода — минуты по виду линии; в плохой видимости линии от текущего места предлагаются всегда (по слуху и на ощупь, время ×1.5, в метель ×3); развилки — места; разворот только в точках маршрута (уточнено D56: возможен посреди линии); реконструкция карты — авторская, по реальному каркасу рукавов дельты; вода без лодки — на бревне или вплавь с риском по таблице, путь не закрывается; новый исход `returned_to_departure`. Правка Spatial одним CR (4.7.0); лендмарки и рассказ NPC о дороге — этап 2, бездорожье — этап 3.
- **D50 (2026-09-29, вечер):**
  - недельный резерв Claude тратится: ≈ 8,5 п.п. в день, к сбросу 2026-10-04 17:00Z выходим на 100%; Codex — luna, sol только планирует;
  - приняты пять правил процесса ([HOW_WE_WORK](../process/HOW_WE_WORK.md) §10.8);
  - docs-PR [#211](https://github.com/PavelSlaven/Novgorod1230/pull/211) записал срез D47–D50 и правила процесса. На тот момент слияние кода и docs требовало слова владельца; правило обновлено D58.
- **D51 (2026-09-30):** настоящий Giga-энкодер WK на servak (CPU); отдельные пулы имён по народам; `needs_check` блокирует генерацию и материализацию; парная БД v17 пересоздаётся после схемы rt-names; игровое время — реальные минуты; p12 обязателен в CI ([решение](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5905464818)).
- **D52 (2026-09-30):** кредиты основного Codex — только после включённого лимита; банковские сбросы учитываются в `fleet/resets.tsv`; второй аккаунт без кредитов; отдельный лимитный `@codex review` не подключать ([решение](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5912660733)).
- **D53 (2026-09-30):** #215 сливать после зелёного CI; сторожа переправы убрать, на перевозе оставить перевозчика ([решение](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5913630707)).
- **D54 (2026-09-30):** лимиты Codex планово расходовать почти до сброса; для второго аккаунта пороги 90/95% (5 ч) и 98/99% (неделя), 16 luna на втором аккаунте и 8 на основном; Cursor останавливает новые прогоны на 98% ([решение](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5914658408)).
- **D55 (2026-09-30):** ChatGPT-точка проводит предварительное советующее ревью, не утверждает; утверждение и Contract Auditor остаются за Opus ([решение и принятие](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5918435161)).
- **D56 (2026-09-30):** минуты линий следуют геометрии; жёсткий предел длины 30 минут снят, условия проверяются срезами не реже 30 минут; в уточнение D49 разворот возможен посреди линии, а не только в точке маршрута; ссылка на условия доступности необязательна ([решение](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5916869226)).
- **D57 (2026-09-30):** Codex запускает PG-прогоны через очередь флота и `pg-slot`; новые Codex исполнители — luna «армией» по умолчанию; вечерний разбор создаёт отдельный issue с меткой `evening-review`; Cursor не тратит сверх пула ([решение](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5919234884)).
- **D58 (2026-10-01):** ведущий сам сливает необходимые PR кода, данных и docs; governance — исключение ([решение](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5926187952)).
- **D59 (2026-10-01):** кодовое изменение `needs_check` уже в ветке PR #98 (`d30c327d`, см. срез выше); внешнее ревью нашло три дефекта (повторные паузы ожидания, время первого поиска, осмотр существующей вещи NPC) — исправление идёт вперёд в задаче `needs-check-rt`; норма — [PRODUCT_CONSTITUTION §4 и §9.1](../governance/PRODUCT_CONSTITUTION.md) ([решение](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5926596803)).
- **D60 (2026-10-01):** защита эпохи для NPC — [решение](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5928266458); нормативный контекст — [PRODUCT_CONSTITUTION §8–9](../governance/PRODUCT_CONSTITUTION.md).

### Следующий шаг играбельного среза D49

Следующий живой прогон v17 должен проверить стабильное «сделать», имена и характер NPC в их речи, названия линий вместо «Проход N» и зелёный CI PR #98. После этого владелец проводит живой прогон и оценивает срез. Это критерии следующего шага, не отчёт о пройденной проверке ([#216](https://github.com/PavelSlaven/Novgorod1230/issues/216)); текущую реализацию и её ограничения сверяй по срезу выше и описанию PR.

Статусы задач флота — на доске флота и в [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133).

### Backlog — сначала

Приоритетные долги (#111, #113, #115) закрыты. Перед и во время M2c:

1. [#126](https://github.com/PavelSlaven/Novgorod1230/issues/126) — non-gate проверки (LW-012); разбор 2026-09-28 — [комментарий](https://github.com/PavelSlaven/Novgorod1230/issues/126#issuecomment-5869200579).
2. [#170](https://github.com/PavelSlaven/Novgorod1230/issues/170) — переработка навыков (список, связь с действиями и занятиями, сложность мирных проверок); владелец вернётся к ней позже. До неё ресурсы опираются на текущие 12 навыков через заменяемую таблицу «действие → навык».

Остальное (`P3`) — по мере работы с затронутыми путями; ссылки на issue стоят у записей [LEGACY_WARNINGS](LEGACY_WARNINGS.md). После merge #98 разблокируются [#117](https://github.com/PavelSlaven/Novgorod1230/issues/117) и [#118](https://github.com/PavelSlaven/Novgorod1230/issues/118).

## Живой статус

```powershell
gh issue list --milestone "Runtime M3–M8" --state all
gh issue list --label P2 --state open
gh pr view 98 --json title,isDraft,headRefOid,statusCheckRollup
```

## Правило остановки

- Начало спринта (новый milestone, новый этап плана или смена трека): сначала проверка, синхронизация и использование CBM — [AGENTS.md §19](../governance/WORKFLOW_RULES.md).
- Одна задача = одна сессия; следующая берётся по [WORKFLOW.md](../process/WORKFLOW.md), раздел «Взять следующую задачу».
- Следующий Runtime-этап не начинается без решения владельца (Runtime_Plan §7.4).
- Если задача требует решения владельца (права на AGENTS.md и governance, статус документа, issue с `decision:owner`), — остановиться и спросить.
