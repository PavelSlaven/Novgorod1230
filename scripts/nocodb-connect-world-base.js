/**
 * Idempotent: connect world_base schema in NocoDB via REST API.
 * ponytail: one script, no new deps — reuses loadLocalEnv + fetch.
 */
import { loadLocalEnv } from '../src/env.js';

await loadLocalEnv();

const NOCODB_URL = (process.env.NOCODB_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const EMAIL = process.env.NOCODB_ADMIN_EMAIL || 'admin@world-base.local';
const PASSWORD = process.env.NOCODB_ADMIN_PASSWORD || 'world-base-nocodb-dev';
const WORKSPACE_ID = process.env.NOCODB_WORKSPACE_ID || '';

const pgUser = process.env.POSTGRES_USER || 'world_admin';
const pgPass = process.env.POSTGRES_PASSWORD;
const pgDb = process.env.POSTGRES_DB || 'world_db';
const pgHost = process.env.NOCODB_PG_HOST || 'postgres';
const PG_SCHEMA = 'world_base';

if (!pgPass) {
  console.error('POSTGRES_PASSWORD required in .env');
  process.exit(1);
}

async function api(path, { method = 'GET', body, token } = {}) {
  const headers = { 'xc-gui': 'true' };
  if (token) headers['xc-auth'] = token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${NOCODB_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return json;
}

async function authToken() {
  for (const path of ['/api/v1/auth/user/signin', '/api/v1/auth/user/signup']) {
    try {
      const data = await api(path, {
        method: 'POST',
        body: { email: EMAIL, password: PASSWORD, display_name: 'World Base Admin' },
      });
      if (data?.token) return data.token;
    } catch (err) {
      if (path.endsWith('signin')) continue;
      throw err;
    }
  }
  throw new Error('auth failed');
}

function pgSourceConfig() {
  return {
    client: 'pg',
    connection: {
      host: pgHost,
      port: 5432,
      user: pgUser,
      password: pgPass,
      database: pgDb,
      schema: PG_SCHEMA,
    },
    schema: PG_SCHEMA,
    // ponytail: NocoDB 2026.06 queries unqualified names — searchPath required for world_base.*
    searchPath: [PG_SCHEMA],
  };
}

function sourceNeedsConfigPatch(config) {
  if (!config || config.client !== 'pg') return true;
  if (config.schema !== PG_SCHEMA) return true;
  if (!Array.isArray(config.searchPath) || !config.searchPath.includes(PG_SCHEMA)) return true;
  const conn = config.connection;
  return !conn?.host || !conn?.database || conn.schema !== PG_SCHEMA;
}

async function ensureSourceConfig(baseId, sourceId, token) {
  // ponytail: always PATCH — NocoDB GET may merge config while runtime pool lacks searchPath
  await api(`/api/v1/db/meta/projects/${baseId}/bases/${sourceId}`, {
    method: 'PATCH',
    token,
    body: { config: pgSourceConfig() },
  });
  const detail = await api(`/api/v1/db/meta/projects/${baseId}/bases/${sourceId}`, { token });
  if (sourceNeedsConfigPatch(detail.config)) {
    throw new Error('source config still missing schema/searchPath after PATCH');
  }
}

async function syncSchema(baseId, sourceId, token) {
  await api(`/api/v1/db/meta/projects/${baseId}/meta-diff/${sourceId}`, { token });
  await api(`/api/v1/db/meta/projects/${baseId}/meta-diff/${sourceId}`, {
    method: 'POST',
    token,
    body: {},
  });
}

async function listSourceTables(baseId, sourceId, token) {
  const tables = await api(`/api/v1/db/meta/projects/${baseId}/${sourceId}/tables`, { token });
  return tables.list || [];
}

async function findWorldBaseSource(baseId, token) {
  const sources = await api(`/api/v1/db/meta/projects/${baseId}/bases/`, { token });
  return sources.list?.find((s) => s.alias === 'world_base' && !s.is_meta);
}

// ponytail: POST returns job id — poll until canonical source id exists
async function waitForWorldBaseSource(baseId, token, { timeoutMs = 60000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await findWorldBaseSource(baseId, token);
    if (found?.id) return found;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('world_base source not ready');
}

async function recreateSource(baseId, token) {
  const existing = await findWorldBaseSource(baseId, token);
  if (existing?.id) {
    await api(`/api/v1/db/meta/projects/${baseId}/bases/${existing.id}`, { method: 'DELETE', token });
    console.log('removed stale source:', existing.id);
  }

  try {
    await api(`/api/v1/db/meta/projects/${baseId}/bases/`, {
      method: 'POST',
      token,
      body: {
        alias: 'world_base',
        type: 'pg',
        config: pgSourceConfig(),
        is_meta: false,
        external: true,
      },
    });
  } catch (err) {
    if (!String(err.message).includes('Another source creation is in progress')) throw err;
  }
  return waitForWorldBaseSource(baseId, token);
}

async function main() {
  const token = await authToken();
  const info = await api('/api/v1/db/meta/nocodb/info', { token });
  const workspaceId = WORKSPACE_ID || info.defaultWorkspaceId;
  if (!workspaceId) throw new Error('no workspace id');

  const projects = await api('/api/v1/db/meta/projects/', { token });
  let base = projects.list?.find((p) => p.title === 'World Base');

  if (!base) {
    base = await api('/api/v1/db/meta/projects/', {
      method: 'POST',
      token,
      body: {
        title: 'World Base',
        fk_workspace_id: workspaceId,
        meta: JSON.stringify({ iconColor: '#24716E' }),
      },
    });
    console.log('created base:', base.id);
  } else {
    console.log('base exists:', base.id);
  }

  const sources = await api(`/api/v1/db/meta/projects/${base.id}/bases/`, { token });
  let source = sources.list?.find((s) => s.alias === 'world_base' && !s.is_meta);

  if (!source) {
    try {
      await api(`/api/v1/db/meta/projects/${base.id}/bases/`, {
        method: 'POST',
        token,
        body: {
          alias: 'world_base',
          type: 'pg',
          config: pgSourceConfig(),
          is_meta: false,
          external: true,
        },
      });
    } catch (err) {
      if (!String(err.message).includes('Another source creation is in progress')) throw err;
    }
    source = await waitForWorldBaseSource(base.id, token);
    console.log('created source:', source.id);
  } else {
    console.log('source exists:', source.id);
  }

  const sourceDetail = await api(`/api/v1/db/meta/projects/${base.id}/bases/${source.id}`, { token });
  const neededPatch = sourceNeedsConfigPatch(sourceDetail.config);
  await ensureSourceConfig(base.id, source.id, token);
  if (neededPatch) console.log('source config patched (schema + searchPath)');

  await syncSchema(base.id, source.id, token);
  console.log('schema synced');

  let tableList = await listSourceTables(base.id, source.id, token);
  const tableNames = new Set(tableList.map((t) => t.table_name).filter(Boolean));
  // ponytail: schema v2 layered ontology — partial meta-diff sync can leave old NocoDB meta
  // without layer *_templates even when PG has all 50 tables; recreate source fixes quick search
  const layerTemplateTables = [
    'landscape_templates',
    'water_body_templates',
    'route_templates',
    'land_use_templates',
    'place_templates',
  ];
  const staleMeta = !tableNames.has('regions')
    || !tableNames.has('graph_nodes')
    || tableNames.has('routes')
    || layerTemplateTables.some((t) => !tableNames.has(t));
  if (staleMeta) {
    console.log('stale meta (incomplete layer templates or legacy routes) — recreating world_base source');
    source = await recreateSource(base.id, token);
    await ensureSourceConfig(base.id, source.id, token);
    await syncSchema(base.id, source.id, token);
    tableList = await listSourceTables(base.id, source.id, token);
  }

  const names = tableList.map((t) => t.table_name || t.title).filter(Boolean);
  console.log('tables:', names.length ? names.join(', ') : '(none — check schema in config)');

  for (const tableName of ['regions', 'graph_nodes']) {
    const probe = tableList.find((t) => t.table_name === tableName);
    if (probe?.id) {
      const probeRes = await fetch(`${NOCODB_URL}/api/v2/tables/${probe.id}/records/count`, {
        headers: { 'xc-auth': token, 'xc-gui': 'true' },
      });
      if (!probeRes.ok) {
        const err = await probeRes.text();
        throw new Error(`${tableName} probe failed (${probeRes.status}): ${err}`);
      }
      const { count } = await probeRes.json();
      console.log(`${tableName} rows:`, count);
    }
  }

  console.log('ui:', `${NOCODB_URL}/dashboard/#/nc/${base.id}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
