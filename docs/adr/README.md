# Индекс архитектурных решений

Этот каталог хранит архитектурные решения и их обоснования. Поле `Status` в существующих ADR — часть исторической записи, а не нормативная шкала и не подтверждение текущего production-поведения. Нормативный статус и precedence документов определяет [CONTRACT_INDEX §2](../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md#2-статусы); применимость решения сверяйте с ним, active contracts, bindings, кодом и тестами.

## Решения

| Файл | Тема |
|---|---|
| [ADR-001](ADR-001-materialization-v3-spatial-g0-g6.md) | Materialization v3 и Spatial G0–G6 |
| [ADR-002](ADR-002-temporal-world-v4.md) | Temporal World v4: точное игровое время и границы ответственности |
| [ADR-003](ADR-003-temporal-npc-runtime-owner.md) | Владелец runtime для temporal NPC |
| [ADR-004](ADR-004-temporal-place-access-owner.md) | Владелец temporal place и access |
| [ADR-005](ADR-005-temporal-environment-owner.md) | Владелец temporal environment |
| [ADR-006](ADR-006-temporal-world-process-owner.md) | Владелец temporal world processes |
| [ADR-007](ADR-007-pr8-handoff-contract-amendment.md) | Поправка к контрактам handoff для PR8 |
| [ADR-008](ADR-008-first-playable-activity-and-materialization-amendment.md) | Поправка о first-playable activity и materialization |

## Шаблон

Скопируйте шаблон в новый файл `ADR-NNN-short-name.md` и заполните разделы. Не добавляйте поле `Status`: ADR фиксирует решение, контекст и последствия, но не определяет нормативный статус или текущее production-поведение.

```markdown
# ADR-NNN: Краткое название решения

- Date: YYYY-MM-DD
- Decision scope: область, к которой относится решение
- Decision owner: владелец решения или ответственность, от имени которой оно принято

## Context

Какой вопрос требует решения и какие ограничения важны?

## Decision

Какое решение принято и почему?

## Consequences

- Последствия, ограничения или компромиссы.

## Validation

- Как проверено решение, ссылки на результаты и известные ограничения.

## Supersession

- Предыдущее или заменяющее решение, если есть.

## References

- CONTRACT_INDEX и применимые контракты, bindings, планы, тесты или реализация.
```
