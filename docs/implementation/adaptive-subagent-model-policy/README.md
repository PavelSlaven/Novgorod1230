# Adaptive subagent model policy

## Цель

Добавить единые правила адаптивного выбора модели и reasoning для субагентов, а также синхронизировать их между `AGENTS.md` и `.github/AGENTS.md`.

## Readiness

- Repository root: `C:\Users\Slaven\Documents\Novgorod-adaptive-subagent-model-policy`
- Branch: `codex/adaptive-subagent-model-policy`
- Base and HEAD: `00fa551b4961de1bfca0a72679681cca7ffe5ba4`
- Remote: `origin` → `https://github.com/PavelSlaven/Novgorod1230.git`
- Node.js `v24.16.0`, npm `11.13.0`, Python `3.13.3`, uv `0.8.12`, Docker `29.5.3`, Docker Compose `v5.1.4`, Graphify `0.9.17`.
- `npm ci` completed successfully. The repository graph was rebuilt because this clean worktree had no graph artifact.

## Repository Intelligence

Information need: rules for delegating subagents and selecting model/reasoning effort.

- RAG query: `Правила AGENTS.md: делегирование субагентов, выбор модели и уровня reasoning`.
- Repository graph query: `AGENTS.md delegation to subagents and model reasoning selection`.
- Normative documents read: `AGENTS.md`, `.github/AGENTS.md`, `development_rules.txt`, `code_critic_invocation_rule.txt`, `code_driven_world_materialization_architecture.md`, and `llm_documentation_navigation.md`.
- Relevant modules: repository documentation and Codex local configuration only; no runtime contracts, database, or game data are changed.

## Scope and checks

- Edit `AGENTS.md` and `.github/AGENTS.md` with semantically aligned policy.
- Edit the user-local `C:\Users\Slaven\.codex\config.toml`; it is intentionally outside this PR.
- Completed: strict TOML parse and exact-value assertions, `npm run docs:check`, `graphify update .`, `npm run repo-intel:status`, `git diff --check`.
- Result: documentation/generated data check passed; Repository Intelligence and Graphify are `ready`; the knowledge source remains `degraded` only because of its pre-existing semantic coverage gaps.
