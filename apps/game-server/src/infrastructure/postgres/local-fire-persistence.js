import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';
import { createLocalFireAtomicWritePlan } from
  './local-fire-atomic-write-plan.js';
import { localFireAccessible as accessible,
  localFireEntityPin as entityPin, localFireFuelPin as pinFromRow,
  localFireItemQuery as itemQuery } from './local-fire-persistence-pins.js';

export async function applyLocalFireAtomicWritePlanInTransaction({
  client, input, p16ChangeSetId, partyStateVersionAfter
}) {
  const plan = createLocalFireAtomicWritePlan(input);
  if (plan.change_set_id !== p16ChangeSetId
      || partyStateVersionAfter !== plan.base_party_state_version + 1) {
    fail('LOCAL_FIRE_P16_BINDING_INVALID');
  }
  const proposal = plan.transition_proposal;
  const replay = await client.query(
    `SELECT write_plan_digest,p16_change_set_id
     FROM party_runtime.party_local_world_process_commits
     WHERE party_id=$1 AND request_id=$2 FOR UPDATE`,
  [plan.party_id, proposal.causal_identity.request_id]);
  if (replay.rows.length) {
    if (replay.rows.length !== 1
        || replay.rows[0].write_plan_digest !== hex(plan.write_plan_digest)
        || replay.rows[0].p16_change_set_id !== p16ChangeSetId) {
      fail('LOCAL_FIRE_IDEMPOTENCY_CONFLICT');
    }
    return Object.freeze({ replay: true });
  }
  await lockAuthority(client, plan);
  await lockIgnitionBasis(client, plan);
  await lockProcess(client, plan);
  await lockFuel(client, plan);
  if (proposal.action === 'start') await insertProcess(client, plan);
  else await updateProcess(client, plan);
  if (proposal.action === 'start' || proposal.action === 'add_fuel') {
    await appendBindings(client, plan);
  } else {
    await consumeFirstBinding(client, plan);
  }
  await insertCommit(client, plan, partyStateVersionAfter);
  return Object.freeze({ replay: false });
}

export async function loadLocalFireCommittedContext({ client, partyId,
  actorRef = null, contextRef, fuelItemIds, processRef = null,
  requireActorAccess = true }) {
  if (![partyId, contextRef].every(text)
      || (requireActorAccess && !text(actorRef))
      || !Array.isArray(fuelItemIds) || !fuelItemIds.length
      || new Set(fuelItemIds).size !== fuelItemIds.length) {
    fail('LOCAL_FIRE_LOAD_INVALID');
  }
  const party = await client.query(
    `SELECT state_version FROM party_runtime.parties WHERE party_id=$1`,
  [partyId]);
  const authorityResult = await client.query(
    `SELECT party_id,context_ref,profile_ref,profile_version,policy_ref,
       policy_version,scope_ref,ignition_basis_item_id,approved_fuel_item_ids,
       recheck_interval,fuel_unit_mass_grams_min,fuel_unit_mass_grams_max,
       authority_state_version,status,authority_digest
     FROM party_runtime.party_local_fire_authorities
     WHERE party_id=$1 AND context_ref=$2`, [partyId, contextRef]);
  if (party.rows.length !== 1 || authorityResult.rows.length !== 1) {
    fail('LOCAL_FIRE_AUTHORITY_MISSING');
  }
  const authorityRow = authorityResult.rows[0];
  const persistedRow = normalizeAuthorityRow(authorityRow);
  const authorityPin = { persisted_row: persistedRow,
    authority_digest: authorityRow.authority_digest };
  if (authorityPin.authority_digest !== digest(persistedRow)) {
    fail('LOCAL_FIRE_AUTHORITY_STALE');
  }
  let processState = null;
  if (processRef !== null) {
    const result = await client.query(
      `SELECT process_state FROM party_runtime.party_local_world_processes
       WHERE party_id=$1 AND process_ref=$2`, [partyId, processRef]);
    if (result.rows.length !== 1) fail('LOCAL_FIRE_PROCESS_STALE');
    processState = result.rows[0].process_state;
  }
  const pins = [];
  for (const itemId of fuelItemIds) {
    const selected = await client.query(itemQuery(false), [partyId, itemId]);
    if (selected.rows.length !== 1) fail('LOCAL_FIRE_FUEL_STALE');
    const pin = pinFromRow(selected.rows[0]);
    if (requireActorAccess && !accessible(pin, actorRef, persistedRow.scope_ref)) {
      fail('LOCAL_FIRE_FUEL_ACCESS_DENIED');
    }
    pins.push(pin);
  }
  const ignitionSelected = await client.query(itemQuery(false), [partyId,
    persistedRow.ignition_basis_item_id]);
  if (ignitionSelected.rows.length !== 1) fail('LOCAL_FIRE_IGNITION_BASIS_STALE');
  const ignitionPin = entityPin(ignitionSelected.rows[0]);
  if (ignitionPin.item.state?.local_fire_ignition_basis?.schema
      !== 'rus.items.local_fire_ignition_basis.v1'
      || ignitionPin.item.state?.lifecycle_status !== 'active'
      || requireActorAccess && !accessible(ignitionPin, actorRef,
        persistedRow.scope_ref)) fail('LOCAL_FIRE_IGNITION_BASIS_STALE');
  return deepFreeze({ schema: 'local_fire_committed_context_load_v1',
    party_id: partyId, party_state_version: Number(party.rows[0].state_version),
    actor_ref: actorRef, authority_pin: authorityPin,
    process_state: processState, ignition_basis_pin: ignitionPin,
    fuel_pins: pins });
}

