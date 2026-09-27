// Recreate the small, committed appearance input from its pinned Git source.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { GROUP, REPO, writeJson } from './lib.mjs';

export const SOURCE = {
  commit: '745b9c874d73f1411c1fec2669c0e4e1b8e10e9a',
  path: 'data/world-catalogs/novgorod/live-world-runtime-v17/appearance-transfer-v3-datasets/universal_categories.json',
  blob: 'bab44418384a0be5270ce1922c32ae65a78af255',
  sha256: '539b555f9b1e025fa69d2816ec4f4171c7814862321a75c7ec8ca5e60a9f29cc',
};
const EXTRACT = path.join(GROUP, 'inputs/appearance-categories.json');
const FIELDS = ['id', 'domain', 'facet', 'stable_code', 'parent_category_id', 'preferred_label', 'status'];
const ROWS_SHA256 = '613ff054065eb608c128f28d1a9c036492025e8ba9e0b4bf062e92b25e008ba9';
const hash = (data) => crypto.createHash('sha256').update(data).digest('hex');
const project = (rows) => rows.map((row) => Object.fromEntries(FIELDS.map((field) => [field, row[field]])));

export function readAppearanceExtract() {
  const extract = JSON.parse(fs.readFileSync(EXTRACT, 'utf8'));
  if (extract.schema !== 'places_binding_appearance_categories_v1' ||
      JSON.stringify(extract.source) !== JSON.stringify(SOURCE) ||
      !Array.isArray(extract.categories) || extract.categories.length !== 42 ||
      extract.categories.some((row) => Object.keys(row).join(',') !== FIELDS.join(',') ||
        row.domain !== 'actor_appearance' ||
        FIELDS.filter((field) => field !== 'parent_category_id').some((field) => typeof row[field] !== 'string' || !row[field]) ||
        (row.parent_category_id !== null && typeof row.parent_category_id !== 'string')) ||
      hash(JSON.stringify(extract.categories)) !== ROWS_SHA256) {
    throw new Error(`Appearance category extract is malformed or differs from pinned source: ${EXTRACT}`);
  }
  return extract.categories;
}

if (process.argv[1]?.endsWith('export-appearance-categories.mjs')) {
  if (process.argv[2] === '--check') {
    readAppearanceExtract();
    console.log('appearance category extract: 42 pinned rows OK');
  } else if (process.argv.length === 2) {
    const bytes = execFileSync('git', ['show', `${SOURCE.commit}:${SOURCE.path}`], { cwd: REPO, maxBuffer: 1024 * 1024 });
    if (hash(bytes) !== SOURCE.sha256) throw new Error('Appearance category source SHA256 mismatch');
    const categories = project(JSON.parse(bytes));
    if (categories.length !== 42 || hash(JSON.stringify(categories)) !== ROWS_SHA256) throw new Error('Appearance category source content mismatch');
    writeJson(EXTRACT, { schema: 'places_binding_appearance_categories_v1', source: SOURCE, categories });
    readAppearanceExtract();
    console.log('appearance category extract: wrote 42 pinned rows');
  } else throw new Error('Usage: node export-appearance-categories.mjs [--check]');
}
