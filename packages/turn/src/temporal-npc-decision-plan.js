const BLOCKED = 'TURN_MATERIALIZATION_NEEDS_CHECK_BLOCKED';

/** Replace a blocked validated NPC proposal before the actor-step owner runs. */
export async function prepareNpcDecisionForActorStep({ autonomous,
  committedState, assertNeedsCheckAllowed = null,
  recordNeedsCheckFilter = null } = {}) {
  const plan = autonomous?.proposal?.plan;
  if (plan == null || typeof assertNeedsCheckAllowed !== 'function') {
    return autonomous;
  }
  for (const operation of plannedOperations(plan)) {
    for (const candidate of needsCheckCandidates(operation,
      autonomous.request, committedState)) {
      try {
        await assertNeedsCheckAllowed({ committedState, candidate });
      } catch (error) {
        if (error?.code !== BLOCKED) throw error;
        const queueIds = error.details?.queue_ids
          ?? (typeof error.details?.queue_id === 'string'
            ? [error.details.queue_id] : []);
        if (typeof recordNeedsCheckFilter === 'function') {
          await recordNeedsCheckFilter({ path: candidate.path,
            queue_ids: structuredClone(queueIds) });
        }
        const proposal = { ...structuredClone(autonomous.proposal),
          plan: waitPlan(plan, autonomous.request?.npc_ref ?? plan.npc_ref) };
        return { ...structuredClone(autonomous), proposal,
          decision_records: (autonomous.decision_records ?? []).map((record) =>
            ({ ...structuredClone(record), proposal })) };
      }
    }
  }
  return autonomous;
}

function plannedOperations(plan) {
  return plan.resolution === 'generic_check'
    ? Object.values(plan.check?.outcomes ?? {}).flatMap(
      ({ operations = [] }) => operations)
    : plan.operations ?? [];
}

function needsCheckCandidates(operation, request, committedState) {
  if (operation?.op === 'create_entity') return [{
    semantic_type: operation.semantic_type,
    name: operation.name,
    facts: (operation.facts ?? []).map(({ text }) => text),
    path: 'NPC.create_entity'
  }];
  if (operation?.op === 'request_discovery'
      && operation.discovery_kind === 'inspect'
      && matchesNpcCommittedInspection(operation, request, committedState)) {
    return [];
  }
  if (operation?.op === 'request_discovery'
      && ['inspect', 'search', 'dig'].includes(operation.discovery_kind)) {
    return [{ name: operation.query, path: 'O1.request.query' }];
  }
  const production = operation?.op === 'request_item_use'
    ? operation.action_production : null;
  if (production?.identity_mode !== 'independent_outputs'
      || production.result_descriptor == null) return [];
  const descriptor = production.result_descriptor;
  const sourceFactDeltaBaseline = sourceDescriptorFor(
    request, production.source_refs?.[0]);
  return [{ name: descriptor.display_name,
    display_name: descriptor.display_name,
    physical_description: descriptor.physical_description,
    qualitative_facts: descriptor.qualitative_facts,
    inscription_text: descriptor.inscription_text,
    ...(descriptor.source_fact_delta == null ? {} : {
      source_fact_delta: descriptor.source_fact_delta,
      ...(sourceFactDeltaBaseline == null ? {} : {
        source_fact_delta_baseline: sourceFactDeltaBaseline
      }) }),
    path: 'A1.preflight.result_descriptor' }];
}

function matchesNpcCommittedInspection(operation, request, committedState) {
  const targetRef = operation.target_refs?.length === 1
    ? operation.target_refs[0] : null;
  if (typeof targetRef !== 'string') return false;
  const availableRefs = new Set((request?.npc?.available_resources ?? [])
    .map(({ resource_ref: ref }) => ref));
  if (!availableRefs.has(targetRef)) return false;
  const query = normalizeVisibleName(operation.query);
  if (query == null) return false;
  const matches = (committedState?.items ?? []).filter((item) =>
    availableRefs.has(item?.item_id ?? item?.instance_id)
      && normalizeVisibleName(item?.name ?? item?.state?.display_name) === query);
  return matches.length === 1
    && (matches[0]?.item_id ?? matches[0]?.instance_id) === targetRef;
}

function normalizeVisibleName(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFKC').trim().replace(/\s+/gu, ' ')
    .toLocaleLowerCase('ru-RU');
  return normalized || null;
}

function sourceDescriptorFor(request, sourceRef) {
  if (typeof sourceRef !== 'string') return null;
  const resource = (request?.resource_snapshots ?? []).find((candidate) =>
    (candidate?.resource_ref ?? candidate?.container_id ?? candidate?.item_id)
      === sourceRef);
  if (resource == null) return null;
  const metadata = resource.state?.ordinary_metadata
    ?? resource.ordinary_metadata ?? {};
  const facts = (metadata.semantic_facts ?? []).flatMap((fact) =>
    typeof fact?.text === 'string' ? [fact.text]
      : typeof fact?.summary === 'string' ? [fact.summary] : []);
  const inscriptions = (metadata.physical_inscriptions ?? []).flatMap((fact) =>
    typeof fact?.text === 'string' ? [fact.text]
      : typeof fact?.summary === 'string' ? [fact.summary] : []);
  return {
    name: metadata.name ?? resource.name ?? resource.item_id,
    display_name: metadata.name ?? resource.name ?? null,
    semantic_type: metadata.semantic_type ?? resource.category_id ?? null,
    physical_description: metadata.physical_description ?? null,
    qualitative_facts: facts,
    inscription_text: inscriptions.join(' ')
  };
}

function waitPlan(plan, npcRef) {
  return { ...structuredClone(plan), resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_activity', actor_ref: npcRef,
      activity_kind: 'wait', target_refs: [],
      description: 'Ждать до следующей точки решения.' }],
    check: null };
}
