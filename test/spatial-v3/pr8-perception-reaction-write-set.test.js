import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import {
  computeSpatialV3CanonicalDigest
} from '@rus/contracts/spatial-v3/registry';
import {
  buildNpcReactionPolicySnapshotFromAuthoringRow,
  decideBoundedNpcAction,
  proposeNpcReactionOptions
} from '@rus/npc-runtime';
import { mergeFormalKnowledgeMemory } from '@rus/visibility-knowledge-memory';
import { resolveSpatialV3NpcReaction } from '../../packages/turn/src/spatial-v3-reaction-handlers.js';
import { buildSpatialV3PerceptionReactionWriteSet } from '../../packages/turn/src/spatial-v3-perception-reaction-write-set.js';
import { buildCombinedWritePlan } from '../../packages/turn/src/spatial-v3-write-plan.js';
import {
  createSpatialV3PostgresCombinedAtomicCommitter
} from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import {
  runSpatialV3TargetMigrations
} from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const vr = (entity_kind, entity_id) => ({
  entity_ref: ref(entity_kind, entity_id),
  authoring_version: '1'
});
const pin = (dependency_role, reference) => ({
  dependency_role,
  entity_ref: reference.entity_ref,
  version_pin: {
    pin_kind: 'authoring_version',
    authoring_version: reference.authoring_version
  }
});
const seal = (value) => ({
  ...value,
  canonical_digest: computeSpatialV3CanonicalDigest(value)
});
const at = {
  whole_minutes: '100',
  subminute_numerator: '0',
  subminute_denominator: '1'
};
const npcRef = ref('npc', 'npc-1');
const perception = seal({
  perception_id: 'perception-1',
  perceiver_ref: npcRef,
  event_ref: ref('action_contract', 'event-1'),
  perceived_at: at,
  result: 'recognized',
  recognition_policy_ref: vr('action_contract', 'recognition-policy'),
  visibility_policy_ref: vr('action_contract', 'visibility-policy'),
  signal_refs: [ref('sound_event', 'signal-1')],
  knowledge_update_refs: [ref('knowledge_fact', 'signal-observed')]
});
const dependencyPins = seal({
  pins: [
    pin('profile', perception.recognition_policy_ref),
    pin('condition', perception.visibility_policy_ref)
  ]
});
const expectedStateVersions = seal({
  entries: [{ entity_ref: npcRef, state_version: 4 }]
});
const replayPayload = {
  perception_id: perception.perception_id,
  canonical_input_digest: computeSpatialV3CanonicalDigest({ input: 'perception' }),
  perception_digest: perception.canonical_digest,
  expected_state_versions_digest: computeSpatialV3CanonicalDigest(expectedStateVersions),
  dependency_pins_digest: dependencyPins.canonical_digest,
  policy_versions_digest: computeSpatialV3CanonicalDigest({
    recognition: perception.recognition_policy_ref,
    visibility: perception.visibility_policy_ref
  }),
  idempotency_key: 'perception-1'
};
const replay = seal(replayPayload);
const deltaPayload = {
  proposal_id: 'knowledge-delta-1',
  owner_ref: npcRef,
  source_kind: 'perception',
  source_ref: ref('perception_result', perception.perception_id),
  source_perception: perception,
  expected_state_versions: expectedStateVersions,
  dependency_pins: dependencyPins,
  fact_refs: [ref('knowledge_fact', 'signal-observed')],
  hypothesis_refs: []
};
const delta = seal(deltaPayload);
const merged = mergeFormalKnowledgeMemory({
  proposal: delta,
  state_before_fact_refs: [ref('knowledge_fact', 'known-before')],
  state_before_hypothesis_refs: [],
  state_version_before: 4
});

