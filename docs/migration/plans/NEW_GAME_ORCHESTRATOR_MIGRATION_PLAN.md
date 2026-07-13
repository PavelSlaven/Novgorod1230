# План фазы: общий modular new-game orchestrator

Дата: 2026-07-12  
Целевой релиз: `0.12.0-migration.12`  
Исходный релиз: `0.11.0-migration.11`

## Цель

Собрать единый модульный управляющий слой для непрерывной цепочки new-game Stages 2–26, не возвращая смысловую логику в общий файл и не создавая новых фактов мира кодом.

Оркестратор отвечает только за порядок выполнения, передачу явно собранных входов, фиксацию утверждённых артефактов, checkpoints, resume и маршрутизацию repair. Содержимое мира остаётся ответственностью stage-local LLM-процедур и аудиторов.

## Работы

1. Сформировать неизменяемый stage plan с точным порядком Stages 2–26.
2. Сделать все stage definitions исполнимыми через единый контракт `execute({ input, context, services, registry })`.
3. Ввести изолированный orchestration context с outputs, results, gates, repair history, frozen artifacts и событиями прогресса.
4. Добавить явный механизм stage input builders. Оркестратор не достраивает отсутствующие смысловые поля и требует builder для каждого неавтономного входа.
5. Добавить checkpoint save/load и безопасное продолжение с первого незавершённого этапа.
6. Добавить repair routing к объявленному upstream stage с очисткой только downstream-состояния.
7. Ограничить количество repair cycles и общее число stage executions.
8. Добавить immutable artifact registry и SHA-256 digests утверждённых артефактов.
9. Экспортировать orchestration API из `@rus/new-game/orchestrator`, не меняя legacy production entrypoint.
10. Добавить unit/integration tests и architecture gates, запрещающие legacy, UI, server, DB-driver и provider dependencies внутри оркестратора.
11. Обновить документацию, manifest, changelog и release reports.

## Критерии приёмки

- stage plan содержит Stages 2–26 ровно один раз и строго по порядку;
- полная тестовая цепочка доходит до Stage 26;
- repair из downstream stage повторно запускает объявленный upstream участок;
- checkpoint resume не повторяет уже утверждённые этапы;
- orchestration context восстанавливает outputs и frozen artifacts без мутации;
- оркестратор не импортирует legacy и не содержит world-generation semantics;
- полный модульный suite и architecture checks проходят;
- release hygiene проходит;
- релизный архив не содержит `node_modules`, `.git`, временных файлов и секретов.

## Не входит в фазу

- переключение production entrypoint с legacy на modular;
- реальные provider calls;
- DB-backed полный happy path;
- production-corpus shadow run;
- browser E2E и cutover.
