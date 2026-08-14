export const LOCAL_PLAY_RESOURCES = Object.freeze({
  containerName: 'novgorod1230-local-postgres',
  volumeName: 'novgorod1230-local-postgres-data',
  resourceLabel: 'io.novgorod1230.local-play',
  resourceLabelValue: 'true',
  postgresImage: 'postgres:16-alpine',
  worldDatabase: 'pr17_novgorod_local_world',
  partyDatabase: 'novgorod_local_party'
});

const LOCAL_DECISION_SECRET =
  'novgorod1230-local-play-decision-secret-v1';
const CUTOVER_FLAGS = Object.freeze([
  'RUS_MODULES_ENABLED',
  'RUS_LLM_RUNTIME_MODULES_ENABLED',
  'RUS_DATA_MODULES_ENABLED',
  'RUS_PARTY_STORE_MODULES_ENABLED',
  'RUS_NEW_GAME_WAVE_24_26_ENABLED',
  'RUS_NEW_GAME_WAVE_20_23_ENABLED',
  'RUS_NEW_GAME_ALL_STAGES_ENABLED',
  'RUS_NEW_GAME_MODULES_ENABLED',
  'RUS_TURN_MODULES_ENABLED',
  'RUS_PRESENTATION_MODULES_ENABLED',
  'RUS_GAME_SERVER_MODULES_ENABLED',
  'RUS_UI_MODULES_ENABLED'
]);

export function validateLocalPlayPrerequisites({
  env = process.env,
  nodeVersion = process.versions.node
} = {}) {
  const major = Number(String(nodeVersion ?? '').split('.')[0]);
  if (!Number.isInteger(major) || major < 22) {
    fail('LOCAL_PLAY_NODE_VERSION_UNSUPPORTED',
      `Node.js 22+ is required; found ${nodeVersion || '<unknown>'}.`);
  }
  const apiKey = String(env.DEEPSEEK_API_KEY ?? '').trim();
  if (!apiKey || apiKey === 'replace-me') {
    fail('LOCAL_PLAY_DEEPSEEK_API_KEY_REQUIRED',
      'Set DEEPSEEK_API_KEY before running npm run play:local.');
  }
  return Object.freeze({ nodeVersion, apiKeyPresent: true });
}

export function validateLocalDockerResources({ container, volume }) {
  const owned = (resource) => resource == null
    || resource.labels?.[LOCAL_PLAY_RESOURCES.resourceLabel]
      === LOCAL_PLAY_RESOURCES.resourceLabelValue;
  if (!owned(container) || !owned(volume)) {
    fail('LOCAL_PLAY_DOCKER_RESOURCE_CONFLICT',
      'A named Docker resource exists but is not owned by local play.');
  }
  if (container && !volume) {
    fail('LOCAL_PLAY_DOCKER_RESOURCE_CONFLICT',
      'The local-play container has no matching persistent volume.');
  }
  if (container && (
    container.image !== LOCAL_PLAY_RESOURCES.postgresImage
    || container.volumeName !== LOCAL_PLAY_RESOURCES.volumeName
    || container.hostIp !== '127.0.0.1'
  )) {
    fail('LOCAL_PLAY_DOCKER_RESOURCE_CONFLICT',
      'The named local-play container has an incompatible configuration.');
  }
  return Object.freeze({
    createVolume: volume == null,
    createContainer: container == null
  });
}

export function classifyLocalDatabaseState(inventory) {
  const world = databaseInventory(inventory?.world, 'world');
  const party = databaseInventory(inventory?.party, 'party');
  const worldFresh = world.user_table_count === 0;
  const partyFresh = party.user_table_count === 0;
  if (worldFresh !== partyFresh) {
    fail('LOCAL_PLAY_DATABASE_STATE_PARTIAL',
      'Local world and party databases are only partially initialized.');
  }
  return worldFresh ? 'fresh' : 'existing';
}

export async function prepareLocalDatabaseState({
  inventory,
  initializeFresh,
  loadCompatible
}) {
  if (typeof initializeFresh !== 'function'
      || typeof loadCompatible !== 'function') {
    throw new TypeError('database preparation callbacks are required');
  }
  const state = classifyLocalDatabaseState(inventory);
  if (state === 'fresh') await initializeFresh();
  const pin = await loadCompatible();
  return Object.freeze({
    mode: state === 'fresh' ? 'initialized' : 'reused',
    pin
  });
}

export function buildLocalServerEnv({
  env = process.env,
  worldUrl,
  partyUrl,
  pinManifestDigest,
  serverPort = 3000
}) {
  const digest = String(pinManifestDigest ?? '').trim().toLowerCase();
  const port = Number(serverPort);
  if (!/^[a-f0-9]{64}$/u.test(digest)) {
    fail('LOCAL_PLAY_RUNTIME_CATALOG_PIN_INVALID',
      'A persisted compatible runtime-catalog pin is required.');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail('LOCAL_PLAY_SERVER_PORT_INVALID',
      `Invalid RUS_SERVER_PORT: ${serverPort}.`);
  }
  const result = {
    ...env,
    RUS_RUNTIME_ROUTE: 'modular',
    RUS_CUTOVER_STAGE: '13',
    RUS_COMPOSITION_MODULE: 'builtin:production-spatial-v3',
    RUS_SPATIAL_V3_BINDINGS_MODULE:
      'builtin:spatial-v3-production-v8',
    RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST: digest,
    RUS_WORLD_DATABASE_URL: requiredText(worldUrl, 'world URL'),
    RUS_PARTY_DATABASE_URL: requiredText(partyUrl, 'party URL'),
    RUS_DATABASE_SSL: 'false',
    RUS_SERVER_HOST: '127.0.0.1',
    RUS_SERVER_PORT: String(port),
    RUS_TURN_DECISION_SECRET: LOCAL_DECISION_SECRET
  };
  for (const name of CUTOVER_FLAGS) result[name] = 'true';
  delete result.RUS_RUNTIME_BINDINGS_MODULE;
  delete result.RUS_RUN_PARTY_MIGRATIONS;
  delete result.RUS_PROBE_LLM_PROVIDER_ON_STARTUP;
  return Object.freeze(result);
}

function databaseInventory(value, label) {
  const count = Number(value?.user_table_count);
  if (!value || !Number.isInteger(count) || count < 0) {
    fail('LOCAL_PLAY_DATABASE_INVENTORY_INVALID',
      `Invalid ${label} database inventory.`);
  }
  return { ...value, user_table_count: count };
}

function requiredText(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} is required`);
  return result;
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}