async function reactionBundle() {
  const records = JSON.parse(await readFile(
    'data/world-catalogs/novgorod/temporal-v4/datasets/npc_temporal_profiles_policies.json',
    'utf8'
  ));
  const source = records.find(
    ({ record_kind }) => record_kind === 'npc_reaction_policy'
  );
  const row = {
    record_id: source.record_id,
    family_id: source.family_id,
    record_kind: source.record_kind,
    record_version: source.version,
    applicability: source.applicability,
    status: source.status,
    provenance_refs: source.provenance_refs,
    normalized_reference_ids: source.normalized_reference_ids,
    source_history_refs: source.source_history_refs,
    payload: source.payload
  };
  row.canonical_digest =
    computeSpatialV3CanonicalDigest(row).replace('sha256:', '');
  const policy = buildNpcReactionPolicySnapshotFromAuthoringRow(row);
  assert.equal(policy.ok, true, JSON.stringify(policy));
  const context = seal({
    source_perception: perception,
    npc_ref: npcRef,
    reaction_scope_ref: ref('canonical_spatial_node', 'market'),
    npc_state_version: '4',
    can_investigate_signal: true,
    can_seek_safety: false,
    can_report_to_authority: false,
    threat_level: 'none',
    expected_state_versions: expectedStateVersions,
    dependency_pins: policy.value.dependency_pins
  });
  const options = proposeNpcReactionOptions({
    context_snapshot: context,
    policy_snapshot: policy.value
  });
  assert.equal(options.ok, true, JSON.stringify(options));
  const option = options.decision_request.options[0];
  const decision = decideBoundedNpcAction({
    request: options.decision_request,
    current_state_version: '4',
    observed_preconditions_digest: option.preconditions_digest,
    validated_at: at
  });
  assert.equal(decision.ok, true, JSON.stringify(decision));
  const commandRecord = policy.value.approved_command_records.find(
    (record) => record.command_ref.entity_ref.entity_id
      === option.command_ref.entity_ref.entity_id
  );
  const handlerInput = seal({
    source_perception: perception,
    reaction_scope_ref: ref('canonical_spatial_node', 'market'),
    observed_preconditions_digest: option.preconditions_digest,
    dependency_pins: options.decision_request.dependency_pins
  });
  const requestPayload = {
    request_id: decision.trace.request_id,
    npc_ref: npcRef,
    selected_option: option,
    decision_trace: decision.trace,
    command_record: commandRecord,
    consequence_input_snapshot: handlerInput,
    current_state_version: decision.trace.state_version,
    executed_at: at,
    dependency_pins: options.decision_request.dependency_pins,
    idempotency_key:
      `npc-reaction:${decision.trace.request_id}:${decision.trace.state_version}:${decision.trace.trace_digest}:${commandRecord.canonical_digest}`
  };
  const request = {
    ...requestPayload,
    canonical_input_digest: computeSpatialV3CanonicalDigest(requestPayload)
  };
  const result = resolveSpatialV3NpcReaction({ request });
  assert.equal(result.ok, true, JSON.stringify(result));
  return {
    reaction_option_proposal: options.proposal,
    reaction_proposal: result.proposal
  };
}

function visibleEnvelope() {
  const visible_payload = {
    schema: 'temporal_visible_package.v1',
    perceived_scene: 'Сигнал замечен.',
    perceived_changes: ['Наблюдатель отреагировал.'],
    sensory_details: [],
    visible_npcs: [],
    visible_objects: [],
    known_context: [],
    uncertainties: [],
    hypotheses: [],
    player_safe_interruption: null,
    allowed_action_affordances: []
  };
  return {
    package_id: 'visible-cs',
    party_id: 'party-1',
    turn_id: 'turn-1',
    committed_state_version: '5',
    change_set_id: 'change-1',
    package_digest: computeSpatialV3CanonicalDigest(visible_payload),
    visible_payload,
    presentation_status: 'pending',
    projection_policy_ref: vr('visibility_modifier', 'projection-v1'),
    dependency_pins: dependencyPins,
    idempotency_record_id: 'turn-idempotency-1'
  };
}

