import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Pool } from 'pg';
import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';
import { admitActionProducedResult } from
  '@rus/items-property/action-produced-result';
import { createActionProducedTransitionPlanner,
  resolveActionProducedAllocationMechanics } from
  '@rus/items-property/action-produced-transition';
import { loadActionProducedCommittedContext } from
  '../../apps/game-server/src/infrastructure/postgres/action-produced-committed-context-loader.js';
import { actionProducedPhysicalKeys,
  createActionProducedAtomicWritePlan } from
  '../../apps/game-server/src/infrastructure/postgres/action-produced-atomic-write-plan.js';
import { buildCombinedWritePlan } from
  '../../packages/turn/src/spatial-v3-write-plan.js';
import { createSpatialV3CombinedAtomicCommitter } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { SPATIAL_V3_TARGET_MIGRATIONS } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import { loadLowerDvinaTraceA1Profile } from
  '../../apps/game-server/src/internal/lower-dvina-trace-a1-profile.js';
import { createLowerDvinaTraceA1ProductionResolverFactory } from
  '../../apps/game-server/src/runtime/releases/lower-dvina-trace-a1-production.js';
import { batchInput } from
  '../../apps/game-server/test/ordinary-materialization-container-batch-plan.test.js';
import { createOrdinaryAggregate } from '@rus/materialization';
import { ordinaryPhysicalKeys } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-ordinary-p16.js';

const docker = (args) => spawnSync('docker', args,
  { encoding: 'utf8', timeout: 60_000 });
const container = `action-produced-${process.pid}`;
const hex = 'c'.repeat(64);

