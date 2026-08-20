import {
  applyOrdinaryAggregateTransition,
  canonicalDigest
} from '@rus/materialization';
import {
  basisDigest,
  fail,
  safeVersion
} from './ordinary-materialization-phase-6-commit-internal.js';
import {
  createOrdinaryContainerContentsAtomicWritePlan
} from './ordinary-materialization-container-batch-plan.js';
import { ordinaryContainerRuntimeItemState } from
  './ordinary-materialization-container-batch-item.js';

export async function applyOrdinaryContainerContentsAtomicWritePlanInTransaction({
  client, input, partyStateVersionAfter = null, updatePartyState = false,
  p16ChangeSetId = null
} = {}) {
  if (!client?.query) fail('ORDINARY_CONTAINER_BATCH_TRANSACTION_REQUIRED');
  if (typeof p16ChangeSetId !== 'string'
      || p16ChangeSetId.trim() !== p16ChangeSetId || !p16ChangeSetId) {
    fail('ORDINARY_CONTAINER_BATCH_P16_REQUIRED');
  }
  const plan = createOrdinaryContainerContentsAtomicWritePlan(input);
  const current = await lockCore(client, plan);
  const old = await client.query(`SELECT input_digest,transition_digest,
      write_plan_digest,to_ordinary_state_version
    FROM party_runtime.party_ordinary_materialization_commits
    WHERE party_id=$1 AND request_identity=$2 FOR UPDATE`,
  [plan.party_id,plan.request_identity]);
  if (old.rowCount) {
    const row = old.rows[0];
    if (row.input_digest !== plan.input_digest
        || row.transition_digest !== plan.transition_digest
        || row.write_plan_digest !== plan.write_plan_digest) {
      fail('ORDINARY_PHASE6_IDEMPOTENCY_COLLISION');
    }
    return Object.freeze({ status:'committed', replay:true,
      state_version:Number(row.to_ordinary_state_version) });
  }
  const nextPartyVersion = partyStateVersionAfter
    ?? current.party_state_version + 1;
  if (!Number.isSafeInteger(nextPartyVersion)
      || nextPartyVersion !== current.party_state_version + 1) {
    fail('ORDINARY_PHASE6_PARTY_STATE_OWNER_INVALID');
  }
  for (const [key,value] of Object.entries(plan.expected_versions)) {
    if (current[key] !== value) fail(key === 'container_state_version'
      ? 'ORDINARY_CONTAINER_BATCH_CONTAINER_STALE'
      : 'ORDINARY_PHASE6_PROPOSAL_STALE');
  }
  const enabled = await client.query(`SELECT objective_digest,enabled
    FROM party_runtime.party_ordinary_materialization_enablements
    WHERE party_id=$1 AND scope_kind='container' AND scope_id=$2 FOR UPDATE`,
  [plan.party_id,plan.scope_ref.entity_id]);
  if (enabled.rowCount !== 1 || enabled.rows[0].enabled !== true
      || enabled.rows[0].objective_digest !== plan.enablement_pin.objective_digest) {
    fail('ORDINARY_PHASE6_ENABLEMENT_STALE');
  }
  if (current.container_template_id !== plan.container_pin.template_id
      || current.mechanics_profile_ref
        !== plan.container_pin.mechanics_profile_ref
      || current.mechanics_profile_digest
        !== plan.container_pin.mechanics_profile_digest
      || current.container_context_digest !== plan.container_pin.context_digest
      || canonicalDigest(current.ordinary_policy)
        !== plan.container_pin.ordinary_policy_digest
      || !policyLimitMatches(current.ordinary_policy,
        plan.technical_limits)) {
    fail('ORDINARY_CONTAINER_BATCH_CONTAINER_STALE');
  }
  const capacity = await capacitySnapshot(client, plan);
  if (canonicalDigest(capacity) !== plan.expected_versions.capacity_snapshot_digest) {
    fail('ORDINARY_CONTAINER_BATCH_CAPACITY_STALE');
  }
  let aggregate = current.aggregate;
  for (const transition of plan.transitions) {
    aggregate = applyOrdinaryAggregateTransition({ aggregate, transition });
  }
  if (canonicalDigest(aggregate) !== canonicalDigest(plan.next_aggregate)) {
    fail('ORDINARY_PHASE6_AGGREGATE_DELTA_INVALID');
  }
  await insertCommit(client, plan, current, nextPartyVersion);
  for (const basis of plan.new_prepared_bases) {
    await client.query(`INSERT INTO party_runtime.party_ordinary_materialization_basis_catalog
      (party_id,scope_kind,scope_id,basis_ref,origin_request_identity,basis_snapshot)
      VALUES ($1,'container',$2,$3,$4,$5::jsonb)`,
    [plan.party_id,plan.scope_ref.entity_id,basis.basis_ref,
      plan.request_identity,JSON.stringify(basis)]);
  }
  for (let ordinal = 0; ordinal < plan.items.length; ordinal += 1) {
    await insertItem(client, plan, plan.items[ordinal], ordinal,
      p16ChangeSetId, current.container_ownership);
  }
  const aggregateUpdate = await client.query(`UPDATE party_runtime.party_ordinary_materialization_aggregates
    SET state_version=$4,aggregate_payload=$5::jsonb
    WHERE party_id=$1 AND scope_kind='container' AND scope_id=$2
      AND state_version=$3`, [plan.party_id,plan.scope_ref.entity_id,
    current.ordinary_state_version,aggregate.state_version,
    JSON.stringify(aggregate)]);
  if (aggregateUpdate.rowCount !== 1) {
    fail('ORDINARY_PHASE6_ORDINARY_STATE_STALE');
  }
  const contextUpdate = await client.query(`UPDATE party_runtime.party_ordinary_materialization_contexts
    SET supporting_basis_catalog_version=$4,
        supporting_basis_catalog_digest=$5
    WHERE party_id=$1 AND scope_kind='container' AND scope_id=$2
      AND supporting_basis_catalog_version=$3`, [plan.party_id,
    plan.scope_ref.entity_id,current.supporting_basis_catalog_version,
    plan.next_supporting_basis_catalog_version,
    plan.next_supporting_basis_catalog_digest]);
  if (contextUpdate.rowCount !== 1) fail('ORDINARY_PHASE6_PROPOSAL_STALE');
  const container = await client.query(`UPDATE party_runtime.party_containers
    SET state=state || $4::jsonb,
        closure_state=CASE WHEN $6 THEN 'open' ELSE closure_state END,
        state_version=state_version+1,updated_change_set_id=$5
    WHERE party_id=$1 AND container_id=$2 AND state_version=$3`,
  [plan.party_id,plan.scope_ref.entity_id,current.container_state_version,
    JSON.stringify(plan.container_transition.state_patch),p16ChangeSetId,
    plan.container_transition.access_kind !== 'resolve_concealed']);
  if (container.rowCount !== 1) fail('ORDINARY_CONTAINER_BATCH_CONTAINER_STALE');
  if (updatePartyState) {
    const party = await client.query(`UPDATE party_runtime.parties
      SET state_version=$3 WHERE party_id=$1 AND state_version=$2`,
    [plan.party_id,current.party_state_version,nextPartyVersion]);
    if (party.rowCount !== 1) fail('ORDINARY_PHASE6_PROPOSAL_STALE');
  }
  return Object.freeze({ status:'committed', replay:false,
    state_version:aggregate.state_version });
}

