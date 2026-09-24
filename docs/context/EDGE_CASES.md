# Граничные случаи и ошибки

> status: REFERENCE / DOMAIN GUIDE; при конфликте действует governing-корпус (AGENTS.md) или профильный контракт. Проверено: 2026-09-22, commit c5501419.

Это карта: какие сбои бывают, кто их обрабатывает и где их коды. Нормы здесь не повторяются — они в
[AGENTS.md](../../AGENTS.md) (указаны §) и в профильных контрактах ([CONTRACT_INDEX](../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md)).
Если утверждение ниже расходится с кодом, прав код; расхождение нужно сообщить.

## 1. Принцип: fail-closed без тихого fallback

- Нет обязательных данных, pin'ов или контракта — операция завершается **типизированной ошибкой**. Она не
  подставляет значение по умолчанию и не делает повторный semantic call. Нормы: AGENTS §10.1, §21, §22
  (запрет маскировать дефект catch-all, silent ignore, безусловным fallback и ослаблением фильтра).
- Пример владельца: [temporal-advance.md](../../docs/pipelines/temporal-advance.md), раздел «Fail-closed data
  readiness and replay».
- Transport LLM не создаёт fallback model/provider и не сочиняет ответ —
  [packages/llm-runtime/MODULE.md](../../packages/llm-runtime/MODULE.md).
- Party ports при недоступности отказывают без v2 fallback —
  [packages/party-store/MODULE.md](../../packages/party-store/MODULE.md).

## 2. Классы ошибок

| Класс | Файл | Поля | Где используется |
|---|---|---|---|
| `Result` (`ok`/`err`), `KernelError` | [result.js](../../packages/kernel/src/result.js) | `ok`, `value` / `error.{code,message,details}` | чистая доменная логика: ошибка — значение, а не throw; `unwrap` превращает её в `KernelError` |
| `TurnWorkflowError` (`turnFailure`) | [errors.js](../../packages/turn/src/errors.js) | `code` (по умолчанию `TURN_WORKFLOW_ERROR`), `details` | `@rus/turn` |
| `KnowledgeSourceError` | [errors.js](../../packages/knowledge-source/src/errors.js) | `code`, `details` (копия) | `@rus/knowledge-source` |
| `GameServerError` (`serverError`) | [errors.js](../../apps/game-server/src/errors.js) | `code`, `status` (по умолчанию 500), `details`, `public_exposure` (`player`/`internal`) | HTTP и runtime сервера |
| `GameWebError` (`webError`) | [errors.js](../../apps/game-web/src/shared/errors.js) | `code`, `details` | браузер |

В инфраструктуре PostgreSQL часто используют простой `Error` с полем `code` (например `repositoryError` в
[party-store.js](../../apps/game-server/src/infrastructure/postgres/party-store.js)). У такой ошибки нет
`status`, поэтому в HTTP она становится 500 (§4).

## 3. Реестр typed errors (spatial/temporal)

[typed-error-specifications.json](../../packages/contracts/src/spatial-v3/typed-error-specifications.json) —
82 записи `{error_code, meaning, required_reaction[, retryability]}`, `source_version` `4.5.0-target.1`.
Файл **generated**: его собирает [generate-typed-error-specifications.mjs](../../tools/spatial-v3/generate-typed-error-specifications.mjs)
из приложения C [spatial_architecture_standard_g0_g6.md](../../data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md)
и приложения B [temporal_world_and_interruptible_activities.md](../../data/knowledge-source/corpus/DOCUMENTS/temporal_world_and_interruptible_activities.md).
JSON руками не правят: меняют источник, затем запускают генератор. Реакцию на ошибку смотрят в поле
`required_reaction`; здесь реестр не копируется.

## 4. HTTP-коды game-server

Конверт ошибки строит `errorEnvelope` в [contracts.js](../../apps/game-server/src/http/contracts.js):
`rus_api_error v1` с полями `{version, schema, ok:false, request_id, error:{code, message[, turn_commit_status]}}`.
Статус берётся из `error.status`, а если его нет — 500.

| Статус | Когда | Примеры `code` |
|---|---|---|
| 400 | невалидный запрос | `JSON_INVALID`, `REQUEST_BODY_INVALID`, `NEW_GAME_START_REQUIRED` |
| 404 | нет маршрута или отчёта | `ROUTE_NOT_FOUND`, `LLM_TURN_REPORT_NOT_FOUND` |
| 409 | конфликт состояния, idempotency или commit | `TRACE_PHASE_2_IDEMPOTENCY_CONFLICT`, `TRACE_PHASE_2_COMMIT_FAILED` |
| 413 | тело слишком большое ([json.js](../../apps/game-server/src/http/json.js)) | `REQUEST_TOO_LARGE` |
| 422 | квалификация custom-модели не пройдена | `llm-settings.js`, `ordinary-materialization-stage-b-qualification.js` |
| 502 | Portrait Lab: normalizer вернул ошибку или невалидный результат | `portrait-lab/normalizer.js` |
| 503 | сбой LLM provider (§5), недоступен normalizer | `LLM_PROVIDER_*`, `PORTRAIT_NORMALIZER_UNAVAILABLE` |
| 500 | всё без `status` | публично: `TEMPORARY_ACTION_UNAVAILABLE` |