test('A1 uses the common P16 transaction for identity, conservation and replay',
  async (t) => {
    if (docker(['version']).status !== 0) return t.skip('Docker required');
    let pool;
    t.after(async () => {
      if (pool) await pool.end();
      docker(['rm', '-f', container]);
    });
    const started = docker(['run', '-d', '--name', container,
      '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=action',
      '-e', 'POSTGRES_USER=action', '-e', 'POSTGRES_DB=action',
      'postgres:16-alpine']);
    assert.equal(started.status, 0, started.stderr);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await new Promise((done) => setTimeout(done, 250));
      if (docker(['exec', container, 'pg_isready', '-U', 'action', '-d',
        'action']).status === 0) break;
      if (attempt === 49) assert.fail('PostgreSQL not ready');
    }
    await new Promise((done) => setTimeout(done, 500));
    const port = Number(docker(['port', container, '5432/tcp']).stdout
      .match(/:(\d+)\s*$/u)?.[1]);
    pool = new Pool({ host: '127.0.0.1', port, user: 'action',
      password: 'action', database: 'action', max: 4 });
    for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) await pool.query(sql);
    await pool.query(await readFile(
      'schemas/party-db/027_party_runtime_action_production.sql', 'utf8'));
    await provision(pool);
    const committer = combinedCommitter(pool);

    const preserve = await actionPlan(pool, {
      partyVersion: 1, changeSetId: 'change-preserve', requestId: 'preserve',
      actionRef: 'action-preserve', sources: ['pole'], tools: ['knife'],
      mode: 'preserve_source'
    });
    const alternatePreserve = await actionPlan(pool, {
      partyVersion: 1, changeSetId: 'change-preserve',
      requestId: 'preserve', actionRef: 'action-alternate',
      sources: ['stale-source'], tools: ['stale-tool'],
      mode: 'preserve_source'
    });
    const preserveCombined = await combinedPlan(preserve, 'preserve', 1);
    const firstCommit = await committer.commit({ plan: preserveCombined });
    assert.equal(firstCommit.ok, true, JSON.stringify(firstCommit));
    assert.equal(firstCommit.replay, false);
    assert.equal(firstCommit.change_set_id, 'change-preserve');
    assert.equal(Array.isArray(firstCommit.lock_keys), true);
    assert.deepEqual(await committer.commit({ plan: preserveCombined }), {
      ok: true, replay: true, change_set_id: 'change-preserve'
    });
    const outerCollision = await committer.commit({
      plan: await combinedPlan(alternatePreserve, 'preserve', 1)
    });
    assert.equal(outerCollision.ok, false);
    assert.equal(outerCollision.error.code, 'state_version_conflict');
    let row = (await pool.query(`SELECT state,state_version FROM
      party_runtime.party_items WHERE party_id='party-a1' AND item_id='pole'`))
      .rows[0];
    assert.equal(row.state_version, '2');
    assert.equal(row.state.action_production.result_class,
      'ordinary_physical_result');
    assert.equal(row.state.action_production.output_class,
      'ordinary_mundane');
    assert.deepEqual(row.state.runtime_instance_mechanics_snapshot,
      preserve.transition_proposal.results[0].mechanics_snapshot);
    assert.deepEqual(row.state.action_production.physical_facts,
      preserve.transition_proposal.results[0].physical_facts);

    const partition = await actionPlan(pool, {
      partyVersion: 2, changeSetId: 'change-partition', requestId: 'partition',
      actionRef: 'action-partition', sources: ['board'], tools: ['axe'],
      mode: 'independent_outputs'
    });
    const outputPlacement = { anchor_id: 'output-anchor', container_id: null,
      holder_npc_id: null, holder_character_id: null,
      physical_position: null, equipment_slot_category_id: null,
      attached_item_id: null };
    assert.equal(partition.transition_proposal.results.every((result) =>
      result.holder_ref === null
        && result.controller_ref === 'pc'
        && result.placement_state_ref === digest(outputPlacement)), true);
    assert.equal(partition.result_items.every((result) =>
      digest(result.placement_row) === digest(outputPlacement)), true);
    const mismatchedPlacement = structuredClone(partition);
    mismatchedPlacement.transition_proposal.results[0]
      .placement_state_ref = partition.source_pins[0].placement_digest;
    mismatchedPlacement.write_plan_digest = digest(Object.fromEntries(
      Object.entries(mismatchedPlacement)
        .filter(([key]) => key !== 'write_plan_digest')));
    assert.throws(() => createActionProducedAtomicWritePlan(
      mismatchedPlacement), { code: 'ACTION_PRODUCED_DESTINATION_INVALID' });
    const partitionCombined = await combinedPlan(partition, 'partition', 2);
    await pool.query(`UPDATE party_runtime.party_g5_anchors
      SET item_capacity=1 WHERE party_id='party-a1'
        AND anchor_id='output-anchor'`);
    const destinationStale = await committer.commit({ plan: partitionCombined });
    assert.equal(destinationStale.ok, false);
    assert.equal(destinationStale.error.code, 'state_version_conflict');
    const rejectedDestinationRows = (await pool.query(`SELECT
      (SELECT count(*)::int FROM party_runtime.party_items
       WHERE party_id='party-a1' AND item_id LIKE 'a1_result_%') AS outputs,
      (SELECT count(*)::int FROM party_runtime.party_item_placements
       WHERE party_id='party-a1' AND item_id LIKE 'a1_result_%') AS placements,
      (SELECT quantity_numerator::int FROM party_runtime.party_resource_nodes
       WHERE party_id='party-a1' AND resource_node_id='resource-board') AS left,
      (SELECT state_version::int FROM party_runtime.parties
       WHERE party_id='party-a1') AS party_version`)).rows[0];
    assert.deepEqual(rejectedDestinationRows, { outputs: 0, placements: 0,
      left: 3, party_version: 2 });
    await pool.query(`UPDATE party_runtime.party_g5_anchors
      SET item_capacity=8 WHERE party_id='party-a1'
        AND anchor_id='output-anchor'`);
    assert.equal((await committer.commit({ plan: partitionCombined })).ok,
      true);
    assert.deepEqual(await committer.commit({ plan: partitionCombined }), {
      ok: true, replay: true, change_set_id: 'change-partition'
    });
    const partitionRows = await pool.query(`SELECT
      (SELECT count(*)::int FROM party_runtime.party_items
       WHERE party_id='party-a1' AND item_id LIKE 'a1_result_%') AS outputs,
      (SELECT count(*)::int FROM party_runtime.party_item_placements
       WHERE party_id='party-a1' AND anchor_id='output-anchor'
         AND item_id LIKE 'a1_result_%') AS grounded_outputs,
      (SELECT quantity_numerator::int FROM party_runtime.party_resource_nodes
       WHERE party_id='party-a1' AND resource_node_id='resource-board') AS left,
      (SELECT state FROM party_runtime.party_items
       WHERE party_id='party-a1' AND item_id='board') AS source_state,
      (SELECT state_version::int FROM party_runtime.parties
       WHERE party_id='party-a1') AS party_version`);
    assert.equal(partitionRows.rows[0].outputs, 2);
    assert.equal(partitionRows.rows[0].grounded_outputs, 2);
    assert.equal(partitionRows.rows[0].left, 2);
    assert.equal(partitionRows.rows[0].party_version, 3);
    assert.equal(partitionRows.rows[0].source_state.lifecycle_status, 'active');
    assert.equal(partitionRows.rows[0].source_state.property_state.source_ref,
      'board');
    assert.equal(partitionRows.rows[0].source_state.action_production,
      undefined);
    const persistedOutputPlacements = (await pool.query(`SELECT anchor_id,
      container_id,holder_npc_id,holder_character_id,physical_position,
      equipment_slot_category_id,attached_item_id
      FROM party_runtime.party_item_placements
      WHERE party_id='party-a1' AND item_id LIKE 'a1_result_%'
      ORDER BY item_id`)).rows;
    assert.deepEqual(persistedOutputPlacements, [outputPlacement,
      outputPlacement]);
    const persistedOutputProperties = (await pool.query(`SELECT i.item_id,
      i.legal_status,i.state,o.ownership_id,o.owner_npc_id,
      o.owner_character_id,o.owner_party,o.controller_npc_id,
      o.controller_character_id,o.claim_state
      FROM party_runtime.party_items i
      JOIN party_runtime.party_ownership o
        ON o.party_id=i.party_id AND o.item_id=i.item_id
      WHERE i.party_id='party-a1' AND i.item_id LIKE 'a1_result_%'
      ORDER BY i.item_id`)).rows;
    for (const row of persistedOutputProperties) {
      const sealed = partition.transition_proposal.results.find(
        ({ entity_ref: entityRef }) => entityRef === row.item_id);
      const ownership = { ownership_id: row.ownership_id,
        owner_npc_id: row.owner_npc_id,
        owner_character_id: row.owner_character_id,
        owner_party: row.owner_party,
        controller_npc_id: row.controller_npc_id,
        controller_character_id: row.controller_character_id,
        claim_state: row.claim_state };
      assert.equal(row.legal_status,
        'action_produced_non_authoritative');
      assert.equal(sealed.property_state_ref, digest({
        property_state: row.state.property_state ?? null, ownership
      }));
      assert.equal(row.state.action_production.output_class,
        'ordinary_mundane');
    }

    const noResult = await actionPlan(pool, {
      partyVersion: 3, changeSetId: 'change-none', requestId: 'none',
      actionRef: 'action-none', sources: ['scrap'], tools: ['hammer'],
      mode: 'no_useful_result'
    });
    assert.equal((await committer.commit({
      plan: await combinedPlan(noResult, 'none', 3)
    })).ok, true);
    row = (await pool.query(`SELECT operation_kind,status,result_change_set_id
      FROM party_runtime.party_command_idempotency
      WHERE party_id='party-a1' AND result_change_set_id='change-none'`))
      .rows[0];
    assert.deepEqual(row, { operation_kind: 'action_production',
      status: 'committed', result_change_set_id: 'change-none' });

    const rollback = await actionPlan(pool, {
      partyVersion: 4, changeSetId: 'change-rollback', requestId: 'rollback',
      actionRef: 'action-rollback', sources: ['rollback-source'],
      tools: ['rollback-tool'], mode: 'independent_outputs'
    });
    const rollbackOutputIds = rollback.result_items.map(
      ({ item_id: itemId }) => itemId);
    assert.equal(rollbackOutputIds.length, 2);
    const failed = await committer.commit({
      plan: await combinedPlan(rollback, 'rollback', 4, { missingClock: true })
    });
    assert.equal(failed.ok, false);
    assert.deepEqual((await pool.query(`SELECT
      (SELECT count(*)::int FROM party_runtime.party_items
       WHERE party_id='party-a1' AND item_id=ANY($1::text[])) AS outputs,
      (SELECT count(*)::int FROM party_runtime.party_item_placements
       WHERE party_id='party-a1' AND item_id=ANY($1::text[])) AS placements,
      (SELECT count(*)::int FROM party_runtime.party_ownership
       WHERE party_id='party-a1' AND item_id=ANY($1::text[])) AS ownership,
      (SELECT quantity_numerator::int FROM
       party_runtime.party_resource_nodes
       WHERE resource_node_id='resource-rollback-source') AS source_left,
      (SELECT state_version::int FROM party_runtime.parties
       WHERE party_id='party-a1') AS party_version`,
    [rollbackOutputIds])).rows[0], { outputs: 0, placements: 0,
      ownership: 0, source_left: 3, party_version: 4 });

    await pool.query(`UPDATE party_runtime.party_g5_anchors
      SET item_capacity=3 WHERE party_id='party-a1'
        AND anchor_id='output-anchor'`);
    await assert.rejects(actionPlan(pool, {
      partyVersion: 4, changeSetId: 'change-capacity', requestId: 'capacity',
      actionRef: 'action-capacity', sources: ['collision-source'],
      tools: ['collision-tool'], mode: 'independent_outputs'
    }), { code: 'ACTION_PRODUCED_DESTINATION_CAPACITY' });
    await pool.query(`UPDATE party_runtime.party_g5_anchors
      SET item_capacity=8 WHERE party_id='party-a1'
        AND anchor_id='output-anchor'`);

    await assert.rejects(actionPlan(pool, {
      partyVersion: 4, changeSetId: 'change-insufficient',
      requestId: 'insufficient', actionRef: 'action-insufficient',
      sources: ['resource-stale-source'], tools: ['resource-stale-tool'],
      mode: 'no_useful_result', decrement: 4
    }), { code: 'FINITE_RESOURCE_TRANSITION_INVALID' });

    const resourceStale = await actionPlan(pool, {
      partyVersion: 4, changeSetId: 'change-resource-stale',
      requestId: 'resource-stale', actionRef: 'action-resource-stale',
      sources: ['resource-stale-source'], tools: ['resource-stale-tool'],
      mode: 'no_useful_result'
    });
    await pool.query(`UPDATE party_runtime.party_resource_nodes
      SET state_version=state_version+1 WHERE party_id='party-a1'
        AND resource_node_id='resource-resource-stale-source'`);
    const resourceStaleResult = await committer.commit({
      plan: await combinedPlan(resourceStale, 'resource-stale', 4)
    });
    assert.equal(resourceStaleResult.ok, false);
    assert.equal(resourceStaleResult.error.code, 'state_version_conflict');

    const stale = await actionPlan(pool, {
      partyVersion: 4, changeSetId: 'change-stale', requestId: 'stale',
      actionRef: 'action-stale', sources: ['stale-source'],
      tools: ['stale-tool'], mode: 'preserve_source'
    });
    await pool.query(`UPDATE party_runtime.party_items
      SET legal_status='changed' WHERE party_id='party-a1'
        AND item_id='stale-source'`);
    const staleResult = await committer.commit({
      plan: await combinedPlan(stale, 'stale', 4)
    });
    assert.equal(staleResult.ok, false);
    assert.equal(staleResult.error.code, 'state_version_conflict');

    const toolStale = await actionPlan(pool, {
      partyVersion: 4, changeSetId: 'change-tool-stale',
      requestId: 'tool-stale', actionRef: 'action-tool-stale',
      sources: ['tool-stale-source'], tools: ['tool-stale-tool'],
      mode: 'preserve_source'
    });
    await pool.query(`UPDATE party_runtime.party_items
      SET legal_status='changed' WHERE party_id='party-a1'
        AND item_id='tool-stale-tool'`);
    const toolStaleResult = await committer.commit({
      plan: await combinedPlan(toolStale, 'tool-stale', 4)
    });
    assert.equal(toolStaleResult.ok, false);
    assert.equal(toolStaleResult.error.code, 'state_version_conflict');

    const ownershipStale = await actionPlan(pool, {
      partyVersion: 4, changeSetId: 'change-ownership-stale',
      requestId: 'ownership-stale', actionRef: 'action-ownership-stale',
      sources: ['ownership-stale-source'],
      tools: ['ownership-stale-tool'], mode: 'preserve_source'
    });
    await pool.query(`UPDATE party_runtime.party_ownership
      SET owner_character_id=NULL,owner_party=true,claim_state='entrusted'
      WHERE party_id='party-a1' AND item_id='ownership-stale-source'`);
    const ownershipStaleResult = await committer.commit({
      plan: await combinedPlan(ownershipStale, 'ownership-stale', 4)
    });
    assert.equal(ownershipStaleResult.ok, false);
    assert.equal(ownershipStaleResult.error.code, 'state_version_conflict');
    assert.deepEqual((await pool.query(`SELECT
      (SELECT state_version::int FROM party_runtime.parties
       WHERE party_id='party-a1') AS party_version,
      (SELECT state_version::int FROM party_runtime.party_items
       WHERE party_id='party-a1'
         AND item_id='ownership-stale-source') AS source_version`)).rows[0],
    { party_version: 4, source_version: 1 });

    const outputCollision = await actionPlan(pool, {
      partyVersion: 4, changeSetId: 'change-output-collision',
      requestId: 'output-collision', actionRef: 'action-output-collision',
      sources: ['collision-source'], tools: ['collision-tool'],
      mode: 'independent_outputs'
    });
    const collisionId = outputCollision.result_items[0].item_id;
    await pool.query(`INSERT INTO party_runtime.party_items
      (party_id,item_id,run_id,template_id,profile_id,category_id,quantity,
       condition_state,legal_status,state,state_version)
      VALUES ('party-a1',$1,'run-a1','collision-template','profile',
        'ordinary',1,'serviceable','owned','{}'::jsonb,1)`, [collisionId]);
    const outputCollisionResult = await committer.commit({
      plan: await combinedPlan(outputCollision, 'output-collision', 4)
    });
    assert.equal(outputCollisionResult.ok, false);
    assert.equal(outputCollisionResult.error.code, 'idempotency_conflict');

    await pool.query(`UPDATE party_runtime.party_items
      SET state=jsonb_set(state,'{property_state}',
        (SELECT state->'property_state' FROM party_runtime.party_items
         WHERE party_id='party-a1' AND item_id='board'))
      WHERE party_id='party-a1' AND item_id='scrap'`);
    await pool.query(`UPDATE party_runtime.party_resource_nodes
      SET property_basis_ref=(SELECT property_basis_ref
        FROM party_runtime.party_resource_nodes
        WHERE party_id='party-a1' AND resource_node_id='resource-board')
      WHERE party_id='party-a1' AND resource_node_id='resource-scrap'`);
    await pool.query(`UPDATE party_runtime.party_ownership
      SET owner_character_id=NULL,owner_party=true
      WHERE party_id='party-a1' AND item_id='scrap'`);
    await assert.rejects(actionPlan(pool, {
      partyVersion: 4, changeSetId: 'change-mixed-denied',
      requestId: 'mixed-denied', actionRef: 'action-mixed-denied',
      sources: ['board', 'scrap'], tools: ['axe'],
      mode: 'independent_outputs', outputCount: 1, decrement: 1,
      propertySource: 'board', allocationSources: ['board', 'scrap']
    }), { code: 'ITEM_ACTION_PRODUCED_TRANSITION_INVALID' });
    assert.deepEqual((await pool.query(`SELECT
      (SELECT state_version::int FROM party_runtime.parties
       WHERE party_id='party-a1') AS party_version,
      (SELECT quantity_numerator::int FROM party_runtime.party_resource_nodes
       WHERE party_id='party-a1' AND resource_node_id='resource-board') AS board,
      (SELECT quantity_numerator::int FROM party_runtime.party_resource_nodes
       WHERE party_id='party-a1' AND resource_node_id='resource-scrap') AS scrap`))
      .rows[0], { party_version: 4, board: 2, scrap: 3 });

    await pool.query(`UPDATE party_runtime.party_ownership
      SET owner_character_id='pc',owner_party=false
      WHERE party_id='party-a1' AND item_id='scrap'`);
    await pool.query(`UPDATE party_runtime.party_items
      SET state=jsonb_set(state,'{property_state}',
        '{"source_ref":"scrap","resource_property_basis_ref":"property:scrap"}'::jsonb)
      WHERE party_id='party-a1' AND item_id='scrap'`);
    await pool.query(`UPDATE party_runtime.party_resource_nodes
      SET property_basis_ref='property:scrap'
      WHERE party_id='party-a1' AND resource_node_id='resource-scrap'`);
    const compatibleMixed = await actionPlan(pool, {
      partyVersion: 4, changeSetId: 'change-mixed-compatible',
      requestId: 'mixed-compatible', actionRef: 'action-mixed-compatible',
      sources: ['board', 'scrap'], tools: ['axe'],
      mode: 'independent_outputs', outputCount: 1, decrement: 1,
      propertySource: 'board', allocationSources: ['board', 'scrap']
    });
    assert.equal((await committer.commit({ plan: await combinedPlan(
      compatibleMixed, 'mixed-compatible', 4,
      { followUpMove: true }) })).ok, true);
    assert.deepEqual((await pool.query(`SELECT anchor_id,
      holder_character_id,physical_position
      FROM party_runtime.party_item_placements
      WHERE party_id='party-a1' AND item_id=$1`,
    [compatibleMixed.result_items[0].item_id])).rows[0], {
      anchor_id: null, holder_character_id: 'pc', physical_position: 'hands'
    });
    assert.deepEqual((await pool.query(`SELECT
      (SELECT state_version::int FROM party_runtime.parties
       WHERE party_id='party-a1') AS party_version,
      (SELECT quantity_numerator::int FROM party_runtime.party_resource_nodes
       WHERE party_id='party-a1' AND resource_node_id='resource-board') AS board,
      (SELECT quantity_numerator::int FROM party_runtime.party_resource_nodes
       WHERE party_id='party-a1' AND resource_node_id='resource-scrap') AS scrap`))
      .rows[0], { party_version: 5, board: 1, scrap: 2 });

    await provisionProductionScope(pool);
    const loadedProfile = await loadLowerDvinaTraceA1Profile();
    const factory = createLowerDvinaTraceA1ProductionResolverFactory({
      pool, loadedProfile
    });
    const productionOwner = (requestId) => factory({
      partyId: 'party-a1', requestId,
      applyWorkingProjection: ({ working_projection: projection }) =>
        structuredClone(projection)
    });
    const appliedA1 = [];
    const resolveProduction = factory({ partyId: 'party-a1',
      requestId: 'production-request',
      applyWorkingProjection: ({ working_projection: projection,
        action_production_atomic_write_plan: plan }) => {
        appliedA1.push(plan.causal_identity.request_id);
        return { ...structuredClone(projection), prepared_a1: true };
      } });

    const productionState = (await pool.query(`SELECT state
      FROM party_runtime.party_items
      WHERE party_id='party-a1' AND item_id='production-garment'`))
      .rows[0].state;
    const driftedStates = [
      (() => { const state = structuredClone(productionState);
        delete state.inventory_profile_snapshot; return state; })(),
      (() => { const state = structuredClone(productionState);
        state.inventory_profile_snapshot.mass_grams = -1; return state; })(),
      (() => { const state = structuredClone(productionState);
        state.inventory_profile_snapshot.container = {
          capacity: 1 }; return state; })()
    ];
    for (const state of driftedStates) {
      await pool.query(`UPDATE party_runtime.party_items SET state=$1::jsonb
        WHERE party_id='party-a1' AND item_id='production-garment'`,
      [JSON.stringify(state)]);
      await assert.rejects(resolveProduction(productionEnvelope()), {
        code: 'TRACE_A1_ITEM_MECHANICS_INVALID'
      });
    }
    await pool.query(`UPDATE party_runtime.party_items SET state=$1::jsonb
      WHERE party_id='party-a1' AND item_id='production-garment'`,
    [JSON.stringify(productionState)]);

    await pool.query(`UPDATE party_runtime.party_ownership
      SET owner_character_id=NULL,owner_party=true,claim_state='entrusted'
      WHERE party_id='party-a1' AND item_id='production-knife'`);
    const borrowedTool = await resolveProduction(productionEnvelope());
    assert.equal(borrowedTool.action_production_atomic_write_plan
      .tool_pins.length, 1);
    assert.equal(borrowedTool.working_projection.prepared_a1, true);
    assert.equal('player_response_boundary' in borrowedTool, false);
    assert.deepEqual(appliedA1, ['production-request']);
    await pool.query(`UPDATE party_runtime.party_ownership
      SET controller_character_id=NULL
      WHERE party_id='party-a1' AND item_id='production-knife'`);
    await assert.rejects(resolveProduction(productionEnvelope()), {
      code: 'ACTION_PRODUCED_ITEM_ACCESS_DENIED'
    });
    await pool.query(`UPDATE party_runtime.party_ownership
      SET controller_character_id='pc'
      WHERE party_id='party-a1' AND item_id='production-knife'`);

    await pool.query(`UPDATE party_runtime.party_ownership
      SET owner_character_id='other-pc',controller_character_id='other-pc'
      WHERE party_id='party-a1' AND item_id='production-garment'`);
    const foreignSource = await resolveProduction(productionEnvelope());
    assert.equal(foreignSource.action_production_atomic_write_plan
      .source_pins[0].ownership.owner_character_id, 'other-pc');
    await pool.query(`UPDATE party_runtime.party_ownership
      SET owner_character_id='pc',controller_character_id='pc'
      WHERE party_id='party-a1' AND item_id='production-garment'`);

    const wrongCheck = productionEnvelope();
    wrongCheck.check_result = null;
    await assert.rejects(resolveProduction(wrongCheck), {
      code: 'TRACE_A1_SCOPE_INVALID'
    });
    const wrongActivity = productionEnvelope();
    wrongActivity.plan.activity.owner = 'domain';
    await assert.rejects(resolveProduction(wrongActivity), {
      code: 'TRACE_A1_SCOPE_INVALID'
    });
    const unchecked = await productionOwner('production-unchecked')(
      productionEnvelope({
      checked: false }));
    assert.equal(unchecked.action_production_atomic_write_plan
      .transition_proposal.causal_identity.request_id,
    'production-unchecked');

    const impossibleEnvelope = productionEnvelope({ targetRefs: [],
      remainingIntent: 'Собираю невозможный работающий механизм.',
      actionProduction: actionProduction({
        result_class: 'nonworking_construction',
        result_descriptor: descriptor({
          display_name: 'неработающая конструкция',
          physical_description: 'детали соединены, но механизм не работает',
          qualitative_facts: ['конструкция физически собрана']
        })
      }) });
    const impossible = await productionOwner('production-impossible')(
      impossibleEnvelope);
    assert.equal(impossible.action_production_atomic_write_plan.identity_mode,
      'preserve_source');
    assert.equal(impossible.action_production_atomic_write_plan
      .source_updates.length, 1);
    assert.deepEqual(impossible.action_production_atomic_write_plan
      .result_items, []);

    const writing = await productionOwner('production-writing')(
      productionEnvelope({
      targetRefs: ['production-knife', 'production-stone'],
      remainingIntent: 'Оставляю на ткани короткую надпись.',
      actionProduction: actionProduction({ result_class: 'written_carrier',
        output_class: 'written_carrier', result_descriptor: descriptor({
          display_name: 'ткань с надписью',
          physical_description: 'на ткани оставлена видимая надпись',
          qualitative_facts: ['носитель имеет рукописную надпись'],
          inscription_text: 'Жду у переправы.'
        }) }) }));
    assert.equal(writing.action_production_atomic_write_plan.source_updates[0]
      .after_item.state.action_production.inscription_text,
    'Жду у переправы.');

    const token = await productionOwner('production-token-gap')(
      productionEnvelope({
      itemRef: 'production-board', targetRefs: [],
      remainingIntent: 'Отделяю от доски простой счётный жетон.',
      actionProduction: actionProduction({
        identity_mode: 'independent_outputs', origin: 'direct_partition',
        result_class: 'ordinary_physical_result',
        output_class: 'money_like_token', result_descriptor: descriptor({
          display_name: 'деревянный счётный жетон',
          physical_description: 'от доски отделён маленький деревянный кружок'
        })
      }) }));
    assert.deepEqual(token.action_production_atomic_write_plan.result_items[0]
      .mechanics_snapshot.mechanics, {
      mass_grams: 400, external_hand_cost: 0, carry_form: 'compact',
      packing_slot_cost: 1, quantity: { value: 1, unit: 'item' },
      container: null
    });

    const multi = await productionOwner('production-multi')(
      productionEnvelope({
      itemRef: 'production-material-a',
      targetRefs: ['production-material-b', 'production-knife'],
      remainingIntent: 'Соединяю два материала и делаю две одинаковые детали.',
      actionProduction: actionProduction({
        source_refs: ['production-material-a', 'production-material-b'],
        tool_refs: ['production-knife'], output_count: 2,
        identity_mode: 'independent_outputs', origin: 'crafted',
        result_class: 'ordinary_physical_result',
        result_descriptor: descriptor({ display_name: 'составная деталь',
          physical_description: 'две одинаковые детали из обоих материалов'
        })
      }) }));
    const multiPlan = multi.action_production_atomic_write_plan;
    assert.equal(multiPlan.source_updates.length, 2);
    assert.equal(multiPlan.result_items.length, 2);
    assert.deepEqual(multiPlan.result_items.map((item) =>
      item.mechanics_snapshot.mechanics), [1, 2].map(() => ({
      mass_grams: 150, external_hand_cost: 0, carry_form: 'compact',
      packing_slot_cost: 1, quantity: { value: 1, unit: 'item' },
      container: null
    })));
    const multiCombined = await combinedPlan(
      multiPlan, 'production-multi', 5);
    assert.equal((await committer.commit({ plan: multiCombined })).ok, true);
    assert.deepEqual(await committer.commit({ plan: multiCombined }), {
      ok: true, replay: true,
      change_set_id: 'change:party-a1:turn-step:5'
    });
    assert.deepEqual((await pool.query(`SELECT
      (SELECT quantity_numerator::int FROM party_runtime.party_resource_nodes
       WHERE party_id='party-a1' AND resource_node_id='resource-material-a') AS a,
      (SELECT quantity_numerator::int FROM party_runtime.party_resource_nodes
       WHERE party_id='party-a1' AND resource_node_id='resource-material-b') AS b,
      (SELECT state->'runtime_instance_mechanics_snapshot'->'mechanics'
        ->>'mass_grams' FROM party_runtime.party_items
       WHERE party_id='party-a1' AND item_id='production-material-a') AS a_mass,
      (SELECT state->'runtime_instance_mechanics_snapshot'->'mechanics'
        ->>'mass_grams' FROM party_runtime.party_items
       WHERE party_id='party-a1' AND item_id='production-material-b') AS b_mass,
      (SELECT sum((state->'runtime_instance_mechanics_snapshot'->'mechanics'
        ->>'mass_grams')::int)::int FROM party_runtime.party_items
       WHERE party_id='party-a1'
         AND state->'action_production'->'causal_identity'->>'request_id'
           ='production-multi') AS output_mass`))
      .rows[0], { a: 1, b: 1, a_mass: '200', b_mass: '100',
        output_mass: 300 });
    const persistedOutput = (await pool.query(`SELECT
      state->'ordinary_metadata' AS ordinary_metadata
      FROM party_runtime.party_items
      WHERE party_id='party-a1'
        AND state->'action_production'->'causal_identity'->>'request_id'
          ='production-multi'
      ORDER BY item_id LIMIT 1`)).rows[0];
    assert.deepEqual(persistedOutput.ordinary_metadata, {
      semantic_type: 'ordinary_mundane', name: 'составная деталь',
      origin: { kind: 'action_produced', source_refs: [
        'production-material-a', 'production-material-b'] },
      semantic_facts: [
        'две одинаковые детали из обоих материалов'],
      operation_history: []
    });

    const production = await productionOwner('production-request')(
      productionEnvelope({
      stateVersion: 6, turnNumber: 5,
      actionProduction: actionProduction({ output_class: 'weapon_capable',
        result_descriptor: descriptor({
          display_name: 'тканевая праща',
          physical_description: 'край ткани свит в гибкую ударную петлю',
          qualitative_facts: ['петля пригодна для импровизированного удара'],
          weapon_qualitative_class: 'improvised_impact_light'
        }) }) }));
    const productionCombined = await combinedPlan(
      production.action_production_atomic_write_plan, 'production', 6);
    assert.equal((await committer.commit({ plan: productionCombined })).ok,
      true);
    assert.deepEqual(await committer.commit({ plan: productionCombined }), {
      ok: true, replay: true,
      change_set_id: 'change:party-a1:turn-step:6'
    });
    const productionRows = (await pool.query(`SELECT
      (SELECT state_version::int FROM party_runtime.parties
       WHERE party_id='party-a1') AS party_version,
      (SELECT state->'action_production' FROM party_runtime.party_items
       WHERE party_id='party-a1' AND item_id='production-garment') AS source,
      (SELECT state_version::int FROM party_runtime.party_items
       WHERE party_id='party-a1' AND item_id='production-knife') AS tool_version`))
      .rows[0];
    assert.deepEqual(productionRows, { party_version: 7,
      source: { schema: 'rus.items.action_production_item_state.v1',
        causal_identity: production.action_production_atomic_write_plan
          .causal_identity,
        result_class: 'partial_transformation',
        output_class: 'weapon_capable',
        weapon_qualitative_class: 'improvised_impact_light',
        physical_facts: [
          'петля пригодна для импровизированного удара'],
        inscription_text: null }, tool_version: 1 });

    const ordinary = batchInput({ party: 'party-a1', partyStateVersion: 7,
      requestIdentity: 'same-root-ordinary', masses: [80],
      ownerControllerRef: 'pc', rootTurnId: 'turn-same-root', stepIndex: 1 });
    await provisionPreparedOrdinary(pool, ordinary);
    const preparedItem = ordinary.items[0].item_id;
    const sameRoot = await actionPlan(pool, { partyVersion: 7,
      changeSetId: 'change-same-root', requestId: 'same-root-a1',
      actionRef: 'action-same-root', sources: [preparedItem],
      tools: ['production-knife'], mode: 'preserve_source',
      preparedOrdinary: ordinary, rootTurnId: 'turn-same-root', stepIndex: 2 });
    const sameRootCombined = await combinedPlan(sameRoot, 'same-root', 7,
      { ordinaryPlan: ordinary });
    assert.equal((await committer.commit({ plan: sameRootCombined })).ok, true);
    assert.deepEqual((await pool.query(`SELECT
      (SELECT count(*)::int FROM
       party_runtime.party_ordinary_materialization_commits
       WHERE party_id='party-a1'
         AND request_identity='same-root-ordinary') AS ordinary,
      (SELECT state->'action_production'->>'schema'
       FROM party_runtime.party_items WHERE party_id='party-a1'
         AND item_id=$1) AS item_schema`, [preparedItem])).rows[0],
    { ordinary: 1, item_schema: 'rus.items.action_production_item_state.v1' });

    await pool.query(`UPDATE party_runtime.party_item_placements
      SET holder_character_id=NULL,physical_position=NULL,container_id='chest'
      WHERE party_id='party-a1' AND item_id='production-knife'`);
    assert.deepEqual((await pool.query(`SELECT i.item_id
      FROM party_runtime.party_items i
      JOIN party_runtime.party_item_placements p
        ON p.party_id=i.party_id AND p.item_id=i.item_id
      JOIN party_runtime.party_ownership o
        ON o.party_id=i.party_id AND o.item_id=i.item_id
      WHERE i.party_id='party-a1' AND i.item_id=ANY($1::text[])
      ORDER BY i.item_id`, [[preparedItem, 'production-knife']])).rows.map(
      ({ item_id: itemId }) => itemId),
    [preparedItem, 'production-knife'].sort());

    const reloadedContained = await actionPlan(pool, { partyVersion: 8,
      changeSetId: 'change-contained-reload', requestId: 'contained-reload',
      actionRef: 'action-contained-reload', sources: [preparedItem],
      tools: ['production-knife'], mode: 'preserve_source',
      rootTurnId: 'turn-contained-reload', stepIndex: 1 });
    assert.equal(reloadedContained.source_pins[0]
      .access_container.container_id, 'chest');
    assert.equal(reloadedContained.tool_pins[0]
      .access_container.container_id, 'chest');
    const containedCombined = await combinedPlan(reloadedContained,
      'contained-reload', 8);
    assert.equal((await committer.commit({ plan: containedCombined })).ok,
      true);
    assert.deepEqual(await committer.commit({ plan: containedCombined }), {
      ok: true, replay: true, change_set_id: 'change-contained-reload'
    });

    await pool.query(`UPDATE party_runtime.party_item_placements
      SET holder_character_id=NULL,physical_position=NULL,
          anchor_id='output-anchor'
      WHERE party_id='party-a1' AND item_id='production-whole-board'`);
    const activeBefore = Number((await pool.query(`SELECT count(*)::int AS n
      FROM party_runtime.party_item_placements p
      JOIN party_runtime.party_items i
        ON i.party_id=p.party_id AND i.item_id=p.item_id
      WHERE p.party_id='party-a1' AND p.anchor_id='output-anchor'
        AND COALESCE(i.state->>'lifecycle_status','active') <> 'retired'`))
      .rows[0].n);
    await pool.query(`UPDATE party_runtime.party_g5_anchors
      SET item_capacity=$1 WHERE party_id='party-a1'
        AND anchor_id='output-anchor'`, [activeBefore + 1]);

    const whole = await productionOwner('production-whole')(
      productionEnvelope({
      stateVersion: 9, turnNumber: 8, itemRef: 'production-whole-board',
      targetRefs: ['production-knife'],
      remainingIntent: 'Разрезаю доску на два деревянных клина.',
      actionProduction: actionProduction({
        source_refs: ['production-whole-board'],
        tool_refs: ['production-knife'], output_count: 2,
        identity_mode: 'independent_outputs', origin: 'direct_partition',
        result_class: 'ordinary_physical_result',
        result_descriptor: descriptor({ display_name: 'деревянный клин',
          physical_description: 'часть разрезанной доски' })
      }) }));
    const wholeCombined = await combinedPlan(
      whole.action_production_atomic_write_plan, 'production-whole', 9);
    assert.equal((await committer.commit({ plan: wholeCombined })).ok, true);
    assert.deepEqual((await pool.query(`SELECT
      (SELECT condition_state FROM party_runtime.party_items
       WHERE party_id='party-a1' AND item_id='production-whole-board')
        AS source_condition,
      (SELECT count(*)::int FROM party_runtime.party_items
       WHERE party_id='party-a1' AND state->'action_production'
         ->'causal_identity'->>'request_id'='production-whole') AS outputs,
      (SELECT count(*)::int FROM party_runtime.party_item_placements
       WHERE party_id='party-a1' AND item_id='production-whole-board')
        AS source_placements,
      (SELECT count(*)::int FROM party_runtime.party_item_placements p
       JOIN party_runtime.party_items i
         ON i.party_id=p.party_id AND i.item_id=p.item_id
       WHERE p.party_id='party-a1' AND p.anchor_id='output-anchor'
         AND COALESCE(i.state->>'lifecycle_status','active') <> 'retired')
        AS active_placements,
      (SELECT item_capacity::int FROM party_runtime.party_g5_anchors
       WHERE party_id='party-a1' AND anchor_id='output-anchor') AS capacity,
      (SELECT sum((state->'runtime_instance_mechanics_snapshot'->'mechanics'
        ->>'mass_grams')::int)::int FROM party_runtime.party_items
       WHERE party_id='party-a1' AND state->'action_production'
         ->'causal_identity'->>'request_id'='production-whole') AS mass`))
      .rows[0], { source_condition: 'retired', outputs: 2,
        source_placements: 0, active_placements: activeBefore + 1,
        capacity: activeBefore + 1, mass: 800 });

    const reloadClient = await pool.connect();
    try {
      const reloaded = await loadActionProducedCommittedContext(reloadClient, {
        party_id: 'party-a1', actor_ref: 'pc',
        root_turn_id: 'turn-after-partition', action_ref: 'action-after',
        step_index: 1, context_ref: A1.context_ref,
        expected_party_state_version: 10,
        source_refs: ['production-partial-board'],
        tool_refs: ['production-knife'], admission_profile: admissionProfile(10),
        technical_policy: technicalPolicy()
      });
      assert.equal(reloaded.output_destination_pin.used_item_ids.includes(
        'production-whole-board'), false);
      assert.equal(reloaded.output_destination_pin.used_item_ids.length,
        reloaded.output_destination_pin.item_capacity);
    } finally { reloadClient.release(); }

    await pool.query(`UPDATE party_runtime.party_g5_anchors
      SET item_capacity=item_capacity+2 WHERE party_id='party-a1'
        AND anchor_id='output-anchor'`);
    const partial = await productionOwner('production-partial')(
      productionEnvelope({
      checked: false, stateVersion: 10, turnNumber: 9,
      itemRef: 'production-partial-board',
      targetRefs: ['production-knife'],
      remainingIntent: 'Срезаю с доски два небольших клина.',
      actionProduction: actionProduction({
        source_refs: ['production-partial-board'],
        tool_refs: ['production-knife'], output_count: 2,
        identity_mode: 'independent_outputs', origin: 'direct_partition',
        result_class: 'partial_transformation',
        result_descriptor: descriptor({ display_name: 'деревянный клин',
          physical_description: 'небольшая отделённая часть доски' })
      }) }));
    const partialCombined = await combinedPlan(
      partial.action_production_atomic_write_plan, 'production-partial', 10);
    assert.equal((await committer.commit({ plan: partialCombined })).ok, true);
    assert.deepEqual(await committer.commit({ plan: partialCombined }), {
      ok: true, replay: true,
      change_set_id: 'change:party-a1:turn-step:10'
    });
    assert.deepEqual((await pool.query(`SELECT
      (SELECT condition_state FROM party_runtime.party_items
       WHERE party_id='party-a1' AND item_id='production-partial-board')
        AS source_condition,
      (SELECT COALESCE(
        (state->'runtime_instance_mechanics_snapshot'->'mechanics'
          ->>'mass_grams')::int,
        (state->'inventory_profile_snapshot'->>'mass_grams')::int)
       FROM party_runtime.party_items
       WHERE party_id='party-a1' AND item_id='production-partial-board')
        AS source_mass,
      (SELECT count(*)::int
      FROM party_runtime.party_items WHERE party_id='party-a1'
         AND state->'action_production'->'causal_identity'->>'request_id'
           ='production-partial') AS outputs`)).rows[0], {
      source_condition: 'serviceable', source_mass: 600, outputs: 2
    });
    const partialReload = await pool.connect();
    try {
      const loaded = await loadActionProducedCommittedContext(partialReload, {
        party_id: 'party-a1', actor_ref: 'pc',
        root_turn_id: 'turn-after-partial', action_ref: 'action-after-partial',
        step_index: 1, context_ref: A1.context_ref,
        expected_party_state_version: 11,
        source_refs: ['production-partial-board'],
        tool_refs: ['production-knife'], admission_profile: admissionProfile(11),
        technical_policy: technicalPolicy()
      });
      assert.equal(loaded.row_pins.find(({ role }) => role === 'source')
        .item.state.runtime_instance_mechanics_snapshot.mechanics.mass_grams,
      600);
    } finally { partialReload.release(); }
  });

