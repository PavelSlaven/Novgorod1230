<!-- GENERATED FILE. Run `npm run docs:generate`; do not edit manually. -->
# MODULE_INDEX

Release: `0.23.0-migration.24`

## Production modules

| Package | Path | Owns | Public entry | Direct dependencies |
|---|---|---|---|---|
| `@rus/actors` | `packages/actors` | actor identity and kind; biography fields; social and skill references | `./src/index.js` | `@rus/kernel` |
| `@rus/body-state` | `packages/body-state` | health, satiety and energy; active conditions; body-part state | `./src/index.js` | `@rus/kernel` |
| `@rus/checks-rng` | `packages/checks-rng` | difficulty bounds; attribute bonus formula; dice execution through injected RandomSource | `./src/index.js` | `@rus/kernel` |
| `@rus/combat-health` | `packages/combat-health` | combat request/result contracts; margin-to-quality and damage formulas; harm and injury packages | `./src/index.js` | `@rus/kernel` |
| `@rus/contracts` | `packages/contracts` | Schema names for approvals, handoffs, delivery, and public read models; Stable digest functions; Approval builders and binding validators | `./src/index.js` | `@rus/kernel` |
| `@rus/items-property` | `packages/items-property` | item and container contracts; ownership and holder relations; physical access | `./src/index.js` | `@rus/kernel` |
| `@rus/kernel` | `packages/kernel` | `Result`-подобным контрактом `ok`/`err` и `KernelError`; детерминированной сериализацией данных; вычислением технических digest | `./src/index.js` | — |
| `@rus/knowledge-source` | `packages/knowledge-source` | контрактом чтения документов по стабильному `document_id`; проверкой corpus manifest, SHA-256 и source locations; техническим полнотекстовым поиском без смыслового дополнения | `./src/index.js` | — |
| `@rus/llm-runtime` | `packages/llm-runtime` | role descriptors и tier-конфигурацией; разрешением model/thinking/token/JSON-mode параметров; единым вызовом chat-completion transport | `./src/index.js` | `@rus/contracts` |
| `@rus/materialization` | `packages/materialization` | versioned `mulberry32_v1` RandomSource и seed derivation; выбором из approved candidates и materialization trace; проекцией G5 из approved profile/layout/slot rules и NPC/items из нормализованных eligible candidates | `./src/index.js` | `@rus/contracts`, `@rus/kernel` |
| `@rus/movement-routes` | `packages/movement-routes` | route availability and requirements; travel cost formulas; traversal request/result shapes | `./src/index.js` | `@rus/kernel` |
| `@rus/narration` | `packages/narration` | versioned `narration_request`, `narration_output`, `narration_audit` и `narration_flow_result`; проверкой visible-only входа; bounded generation → audit → repair → senior audit | `./src/index.js` | `@rus/kernel`, `@rus/visibility-knowledge-memory` |
| `@rus/new-game` | `packages/new-game` | каталогом и публичными entrypoints Stages 2–26; stage-local precheck/validation/repair contracts; общим new-game orchestration order | `./src/index.js` | `@rus/contracts`, `@rus/items-property`, `@rus/kernel`, `@rus/materialization`, `@rus/party-store`, `@rus/pipeline-engine`, `@rus/world-catalog-workflow` |
| `@rus/party-store` | `packages/party-store` | party persistence contract; idempotency key и committed-result semantics; Stage 25 persistence port | `./src/index.js` | `@rus/kernel` |
| `@rus/pipeline-engine` | `packages/pipeline-engine` | декларативным порядком stage execution; gate-result contract; artifact registry | `./src/index.js` | `@rus/contracts`, `@rus/kernel` |
| `@rus/presentation` | `packages/presentation` | `FirstGameScreen` и `TurnScreen` version 1; Character, Inventory, People, Route, Map, Journal и Diagnostic panels; visible-only validation и leak rejection | `./src/index.js` | `@rus/contracts`, `@rus/kernel`, `@rus/visibility-knowledge-memory` |
| `@rus/repository-intelligence` | `packages/repository-intelligence` | операциями `build`, `status` и `query`; раздельным hybrid envelope с typed errors; локальным Graphify build manifest с версией и commit SHA | `./src/index.js` | `@rus/knowledge-source` |
| `@rus/social-law` | `packages/social-law` | social bindings and references; rights/restriction evaluation; authority and social-risk contracts | `./src/index.js` | `@rus/kernel` |
| `@rus/space-map` | `packages/space-map` | graph scale and node/edge contracts; position chain; current position and scene anchors | `./src/index.js` | `@rus/kernel` |
| `@rus/time-events-history` | `packages/time-events-history` | clock arithmetic; timer due checks; delayed event contracts | `./src/index.js` | `@rus/kernel` |
| `@rus/turn` | `packages/turn` | контрактом `PlayerTurnInput`; декларативным порядком блоков хода; orchestration context и run summary | `./src/index.js` | `@rus/checks-rng`, `@rus/kernel`, `@rus/materialization`, `@rus/narration`, `@rus/pipeline-engine`, `@rus/presentation`, `@rus/time-events-history`, `@rus/visibility-knowledge-memory` |
| `@rus/visibility-knowledge-memory` | `packages/visibility-knowledge-memory` | visible-context validation; hidden leak detection and stripping; knowledge and memory fact contracts | `./src/index.js` | `@rus/kernel` |
| `@rus/world-base` | `packages/world-base` | контрактом `WorldBaseReader`; запретом mutating SQL; передачей query и params в injected read-only adapter | `./src/index.js` | — |

