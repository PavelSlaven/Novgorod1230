# llm-runtime-eval

## Назначение

Development-time harness for evaluating production LLM roles against the exact
game-server implementation used by runtime.

## Владеет

- running and recording isolated role evaluations;
- freezing exact production role messages for deterministic comparisons.

## Не делает

- it is not imported by gameplay runtime and does not own prompts, role policy,
  providers, or game state.

## Разрешённые зависимости

```architecture-tool-app-dependencies
[
  {"source":"src/runner.mjs","target":"apps/game-server","reason":"Evaluate production roles using the production implementation"},
  {"source":"src/frozen-role-messages.mjs","target":"apps/game-server","reason":"Freeze production role messages for offline evaluation"}
]
```

## Зависимости

- `apps/game-server` — exact production role implementations for evaluation.
- `@rus/llm-runtime` — shared production request contracts.

## Тесты

- `node --test tools/llm-runtime-eval/test/*.test.mjs`
