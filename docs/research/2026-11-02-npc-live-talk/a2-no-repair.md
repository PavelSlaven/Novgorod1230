# A2: почему TURN_STEP_PLAN_INVALID не пошёл в ремонт

Код: C:\Users\Slaven\Documents\Novgorod-tasks\npc-talk\wt (только чтение, HEAD bb2ed34b8 по брифу). Пути относительно wt.

## 1. Какая проверка отвергла ответ

Цепочка: tools/cataclysm-prototype/p3-live-coordinator.mjs:106 -> p3-boundary.js:776 runTurnStepLoop -> packages/turn/src/turn-step-loop.js:123-128 -> turn-step-plan-repair.js:17-19 -> turn-step-contracts/model.js:19-24 (validateTurnStepPlan, throw).

Ответ собирается в phase-2-llm.js:186 и lower-dvina-trace-turn-step-plan-assembly.js:45-47: interpretation не синтезируется. validateInterpretation (plan-validator.js:46, :179) -> validation.js:109-111, код `type`, «must be an object», путь $.interpretation. Структурная ошибка. Текст из лога не доказан: координатор пишет только code и calls (p3-live-coordinator.mjs:170).

## 2. Кто вызывает с repairContext и почему ремонта не было

Вызов: turn-step-plan-repair.js:75-79 (repairContext), :86 turnStepModel(..., repairContext) -> phase-2-llm.js:57 planTurnStep, роль turn_step_planner_repair (:84-86).

Ремонт возможен при TURN_STEP_PLAN_INVALID (:27-28) и allowRepair !== false (:29; в P3 true). Семантический валидатор (:46-66) на P3 не задан: turn-step-loop.js:123-128 берёт ports.semanticPlanValidator, p3-boundary.js:776-779 его не передаёт.

Условие пропуска: turn-step-plan-repair.js:67-74. Если ни одна ошибка не входит в requiresSemanticRepair (:138-141; SEMANTIC_REPAIR_CODES :125-136), throw сразу с repair_suppressed='deterministic_structure_invalid'. $.interpretation/type в списке нет, роль не вызвана; calls=1 согласуется.

Конфликт определений: docs/context/EDGE_CASES.md:81-82 и data/knowledge-source/corpus/DOCUMENTS/llm_agent_prompt_templates.md:196 обещают один ремонт структурно невалидного ответа. Код и тесты (lower-dvina-trace-turn-step-llm-repair-speech.test.js:262-268; tools/llm-runtime-eval/test/runner.test.mjs:289, :501) делают иначе. Нужно решение владельца.

Production-путь подключает семантическую проверку: turn-step-admission.js:288-313 (semanticPlanValidator: preflightDomainPlan). На P3 её нет.

## 3. Ограничения вызовов и ремонтов

- Turn-бюджет P3: turnCallBudget=7 (p3-dev-config.json:2; p3-live-coordinator.mjs:60-61, сброс :104; проверка p3-boundary.js:66-72). Счёт 1 из 7.
- Глобальный P3_ATTEMPT_BUDGET=72 (p3-boundary.js:28): не сработал.
- llm-turn-budget.js claimRepair (:32-45) вызывается только при turnBudget (llm-role-runner.js:28-31). P3 провайдер создаётся без него (p3-boundary.js:526-527; deepseek.js:3-7).
- Ретрай invalid_response (phase-2-llm.js:157-164): не сработал, ответ ok.

Вывод: ни один бюджет не блокировал. Причина: пункт 2, deterministic_structure_invalid.

## Не доказано

- Полный список ошибок: нет лога с details.errors; проверена только $.interpretation.
- Наличие choice domain_operation_12_emit_interaction_speech_variant (p3-boundary.js:824) не проверено. Если его нет, ошибка $.operations/resolution тоже структурная; вывод не меняется.
- Тесты и скрипты не запускались.
