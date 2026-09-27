'use strict';
const fs = require('fs');
const path = require('path');

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Unescape a single TSV field that carries CSV-style quoting (source files embed JSON
// arrays as `"[""a"", ""b""]"`): strip one layer of surrounding double quotes and collapse
// doubled quotes to one. Fields without a leading quote are returned unchanged.
function unescapeTsvField(field) {
  if (field.length >= 2 && field[0] === '"' && field[field.length - 1] === '"') {
    return field.slice(1, -1).replace(/""/g, '"');
  }
  return field;
}

function parseTsv(text) {
  return text.split(/\r?\n/).filter(Boolean).map(l => l.split('\t').map(unescapeTsvField));
}

function loadCsvObjects(file, delim) {
  const text = fs.readFileSync(file, 'utf8');
  const rows = (delim === '\t') ? parseTsv(text) : parseCsv(text).filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
  const header = rows[0];
  return rows.slice(1).map(r => {
    const o = {};
    header.forEach((h, i) => { o[h] = r[i] !== undefined ? r[i] : ''; });
    return o;
  });
}

// CSV writer: array of field names + array of row objects
function writeCsv(file, fields, rows) {
  const esc = (v) => {
    if (v === undefined || v === null) v = '';
    v = String(v);
    if (/[",\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  };
  const lines = [fields.join(',')];
  for (const r of rows) {
    lines.push(fields.map(f => esc(r[f])).join(','));
  }
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
}

const CONF_RANK = { A: 3, B: 2, C: 1 };
function worstConfidence(list) {
  let worst = 'A';
  for (const c of list) {
    if (CONF_RANK[c] !== undefined && CONF_RANK[c] < CONF_RANK[worst]) worst = c;
  }
  return worst;
}

function bookRef(row) {
  return `book:${row.book_id} §${row.section_path} ¶${row.para_no}`;
}

function loadBookEvidence(csvFile, domain) {
  const rows = loadCsvObjects(csvFile, ',');
  return rows.filter(r => r.domain === domain);
}

function groupByEntity(rows) {
  const byEntity = new Map();
  for (const r of rows) {
    const key = r.entity_ru;
    if (!byEntity.has(key)) byEntity.set(key, []);
    byEntity.get(key).push(r);
  }
  return byEntity;
}

module.exports = {
  parseCsv, parseTsv, loadCsvObjects, writeCsv,
  worstConfidence, bookRef, loadBookEvidence, groupByEntity,
};
