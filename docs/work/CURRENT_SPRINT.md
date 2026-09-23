# Current sprint

> **Производная выжимка.** Истина — GitHub Issues и milestones, для Runtime — описание Draft PR #98. Статусов, HEAD и CI здесь нет: «сделано» = issue закрыт. Проверено: 2026-09-23, commit 77891b3c.

## Цели

| Трек | Цель | Где истина |
|---|---|---|
| Runtime | переход к общему рантайму живого мира: сначала M2c «Процедурная материализация мест», затем M3–M8 | [PR #98](https://github.com/PavelSlaven/Novgorod1230/pull/98), milestone [Runtime M3–M8](https://github.com/PavelSlaven/Novgorod1230/milestone/2); текущий этап подтверждает владелец |
| Backlog | снять временные оговорки роутера и индекса, затем техдолг по LW | issues без milestone, label `P2` раньше `P3` |

Трек Docs (DOC-01…03, #99–#101) завершён: milestone «Docs & agent context 2026-09» закрыт.

## Задачи по порядку

### Runtime

Этапы по порядку — [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133) **M2c** (текущий; по решению владельца 2026-09-23 выполняется до M3), [#105](https://github.com/PavelSlaven/Novgorod1230/issues/105) M3, [#106](https://github.com/PavelSlaven/Novgorod1230/issues/106) M4, [#107](https://github.com/PavelSlaven/Novgorod1230/issues/107) M5, [#108](https://github.com/PavelSlaven/Novgorod1230/issues/108) M6, [#109](https://github.com/PavelSlaven/Novgorod1230/issues/109) M7, [#110](https://github.com/PavelSlaven/Novgorod1230/issues/110) M8. Единица работы и порядок — в плане:
[Novgorod1230_Runtime_Plan.md в ветке PR #98](https://github.com/PavelSlaven/Novgorod1230/blob/codex/live-world-runtime/docs/plans/Novgorod1230_Runtime_Plan.md).

Задание владельца к M2c — [Novgorod1230_Procedural_Materialization_Task.md](https://github.com/PavelSlaven/Novgorod1230/blob/codex/live-world-runtime/docs/plans/Novgorod1230_Procedural_Materialization_Task.md). Приоритетные разделы плана: §1 (начало исполнения и источники), §4 (общий критерий готовности), §5.1–5.3 (уровни готовности, тяжесть дефектов, проверки), текущий этап в §6 (M2c), §9 (решения владельца), §7 (порядок, статус, вердикты). План сам требует читать его целиком «для контекста» (§7.3, ~187 КБ); сокращение этого требования — решение владельца в задаче PR #98.

### Backlog — сначала

1. [#111](https://github.com/PavelSlaven/Novgorod1230/issues/111) — нормы из CONTRACT_INDEX §6/§10 к владельцам (снимает особый случай в правиле чтения индекса).
2. [#113](https://github.com/PavelSlaven/Novgorod1230/issues/113) — архив `.github/Правило вызова агента-критика.txt`.
3. [#115](https://github.com/PavelSlaven/Novgorod1230/issues/115) — решение владельца по KSP L39 (`decision:owner`).

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
