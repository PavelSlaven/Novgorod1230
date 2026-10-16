import { loadG0RegionIdForSpatialNode } from '@rus/runtime-catalog';
import { loadPinnedG4NodeRef } from './ordinary-materialization-presence-first-arrival.js';

/** Resolve the region of the committed G4 node through the pinned catalog owner. */
export function createNeedsCheckRegionResolver({ worldBaseReader } = {}) {
  if (typeof worldBaseReader?.read !== 'function') {
    throw new TypeError('worldBaseReader.read is required.');
  }
  const regions = new Map();
  return async function resolveRegion({ committedState, catalogContext } = {}) {
    const spatialWorldPin = spatialPin(catalogContext?.world_pin);
    const runtimeCatalogPin = catalogContext?.pin;
    const nodeId = committedState?.position?.g4_id;
    if (!spatialWorldPin || !runtimeCatalogPin || typeof nodeId !== 'string'
        || nodeId.length === 0) return null;
    const node = await loadPinnedG4NodeRef({ worldBaseReader,
      spatialWorldPin, nodeId });
    if (node == null) return null;
    const key = `${spatialWorldPin.world_revision_id}:${node.id}:${node.version}`;
    if (!regions.has(key)) {
      const pending = loadG0RegionIdForSpatialNode({ worldBaseReader,
        spatialWorldPin, worldPin: catalogContext.world_pin,
        runtimeCatalogPin, nodeId: node.id, nodeVersion: node.version
      }).catch((error) => {
        regions.delete(key);
        throw error;
      });
      regions.set(key, pending);
    }
    return regions.get(key);
  };
}

function spatialPin(worldPin) {
  if (typeof worldPin?.world_revision_id !== 'string'
      || typeof worldPin?.world_catalog_digest !== 'string') return null;
  return { world_revision_id: worldPin.world_revision_id,
    catalog_digest: worldPin.world_catalog_digest };
}
