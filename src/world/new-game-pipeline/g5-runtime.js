import { readFile } from 'node:fs/promises';

const G5_TOOL_ROOT = new URL('../../../tools/rus13-start-g5-materialization/start_g5_materialization_v1/', import.meta.url);

export function isG5RuntimeEnabled({ env = process.env, enableG5Runtime = false } = {}) {
  return enableG5Runtime === true || isTruthyEnv(env.NEW_GAME_G5_RUNTIME);
}

export async function loadG5ToolMetadata({ toolRoot = G5_TOOL_ROOT } = {}) {
  return readJson(new URL('start_g5_materialization_v1.json', toolRoot));
}

export async function loadG5ContractSchema(contractName, { toolRoot = G5_TOOL_ROOT } = {}) {
  if (!/^[A-Za-z0-9]+$/u.test(String(contractName ?? ''))) {
    throw new Error(`Invalid G5 contract name: ${contractName}`);
  }
  return readJson(new URL(`contracts/${contractName}.schema.json`, toolRoot));
}

export async function runG5MaterializationAdapter(input = {}, {
  env = process.env,
  enableG5Runtime = false,
  materialize = null,
  toolRoot = G5_TOOL_ROOT
} = {}) {
  assertG5RuntimeEnabled({ env, enableG5Runtime });
  if (typeof materialize !== 'function') {
    throw new Error('G5 materialization adapter is required when G5 runtime is enabled.');
  }

  const [tool, schema] = await Promise.all([
    loadG5ToolMetadata({ toolRoot }),
    loadG5ContractSchema('G5SceneGraphDraft', { toolRoot })
  ]);
  const payload = await materialize({ input, tool, contract: schema, step_id: 'g5_04_scene_graph_draft' });
  validateRequiredContractFields(schema, payload);
  return {
    materialization_status: payload.materialization_status ?? 'materialized',
    ...payload,
    version: payload.version ?? 1,
    schema: payload.schema ?? 'g5_scene_graph_draft',
    request_id: payload.request_id ?? input.request_id ?? null
  };
}

export async function runG5AuditAdapter(input = {}, {
  env = process.env,
  enableG5Runtime = false,
  audit = null,
  toolRoot = G5_TOOL_ROOT
} = {}) {
  assertG5RuntimeEnabled({ env, enableG5Runtime });
  if (typeof audit !== 'function') {
    throw new Error('G5 audit adapter is required when G5 runtime is enabled.');
  }

  const [tool, schema] = await Promise.all([
    loadG5ToolMetadata({ toolRoot }),
    loadG5ContractSchema('G5AuditReport', { toolRoot })
  ]);
  const payload = await audit({ input, tool, contract: schema, step_id: 'g5_10_commit_gate_audit' });
  validateRequiredContractFields(schema, payload);
  return {
    ...payload,
    version: payload.version ?? 1,
    schema: payload.schema ?? 'g5_scene_audit',
    request_id: payload.request_id ?? input.request_id ?? null,
    pass: payload.pass ?? payload.commit_allowed === true
  };
}

export function validateRequiredContractFields(schema = {}, payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`G5 ${schema.title ?? 'contract'} payload must be an object.`);
  }

  const missing = (schema.required ?? []).filter((field) => payload[field] == null);
  if (missing.length > 0) {
    throw new Error(`G5 ${schema.title ?? 'contract'} payload missing required fields: ${missing.join(', ')}`);
  }
  return payload;
}

function assertG5RuntimeEnabled(options) {
  if (!isG5RuntimeEnabled(options)) {
    throw new Error('G5 runtime is opt-in only: pass enableG5Runtime=true or set NEW_GAME_G5_RUNTIME=true.');
  }
}

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

function isTruthyEnv(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}
