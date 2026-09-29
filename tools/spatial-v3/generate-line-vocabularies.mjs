import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { canonicalDigest } from '../../packages/contracts/src/spatial-v3/controlled-vocabularies.js';

// Registry v5 (Spatial standard amendment 4.7.0): lines, direction values, duration bands.
const path = 'data/contracts/spatial-v3/controlled-vocabularies.v5.json';
const base = JSON.parse(await readFile('data/contracts/spatial-v3/controlled-vocabularies.v4.json', 'utf8'));
const version = '5.0.0';
const source = 'spatial_architecture_standard_g0_g6.md amendment 4.7.0';
const metadata = { derivation: 'spatial_amendment_4_7_0', normative_source: source };
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const rows = (list) => list.map(([id, label, description]) => ({ id, label, description, metadata: { ...metadata } }));

const additions = {
  controlled_direction_context: rows([
    ['direction.along_road', 'вдоль дороги', 'Направление вдоль дороги; классифицирует коридор, не даёт компасного азимута.'],
    ['direction.along_shore', 'вдоль берега', 'Направление вдоль берега; классифицирует коридор, не даёт компасного азимута.'],
    ['direction.toward_landmark', 'к ориентиру', 'Направление к ориентиру; классифицирует коридор, не даёт компасного азимута.']
  ]),
  controlled_movement_method: rows([
    ['movement_method.improvised_float', 'на подручном средстве', 'Перемещение по воде на бревне или другом подручном плавучем средстве.']
  ]),
  controlled_entity_kind: rows([
    ['canonical_g5_connection_binding', 'Canonical G5 connection binding', 'Versioned authored directed connection between two canonical G5 of one G4 with line identity, minutes, risk and availability.'],
    ['line_kind_alternative_method', 'Line kind alternative method', 'Versioned relation of a line kind profile to an alternative movement method with risk class and hazard rule.'],
    ['line_kind_profile', 'Line kind profile', 'Versioned approved movement mechanics of one line kind: method, cost profile, recheck policy, environment, orientation and maximum segment minutes.']
  ])
};

const lineKinds = [
  ['road', 'дорога'], ['path', 'тропа'], ['forest_track', 'лесной ход'], ['street', 'улица'], ['footbridge', 'мостки'],
  ['bridge', 'мост'], ['ford', 'брод'], ['ferry', 'перевоз'], ['river_channel', 'русло реки'], ['side_channel', 'протока'],
  ['shore', 'берег'], ['open_water', 'открытая вода (море, озеро)'], ['portage', 'волок'], ['winter_road', 'зимник (по льду или снегу)'],
  ['causeway', 'гать'], ['wetland_path', 'болотная тропа'], ['offroad', 'бездорожье'], ['yard', 'двор']
].map(([key, label]) => [`line.${key}`, label, `Вид линии перехода: ${label}.`]);
const durationBands = [
  ['few_minutes', 'несколько минут'], ['short_while', 'недолго'], ['about_hour', 'около часа'],
  ['several_hours', 'несколько часов'], ['half_day', 'полдня']
].map(([key, label]) => [`duration_band.${key}`, label, `Грубая длительность хода: ${label}.`]);

const consumers = {
  controlled_direction_context: [
    { contract: 'g4_traversal_profile', field: 'traversable_direction_contexts', rule: 'Each context is interpreted only through the pinned orientation reference frame; raw screen coordinates are forbidden.' },
    { contract: 'g5_site_connection', field: 'line_direction_id', rule: 'Only absolute values with an inverse (eight cardinal, upstream/downstream, uphill/downhill, landward/waterward); the reverse line carries the inverse.' },
    { contract: 'world_route_segment', field: 'line_direction_id', rule: 'Only absolute values with an inverse; the reverse segment carries the inverse.' },
    { contract: 'canonical_g5_connection_binding', field: 'line_direction_id', rule: 'Only absolute values with an inverse; the reverse binding carries the inverse.' },
    { contract: 'expansion_slot', field: 'entry_line_direction_id', rule: 'Only absolute values with an inverse; the reverse row carries the inverse.' }
  ]
};
const newVocabularies = [
  { pseudo_type: 'controlled_line_kind', registry_id: 'spatial.movement.line_kind', values: lineKinds,
    consumers: [
      { contract: 'line_kind_profile', field: 'line_kind_id', rule: 'Exactly one approved profile per line kind.' },
      { contract: 'g5_site_connection', field: 'line_kind_id', rule: 'Equals the line kind of the projected authoring version.' },
      { contract: 'world_route_segment', field: 'line_kind_id', rule: 'Method, cost profile, recheck policy and environment equal those of the line kind profile.' },
      { contract: 'expansion_slot', field: 'entry_line_kind_id', rule: 'Line kind of the connection created for a generated site of the slot.' }
    ], source_ranges: ['amendment 4.7.0 §4.7.2'] },
  { pseudo_type: 'controlled_duration_band', registry_id: 'spatial.movement.duration_band', values: durationBands,
    consumers: [{ contract: 'movement option projection', field: 'duration_band', rule: 'Rough duration shown at choice; band limits in minutes are an approved profile; the exact time is not shown.' }],
    source_ranges: ['amendment 4.7.0 §14.4'] }
];

const vocabularies = base.vocabularies.map((row, index) => {
  const value = { ...structuredClone(row), version, path: `${path}#/vocabularies/${index}` };
  const extra = additions[value.pseudo_type];
  if (extra) {
    value.values.push(...extra);
    value.values.sort(byId);
  }
  if (consumers[value.pseudo_type]) value.consumers = consumers[value.pseudo_type];
  delete value.digest;
  return { ...value, digest: canonicalDigest(value) };
});
for (const [offset, row] of newVocabularies.entries()) {
  const value = { pseudo_type: row.pseudo_type, registry_id: row.registry_id, path: `${path}#/vocabularies/${base.vocabularies.length + offset}`,
    version, status: 'approved', open_ended: false, canonical_order: 'value.id ascending (Unicode code-point order)',
    consumers: row.consumers, source_ranges: row.source_ranges, values: rows(row.values).sort(byId) };
  vocabularies.push({ ...value, digest: canonicalDigest(value) });
}
const registry = { ...base, version,
  approval_basis: 'Spatial standard amendment 4.7.0: line kinds, line direction values, rough duration bands, alternative movement method and authoring entity kinds of the line contracts; historical v1-v4 registries remain immutable.',
  vocabularies, vocabulary_count: vocabularies.length,
  value_count: vocabularies.reduce((count, row) => count + row.values.length, 0) };
delete registry.aggregate_digest;
registry.aggregate_digest = canonicalDigest(registry);
const serialized = `${JSON.stringify(registry, null, 2)}\n`;
if (process.argv.includes('--check')) assert.equal(await readFile(path, 'utf8'), serialized);
else await writeFile(path, serialized);
console.log(`Line vocabulary registry ${version}: ${registry.vocabulary_count} vocabularies, ${registry.value_count} values, aggregate ${registry.aggregate_digest}.`);
