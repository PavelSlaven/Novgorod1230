# Current sprint

> **Производная выжимка.** Истина — GitHub Issues и milestones, для Runtime — описание Draft PR #98. Статусов, HEAD и CI здесь нет: «сделано» = issue закрыт. Проверено: 2026-09-29, commit c9c72bbd.

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

Единица работы и проверки — задача с CR, а не весь этап: ревью после каждой задачи. Ревьюер — Claude. Исполнители (решение владельца D31): код Runtime — Cursor в PR #98; данные игровой базы — Codex; отдельные CR кода — младшие исполнители Claude на servak. Порядок работы, модели и площадка — [HOW_WE_WORK](../process/HOW_WE_WORK.md), разделы 5 и 10.

Задачи M2c по порядку (порядок — техническая зависимость; решения владельца 2026-09-28 — [D28–D32 в #133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5866721387)):

1. [#145](https://github.com/PavelSlaven/Novgorod1230/issues/145) (карты v17 и план этапа) и [#146](https://github.com/PavelSlaven/Novgorod1230/issues/146) (нормы M2c) приняты в ветке PR #98 и закрываются merge PR #98.
2. [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158) — люди по распорядкам, отношения, описания мест и воды, импорт игровой базы, подача рассказчику; шаги R-1, R-1b, R-2…R-5, исполнитель — Cursor. Первыми идут R-1 (распорядки и состав населения — R-1b) и R-2.
3. [#160](https://github.com/PavelSlaven/Novgorod1230/issues/160) B1 — проходы, «занято», причина провала расширения, перезапуск. Не зависит от других блоков.
4. [#161](https://github.com/PavelSlaven/Novgorod1230/issues/161) B2 (NPC: имя, характер, манера речи, биография) и [#162](https://github.com/PavelSlaven/Novgorod1230/issues/162) B3 (ресурсы, контейнеры, опознавательный текст вещей) — после #158 R-1/R-2. B3 и B4 строятся по архитектуре ресурсов [#171](https://github.com/PavelSlaven/Novgorod1230/issues/171) (решения владельца D33–D36): классы A/B/C, наличие при первом прибытии, восстановление закрытой формулой, запасы двора по нормам; каталог семей — дополнение к #171. Данные к B2 готовятся заранее: пул личных имён — PR [#172](https://github.com/PavelSlaven/Novgorod1230/pull/172).
5. [#163](https://github.com/PavelSlaven/Novgorod1230/issues/163) B4 — открытая ordinary-материализация (O2a, F1, S1), человек по запросу игрока; после B2 и B3.
6. [#164](https://github.com/PavelSlaven/Novgorod1230/issues/164) B5 — все типы мест: матрица по данным и typed gaps; после #158 R-1.
7. [#165](https://github.com/PavelSlaven/Novgorod1230/issues/165) B6 — приёмка M2c, последним.

Данные игровой базы — параллельно блокам. Импорт находок из архивов (D46 в [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133)): сначала вещи и следы, одежда и быт, сезонность блюд, затем занятия, сословия и право, психология и речь, имена; шаги ремёсел — как аналогия вместе с [#170](https://github.com/PavelSlaven/Novgorod1230/issues/170); каркас карты и путей — отдельный CR [#187](https://github.com/PavelSlaven/Novgorod1230/issues/187). Нормы и обычаи как сущности мира — [#183](https://github.com/PavelSlaven/Novgorod1230/issues/183). Одноходовая переправа — [#185](https://github.com/PavelSlaven/Novgorod1230/issues/185), после B1.

Гипотезы, зависящие от поведения нейросети, до плана проверяются на стенде вне игры ([HOW_WE_WORK](../process/HOW_WE_WORK.md) §11, каталог стендов [#181](https://github.com/PavelSlaven/Novgorod1230/issues/181)).

Правки DDL `world_base` — по одной, у каждой свой проход Contract Auditor: сначала #158 R-1, затем схема пула имён (B2), затем пулы надписей (B3). PR данных игровой базы сливаются по одному после независимой проверки Opus и зелёного CI (решение владельца D45).

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
