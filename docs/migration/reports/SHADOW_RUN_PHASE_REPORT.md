# Отчёт фазы: shadow run и структурное сравнение

Дата: 2026-07-12  
Релиз: `0.20.0-migration.20`  
Исходный релиз: `0.19.0-migration.19`

## Выполнено

- Создан автономный tool package `@rus/shadow-run`.
- Зафиксирован versioned corpus `rus.shadow_corpus.v1` из approved golden fixtures и compatibility routes релиза.
- Корпус разбит на 25 parity/isolation/rollback cases.
- Покрыты все 12 нормативных категорий сравнения.
- Добавлен turn shadow case: одинаковый player intent проходит legacy и modular runtime; сравниваются normalized structural observations.
- Художественная проза исключена из byte-level comparison, но semantic audit, `no_new_world_facts`, references и hidden-boundary остаются обязательными.
- Добавлен rollback gate для legacy default, парных modular flags и fail-closed production composition.
- Отчёт сохраняется как JSON `rus.shadow_run_report.v1` и Markdown.
- Architecture gate запрещает shadow tool импортировать runtime packages, PostgreSQL, legacy/apps и shell execution.

## Shadow run result

- Cases: 25/25 passed.
- Tests inside corpus: 114/114 passed.
- Blocking differences: 0.
- Non-blocking differences: 0.
- Required categories: 12/12 covered.
- Rollback case: passed.
- Recommendation: `go_to_staged_cutover`.

Полный evidence находится в:

- `artifacts/2026-07-12/shadow-run-0.20.0/shadow-run-report.json`;
- `artifacts/2026-07-12/shadow-run-0.20.0/shadow-run-report.md`.

## Scope and limitations

Это воспроизводимый release-contained shadow corpus. Live production provider calls и записи в production DB намеренно не выполнялись: semantic LLM outputs представлены заранее утверждёнными fixtures, а DB behavior проверяется integration/transaction tests. Это соответствует test policy нормативного плана и не является production cutover.

## Решение

Shadow gate пройден. Разрешён переход к следующей фазе — staged cutover с сохранением rollback flags. Legacy entrypoint остаётся default до отдельного cutover release; автоматическое удаление legacy запрещено.
