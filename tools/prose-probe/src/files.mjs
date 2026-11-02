import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const templates = new URL('../templates/', import.meta.url);

export async function read(path) {
  try { return await readFile(path, 'utf8'); }
  catch (error) { throw new Error(`${path}: ${error.code ?? error.message}${error.syscall ? ` (${error.syscall})` : ''}`); }
}

export async function json(path) {
  const source = await read(path);
  try { return JSON.parse(source); }
  catch (error) { throw new Error(`${path}: ${error.message}`); }
}

export function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }

export async function output(dir, files) {
  await mkdir(dir, { recursive: true });
  for (const [name, value] of Object.entries(files)) await writeFile(join(dir, name), value);
}

export async function template(name) { return read(new URL(name, templates)); }

export async function rubricVersion() {
  const hash = createHash('sha256');
  for (const name of ['judge-rubric.md', 'writer-system.md', 'writer-task.md']) hash.update(await template(name));
  return hash.digest('hex');
}

export function spaces(text) { return text.replace(/\r\n|\r|\n/g, ' ').replace(/ {2,}/g, ' '); }

export function quoteFound(prose, quote) {
  return typeof quote === 'string' && spaces(prose).includes(spaces(quote));
}

export function requireProse(value, path) {
  if (typeof value?.prose !== 'string' || !value.prose.trim()) throw new Error(`${path}: поле prose пустое или не строка`);
  return value.prose;
}

export function checkMoments(moments, path) {
  if (!Array.isArray(moments) || !moments.length) throw new Error(`${path}: нужен непустой массив моментов`);
  const ids = new Set();
  for (const moment of moments) {
    if (typeof moment.id !== 'string' || !/^[\p{L}\p{N}_-]+$/u.test(moment.id) || ids.has(moment.id)) throw new Error(`${path}: неверный или повторный id ${moment.id}`);
    ids.add(moment.id);
    if (typeof moment.title !== 'string' || !Number.isInteger(moment.from_turn) || !Number.isInteger(moment.to_turn) || moment.from_turn > moment.to_turn) throw new Error(`${path}: неверный интервал ${moment.id}`);
  }
}
