# Current sprint

> **Производная выжимка.** Истина — GitHub Issues и milestones, для Runtime — описание Draft PR #98. Статусов, HEAD и CI здесь нет: «сделано» = issue закрыт. Проверено: 2026-09-26, commit b51ac023.

## Цели

| Трек | Цель | Где истина |
|---|---|---|
| Runtime | переход к общему рантайму живого мира: сначала M2c «Процедурная материализация мест», затем M3–M8 | [PR #98](https://github.com/PavelSlaven/Novgorod1230/pull/98), milestone [Runtime M3–M8](https://github.com/PavelSlaven/Novgorod1230/milestone/2); текущий этап подтверждает владелец |
| Backlog | снять временные оговорки роутера и индекса, затем техдолг по LW | issues без milestone, label `P2` раньше `P3` |

Трек Docs (DOC-01…03, #99–#101) завершён: milestone «Docs & agent context 2026-09» закрыт.

## Задачи по порядку

### Runtime

Этапы по порядку — [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133) **M2c** (текущий; 2026-09-25 перезапущен с проектирования, открытая ordinary-материализация перенесена в него из M3 — [решения владельца](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5836830425)), [#105](https://github.com/PavelSlaven/Novgorod1230/issues/105) M3, [#106](https://github.com/PavelSlaven/Novgorod1230/issues/106) M4, [#107](https://github.com/PavelSlaven/Novgorod1230/issues/107) M5, [#108](https://github.com/PavelSlaven/Novgorod1230/issues/108) M6, [#109](https://github.com/PavelSlaven/Novgorod1230/issues/109) M7, [#110](https://github.com/PavelSlaven/Novgorod1230/issues/110) M8. Порядок этапов — в плане:
[Novgorod1230_Runtime_Plan.md в ветке PR #98](https://github.com/PavelSlaven/Novgorod1230/blob/codex/live-world-runtime/docs/plans/Novgorod1230_Runtime_Plan.md).

Задание владельца к M2c — [Novgorod1230_Procedural_Materialization_Task.md](https://github.com/PavelSlaven/Novgorod1230/blob/codex/live-world-runtime/docs/plans/Novgorod1230_Procedural_Materialization_Task.md). Приоритетные разделы плана: §1 (начало исполнения и источники), §4 (общий критерий готовности), §5.1–5.3 (уровни готовности, тяжесть дефектов, проверки), текущий этап в §6 (M2c), §9 (решения владельца), §7 (порядок, статус, вердикты). Читать нужные разделы, а не весь план (~200 КБ): решение владельца 2026-09-25, правка §7.3 плана — задача M2c.

Единица работы и проверки — задача с CR, а не весь этап: ревью после каждой задачи. Исполнитель — Cursor, ревьюер — Claude; порядок работы — [HOW_WE_WORK](../process/HOW_WE_WORK.md).

Текущие задачи-CR по порядку (порядок — техническая зависимость; решения владельца 2026-09-26 — [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5839745154)):

1. [#144](https://github.com/PavelSlaven/Novgorod1230/issues/144) — RAG нормативного корпуса только лексический, затем статус и приоритет manifest из CONTRACT_INDEX; на main. Идёт первым: после него статус в manifest выводится скриптом, и перевод политики категорий в ACTIVE (#146, шаг 1) не блокирует `knowledge:status`.
2. Синхронизация main → PR #98 (merge, без rebase).
3. [#145](https://github.com/PavelSlaven/Novgorod1230/issues/145) — карты v17 и план этапа на ветке PR #98; закрывается после независимого Contract Auditor.
4. [#146](https://github.com/PavelSlaven/Novgorod1230/issues/146) — нормы M2c через CORPUS_EDIT на ветке PR #98; каждый шаг — отдельная сдача на ревью.
5. CR реализации M2c (код и данные) — после шага 1 #146.

### Backlog — сначала

Приоритетные долги (#111, #113, #115) закрыты. Перед и во время M2c:

1. [#126](https://github.com/PavelSlaven/Novgorod1230/issues/126) — остаток non-gate проверок: устаревшие sha-пины p12 dependency-closure (перегенерация — утверждённый data-пакет), `spatial-v3:check-p02`.
2. [#147](https://github.com/PavelSlaven/Novgorod1230/issues/147) — осиротевшие тестовые Docker-контейнеры убитых прогонов (main); файлы ветки PR #98 с `docker run` конвертируются при следующей синхронизации main → PR #98.

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
