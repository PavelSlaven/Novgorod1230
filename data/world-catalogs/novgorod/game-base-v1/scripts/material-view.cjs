'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const GAME_BASE = path.resolve(__dirname, '..');
const VIEW_PATH = path.join(GAME_BASE, 'generated/master-material-material-view.json');
const OVERLAY_PATH = path.join(GAME_BASE, 'source-overlays/master-material-materials.csv');
const OVERLAY_REF = 'data/world-catalogs/novgorod/game-base-v1/source-overlays/master-material-materials.csv:';
const FIELDS = ['item_id', 'primary_material', 'materials'];

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readOverlayItemIds(overlayPath) {
  const text = fs.readFileSync(overlayPath, 'utf8').replace(/^\uFEFF/u, '');
  const lines = text.split(/\r?\n/u);
  const firstCsvCell = line => {
    if (!line.startsWith('"')) return line.split(',', 1)[0];
    let value = '';
    for (let index = 1; index < line.length; index += 1) {
      if (line[index] !== '"') {
        value += line[index];
      } else if (line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        if (line[index + 1] && line[index + 1] !== ',') throw new Error('invalid material overlay CSV item_id');
        return value;
      }
    }
    throw new Error('invalid material overlay CSV item_id');
  };
  if (firstCsvCell(lines[0] || '') !== 'item_id') throw new Error('material overlay lacks item_id column');

  const rows = lines.slice(1);
  if (rows.at(-1) === '') rows.pop();
  const ids = rows.map(firstCsvCell);
  const seen = new Set();
  for (const itemId of ids) {
    if (!itemId || seen.has(itemId)) throw new Error(`material overlay has missing or duplicate item_id: ${itemId}`);
    seen.add(itemId);
  }
  return seen;
}

function incompleteViewError(missing, extra) {
  const error = new Error(`material view is incomplete; missing item_ids: ${JSON.stringify(missing)}; extra item_ids: ${JSON.stringify(extra)}`);
  error.code = 'MATERIAL_VIEW_INCOMPLETE';
  return error;
}

function loadMaterialOverrides(sourcePath, { viewPath = VIEW_PATH, overlayPath = OVERLAY_PATH } = {}) {
  const view = JSON.parse(fs.readFileSync(viewPath, 'utf8'));
  const sourceSha = sha256(fs.readFileSync(sourcePath));
  const overlaySha = sha256(fs.readFileSync(overlayPath));
  if (view.overlay_sha256 !== overlaySha) {
    const error = new Error('material view is stale for the material overlay');
    error.code = 'MATERIAL_VIEW_OVERLAY_STALE';
    throw error;
  }
  if (view.source_sha256 !== sourceSha) {
    const error = new Error('material view is stale for the normalized master source');
    error.code = 'MATERIAL_VIEW_SOURCE_STALE';
    throw error;
  }
  const overlayIds = readOverlayItemIds(overlayPath);
  if (!Array.isArray(view.rows)) {
    throw incompleteViewError([...overlayIds].sort(), []);
  }
  const result = new Map();
  for (const row of view.rows) {
    if (Object.keys(row).sort().join(',') !== [...FIELDS].sort().join(',') || !row.item_id || result.has(row.item_id)) {
      throw new Error('material view has invalid or duplicate projected row');
    }
    result.set(row.item_id, row);
  }
  const missing = [...overlayIds].filter(itemId => !result.has(itemId)).sort();
  const extra = [...result.keys()].filter(itemId => !overlayIds.has(itemId)).sort();
  if (missing.length || extra.length) throw incompleteViewError(missing, extra);
  return result;
}

function applyMaterialOverrides(rows, sourcePath, options) {
  const overrides = loadMaterialOverrides(sourcePath, options);
  return rows.map(row => {
    const override = overrides.get(row.item_id);
    return override ? { ...row, primary_material: override.primary_material, materials: override.materials } : row;
  });
}

function overlaySourceRef(itemId, sourcePath) {
  return loadMaterialOverrides(sourcePath).has(itemId) ? `${OVERLAY_REF}${itemId}` : '';
}

module.exports = { applyMaterialOverrides, overlaySourceRef };
