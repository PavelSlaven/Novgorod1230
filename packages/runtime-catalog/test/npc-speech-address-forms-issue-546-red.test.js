import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadNpcRelationshipMaterializationRules,
  loadNpcSpeechAddressForms,
  RuntimeCatalogError,
} from '../src/index.js';

const spatialWorldPin = {
  world_revision_id: 'rev-spatial',
  catalog_digest: 'a'.repeat(64),
};
const worldPin = {
  world_revision_id: 'rev-world',
  world_catalog_digest: 'b'.repeat(64),
};
const runtimeCatalogPin = {
  schema: 'rus.runtime_catalog_pin.v2',
  catalog_scope: 'item_container_materialization_v2',
  catalog_revision_id: 'pin-1',
  catalog_digest: 'c'.repeat(64),
  compatible_world_revision_id: worldPin.world_revision_id,
  compatible_world_catalog_digest: worldPin.world_catalog_digest,
};

function form(formId, version) {
  return {
    form_id: formId,
    form_version: version,
    world_revision_id: spatialWorldPin.world_revision_id,
    channel: 'oral',
    relationship_kind: 'unspecified',
    speaker_role_ref: 'nov_role_fisher',
    addressee_role_ref: 'nov_role_smerd_householder',
    register_ref: 'register-neutral',
    form_ru: 'Хозяин',
    situation: 'Изолированная тестовая форма',
    status: 'approved',
    confidence: 'high',
    provenance_ref: 'source-a',
    payload: { source: 'fixture' },
  };
}

function relationshipRule(ruleId, version) {
  return {
    rule_id: ruleId,
    rule_version: version,
    world_revision_id: spatialWorldPin.world_revision_id,
    status: 'approved',
    payload: {},
  };
}

function reader({ forms = [], relationships = [] } = {}) {
  const calls = [];
  return {
    calls,
    worldBaseReader: {
      read: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes('spatial_v3_world_revisions')) {
          return { rows: [{
            id: spatialWorldPin.world_revision_id,
            catalog_digest: spatialWorldPin.catalog_digest,
            status: 'approved',
          }] };
        }
        if (sql.includes('world_base.world_revisions')) {
          return { rows: [{
            id: worldPin.world_revision_id,
            catalog_digest: worldPin.world_catalog_digest,
            status: 'approved',
          }] };
        }
        if (sql.includes('runtime_catalog_activation_events')) {
          return { rows: [{
            event_type: 'activate',
            catalog_revision_id: runtimeCatalogPin.catalog_revision_id,
            catalog_digest: runtimeCatalogPin.catalog_digest,
            compatible_world_revision_id: worldPin.world_revision_id,
            compatible_world_catalog_digest: worldPin.world_catalog_digest,
          }] };
        }
        if (sql.includes('world_base.speech_address_forms')) {
          return { rows: forms };
        }
        if (sql.includes('world_base.npc_relationship_materialization_rules')) {
          return { rows: relationships };
        }
        return { rows: [] };
      },
    },
  };
}

function pinnedArgs(worldBaseReader) {
  return { worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin };
}

function assertPassedSpeechGatesAndQuery(calls) {
  const spatialGate = calls.find(({ sql }) => sql.includes('spatial_v3_world_revisions'));
  const worldGate = calls.find(({ sql }) => sql.includes('world_base.world_revisions'));
  const activationGate = calls.find(({ sql }) => sql.includes('runtime_catalog_activation_events'));
  const formsQuery = calls.find(({ sql }) => sql.includes('world_base.speech_address_forms'));

  assert.ok(spatialGate, 'spatial pin gate must run');
  assert.deepEqual(spatialGate.params, [spatialWorldPin.world_revision_id,
    spatialWorldPin.catalog_digest]);
  assert.ok(worldGate, 'world pin gate must run');
  assert.deepEqual(worldGate.params, [worldPin.world_revision_id,
    worldPin.world_catalog_digest]);
  assert.ok(activationGate, 'runtime activation gate must run');
  assert.deepEqual(activationGate.params, [runtimeCatalogPin.catalog_scope]);
  assert.ok(formsQuery, 'speech-address SELECT must run after gates');
  assert.deepEqual(formsQuery.params, [spatialWorldPin.world_revision_id]);
  assert.match(formsQuery.sql,
    /WHERE world_revision_id = \$1 AND status = 'approved'/u);
  assert.match(formsQuery.sql, /ORDER BY form_id, form_version/u);
  assert.ok(calls.indexOf(formsQuery) > calls.indexOf(activationGate));
}

async function captureSpeechLoad(forms) {
  const fixture = reader({ forms });
  const loadPromise = loadNpcSpeechAddressForms(pinnedArgs(fixture.worldBaseReader));
  await loadPromise.catch(() => {});
  assertPassedSpeechGatesAndQuery(fixture.calls);
  return { loadPromise };
}

for (const [order, versions] of [
  ['ascending', [1, 2]],
  ['descending', [2, 1]],
]) {
  test(`ожидаемо красный, issue #546: duplicate approved form_id rejects (${order} rows)`, async () => {
    const { loadPromise } = await captureSpeechLoad(
      versions.map((version) => form('form-address-a', version)),
    );
    await assert.rejects(loadPromise, (error) => error instanceof RuntimeCatalogError
      && error.code === 'M2C_NPC_SPEECH_ADDRESS_FORM_VERSION_AMBIGUOUS');
  });
}

test('GREEN: one approved speech-address form returns an immutable row', async () => {
  const fixture = reader({ forms: [form('form-address-a', 1)] });
  const rows = await loadNpcSpeechAddressForms(pinnedArgs(fixture.worldBaseReader));
  assertPassedSpeechGatesAndQuery(fixture.calls);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].form_id, 'form-address-a');
  assert.equal(rows[0].form_version, 1);
  assert.ok(Object.isFrozen(rows[0]));
  assert.ok(Object.isFrozen(rows[0].payload));
});

test('GREEN: distinct form ids may each have one approved version', async () => {
  const fixture = reader({ forms: [form('form-address-a', 1), form('form-address-b', 2)] });
  const rows = await loadNpcSpeechAddressForms(pinnedArgs(fixture.worldBaseReader));
  assertPassedSpeechGatesAndQuery(fixture.calls);
  assert.deepEqual(rows.map(({ form_id, form_version }) => [form_id, form_version]), [
    ['form-address-a', 1],
    ['form-address-b', 2],
  ]);
});

test('GREEN: no approved speech-address forms returns an empty list', async () => {
  const fixture = reader();
  const rows = await loadNpcSpeechAddressForms(pinnedArgs(fixture.worldBaseReader));
  assertPassedSpeechGatesAndQuery(fixture.calls);
  assert.deepEqual(rows, []);
});

test('GREEN: relationship loader rejects duplicate approved rule ids', async () => {
  const fixture = reader({ relationships: [
    relationshipRule('rule-a', 1), relationshipRule('rule-a', 2),
  ] });
  await assert.rejects(
    () => loadNpcRelationshipMaterializationRules(pinnedArgs(fixture.worldBaseReader)),
    (error) => error instanceof RuntimeCatalogError
      && error.code === 'M2C_NPC_RELATIONSHIP_RULE_VERSION_AMBIGUOUS',
  );
  const query = fixture.calls.find(({ sql }) =>
    sql.includes('world_base.npc_relationship_materialization_rules'));
  assert.ok(query);
  assert.deepEqual(query.params, [spatialWorldPin.world_revision_id]);
  assert.match(query.sql, /WHERE world_revision_id = \$1 AND status = 'approved'/u);
});
