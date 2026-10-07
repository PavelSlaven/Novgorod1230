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

function loadMaterialOverrides(sourcePath) {
  const view = JSON.parse(fs.readFileSync(VIEW_PATH, 'utf8'));
  const sourceSha = sha256(fs.readFileSync(sourcePath));
  const overlaySha = sha256(fs.readFileSync(OVERLAY_PATH));
  if (view.source_sha256 !== sourceSha || view.overlay_sha256 !== overlaySha) {
    throw new Error('material view is stale for the normalized master source or overlay');
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

function applyMaterialOverrides(rows, sourcePath) {
  const overrides = loadMaterialOverrides(sourcePath);
  return rows.map(row => {
    const override = overrides.get(row.item_id);
    return override ? { ...row, primary_material: override.primary_material, materials: override.materials } : row;
  });
}

function overlaySourceRef(itemId, sourcePath) {
  return loadMaterialOverrides(sourcePath).has(itemId) ? `${OVERLAY_REF}${itemId}` : '';
}

module.exports = { applyMaterialOverrides, overlaySourceRef };