Маскирование: при статусе ≥500, при `public_exposure: 'internal'` и для `TURN_ORDINARY_DISCOVERY_UNRESOLVED`
(отдаётся как 409) игрок видит только `TEMPORARY_ACTION_UNAVAILABLE` и общий текст. Сервер логирует такие
ошибки ([handler.js](../../apps/game-server/src/http/handler.js)). Карта маршрутов —
[GAME_SERVER_WEB_CONTRACT_MAP.md](../../docs/migration/contracts/GAME_SERVER_WEB_CONTRACT_MAP.md). ⚠ В ней
перечислено 5 маршрутов; в `handler.js` их больше (`/scenarios`, `/llm-settings*`, `/portrait-spec`,
`/turns/:requestId/progress`, `/presentation-recovery`, developer-отчёт).

## 5. Сбои и таймауты LLM

- **Лимиты.** Верхняя граница одного вызова — 120 с (`LLM_REQUEST_TIMEOUT_MS`,
  [provider-request.js](../../packages/llm-runtime/src/provider-request.js)). На весь ход отведено 360 с
  (`GAMEPLAY_TURN_DEADLINE_MS`), из них 5 с зарезервировано на commit
  ([llm-turn-budget.js](../../apps/game-server/src/runtime/llm-turn-budget.js)). `clamp()` отдаёт позднему
  вызову только оставшееся время. Когда время кончилось — `LLM_TURN_BUDGET_EXHAUSTED`. Тот же бюджет задаёт
  statement timeout для SQL ([query-with-turn-deadline.js](../../apps/game-server/src/infrastructure/postgres/query-with-turn-deadline.js)).
- **Provider failure** (`error.llm_provider_failure === true`) — 503 с одним из публичных кодов:
  `LLM_PROVIDER_TIMEOUT`, `_UNREACHABLE`, `_RESPONSE_INVALID`, `_NOT_CONFIGURED`, `_AUTH_FAILED`,
  `_MODEL_INVALID`, `_RATE_LIMITED`, `_UNAVAILABLE`. Текст всегда заканчивается «Ход не сохранён.»
  (`publicProviderFailure` в `contracts.js`).
- **Невалидный структурный ответ.** Допускается один structural repair (`claimRepair` не даёт повторить
  тот же вид repair в пределах хода). Если planner вернул пустой ответ, тот же вызов повторяется один раз с
  reasoning `low`. Смена модели при этом не допускается — [llm-runtime MODULE.md](../../packages/llm-runtime/MODULE.md),
  [turn MODULE.md](../../packages/turn/MODULE.md).
- Вызов модели делают вне физической DB-транзакции; перед commit данные перечитываются — AGENTS §14.
- ⚠ PR #98 меняет: provider по умолчанию для `play:local` (правка в `packages/llm-runtime/MODULE.md`).
  В документах ссылаться на владельца, а не на значение.

## 6. DB, CAS и idempotency

Нормы — AGENTS §14, §23. Как это устроено в коде:

- **State version / CAS.** `TURN_STATE_VERSION_STALE`: `base_state_version` не совпал или проигрыш гонки
  ([party-store-turn.js](../../apps/game-server/src/infrastructure/postgres/party-store-turn.js)). В реестре
  (§3) это `state_version_conflict`, реакция — «Re-resolve from fresh state».
- **Idempotency.** Тот же ключ с другим входом — конфликт, а не новый ход: `TURN_IDEMPOTENCY_CONFLICT`,
  `TRACE_PHASE_2_IDEMPOTENCY_CONFLICT` (409), в реестре `idempotency_conflict`. Тот же ключ, пока commit ещё
  идёт, — `TURN_IDEMPOTENCY_IN_PROGRESS`. Одновременные повторы в одном процессе объединяются в одну promise
  ([lower-dvina-trace-phase-2-turn-request.js](../../apps/game-server/src/runtime/lower-dvina-trace-phase-2-turn-request.js)).
  Долговременный replay возвращает сохранённый результат и не решает ход заново.
- **Атомарность.** Одно причинное событие — одна транзакция. Ошибка внутри неё — `ROLLBACK` (например
  `runSpatialV3TargetMigrations`). Схема и миграции — [DB_SCHEMA.md](DB_SCHEMA.md).