async function lockCore(client, plan) {
  const result = await client.query(`SELECT p.state_version AS party_state_version,
      a.state_version AS ordinary_state_version,a.aggregate_payload,
      c.catalog_version,c.property_version,c.placement_version,
      c.supporting_basis_catalog_version,c.supporting_basis_catalog_digest,
      c.property_placement_context_digest,
      x.state_version AS container_state_version,x.template_id AS container_template_id,
      x.state->'ordinary_contents_context'->>'mechanics_profile_ref' AS mechanics_profile_ref,
      x.state->'ordinary_contents_context'->>'mechanics_profile_digest' AS mechanics_profile_digest,
      x.state->'ordinary_contents_context'->>'context_digest' AS container_context_digest,
      x.state->'ordinary_contents_context'->'ordinary_policy' AS ordinary_policy,
      o.owner_npc_id,o.owner_character_id,o.owner_party,
      o.controller_npc_id,o.controller_character_id,o.claim_state
    FROM party_runtime.parties p
    JOIN party_runtime.party_ordinary_materialization_aggregates a
      ON a.party_id=p.party_id AND a.scope_kind='container' AND a.scope_id=$2
    JOIN party_runtime.party_ordinary_materialization_contexts c
      ON c.party_id=a.party_id AND c.scope_kind=a.scope_kind AND c.scope_id=a.scope_id
    JOIN party_runtime.party_containers x
      ON x.party_id=p.party_id AND x.container_id=$2
    JOIN party_runtime.party_ownership o
      ON o.party_id=x.party_id AND o.container_id=x.container_id
    WHERE p.party_id=$1 FOR UPDATE OF p,a,c,x,o`,
  [plan.party_id,plan.scope_ref.entity_id]);
  if (result.rowCount !== 1) fail('ORDINARY_PHASE6_COMMITTED_STATE_MISSING');
  const row = result.rows[0];
  const bases = await client.query(`SELECT basis_snapshot
    FROM party_runtime.party_ordinary_materialization_basis_catalog
    WHERE party_id=$1 AND scope_kind='container' AND scope_id=$2
    ORDER BY basis_ref FOR UPDATE`, [plan.party_id,plan.scope_ref.entity_id]);
  const snapshots = bases.rows.map(({ basis_snapshot }) => basis_snapshot);
  if (basisDigest(snapshots) !== row.supporting_basis_catalog_digest) {
    fail('ORDINARY_PHASE6_COMMITTED_CONTEXT_INVALID');
  }
  return { party_state_version:safeVersion(row.party_state_version),
    ordinary_state_version:safeVersion(row.ordinary_state_version),
    catalog_version:safeVersion(row.catalog_version),
    property_version:safeVersion(row.property_version),
    placement_version:safeVersion(row.placement_version),
    supporting_basis_catalog_version:
      safeVersion(row.supporting_basis_catalog_version),
    supporting_basis_catalog_digest:row.supporting_basis_catalog_digest,
    property_placement_context_digest:row.property_placement_context_digest,
    container_state_version:safeVersion(row.container_state_version),
    capacity_snapshot_digest:plan.expected_versions.capacity_snapshot_digest,
    container_template_id:row.container_template_id,
    mechanics_profile_ref:row.mechanics_profile_ref,
    mechanics_profile_digest:row.mechanics_profile_digest,
    container_context_digest:row.container_context_digest,
    ordinary_policy:row.ordinary_policy,
    container_ownership:{owner_npc_id:row.owner_npc_id,
      owner_character_id:row.owner_character_id,owner_party:row.owner_party,
      controller_npc_id:row.controller_npc_id,
      controller_character_id:row.controller_character_id,
      claim_state:row.claim_state},
    aggregate:row.aggregate_payload };
}

