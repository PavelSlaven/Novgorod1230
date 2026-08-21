# @rus/llm-runtime

## Назначение

Единый transport/configuration слой LLM-вызовов по именованным ролям и tier-настройкам.

## Владеет

- role descriptors и tier-конфигурацией;
- разрешением model/thinking/token/JSON-mode параметров;
- единым вызовом chat-completion transport;
- scoped client adapter для composition root.
- отдельной JSON-role `portrait_spec_normalizer` в scope `portrait_lab` с настраиваемой моделью.

## Не делает

- не пишет prompts доменных этапов;
- не валидирует смысловой результат этапа;
- не обращается к party/world БД;
- не выбирает игровые последствия.

## Публичный API

`executeRoleLlmCall`, `createScopedChatCompletionClient`, `resolveLlmExecutionConfig` и публичные role registries new-game. Combat добавляет planner/repair roles для `npc_combat_intent_plan_v1` и deterministic `combat_weapon_classification` для bounded `rus.combat.action_produced_weapon_classification.v1` без repair-loop.

Portrait Lab использует одну role без repair/fallback chain; смысловой результат валидирует authoritative `portrait_spec_v1` owner вне transport слоя.

## Контракты

Получает role descriptor, request payload и явно переданный provider client. Возвращает provider response без доменной подмены или deterministic fallback.

## Допустимые зависимости

`@rus/contracts` и стандартная библиотека Node.js.

## Запрещённые зависимости

Domain modules, apps, legacy runtime, БД и UI.

## Инварианты

Provider/model настройки выбираются только через role config; transport не сочиняет отсутствующий смысловой ответ.

## Ошибки

Ошибки конфигурации роли, provider transport и нарушения response contract.

## Тесты

Foundation tests и production provider integration suite.

## Совместимость

Имена ролей и их публичные descriptors изменяются только версионированно.
