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
  const result = new Map();
  for (const row of view.rows || []) {
    if (Object.keys(row).sort().join(',') !== [...FIELDS].sort().join(',') || !row.item_id || result.has(row.item_id)) {
      throw new Error('material view has invalid or duplicate projected row');
    }
    result.set(row.item_id, row);
  }
  if (result.size !== 22) throw new Error(`material view must contain 22 rows, found ${result.size}`);
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