async function actionPlan(pool, config) {
  const client = await pool.connect();
  try {
    const rootTurnId = config.rootTurnId ?? `turn-${config.requestId}`;
    const stepIndex = config.stepIndex ?? 1;
    const contextRef = A1.context_ref;
    const loaded = await loadActionProducedCommittedContext(client, {
      party_id: 'party-a1', actor_ref: 'pc', root_turn_id: rootTurnId,
      action_ref: config.actionRef, step_index: stepIndex,
      context_ref: contextRef,
      expected_party_state_version: config.partyVersion,
      source_refs: config.sources, tool_refs: config.tools,
      admission_profile: admissionProfile(config.partyVersion),
      technical_policy: technicalPolicy(),
      ...(config.preparedOrdinary == null ? {} : {
        prepared_ordinary_plan: config.preparedOrdinary,
        change_set_id: config.changeSetId
      })
    });
    const origin = config.mode === 'independent_outputs'
      ? 'direct_partition' : null;
    const resultClass = config.mode === 'no_useful_result'
      ? 'no_useful_result' : 'ordinary_physical_result';
    const semantic = {
      schema: 'action_produced_result_plan_v1', request_id: config.requestId,
      root_turn_id: rootTurnId, action_ref: config.actionRef,
      step_index: stepIndex,
      committed_state_version: String(config.partyVersion),
      context_ref: contextRef, profile_ref: A1.profile_ref,
      profile_version: '1',
      causal_mode: 'action_produced', actor_ref: 'pc',
      source_refs: config.sources, tool_refs: config.tools,
      identity_mode: config.mode, origin,
      intended_transformation: 'bounded physical transformation',
      material_extent: config.mode === 'independent_outputs' ? 'whole' : null,
      result_class: resultClass,
      output_class: config.mode === 'no_useful_result'
        ? null : config.outputClass ?? 'ordinary_mundane',
      result_descriptor: config.mode === 'no_useful_result'
        ? { display_name: null, physical_description: null,
          qualitative_facts: [], inscription_text: null }
        : { display_name: 'ordinary result',
          physical_description: 'physically transformed',
          qualitative_facts: ['physically transformed'],
          inscription_text: null }
    };
    const admitted = admitActionProducedResult({
      committed_context: loaded.committed_context,
      profile: loaded.admission_profile, proposal: semantic
    });
    assert.equal(admitted.pass, true, JSON.stringify(admitted.errors));
    const planner = createActionProducedTransitionPlanner({
      resolveMechanics: (request) => ownerResolution(request, {
        ...config, sourceMechanics: Object.fromEntries(loaded.row_pins
          .filter(({ role }) => role === 'source').map((pin) => [pin.item_id,
          exactMechanics(pin.item.state
            .runtime_instance_mechanics_snapshot?.mechanics
              ?? pin.item.state.inventory_profile_snapshot)]))
      })
    });
    const transition = planner({ handoff: admitted.handoff,
      source_snapshots: loaded.source_snapshots,
      tool_snapshots: loaded.tool_snapshots,
      committed_entity_refs: [...config.sources, ...config.tools],
      technical_policy: loaded.technical_policy,
      output_destination: config.mode === 'independent_outputs'
        ? loaded.output_destination : null });
    return createActionProducedAtomicWritePlan({
      schema: 'action_production_atomic_write_request_v1',
      party_id: 'party-a1', base_party_state_version: config.partyVersion,
      change_set_id: config.changeSetId, committed_load: loaded,
      transition_proposal: transition
    });
  } finally { client.release(); }
}

