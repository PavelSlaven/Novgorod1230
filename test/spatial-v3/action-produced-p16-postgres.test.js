import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Pool } from 'pg';
import { sha256 } from '@rus/kernel';
import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';
import { admitActionProducedResult } from
  '@rus/items-property/action-produced-result';
import { createActionProducedTransitionPlanner } from
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
      'schemas/party-db/026_party_runtime_action_production.sql', 'utf8'));
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
      (SELECT count(*)::int FROM party_runtime.party_action_production_commits
       WHERE party_id='party-a1' AND request_id='partition') AS commits,
      (SELECT quantity_numerator::int FROM party_runtime.party_resource_nodes
       WHERE party_id='party-a1' AND resource_node_id='resource-board') AS left,
      (SELECT state_version::int FROM party_runtime.parties
       WHERE party_id='party-a1') AS party_version`)).rows[0];
    assert.deepEqual(rejectedDestinationRows, { outputs: 0, placements: 0,
      commits: 0, left: 3, party_version: 2 });
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
      (SELECT count(*)::int FROM
       party_runtime.party_action_production_resource_transitions
       WHERE party_id='party-a1' AND request_id='partition') AS transitions,
      (SELECT state FROM party_runtime.party_items
       WHERE party_id='party-a1' AND item_id='board') AS source_state,
      (SELECT state_version::int FROM party_runtime.parties
       WHERE party_id='party-a1') AS party_version`);
    assert.equal(partitionRows.rows[0].outputs, 2);
    assert.equal(partitionRows.rows[0].grounded_outputs, 2);
    assert.equal(partitionRows.rows[0].left, 1);
    assert.equal(partitionRows.rows[0].transitions, 1);
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
    row = (await pool.query(`SELECT result_set_evidence,actor_ref,policy_ref,
      policy_version,max_new_entities FROM
      party_runtime.party_action_production_commits
      WHERE party_id='party-a1' AND request_id='none'`)).rows[0];
    assert.deepEqual(row.result_set_evidence.result_item_ids, []);
    assert.equal(row.actor_ref, 'pc');
    assert.equal(row.policy_ref, 'a1-policy');
    assert.equal(row.policy_version, 1);
    assert.equal(row.max_new_entities, 4);

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
      (SELECT count(*)::int FROM
       party_runtime.party_action_production_commits
       WHERE request_id='rollback') AS commits,
      (SELECT quantity_numerator::int FROM
       party_runtime.party_resource_nodes
       WHERE resource_node_id='resource-rollback-source') AS source_left,
      (SELECT state_version::int FROM party_runtime.parties
       WHERE party_id='party-a1') AS party_version`,
    [rollbackOutputIds])).rows[0], { outputs: 0, placements: 0,
      ownership: 0, commits: 0, source_left: 3, party_version: 4 });

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

    const authorityStale = await actionPlan(pool, {
      partyVersion: 4, changeSetId: 'change-authority-stale',
      requestId: 'authority-stale', actionRef: 'action-authority-stale',
      sources: ['stale-source'], tools: ['stale-tool'],
      mode: 'preserve_source'
    });
    const authorityV2 = authorityFixture(2);
    await pool.query(`UPDATE party_runtime.party_action_production_authorities
      SET authority_state_version=2,authority_digest=$1
      WHERE party_id='party-a1' AND actor_ref='pc' AND context_ref='context-a1'`,
    [digest(authorityV2)]);
    const authorityStaleResult = await committer.commit({
      plan: await combinedPlan(authorityStale, 'authority-stale', 4)
    });
    assert.equal(authorityStaleResult.ok, false);
    assert.equal(authorityStaleResult.error.code, 'state_version_conflict');
    const authorityV1 = authorityFixture();
    await pool.query(`UPDATE party_runtime.party_action_production_authorities
      SET authority_state_version=1,authority_digest=$1
      WHERE party_id='party-a1' AND actor_ref='pc' AND context_ref='context-a1'`,
    [digest(authorityV1)]);

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
         AND item_id='ownership-stale-source') AS source_version,
      (SELECT count(*)::int FROM
       party_runtime.party_action_production_commits
       WHERE party_id='party-a1'
         AND request_id='ownership-stale') AS commits`)).rows[0],
    { party_version: 4, source_version: 1, commits: 0 });

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
    }), { code: 'ACTION_PRODUCED_ITEM_ACCESS_DENIED' });
    assert.deepEqual((await pool.query(`SELECT
      (SELECT state_version::int FROM party_runtime.parties
       WHERE party_id='party-a1') AS party_version,
      (SELECT quantity_numerator::int FROM party_runtime.party_resource_nodes
       WHERE party_id='party-a1' AND resource_node_id='resource-board') AS board,
      (SELECT quantity_numerator::int FROM party_runtime.party_resource_nodes
       WHERE party_id='party-a1' AND resource_node_id='resource-scrap') AS scrap`))
      .rows[0], { party_version: 4, board: 1, scrap: 2 });

    await pool.query(`UPDATE party_runtime.party_ownership
      SET owner_character_id='pc',owner_party=false
      WHERE party_id='party-a1' AND item_id='scrap'`);
    const compatibleMixed = await actionPlan(pool, {
      partyVersion: 4, changeSetId: 'change-mixed-compatible',
      requestId: 'mixed-compatible', actionRef: 'action-mixed-compatible',
      sources: ['board', 'scrap'], tools: ['axe'],
      mode: 'independent_outputs', outputCount: 1, decrement: 1,
      propertySource: 'board', allocationSources: ['board', 'scrap']
    });
    assert.equal((await committer.commit({ plan: await combinedPlan(
      compatibleMixed, 'mixed-compatible', 4) })).ok, true);
    assert.deepEqual((await pool.query(`SELECT
      (SELECT state_version::int FROM party_runtime.parties
       WHERE party_id='party-a1') AS party_version,
      (SELECT quantity_numerator::int FROM party_runtime.party_resource_nodes
       WHERE party_id='party-a1' AND resource_node_id='resource-board') AS board,
      (SELECT quantity_numerator::int FROM party_runtime.party_resource_nodes
       WHERE party_id='party-a1' AND resource_node_id='resource-scrap') AS scrap`))
      .rows[0], { party_version: 5, board: 0, scrap: 1 });

    await provisionProductionScope(pool);
    const loadedProfile = await loadLowerDvinaTraceA1Profile();
    let modelCalls = 0;
    const factory = createLowerDvinaTraceA1ProductionResolverFactory({
      pool, loadedProfile,
      actionProducedModel: async (request) => {
        modelCalls += 1;
        if (request.intended_transformation.includes('невозможный')) {
          return { ...structuredClone(request),
            schema: 'action_produced_result_plan_v1',
            identity_mode: 'no_useful_result', origin: null,
            output_class: null, result_class: 'no_useful_result',
            result_descriptor: { display_name: null,
              physical_description: null, qualitative_facts: [],
              inscription_text: null } };
        }
        if (request.intended_transformation.includes('официальную монету')) {
          return { ...structuredClone(request),
            schema: 'action_produced_result_plan_v1',
            identity_mode: 'preserve_source', origin: null,
            result_class: 'partial_transformation',
            result_descriptor: { display_name: null,
              physical_description: 'На ткани вырезан круг.',
              qualitative_facts: [], inscription_text: null },
            official_currency: true };
        }
        return { ...structuredClone(request),
          schema: 'action_produced_result_plan_v1',
          identity_mode: 'preserve_source', origin: null,
          result_class: 'partial_transformation',
          result_descriptor: { display_name: null,
            physical_description: 'Край ткани аккуратно подрезан.',
            qualitative_facts: ['на краю виден свежий ровный срез'],
            inscription_text: null } };
      }
    });
    const resolveProduction = factory({ partyId: 'party-a1',
      requestId: 'production-request' });

    const productionState = (await pool.query(`SELECT state
      FROM party_runtime.party_items
      WHERE party_id='party-a1' AND item_id='production-garment'`))
      .rows[0].state;
    const driftedStates = [
      (() => { const state = structuredClone(productionState);
        delete state.action_production_mechanics_snapshot; return state; })(),
      (() => { const state = structuredClone(productionState);
        state.action_production_mechanics_snapshot.mechanics
          .packing_slot_cost = 2; return state; })(),
      (() => { const state = structuredClone(productionState);
        state.action_production_mechanics_snapshot.mechanics.quantity.value = 2;
        return state; })(),
      (() => { const state = structuredClone(productionState);
        state.action_production_mechanics_snapshot.mechanics.container = {
          capacity: 1 }; return state; })()
    ];
    for (const state of driftedStates) {
      await pool.query(`UPDATE party_runtime.party_items SET state=$1::jsonb
        WHERE party_id='party-a1' AND item_id='production-garment'`,
      [JSON.stringify(state)]);
      await assert.rejects(resolveProduction(productionEnvelope()), {
        code: 'TRACE_A1_SOURCE_PROFILE_DENIED'
      });
      assert.equal(modelCalls, 0);
    }
    await pool.query(`UPDATE party_runtime.party_items SET state=$1::jsonb
      WHERE party_id='party-a1' AND item_id='production-garment'`,
    [JSON.stringify(productionState)]);

    for (const itemId of ['production-garment', 'production-knife']) {
      await pool.query(`UPDATE party_runtime.party_ownership
        SET owner_character_id=NULL,owner_party=true,claim_state='entrusted'
        WHERE party_id='party-a1' AND item_id=$1`, [itemId]);
      await assert.rejects(resolveProduction(productionEnvelope()), {
        code: 'ACTION_PRODUCED_ITEM_ACCESS_DENIED'
      });
      assert.equal(modelCalls, 0);
      await pool.query(`UPDATE party_runtime.party_ownership
        SET owner_character_id='pc',owner_party=false,claim_state='owned'
        WHERE party_id='party-a1' AND item_id=$1`, [itemId]);
    }

    const wrongCheck = productionEnvelope();
    wrongCheck.check_result = null;
    await assert.rejects(resolveProduction(wrongCheck), {
      code: 'TRACE_A1_SCOPE_INVALID'
    });
    const wrongActivity = productionEnvelope();
    wrongActivity.plan.activity.duration_class = 'brief';
    await assert.rejects(resolveProduction(wrongActivity), {
      code: 'TRACE_A1_SCOPE_INVALID'
    });
    assert.equal(modelCalls, 0);

    const impossibleEnvelope = productionEnvelope();
    impossibleEnvelope.request.remaining_intent =
      'Собираю невозможный для эпохи работающий механизм.';
    const impossible = await factory({ partyId: 'party-a1',
      requestId: 'production-impossible' })(impossibleEnvelope);
    assert.equal(impossible.action_production_atomic_write_plan.identity_mode,
      'no_useful_result');
    assert.deepEqual(impossible.action_production_atomic_write_plan
      .source_updates, []);
    assert.deepEqual(impossible.action_production_atomic_write_plan
      .result_items, []);
    assert.equal(modelCalls, 1);

    const authorityEnvelope = productionEnvelope();
    authorityEnvelope.request.remaining_intent =
      'Вырезаю официальную монету из ткани.';
    await assert.rejects(factory({ partyId: 'party-a1',
      requestId: 'production-authority' })(authorityEnvelope), {
      code: 'TURN_ACTION_PRODUCED_PLAN_INVALID'
    });
    assert.equal(modelCalls, 2);
    assert.equal((await pool.query(`SELECT count(*)::int AS count FROM
      party_runtime.party_action_production_commits
      WHERE request_id IN ('production-impossible','production-authority')`))
      .rows[0].count, 0);

    const production = await resolveProduction(productionEnvelope());
    assert.equal(modelCalls, 3);
    assert.deepEqual(production.action_production_atomic_write_plan
      .source_updates[0].after_item.state.runtime_instance_mechanics_snapshot
      .mechanics, loadedProfile.profile.source_profiles[0].mechanics);
    const productionCombined = await combinedPlan(
      production.action_production_atomic_write_plan, 'production', 5);
    assert.equal((await committer.commit({ plan: productionCombined })).ok,
      true);
    assert.deepEqual(await committer.commit({ plan: productionCombined }), {
      ok: true, replay: true,
      change_set_id: 'change:party-a1:turn-step:5'
    });
    const productionRows = (await pool.query(`SELECT
      (SELECT state_version::int FROM party_runtime.parties
       WHERE party_id='party-a1') AS party_version,
      (SELECT count(*)::int FROM party_runtime.party_action_production_commits
       WHERE party_id='party-a1' AND request_id='production-request') AS commits,
      (SELECT state->'action_production' FROM party_runtime.party_items
       WHERE party_id='party-a1' AND item_id='production-garment') AS source,
      (SELECT state_version::int FROM party_runtime.party_items
       WHERE party_id='party-a1' AND item_id='production-knife') AS tool_version`))
      .rows[0];
    assert.deepEqual(productionRows, { party_version: 6, commits: 1,
      source: { schema: 'rus.items.action_production_item_state.v1',
        causal_identity: production.action_production_atomic_write_plan
          .causal_identity,
        result_class: 'partial_transformation',
        output_class: 'ordinary_mundane',
        physical_facts: ['на краю виден свежий ровный срез'],
        inscription_text: null }, tool_version: 1 });
  });

