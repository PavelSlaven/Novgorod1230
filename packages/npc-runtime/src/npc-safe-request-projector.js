import { buildNpcActionDecisionRequest } from
  './semantic-decision-request-contract.js';
import { runtimeItemRecordIsConcealed } from
  '@rus/items-property/runtime-item-visibility';

export function buildNpcActionDecisionRequestFromSnapshots(rawInput = {}) {
  const input = strictSnapshot(rawInput);
  if (input == null) throw new TypeError(
    'NPC request snapshots must be detached strict JSON data');
  const { request_identity, boundary, npc_snapshot,
    current_activity_snapshot, historical_context_snapshot = null,
    body_snapshot = null, mood_snapshot = null, relationship_snapshots = [],
    resource_snapshots = [], perception_snapshot = null,
    knowledge_snapshot = null, memory_snapshot = null, resolved_signals,
    operation_contract } = input;
  const machineState = npc_snapshot?.machine_state ?? {};
  const identityState = npc_snapshot?.identity_state ?? {};
  const socialRole = npc_snapshot?.social_role ?? {};
  const signalRefs = new Map((resolved_signals ?? []).map(
    (signal) => [signal.signal_id, signal]
  ));
  const orderedSignals = boundary?.signal_refs?.map(
    ({ entity_id: signalId }) => signalRefs.get(signalId)
  );
  if (orderedSignals?.some((signal) => signal === undefined)) {
    throw new TypeError('NPC request snapshots must include every boundary signal');
  }
  return buildNpcActionDecisionRequest({
    schema: 'npc_action_decision_request_v1',
    ...structuredClone(request_identity),
    boundary_id: boundary.boundary_id,
    occurred_at: structuredClone(boundary.scheduled_at),
    npc_ref: npc_snapshot.instance_id,
    decision_reasons: {
      significance: boundary.significance,
      categories: structuredClone(boundary.categories),
      signal_refs: structuredClone(boundary.signal_refs),
      perceived_changes: projectPerceivedChanges(
        orderedSignals, perception_snapshot
      )
    },
    historical_context: {
      year: historical_context_snapshot?.year ?? null,
      season: historical_context_snapshot?.season ?? null,
      region: historical_context_snapshot?.region ?? null,
      applicable_norms: structuredClone(
        projectEntries(historical_context_snapshot?.applicable_norms,
          ['norm_ref', 'summary', 'status'])
      ),
      known_local_customs: structuredClone(
        projectEntries(historical_context_snapshot?.known_local_customs,
          ['custom_ref', 'summary', 'status'])
      )
    },
    npc: {
      profile_level: npc_snapshot.profile_level ?? null,
      identity: {
        name_or_label: identityState.canonical_name ?? null,
        age_range: identityState.age_range ?? null,
        origin: identityState.origin ?? null
      },
      social_role: {
        role_ref: npc_snapshot.role_ref?.id ?? socialRole.role_ref ?? null,
        status: socialRole.status ?? null,
        authority: projectEntries(socialRole.authority,
          ['actor_ref', 'role_ref', 'scope_ref', 'status']),
        dependencies: projectEntries(socialRole.dependencies,
          ['actor_ref', 'role_ref', 'scope_ref', 'status'])
      },
      attributes: projectRatedRefs(npc_snapshot.attributes, 'attribute_ref'),
      skills: projectRatedRefs(npc_snapshot.skills, 'skill_ref'),
      body_state: {
        summary: body_snapshot?.summary ?? null,
        conditions: projectEntries(body_snapshot?.conditions
          ?? machineState.body_conditions, [
          'condition_ref', 'condition_profile_ref', 'status', 'severity',
          'summary'
        ])
      },
      mood: mood_snapshot === null ? null : {
        state: mood_snapshot.state,
        intensity: mood_snapshot.intensity
      },
      temperament: projectEntries(npc_snapshot.temperament,
        ['temperament_ref', 'summary', 'state', 'intensity']),
      values: projectEntries(npc_snapshot.values,
        ['value_ref', 'summary', 'state', 'intensity']),
      goals: projectEntries(npc_snapshot.goals,
        ['goal_ref', 'summary', 'state', 'priority']),
      fears: projectEntries(npc_snapshot.fears,
        ['fear_ref', 'summary', 'state', 'intensity']),
      obligations: projectEntries(npc_snapshot.obligations,
        ['obligation_ref', 'actor_ref', 'summary', 'status']),
      relationships: projectEntries(relationship_snapshots, [
        'relationship_ref', 'actor_ref', 'relation', 'status', 'trust',
        'hostility', 'dependency'
      ]),
      current_activity: {
        activity_ref: current_activity_snapshot?.activity_ref ?? null,
        summary: current_activity_snapshot?.summary ?? null,
        status: current_activity_snapshot?.status,
        can_continue_automatically:
          current_activity_snapshot?.can_continue_automatically
      },
      available_resources: projectNpcSafeResourceSnapshotData({
        npc_snapshot,
        resource_snapshots,
        perception_snapshot,
        knowledge_snapshot
      })
    },
    perception: completePerceptionSnapshot(perception_snapshot),
    knowledge: {
      known_facts: projectEntries(knowledge_snapshot?.known_facts,
        [
          'fact_ref', 'source_event_ref', 'resource_ref', 'summary', 'state',
          'confidence'
        ]),
      beliefs: projectEntries(knowledge_snapshot?.beliefs,
        ['belief_ref', 'source_event_ref', 'summary', 'state', 'confidence']),
      hypotheses: projectEntries(knowledge_snapshot?.hypotheses, [
        'hypothesis_ref', 'source_event_ref', 'summary', 'state', 'confidence'
      ])
    },
    memory: {
      recent_events: projectEntries(memory_snapshot?.recent_events,
        ['event_ref', 'source_event_ref', 'summary', 'occurred_at']),
      relevant_long_term_events: projectEntries(
        memory_snapshot?.relevant_long_term_events,
        ['event_ref', 'source_event_ref', 'summary', 'occurred_at']
      ),
      previous_decisions: projectEntries(memory_snapshot?.previous_decisions,
        ['request_ref', 'boundary_ref'])
    },
    decision_scope: {
      mode: 'autonomous_action',
      allowed_attribute_refs: (npc_snapshot.attributes ?? [])
        .map(({ attribute_ref: ref }) => ref),
      allowed_skill_refs: (npc_snapshot.skills ?? [])
        .map(({ skill_ref: ref }) => ref),
      operation_contract: structuredClone(operation_contract)
    }
  });
}

