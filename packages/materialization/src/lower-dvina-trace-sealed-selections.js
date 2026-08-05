import { canonicalDigest } from './core.js';
import { failLowerDvinaTraceMaterialization as fail } from './lower-dvina-trace-contract.js';

export function buildLowerDvinaTraceSealedSelections(bundle, selected) {
  const lateLocations = selected.locationSelections.filter(
    (value) => value.slot_key !== 'trace_ld_v1_loc_wreck_shore'
  );
  const groups = [
    ['participants', selected.participantSelections.filter(
      (value) => value.slot_key !== 'player_clerk'
    )],
    ['locations', lateLocations],
    ['items', bundle.item_container_set.item_templates
      .filter((value) => value.item_template_id !== 'trace_ld_v1_item_mikula_knife')
      .map((record) => sealedRef(record.item_template_id, record))],
    ['containers', bundle.item_container_set.container_templates
      .map((record) => sealedRef(record.container_template_id, record))],
    ['clue_placements', bundle.item_container_set.placement_slots.map((record) => ({
      ...sealedRef(record.placement_slot_id, record),
      causal_binding: record.location_ref
    }))],
    ['evidence', bundle.clue_evidence_graph_set.evidence_records.map((record) => ({
      ...sealedRef(record.evidence_id, record),
      discovery_slot_ref: record.discovery_slot_ref,
      causal_binding: {
        location_refs: structuredClone(record.allowed_location_refs),
        item_refs: structuredClone(record.allowed_item_refs)
      }
    }))],
    ['knowledge', bundle.knowledge_lie_memory_rules.participant_knowledge_bindings
      .map((record) => ({
        ...sealedRef(record.participant_ref, record),
        source_ref: record.knowledge_scope_ref
      }))],
    ['lies_and_statements', bundle.knowledge_lie_memory_rules.statement_templates
      .map((record) => sealedRef(record.statement_template_id, record))],
    ['memories', bundle.knowledge_lie_memory_rules.perception_source_templates
      .map((record) => sealedRef(record.perception_template_id, record))],
    ['activities', exactRecordRefs(
      bundle.activity_check_consequence_profiles.activity_profiles,
      'profile_id',
      'activity profile'
    )],
    ['checks', exactRecordRefs(
      bundle.activity_check_consequence_profiles.check_profiles,
      'check_id',
      'check profile'
    )],
    ['consequences', exactRecordRefs(
      bundle.activity_check_consequence_profiles.consequence_profiles,
      'consequence_id',
      'consequence profile'
    )],
    ['npc_decisions', exactRecordRefs(
      bundle.npc_decision_schedule_policies.decision_policies,
      'policy_id',
      'NPC decision policy'
    )],
    ['npc_schedules', exactRecordRefs(
      bundle.npc_decision_schedule_policies.schedule_policies,
      'schedule_policy_id',
      'NPC schedule policy'
    )],
    ['movement', exactRecordRefs(bundle.movement_bindings.route_bindings, 'route_id', 'movement binding')],
    ['body', [sealedRef(selected.body.profile_id, selected.body)]],
    ['environment', [sealedRef(selected.environment.environment_profile_id, selected.environment)]],
    ['promise', [sealedRef(
      requiredText(bundle.promise_policy.policy_id, 'promise_policy.policy_id'),
      bundle.promise_policy
    )]],
    ['completion', [sealedRef(bundle.completion_rules.set_id, bundle.completion_rules)]],
    ['epilogue', [sealedRef(bundle.epilogue_rules.set_id, bundle.epilogue_rules)]],
    ['audience', [sealedRef(
      selected.participatingFisher,
      bundle.knowledge_lie_memory_rules.audience_candidate_slots[0]
    )]]
  ];
  if ([8, 9, 10, 11, 12, 13, 14, 15].includes(bundle.definition_revision)) {
    groups.push(
      ['interaction_persistence_mappings', exactRecordRefs(
        bundle.knowledge_lie_memory_rules.interaction_persistence_mappings,
        'mapping_id',
        'interaction persistence mapping'
      )],
      ['speaker_memory_templates', exactRecordRefs(
        bundle.knowledge_lie_memory_rules.memory_records,
        'memory_template_id',
        'speaker memory template'
      )],
      ['player_journal_templates', exactRecordRefs(
        bundle.knowledge_lie_memory_rules.player_facing_text_records,
        'journal_template_id',
        'player journal template'
      )]
    );
  }
  return groups.map(([selection_kind, records]) => ({
    selection_kind,
    source_pin: structuredClone(sourcePinForGroup(bundle, selection_kind)),
    records: structuredClone(records)
      .sort((left, right) => sealedRecordId(left).localeCompare(sealedRecordId(right)))
  }));
}

function sourcePinForGroup(bundle, kind) {
  const key = kind === 'participants' ? 'participant_profile_set'
    : kind === 'locations' ? 'location_topology_set'
      : ['items', 'containers', 'clue_placements'].includes(kind) ? 'item_container_set'
        : kind === 'evidence' ? 'clue_evidence_graph_set'
          : [
            'knowledge',
            'lies_and_statements',
            'memories',
            'audience',
            'interaction_persistence_mappings',
            'speaker_memory_templates',
            'player_journal_templates'
          ].includes(kind) ? 'knowledge_lie_memory_rules'
            : ['activities', 'checks', 'consequences'].includes(kind)
              ? 'activity_check_consequence_profiles'
              : ['npc_decisions', 'npc_schedules'].includes(kind)
                ? 'npc_decision_schedule_policies'
                : kind === 'movement' ? 'movement_bindings'
                  : ['body', 'environment'].includes(kind) ? 'body_environment_profiles'
                    : kind === 'promise' ? 'promise_policy'
                      : kind === 'completion' ? 'completion_rules'
                        : 'epilogue_rules';
  return bundle.artifact_pins[key];
}

function exactRecordRefs(values, key, label) {
  return exactArray(values, label)
    .map((record) => sealedRef(requiredText(record?.[key], `${label}.${key}`), record));
}

function sealedRef(selectedId, record) {
  return {
    selected_id: selectedId,
    record_digest: canonicalDigest(record)
  };
}

function sealedRecordId(value) {
  return requiredText(value?.selected_id, 'sealed selection selected_id');
}

function requiredText(value, label) {
  if (typeof value !== 'string' || !value) {
    fail('MANDATORY_RECORD_INVALID', `${label} is required.`);
  }
  return value;
}

function exactArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail('MANDATORY_RECORD_INVALID', `${label} must be a non-empty exact array.`);
  }
  return value;
}
