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

function parseCsvRows(text) {
  text = text.replace(/^\uFEFF/u, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (character !== '\r') {
      field += character;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(record => record.length > 1 || record[0] !== '');
}

function readOverlayItemIds(overlayPath) {
  const [header = [], ...rows] = parseCsvRows(fs.readFileSync(overlayPath, 'utf8'));
  const itemIdColumn = header.indexOf('item_id');
  if (itemIdColumn < 0) throw new Error('material overlay lacks item_id column');
  const ids = rows.map(row => row[itemIdColumn] || '');
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
