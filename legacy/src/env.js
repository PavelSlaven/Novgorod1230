import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DEFAULT_FILES = ['.env.local', '.env'];

export async function loadLocalEnv(cwd = process.cwd()) {
  for (const name of DEFAULT_FILES) {
    const path = new URL(name, `${pathToFileURL(cwd).href.replace(/\/?$/u, '/')}`);
    try {
      const text = await readFile(path, 'utf8');
      applyEnvText(text);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

function applyEnvText(text) {
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    const value = stripQuotes(line.slice(index + 1).trim());
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
