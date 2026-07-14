# Visible-context pipeline report

Релиз: `0.7.0-migration.7`

## Граница

```text
approved Stages 3–19 artifacts
→ Stage 20 visible projection
→ canonical package digest
→ Stage 21 independent audit
→ VisibleContextAuditApproval
→ Stage 22 narrator input
```

Stage 20 создаёт только видимую проекцию из утверждённых входов. Stage 21 не доверяет Stage 20 precheck и независимо повторяет structural, reference и hidden-boundary проверки. Stage 22 получает пакет только после Stage 21 approval.

## Владение

- `@rus/contracts`: schema names, enums, digest and approval.
- `@rus/llm-runtime`: role names, tier mapping and execution descriptors.
- `packages/new-game/src/visible-context`: neutral reference/filter/precheck logic.
- Stage 20: projection, validation and repair lifecycle.
- Stage 21: independent audit, senior escalation and repair routing.

## Гарантии

- hidden state не передаётся narrator;
- Stage 21 не импортирует Stage 20 implementation;
- package digest связывает audit с точным Stage 20 artifact;
- failed audit не даёт narrator/write permissions;
- semantic repair выполняется LLM role, а код только валидирует и маршрутизирует;
- compatibility facade сохраняет legacy pipeline до общего cutover.

## Проверка

- combined phase tests: 26 passed, 0 failed;
- full module suite: 130 passed, 0 failed;
- architecture checks: passed;
- legacy suite: baseline 256 passed, 5 pre-existing failed.
