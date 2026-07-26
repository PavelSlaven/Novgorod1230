import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSpatialV3CanonicalDigest
} from '@rus/contracts/spatial-v3/registry';
import {
  buildCombinedWritePlan
} from '../../packages/turn/src/spatial-v3-write-plan.js';
import {
  createSpatialV3CombinedAtomicCommitter
} from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';

const hex = 'a'.repeat(64);
const approval = async () => ({ ok: true });

function visibleEnvelope(changeSetId = 'change') {
  const payload = {
    schema: 'temporal_visible_package.v1',
    perceived_scene: 'Лодка отходит от берега.',
    perceived_changes: ['Стоянка осталась позади.'],
    sensory_details: [],
    visible_npcs: [],
    visible_objects: [],
    known_context: [],
    uncertainties: [],
    hypotheses: [],
    player_safe_interruption: null,
    allowed_action_affordances: []
  };
  const pins = [{
    dependency_role: 'source_authoring',
    entity_ref: { entity_kind: 'world_revision', entity_id: 'world-v2' },
    version_pin: {
      pin_kind: 'authoring_version',
      authoring_version: '1',
      state_version: null
    }
  }];
  return {
    package_id: `visible-${changeSetId}`,
    party_id: 'party',
    turn_id: 'turn-1',
    committed_state_version: '2',
    change_set_id: changeSetId,
    package_digest: computeSpatialV3CanonicalDigest(payload),
    visible_payload: payload,
    presentation_status: 'pending',
    projection_policy_ref: {
      entity_ref: {
        entity_kind: 'visibility_modifier',
        entity_id: 'projection-v1'
      },
      authoring_version: '1'
    },
    dependency_pins: {
      pins,
      canonical_digest:
        computeSpatialV3CanonicalDigest(pins).replace('sha256:', '')
    },
    idempotency_record_id: 'idem'
  };
}

function input(writeSet, expectedStateVersions = [], operationKind = 'move') {
  const envelope = visibleEnvelope();
  const physicalKeys = [
    ...Object.values(writeSet).flat().map((write) =>
      `party_runtime.${write.target_table}:${write.id}`)
  ];
  return {
    plan_id: 'plan',
    party_id: 'party',
    write_plan_kind: 'semantic_commit',
    operation_kind: operationKind,
    canonical_input_digest: `sha256:${hex}`,
    expected_state_versions: expectedStateVersions,
    validation_report: { status: 'pass', digest: `sha256:${hex}` },
    idempotency: { id: 'idem', key: 'idem-key' },
    change_set: { id: 'change' },
    visible_package_envelope: envelope,
    lock_context: {
      owner_keys: ['transport:boat'],
      execution_keys: [],
      g4_keys: [],
      physical_keys: physicalKeys
    },
    commit_rechecks: [
      'physical', 'state', 'pin', 'endpoint',
      'route', 'capacity', 'time', 'change_set'
    ].map((kind) => ({ kind, digest: `sha256:${hex}` })),
    approved_write_sets: [writeSet]
  };
}

function changeSet() {
  return {
    target_table: 'party_v3_change_sets',
    id: 'change',
    record: {
      id: 'change',
      party_id: 'party',
      operation_kind: 'move',
      idempotency_record_id: 'idem'
    }
  };
}

test('P16 seals journey update and placement delete with separate CAS identities', async () => {
  const location = {
    target_table: 'party_journey_locations',
    id: 'boat-location',
    record: {
      id: 'boat-location',
      party_id: 'party',
      owner_kind: 'transport',
      owner_id: 'boat',
      location_kind: 'transit_anchor',
      scene_position_id: null,
      transit_anchor_id: 'anchor',
      travel_state_id: null,
      updated_change_set_id: 'change'
    }
  };
  const placement = {
    target_table: 'entity_placements',
    id: 'transport:boat',
    record: {
      party_id: 'party',
      entity_kind: 'transport',
      entity_id: 'boat'
    }
  };
  const built = await buildCombinedWritePlan(input({
    inserts: [],
    updates: [location],
    appends: [changeSet()],
    deletes: [placement]
  }, [
    {
      target_table: 'party_journey_locations',
      id: 'boat-location',
      state_version: 2
    },
    {
      target_table: 'entity_placements',
      id: 'transport:boat',
      state_version: 4
    }
  ]), { verifyApproval: approval });
  assert.equal(built.ok, true, JSON.stringify(built));
  assert.equal(built.plan.deletes.length, 1);

  const statements = [];
  const committer = createSpatialV3CombinedAtomicCommitter({
    recheck: async () => ({ ok: true }),
    withTransaction: async (work) => work({
      query: async (sql) => {
        statements.push(sql);
        if (sql.includes('party_command_idempotency') && sql.startsWith('SELECT')) {
          return { rows: [] };
        }
        return { rows: [], rowCount: 1 };
      }
    })
  });
  const result = await committer.commit({ plan: built.plan });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(statements.some((sql) =>
    sql.startsWith('DELETE FROM party_runtime."entity_placements"')), true);
});

test('P16 ResourceBinding identity excludes change-set evidence', async () => {
  const execution = {
    target_table: 'party_timed_activity_executions',
    id: 'activity',
    record: {
      id: 'activity',
      execution_scope: 'standalone',
      activity_series_id: 'series',
      activity_owner_ref: { entity_kind: 'actor', entity_id: 'player' }
    }
  };
  const binding = {
    target_table: 'party_activity_resource_bindings',
    id: 'activity:item:rope:required_tool',
    record: {
      activity_execution_id: 'activity',
      resource_kind: 'item',
      resource_id: 'rope',
      binding_kind: 'required_tool',
      quantity_numerator: 1,
      quantity_denominator: 1,
      consumption_policy_ref: { entity_id: 'return-on-success', version: 1 },
      change_set_id: 'change',
      idempotency_record_id: 'idem',
      state_version: 1
    }
  };
  const built = await buildCombinedWritePlan(input({
    inserts: [execution],
    updates: [],
    appends: [changeSet(), binding],
    deletes: []
  }), { verifyApproval: approval });
  assert.equal(built.ok, true, JSON.stringify(built));
  assert.equal(built.plan.appends.some((write) =>
    write.id === 'activity:item:rope:required_tool'), true);
});