export function projectNpcSafeResourceSnapshots(rawInput = {}) {
  const input = strictSnapshot(rawInput);
  if (input == null) throw new TypeError(
    'NPC resource snapshots must be detached strict JSON data');
  return projectNpcSafeResourceSnapshotData(input);
}

function projectNpcSafeResourceSnapshotData({ npc_snapshot,
  resource_snapshots = [], perception_snapshot = null,
  knowledge_snapshot = null }) {
  const npcId = npc_snapshot?.instance_id;
  const machineState = npc_snapshot?.machine_state ?? {};
  const npcLocation = machineState.location_ref
    ?? npc_snapshot?.location_profile_ref ?? null;
  const npcZone = machineState.spatial_zone_ref ?? npc_snapshot?.zone_ref ?? null;
  return resource_snapshots.flatMap((resource) => {
    const state = resource?.state ?? {};
    const placement = resource?.placement ?? {};
    const ownership = resource?.ownership ?? {};
    const holder = resource?.holder_npc_id ?? placement.holder_npc_id ?? null;
    const controller = state.controller_npc_id
      ?? ownership.controller_npc_id ?? null;
    const location = state.location_ref ?? resource?.location_ref ?? null;
    const zone = state.zone_ref ?? resource?.zone_ref ?? null;
    const access = state.access_state ?? state.accessibility
      ?? resource?.access_state ?? null;
    const visibility = state.visibility_state
      ?? resource?.visibility_state ?? null;
    const controlled = holder === npcId || controller === npcId;
    const colocated = (location !== null && location === npcLocation)
      || (zone !== null && zone === npcZone);
    const accessible = ['accessible', 'available', 'open', 'immediate', 'quick']
      .includes(access);
    const blocked = runtimeItemRecordIsConcealed({ access_state: access });
    const hidden = runtimeItemRecordIsConcealed(resource,
      { includeAccess: false });
    const resourceRef = resource?.resource_ref ?? resource?.container_id
      ?? resource?.item_id;
    const subjectivelyKnown = hasSubjectiveResourceEvidence({
      resourceRef,
      perceptionSnapshot: perception_snapshot,
      knowledgeSnapshot: knowledge_snapshot
    });
    if (blocked || (controlled
      ? hidden && !subjectivelyKnown
      : !colocated || !accessible || hidden || !subjectivelyKnown)) {
      return [];
    }
    return [{
      resource_ref: resourceRef,
      template_ref: resource?.template_ref ?? resource?.template_id ?? null,
      location_ref: location,
      zone_ref: zone,
      holder_npc_id: holder,
      controller_npc_id: controller,
      visibility_state: visibility
    }];
  }).filter(({ resource_ref: resourceRef }) =>
    typeof resourceRef === 'string' && resourceRef.length > 0);
}

function strictSnapshot(input) {
  const seen = new Set();
  function copy(value) {
    if (value === null || typeof value === 'string'
        || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : BAD;
    if (typeof value !== 'object' || seen.has(value)
        || Object.getOwnPropertySymbols(value).length > 0) return BAD;
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype
      : Object.prototype)) return BAD;
    seen.add(value);
    const output = array ? [] : {};
    for (const key of Object.getOwnPropertyNames(value)) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor?.enumerable !== true
          || !Object.hasOwn(descriptor, 'value')) return BAD;
      const child = copy(descriptor.value);
      if (child === BAD) return BAD;
      output[key] = child;
    }
    return output;
  }
  const copied = copy(input);
  return copied === BAD ? null : copied;
}
const BAD = Symbol('bad');

