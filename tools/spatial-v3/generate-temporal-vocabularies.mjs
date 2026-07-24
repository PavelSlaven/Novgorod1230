import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const inputPath = 'data/contracts/spatial-v3/controlled-vocabularies.v1.json';
const outputPath = 'data/contracts/spatial-v3/controlled-vocabularies.v2.json';
const base = JSON.parse(await readFile(inputPath, 'utf8'));

const temporalEntityKinds = [
  'activity_profile',
  'body_effect',
  'body_state',
  'calendar_profile',
  'carrier_condition',
  'environment_overlay_state',
  'light_state',
  'load_state',
  'npc_decision_trace',
  'participant_binding',
  'party',
  'perception_result',
  'portal_access_state',
  'propagation_process',
  'remote_aggregate_state',
  'resource_binding',
  'runtime_calendar_snapshot',
  'temporal_boundary_candidate',
  'time_slice_result',
  'visible_package_persistence_envelope',
  'weather_state'
];

const temporalWriteTargets = [
  'npc_decision_trace',
  'participant_binding',
  'perception_result',
  'propagation_process_ref',
  'remote_aggregate_state',
  'resource_binding',
  'time_slice_result',
  'visible_package_persistence_envelope'
];

const temporal = [
  vocabulary(
    'controlled_activity_completion_model',
    'temporal.activity_completion_model',
    ['fixed_exact', 'progress_target', 'condition_or_deadline'],
    [{ contract: 'activity_completion_model_snapshot', field: 'kind', rule: 'Exactly one sealed completion branch is populated.' }],
    'Temporal World v4 §8.2'
  ),
  vocabulary(
    'controlled_activity_failure_class',
    'temporal.activity_failure_class',
    ['precondition_invalidated'],
    [{ contract: 'party_timed_activity_attempt', field: 'failure_class', rule: 'invalidated is a failure class and never a persisted activity status.' }],
    'Temporal World v4 §§8.1, 8.6'
  ),
  vocabulary(
    'controlled_interruption_level',
    'temporal.interruption_level',
    ['background', 'notice', 'interaction', 'hard_interrupt', 'emergency', 'strand'],
    [
      { contract: 'temporal_boundary_candidate', field: 'interrupt_effect', rule: 'Candidate declares the exact policy-visible interruption level.' },
      { contract: 'interruption_outcome', field: 'interruption_level', rule: 'Outcome follows the pinned interruption policy.' }
    ],
    'Temporal World v4 §16'
  ),
  vocabulary(
    'controlled_perception_result',
    'temporal.perception_result',
    ['not_perceived', 'perceived_unidentified', 'perceived_partial', 'recognized', 'misinterpreted'],
    [{ contract: 'perception_result', field: 'result', rule: 'Memory/reaction follows a persisted perception result.' }],
    'Temporal World v4 §15.3'
  ),
  {
    ...vocabulary(
      'controlled_temporal_resolution_class',
      'temporal.resolution_class',
      [
        'continuous_finalize',
        'cooccurring_fact',
        'physical_hazard_access',
        'execution_outcome',
        'npc_schedule',
        'perception_knowledge',
        'reaction_decision',
        'propagation_background',
        'interruption_terminal'
      ],
      [{ contract: 'temporal_boundary_candidate', field: 'resolution_class', rule: 'Classes use the versioned same-time phase order.' }],
      'Temporal World v4 §10.2'
    ),
    canonical_order: 'metadata.resolution_ordinal ascending, then value.id ascending',
    values: [
      ['continuous_finalize', 10],
      ['cooccurring_fact', 20],
      ['physical_hazard_access', 30],
      ['execution_outcome', 40],
      ['npc_schedule', 50],
      ['perception_knowledge', 60],
      ['reaction_decision', 70],
      ['propagation_background', 80],
      ['interruption_terminal', 90]
    ].map(([id, ordinal]) => value(id, { resolution_ordinal: ordinal }))
  },
  vocabulary(
    'controlled_temporal_advance_status',
    'temporal.advance_status',
    ['completed', 'progressed', 'decision_required', 'paused', 'blocked', 'stranded'],
    [{ contract: 'temporal_advance_result', field: 'temporal_status', rule: 'Status is domain progress, not presentation delivery status.' }],
    'Temporal World v4 §11.3'
  ),
  vocabulary(
    'controlled_remote_scope_mode',
    'temporal.remote_scope_mode',
    ['exact_active_g6', 'exact_current_g5_g4', 'causal_neighbor_scope', 'coarse_remote_materialized_scope', 'canonical_unmaterialized_scope'],
    [
      { contract: 'remote_aggregate_state', field: 'scope_mode', rule: 'Scope controls exact/coarse processing without global ticking.' },
      { contract: 'temporal_advance_request', field: 'active_scope', rule: 'Request explicitly declares its bounded processing scope.' }
    ],
    'Temporal World v4 §18.1'
  ),
  vocabulary(
    'controlled_propagation_process_kind',
    'temporal.propagation_process_kind',
    ['rumor', 'order', 'alarm', 'pursuit', 'fire', 'shortage', 'weather_front', 'historical_pressure'],
    [{ contract: 'propagation_process_ref', field: 'process_kind', rule: 'Only an approved process kind may be instantiated.' }],
    'Temporal World v4 §18.3'
  )
];

