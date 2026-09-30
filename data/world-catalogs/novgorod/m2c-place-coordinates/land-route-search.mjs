const radians = Math.PI / 180;
const mapScale = { x: 111195 * Math.cos(64.58 * radians), y: 111195 };
const toXY = point => [point.lon * mapScale.x, point.lat * mapScale.y];
const toWgs84 = ([x, y]) => ({ lon: x / mapScale.x, lat: y / mapScale.y });

function pointSegmentDistance(point, a, b) {
  const dx = b[0] - a[0]; const dy = b[1] - a[1]; const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2)) : 0;
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
}

function segmentsIntersect(a, b, c, d) {
  const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const abC = cross(a, b, c); const abD = cross(a, b, d);
  const cdA = cross(c, d, a); const cdB = cross(c, d, b);
  return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0));
}

function segmentDistance(a, b, c, d) {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

function insidePolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[j]; const b = polygon[i];
    if ((a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function distanceToFlows(point, flows, exceptId = null) {
  let nearest = Infinity;
  for (const flow of flows) {
    if (flow.id === exceptId) continue;
    for (let i = 1; i < flow.points.length; i += 1) {
      nearest = Math.min(nearest, pointSegmentDistance(point, flow.points[i - 1], flow.points[i]) - flow.width_m / 2);
    }
  }
  return nearest;
}

const flowsOf = skeletons => skeletons.map(flow => ({
  id: flow.id, width_m: flow.width_m,
  points: flow.points.map(([lat, lon]) => [lon * mapScale.x, lat * mapScale.y]),
}));

// One rule for how far a line may run inside water at its end: half-width + 50 m of every corridor that
// contains the end point (its own assigned corridor included), the largest of them. Used by the router
// and by validateSpatialTopology so both accept exactly the same access segments.
export function endpointAccess(place, skeletons, fallbackM = 0) {
  if (!place.waterbody_ref) return { flowIds: new Set(), maxDistanceM: fallbackM }; // a dry end has no water access
  const flows = flowsOf(skeletons); const endpoint = toXY(place);
  const ids = new Set(flows.filter(flow => distanceToFlows(endpoint, [flow]) <= 0).map(flow => flow.id));
  if (flows.some(flow => flow.id === place.waterbody_ref)) ids.add(place.waterbody_ref);
  const allowances = flows.filter(flow => ids.has(flow.id)).map(flow => flow.width_m / 2 + 50);
  return { flowIds: ids, maxDistanceM: allowances.length ? Math.max(...allowances) : fallbackM };
}

class MinHeap {
  values = [];
  push(value) {
    const values = this.values; let index = values.length; values.push(value);
    while (index) {
      const parent = (index - 1) >> 1;
      if (values[parent].score <= value.score) break;
      values[index] = values[parent]; index = parent;
    }
    values[index] = value;
  }
  pop() {
    const values = this.values; const first = values[0]; const last = values.pop();
    if (values.length) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1; const right = left + 1;
        if (left >= values.length) break;
        const child = right < values.length && values[right].score < values[left].score ? right : left;
        if (values[child].score >= last.score) break;
        values[index] = values[child]; index = child;
      }
      values[index] = last;
    }
    return first;
  }
  get length() { return this.values.length; }
}

function simplifyPath(points, toleranceM, clearSegment) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length); keep[0] = 1; keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    const a = points[start]; const b = points[end];
    let maxDistance = -1; let split = -1;
    for (let i = start + 1; i < end; i += 1) {
      const distance = pointSegmentDistance(points[i], a, b);
      if (distance > maxDistance) { maxDistance = distance; split = i; }
    }
    if (split < 0) continue;
    if (maxDistance > toleranceM || !clearSegment(a, b)) {
      keep[split] = 1;
      stack.push([start, split], [split, end]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

export function createLandRouter(candidate, cornersWgs84, cellM) {
  if (![10, 20].includes(cellM)) throw new Error(`Unsupported land-routing grid ${cellM}m`);
  const scale = Math.SQRT2 * cellM / 2;
  const polygon = cornersWgs84.map(point => [point.longitude * mapScale.x, point.latitude * mapScale.y]);
  const minX = Math.min(...polygon.map(point => point[0])); const maxX = Math.max(...polygon.map(point => point[0]));
  const minY = Math.min(...polygon.map(point => point[1])); const maxY = Math.max(...polygon.map(point => point[1]));
  const width = Math.ceil((maxX - minX) / cellM); const height = Math.ceil((maxY - minY) / cellM);
  const size = width * height;
  if (size > 14_000_000) throw new Error(`Land-routing grid too large: ${size} cells`);
  const flows = flowsOf(candidate.flow_skeletons);
  const passable = new Uint8Array(size);
  for (let row = 0; row < height; row += 1) for (let col = 0; col < width; col += 1) {
    const point = [minX + (col + 0.5) * cellM, minY + (row + 0.5) * cellM];
    if (insidePolygon(point, polygon)) passable[row * width + col] = 1;
  }
  for (const flow of flows) for (let segment = 1; segment < flow.points.length; segment += 1) {
    const a = flow.points[segment - 1]; const b = flow.points[segment]; const radius = flow.width_m / 2 + scale;
    const minCol = Math.max(0, Math.floor((Math.min(a[0], b[0]) - radius - minX) / cellM));
    const maxCol = Math.min(width - 1, Math.floor((Math.max(a[0], b[0]) + radius - minX) / cellM));
    const minRow = Math.max(0, Math.floor((Math.min(a[1], b[1]) - radius - minY) / cellM));
    const maxRow = Math.min(height - 1, Math.floor((Math.max(a[1], b[1]) + radius - minY) / cellM));
    for (let row = minRow; row <= maxRow; row += 1) for (let col = minCol; col <= maxCol; col += 1) {
      const index = row * width + col; if (!passable[index]) continue;
      const point = [minX + (col + 0.5) * cellM, minY + (row + 0.5) * cellM];
      if (pointSegmentDistance(point, a, b) <= radius) passable[index] = 0;
    }
  }

  const components = new Int32Array(size); components.fill(-1);
  const queue = new Int32Array(size); let componentCount = 0;
  for (let start = 0; start < size; start += 1) {
    if (!passable[start] || components[start] >= 0) continue;
    let head = 0; let tail = 0; queue[tail++] = start; components[start] = componentCount;
    while (head < tail) {
      const current = queue[head++]; const col = current % width;
      const neighbors = [col ? current - 1 : -1, col + 1 < width ? current + 1 : -1,
        current >= width ? current - width : -1, current + width < size ? current + width : -1];
      for (const next of neighbors) if (next >= 0 && passable[next] && components[next] < 0) {
        components[next] = componentCount; queue[tail++] = next;
      }
    }
    componentCount += 1;
  }

  const pointAt = index => [minX + (index % width + 0.5) * cellM,
    minY + (Math.floor(index / width) + 0.5) * cellM];
  const allowedEndpoint = place => endpointAccess(place, candidate.flow_skeletons, cellM * Math.SQRT2);
  const endpointSeeds = place => {
    const endpoint = toXY(place); const { flowIds, maxDistanceM } = allowedEndpoint(place);
    const radius = maxDistanceM + cellM;
    const minCol = Math.max(0, Math.floor((endpoint[0] - radius - minX) / cellM));
    const maxCol = Math.min(width - 1, Math.floor((endpoint[0] + radius - minX) / cellM));
    const minRow = Math.max(0, Math.floor((endpoint[1] - radius - minY) / cellM));
    const maxRow = Math.min(height - 1, Math.floor((endpoint[1] + radius - minY) / cellM));
    const seeds = [];
    for (let row = minRow; row <= maxRow; row += 1) for (let col = minCol; col <= maxCol; col += 1) {
      const index = row * width + col;
      if (!passable[index]) continue;
      const point = pointAt(index); const distance = Math.hypot(point[0] - endpoint[0], point[1] - endpoint[1]);
      if (distance > maxDistanceM || distanceToFlows(point, flows) <= 0 || !clearSegment(endpoint, point, flowIds)) continue;
      seeds.push({ index, distance });
    }
    return seeds;
  };
  const clearSegment = (a, b, exceptFlowIds = new Set()) => flows.every(flow => exceptFlowIds.has(flow.id)
    || flow.points.slice(1).every((point, index) => segmentDistance(a, b, flow.points[index], point) > flow.width_m / 2));

  // The corridor whose banks touch both a start component and an end component: the real obstacle between them.
  // Among several, the one nearest the straight chord. Null when no corridor separates them (e.g. the cell edge does).
  function separatingCorridor(startComponents, endComponents, from, to) {
    const startSet = new Set(startComponents); const endSet = new Set(endComponents);
    const a = toXY(from); const b = toXY(to); const candidates = [];
    for (const flow of flows) {
      const reach = flow.width_m / 2 + cellM * 3; const touched = new Set();
      for (let segment = 1; segment < flow.points.length; segment += 1) {
        const p = flow.points[segment - 1]; const q = flow.points[segment];
        const minCol = Math.max(0, Math.floor((Math.min(p[0], q[0]) - reach - minX) / cellM));
        const maxCol = Math.min(width - 1, Math.floor((Math.max(p[0], q[0]) + reach - minX) / cellM));
        const minRow = Math.max(0, Math.floor((Math.min(p[1], q[1]) - reach - minY) / cellM));
        const maxRow = Math.min(height - 1, Math.floor((Math.max(p[1], q[1]) + reach - minY) / cellM));
        for (let row = minRow; row <= maxRow; row += 1) for (let col = minCol; col <= maxCol; col += 1) {
          const index = row * width + col;
          if (components[index] >= 0 && pointSegmentDistance(pointAt(index), p, q) <= reach) touched.add(components[index]);
        }
      }
      if ([...touched].some(id => startSet.has(id)) && [...touched].some(id => endSet.has(id))) {
        let distance = Infinity;
        for (let i = 1; i < flow.points.length; i += 1) distance = Math.min(distance, segmentDistance(a, b, flow.points[i - 1], flow.points[i]));
        candidates.push({ waterbody_ref: flow.id, chord_distance_m: Math.round(distance) });
      }
    }
    candidates.sort((x, y) => x.chord_distance_m - y.chord_distance_m || x.waterbody_ref.localeCompare(y.waterbody_ref));
    return candidates[0] ?? null;
  }

  function findPath(from, to) {
    const starts = endpointSeeds(from); const goals = endpointSeeds(to);
    const commonComponents = new Set(starts.map(seed => components[seed.index]).filter(id => id >= 0));
    const reachableGoals = goals.filter(seed => commonComponents.has(components[seed.index]));
    if (!starts.length || !goals.length) return { found: false, failure_kind: 'blocker',
      reason: 'endpoint cannot reach dry mask within its water-access allowance',
      start_seed_count: starts.length, end_seed_count: goals.length, component_count: componentCount };
    if (!reachableGoals.length) {
      const startComponents = [...new Set(starts.map(seed => components[seed.index]))].filter(id => id >= 0).sort((a, b) => a - b);
      const endComponents = [...new Set(goals.map(seed => components[seed.index]))].filter(id => id >= 0).sort((a, b) => a - b);
      return { found: false, failure_kind: 'different_components', reason: 'endpoints lie on different dry-mask components',
        start_seed_count: starts.length, end_seed_count: goals.length, component_count: componentCount,
        start_components: startComponents, end_components: endComponents,
        barrier: separatingCorridor(startComponents, endComponents, from, to) };
    }

    const common = new Set(reachableGoals.map(seed => components[seed.index]));
    const validStarts = starts.filter(seed => common.has(components[seed.index]));
    const validGoals = new Map(reachableGoals.map(seed => [seed.index, seed.distance]));
    const costs = new Float64Array(size); costs.fill(Infinity);
    const previous = new Int32Array(size); previous.fill(-1);
    const open = new MinHeap(); const endXY = toXY(to);
    for (const seed of validStarts) if (seed.distance < costs[seed.index]) {
      costs[seed.index] = seed.distance;
      const point = pointAt(seed.index);
      open.push({ index: seed.index, cost: seed.distance, score: seed.distance + Math.hypot(point[0] - endXY[0], point[1] - endXY[1]) });
    }
    let foundIndex = -1;
    const offsets = [-width, -1, 1, width];
    while (open.length) {
      const current = open.pop();
      if (current.cost !== costs[current.index]) continue;
      if (validGoals.has(current.index)) { foundIndex = current.index; break; }
      const col = current.index % width;
      for (const offset of offsets) {
        const next = current.index + offset;
        if (next < 0 || next >= size || (offset === -1 && col === 0) || (offset === 1 && col + 1 === width)
          || !passable[next] || components[next] !== components[current.index]) continue;
        const cost = current.cost + cellM;
        if (cost >= costs[next]) continue;
        costs[next] = cost; previous[next] = current.index;
        const point = pointAt(next);
        open.push({ index: next, cost, score: cost + Math.hypot(point[0] - endXY[0], point[1] - endXY[1]) });
      }
    }
    if (foundIndex < 0) return { found: false, failure_kind: 'blocker', reason: 'A* exhausted shared dry-mask component',
      start_seed_count: starts.length, end_seed_count: goals.length, component_count: componentCount };

    const cells = [];
    for (let index = foundIndex; index >= 0; index = previous[index]) {
      cells.push(index); if (previous[index] < 0) break;
    }
    cells.reverse();
    const rawGrid = cells.map(index => pointAt(index));
    const smoothGrid = simplifyPath(rawGrid, cellM * 2, (a, b) => clearSegment(a, b));
    const start = toXY(from); const end = toXY(to);
    const startCell = rawGrid[0]; const endCell = rawGrid.at(-1);
    const startFlow = allowedEndpoint(from).flowIds; const endFlow = allowedEndpoint(to).flowIds;
    if (!clearSegment(start, startCell, startFlow) || !clearSegment(endCell, end, endFlow)) {
      return { found: false, failure_kind: 'blocker', reason: 'endpoint access segment crosses another water corridor',
        start_seed_count: starts.length, end_seed_count: goals.length, component_count: componentCount };
    }
    const pathXY = [start, ...smoothGrid, end].filter((point, index, all) => index === 0
      || Math.hypot(point[0] - all[index - 1][0], point[1] - all[index - 1][1]) > 0.5);
    const points = pathXY.map(toWgs84);
    const routeLengthM = pathXY.slice(1).reduce((sum, point, index) => sum + Math.hypot(
      point[0] - pathXY[index][0], point[1] - pathXY[index][1]), 0);
    return { found: true, cell_m: cellM, component: components[foundIndex], points,
      start_seed_count: starts.length, end_seed_count: goals.length, component_count: componentCount,
      route_length_m: Math.round(routeLengthM), simplification_tolerance_m: cellM * 2,
      solver: 'A* four-neighbor grid; Douglas–Peucker simplification constrained outside water corridors' };
  }

  return { cell_m: cellM, width, height, component_count: componentCount, findPath };
}

export function firstChordFlowIntersection(from, to, skeletons) {
  const a = toXY(from); const b = toXY(to);
  for (const skeleton of skeletons) {
    const flow = skeleton.points.map(([lat, lon]) => [lon * mapScale.x, lat * mapScale.y]);
    for (let i = 1; i < flow.length; i += 1) {
      const c = flow[i - 1]; const d = flow[i];
      const rx = b[0] - a[0]; const ry = b[1] - a[1];
      const sx = d[0] - c[0]; const sy = d[1] - c[1]; const denominator = rx * sy - ry * sx;
      if (Math.abs(denominator) < 1e-9) continue;
      const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / denominator;
      const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / denominator;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { waterbody_ref: skeleton.id,
        point: toWgs84([a[0] + t * rx, a[1] + t * ry]) };
    }
  }
  return null;
}

export function nearestChordFlowApproach(from, to, skeletons) {
  const a = toXY(from); const b = toXY(to);
  let nearest = null;
  for (const skeleton of skeletons) {
    const flow = skeleton.points.map(([lat, lon]) => [lon * mapScale.x, lat * mapScale.y]);
    for (let i = 1; i < flow.length; i += 1) {
      const c = flow[i - 1]; const d = flow[i];
      const candidates = [
        [a, pointSegmentDistance(a, c, d)], [b, pointSegmentDistance(b, c, d)],
        [c, pointSegmentDistance(c, a, b)], [d, pointSegmentDistance(d, a, b)],
      ];
      const best = candidates.reduce((x, y) => x[1] < y[1] ? x : y);
      const pointOnChord = (() => {
        const dx = b[0] - a[0]; const dy = b[1] - a[1]; const length2 = dx * dx + dy * dy;
        const t = length2 ? Math.max(0, Math.min(1, ((best[0][0] - a[0]) * dx + (best[0][1] - a[1]) * dy) / length2)) : 0;
        return [a[0] + t * dx, a[1] + t * dy];
      })();
      const distance = pointSegmentDistance(pointOnChord, c, d);
      if (!nearest || distance < nearest.distance_m) nearest = {
        waterbody_ref: skeleton.id, point: toWgs84(pointOnChord), axis_point: toWgs84(best[0]),
        distance_m: Math.round(distance), corridor_half_width_m: skeleton.width_m / 2,
      };
    }
  }
  return nearest;
}
