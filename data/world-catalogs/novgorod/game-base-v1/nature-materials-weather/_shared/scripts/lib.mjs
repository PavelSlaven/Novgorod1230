// Shared helpers for nature-materials-weather builders (no dependencies).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GROUP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SHARED = path.join(GROUP_DIR, '_shared');
export const PR98 = process.env.PR98_ROOT || 'C:/Users/Slaven/Documents/Novgorod-runtime';
export const MAIN = process.env.MAIN_ROOT || 'C:/Users/Slaven/Documents/Novgorod';

export const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
export const writeJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 1) + '\n'); };

export function readTsv(p) {
  const lines = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l && !/^\(\d+ rows?\)$/.test(l));
  const head = lines[0].split('\t');
  return lines.slice(1).map((l) => Object.fromEntries(l.split('\t').map((v, i) => [head[i], v])));
}

export function parseCsv(text) {
  const rows = []; let r = []; let f = ''; let q = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { r.push(f); f = ''; }
    else if (c === '\n') { r.push(f); rows.push(r); r = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f !== '' || r.length) { r.push(f); rows.push(r); }
  const head = rows[0];
  return rows.slice(1).filter((x) => x.length > 1 || x[0] !== '').map((x) => Object.fromEntries(head.map((h, i) => [h, x[i] ?? ''])));
}
export const readCsv = (p) => parseCsv(fs.readFileSync(p, 'utf8'));

const esc = (v) => {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) ? v.join('|') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export function writeCsv(p, rows, columns) {
  const cols = columns || Object.keys(rows[0] || {});
  const out = [cols.join(',')].concat(rows.map((r) => cols.map((c) => esc(r[c])).join(','))).join('\n') + '\n';
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, out);
  return rows.length;
}

// Frequency-class weights: catalog convention (M2c richness policy).
export const FREQ_WEIGHT = { ubiquitous: 8, common: 4, contextual: 2, rare: 1, absent: 0 };
export const SEASONS = ['winter', 'spring', 'summer', 'autumn'];

export function fail(errors, label) {
  if (errors.length) { console.error(`${label}: ${errors.length} error(s)`); for (const e of errors.slice(0, 60)) console.error(' - ' + e); process.exitCode = 1; }
  else console.log(`${label}: OK`);
}

// Cyrillic-aware denylist regex: word-initial prefix match; trailing "!" = exact word.
export function denyRegex(list) {
  const L = '[A-Za-zА-Яа-яЁё]';
  const parts = list.map((t) => { const exact = t.endsWith('!'); const s = (exact ? t.slice(0, -1) : t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return `(?<!${L})${s}${exact ? `(?!${L})` : ''}`; });
  return new RegExp(parts.join('|'), 'i');
}
