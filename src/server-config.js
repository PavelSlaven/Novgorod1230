import { resolve } from 'node:path';

export function isLocalHost(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

export function resolveServerConfig(env = process.env, cwd = process.cwd()) {
  const host = env.HOST?.trim() || '127.0.0.1';
  return {
    savePath: env.SAVE_PATH ? resolve(cwd, env.SAVE_PATH) : resolve(cwd, 'data', 'save.json'),
    port: Number(env.PORT ?? 3000),
    host,
    publicHost: !isLocalHost(host),
    maxJsonBodyBytes: Number(env.MAX_JSON_BODY_BYTES ?? 262144),
    uiServerToken: env.UI_SERVER_TOKEN?.trim() || ''
  };
}
