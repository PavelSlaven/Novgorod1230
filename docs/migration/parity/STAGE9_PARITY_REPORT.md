# Stage 9 parity report

Дата: 2026-07-12  
Релиз: `0.11.0-migration.11`

Baseline: `test/fixtures/stage9-12-baseline/stage9-start-node-selection-0.10.1-recovery.js`.

Проверено: candidate-bound selection, policy normalization, input gate, managed repair result and export surface. Все именованные exports совпадают с доступным recovery-baseline. Исполнение намеренно усилено новым высшим нормативом: свободный LLM output заменён подписанным bounded protocol, а `selected_start_node` строит код. Legacy `src` и `dist/release` используют только modular compatibility entry.

Результат: passed.
