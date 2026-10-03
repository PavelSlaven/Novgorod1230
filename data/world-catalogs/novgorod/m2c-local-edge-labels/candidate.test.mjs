import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadApprovedLocalEdgeLabels } from './approved-labels.mjs';

const candidate = JSON.parse(readFileSync(new URL('./candidate.json', import.meta.url)));
const sourcePath = '../spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_scene_movement_edge_templates.json';
const source = JSON.parse(readFileSync(new URL(sourcePath, import.meta.url)));
const key = (id, version, slot) => `${id}@${version}/${slot}`;

test('local edge labels cover the exact authored internal passages without granting admission', () => {
  assert.equal(source.length, 68);
  assert.equal(candidate.labels.length, source.length);
  assert.equal(candidate.status, 'candidate_approval_pending');
  assert.equal(candidate.approved, false);
  assert.equal(candidate.import_authorized, false);
  assert.equal(candidate.activation_authorized, false);

  const actual = new Map(candidate.labels.map(label => [
    key(label.scene_template_ref.id, label.scene_template_ref.version, label.edge_slot_key), label
  ]));
  assert.equal(actual.size, source.length);
  const ordinals = new Map();
  for (const row of source) {
    assert.equal(row.passage_type_id, 'internal_passage');
    const label = actual.get(key(row.scene_template_id, row.scene_template_version, row.edge_slot_key));
    assert.ok(label);
    const origin = key(row.scene_template_id, row.scene_template_version, row.from_position_slot_key);
    const ordinal = (ordinals.get(origin) ?? 0) + 1;
    ordinals.set(origin, ordinal);
    assert.equal(label.display_label, `Проход ${ordinal}`);
    assert.equal(label.editorial_choice_ordinal, ordinal);
    assert.equal(label.visibility_rule, 'require_current_authoritative_visible_or_known_exit_projection');
    assert.equal(label.provenance.directness, 'editorial');
    assert.ok(label.provenance.source_refs.includes(
      `data/world-catalogs/novgorod/${sourcePath.slice(3)}#${key(row.scene_template_id, row.scene_template_version, row.edge_slot_key)}`
    ));
  }
});

test('approved open-capacity edge successor transfers every label without editorial changes', () => {
  const labels = loadApprovedLocalEdgeLabels();
  assert.equal(labels.length, 136);
  for (let index = 0; index < 68; index += 1) {
    const old = labels[index];
    const successor = labels[index + 68];
    assert.deepEqual(successor, { ...old, version: 2,
      scene_template_ref: { ...old.scene_template_ref, version: 2 } });
  }
});
