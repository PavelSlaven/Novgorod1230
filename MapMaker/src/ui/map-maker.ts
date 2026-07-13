import cytoscape, { type Core, type EventObject } from "cytoscape";
import type { MapDataSource, MapScaleLevel, MapViewDTO } from "../domain/types.js";
import { validateMapView } from "../application/validate-map-view.js";
import { iconDataUri } from "../infrastructure/assets.js";

export interface MapMakerOptions {
  dataSource?: MapDataSource;
  mode?: "compact" | "full";
  onNodeSelect?: (nodeId: string) => void;
  onOpenChildren?: (nodeId: string) => void;
  onEdgeSelect?: (edgeId: string) => void;
  onNavigate?: (parentNodeId: string, level: MapScaleLevel) => void;
}

export class MapMaker {
  private readonly root: HTMLElement;
  private readonly graphHost: HTMLElement;
  private readonly title: HTMLElement;
  private readonly breadcrumbs: HTMLElement;
  private readonly details: HTMLElement;
  private cy?: Core;

  constructor(container: HTMLElement, private readonly options: MapMakerOptions = {}) {
    this.root = document.createElement("section");
    this.root.className = `mm-root mm-${options.mode ?? "full"}`;
    this.root.innerHTML = `<header class="mm-header"><nav class="mm-breadcrumbs" aria-label="Масштаб карты"></nav><strong class="mm-title"></strong></header><div class="mm-square"><div class="mm-graph"></div></div><aside class="mm-details" aria-live="polite"></aside>`;
    container.replaceChildren(this.root);
    this.graphHost = this.root.querySelector<HTMLElement>(".mm-graph")!;
    this.title = this.root.querySelector<HTMLElement>(".mm-title")!;
    this.breadcrumbs = this.root.querySelector<HTMLElement>(".mm-breadcrumbs")!;
    this.details = this.root.querySelector<HTMLElement>(".mm-details")!;
  }

  async open(parentNodeId: string, level: MapScaleLevel): Promise<void> {
    if (!this.options.dataSource) throw new Error("map_data_source_missing");
    this.root.setAttribute("aria-busy", "true");
    try { this.setView(await this.options.dataSource.loadView({ parentNodeId, level })); }
    finally { this.root.removeAttribute("aria-busy"); }
  }

  setView(view: MapViewDTO): void {
    validateMapView(view);
    this.cy?.destroy();
    this.title.textContent = view.layout.level;
    this.renderBreadcrumbs(view);
    const size = Math.max(320, Math.min(this.graphHost.clientWidth || 720, this.graphHost.clientHeight || 720));
    const position = (x: number, y: number) => ({ x: x * size, y: y * size });
    this.cy = cytoscape({
      container: this.graphHost,
      elements: [
        ...view.nodes.map((node) => ({ data: { ...node, currentFlag: node.current ? "yes" : "no", icon: iconDataUri(node.iconKey), label: node.shortLabel ?? node.title }, position: position(node.x, node.y) })),
        ...view.edges.map((edge) => ({ data: edge, classes: `${edge.styleKey} knowledge-${edge.knowledgeState} traversal-${edge.traversalState}` }))
      ],
      layout: { name: "preset", fit: true, padding: 34 }, minZoom: 0.45, maxZoom: 3,
      style: [
        { selector: "node", style: { width: 42, height: 42, "background-image": "data(icon)", "background-fit": "cover", "background-opacity": 0,
          label: "", "overlay-opacity": 0, "border-width": 0 } },
        { selector: "node[labelPriority = 3]", style: { label: "data(label)", "font-size": "11px", "text-wrap": "wrap", "text-max-width": "110px",
          "text-valign": "bottom", "text-margin-y": 8, color: "#2c241b", "text-background-color": "#f4ead0", "text-background-opacity": 0.9, "text-background-padding": "3px" } },
        { selector: "node[currentFlag = 'yes']", style: { "border-width": 4, "border-color": "#b92722", "border-opacity": 1 } },
        { selector: "edge", style: { width: 3, "line-color": "#7c674b", "curve-style": "round-segments", opacity: 0.9 } },
        { selector: "edge.path, edge.forest_track, edge.offroad_crossing", style: { width: 2, "line-style": "dashed" } },
        { selector: "edge.river, edge.lake_route", style: { width: 7, "line-color": "#5795a8", "curve-style": "unbundled-bezier" } },
        { selector: "edge.street", style: { width: 6, "line-color": "#9b886b" } },
        { selector: "edge.door, edge.gate, edge.yard_passage", style: { width: 2, "curve-style": "straight" } },
        { selector: "edge.traversal-blocked", style: { "line-color": "#a72d27", "line-style": "dashed" } },
        { selector: "edge.knowledge-rumored, edge.knowledge-doubtful", style: { opacity: 0.5, "line-style": "dotted" } },
        { selector: ":selected", style: { "overlay-color": "#c99b3d", "overlay-opacity": 0.2, "overlay-padding": 8 } }
      ]
    });
    this.cy.on("tap", "node", (event: EventObject) => {
      const data = event.target.data();
      this.details.textContent = `${data.title} · ${data.knowledgeState}`;
      this.options.onNodeSelect?.(data.id);
    });
    this.cy.on("dbltap", "node", (event: EventObject) => {
      const data = event.target.data();
      if (data.hasKnownChildren) this.options.onOpenChildren?.(data.id);
    });
    this.cy.on("tap", "edge", (event: EventObject) => {
      const data = event.target.data();
      this.details.textContent = data.knownSummary ?? data.edgeType;
      this.options.onEdgeSelect?.(data.id);
    });
  }

  private renderBreadcrumbs(view: MapViewDTO): void {
    this.breadcrumbs.replaceChildren(...view.breadcrumbs.map((crumb, index) => {
      const button = document.createElement("button");
      button.type = "button"; button.textContent = crumb.title; button.className = "mm-crumb";
      button.disabled = index === view.breadcrumbs.length - 1;
      button.addEventListener("click", () => this.options.onNavigate?.(crumb.nodeId, crumb.level));
      return button;
    }));
  }

  focusCurrent(): void { this.cy?.nodes("[currentFlag = 'yes']").first().select(); }
  destroy(): void { this.cy?.destroy(); this.root.remove(); }
}