async function lockIgnitionBasis(client, plan) {
  const selected = await client.query(itemQuery(true), [plan.party_id,
    plan.ignition_basis_pin.item_id]);
  if (selected.rows.length !== 1) fail('LOCAL_FIRE_IGNITION_BASIS_STALE');
  const current = entityPin(selected.rows[0]);
  if (current.item_digest !== plan.ignition_basis_pin.item_digest
      || current.placement_digest !== plan.ignition_basis_pin.placement_digest
      || current.ownership_digest !== plan.ignition_basis_pin.ownership_digest
      || current.item.state?.local_fire_ignition_basis?.schema
        !== 'rus.items.local_fire_ignition_basis.v1'
      || current.item.state?.lifecycle_status !== 'active') {
    fail('LOCAL_FIRE_IGNITION_BASIS_STALE');
  }
}

async function lockAuthority(client, plan) {
  const result = await client.query(
    `SELECT party_id,context_ref,profile_ref,profile_version,policy_ref,
       policy_version,scope_ref,ignition_basis_item_id,approved_fuel_item_ids,
       recheck_interval,fuel_unit_mass_grams_min,fuel_unit_mass_grams_max,
       authority_state_version,status,authority_digest
     FROM party_runtime.party_local_fire_authorities
     WHERE party_id=$1 AND context_ref=$2 FOR UPDATE`,
  [plan.party_id, plan.authority_pin.persisted_row.context_ref]);
  const row = result.rows[0];
  if (result.rows.length !== 1
      || row.authority_digest !== plan.authority_pin.authority_digest
      || digest(normalizeAuthorityRow(row))
        !== digest(plan.authority_pin.persisted_row)) {
    fail('LOCAL_FIRE_AUTHORITY_STALE');
  }
}

function normalizeAuthorityRow(row) {
  return { party_id: row.party_id, context_ref: row.context_ref,
    profile_ref: row.profile_ref, profile_version: row.profile_version,
    policy_ref: row.policy_ref, policy_version: Number(row.policy_version),
    scope_ref: row.scope_ref,
    ignition_basis_item_id: row.ignition_basis_item_id,
    approved_fuel_item_ids: row.approved_fuel_item_ids,
    recheck_interval: row.recheck_interval,
    fuel_unit_mass_grams_min: Number(row.fuel_unit_mass_grams_min),
    fuel_unit_mass_grams_max: Number(row.fuel_unit_mass_grams_max),
    authority_state_version: Number(row.authority_state_version),
    status: row.status };
}

async function lockProcess(client, plan) {
  const before = plan.transition_proposal.process_before;
  const ref = plan.transition_proposal.process_after.process_ref;
  const result = await client.query(
    `SELECT process_state FROM party_runtime.party_local_world_processes
     WHERE party_id=$1 AND process_ref=$2 FOR UPDATE`, [plan.party_id, ref]);
  if (before === null ? result.rows.length !== 0
    : result.rows.length !== 1 || digest(result.rows[0]?.process_state) !== digest(before)) {
    fail(before === null ? 'LOCAL_FIRE_PROCESS_COLLISION' : 'LOCAL_FIRE_PROCESS_STALE');
  }
}

async function lockFuel(client, plan) {
  for (const pin of plan.fuel_pins) {
    const selected = await client.query(itemQuery(true), [plan.party_id, pin.item_id]);
    if (selected.rows.length !== 1) fail('LOCAL_FIRE_FUEL_STALE');
    const current = pinFromRow(selected.rows[0]);
    if (current.item_digest !== pin.item_digest
        || current.placement_digest !== pin.placement_digest
        || current.ownership_digest !== pin.ownership_digest
        || digest(current.fuel_snapshot) !== digest(pin.fuel_snapshot)) {
      fail('LOCAL_FIRE_FUEL_STALE');
    }
    const binding = await client.query(
      `SELECT process_ref FROM party_runtime.party_local_world_process_fuel_bindings
       WHERE party_id=$1 AND fuel_item_id=$2
         AND released_at_change_set_id IS NULL FOR UPDATE`,
    [plan.party_id, pin.item_id]);
    const expected = pin.fuel_snapshot.bound_process_ref;
    if (expected === null ? binding.rows.length !== 0
      : binding.rows.length !== 1 || binding.rows[0].process_ref !== expected) {
      fail('LOCAL_FIRE_FUEL_STALE');
    }
  }
}

