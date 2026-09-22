# Current sprint

> **Производная выжимка.** Истина — GitHub Issues и milestone, для Runtime — описание Draft PR #98. Статусов, HEAD и CI здесь нет: «сделано» = issue закрыт. Проверено: 2026-09-22, commit c5501419.

## Цели

| Трек | Цель | Где истина |
|---|---|---|
| Runtime | переход к общему рантайму живого мира, этапы M0–M8 | [PR #98](https://github.com/PavelSlaven/Novgorod1230/pull/98); текущий этап подтверждает владелец |
| Docs | минимальный достаточный контекст для агентов: карты, процедуры, роутер AGENTS.md | milestone [Docs & agent context 2026-09](https://github.com/PavelSlaven/Novgorod1230/milestone/1) |

## Задачи по порядку

### Docs

Три последовательных PR без stack: следующий начинается от нового `main` после merge предыдущего.

1. [DOC-01 #99](https://github.com/PavelSlaven/Novgorod1230/issues/99) — `docs/context/*`, `docs/process/*`, этот файл, реестр legacy warnings, skills, issue/PR-шаблоны.
2. [DOC-02 #100](https://github.com/PavelSlaven/Novgorod1230/issues/100) — AGENTS.md как роутер + `docs/governance/*`. Требует явного разрешения администратора по AGENTS.md §1.1 в начале задачи.
3. [DOC-03 #101](https://github.com/PavelSlaven/Novgorod1230/issues/101) — архив конфликтующих инструкций, новый README.

### Runtime

Отдельных RT-issues пока нет; единица работы и порядок — в плане:
[Novgorod1230_Runtime_Plan.md в ветке PR #98](https://github.com/PavelSlaven/Novgorod1230/blob/codex/live-world-runtime/docs/plans/Novgorod1230_Runtime_Plan.md).

Приоритетные разделы плана: §1 (начало исполнения и источники), §4 (общий критерий готовности), §5.1–5.3 (уровни готовности, тяжесть дефектов, проверки), текущий этап в §6 (M0…M8), §7 (порядок, статус, вердикты). План сам требует читать его целиком «для контекста» (§7.3, ~187 КБ); сокращение этого требования — решение владельца в задаче PR #98.

## Живой статус

```powershell
gh issue list --milestone "Docs & agent context 2026-09" --state all
gh pr view 98 --json title,isDraft,headRefOid,statusCheckRollup
gh pr list --state open
```

## Правило остановки

- Одна задача = одна сессия; следующая берётся по [WORKFLOW.md](../process/WORKFLOW.md), раздел «Взять следующую задачу».
- Следующий Runtime-этап не начинается без решения владельца (Runtime_Plan §7.4).
- Если задача требует решения владельца (права на AGENTS.md, статус документа, LW, помеченный «решение владельца»), — остановиться и спросить.
