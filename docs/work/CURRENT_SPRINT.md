# Current sprint

> **Производная выжимка.** Истина — GitHub Issues и milestones, для Runtime — описание Draft PR #98. Статусов, HEAD и CI здесь нет: «сделано» = issue закрыт; исключение — датированный срез задач флота в «Срез D49». Проверено: 2026-09-29, commit 988f7d8a.

## Цели

| Трек | Цель | Где истина |
|---|---|---|
| Runtime | переход к общему рантайму живого мира: сначала M2c «Процедурная материализация мест», затем M3–M8 | [PR #98](https://github.com/PavelSlaven/Novgorod1230/pull/98), milestone [Runtime M3–M8](https://github.com/PavelSlaven/Novgorod1230/milestone/2); текущий этап подтверждает владелец |
| Backlog | снять временные оговорки роутера и индекса, затем техдолг по LW | issues без milestone, label `P2` раньше `P3` |
| World Knowledge | исправить цепочку WK по аудиту [#151](https://github.com/PavelSlaven/Novgorod1230/issues/151) | CR [#152](https://github.com/PavelSlaven/Novgorod1230/issues/152), [#153](https://github.com/PavelSlaven/Novgorod1230/issues/153); очерёдность относительно M2c назначает владелец |
| Экономика | базовая условная единица (БУЕ = 1 мг чистого серебра), курсы по регионам и эпохам, якорные цены и ценовые полосы c1230; модуль экономики — отдельным CR после данных (D44) | [#184](https://github.com/PavelSlaven/Novgorod1230/issues/184) |

Трек Docs (DOC-01…03, #99–#101) завершён: milestone «Docs & agent context 2026-09» закрыт.

## Задачи по порядку

### Runtime

Этапы по порядку — [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133) **M2c** (текущий; 2026-09-25 перезапущен с проектирования, открытая ordinary-материализация перенесена в него из M3 — [решения владельца](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5836830425)), [#105](https://github.com/PavelSlaven/Novgorod1230/issues/105) M3, [#106](https://github.com/PavelSlaven/Novgorod1230/issues/106) M4, [#107](https://github.com/PavelSlaven/Novgorod1230/issues/107) M5, [#108](https://github.com/PavelSlaven/Novgorod1230/issues/108) M6, [#109](https://github.com/PavelSlaven/Novgorod1230/issues/109) M7, [#110](https://github.com/PavelSlaven/Novgorod1230/issues/110) M8. Порядок этапов — в плане:
[Novgorod1230_Runtime_Plan.md в ветке PR #98](https://github.com/PavelSlaven/Novgorod1230/blob/codex/live-world-runtime/docs/plans/Novgorod1230_Runtime_Plan.md).

Задание владельца к M2c — [Novgorod1230_Procedural_Materialization_Task.md](https://github.com/PavelSlaven/Novgorod1230/blob/codex/live-world-runtime/docs/plans/Novgorod1230_Procedural_Materialization_Task.md). Приоритетные разделы плана: §1 (начало исполнения и источники), §4 (общий критерий готовности), §5.1–5.3 (уровни готовности, тяжесть дефектов, проверки), текущий этап в §6 (M2c), §9 (решения владельца), §7 (порядок, статус, вердикты). Читать нужные разделы, а не весь план (~200 КБ): решение владельца 2026-09-25, правка §7.3 плана — задача M2c.

Единица работы и проверки — задача с CR, а не весь этап: ревью после каждой задачи. Ревьюер — Claude. Исполнители (D31 с изменениями D47/D49): код Runtime — параллельные задачи Claude (Sonnet) и Cursor (Composer) с чёткими границами файлов и владельцев, ветки вливаются в PR #98; данные игровой базы — Codex (`gpt-6-luna`); отдельные CR кода — младшие исполнители Claude на servak. Порядок работы, модели и площадка — [HOW_WE_WORK](../process/HOW_WE_WORK.md), разделы 5 и 10.

Задачи M2c по порядку (порядок — техническая зависимость; решения владельца 2026-09-28 — [D28–D32 в #133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5866721387)):

1. [#145](https://github.com/PavelSlaven/Novgorod1230/issues/145) (карты v17 и план этапа) и [#146](https://github.com/PavelSlaven/Novgorod1230/issues/146) (нормы M2c) приняты в ветке PR #98 и закрываются merge PR #98.
2. [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158) — люди по распорядкам, отношения, описания мест и воды, импорт игровой базы, подача рассказчику; шаги R-1, R-1b, R-2…R-5. Первыми идут R-1 (распорядки и состав населения — R-1b) и R-2. R-2a после четвёртого ослабления теста передан Claude (`r2a-claude`, правило переключения Cursor, D47); D27 (волна NPC в стандартном старте v17) включается отдельным шагом R-1b-activate после прохода Contract Auditor по R-2a.
3. [#160](https://github.com/PavelSlaven/Novgorod1230/issues/160) B1 — проходы, «занято», причина провала расширения, перезапуск. Влит в PR #98 (D47); issue закрывается merge PR #98.
4. [#161](https://github.com/PavelSlaven/Novgorod1230/issues/161) B2 (NPC: имя, характер, манера речи, биография) и [#162](https://github.com/PavelSlaven/Novgorod1230/issues/162) B3 (ресурсы, контейнеры, опознавательный текст вещей) — после #158 R-1/R-2. Порядок B2→B3→B4 перекрыт параллельными задачами среза D49 («Срез D49»). B3 и B4 строятся по архитектуре ресурсов [#171](https://github.com/PavelSlaven/Novgorod1230/issues/171) (решения владельца D33–D36): классы A/B/C, наличие при первом прибытии, восстановление закрытой формулой, запасы двора по нормам; каталог семей — дополнение к #171. Данные к B2 готовятся заранее: пул личных имён — PR [#172](https://github.com/PavelSlaven/Novgorod1230/pull/172).
5. [#163](https://github.com/PavelSlaven/Novgorod1230/issues/163) B4 — открытая ordinary-материализация (O2a, F1, S1), человек по запросу игрока; после B2 и B3.
6. [#164](https://github.com/PavelSlaven/Novgorod1230/issues/164) B5 — все типы мест: матрица по данным и typed gaps; после #158 R-1.
7. [#165](https://github.com/PavelSlaven/Novgorod1230/issues/165) B6 — приёмка M2c, последним.

Данные игровой базы — параллельно блокам. Импорт находок из архивов (D46 в [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133)): сначала вещи и следы, одежда и быт, сезонность блюд, затем занятия, сословия и право, психология и речь, имена; шаги ремёсел — как аналогия вместе с [#170](https://github.com/PavelSlaven/Novgorod1230/issues/170); каркас карты и путей — отдельный CR [#187](https://github.com/PavelSlaven/Novgorod1230/issues/187). Нормы и обычаи как сущности мира — [#183](https://github.com/PavelSlaven/Novgorod1230/issues/183). Одноходовая переправа — [#185](https://github.com/PavelSlaven/Novgorod1230/issues/185), после B1.

Гипотезы, зависящие от поведения нейросети, до плана проверяются на стенде вне игры ([HOW_WE_WORK](../process/HOW_WE_WORK.md) §11, каталог стендов [#181](https://github.com/PavelSlaven/Novgorod1230/issues/181)).

Правки DDL `world_base` — по одной, у каждой свой проход Contract Auditor: сначала #158 R-1, затем схема пула имён (B2; в срезе D49 — задача `rt-names`, DDL идёт со своим Contract Auditor), затем пулы надписей (B3). PR данных игровой базы сливаются по одному после независимой проверки Opus и зелёного CI (решение владельца D45).

### Срез D49 и решения D47–D57

Журнал решений — [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133): D47 ([комментарий](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5884226430)), D48 ([комментарий](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5886848018)), D49 ([комментарий](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5889785976)). дополнение D49 по карте и движению ([комментарий](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5898354540)), D50 ([комментарий](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5898355145)).

- **D47 (2026-09-29):**
  - B1 (`m2c/b1-passages`) и `fleet/weapon-schema` идут в PR #98;
  - экономика: шаг ценовой полосы k = 4 как параметр, N — в нормы ([#183](https://github.com/PavelSlaven/Novgorod1230/issues/183));
  - D27 включается после Contract Auditor по R-2a;
  - если Cursor ещё раз ослабит тест ради зелёного, R-2a переходит к Claude (исполнено: `r2a-claude`).
- **D48 (2026-09-29):**
  - Codex: `gpt-6-sol` вместо `gpt-5.6-sol`; luna — по умолчанию, sol — план и короткие проходы на суждение; параллельность Codex не снижается (8 субагентов на задачу);
  - Opus — один проход на сдачу (утверждение и Contract Auditor); workflows — Sonnet 5.5, до 6 агентов; Cursor — `composer-2.5`, не fast;
  - незапланированные расходы не считаются в план, недельный резерв ≈ 15%.
- **D49 (2026-09-29): приоритет — играбельный срез v17 из PR #98.**
  - Срез: старт в Вихтуе → выйти → люди с именами и характером → поговорить → взять или сделать вещь. «Готово» = живой плейтест, а не зелёные тесты.
  - Runtime-задачи идут параллельно на разных исполнителях; данные не на паузе (Codex luna: imp-crafts PR-B, `needs_check`, imp-routed, #201).
  - Вечерний живой прогон на servak; PR #98 вливается в main, когда срез играбелен, а не в конце M2c.
  - Люди появляются после выхода из стартового места, не меньше одного на каждом месте среза; пул имён — через DDL `world_base` со своим Contract Auditor; характер: 1 темперамент + 2 ценности + 1–2 цели занятия + 1 страх.
  - Туман и темнота — один класс «плохая видимость», симметричный для игрока и NPC; движение не блокируется.
  - Карта (решения владельца по обзорам карты): проход называется линией («тропинкой вдоль ручья»), не целью и не «Проход N»; позиции внутри места скрыты, проход через место — одна фраза перехода; единая модель линий для любого перехода между местами; время перехода — минуты по виду линии; в плохой видимости линии от текущего места предлагаются всегда (по слуху и на ощупь, время ×1.5, в метель ×3); развилки — места; разворот только в точках маршрута; реконструкция карты — авторская, по реальному каркасу рукавов дельты; вода без лодки — на бревне или вплавь с риском по таблице, путь не закрывается; новый исход `returned_to_departure`. Правка Spatial одним CR (4.7.0); лендмарки и рассказ NPC о дороге — этап 2, бездорожье — этап 3.
- **D50 (2026-09-29, вечер):**
  - недельный резерв Claude тратится: ≈ 8,5 п.п. в день, к сбросу 2026-10-04 17:00Z выходим на 100%; Codex — luna, sol только планирует;
  - приняты пять правил процесса ([HOW_WE_WORK](../process/HOW_WE_WORK.md) §10.8);
  - docs-PR [#211](https://github.com/PavelSlaven/Novgorod1230/pull/211) записал срез D47–D50 и правила процесса. Слияние кода и docs — только по слову владельца.
- **D51 (2026-09-30):** Giga-энкодер WK на CPU; отдельные пулы имён народов; `needs_check` блокирует генерацию и материализацию; пара баз v17 пересоздаётся один раз; игровое время — реальные минуты; p12 обязателен в CI ([решение](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5905464818)).
- **D52 (2026-09-30):** кредиты основного Codex — только после включённого лимита; банковские сбросы учитываются в `fleet/resets.tsv`; второй аккаунт без кредитов; отдельный лимитный `@codex review` не подключать ([решение](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5912660733)).
- **D53 (2026-09-30):** #215 сливать после зелёного CI; сторожа переправы убрать, на перевозе оставить перевозчика ([решение](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5913630707)).
- **D54 (2026-09-30):** лимиты Codex планово расходовать почти до сброса; для второго аккаунта пороги 90/95% (5 ч) и 98/99% (неделя), 16 luna на втором аккаунте и 8 на основном; Cursor останавливает новые прогоны на 98% ([решение](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5914658408)).
- **D55 (2026-09-30):** ChatGPT-точка проводит предварительное советующее ревью, не утверждает; утверждение и Contract Auditor остаются за Opus ([решение и принятие](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5918435161)).
- **D56 (2026-09-30):** минуты линий следуют геометрии; жёсткий предел длины 30 минут снят, условия проверяются срезами не реже 30 минут; в уточнение D49 разворот возможен посреди линии, а не только в точке маршрута; ссылка на условия доступности необязательна ([решение](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5916869226)).
- **D57 (2026-09-30):** Codex запускает PG-прогоны через очередь флота и `pg-slot`; новые Codex исполнители — luna «армией» по умолчанию; вечерний разбор создаёт отдельный issue с меткой `evening-review`; Cursor не тратит сверх пула ([решение](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5919234884)).

### Следующий шаг играбельного среза D49

Следующий живой прогон v17 должен проверить стабильное «сделать», имена и характер NPC в их речи, названия линий вместо «Проход N» и зелёный CI PR #98. После этого владелец проводит живой прогон и оценивает срез. Это критерии следующего шага, не отчёт о пройденной проверке ([#216](https://github.com/PavelSlaven/Novgorod1230/issues/216)).

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
