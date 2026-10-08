import { passagePhrases } from
  '../../../../data/world-catalogs/novgorod/m2c-pass-target-labels/approved-labels.mjs';

// One status text (approved data, m2c-pass-target-labels `passage_phrases`), shared by the
// current visible context (`visible_status` of the edge), the command's visible label and
// the route panel: the displayed label the player acts on must always equal what the
// panel shows.
export const LOCAL_EDGE_OCCUPIED_STATUS = passagePhrases.local_edge_occupied;
export const localEdgeOccupiedLabel = (label) => `${label} (${LOCAL_EDGE_OCCUPIED_STATUS})`;
