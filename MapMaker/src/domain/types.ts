export type MapScaleLevel = "G1" | "G2" | "G3" | "G4";
export type NodeKnowledgeState = "visited" | "seen" | "known_exactly" | "known_roughly" | "rumored" | "doubtful";
export type EdgeKnowledgeState = "traversed" | "known_exactly" | "known_roughly" | "rumored" | "doubtful";
export type TraversalState = "open" | "restricted" | "blocked" | "seasonal" | "unknown";

export interface Point { x: number; y: number }

export interface MapBreadcrumb {
  nodeId: string;
  title: string;
  level: MapScaleLevel;
}

export interface MapNodeDTO {
  id: string;
  worldNodeId: string;
  title: string;
  shortLabel?: string;
  iconKey: string;
  x: number;
  y: number;
  labelPriority?: 1 | 2 | 3;
  knowledgeState: NodeKnowledgeState;
  current: boolean;
  selectable: boolean;
  hasKnownChildren: boolean;
  visibleStatus?: { blocked?: boolean; dangerous?: boolean; occupied?: boolean; changed?: boolean };
}

export interface DirectionState {
  traversalState: TraversalState;
  knownSummary?: string;
}

export interface MapEdgeDTO {
  id: string;
  source: string;
  target: string;
  edgeType: string;
  styleKey: string;
  markerKey?: string;
  knowledgeState: EdgeKnowledgeState;
  traversalState: TraversalState;
  bendPoints: Point[];
  knownSummary?: string;
  directions?: { forward?: DirectionState; reverse?: DirectionState };
}

export interface MapLegendItem { key: string; label: string; kind: "node" | "edge" | "state" }

export interface MapViewDTO {
  layout: {
    id: string;
    level: MapScaleLevel;
    parentNodeId: string;
    version: number;
    widthRatio: number;
    heightRatio: number;
  };
  breadcrumbs: MapBreadcrumb[];
  currentPosition: { nodeId: string; cameFromNodeId?: string; cameByVisualEdgeId?: string };
  nodes: MapNodeDTO[];
  edges: MapEdgeDTO[];
  legend: MapLegendItem[];
  viewPermissions: { canZoomOut: boolean; canOpenParent: boolean; canOpenChildren: boolean };
}

export interface CanonicalNode {
  id: string;
  parentNodeId: string;
  level: MapScaleLevel;
  title: string;
  nodeType: string;
  iconKey?: string;
  shortLabel?: string;
  hasChildren?: boolean;
}

export interface CanonicalEdge {
  id: string;
  reverseEdgeId?: string;
  source: string;
  target: string;
  edgeType: string;
}

export interface KnowledgeNode {
  nodeId: string;
  state: NodeKnowledgeState;
  visibleStatus?: MapNodeDTO["visibleStatus"];
}

export interface KnowledgeEdge {
  edgeId: string;
  state: EdgeKnowledgeState;
  traversalState: TraversalState;
  knownSummary?: string;
}

export interface SavedLayout {
  id: string;
  parentNodeId: string;
  level: MapScaleLevel;
  version: number;
  status: "draft" | "auto_validated" | "needs_semantic_review" | "approved" | "rejected";
  positions: Record<string, Point>;
  edgeGeometry?: Record<string, Point[]>;
}

export interface BuildMapViewInput {
  parentNodeId: string;
  level: MapScaleLevel;
  nodes: CanonicalNode[];
  edges: CanonicalEdge[];
  nodeKnowledge: KnowledgeNode[];
  edgeKnowledge: KnowledgeEdge[];
  layout: SavedLayout;
  currentNodeId: string;
  breadcrumbs?: MapBreadcrumb[];
}

export interface MapDataSource {
  loadView(request: { parentNodeId: string; level: MapScaleLevel }): Promise<MapViewDTO>;
}
