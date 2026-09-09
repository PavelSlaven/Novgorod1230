import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export function createLlmSettingsFileStore({ filePath = defaultLlmSettingsPath() } = {}) {
  return Object.freeze({
    path: filePath,
    async load() {
      try { return JSON.parse(await readFile(filePath, 'utf8')); }
      catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error;
      }
    },
    async save(record) {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, {
        encoding: 'utf8', mode: 0o600
      });
    }
  });
}

export function defaultLlmSettingsPath(env = process.env) {
  const root = String(env.LOCALAPPDATA ?? env.XDG_CONFIG_HOME ?? '').trim()
    || homedir();
  return join(root, 'Novgorod1230', 'llm-settings.json');
}
