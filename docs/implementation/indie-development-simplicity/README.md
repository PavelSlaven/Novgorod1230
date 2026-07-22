# Indie development simplicity policy

## Цель

Зафиксировать в правилах агентов статус проекта как инди-разработки и требование выбирать минимально сложное решение, если дополнительная сложность не закрывает конкретный подтверждённый риск.

## Readiness

- Repository root: `C:\Users\Slaven\Documents\Новгород-indie-agents-pr`.
- Branch: `codex/indie-development-simplicity`.
- Base and initial HEAD: `ddd5f24bac8162da8d98def44fabb4e975a1fac8`.
- Remote: `origin` → `https://github.com/PavelSlaven/Novgorod1230.git`.
- Node.js `v24.16.0`, npm `11.13.0`, Python `3.13.3`, uv `0.8.12`, Docker `29.5.3`, Docker Compose `v5.1.4`, Graphify `0.9.17`.
- `npm ci` выполнен успешно; зависимости установлены без найденных уязвимостей.
- Для задачи не требуются локальные services или databases.

## Repository Intelligence

Information need: куда добавить правила инди-разработки и необходимой простоты, сохранив согласованность `AGENTS.md` и `.github/AGENTS.md`.

- Unified query: `Куда в AGENTS.md добавить принципы инди-разработки, необходимой простоты и запрет избыточных процессов; как обеспечить согласованность с .github/AGENTS.md?`.
- RAG query: `Правила AGENTS.md: инди-разработка, необходимая простота, запрет избыточных процессов, согласованность корневого и .github файлов`.
- Graphify query: `agent rules documentation process workflow readme github critic`.
- Graphify nodes: `AGENT_RULES`, `workflow`, `rules`, `documentation.js`, `README.md`, `validateP27Critic()`.
- Полностью прочитаны: `AGENTS.md`, `.github/AGENTS.md`, `development_rules.txt`, `code_critic_invocation_rule.txt`, `code_driven_world_materialization_architecture.md`, `llm_documentation_navigation.md`.
- Knowledge source доступен со статусом `degraded` из-за существующих semantic coverage gaps; conflicts отсутствуют. Repository Graph готов и привязан к исходному HEAD.
- Затронуты только правила разработки и рабочая документация; runtime, contracts, schemas, базы и игровые данные не меняются.

## Scope and checks

- Синхронно обновить разделы необходимой простоты в `AGENTS.md` и `.github/AGENTS.md`.
- Проверить документацию, ссылки, отсутствие whitespace-ошибок и актуальность Repository Intelligence artifacts.
- Выполнить независимый аудит изменения требований до публикации PR.

Выполнено:

- Exact-policy assertion: требуемый текст присутствует ровно один раз в каждом `AGENTS.md`.
- `npm run docs:check`: PASS, generated documentation reproducible.
- `npm run test:docs`: PASS, 8/8 tests.
- `npm run knowledge:check`: PASS, 35 documents; graph and RAG current.
- `graphify update .`: PASS, repository graph обновлён; сохранены предупреждения о пропущенной HTML-визуализации для графа больше 5000 nodes, отсутствующем `tree_sitter_sql` и source files без извлечённых nodes.
- `npm run repo-intel:status`: Repository Intelligence и Graphify `ready`; knowledge source `degraded` из-за существующих semantic coverage gaps, без readiness errors.
- `git diff --check`: PASS.
- Независимый аудит: `PASS WITH NOTES`; содержательных конфликтов и нарушений scope не найдено, NOTE о неполной фиксации результатов закрыт этим evidence-обновлением.