test('formal perception, reaction and knowledge results map to one closed target write set', async () => {
  assert.equal(merged.ok, true, JSON.stringify(merged));
  const reaction = await reactionBundle();
  const mapped = buildSpatialV3PerceptionReactionWriteSet({
    party_id: 'party-1',
    change_set_id: 'change-1',
    idempotency_record_id: 'turn-idempotency-1',
    perception_result: perception,
    perception_replay_evidence: replay,
    knowledge_merge_result: merged.result,
    reaction_option_proposal: reaction.reaction_option_proposal,
    reaction_proposal: reaction.reaction_proposal
  });
  assert.equal(mapped.ok, true, JSON.stringify(mapped));
  assert.deepEqual(
    mapped.write_set.appends.map(({ target_table }) => target_table),
    [
      'party_perception_records',
      'party_perception_replay_evidence',
      'party_npc_reaction_option_proposals',
      'party_npc_decision_traces',
      'party_npc_reaction_consequences',
      'party_npc_knowledge_merge_results'
    ]
  );
  assert.equal(mapped.write_set.inserts[0].record.knowledge_ref_kind, 'knowledge_fact');
  assert.equal(mapped.write_set.inserts[0].record.knowledge_classification, 'fact');
  assert.equal(mapped.write_set.updates[0].target_table, 'party_npc_knowledge_merge_states');
  assert.deepEqual(mapped.expected_state_versions, [{
    target_table: 'party_npc_knowledge_merge_states',
    id: 'party-1:npc-1',
    state_version: 4
  }]);

  const eventWrite = {
    target_schema: 'party_runtime',
    target_table: 'party_temporal_events',
    id: 'event-1',
    record: { event_id: 'event-1', party_id: 'party-1' }
  };
  const changeWrite = {
    target_schema: 'party_runtime',
    target_table: 'party_v3_change_sets',
    id: 'change-1',
    record: {
      id: 'change-1',
      party_id: 'party-1',
      operation_kind: 'temporal_boundary',
      idempotency_record_id: 'turn-idempotency-1'
    }
  };
  const plan = await buildCombinedWritePlan({
    plan_id: 'plan-1',
    party_id: 'party-1',
    write_plan_kind: 'semantic_commit',
    operation_kind: 'temporal_boundary',
    canonical_input_digest: computeSpatialV3CanonicalDigest({ turn: 1 }),
    expected_state_versions: mapped.expected_state_versions,
    validation_report: {
      status: 'pass',
      digest: computeSpatialV3CanonicalDigest({ status: 'pass' })
    },
    idempotency: { id: 'turn-idempotency-1', key: 'turn-1' },
    change_set: { id: 'change-1' },
    visible_package_envelope: visibleEnvelope(),
    approved_write_sets: [{
      appends: [changeWrite, ...mapped.write_set.appends],
      inserts: [eventWrite, ...mapped.write_set.inserts],
      updates: mapped.write_set.updates
    }],
    lock_context: {
      owner_keys: [],
      execution_keys: [],
      g4_keys: [],
      physical_keys: [
        'party_runtime.party_v3_change_sets:change-1',
        'party_runtime.party_temporal_events:event-1',
        ...mapped.physical_keys
      ]
    },
    commit_rechecks: [
      'physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set'
    ].map((kind) => ({
      kind,
      digest: computeSpatialV3CanonicalDigest({ kind })
    }))
  }, { verifyApproval: async () => ({ ok: true }) });
  assert.equal(plan.ok, true, JSON.stringify(plan));
});

test('mapper rejects a replay or reaction detached from the causal perception', () => {
  const detached = buildSpatialV3PerceptionReactionWriteSet({
    party_id: 'party-1',
    change_set_id: 'change-1',
    idempotency_record_id: 'turn-idempotency-1',
    perception_result: perception,
    perception_replay_evidence: { ...replay, perception_digest: 'sha256:bad' },
    knowledge_merge_result: merged.result
  });
  assert.equal(detached.ok, false);
});