function ownerResolution(request, config) {
  if (config.mode === 'no_useful_result' && config.decrement != null) {
    return { schema: 'rus.items.action_produced_owner_resolution.v1',
      identity_mode: config.mode, source_effects: request.source_inputs.map(
        ({ entity_ref: sourceRef }) => ({ source_ref: sourceRef,
          requested_decrement: { numerator: config.decrement,
            denominator: 1, unit: 'piece' },
          mechanics_snapshot_after: null })), outputs: [], known_waste: [] };
  }
  return resolveActionProducedAllocationMechanics({
    mechanics_request: request,
    source_mechanics: request.source_inputs.map(({ entity_ref: sourceRef }) =>
      ({ source_ref: sourceRef, mechanics: config.sourceMechanics[sourceRef] })),
    output_count: config.mode === 'independent_outputs'
      ? config.outputCount ?? 2 : 0
  });
}

function exactMechanics(value) {
  const { mass_grams, external_hand_cost, carry_form, packing_slot_cost,
    quantity, container } = value;
  return { mass_grams, external_hand_cost, carry_form, packing_slot_cost,
    quantity: structuredClone(quantity), container };
}

async function combinedPlan(action, suffix, partyVersion,
  { missingClock = false, ordinaryPlan = null, followUpMove = false } = {}) {
  const changeSetId = action.change_set_id;
  const payload = { schema: 'temporal_visible_package.v1',
    perceived_scene: 'Изменение зафиксировано.', perceived_changes: [],
    sensory_details: [], visible_npcs: [], visible_objects: [],
    known_context: [], uncertainties: [], hypotheses: [],
    player_safe_interruption: null, allowed_action_affordances: [] };
  const pins = [{ dependency_role: 'source_authoring', entity_ref: {
    entity_kind: 'world_revision', entity_id: 'a1-test' }, version_pin: {
    pin_kind: 'authoring_version', authoring_version: 'test-v1',
    state_version: null } }];
  const expected = [{ target_table: 'parties', id: 'party-a1',
    state_version: partyVersion }, ...(missingClock ? [{
      target_table: 'party_clocks', id: 'party-a1', state_version: 1
    }] : [])];
  const movedResult = followUpMove ? action.result_items[0] : null;
  const updates = [{ target_table: 'parties', id: 'party-a1',
    record: { party_id: 'party-a1', profile_bundle_digest: 'profiles' } },
  ...(missingClock ? [{ target_table: 'party_clocks', id: 'party-a1',
    record: { party_id: 'party-a1', whole_minutes: 0,
      subminute_numerator: 0, subminute_denominator: 1,
      clock_owner_kind: 'party', clock_owner_id: null,
      updated_change_set_id: changeSetId } }] : []),
  ...(movedResult == null ? [] : [{ target_table: 'party_items',
    id: movedResult.item_id, record: { party_id: 'party-a1',
      item_id: movedResult.item_id, quantity: movedResult.item_row.quantity,
      condition_state: movedResult.item_row.condition_state,
      legal_status: movedResult.item_row.legal_status,
      state: movedResult.item_row.state } }, {
    target_table: 'party_item_placements', id: movedResult.item_id,
    record: { party_id: 'party-a1', item_id: movedResult.item_id,
      anchor_id: null, container_id: null, holder_npc_id: null,
      holder_character_id: 'pc', physical_position: 'hands',
      equipment_slot_category_id: null, attached_item_id: null } }])];
  const idem = action.causal_identity.request_id;
  const causalInputDigest = digest({
    schema: 'action_production_p16_causal_input_v1',
    request_id: action.causal_identity.request_id,
    root_turn_id: action.causal_identity.root_turn_id,
    action_ref: action.causal_identity.action_ref,
    step_index: action.causal_identity.step_index,
    actor_ref: action.actor_ref, context_ref: action.context_pin.context_ref
  });
  const built = await buildCombinedWritePlan({ plan_id: `plan-${suffix}`,
    party_id: 'party-a1', write_plan_kind: 'semantic_commit',
    operation_kind: 'action_production',
    canonical_input_digest: causalInputDigest,
    expected_state_versions: expected,
    validation_report: { status: 'pass', digest: `sha256:${hex}` },
    idempotency: { id: idem, key: `key-${suffix}` },
    change_set: { id: changeSetId },
    visible_package_envelope: { package_id: `visible-${suffix}`,
      party_id: 'party-a1', turn_id: action.causal_identity.root_turn_id,
      committed_state_version: String(partyVersion + 1),
      change_set_id: changeSetId, package_digest: digest(payload),
      visible_payload: payload, presentation_status: 'pending',
      projection_policy_ref: { entity_ref: {
        entity_kind: 'visibility_modifier', entity_id: 'projection-v1' },
      authoring_version: 'test-v1' }, dependency_pins: { pins,
        canonical_digest: digest(pins).replace('sha256:', '') },
      idempotency_record_id: idem },
    approved_write_sets: [{ inserts: [], updates, appends: [{
      target_table: 'party_v3_change_sets', id: changeSetId,
      record: { id: changeSetId, party_id: 'party-a1',
        operation_kind: 'action_production', idempotency_record_id: idem }
    }] }],
    lock_context: { owner_keys: ['actor:pc'], execution_keys: [],
      g4_keys: [], physical_keys: [
        `party_runtime.party_v3_change_sets:${changeSetId}`,
        'party_runtime.parties:party-a1',
        ...(missingClock ? ['party_runtime.party_clocks:party-a1'] : []),
        ...actionProducedPhysicalKeys(action),
        ...(ordinaryPlan == null ? [] : ordinaryPhysicalKeys(ordinaryPlan))
      ] }, action_production_atomic_write_plan: action,
    ordinary_materialization_atomic_write_plan: ordinaryPlan,
    commit_rechecks: ['physical', 'state', 'pin', 'endpoint', 'route',
      'capacity', 'time', 'change_set'].map((kind) => ({ kind,
      digest: `sha256:${hex}` }))
  }, { verifyApproval: async () => ({ ok: true }) });
  assert.equal(built.ok, true, JSON.stringify(built.error));
  return built.plan;
}

