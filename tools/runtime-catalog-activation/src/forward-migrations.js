import { readFileSync } from 'node:fs';
import {
  classifyForwardMigrationState,
  createForwardMigration,
  runForwardMigration
} from './forward-migration.js';

const WORLD_SQL = readFileSync(
  new URL('../migrations/world/001_runtime_catalog_activation.sql', import.meta.url),
  'utf8'
);
const LEGACY_WORLD_BRIDGE_SQL = [
  ...Array.from({ length: 12 }, (_, index) => String(index + 9).padStart(2, '0'))
    .map((part) => readFileSync(
      new URL(`../../../infra/world-base/schema/${part}.sql`, import.meta.url),
      'utf8'
    )),
  readFileSync(
    new URL('../migrations/world/000_legacy_world_bridge_finalize.sql', import.meta.url),
    'utf8'
  )
].join('\n\n');
const PARTY_SQL = readFileSync(
  new URL('../migrations/party/001_runtime_catalog_pins.sql', import.meta.url),
  'utf8'
);
const ACTOR_BASE_ATTRIBUTES_WORLD_SQL = readFileSync(
  new URL('../migrations/world/002_actor_base_attributes_owner.sql', import.meta.url),
  'utf8'
);
const ACTOR_BASE_ATTRIBUTES_PARTY_SQL = readFileSync(
  new URL('../migrations/party/002_actor_base_attributes_pins.sql', import.meta.url),
  'utf8'
);

export const WORLD_LEGACY_SCHEMA_BRIDGE = createForwardMigration({
  migrationId: 'world_legacy_062_to_canonical_v1',
  schemaName: 'world_base',
  sourceSchemaFingerprint: '869021eded07633eec27048a102600385248e5a8e5f8dd499943d404e17fad8f',
  targetSchemaFingerprint: '420103523402f005fe58ecbdbc6f50ec7f939221eb2b01ae9dbad9f34743282d',
  sql: LEGACY_WORLD_BRIDGE_SQL
});

export const WORLD_RUNTIME_CATALOG_MIGRATION = createForwardMigration({
  migrationId: 'world_runtime_catalog_activation_v2',
  schemaName: 'world_base',
  sourceSchemaFingerprint: '420103523402f005fe58ecbdbc6f50ec7f939221eb2b01ae9dbad9f34743282d',
  targetSchemaFingerprint: '150bbcddc46d37273b83cc0bf1ffe16f640c2640766b0b3101af41dcf48cc8ea',
  sql: WORLD_SQL
});

// Current SQL remains versioned separately; v1/v2 identity is reserved for
// an already-recorded historical ledger row.
export const WORLD_LEGACY_SCHEMA_BRIDGE_V2 = createForwardMigration({
  migrationId: 'world_legacy_062_to_canonical_v2',
  schemaName: 'world_base',
  sourceSchemaFingerprint: '869021eded07633eec27048a102600385248e5a8e5f8dd499943d404e17fad8f',
  targetSchemaFingerprint: '9d1d4b187cd22049b60340f48c1cbcd4b6282f7cca0c08594d06c7ed0f067080',
  sql: LEGACY_WORLD_BRIDGE_SQL
});

export const WORLD_RUNTIME_CATALOG_MIGRATION_V3 = createForwardMigration({
  migrationId: 'world_runtime_catalog_activation_v3',
  schemaName: 'world_base',
  sourceSchemaFingerprint: '9d1d4b187cd22049b60340f48c1cbcd4b6282f7cca0c08594d06c7ed0f067080',
  targetSchemaFingerprint: '9894704328448268fe0ec4b3144fd1b2161d99ac86b5ea4d1f1b6227d71152c6',
  sql: WORLD_SQL
});

export const PARTY_RUNTIME_CATALOG_MIGRATION = createForwardMigration({
  migrationId: 'party_runtime_catalog_pins_v2',
  schemaName: 'party_runtime',
  sourceSchemaFingerprint: '16f99b12e58ce60f6c87e29e0824518987ddb66b9ee6c7d945daebc2b0957817',
  targetSchemaFingerprint: '47cb21b39db8be7336d10533ed319fe314f5bda65d850f1297c8321de6c9d165',
  sql: PARTY_SQL
});

