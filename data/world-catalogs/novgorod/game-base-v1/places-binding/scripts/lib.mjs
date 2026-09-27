// Shared helpers for places-binding build scripts (no dependencies).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
export const GROUP = path.resolve(SCRIPTS, '..');
export const GAME_BASE = path.resolve(GROUP, '..');
export const REPO = path.resolve(GROUP, '../../../../..');
export const PR98 = process.env.PR98_ROOT ? path.resolve(process.env.PR98_ROOT) : path.resolve(REPO, '../Novgorod-runtime');

export const rel = (p) => path.relative(REPO, p).split(path.sep).join('/');
export const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
export const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export const arr = (j) => (Array.isArray(j) ? j : Object.values(j).find(Array.isArray) ?? []);

export function writeJson(p, v) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
}

// RFC 4180 CSV parser (handles quotes, embedded newlines, BOM).
export function parseCsv(text, delimiter = ',') {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
export const readCsv = (p, d) => parseCsv(fs.readFileSync(p, 'utf8'), d);
// TSV without quoting (v6 graph tables are plain tab-separated).
export function readTsv(p) {
  const lines = fs.readFileSync(p, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map((l) => l.split('\t'));
  const [h, ...b] = lines;
  return b.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}

const cell = (v) => {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) v = v.join(';');
  v = String(v);
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
};
export function writeCsv(p, columns, rows) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const out = [columns.join(',')];
  for (const r of rows) out.push(columns.map((c) => cell(r[c])).join(','));
  fs.writeFileSync(p, out.join('\n') + '\n');
  return rows.length;
}
export const split = (v) => (v ? String(v).split(';').map((s) => s.trim()).filter(Boolean) : []);

export const SEASONS = ['winter', 'spring', 'summer', 'autumn'];
