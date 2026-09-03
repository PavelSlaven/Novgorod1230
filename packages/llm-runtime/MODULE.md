# @rus/llm-runtime

## Назначение

Единый transport/configuration слой LLM-вызовов по именованным ролям и tier-настройкам.

## Владеет

- role descriptors и tier-конфигурацией;
- разрешением model/thinking/token/JSON-mode параметров;
- единым вызовом chat-completion transport;
- redacted telemetry `onCall` с provider/model/role/duration/status/error category/config hash и usage, без prompt, key или Authorization;
- scoped client adapter для composition root.
- отдельной JSON-role `portrait_spec_normalizer` в scope `portrait_lab` с настраиваемой моделью.

Production `turn_runtime` использует Flash-first роли без heavy reasoning. Каждый primary и repair вызов получает `maxTokens = 20_000` и transport timeout 120 с; желаемую длину ограничивают prompt/schema, а не тесный output limit. Общего gameplay turn deadline нет. Custom OpenAI-compatible provider остаётся single-model configuration: transport не подбирает fallback model или provider.

`world_knowledge_query_planner` — малая JSON-role для выбора только domains/refs/predicates/search hints. Она не определяет факты или gameplay outcome; request/response валидирует `@rus/world-knowledge`.

Gameplay narration uses `turn_runtime` roles `gameplay_narrator`, `gameplay_narrator_format_repair`, `gameplay_narrator_auditor` and `gameplay_narrator_semantic_repair`; all are Flash JSON roles. Auditor returns `narration_audit`; semantic repair returns `narration_semantic_repair`. No fallback, Pro/router/senior role is configured.

## Не делает

- не пишет prompts доменных этапов;
- не валидирует смысловой результат этапа;
- не обращается к party/world БД;
- не выбирает игровые последствия.

## Публичный API

`executeRoleLlmCall`, `createScopedChatCompletionClient`, `resolveLlmExecutionConfig` и role registries `turn_runtime`/`portrait_lab`. Первые три принимают optional `runtimeProviderOverride` (`compatibility`, `baseUrl`/`requestUrl`, `model`, optional `apiKey`/`requestTimeoutMs`): `openai_compatible` нормализуется к одному `chat/completions` URL, а DeepSeek остаётся default. Combat добавляет planner/repair roles для `npc_combat_intent_plan_v1` и deterministic `combat_weapon_classification` для bounded `rus.combat.action_produced_weapon_classification.v1` без repair-loop.

Portrait Lab использует одну role без repair/fallback chain; смысловой результат валидирует authoritative `portrait_spec_v1` owner вне transport слоя.

## Контракты

Получает role descriptor, request payload и явно переданный provider client. Возвращает provider response без доменной подмены или deterministic fallback.

## Допустимые зависимости

`@rus/contracts` и стандартная библиотека Node.js.

## Запрещённые зависимости

Domain modules, apps, legacy runtime, БД и UI.

## Инварианты

Provider/model настройки выбираются только через role config; transport не сочиняет отсутствующий смысловой ответ и не создаёт fallback chain. Gameplay timeout — это роль/turn policy внешнего runtime owner, не общий 120-секундный transport safeguard.

## Ошибки

Ошибки конфигурации роли, provider transport и нарушения response contract.

## Тесты

Foundation tests и production provider integration suite.

## Eval

Frozen player-safe role corpus: `data/model-evals/llm-runtime/frozen-role-requests-v1.json`.
Runner вызывает тот же `executeRoleLlmCall`; CLI требует `LLM_EVAL_MODE=default` для project-default DeepSeek config либо `LLM_EVAL_MODE=custom` с обеими `LLM_EVAL_BASE_URL` и `LLM_EVAL_MODEL`. Eval не запускается сам и не делает implicit network call. Для exported role validators runner вызывает owner-native validator; S1 остаётся boundary-owned без public validator, а world-process использует public `validateWorldProcessStepPlan` из `@rus/turn`.

## Совместимость

Имена ролей и их публичные descriptors изменяются только версионированно.