async function actionPlan(pool, config) {
  const client = await pool.connect();
  try {
    const rootTurnId = `turn-${config.requestId}`;
    const contextRef = 'context-a1';
    const loaded = await loadActionProducedCommittedContext(client, {
      party_id: 'party-a1', actor_ref: 'pc', root_turn_id: rootTurnId,
      action_ref: config.actionRef, step_index: 1, context_ref: contextRef,
      expected_party_state_version: config.partyVersion,
      source_refs: config.sources, tool_refs: config.tools
    });
    const origin = config.mode === 'independent_outputs'
      ? 'direct_partition' : null;
    const resultClass = config.mode === 'no_useful_result'
      ? 'no_useful_result' : 'ordinary_physical_result';
    const semantic = {
      schema: 'action_produced_result_plan_v1', request_id: config.requestId,
      root_turn_id: rootTurnId, action_ref: config.actionRef, step_index: 1,
      committed_state_version: String(config.partyVersion),
      context_ref: contextRef, profile_ref: 'a1-profile', profile_version: '1',
      causal_mode: 'action_produced', actor_ref: 'pc',
      source_refs: config.sources, tool_refs: config.tools,
      identity_mode: config.mode, origin,
      intended_transformation: 'bounded physical transformation',
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
      resolveMechanics: (request) => ownerResolution(request, config)
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
  const finite = config.mode !== 'preserve_source'
    || config.sources[0].includes('rollback');
  const sourceEffects = request.source_inputs.map(({ entity_ref }) => ({
    source_ref: entity_ref,
    requested_decrement: finite
      ? { numerator: config.decrement
          ?? (config.mode === 'independent_outputs' ? 2 : 1),
        denominator: 1, unit: 'piece' } : null,
    mechanics_snapshot_after: config.mode === 'preserve_source'
      ? mechanics(request, config.actionRef) : null
  }));
  const outputCount = config.outputCount ?? 2;
  const allocationSources = config.allocationSources ?? [config.sources[0]];
  const outputs = config.mode !== 'independent_outputs' ? []
    : Array.from({ length: outputCount }, (_, index) => index + 1)
    .map((ordinal) => ({ ordinal,
      property_source_ref: config.propertySource ?? config.sources[0],
      mechanics_snapshot: mechanics(request, outputId(request, ordinal)),
      material_allocations: allocationSources.map((sourceRef) => ({
        source_ref: sourceRef,
        quantity: { numerator: 1, denominator: 1, unit: 'piece' }
      })) }));
  return { schema: 'rus.items.action_produced_owner_resolution.v1',
    identity_mode: config.mode, source_effects: sourceEffects, outputs,
    known_waste: [] };
}

function mechanics(request, operationRef) {
  return { schema: 'rus.items.runtime_instance_mechanics_snapshot.v1',
    version: 1, provenance: {
      source_kind: 'ordinary_direct_action_result',
      root_turn_id: request.causal_identity.root_turn_id,
      step_index: request.causal_identity.step_index,
      operation_ref: operationRef,
      origin_kind: request.origin ?? 'crafted',
      source_refs: request.source_inputs.map(({ entity_ref }) => entity_ref)
    }, mechanics: { mass_grams: 100, external_hand_cost: 0,
      carry_form: 'compact', packing_slot_cost: 1, quantity: null,
      container: null } };
}
function outputId(request, ordinal) {
  return `a1_result_${sha256({
    domain: 'rus.items.action_produced_output_identity.v1',
    root_turn_id: request.causal_identity.root_turn_id,
    action_ref: request.causal_identity.action_ref, ordinal
  }).slice(0, 32)}`;
}

async function combinedPlan(action, suffix, partyVersion,
  { missingClock = false } = {}) {
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
  const updates = [{ target_table: 'parties', id: 'party-a1',
    record: { party_id: 'party-a1', profile_bundle_digest: 'profiles' } },
  ...(missingClock ? [{ target_table: 'party_clocks', id: 'party-a1',
    record: { party_id: 'party-a1', whole_minutes: 0,
      subminute_numerator: 0, subminute_denominator: 1,
      clock_owner_kind: 'party', clock_owner_id: null,
      updated_change_set_id: changeSetId } }] : [])];
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
        ...actionProducedPhysicalKeys(action)
      ] }, action_production_atomic_write_plan: action,
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
  await pool.query(`INSERT INTO party_runtime.party_g5_nodes
    (party_id,g5_node_id,run_id,parent_g4_id,template_id,slot_key,state)
    VALUES ('party-a1','legacy-g5','run-a1','g4','g5-template','main','{}')`);
  await pool.query(`INSERT INTO party_runtime.party_g5_anchors
    (party_id,anchor_id,g5_node_id,template_id,slot_key,item_capacity)
    VALUES ('party-a1','output-anchor','legacy-g5','anchor-template','ground',8)`);
  await pool.query(`INSERT INTO party_runtime.party_positions
    (party_id,g4_id,g5_node_id,g5_anchor_id)
    VALUES ('party-a1','g4','legacy-g5','output-anchor')`);
  const authorityInput = authorityFixture();
  await pool.query(`INSERT INTO
    party_runtime.party_action_production_authorities
    (party_id,actor_ref,context_ref,profile_ref,profile_version,policy_ref,
     policy_version,max_new_entities,allowed_access_states,
     allowed_identity_modes,allowed_origins,allowed_result_classes,
     authority_state_version,status,authority_digest)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,
      $12::jsonb,$13,$14,$15)`, [...Object.values(authorityInput).slice(0, 8),
    JSON.stringify(authorityInput.allowed_access_states),
    JSON.stringify(authorityInput.allowed_identity_modes),
    JSON.stringify(authorityInput.allowed_origins),
    JSON.stringify(authorityInput.allowed_result_classes),
    authorityInput.authority_state_version, authorityInput.status,
    digest(authorityInput)]);
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
    await pool.query(`INSERT INTO party_runtime.party_items
      (party_id,item_id,run_id,template_id,profile_id,category_id,quantity,
       condition_state,legal_status,state,state_version)
      VALUES ('party-a1',$1,'run-a1',$2,'profile','ordinary',1,
        'serviceable','owned',$3::jsonb,1)`, [item, `template:${item}`,
      JSON.stringify({ lifecycle_status: 'active',
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

function authorityFixture(authorityStateVersion = 1) {
  return { party_id: 'party-a1', actor_ref: 'pc',
    context_ref: 'context-a1', profile_ref: 'a1-profile',
    profile_version: '1', policy_ref: 'a1-policy', policy_version: 1,
    max_new_entities: 4, allowed_access_states: ['immediate'],
    allowed_identity_modes: ['preserve_source', 'independent_outputs',
      'no_useful_result'], allowed_origins: ['direct_partition', 'crafted'],
    allowed_result_classes: ['ordinary_physical_result',
      'no_useful_result'], authority_state_version: authorityStateVersion,
    status: 'committed' };
}

function productionEnvelope() {
  const plan = { resolution: 'generic_check',
    activity: { owner: 'semantic', duration_class: 'short', effort: 'light' },
    check: { attribute_ref: 'dexterity', skill_ref: null,
      difficulty_id: 'standard' } };
  return { operation: { op: 'request_item_use', actor_ref: 'pc',
      item_ref: 'production-garment', use_kind: 'other',
      target_refs: ['production-knife'] }, plan,
    request: { root_turn_id: 'turn-production', step_index: 1,
      committed_state_version: 5,
      remaining_intent: 'Подрезаю край одежды своим ножом.' },
    actor: { actor_id: 'pc' }, working_projection: {},
    committed_state: { party_state: { turn_number: 4 } },
    check_result: { check_id: 'turn-production:step:1', roll: 12,
      outcome: { band: 'success' } } };
}

async function provisionProductionScope(pool) {
  const loaded = await loadLowerDvinaTraceA1Profile();
  const profile = loaded.profile;
  const authority = { party_id: 'party-a1', actor_ref: 'pc',
    context_ref: profile.context_ref, profile_ref: profile.profile_id,
    profile_version: String(profile.revision), policy_ref: profile.policy_ref,
    policy_version: profile.policy_version,
    max_new_entities: profile.max_new_entities,
    allowed_access_states: profile.allowed_access_states,
    allowed_identity_modes: profile.allowed_identity_modes,
    allowed_origins: profile.allowed_origins,
    allowed_result_classes: profile.allowed_result_classes,
    authority_state_version: 1, status: 'committed' };
  await pool.query(`INSERT INTO party_runtime.party_action_production_authorities
    (party_id,actor_ref,context_ref,profile_ref,profile_version,policy_ref,
     policy_version,max_new_entities,allowed_access_states,
     allowed_identity_modes,allowed_origins,allowed_result_classes,
     authority_state_version,status,authority_digest)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,
      $12::jsonb,$13,$14,$15)`, [...Object.values(authority).slice(0, 8),
    JSON.stringify(authority.allowed_access_states),
    JSON.stringify(authority.allowed_identity_modes),
    JSON.stringify(authority.allowed_origins),
    JSON.stringify(authority.allowed_result_classes), 1, 'committed',
    digest(authority)]);
  for (const [itemId, itemProfile, physicalPosition, equipmentSlot] of [
    ['production-garment', profile.source_profiles[0], 'equipped',
      'outer_garment'],
    ['production-knife', profile.tool_profiles[0], 'worn_quick', null]
  ]) {
    const inventory = { inventory_profile_id: itemProfile.inventory_profile_id,
      mass_grams: itemProfile.mechanics.mass_grams,
      external_hand_cost: itemProfile.mechanics.external_hand_cost,
      carry_form: itemProfile.mechanics.carry_form };
    const mechanics = { schema:
        'rus.items.action_production_committed_mechanics_snapshot.v1',
      profile_ref: profile.profile_id, profile_version: '1',
      template_id: itemProfile.template_id,
      inventory_profile_id: itemProfile.inventory_profile_id,
      mechanics: itemProfile.mechanics };
    await pool.query(`INSERT INTO party_runtime.party_items
      (party_id,item_id,run_id,template_id,profile_id,category_id,quantity,
       condition_state,legal_status,state,state_version)
      VALUES ('party-a1',$1,'run-a1',$2,$3,'ordinary',1,'serviceable',
        'owned',$4::jsonb,1)`, [itemId, itemProfile.template_id,
      itemProfile.inventory_profile_id, JSON.stringify({ lifecycle_status:
        'active', inventory_profile_snapshot: inventory,
        action_production_mechanics_snapshot: mechanics })]);
    await pool.query(`INSERT INTO party_runtime.party_item_placements
      (party_id,item_id,holder_character_id,physical_position,
       equipment_slot_category_id)
      VALUES ('party-a1',$1,'pc',$2,$3)`, [itemId, physicalPosition,
      equipmentSlot]);
    await pool.query(`INSERT INTO party_runtime.party_ownership
      (party_id,ownership_id,item_id,owner_character_id,owner_party,
       controller_character_id,claim_state)
      VALUES ('party-a1',$1,$2,'pc',false,'pc','owned')`,
    [`ownership:${itemId}`, itemId]);
  }
}
