// Shared helpers for flora-trees-shrubs build/validate. Node >= 20, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
export const DOMAIN = path.resolve(SCRIPTS, '..');
export const REPO = path.resolve(DOMAIN, '../../../../..');
export const SRC = path.join(SCRIPTS, 'src');
export const OUT = path.join(DOMAIN, 'flora');
export const REPORTS = path.join(DOMAIN, 'reports');

export const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
export const src = (name) => readJson(path.join(SRC, name));

// Season dictionary = places-binding presence/frequency_rule.json season_rule (temporal-v4 calendar, months 12-2/3-5/6-8/9-11).
export const SEASONS = ['winter', 'spring', 'summer', 'autumn'];
export const SEASON_MONTHS = { winter: [12, 1, 2], spring: [3, 4, 5], summer: [6, 7, 8], autumn: [9, 10, 11] };
export const FOREST_PF = ['pf_conifer_woodland', 'pf_mixed_woodland', 'pf_broadleaf_woodland'];

// "5-6" -> [5,6]; "9-2" wraps -> [9,10,11,12,1,2]; "7" -> [7]; null -> []
export function months(spec) {
  if (spec == null || spec === '') return [];
  const [a, b] = String(spec).split('-').map(Number);
  if (!b) return [a];
  const out = [];
  for (let m = a; ; m = (m % 12) + 1) { out.push(m); if (m === b) break; }
  return out;
}
export const seasonsOf = (ms) => SEASONS.filter((s) => ms.some((m) => SEASON_MONTHS[s].includes(m)));

export function csvCell(v) {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function writeCsv(file, header, rows) {
  const lines = [header.join(',')].concat(rows.map((r) => header.map((h) => csvCell(r[h])).join(',')));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  return rows.length;
}
// Minimal RFC4180 parser (handles quoted fields with commas/newlines).
export function readCsv(file) {
  const t = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const rows = []; let row = []; let f = ''; let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  const [h, ...body] = rows;
  return body.filter((r) => r.length > 1 || r[0] !== '').map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}
