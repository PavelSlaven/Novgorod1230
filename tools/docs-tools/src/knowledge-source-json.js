import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function readJsonIfPresent(path) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function byPath(left, right) {
  return left.path.localeCompare(right.path);
}
