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

Production `turn_runtime` по умолчанию использует Flash-first роли без heavy reasoning: primary — `deepseek-v4-flash` с выключенным thinking и timeout 10 с, structural repair — тот же Flash с timeout 6 с. Runtime per-call override может только ужесточить эти игровые лимиты в composition owner; он не расширяет их. Transport fallback 120 с относится только к non-gameplay scope, включая admin и eval, а не к gameplay deadline. Custom OpenAI-compatible provider остаётся single-model configuration: transport не подбирает fallback model или provider.

Gameplay narration uses `turn_runtime` roles `gameplay_narrator` and `gameplay_narrator_format_repair`; both are Flash JSON roles. No narration auditor role is used in production turn flow.

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
