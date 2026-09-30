import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { buildReport } from './derive.mjs';
import { createLandRouter, firstChordFlowIntersection, nearestChordFlowApproach } from './land-route-search.mjs';

const here = new URL('./', import.meta.url);
const json = async url => JSON.parse(await readFile(url, 'utf8'));

export async function routeRemainingLandLines(candidate, corners, lineNameCandidate) {
  const report = await buildReport(candidate, undefined, lineNameCandidate);
  const lineById = new Map(report.lines.map(line => [line.id, line]));
  const affectedIds = new Set(report.spatial_topology_validation.nonwater_corridor_intrusions);
  for (const exception of candidate.topology_exceptions ?? []) {
    for (const id of exception.line_ids ?? []) affectedIds.add(id);
  }
  for (const issue of report.spatial_topology_validation.issues) {
    const match = issue.match(/^nonwater line ([^ ]+)/);
    if (match) affectedIds.add(match[1]);
  }
  const pairs = new Map();
  for (const id of affectedIds) {
    const line = lineById.get(id);
    if (!line || line.is_water) throw new Error(`Expected dry line for route search: ${id}`);
    const key = line.source_pair_id ?? line.world_route_id ?? line.route_trace_key;
    if (!key) throw new Error(`Dry line ${id} has no canonical route-trace key`);
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key).push(line);
  }

  const placeById = new Map(candidate.g5_places.map(place => [place.id, place]));
  const search20 = createLandRouter(candidate, corners, 20);
  let search10 = null;
  candidate.route_traces ??= {};
  const exceptions = [];
  const rows = [];
  for (const [key, lines] of [...pairs].sort(([a], [b]) => a.localeCompare(b))) {
    const canonical = lines.find(line => line.id.includes('dirv3f')) ?? lines[0];
    const from = placeById.get(canonical.from_id); const to = placeById.get(canonical.to_id);
    if (!from || !to) throw new Error(`Route ${key} has missing endpoint ${canonical.from_id} -> ${canonical.to_id}`);
    let result = search20.findPath(from, to);
    const attempts = [{ cell_m: 20, found: result.found, reason: result.reason ?? null }];
    if (!result.found) {
      search10 ??= createLandRouter(candidate, corners, 10);
      result = search10.findPath(from, to);
      attempts.push({ cell_m: 10, found: result.found, reason: result.reason ?? null });
    }
    if (result.found) {
      const points = result.points.map((point, index, all) => ({
        ...(index === 0 ? { id: from.id } : index === all.length - 1 ? { id: to.id } : {}),
        ...point,
      }));
      candidate.route_traces[key] = {
        key, from_id: from.id, to_id: to.id, points,
        segments: Array.from({ length: points.length - 1 }, () => ({ surface: 'land' })),
        geometry_status: `A* dry-mask path on ${result.cell_m}m grid; constrained Douglas–Peucker tolerance ${result.simplification_tolerance_m}m`,
        land_pathfinding: { ...result, points: undefined, attempts },
      };
      rows.push({ key, status: 'route_found', cell_m: result.cell_m, line_ids: lines.map(line => line.id),
        route_length_m: result.route_length_m, points: points.length, attempts });
      continue;
    }
    const crossing = firstChordFlowIntersection(from, to, candidate.flow_skeletons);
    const approach = crossing ? null : nearestChordFlowApproach(from, to, candidate.flow_skeletons);
    const chosen = crossing ?? approach ?? { waterbody_ref: null, point: null };
    const lineIds = lines.map(line => line.id).sort();
    const exception = {
      id: `topology_exception__${key}`,
      route_key: key,
      line_ids: lineIds,
      from_id: from.id,
      to_id: to.id,
      waterbody_ref: chosen.waterbody_ref,
      intersection_point: chosen.point,
      intersection_kind: crossing ? 'chord_axis_intersection' : approach ? 'nearest_chord_axis_approach' : 'unlocated',
      axis_point: approach?.axis_point ?? chosen.point,
      approach_distance_m: approach?.distance_m ?? 0,
      corridor_half_width_m: approach?.corridor_half_width_m ?? null,
      reason: 'ends on different banks',
      search_failure_reason: result.reason ?? 'A* found no dry route',
      endpoint_components: { start: result.start_components ?? [], end: result.end_components ?? [] },
      required_crossing_kind: ['ford', 'footbridge', 'ferry'],
      grid_attempts: attempts,
      owner_finding: 'dry graph line crosses authored water; Spatial/line-names owner must select ford, footbridge, or ferry if no dry trace is approved',
    };
    exceptions.push(exception);
    delete candidate.route_traces[key];
    rows.push({ key, status: 'topology_exception', line_ids: lineIds, waterbody_ref: chosen.waterbody_ref,
      intersection_point: chosen.point, reason: exception.reason, attempts });
  }
  candidate.topology_exceptions = exceptions;
  return { candidate, search_summary: { target_directed_lines: affectedIds.size, unique_pairs: pairs.size,
    routes_found: rows.filter(row => row.status === 'route_found').length,
    exceptions: exceptions.length, grid_20m_components: search20.component_count,
    grid_10m_components: search10?.component_count ?? null, rows } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const lineNamesPath = process.argv[2];
  const candidatePath = process.argv[3] ?? new URL('./candidate.json', here);
  const candidate = await json(candidatePath instanceof URL ? candidatePath : pathToFileURL(candidatePath));
  const lineNames = lineNamesPath ? await json(pathToFileURL(lineNamesPath)) : null;
  const dossier = await json(new URL('../staging/cells/gn_nov_g1_xp017_yp026/content_revision_002/g1-dossier.json', here));
  const { candidate: updated, search_summary: summary } = await routeRemainingLandLines(candidate,
    dossier.coordinates.technical_bounds.corners_wgs84, lineNames);
  await writeFile(candidatePath, `${JSON.stringify(updated, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