function hasSubjectiveResourceEvidence({
  resourceRef,
  perceptionSnapshot,
  knowledgeSnapshot
}) {
  if (typeof resourceRef !== 'string' || resourceRef.length === 0) {
    return false;
  }
  const perceptionEntries = [
    'visible_scene', 'perceived_changes', 'heard', 'felt', 'present_actors',
    'visible_objects', 'known_routes_and_exits'
  ].flatMap((key) => Array.isArray(perceptionSnapshot?.[key])
    ? perceptionSnapshot[key] : []);
  const knowledgeEntries = Array.isArray(knowledgeSnapshot?.known_facts)
    ? knowledgeSnapshot.known_facts : [];
  return [...perceptionEntries, ...knowledgeEntries].some((entry) =>
    sourceBacked(entry) && entryReferencesResource(entry, resourceRef));
}

function sourceBacked(entry) {
  return ['source_event_ref', 'source_perception_ref', 'perception_result_ref']
    .some((field) => stableEvidenceRef(entry?.[field]));
}

function entryReferencesResource(entry, resourceRef) {
  const fields = [
    'resource_ref', 'object_ref', 'item_ref', 'container_ref', 'entity_ref'
  ];
  return fields.some((field) => evidenceRefId(entry?.[field]) === resourceRef)
    || ['resource_refs', 'object_refs', 'item_refs', 'container_refs',
      'entity_refs', 'scope_refs'].some((field) =>
      Array.isArray(entry?.[field]) && entry[field].some(
        (value) => evidenceRefId(value) === resourceRef));
}

function stableEvidenceRef(value) {
  return evidenceRefId(value) !== null;
}

function evidenceRefId(value) {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value !== null && typeof value === 'object'
      && typeof value.entity_id === 'string' && value.entity_id.length > 0) {
    return value.entity_id;
  }
  return null;
}

function projectPerceivedChanges(orderedSignals, perception_snapshot) {
  const bySource = new Map();
  for (const entry of perception_snapshot?.perceived_changes ?? []) {
    const source = entry?.source_event_ref;
    const summary = entry?.summary ?? entry?.content;
    if (source?.entity_kind && source?.entity_id
        && typeof summary === 'string' && summary.length > 0) {
      bySource.set(`${source.entity_kind}:${source.entity_id}`, summary);
    }
  }
  return orderedSignals.map(({ source_event_ref: source }) => {
    const key = `${source.entity_kind}:${source.entity_id}`;
    const summary = bySource.get(key);
    if (summary == null) {
      throw new TypeError(
        `NPC-safe perceived change summary is required for ${key}`
      );
    }
    return summary;
  });
}

function completePerceptionSnapshot(snapshot) {
  const fields = [
    'fact_ref', 'source_event_ref', 'actor_ref', 'speaker_ref', 'object_ref',
    'resource_ref', 'template_ref', 'location_ref', 'zone_ref', 'route_ref',
    'condition_ref', 'summary', 'content', 'change_kind', 'relation',
    'visibility_state', 'destination_zone_ref', 'state', 'confidence'
  ];
  return Object.fromEntries([
    'visible_scene', 'perceived_changes', 'heard', 'felt', 'present_actors',
    'visible_objects', 'known_routes_and_exits', 'uncertainties'
  ].map((key) => [key, projectEntries(snapshot?.[key], fields)]));
}

function projectRatedRefs(values, refKey) {
  return (values ?? []).map((entry) => ({
    [refKey]: entry?.[refKey],
    label: entry?.label,
    value: entry?.value
  }));
}

function projectEntries(values = [], allowedFields) {
  return values.flatMap((entry) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return [];
    }
    return [Object.fromEntries(allowedFields.flatMap((field) => {
      const projected = projectValue(entry[field]);
      return projected === undefined ? [] : [[field, projected]];
    }))];
  });
}

function projectValue(value) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
    return value;
  }
  if (value != null && typeof value === 'object'
      && typeof value.entity_kind === 'string'
      && typeof value.entity_id === 'string') {
    return {
      entity_kind: value.entity_kind,
      entity_id: value.entity_id
    };
  }
  if (value != null && typeof value === 'object'
      && ['whole_minutes', 'subminute_numerator', 'subminute_denominator']
        .every((key) => typeof value[key] === 'string')) {
    return {
      whole_minutes: value.whole_minutes,
      subminute_numerator: value.subminute_numerator,
      subminute_denominator: value.subminute_denominator
    };
  }
  return undefined;
}