async function capacitySnapshot(client, plan) {
  const result = await client.query(`SELECT i.item_id,i.template_id,i.profile_id,
      i.category_id,i.quantity,i.condition_state,i.legal_status,i.state,
      p.anchor_id,p.container_id,p.holder_npc_id,p.holder_character_id,
      p.physical_position,p.equipment_slot_category_id,p.attached_item_id
    FROM party_runtime.party_item_placements p
    JOIN party_runtime.party_items i
      ON i.party_id=p.party_id AND i.item_id=p.item_id
    WHERE p.party_id=$1 AND p.container_id=$2
    ORDER BY i.item_id FOR UPDATE OF i,p`,
  [plan.party_id,plan.scope_ref.entity_id]);
  return result.rows.map((row) => ({ item_id:row.item_id,
    template_id:row.template_id,profile_id:row.profile_id,
    category_id:row.category_id,quantity:Number(row.quantity),
    condition_state:row.condition_state,legal_status:row.legal_status,
    state:row.state,placement:{ anchor_id:row.anchor_id,
      container_id:row.container_id,holder_npc_id:row.holder_npc_id,
      holder_character_id:row.holder_character_id,
      physical_position:row.physical_position,
      equipment_slot_category_id:row.equipment_slot_category_id,
      attached_item_id:row.attached_item_id } }));
}

async function insertCommit(client, plan, current, nextPartyVersion) {
  await client.query(`INSERT INTO party_runtime.party_ordinary_materialization_commits
    (party_id,scope_kind,scope_id,request_identity,input_digest,
     transition_digest,write_plan_digest,resolution,transition_count,
     from_party_state_version,to_party_state_version,
     from_ordinary_state_version,to_ordinary_state_version,item_id,
     plan_schema,item_count,max_new_entities)
    VALUES ($1,'container',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NULL,$13,$14,$15)`,
  [plan.party_id,plan.scope_ref.entity_id,plan.request_identity,
    plan.input_digest,plan.transition_digest,plan.write_plan_digest,
    plan.items.length ? 'materialize' : 'no_change',plan.transitions.length,
    current.party_state_version,nextPartyVersion,current.ordinary_state_version,
    current.ordinary_state_version+plan.transitions.length,plan.schema,
    plan.items.length,plan.technical_limits.max_new_entities]);
}

