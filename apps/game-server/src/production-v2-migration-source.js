// Production v2 is not a runtime-selectable composition after the spatial-v3
// cutover. These exports exist only for explicit migration/rollback tooling.
export {
  createPostgresPools,
  probePostgresPool
} from './infrastructure/postgres/pools.js';
export { runPartyRuntimeMigrations } from './infrastructure/postgres/migrations.js';
export {
  createPostgresSessionStore,
  createPostgresDeliveryStore
} from './infrastructure/postgres/session-store.js';
export { createPostgresPartyStore } from './infrastructure/postgres/party-store.js';
export { createPostgresWorldBaseReader } from './infrastructure/postgres/world-base.js';
export { createPostgresStage25Ports } from './infrastructure/postgres/stage25.js';
export {
  createRuntimeCatalogCoordinator,
  RuntimeCatalogBoundaryError
} from './runtime/runtime-catalog.js';
export {
  createProductionLlmRoleRunner,
  probeLlmProvider
} from './infrastructure/provider/deepseek.js';
