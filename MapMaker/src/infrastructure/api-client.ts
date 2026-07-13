import type { MapDataSource, MapScaleLevel, MapViewDTO } from "../domain/types.js";

export class HttpMapDataSource implements MapDataSource {
  constructor(private readonly baseUrl: string, private readonly fetcher: typeof fetch = fetch) {}

  async loadView(request: { parentNodeId: string; level: MapScaleLevel }): Promise<MapViewDTO> {
    const url = new URL("map/view", this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`);
    url.searchParams.set("parentNodeId", request.parentNodeId);
    url.searchParams.set("level", request.level);
    const response = await this.fetcher(url);
    if (!response.ok) throw new Error(`map_request_failed:${response.status}`);
    return response.json() as Promise<MapViewDTO>;
  }
}
