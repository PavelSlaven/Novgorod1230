export function readPostgresConfig(env = process.env) {
  const worldUrl = text(env.RUS_WORLD_DATABASE_URL ?? env.DATABASE_URL);
  const partyUrl = text(env.RUS_PARTY_DATABASE_URL ?? env.PARTY_DATABASE_URL);
  return Object.freeze({
    worldUrl,
    partyUrl,
    ssl: bool(env.RUS_DATABASE_SSL, false) ? { rejectUnauthorized: bool(env.RUS_DATABASE_SSL_REJECT_UNAUTHORIZED, true) } : false,
    worldMax: integer(env.RUS_WORLD_DB_POOL_MAX, 4, 1, 20),
    partyMax: integer(env.RUS_PARTY_DB_POOL_MAX, 8, 1, 40),
    idleTimeoutMillis: integer(env.RUS_DB_IDLE_TIMEOUT_MS, 30_000, 1_000, 300_000),
    connectionTimeoutMillis: integer(env.RUS_DB_CONNECT_TIMEOUT_MS, 10_000, 1_000, 60_000)
  });
}

export function assertPostgresConfig(config) {
  if (!text(config?.worldUrl)) throw configError('WORLD_DATABASE_URL_REQUIRED', 'RUS_WORLD_DATABASE_URL or DATABASE_URL is required.');
  if (!text(config?.partyUrl)) throw configError('PARTY_DATABASE_URL_REQUIRED', 'RUS_PARTY_DATABASE_URL or PARTY_DATABASE_URL is required.');
  return config;
}

function configError(code, message) { const error = new Error(message); error.code = code; return error; }
function text(value) { return String(value ?? '').trim(); }
function bool(value, fallback) { if (value == null || value === '') return fallback; return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase()); }
function integer(value, fallback, min, max) { const parsed = Number(value); return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback; }