export const ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION = createForwardMigration({
  migrationId: 'world_actor_base_attributes_owner_v1',
  schemaName: 'world_base',
  sourceSchemaFingerprint:
    '9894704328448268fe0ec4b3144fd1b2161d99ac86b5ea4d1f1b6227d71152c6',
  targetSchemaFingerprint:
    '18c437d4515ab951374cd5c8849c61d7188f4147ac128e0b81b050f1eb485927',
  sql: ACTOR_BASE_ATTRIBUTES_WORLD_SQL
});

export const ACTOR_BASE_ATTRIBUTES_PARTY_MIGRATION = createForwardMigration({
  migrationId: 'party_actor_base_attributes_pins_v1',
  schemaName: 'party_runtime',
  sourceSchemaFingerprint:
    '47cb21b39db8be7336d10533ed319fe314f5bda65d850f1297c8321de6c9d165',
  targetSchemaFingerprint:
    '25a8012cb25446a30b8896c30c78ed161505ec75689dbc6914bed669bac71299',
  sql: ACTOR_BASE_ATTRIBUTES_PARTY_SQL
});

export const WORLD_RUNTIME_CATALOG_MIGRATION_V17_BOOTSTRAP = createForwardMigration({
  migrationId: 'world_runtime_catalog_activation_v17_bootstrap',
  schemaName: 'world_base',
  sourceSchemaFingerprint: '34fb081a453053175c95900ac6cdb239f74bfcaf35184d5614eda93ea8638849',
  targetSchemaFingerprint: '2d354a46c0b45b8f0a24944c3bd9d1082666511d4b8cfe805da4974674ea41d8',
  sql: WORLD_SQL
});

export const ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION_V17_BOOTSTRAP = createForwardMigration({
  migrationId: 'world_actor_base_attributes_owner_v17_bootstrap',
  schemaName: 'world_base',
  sourceSchemaFingerprint: '2d354a46c0b45b8f0a24944c3bd9d1082666511d4b8cfe805da4974674ea41d8',
  targetSchemaFingerprint: 'a085a88b460eb8d0e655bae29a01e1b56c92054dc901969bd9b1ac50cbc8f143',
  sql: ACTOR_BASE_ATTRIBUTES_WORLD_SQL
});

export const PARTY_RUNTIME_CATALOG_MIGRATION_V17_BOOTSTRAP = createForwardMigration({
  migrationId: 'party_runtime_catalog_pins_v17_bootstrap',
  schemaName: 'party_runtime',
  sourceSchemaFingerprint: 'b2d949fffe0a2b384c2bf3ca3fcfdf3e24400b32873905bd399ab79d1e9c1936',
  targetSchemaFingerprint: 'd995f30a742406c6494e4c8a48fb0599af97fc036e6c205435fa7a33b73dcbcf',
  sql: PARTY_SQL
});

export const ACTOR_BASE_ATTRIBUTES_PARTY_MIGRATION_V17_BOOTSTRAP = createForwardMigration({
  migrationId: 'party_actor_base_attributes_pins_v17_bootstrap',
  schemaName: 'party_runtime',
  sourceSchemaFingerprint: 'd995f30a742406c6494e4c8a48fb0599af97fc036e6c205435fa7a33b73dcbcf',
  targetSchemaFingerprint: 'a4c4ec8897a23604ac4b03c0971e9d35807ba977639180d3961c70c2509841f9',
  sql: ACTOR_BASE_ATTRIBUTES_PARTY_SQL
});