async function insertProcess(client, plan) {
  const state = plan.transition_proposal.process_after;
  await client.query(
    `INSERT INTO party_runtime.party_local_world_processes
      (party_id,process_ref,context_ref,process_mode,process_kind,scope_ref,
       causal_basis_ref,status,started_at,next_boundary_at,process_state,
       state_version,last_change_set_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13)`,
  [plan.party_id, state.process_ref,
    plan.authority_pin.persisted_row.context_ref, state.process_mode,
    state.process_kind, state.scope_ref, state.causal_basis_ref, state.status,
    JSON.stringify(state.started_at), JSON.stringify(state.next_boundary_at),
    JSON.stringify(state), state.state_version, plan.change_set_id]);
}

async function updateProcess(client, plan) {
  const before = plan.transition_proposal.process_before;
  const after = plan.transition_proposal.process_after;
  const result = await client.query(
    `UPDATE party_runtime.party_local_world_processes
     SET status=$1,next_boundary_at=$2::jsonb,process_state=$3::jsonb,
       state_version=$4,last_change_set_id=$5
     WHERE party_id=$6 AND process_ref=$7 AND state_version=$8`,
  [after.status, after.next_boundary_at == null ? null
    : JSON.stringify(after.next_boundary_at), JSON.stringify(after),
    after.state_version, plan.change_set_id, plan.party_id, after.process_ref,
    before.state_version]);
  if (result.rowCount !== 1) fail('LOCAL_FIRE_PROCESS_STALE');
}

async function appendBindings(client, plan) {
  const after = plan.transition_proposal.process_after;
  const prior = await client.query(
    `SELECT COALESCE(MAX(binding_ordinal),-1)::int AS last_ordinal
     FROM party_runtime.party_local_world_process_fuel_bindings
     WHERE party_id=$1 AND process_ref=$2`,
  [plan.party_id, after.process_ref]);
  let ordinal = Number(prior.rows[0]?.last_ordinal) + 1;
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    fail('LOCAL_FIRE_FUEL_BOUND');
  }
  for (const ref of plan.transition_proposal.added_fuel_refs) {
    try { await client.query(
      `INSERT INTO party_runtime.party_local_world_process_fuel_bindings
        (party_id,process_ref,fuel_item_id,binding_ordinal,bound_at_change_set_id)
       VALUES ($1,$2,$3,$4,$5)`,
    [plan.party_id, after.process_ref, ref, ordinal, plan.change_set_id]); }
    catch (cause) { if (cause?.code === '23505') fail('LOCAL_FIRE_FUEL_BOUND'); throw cause; }
    ordinal += 1;
  }
}

async function consumeFirstBinding(client, plan) {
  const ref = plan.transition_proposal.retired_fuel_ref;
  const released = await client.query(
    `UPDATE party_runtime.party_local_world_process_fuel_bindings
     SET released_at_change_set_id=$1
     WHERE party_id=$2 AND process_ref=$3 AND fuel_item_id=$4
       AND released_at_change_set_id IS NULL`,
  [plan.change_set_id, plan.party_id,
    plan.transition_proposal.process_after.process_ref, ref]);
  if (released.rowCount !== 1) fail('LOCAL_FIRE_FUEL_STALE');
  const pin = plan.fuel_pins.find(({ item_id }) => item_id === ref);
  const state = { ...pin.item.state, lifecycle_status: 'retired',
    local_fire_retirement: { schema: 'rus.items.local_fire_retirement.v1',
      process_ref: plan.transition_proposal.process_after.process_ref,
      request_id: plan.transition_proposal.causal_identity.request_id,
      change_set_id: plan.change_set_id } };
  const changed = await client.query(
    `UPDATE party_runtime.party_items SET state=$1::jsonb,state_version=$2
     WHERE party_id=$3 AND item_id=$4 AND state_version=$5`,
  [JSON.stringify(state), pin.item.state_version + 1,
    plan.party_id, ref, pin.item.state_version]);
  if (changed.rowCount !== 1) fail('LOCAL_FIRE_FUEL_STALE');
}

async function insertCommit(client, plan, nextPartyVersion) {
  const proposal = plan.transition_proposal;
  await client.query(
    `INSERT INTO party_runtime.party_local_world_process_commits
      (party_id,request_id,process_ref,action,root_turn_id,action_ref,step_index,
       from_process_state_version,to_process_state_version,sealed_proposal,
       fuel_pin_evidence,write_plan_digest,from_party_state_version,
       to_party_state_version,p16_change_set_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15)`,
  [plan.party_id, proposal.causal_identity.request_id,
    proposal.process_after.process_ref, proposal.action,
    proposal.causal_identity.root_turn_id, proposal.causal_identity.action_ref,
    proposal.causal_identity.step_index,
    proposal.process_before?.state_version ?? null,
    proposal.process_after.state_version, JSON.stringify(proposal),
    JSON.stringify({ ignition_basis_pin: plan.ignition_basis_pin,
      fuel_pins: plan.fuel_pins }), hex(plan.write_plan_digest),
    plan.base_party_state_version, nextPartyVersion, plan.change_set_id]);
}

function hex(value) { return value.replace(/^sha256:/u, ''); }
function text(value) { return typeof value === 'string' && value.length > 0; }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); } return value; }
function fail(code) { const error = new Error(code); error.code = code; throw error; }