## Applications

| Application | Path | Purpose |
|---|---|---|
| `@rus/game-server` | `apps/game-server` | Composition root, production infrastructure adapters и HTTP boundary модульной игры. Пакет связывает публичные APIs, но не содержит игровых правил. |
| `@rus/game-web` | `apps/game-web` | Browser-клиент, который получает только versioned public read models от `@rus/game-server` и отображает их без вычисления игровых последствий. |

## Tools

| Tool | Path | Purpose |
|---|---|---|
| `@rus/audit-tools` | `tools/audit-tools` | Безопасная инвентаризация release/audit trees и проверка запрещённых путей. Пакет создаёт manifests, но не помещает ZIP или `dist` внутрь source tree. |
| `@rus/cutover` | `tools/cutover` | Автономный migration-tool для управляемого 13-шагового переключения с legacy route на modular runtime. Инструмент применяет только versioned feature-flag profiles, запускает обязательные gates и выпускает доказуемый cutover report. |
| `@rus/db-tools` | `tools/db-tools` | Автономные контракты и проверки для export/import/seed/audit операций БД. Инструмент не является runtime adapter и не выполняет SQL сам. |
| `@rus/docs-tools` | `tools/docs-tools` | Автономные инструменты проверки document graph/RAG и воспроизводимой генерации канонической документации. |
| `@rus/finalization` | `tools/finalization` | Автономный migration-tool для доказуемой финализации модульной миграции после staged cutover. Он проверяет release evidence, фиксирует автоматические gates и отделяет их от действий, которые может подтвердить только оператор или владелец проекта. |
| `@rus/map-maker` | `tools/map-maker` | Автономный редакторский инструмент для импорта, проверки, раскладки и экспорта игровых графов G0-G5. Инструмент не участвует в new-game/turn runtime и не изменяет каноническую БД. |
| `@rus/shadow-run` | `tools/shadow-run` | Автономный migration-tool для двойного запуска утверждённого corpus старого и модульного маршрутов. Инструмент исполняет только явно зарегистрированные parity/isolation tests, агрегирует структурные категории сравнения и выпускает machine-readable и Markdown отчёты. |
| `@rus/world-catalog-workflow` | `tools/world-catalog-workflow` | Автономный редакторский инструмент для регистрации ревизий региональной карты, структурной проверки G1-маски, построения координатной очереди, проверки G1-пакетов и fail-closed проверки authoring-каталогов materialization. Он не является game runtime, не создаёт исторические факты и не изменяет `world_base` без явно переданного transaction adapter. |

Canonical ownership details are defined by each `MODULE.md`; domain ownership is summarized in `docs/domain/OWNERSHIP_MAP.md`.