export function buildWorldRuntimeCatalogMigrationPreflight({
  actualSchemaFingerprint,
  ledgerRow,
  successorLedgerRow = null
}) {
  if (actualSchemaFingerprint
      === WORLD_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint
      && ledgerRow) {
    const runtimeState = classifyForwardMigrationState({
      migration: WORLD_RUNTIME_CATALOG_MIGRATION,
      actualSchemaFingerprint,
      ledgerRow
    }).status;
    return Object.freeze({
      status: runtimeState === 'already_applied' ? 'ready' : 'blocked',
      checks: Object.freeze([Object.freeze({
        migration_id: WORLD_RUNTIME_CATALOG_MIGRATION.migration_id,
        migration_digest: WORLD_RUNTIME_CATALOG_MIGRATION.migration_digest,
        actual_schema_fingerprint: actualSchemaFingerprint,
        target_schema_fingerprint:
          WORLD_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint,
        state: runtimeState
      })])
    });
  }
  const bridgeState = actualSchemaFingerprint === WORLD_LEGACY_SCHEMA_BRIDGE_V2.source_schema_fingerprint
    ? 'ready'
    : actualSchemaFingerprint === WORLD_LEGACY_SCHEMA_BRIDGE_V2.target_schema_fingerprint
      || actualSchemaFingerprint
        === WORLD_RUNTIME_CATALOG_MIGRATION_V3.target_schema_fingerprint
      ? 'already_applied'
      : 'MIGRATION_SCHEMA_FINGERPRINT_UNKNOWN';
  let runtimeState;
  if (actualSchemaFingerprint === WORLD_LEGACY_SCHEMA_BRIDGE_V2.source_schema_fingerprint) {
    runtimeState = 'ready_after_prerequisite';
  } else {
    try {
      runtimeState = classifyForwardMigrationState({
        migration: WORLD_RUNTIME_CATALOG_MIGRATION_V3,
        actualSchemaFingerprint,
        ledgerRow: successorLedgerRow
      }).status;
    } catch (error) {
      runtimeState = error.code;
    }
  }
  const checks = [
    {
      migration_id: WORLD_LEGACY_SCHEMA_BRIDGE_V2.migration_id,
      migration_digest: WORLD_LEGACY_SCHEMA_BRIDGE_V2.migration_digest,
      actual_schema_fingerprint: actualSchemaFingerprint,
      target_schema_fingerprint:
        WORLD_LEGACY_SCHEMA_BRIDGE_V2.target_schema_fingerprint,
      state: bridgeState
    },
    {
      migration_id: WORLD_RUNTIME_CATALOG_MIGRATION_V3.migration_id,
      migration_digest: WORLD_RUNTIME_CATALOG_MIGRATION_V3.migration_digest,
      actual_schema_fingerprint: actualSchemaFingerprint,
      target_schema_fingerprint:
        WORLD_RUNTIME_CATALOG_MIGRATION_V3.target_schema_fingerprint,
      state: runtimeState
    }
  ];
  return Object.freeze({
    status: checks.every(({ state }) =>
      ['ready', 'ready_after_prerequisite', 'already_applied'].includes(state))
      ? 'ready'
      : 'blocked',
    checks: Object.freeze(checks.map(Object.freeze))
  });
}

export async function runWorldRuntimeCatalogMigration(pool) {
  try {
    return await runForwardMigration({
      pool,
      migration: WORLD_RUNTIME_CATALOG_MIGRATION_V3,
      sourceBridge: WORLD_LEGACY_SCHEMA_BRIDGE_V2
    });
  } catch (error) {
    if (error?.code !== 'MIGRATION_SCHEMA_FINGERPRINT_UNKNOWN') throw error;
    return runForwardMigration({
      pool,
      migration: WORLD_RUNTIME_CATALOG_MIGRATION,
      sourceBridge: WORLD_LEGACY_SCHEMA_BRIDGE
    });
  }
}

export function runPartyRuntimeCatalogMigration(pool) {
  return runForwardMigration({ pool, migration: PARTY_RUNTIME_CATALOG_MIGRATION });
}

export async function runActorBaseAttributesOwnerMigrations({ worldPool,
  partyPool }) {
  const world = await runForwardMigration({ pool: worldPool,
    migration: ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION });
  const party = await runForwardMigration({ pool: partyPool,
    migration: ACTOR_BASE_ATTRIBUTES_PARTY_MIGRATION });
  return Object.freeze({ world, party });
}