function combinedCommitter(pool) {
  return createSpatialV3CombinedAtomicCommitter({
    now: () => new Date('2030-01-01T00:00:00.000Z'),
    recheck: async () => ({ ok: true }),
    withTransaction: async (work) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }
    }
  });
}

async function provisionPreparedOrdinary(pool, plan) {
  const initial = createOrdinaryAggregate({ scope_ref: plan.scope_ref,
    resolution_record_cap: 32 });
  await pool.query(`INSERT INTO party_runtime.party_containers
    (party_id,container_id,run_id,template_id,holder_character_id,
     physical_position,closure_state,state,state_version)
    VALUES ('party-a1','chest','run-a1','chest-template','pc','hands','closed',
      $1::jsonb,1)`, [JSON.stringify({ ordinary_contents_context: {
      mechanics_profile_ref: plan.container_pin.mechanics_profile_ref,
      mechanics_profile_digest: plan.container_pin.mechanics_profile_digest,
      context_digest: plan.container_pin.context_digest,
      ordinary_policy: { schema:
        'rus.items.existing_container_ordinary_policy.v2', version: 2,
      unresolved_ordinary_contents: true,
      technical_limits: plan.technical_limits } } })]);
  await pool.query(`INSERT INTO party_runtime.party_ownership
    (party_id,ownership_id,container_id,owner_character_id,owner_party,
     controller_character_id,claim_state)
    VALUES ('party-a1','ownership:chest','chest','pc',false,'pc','owned')`);
  await pool.query(`INSERT INTO
    party_runtime.party_ordinary_materialization_aggregates
    (party_id,scope_kind,scope_id,state_version,aggregate_payload)
    VALUES ('party-a1','container','chest',0,$1::jsonb)`,
  [JSON.stringify(initial)]);
  await pool.query(`INSERT INTO
    party_runtime.party_ordinary_materialization_contexts
    (party_id,scope_kind,scope_id,catalog_version,property_version,
     placement_version,supporting_basis_catalog_version,
     supporting_basis_catalog_digest,property_placement_context_digest,
     property_placement_base_snapshot)
    VALUES ('party-a1','container','chest',1,1,1,1,$1,$2,'{}'::jsonb)`,
  [plan.expected_versions.supporting_basis_catalog_digest,
    plan.expected_versions.property_placement_context_digest]);
  await pool.query(`INSERT INTO
    party_runtime.party_ordinary_materialization_basis_catalog
    (party_id,scope_kind,scope_id,basis_ref,origin_request_identity,
     basis_snapshot) VALUES ('party-a1','container','chest',$1,NULL,$2::jsonb)`,
  [plan.expected_supporting_basis_catalog[0].basis_ref,
    JSON.stringify(plan.expected_supporting_basis_catalog[0])]);
  await pool.query(`INSERT INTO
    party_runtime.party_ordinary_materialization_enablements
    (party_id,scope_kind,scope_id,objective_snapshot,objective_digest,enabled)
    VALUES ('party-a1','container','chest',$1::jsonb,$2,true)`,
  [JSON.stringify({ scope_ref: plan.scope_ref }),
    plan.enablement_pin.objective_digest]);
}

