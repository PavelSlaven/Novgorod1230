import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import test from 'node:test';
import { G4_NATURAL_LAYERS } from '@rus/materialization';
import {
  loadApprovedG4NaturalCatalog,
  loadApprovedG4NaturalPresentationCatalog,
  loadApprovedG4NaturalPlacementCatalog,
} from '../src/index.js';
import { canonicalStringify } from '../src/canonical-records.js';

const stages = [
  { name: 'natural', load: loadApprovedG4NaturalCatalog, code: 'G4_NATURAL_CATALOG_INVALID' },
  { name: 'presentation', load: loadApprovedG4NaturalPresentationCatalog,
    code: 'G4_NATURAL_PRESENTATION_CATALOG_INVALID' },
  { name: 'placement', load: loadApprovedG4NaturalPlacementCatalog,
    code: 'G4_NATURAL_PLACEMENT_CATALOG_INVALID' },
];
const digest = (payload) => crypto.createHash('sha256').update(canonicalStringify(payload)).digest('hex');
const freeze = (value) => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

// Independent package-local authoring fixture: no application or compiler imports.
function fixture({ catalogDigest = 'b'.repeat(64), invalidStage, immutable = true } = {}) {
  const pin = { compatible_world_revision_id: 'cache-fixture-world',
    compatible_world_catalog_digest: 'a'.repeat(64), catalog_digest: catalogDigest };
  const temporal = { calendar_profile_ref: 'calendar', calendar_profile_version: 1,
    weather_profile_ref: 'weather', weather_profile_version: 1 };
  const natural = { schema: 'rus.g4_natural_baseline_profile.v1',
    profile_id: 'cache-natural', profile_version: 1,
    g4_ref: { id: 'cache-g4', version: 1, world_revision_id: pin.compatible_world_revision_id },
    exact_scene_features: { canonical_scene_template_refs: ['cache-scene@1'] },
    natural_profile: { layer_applicability: Object.fromEntries(G4_NATURAL_LAYERS.map((layer) =>
      [layer, { applicability: 'present', limits: 'Fixture scope', source_refs: ['fixture'],
        value: ['seasonal_state', 'light', 'weather'].includes(layer)
          ? { ...temporal } : { kind: layer } }])) } };
  const naturalRef = { id: natural.profile_id, version: 1, payload_digest: digest(natural) };
  const presentation = { schema: 'rus.g4_natural_presentation_profile.v1',
    id: 'cache-presentation', version: 1, g4_ref: { ...natural.g4_ref },
    natural_profile_ref: { ...naturalRef },
    layers: G4_NATURAL_LAYERS.map((layer) => ({ layer, channel: 'none' })) };
  const placement = { schema: 'rus.g4_natural_placement_catalog.v1', id: 'cache-placement',
    version: 1, world_revision_id: pin.compatible_world_revision_id,
    source_candidate_sha256: 'c'.repeat(64),
    condition_policies: [{ id: 'conditions', version: 1,
      calendar_record_ref: { id: 'calendar', version: 1 },
      weather_record_ref: { id: 'weather', version: 1 },
      lighting_by_light_state: { day: 'clear' }, weather_by_visibility: { clear: 'clear' },
      accepted_current_condition_values: ['clear', 'partial', 'none'],
      required_current_visual_fields: ['stable_cover', 'dynamic_occlusion', 'concealment'],
      required_current_actor_fields: ['visual_capability', 'hearing_capability'],
      visual_source_rule: { accepted_current_source_states: ['present', 'absent'] } }],
    acoustic_source_rules: [], placements: [{ id: 'placement', version: 1,
      world_revision_id: pin.compatible_world_revision_id, g4_ref: { ...natural.g4_ref },
      natural_profile_ref: { ...naturalRef },
      presentation_profile_ref: { id: presentation.id, version: 1 },
      scene_template_ref: { id: 'cache-scene', version: 1, canonical_digest: 'd'.repeat(64) },
      source_endpoint_role: 'arrival', source_endpoint_slot_key: 'arrival',
      g6_scene_slot_key: 'scene', required_position_slot_key: 'position',
      required_position_instance_ordinal: 0, scene_physical_pins: {}, visible_scene: 'У берега',
      condition_policy_ref: { id: 'conditions', version: 1 },
      visual_layers: [], acoustic_layers: [], unplaced_visual_layers: [],
      unprojected_layers: [...G4_NATURAL_LAYERS] }] };
  const payloads = [natural, presentation, placement];
  const records = payloads.map((payload, index) => ({
    record_id: `profile:${payload.profile_id ?? payload.id}`, version: 1, record_kind: 'profile',
    status: 'approved_authoring_not_runtime_selectable', payload,
    payload_digest: stages[index].name === invalidStage ? '0'.repeat(64) : digest(payload),
  }));
  const verifiedCatalog = { schema: 'rus.verified_item_catalog.v2', verified: true, pin,
    records_by_table: { procedural_scene_compiled_records: records } };
  if (immutable) freeze(verifiedCatalog);
  return { verifiedCatalog, pin, payloads };
}

