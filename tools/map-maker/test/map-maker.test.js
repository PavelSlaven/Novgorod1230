import test from 'node:test';
import assert from 'node:assert/strict';
import { createSquareLayout, importGraphDocument, projectRenderableGraph, renderGraphSvg, validateGameGraph, validateLayoutSidecar } from '../src/index.js';

function graphFixture() {
  return {
    nodes: [
      { id:'root', scale_level:'G0', node_type:'world', x:10, y:20 },
      { id:'cell', scale_level:'G1', node_type:'region_cell', parent_node_id:'root', grid_x:0, grid_y:0, grid_z:0, cell_size_km:32, crossing_base_gu:8, crossing_base_time_hours:24 },
      { id:'place', scale_level:'G2', node_type:'place', parent_node_id:'cell' }
    ],
    links: [
      { source:'cell', target:'place', scale_level:'G2', relation:'path' }
    ]
  };
}

test('imports game graph and moves coordinates to layout sidecar', () => {
  const result = importGraphDocument(graphFixture(), { sourceId:'fixture' });
  assert.equal(result.game_graph.nodes[0].x, undefined);
  assert.deepEqual(result.layout_sidecar.nodes[0], { node_id:'root', x:10, y:20, pinned:false });
  assert.equal(result.game_graph.edges[0].edge_type, 'path');
  assert.match(result.game_graph.edges[0].id, /^edge_/);
});

test('rejects missing semantic node contract instead of inventing it', () => {
  assert.throws(() => importGraphDocument({ nodes:[{ id:'x' }], edges:[] }), /scale_level is invalid/);
});

test('square layout is deterministic and contains no overlap', () => {
  const { game_graph } = importGraphDocument(graphFixture());
  const a = createSquareLayout(game_graph, { columns:2, spacingX:100, spacingY:80 });
  const b = createSquareLayout(game_graph, { columns:2, spacingX:100, spacingY:80 });
  assert.deepEqual(a, b);
  assert.equal(new Set(a.nodes.map((item) => `${item.x}:${item.y}`)).size, 3);
  assert.equal(validateLayoutSidecar(a, game_graph).ok, true);
});

test('layout digest prevents applying coordinates to another graph', () => {
  const { game_graph } = importGraphDocument(graphFixture());
  const layout = createSquareLayout(game_graph);
  const other = structuredClone(game_graph);
  other.nodes[2].id = 'changed';
  assert.equal(validateLayoutSidecar(layout, other).ok, false);
});

test('render projection does not mutate canonical game graph', () => {
  const { game_graph } = importGraphDocument(graphFixture());
  const layout = createSquareLayout(game_graph);
  const renderable = projectRenderableGraph(game_graph, layout);
  assert.ok(renderable.nodes[0].render_position);
  assert.equal(game_graph.nodes[0].render_position, undefined);
  const svg = renderGraphSvg(renderable);
  assert.match(svg, /data-node-id="root"/);
  assert.match(svg, /data-edge-id=/);
});

test('game graph validation rejects embedded layout fields', () => {
  const graph = importGraphDocument(graphFixture()).game_graph;
  const unsafe = structuredClone(graph);
  unsafe.nodes[0].x = 1;
  assert.equal(validateGameGraph(unsafe).ok, false);
});