async function provision(pool) {
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,
     materializer_version,rng_version,command_catalog_digest,
     profile_bundle_digest,state_version)
    VALUES ('party-a1',2,'world','catalog','materializer','rng','commands',
      'profiles',1)`);
  await pool.query(`INSERT INTO party_runtime.party_materialization_runs
    (party_id,run_id,g4_id,run_kind,seed_digest,input_digest,catalog_digest,
     materializer_version,rng_version,result_digest,idempotency_key,status)
    VALUES ('party-a1','run-a1','g4','baseline','s','i','c','m','r','z','k',
      'committed')`);
  await pool.query(`INSERT INTO party_runtime.party_player_characters
    (party_id,character_id,profile) VALUES ('party-a1','pc','{}')`);
  await pool.query(`INSERT INTO party_runtime.party_player_characters
    (party_id,character_id,profile) VALUES ('party-a1','other-pc','{}')`);
  await pool.query(`INSERT INTO party_runtime.party_g5_nodes
    (party_id,g5_node_id,run_id,parent_g4_id,template_id,slot_key,state)
    VALUES ('party-a1','legacy-g5','run-a1','g4','g5-template','main','{}')`);
  await pool.query(`INSERT INTO party_runtime.party_g5_anchors
    (party_id,anchor_id,g5_node_id,template_id,slot_key,item_capacity)
    VALUES ('party-a1','output-anchor','legacy-g5','anchor-template','ground',8)`);
  await pool.query(`INSERT INTO party_runtime.party_positions
    (party_id,g4_id,g5_node_id,g5_anchor_id)
    VALUES ('party-a1','g4','legacy-g5','output-anchor')`);
  await pool.query(`INSERT INTO party_runtime.party_v3_change_sets
    (id,party_id,operation_kind,expected_state_version_set_digest,
     expected_state_version_set,committed_state_version_set_digest,
     write_plan_digest,created_at_turn,committed_at_turn)
    VALUES ('fixture-a1','party-a1','fixture',$1,'[]'::jsonb,$1,$1,0,0)`,
  ['f'.repeat(64)]);
  await pool.query(`INSERT INTO party_runtime.party_g5_sites
    (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ('g5-a1','party-a1','canonical','g4',$1::jsonb,'active',0,
      'fixture-a1','fixture-a1')`, [JSON.stringify({ entity_id: 'g5-a1' })]);
  await pool.query(`INSERT INTO party_runtime.party_scene_baselines
    (id,party_id,host_kind,host_id,source_kind,scene_template_ref,
     materialization_trace_id,materializer_version,catalog_digest,status,
     state_version,created_change_set_id,updated_change_set_id)
    VALUES ('baseline-a1','party-a1','g5_site','g5-a1',
      'canonical_template',$1::jsonb,'trace','m','c','active',0,
      'fixture-a1','fixture-a1')`, [JSON.stringify({ entity_id: 'scene-a1' })]);
  await pool.query(`INSERT INTO party_runtime.party_g6_instances
    (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,
     host_kind,host_id,physical_class_id,primary_scene_role_id,
     vertical_context_id,overhead_cover_id,intra_g6_visibility_mode,
     default_visibility_distance_band,acoustic_uniformity,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ('g6-a1','party-a1','baseline-a1',$1::jsonb,'main','g5_site',
      'g5-a1','interior','room','ground','open','default_clear','near',
      'uniform','active',0,'fixture-a1','fixture-a1')`,
  [JSON.stringify({ entity_id: 'scene-a1' })]);
  await pool.query(`INSERT INTO party_runtime.scene_position_nodes
    (id,party_id,g6_instance_id,position_type_id,template_slot_key,
     template_instance_ordinal,capacity,access_class_id,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ('position-a1','party-a1','g6-a1','ground','source',0,8,'open',
      'active',0,'fixture-a1','fixture-a1')`);
  const items = ['pole', 'knife', 'board', 'axe', 'scrap', 'hammer',
    'rollback-source', 'rollback-tool', 'stale-source', 'stale-tool'];
  items.push('resource-stale-source', 'resource-stale-tool',
    'tool-stale-source', 'tool-stale-tool', 'collision-source',
    'collision-tool', 'ownership-stale-source', 'ownership-stale-tool');
  for (const item of items) {
    const finite = ['board', 'scrap', 'rollback-source',
      'resource-stale-source', 'collision-source'].includes(item);
    const inventory = inventoryProfile(item, 300, 1, 'regular', 1,
      finite ? { value: 3, unit: 'piece' } : null);
    await pool.query(`INSERT INTO party_runtime.party_items
      (party_id,item_id,run_id,template_id,profile_id,category_id,quantity,
       condition_state,legal_status,state,state_version)
      VALUES ('party-a1',$1,'run-a1',$2,'profile','ordinary',1,
        'serviceable','owned',$3::jsonb,1)`, [item, `template:${item}`,
      JSON.stringify({ lifecycle_status: 'active',
        inventory_profile_snapshot: inventory,
        resource_position_node_id: 'position-a1', property_state: {
          source_ref: item,
          resource_property_basis_ref: `property:${item}` } })]);
    await pool.query(`INSERT INTO party_runtime.party_item_placements
      (party_id,item_id,holder_character_id,physical_position)
      VALUES ('party-a1',$1,'pc','hands')`, [item]);
    await pool.query(`INSERT INTO party_runtime.party_ownership
      (party_id,ownership_id,item_id,owner_character_id,owner_party,
       controller_character_id,claim_state)
      VALUES ('party-a1',$1,$2,'pc',false,'pc','owned')`,
    [`ownership:${item}`, item]);
  }
  for (const item of ['board', 'scrap', 'rollback-source',
    'resource-stale-source', 'collision-source']) {
    await pool.query(`INSERT INTO party_runtime.party_resource_nodes
      (resource_node_id,party_id,source_resource_ref,position_node_id,
       quantity_numerator,quantity_denominator,quantity_unit_ref,quality_ref,
       access_policy_ref,state_version,created_change_set_id,
       updated_change_set_id,lifecycle_state)
      VALUES ($1,'party-a1',$2::jsonb,'position-a1',3,1,$3::jsonb,
        '{}'::jsonb,'{}'::jsonb,1,'fixture-a1','fixture-a1','active')`,
    [`resource-${item}`, JSON.stringify({ entity_kind: 'party_item',
      entity_id: item }),
      JSON.stringify({ entity_id: 'piece' })]);
    await pool.query(`UPDATE party_runtime.party_resource_nodes
      SET property_basis_ref=$1 WHERE party_id='party-a1'
        AND resource_node_id=$2`, [`property:${item}`, `resource-${item}`]);
  }
}

const A1 = {
  context_ref: 'lower_dvina_trace:a1:personal_tool_transform',
  profile_ref: 'lower_dvina_trace_a1_open_physical_action_profile_v1',
  policy_ref: 'lower_dvina_trace:a1:personal_tool_policy_v1'
};

function admissionProfile(stateVersion) {
  return { schema: 'rus.items.action_produced_admission_profile.v1',
    profile_ref: A1.profile_ref, profile_version: '1', status: 'committed',
    context_ref: A1.context_ref, context_state_version: String(stateVersion),
    allowed_access_states: ['immediate', 'quick'],
    allowed_identity_modes: ['preserve_source', 'independent_outputs',
      'no_useful_result'], allowed_origins: ['direct_partition', 'crafted'],
    allowed_result_classes: ['ordinary_physical_result',
      'partial_transformation', 'nonworking_construction', 'waste',
      'written_carrier', 'no_useful_result'] };
}

function technicalPolicy() {
  return { schema: 'rus.items.action_produced_technical_policy.v1',
    version: 1, status: 'committed', policy_ref: A1.policy_ref,
    profile_ref: A1.profile_ref, profile_version: '1', max_new_entities: 4 };
}

function descriptor(overrides = {}) {
  return { display_name: null,
    physical_description: 'Край предмета физически обработан.',
    qualitative_facts: [], inscription_text: null,
    weapon_qualitative_class: null, ...overrides };
}

function actionProduction(overrides = {}) {
  const identityMode = overrides.identity_mode ?? 'preserve_source';
  const resultClass = overrides.result_class ?? 'partial_transformation';
  return { identity_mode: 'preserve_source', origin: null,
    result_class: 'partial_transformation',
    material_extent: identityMode === 'independent_outputs'
      ? resultClass === 'partial_transformation' ? 'minor' : 'whole'
      : null,
    result_descriptor: descriptor(), output_class: 'ordinary_mundane',
    ...overrides };
}

function productionEnvelope({ itemRef = 'production-garment',
  targetRefs = ['production-knife'], actionProduction: qualitative =
    actionProduction(), stateVersion = 5, turnNumber = 4,
  remainingIntent = 'Физически изменяю доступный предмет.',
  checked = true } = {}) {
  const plan = { resolution: checked ? 'generic_check' : 'domain_request',
    activity: checked
      ? { owner: 'semantic', duration_class: 'short', effort: 'light' }
      : { owner: 'domain', duration_class: null, effort: null },
    check: checked ? { attribute_ref: 'dexterity', skill_ref: null,
      difficulty_id: 'standard' } : null, interpretation: {
      player_goal: remainingIntent, grounded_attempt: remainingIntent,
      adaptation: 'literal' } };
  const action = { source_refs: [itemRef], tool_refs: [...targetRefs],
    output_count: qualitative.identity_mode === 'independent_outputs' ? 1 : 0,
    ...qualitative };
  return { operation: { op: 'request_item_use', actor_ref: 'pc',
      item_ref: itemRef, use_kind: 'other', target_refs: targetRefs,
      action_production: action }, plan,
    request: { root_turn_id: 'turn-production', step_index: 1,
      committed_state_version: stateVersion, remaining_intent: remainingIntent },
    actor: { actor_id: 'pc' }, working_projection: {},
    committed_state: { party_state: { turn_number: turnNumber } },
    check_result: checked ? { check_id: 'turn-production:step:1', roll: 12,
      outcome: { band: 'success' } } : null };
}

async function provisionProductionScope(pool) {
  const loaded = await loadLowerDvinaTraceA1Profile();
  assert.equal(loaded.profile.profile_id, A1.profile_ref);
  await pool.query(`UPDATE party_runtime.party_g5_anchors
    SET item_capacity=16 WHERE party_id='party-a1'
      AND anchor_id='output-anchor'`);
  for (const [itemId, itemProfile, physicalPosition, equipmentSlot] of [
    ['production-garment', inventoryProfile('production-garment', 900, 0,
      'regular', 2), 'equipped', 'outer_garment'],
    ['production-knife', inventoryProfile('production-knife', 250, 1,
      'compact', 1), 'worn_quick', null],
    ['production-stone', inventoryProfile('production-stone', 300, 1,
      'compact', 1), 'hands', null],
    ['production-board', inventoryProfile('production-board', 800, 1,
      'regular', 2, { value: 2, unit: 'piece' }), 'hands', null],
    ['production-whole-board', inventoryProfile('production-whole-board',
      800, 1, 'regular', 2), 'hands', null],
    ['production-partial-board', inventoryProfile('production-partial-board',
      801, 1, 'long', 6), 'hands', null],
    ['production-material-a', inventoryProfile('production-material-a',
      400, 0, 'compact', 2, { value: 2, unit: 'piece' }), 'hands', null],
    ['production-material-b', inventoryProfile('production-material-b',
      200, 0, 'compact', 2, { value: 2, unit: 'piece' }), 'hands', null]
  ]) {
    const material = itemId.startsWith('production-material-');
    await pool.query(`INSERT INTO party_runtime.party_items
      (party_id,item_id,run_id,template_id,profile_id,category_id,quantity,
       condition_state,legal_status,state,state_version)
      VALUES ('party-a1',$1,'run-a1',$2,$3,'ordinary',1,'serviceable',
        'owned',$4::jsonb,1)`, [itemId, itemProfile.template_id,
      itemProfile.inventory_profile_id, JSON.stringify({ lifecycle_status:
        'active', inventory_profile_snapshot: itemProfile,
        ...(itemId !== 'production-board' && !material ? {} : {
          resource_position_node_id: 'position-a1', property_state: {
            ...(material ? {} : { source_ref: itemId }),
            resource_property_basis_ref: material
              ? 'property:production-materials' : `property:${itemId}` }
        }) })]);
    await pool.query(`INSERT INTO party_runtime.party_item_placements
      (party_id,item_id,holder_character_id,physical_position,
       equipment_slot_category_id)
      VALUES ('party-a1',$1,'pc',$2,$3)`, [itemId, physicalPosition,
      equipmentSlot]);
    if (itemId === 'production-partial-board') {
      await pool.query(`UPDATE party_runtime.party_item_placements
        SET holder_character_id=NULL,physical_position=NULL,
            anchor_id='output-anchor'
        WHERE party_id='party-a1' AND item_id=$1`, [itemId]);
    }
    await pool.query(`INSERT INTO party_runtime.party_ownership
      (party_id,ownership_id,item_id,owner_character_id,owner_party,
       controller_character_id,claim_state)
      VALUES ('party-a1',$1,$2,'pc',false,'pc','owned')`,
    [`ownership:${itemId}`, itemId]);
  }
  await pool.query(`INSERT INTO party_runtime.party_resource_nodes
    (resource_node_id,party_id,source_resource_ref,position_node_id,
     quantity_numerator,quantity_denominator,quantity_unit_ref,quality_ref,
     access_policy_ref,state_version,created_change_set_id,
     updated_change_set_id,lifecycle_state,property_basis_ref)
    VALUES ('resource-production-board','party-a1',$1::jsonb,'position-a1',
      2,1,$2::jsonb,'{}'::jsonb,'{}'::jsonb,1,'fixture-a1','fixture-a1',
      'active','property:production-board')`, [JSON.stringify({
    entity_kind: 'party_item', entity_id: 'production-board' }),
  JSON.stringify({ entity_id: 'piece' })]);
  for (const suffix of ['a', 'b']) {
    await pool.query(`INSERT INTO party_runtime.party_resource_nodes
      (resource_node_id,party_id,source_resource_ref,position_node_id,
       quantity_numerator,quantity_denominator,quantity_unit_ref,quality_ref,
       access_policy_ref,state_version,created_change_set_id,
       updated_change_set_id,lifecycle_state,property_basis_ref)
      VALUES ($1,'party-a1',$2::jsonb,'position-a1',2,1,$3::jsonb,
        '{}'::jsonb,'{}'::jsonb,1,'fixture-a1','fixture-a1','active',
        'property:production-materials')`, [`resource-material-${suffix}`,
      JSON.stringify({ entity_kind: 'party_item',
        entity_id: `production-material-${suffix}` }),
      JSON.stringify({ entity_id: 'piece' })]);
  }
}

function inventoryProfile(id, mass, hand, carry, packing,
  quantity = { value: 1, unit: 'item' }) {
  return { inventory_profile_id: `inventory:${id}`,
    template_id: `template:${id}`, mass_grams: mass,
    external_hand_cost: hand, carry_form: carry,
    packing_slot_cost: packing, quantity, container: null };
}
