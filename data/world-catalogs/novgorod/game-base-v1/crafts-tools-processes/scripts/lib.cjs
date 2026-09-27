'use strict';
// Shared helpers: CSV read/write, repo paths, reference loaders. No dependencies.
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const DOMAIN_ROOT = path.resolve(HERE, '..');                 // .../game-base-v1/crafts-tools-processes
const GAME_BASE = path.resolve(DOMAIN_ROOT, '..');            // .../game-base-v1
const NOVGOROD = path.resolve(GAME_BASE, '..');               // .../world-catalogs/novgorod
const REPO = path.resolve(NOVGOROD, '..', '..', '..');        // repo root

function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = []; let f = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  const header = rows.shift() || [];
  return rows.filter(r => r.length > 1 || (r[0] || '') !== '').map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}
function readCsv(p) { return parseCsv(fs.readFileSync(p, 'utf8')); }

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function writeCsv(p, header, rows) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const lines = [header.join(',')].concat(rows.map(r => header.map(h => csvCell(r[h])).join(',')));
  fs.writeFileSync(p, lines.join('\n') + '\n', 'utf8');
  return rows.length;
}
const split = s => (s || '').split(';').map(x => x.trim()).filter(Boolean);
const uniq = a => [...new Set(a)];

function loadWk() {
  const p = path.join(NOVGOROD, 'world-knowledge', 'production-v1', 'runtime-bundle.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { claims: new Set(j.claims.map(c => c.claim_ref)), concepts: new Set(j.concepts.map(c => c.concept_ref)) };
}
function loadPlaceFamilies() {
  const p = path.join(NOVGOROD, 'world-knowledge', 'production-v1', 'place-first-cartography.json');
  return new Set(JSON.parse(fs.readFileSync(p, 'utf8')).environment_families.map(f => f.id));
}
function loadV5() {
  const dir = path.join(REPO, 'data', 'knowledge-source', 'imports', 'item-container-120-v5', 'candidate', 'tables');
  const arr = f => { const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); return Array.isArray(j) ? j : Object.values(j).find(Array.isArray); };
  const tpl = new Map(arr('item_templates.json').map(t => [t.id, t]));
  const mass = new Map(arr('item_template_quantity_profiles.json').map(q => [q.item_template_id, q.mass_grams_per_unit]));
  return { tpl, mass };
}
function loadOccupations() {
  const p = path.join(REPO, 'data', 'novgorod-region', 'novgorod_occupations_v1_enriched.tsv');
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);
  const h = lines[0].split('\t');
  return lines.slice(1).map(l => { const c = l.split('\t'); return Object.fromEntries(h.map((k, i) => [k, c[i] || ''])); });
}
// Optional external candidate catalogs (unpacked zips); paths via env, else skipped with a warning.
function loadOptionalCsv(envName) {
  const p = process.env[envName];
  if (!p || !fs.existsSync(p)) return null;
  return readCsv(p);
}

module.exports = { fs, path, HERE, DOMAIN_ROOT, GAME_BASE, NOVGOROD, REPO, parseCsv, readCsv, writeCsv, split, uniq, loadWk, loadPlaceFamilies, loadV5, loadOccupations, loadOptionalCsv };

// Material free-text resolver. Order: direct mt_ ids -> crosswalk codes (exact token) -> Russian stems (longest first).
// Stems of <=3 letters match only words at most 2 letters longer (avoids мел->мелкий, сол->солома).
function makeResolver(mats, deny, crosswalk) {
  const split2 = s => (s || '').split(';').map(x => x.trim()).filter(Boolean);
  const mtIds = new Set(mats.map(m => m.mt_id));
  const stems = mats.flatMap(m => split2(m.aliases_ru).map(s => [s.toLowerCase(), m.mt_id])).filter(([s]) => s.length >= 3).sort((a, b) => b[0].length - a[0].length);
  const xw = new Map((crosswalk || []).filter(r => r.mt_ids).map(r => [r.foreign_code.toLowerCase(), split2(r.mt_ids)]));
  const xwOut = new Map((crosswalk || []).filter(r => !r.mt_ids).map(r => [r.foreign_code.toLowerCase(), r.method]));
  const denyStems = (deny || []).filter(d => d.kind === 'material').flatMap(d => split2(d.match_stems).map(s => [s.toLowerCase(), d.dl_id]));
  const wordHit = (w, s) => w.startsWith(s) && (s.length > 3 || w.length <= s.length + 2);
  return function resolve(v) {
    const lower = String(v).toLowerCase();
    const deny = [...new Set(denyStems.filter(([s]) => lower.includes(s)).map(([, id]) => id))];
    const tokens = lower.split(/[,;/|()+]| и | или | с | \+ /).map(x => x.trim()).filter(Boolean);
    const mt = []; const unresolved = []; const outOfScope = [];
    for (const tok of tokens) {
      if (mtIds.has(tok)) { mt.push(tok); continue; }
      if (xw.has(tok)) { mt.push(...xw.get(tok)); continue; }
      if (xwOut.has(tok)) { outOfScope.push(tok); continue; }
      const words = tok.split(/[\s\-–—.:]+/).filter(Boolean);
      const hit = stems.find(([s]) => words.some(w => wordHit(w, s)));
      if (hit) mt.push(hit[1]); else unresolved.push(tok);
    }
    return { mt: [...new Set(mt)], unresolved, outOfScope, deny };
  };
}
module.exports.makeResolver = makeResolver;