function policyLimitMatches(policy, limits) {
  return policy?.schema === 'rus.items.existing_container_ordinary_policy.v2'
    && policy.version === 2
    && policy.unresolved_ordinary_contents === true
    && canonicalDigest(policy.technical_limits) === canonicalDigest(limits);
}

async function insertItem(client, plan, item, ordinal, changeSetId, ownership) {
  const evidence = item.item_proposal.property_placement_evidence;
  await client.query(`INSERT INTO party_runtime.party_ordinary_materialization_items
    (party_id,item_id,request_identity,resolution_request_identity,scope_kind,
     scope_id,candidate_key,coverage_key,context_version,functional_bucket,
     admission_class,supporting_basis_ref,causal_basis_refs,property_basis_ref,
     position_ref,container_id,property_placement_context_digest,
     property_catalog_version_ref,placement_catalog_version_ref,
     property_placement_evidence,mechanics_policy_ref,item_proposal,
     mechanics_snapshot)
    VALUES ($1,$2,$3,$4,'container',$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,
      NULL,$5,$14,$15,$16,$17::jsonb,$18,$19::jsonb,$20::jsonb)`,
  [plan.party_id,item.item_id,plan.request_identity,item.request_identity,
    item.container_id,item.candidate_key,item.coverage_key,item.context_version,
    item.functional_bucket,item.admission_class,item.supporting_basis_ref,
    JSON.stringify(item.causal_basis_refs),item.property_basis_ref,
    evidence.property_placement_context_digest,
    evidence.property_catalog_version_ref,evidence.placement_catalog_version_ref,
    JSON.stringify(evidence),item.mechanics_policy_ref,
    JSON.stringify(item.item_proposal),JSON.stringify(item.mechanics_snapshot)]);
  await client.query(`INSERT INTO party_runtime.party_ordinary_materialization_commit_items
    (party_id,request_identity,item_id,ordinal,resolution_request_identity)
    VALUES ($1,$2,$3,$4,$5)`, [plan.party_id,plan.request_identity,
    item.item_id,ordinal,item.request_identity]);
  for (const ref of [...new Set([
    item.supporting_basis_ref,...item.causal_basis_refs])].sort()) {
    await client.query(`INSERT INTO party_runtime.party_ordinary_materialization_item_basis_refs
      (party_id,item_id,scope_kind,scope_id,basis_ref)
      VALUES ($1,$2,'container',$3,$4)`, [plan.party_id,item.item_id,
      item.container_id,ref]);
  }
  const state = ordinaryContainerRuntimeItemState(item, changeSetId);
  await client.query(`INSERT INTO party_runtime.party_items
    (party_id,item_id,run_id,template_id,profile_id,category_id,quantity,
     condition_state,legal_status,state)
    VALUES ($1,$2,NULL,NULL,NULL,NULL,1,$3,'ordinary_container_content',$4::jsonb)`,
  [plan.party_id,item.item_id,item.condition_state,JSON.stringify(state)]);
  await client.query(`INSERT INTO party_runtime.party_item_placements
    (party_id,item_id,anchor_id,container_id,holder_npc_id,
     holder_character_id,physical_position,equipment_slot_category_id,
     attached_item_id)
    VALUES ($1,$2,NULL,$3,NULL,NULL,NULL,NULL,NULL)`,
  [plan.party_id,item.item_id,item.container_id]);
  await client.query(`INSERT INTO party_runtime.party_ownership
    (party_id,ownership_id,item_id,container_id,owner_npc_id,
     owner_character_id,owner_party,controller_npc_id,
     controller_character_id,claim_state)
    VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8,$9)`,
  [plan.party_id,`ownership:${item.item_id}`,item.item_id,
    ownership.owner_npc_id,ownership.owner_character_id,ownership.owner_party,
    ownership.controller_npc_id,ownership.controller_character_id,
    ownership.claim_state]);
}