function countChecks(t, payloads) {
  const original = crypto.createHash;
  const encoded = payloads.map(canonicalStringify);
  const checks = [0, 0, 0];
  t.mock.method(crypto, 'createHash', function (...args) {
    const hash = original.apply(this, args);
    const update = hash.update;
    hash.update = function (data, ...options) {
      const index = encoded.indexOf(typeof data === 'string' ? data : data.toString());
      if (args[0] === 'sha256' && index >= 0) checks[index] += 1;
      return update.call(this, data, ...options);
    };
    return hash;
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  return checks;
}

function assertFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value), 'Every nested result object must remain frozen');
  for (const child of Object.values(value)) assertFrozen(child);
}

for (const [stageIndex, stage] of stages.entries()) {
  test(`${stage.name}: unchanged immutable catalog validates once and reuses frozen result`, (t) => {
    const input = fixture();
    const checks = countChecks(t, input.payloads);
    const first = stage.load(input);
    assertFrozen(first);
    assert.equal(first.verified, true);
    assert.deepEqual(first.pin, input.pin);
    assert.notStrictEqual(first.pin, input.pin);
    assert.deepEqual(checks, stages.map((_, index) => Number(index <= stageIndex)));
    const second = stage.load(input);
    assert.deepEqual(checks, stages.map((_, index) => Number(index <= stageIndex)),
      'Warm call must not repeat validation of any stage');
    assert.strictEqual(second, first);
  });

  test(`${stage.name}: canonical pin equality hits, another identity or pin misses`, (t) => {
    const input = fixture();
    const anotherCatalog = fixture();
    const anotherPin = fixture({ catalogDigest: 'e'.repeat(64) });
    const checks = countChecks(t, input.payloads);
    const first = stage.load(input);
    const reversedPin = Object.fromEntries(Object.entries(input.pin).reverse());
    assert.strictEqual(stage.load({ verifiedCatalog: input.verifiedCatalog, pin: reversedPin }), first);
    assert.deepEqual(checks, stages.map((_, index) => Number(index <= stageIndex)));
    assert.throws(() => stage.load({ verifiedCatalog: input.verifiedCatalog, pin: anotherPin.pin }),
      { code: 'G4_NATURAL_CATALOG_INVALID' }, 'Warm cache must still reject a mismatched pin');
    const second = stage.load(anotherCatalog);
    assert.notStrictEqual(second, first);
    const third = stage.load(anotherPin);
    assert.notStrictEqual(third, first);
    assert.deepEqual(third.pin, anotherPin.pin);
    assert.deepEqual(checks, stages.map((_, index) => index <= stageIndex ? 3 : 0));
  });

  test(`${stage.name}: rejected payload is checked again, never cached as success or error`, (t) => {
    const input = fixture({ invalidStage: stage.name });
    const checks = countChecks(t, input.payloads);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assert.throws(() => stage.load(input), { code: stage.code });
    }
    assert.equal(checks[stageIndex], 2, 'Failed stage must run its digest check on each attempt');
    for (let index = 0; index < stageIndex; index += 1) {
      assert.equal(checks[index], 1, 'Previously successful stages can be reused after a later failure');
    }
  });

  for (const inputKind of ['mutable', 'shallow-frozen', 'frozen containers with mutable payloads']) {
    test(`${stage.name}: ${inputKind} input preserves uncached validation`, (t) => {
      const input = fixture({ immutable: false });
      if (inputKind !== 'mutable') Object.freeze(input.verifiedCatalog);
      if (inputKind === 'frozen containers with mutable payloads') {
        freeze(input.pin);
        const records = input.verifiedCatalog.records_by_table.procedural_scene_compiled_records;
        records.forEach(Object.freeze);
        Object.freeze(records);
        Object.freeze(input.verifiedCatalog.records_by_table);
      }
      const checks = countChecks(t, input.payloads);
      const first = stage.load(input);
      const second = stage.load(input);
      assert.notStrictEqual(second, first);
      assertFrozen(first);
      assertFrozen(second);
      assert.deepEqual(checks, stages.map((_, index) => index <= stageIndex ? 2 : 0));
      input.payloads[stageIndex].cache_fixture_change = true;
      assert.throws(() => stage.load(input), { code: stage.code },
        'Mutation must still be detected after earlier successful calls');
    });
  }
}

test('natural, presentation and placement share successful validation slots for one catalog', (t) => {
  const input = fixture();
  const checks = countChecks(t, input.payloads);
  const results = stages.map(({ load }) => load(input));
  assert.deepEqual(checks, [1, 1, 1], 'Later stages must reuse earlier successful validation');
  for (const [index, { load }] of stages.entries()) assert.strictEqual(load(input), results[index]);
  assert.deepEqual(checks, [1, 1, 1]);
});
