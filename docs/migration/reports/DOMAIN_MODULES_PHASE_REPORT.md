# Отчёт фазы: доменные модули

Дата: 2026-07-12  
Релиз: `0.13.0-migration.13`

## Выполнено

- Созданы десять доменных пакетов, предусмотренных нормативным планом.
- Для каждого пакета добавлены `MODULE.md`, package manifest, минимальный public API и независимый unit test.
- Перенесены чистые структурные инварианты и утверждённые формулы без DB/LLM/UI зависимостей.
- Добавлена единая ownership map, исключающая дублирование формул и сущностей.
- `@rus/checks-rng` использует injected `RandomSource`; скрытая случайность запрещена.
- `@rus/visibility-knowledge-memory` оформлен как security boundary и удаляет hidden fields до narration/UI.
- Добавлен parity suite по проверкам, времени пути, нагрузке, бою, распознаванию предмета и visible boundary.
- Architecture checker расширен проверкой всех domain packages, forbidden imports, циклов, budgets и canonical formula ownership.

## Проверки

- `npm run test:modules`: 212/212;
- `npm run test:domain`: 10/10;
- полный `npm test`: 222/222;
- architecture boundaries: passed;
- release hygiene: passed.

## Архитектурные гарантии

- Domain не импортирует legacy, apps, UI, server, provider SDK или DB adapters.
- Каждый пакет зависит только от публичного API `@rus/kernel` либо Node built-ins.
- Пакеты не создают факты мира и не подменяют semantic reasoning.
- Проверки и формулы применяются только к явно переданным утверждённым данным.
- Циклические зависимости отсутствуют.

## Ограничения

Фаза не переносит production turn workflow и не выполняет DB/browser интеграцию. Следующая последовательная фаза — единый `@rus/turn` workflow, который использует доменные пакеты через их публичные интерфейсы.
