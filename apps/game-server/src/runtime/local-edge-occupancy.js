// One status text, shared by the current visible context (`visible_status` of the edge),
// the command's visible label and the route panel: the displayed label the player acts on
// must always equal what the panel shows.
export const LOCAL_EDGE_OCCUPIED_STATUS = 'проход занят';
export const localEdgeOccupiedLabel = (label) => `${label} (${LOCAL_EDGE_OCCUPIED_STATUS})`;