const inherited = base.vocabularies.map((entry) => {
  const next = { ...structuredClone(entry), version: '2.0.0' };
  if (next.pseudo_type === 'controlled_entity_kind') {
    next.source_ranges = [...next.source_ranges, 'Temporal World v4 §§6-20 and Appendix A'];
    next.consumers = [...next.consumers, {
      contract: 'temporal entity_ref consumers',
      field: 'entity_kind',
      rule: 'Temporal refs use only the exact approved profile, runtime-state, proposal or persisted-result kinds named by their contracts.'
    }];
    next.values = appendValues(next.values, temporalEntityKinds, (id) => ({
      ...value(id, { derivation: 'approved_temporal_world_v1_entity_kind' }),
      description: `Temporal World v1 entity kind \`${id}\` required by an approved entity_ref or persisted temporal contract.`
    }));
  }
  if (next.pseudo_type === 'controlled_write_target') {
    next.source_ranges = [...next.source_ranges, 'Temporal World v4 Appendix A party_runtime storage contracts'];
    next.values = appendValues(next.values, temporalWriteTargets, (id) => ({
      ...value(id, { derivation: 'party_runtime_storage_contract' }),
      description: `Logical write target owned by party-runtime contract \`${id}\`.`
    }));
  }
  return next;
});

const vocabularies = [...inherited, ...temporal]
  .map((entry, index) => {
    const next = {
      ...entry,
      path: `${outputPath}#/vocabularies/${index}`,
      version: '2.0.0'
    };
    delete next.digest;
    return { ...next, digest: canonicalDigest(next) };
  });

const registry = {
  registry_id: base.registry_id,
  version: '2.0.0',
  status: 'approved',
  approval_basis: 'Approved Temporal World v4 plan/specification plus ADR-002; technical contract vocabularies only, no historical or regional facts.',
  source_document: 'data/knowledge-source/corpus/DOCUMENTS/temporal_world_and_interruptible_activities.md',
  source_document_supplied_filename: 'Механика_течения_времени_v4_implementation_ready.md',
  source_document_sha256: 'f97e71536c08a3b5cc0414fe25460bf70b2d95ee94ff861f785b0a3d9fbfb26e',
  plan_document_sha256: 'd8464cbb91708379c3a4cf288b1842ee41676199fb8a0acaf51b79bcb0623016',
  vocabulary_count: vocabularies.length,
  value_count: vocabularies.reduce((sum, entry) => sum + entry.values.length, 0),
  extension_policy: base.extension_policy,
  unknown_value_policy: base.unknown_value_policy,
  vocabularies
};
registry.aggregate_digest = canonicalDigest(registry);

const rendered = `${JSON.stringify(registry, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const current = await readFile(outputPath, 'utf8');
  if (current !== rendered) throw new Error(`${outputPath} is stale`);
  console.log(`Temporal vocabulary registry is reproducible: ${registry.vocabulary_count}/${registry.value_count}.`);
} else {
  await writeFile(outputPath, rendered, 'utf8');
  console.log(`Wrote ${outputPath}: ${registry.vocabulary_count}/${registry.value_count}.`);
}

function vocabulary(pseudoType, registryId, ids, consumers, sourceRange) {
  return {
    pseudo_type: pseudoType,
    registry_id: registryId,
    path: '',
    version: '2.0.0',
    status: 'approved',
    open_ended: false,
    canonical_order: 'value.id ascending (Unicode code-point order)',
    consumers,
    source_ranges: [sourceRange],
    values: [...ids].sort().map((id) => value(id))
  };
}

function value(id, metadata = {}) {
  return {
    id,
    label: id.replaceAll('_', ' '),
    description: `Closed Temporal World v1 technical contract value \`${id}\`.`,
    metadata: { derivation: 'approved_temporal_world_v1_norm', ...metadata }
  };
}

function appendValues(existing, ids, build) {
  const byId = new Map(existing.map((entry) => [entry.id, structuredClone(entry)]));
  for (const id of ids) {
    if (byId.has(id)) throw new Error(`Temporal vocabulary extension duplicates existing value ${id}.`);
    byId.set(id, build(id));
  }
  return [...byId.values()].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

function canonicalJson(valueToSerialize) {
  if (Array.isArray(valueToSerialize)) return `[${valueToSerialize.map(canonicalJson).join(',')}]`;
  if (valueToSerialize && typeof valueToSerialize === 'object') {
    return `{${Object.keys(valueToSerialize).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(valueToSerialize[key])}`).join(',')}}`;
  }
  return JSON.stringify(valueToSerialize);
}

function canonicalDigest(valueToDigest) {
  return createHash('sha256').update(canonicalJson(valueToDigest)).digest('hex');
}