test('PostgreSQL commit persists the causal slice and replays without duplicate rows', async (t) => {
  const docker = (args) => spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 45_000
  });
  if (docker(['version']).status !== 0) {
    t.skip('Docker required for isolated target persistence test');
    return;
  }
  const containerName = `pr8-perception-write-${process.pid}`;
  let pool;
  t.after(async () => {
    if (pool) await pool.end();
    docker(['rm', '-f', containerName]);
  });
  assert.equal(docker([
    'run', '-d', '-p', '127.0.0.1::5432', '--name', containerName,
    '-e', 'POSTGRES_PASSWORD=pr8',
    '-e', 'POSTGRES_USER=pr8',
    '-e', 'POSTGRES_DB=pr8',
    'postgres:16-alpine'
  ]).status, 0);
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (docker([
      'exec', containerName, 'pg_isready', '-U', 'pr8', '-d', 'pr8'
    ]).status === 0) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (docker([
        'exec', containerName, 'pg_isready', '-U', 'pr8', '-d', 'pr8'
      ]).status === 0) {
        ready = true;
        break;
      }
    }
  }
  assert.equal(ready, true);
  const port = Number(docker(['port', containerName, '5432']).stdout.match(/:(\d+)/u)?.[1]);
  pool = new pg.Pool({
    host: '127.0.0.1',
    port,
    user: 'pr8',
    password: 'pr8',
    database: 'pr8',
    max: 4
  });
  assert.equal((await runSpatialV3TargetMigrations(pool)).applied, 10);
  await pool.query(`
    INSERT INTO party_runtime.parties
      (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ('party-1',3,'world','catalog','materializer','rng','commands','profiles');
    INSERT INTO party_runtime.party_materialization_runs
      (party_id,run_id,g4_id,run_kind,seed_digest,input_digest,catalog_digest,materializer_version,rng_version,result_digest,idempotency_key,status)
    VALUES ('party-1','run-1','g4-1','baseline','seed','input','catalog','materializer','rng','result','run-1','committed');
    INSERT INTO party_runtime.party_npcs
      (party_id,npc_id,run_id,profile_set_id,profile_level)
    VALUES ('party-1','npc-1','run-1','profile-set','scene');
    INSERT INTO party_runtime.party_v3_change_sets
      (id,party_id,operation_kind,expected_state_version_set_digest,expected_state_version_set,committed_state_version_set_digest,write_plan_digest,created_at_turn,committed_at_turn)
    VALUES ('seed-change','party-1','activation','seed','[]','seed','seed',0,0);
    INSERT INTO party_runtime.party_npc_knowledge_merge_states
      (party_id,npc_id,state_version,updated_change_set_id)
    VALUES ('party-1','npc-1',4,'seed-change');
    INSERT INTO party_runtime.party_temporal_events
      (event_id,party_id,event_kind,status,scheduled_at_whole_minutes,scheduled_at_subminute_numerator,scheduled_at_subminute_denominator,rule_ref,policy_ref,preconditions_digest,idempotency_key,change_set_id,state_version)
    VALUES ('event-1','party-1','sensory_signal','pending',100,0,1,'{}','{}','event-preconditions','event-1','seed-change',1)
  `);
  const reaction = await reactionBundle();
  const mapped = buildSpatialV3PerceptionReactionWriteSet({
    party_id: 'party-1',
    change_set_id: 'change-1',
    idempotency_record_id: 'turn-idempotency-1',
    perception_result: perception,
    perception_replay_evidence: replay,
    knowledge_merge_result: merged.result,
    reaction_option_proposal: reaction.reaction_option_proposal,
    reaction_proposal: reaction.reaction_proposal
  });
  assert.equal(mapped.ok, true, JSON.stringify(mapped));
  const eventWrite = {
    target_schema: 'party_runtime',
    target_table: 'party_temporal_events',
    id: 'event-1',
    record: {
      event_id: 'event-1',
      party_id: 'party-1',
      event_kind: 'sensory_signal',
      status: 'resolved',
      scheduled_at_whole_minutes: '100',
      scheduled_at_subminute_numerator: '0',
      scheduled_at_subminute_denominator: '1',
      rule_ref: {},
      policy_ref: {},
      preconditions_digest: 'event-preconditions',
      idempotency_key: 'event-1',
      change_set_id: 'seed-change',
      terminal_change_set_id: 'change-1',
      state_version: 1
    }
  };
  const changeWrite = {
    target_schema: 'party_runtime',
    target_table: 'party_v3_change_sets',
    id: 'change-1',
    record: {
      id: 'change-1',
      party_id: 'party-1',
      operation_kind: 'temporal_boundary',
      idempotency_record_id: 'turn-idempotency-1'
    }
  };
  const built = await buildCombinedWritePlan({
    plan_id: 'plan-postgres-1',
    party_id: 'party-1',
    write_plan_kind: 'semantic_commit',
    operation_kind: 'temporal_boundary',
    canonical_input_digest: computeSpatialV3CanonicalDigest({ turn: 1 }),
    expected_state_versions: [
      ...mapped.expected_state_versions,
      { target_table: 'party_temporal_events', id: 'event-1', state_version: 1 }
    ],
    validation_report: {
      status: 'pass',
      digest: computeSpatialV3CanonicalDigest({ status: 'pass' })
    },
    idempotency: { id: 'turn-idempotency-1', key: 'turn-1' },
    change_set: { id: 'change-1' },
    visible_package_envelope: visibleEnvelope(),
    approved_write_sets: [{
      appends: [changeWrite, ...mapped.write_set.appends],
      inserts: mapped.write_set.inserts,
      updates: [eventWrite, ...mapped.write_set.updates]
    }],
    lock_context: {
      owner_keys: ['npc:npc-1'],
      execution_keys: [],
      g4_keys: [],
      physical_keys: [
        'party_runtime.party_v3_change_sets:change-1',
        'party_runtime.party_temporal_events:event-1',
        ...mapped.physical_keys
      ]
    },
    commit_rechecks: [
      'physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set'
    ].map((kind) => ({
      kind,
      digest: computeSpatialV3CanonicalDigest({ kind })
    }))
  }, { verifyApproval: async () => ({ ok: true }) });
  assert.equal(built.ok, true, JSON.stringify(built));
  const rollbackProbe = createSpatialV3PostgresCombinedAtomicCommitter({
    pool,
    recheck: async ({ check }) => check.kind === 'pin'
      ? { ok: false, code: 'authoring_dependency_pin_missing' }
      : { ok: true }
  });
  const rejected = await rollbackProbe.commit({ plan: built.plan, created_at_turn: 1 });
  assert.equal(rejected.ok, false);
  const afterRollback = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM party_runtime.party_command_idempotency WHERE id='turn-idempotency-1') AS idempotency,
      (SELECT count(*)::int FROM party_runtime.party_perception_records) AS perceptions,
      (SELECT status FROM party_runtime.party_temporal_events WHERE event_id='event-1') AS event_status,
      (SELECT state_version::int FROM party_runtime.party_npc_knowledge_merge_states WHERE party_id='party-1' AND npc_id='npc-1') AS knowledge_version
  `);
  assert.deepEqual(afterRollback.rows[0], {
    idempotency: 0,
    perceptions: 0,
    event_status: 'pending',
    knowledge_version: 4
  });

  const committer = createSpatialV3PostgresCombinedAtomicCommitter({
    pool,
    recheck: async () => ({ ok: true })
  });
  const concurrent = await Promise.all([
    committer.commit({ plan: built.plan, created_at_turn: 1 }),
    committer.commit({ plan: built.plan, created_at_turn: 1 })
  ]);
  assert.equal(concurrent.every(({ ok }) => ok), true, JSON.stringify(concurrent));
  assert.deepEqual(
    concurrent.map(({ replay: value }) => value).sort(),
    [false, true]
  );
  const retried = await committer.commit({ plan: built.plan, created_at_turn: 1 });
  assert.deepEqual(retried, {
    ok: true,
    replay: true,
    change_set_id: 'change-1'
  });
  const persisted = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM party_runtime.party_perception_records) AS perceptions,
      (SELECT count(*)::int FROM party_runtime.party_perception_replay_evidence) AS replays,
      (SELECT count(*)::int FROM party_runtime.party_npc_reaction_option_proposals) AS option_proposals,
      (SELECT count(*)::int FROM party_runtime.party_npc_reaction_consequences) AS reactions,
      (SELECT count(*)::int FROM party_runtime.party_npc_knowledge_merge_results) AS merges,
      (SELECT count(*)::int FROM party_runtime.party_npc_knowledge WHERE target_contract_version='4.4.0-target.1') AS knowledge,
      (SELECT state_version::int FROM party_runtime.party_npc_knowledge_merge_states WHERE party_id='party-1' AND npc_id='npc-1') AS knowledge_version,
      (SELECT count(*)::int FROM party_runtime.party_visible_packages) AS visible_packages,
      (SELECT count(*)::int FROM party_runtime.party_narration_jobs) AS narration_jobs
  `);
  assert.deepEqual(persisted.rows[0], {
    perceptions: 1,
    replays: 1,
    option_proposals: 1,
    reactions: 1,
    merges: 1,
    knowledge: 1,
    knowledge_version: 5,
    visible_packages: 1,
    narration_jobs: 1
  });
  const knowledge = await pool.query(`
    SELECT fact_id,knowledge_ref_kind,knowledge_classification,merge_state_version
    FROM party_runtime.party_npc_knowledge
    WHERE party_id='party-1' AND npc_id='npc-1'
  `);
  assert.deepEqual(knowledge.rows, [{
    fact_id: 'signal-observed',
    knowledge_ref_kind: 'knowledge_fact',
    knowledge_classification: 'fact',
    merge_state_version: '5'
  }]);
});