- Для retry новый fingerprint или digest не добавляют — AGENTS §17, §23.

## 7. Pending-turn (браузер ↔ сервер)

- Перед POST браузер сохраняет `{party_id, request}` (с `request_id` и `idempotency_key`) в `localStorage`
  под ключом `rus.pending_turn` ([pending-turn.js](../../apps/game-web/src/app/pending-turn.js)). Если
  хранилище недоступно — `TURN_RECOVERY_STORAGE_UNAVAILABLE`.
- Pending снимается при успехе, при `turn_commit_status: "not_started"` и при точной ошибке валидации HTTP.
  При сбое transport, неизвестной ошибке или сбое presentation ключ сохраняется, и retry/reload повторяют
  **тот же** запрос. Новая попытка — новый ключ, даже с тем же текстом
  ([GAME_SERVER_WEB_CONTRACT_MAP.md](../../docs/migration/contracts/GAME_SERVER_WEB_CONTRACT_MAP.md)).
- `turn_commit_status: "not_started"` ставится, только если отказ случился до входа в commit owner
  ([lower-dvina-trace-phase-2-workflow.js](../../apps/game-server/src/runtime/lower-dvina-trace-phase-2-workflow.js)).
  Ни HTTP-статус, ни общий код ошибки не доказывают, что commit не состоялся.
- Сбой presentation **после** commit (`LLM_TURN_BUDGET_EXHAUSTED`, `TURN_NARRATION_REJECTED`,
  `TRACE_PHASE_2_PRESENTATION_INVALID`, `TRACE_PHASE_2_NARRATION_*`) отдаёт уже закоммиченный публичный
  результат или pending replay. Ход повторно не применяется
  ([lower-dvina-trace-post-commit-failure.js](../../apps/game-server/src/runtime/lower-dvina-trace-post-commit-failure.js)).
  Досборка — `POST /parties/:id/presentation-recovery`.

## 8. Утечка hidden

- Норма — AGENTS §8, §13: narrator и игрок получают только разрешённую проекцию.
- Каждый успешный ответ проходит `assertPublicPayload` → `detectHiddenLeaks`
  ([public-boundary.js](../../apps/game-server/src/public-boundary.js),
  [visibility-knowledge-memory MODULE.md](../../packages/visibility-knowledge-memory/MODULE.md)). Найденная
  утечка — `PUBLIC_PAYLOAD_HIDDEN_LEAK` (500, публично `TEMPORARY_ACTION_UNAVAILABLE`). В реестре это
  `hidden_information_leak` — «Reject presentation package».
- Браузер принимает только `first_game_screen v1` / `turn_screen v1`, без hidden/private полей, prompts и
  provider payloads ([GAME_SERVER_WEB_CONTRACT_MAP.md](../../docs/migration/contracts/GAME_SERVER_WEB_CONTRACT_MAP.md)).

## 9. Пустое authoritative-множество → typed data gap

Норма — AGENTS §10.1: если обязательный authoritative candidate set пуст, возвращается типизированный data
gap/failure. Semantic fallback не придумывают, фильтр не ослабляют. Коды — в реестре §3: `spatial_candidate_gap`
(«Hard block; authoring repair»), `classification_gap`, `*_profile_gap`, `*_rule_gap`, `visible_package_persistence_gap`.
Лечится authoring/данными у владельца, а не кодом-обходом.

## 10. Невозможное действие — это попытка внутри мира

Норма — AGENTS §4, §9, §12.2. Физически или исторически невозможное намерение **не является ошибкой API**
и не отвечается «такой команды нет». Оно проходит обычный путь
`turn_step_request_v1 → turn_step_plan_v1` (`@rus/turn`, AGENTS §6). Результат — реалистичный failure,
partial, waste или нерабочая конструкция, и он коммитится как факт партии.

Не путать:

- ошибки из этого документа — сбой **системы** (данные, provider, конфликт, утечка), мир не меняется;
- неудачная попытка — нормальный **игровой** исход, мир меняется.

## 11. Требования к тестам

Нормы — AGENTS §24, §28.9. Для изменения обработки ошибок или граничного поведения:

- **негативный случай:** тест воспроизводит отказ и проверяет конкретный `code`/typed error, отсутствие
  частичного commit и отсутствие тихого fallback;
- **unseen-equivalent случай** (для свободного gameplay): разумный эквивалент, которого нет в fixtures,
  работает без нового enum/handler/allowlist;
- для bug fix — regression test на root cause (AGENTS §22);
- если меняется PostgreSQL persistence — настоящий PostgreSQL test, а не только mocks (AGENTS §24).
