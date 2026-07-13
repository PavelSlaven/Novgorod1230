# Stage 25 — Party Commit

## Назначение

Stage 25 проверяет утверждённый Stage 24 write plan, проводит обязательный preflight и dry run, разрешает единственную атомарную транзакцию, читает фактическое состояние после commit и формирует approval для Stage 26.

## Делает

- проверяет Stage 24 approval и digest-цепочку;
- материализует физические цели через утверждённый schema adapter;
- проверяет schema, constraints, references и batch graph;
- требует idempotency check, dry run и rollback simulation;
- разрешает transaction только через commit gate;
- проверяет transaction result и postcommit readback;
- формирует публичную модель партии и handoff.

## Не делает

- не создаёт и не исправляет мировые сущности;
- не изменяет write plan;
- не выполняет SQL напрямую;
- не обращается к LLM/provider;
- не разрешает частичный commit;
- не показывает игроку результат до postcommit validation.

## Публичный API

Основной API: `@rus/new-game/stages/stage-25`.
Старый расширенный API доступен только через `@rus/new-game/stages/stage-25/compat`.

## Разрешённые зависимости

`@rus/contracts`, `@rus/kernel`, `@rus/pipeline-engine`, утверждённый adapter `@rus/party-store/stage-25`.

## Инварианты

Порядок исполнения фиксирован: input → preflight → idempotency → dry run → gate → transaction → postcommit readback → validation → approval.
