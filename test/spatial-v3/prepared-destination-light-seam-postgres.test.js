import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
} from './presence-rules-production-e2e-fixture.js';
import { PRESENCE_E2E_MOVE_TEXT } from './presence-rules-production-e2e-fixture.js';
import { turnStepOperationChoices } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-turn-step-operation-choices.js';

const start = JSON.parse(readFileSync(new URL(
  '../../data/world-catalogs/novgorod/live-world-runtime-v17/additional-start-artifacts/novgorod_vikhtuy_work_storage_v1.start.json',
  import.meta.url)));
const daylight = JSON.parse(readFileSync(new URL(
  '../../data/world-catalogs/novgorod/temporal-v4/datasets/calendar_daylight_light_profiles.json',
  import.meta.url)))[0].payload.daylight_boundary_rules.year_daily_boundaries;
const connectionBindings = JSON.parse(readFileSync(new URL(
  '../../data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_canonical_g5_connection_bindings.json',
  import.meta.url)));
const connectionLabels = JSON.parse(readFileSync(new URL(
  '../../data/world-catalogs/novgorod/m2c-canonical-connection-labels/candidate.json',
  import.meta.url))).labels;
const g5 = (name) => `cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_${name}`;
const passageBinding = (from, to) => {
  const binding = connectionBindings.find((row) =>
    row.from_canonical_g5_id === g5(from) && row.to_canonical_g5_id === g5(to)
      && row.status === 'approved');
  assert.ok(binding, `approved connection ${from} -> ${to}`);
  return binding;
};
const passage = (from, to) => {
  const binding = passageBinding(from, to);
  const label = connectionLabels.find((row) => row.binding_ref.id === binding.id);
  assert.ok(label, `approved label for ${from} -> ${to}`);
  return label.display_label;
};

async function location(partyPool, partyId) {
  return (await partyPool.query(
    `SELECT site.id AS site_id,
            COALESCE(site.canonical_g5_ref->>'entity_id', site.canonical_g5_ref->>'id') AS g5,
            pos.id AS position_id, pos.template_slot_key AS slot
       FROM party_runtime.party_journey_locations loc
       JOIN party_runtime.scene_position_nodes pos ON pos.party_id=loc.party_id AND pos.id=loc.scene_position_id
       JOIN party_runtime.party_g6_instances g6 ON g6.party_id=pos.party_id AND g6.id=pos.g6_instance_id
       JOIN party_runtime.party_scene_baselines base ON base.party_id=g6.party_id AND base.id=g6.scene_baseline_id
       JOIN party_runtime.party_g5_sites site ON site.party_id=base.party_id AND site.id=base.host_id
      WHERE loc.party_id=$1 AND loc.owner_kind='actor'`, [partyId])).rows[0];
}

async function clock(partyPool, partyId) {
  return (await partyPool.query(
    `SELECT whole_minutes::text, subminute_numerator::text, subminute_denominator::text
       FROM party_runtime.party_clocks WHERE party_id=$1`, [partyId])).rows[0];
}

async function committedSnapshot(partyPool, partyId) {
  return (await partyPool.query(
    `SELECT snapshot.state_payload
       FROM party_runtime.parties party
       JOIN party_runtime.party_state_snapshots snapshot
         ON snapshot.party_id=party.party_id AND snapshot.state_version=party.state_version
      WHERE party.party_id=$1`, [partyId])).rows[0]?.state_payload;
}

const visibleNpcIds = (context) => (context?.visible_npc ?? [])
  .map(({ entity_ref: ref }) => ref?.entity_id).filter(Boolean).sort();

const plan = (request, fields, groundedAttempt = request.root_player_action) => ({
  interpretation: { player_goal: request.root_player_action,
    grounded_attempt: groundedAttempt, adaptation: 'literal' },
  check: null, continuation: null, clarification: null, direct_result_kind: null,
  reason_code: 'test_fixture_plan', reason: 'Исполнение фиксированного семантического случая.',
  ...fields,
});

test('TODO LW-128 exit-one-action: prepared destination visibility uses the root post-turn clock across sunset and after restart',
  { timeout: 1_800_000,
    skip: 'Continuation route operation generation is pending exit-one-action (LW-128).' }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const sunset = Number(daylight['1230']['07-01'].sunset_minute_of_day);
    const crossingLabel = passage('forest_path', 'meeting_area');
    const crossingRef = passageBinding('forest_path', 'meeting_area').id;
    let waitMinutes = null;
    let waitPlanned = false;
    const restoreFetch = installPresenceProductionE2eFetch({
      movementPrefs: { exactMovement: true },
      turnStepPlanner: async ({ request }) => {
        if (!waitPlanned && request.remaining_intent.startsWith('Жду ')) {
          waitPlanned = true;
          assert.ok(Number.isInteger(waitMinutes) && waitMinutes > 0);
          return plan(request, { resolution: 'direct', goal_result: 'pending',
            activity: { owner: 'semantic', duration_class: 'extended', effort: 'none',
              requested_duration_minutes: waitMinutes }, operations: [],
            continuation: { remaining_intent: 'Иду по видимому пути.', depends_on_refs: [] }
          }, 'Ожидаю на месте.');
        }
        if (waitPlanned && request.remaining_intent === 'Иду по видимому пути.') {
          const choices = turnStepOperationChoices(request);
          const printableChoices = choices.map(({ choice_id, operation }) => ({ choice_id,
            op: operation.op, movement_kind: operation.movement_kind ?? null,
            target_ref: operation.target_ref ?? null, route_ref: operation.route_ref ?? null,
            description: operation.description ?? null }));
          const pick = choices.find(({ operation }) =>
            operation.op === 'request_movement'
              && operation.movement_kind === 'route'
              && operation.target_ref === crossingRef
              && operation.route_ref === crossingRef);
          assert.ok(pick, `approved passage ref is offered: ${crossingRef}; choices: ${JSON.stringify(printableChoices)}`);
          return plan(request, { resolution: 'domain_request', goal_result: 'pending',
            activity: { owner: 'domain', duration_class: null, effort: null },
            operation_family: pick.operation.op, operation_choice: pick.choice_id,
            reason_code: 'visible_movement', reason: 'Выбран видимый проход.' });
        }
        return null;
      },
    });
    t.after(() => restoreFetch());
    let { runtime, readCurrentVisibleContext } = await createPresenceProductionRoot(env);
    t.after(() => runtime.close());
    const restart = async () => {
      await runtime.close();
      ({ runtime, readCurrentVisibleContext } = await createPresenceProductionRoot(env));
    };
    const readbackReaderCalls = [];
    const visibilityRepository = () => createLowerDvinaTracePhase2PostgresRepository({
      partyPool: env.partyPool, readCurrentVisibleContext: async (input) => {
        readbackReaderCalls.push({ positionId: input.positionId,
          clock: structuredClone(input.clock), stateClock: structuredClone(input.state?.clock) });
        return readCurrentVisibleContext(input);
      },
      committer: { async commit() { throw new Error('read-only'); } },
    });
    const opening = await runtime.startNewGame({ scenario_id: start.scenario_id,
      request_id: 'light-seam-start' });
    const partyId = opening.party_id;
    await runtime.acknowledgeOpening(partyId, { client_ack_id: 'light-seam-ack' });
    let step = 0;
    const turn = (rawText) => runtime.submitTurn(partyId, { raw_text: rawText,
      request_id: `light-seam-${step++}` });

    async function walkTo(to) {
      const from = (await location(env.partyPool, partyId)).g5.replace(g5(''), '');
      const label = passage(from, to);
      let response;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const current = await location(env.partyPool, partyId);
        if (current.g5.replace(g5(''), '') !== from) break;
        response = await turn(current.slot === 'departure' ? label : `${label} — подход`);
      }
      const arrived = await location(env.partyPool, partyId);
      assert.equal(arrived.g5, g5(to), `${from} -> ${to}`);
      assert.equal(arrived.slot, 'arrival');
      return response;
    }

    await walkTo('water_access');
    await walkTo('forest_path');
    await walkTo('meeting_area');
    await walkTo('forest_path');
    for (let attempt = 0; attempt < 4
      && (await location(env.partyPool, partyId)).slot !== 'departure'; attempt += 1) {
      await turn(`${passage('forest_path', 'meeting_area')} — подход`);
    }
    assert.equal((await location(env.partyPool, partyId)).slot, 'departure');

    const beforeWait = await clock(env.partyPool, partyId);
    const minuteOfDay = Number(BigInt(beforeWait.whole_minutes) % 1440n);
    waitMinutes = sunset - minuteOfDay;
    assert.ok(waitMinutes > 0, 'the approved route reaches departure before July sunset');
    const beforeScreen = (await runtime.getPartyScreen(partyId)).screen;
    assert.equal(beforeScreen.visible_context?.current_light_phase, 'daylight');

    const crossing = await turn(`Жду ${waitMinutes} минут, затем иду по видимому пути: ${crossingLabel}.`);
    assert.equal(waitPlanned, true, 'the wait continuation is admitted before passage selection');
    const destination = await location(env.partyPool, partyId);
    assert.equal(destination.g5, g5('meeting_area'), 'the approved passage was executed');
    assert.equal(destination.slot, 'arrival');
    const persisted = await committedSnapshot(env.partyPool, partyId);
    const movement = persisted?.last_turn?.turn_step_commit?.time_update
      ?.prepared_effect_ledger?.slices?.find(({ operation_ref }) => operation_ref === 'request_movement');
    assert.equal(movement?.consequence?.position_transition?.destination_site_id,
      destination.site_id, 'SQL snapshot stores the committed destination movement');
    const afterClock = await clock(env.partyPool, partyId);
    const afterScreen = crossing.screen;
    assert.equal(afterScreen.visible_context?.current_light_phase, 'civil_dusk',
      'prepared destination package uses light after the committed route duration');
    const packageId = afterScreen.current_projection_anchor?.package_id;
    const packageRow = (await env.partyPool.query(
      `SELECT visible_payload FROM party_runtime.party_visible_packages
        WHERE party_id=$1 AND package_id=$2`, [partyId, packageId])).rows[0];
    assert.equal(packageRow?.visible_payload?.current_light_phase, 'civil_dusk');
    const state = await visibilityRepository().loadPhase2State(partyId);
    const committedReaderCall = readbackReaderCalls.at(-1);
    assert.equal(committedReaderCall?.positionId, destination.position_id,
      'phase-2 readback invokes the production visibility reader at the destination');
    assert.deepEqual(committedReaderCall?.stateClock, afterClock,
      'phase-2 readback reader receives state at the committed after-clock');
    const daylightVisible = await readCurrentVisibleContext({ partyId,
      actorId: state.actor_id, positionId: destination.position_id, clock: beforeWait });
    const duskVisible = await readCurrentVisibleContext({ partyId,
      actorId: state.actor_id, positionId: destination.position_id, clock: afterClock });
    const daylightIds = visibleNpcIds(daylightVisible);
    const duskIds = visibleNpcIds(duskVisible);
    assert.ok(daylightIds.length > 0, 'the destination fixture has visible NPCs');
    assert.deepEqual(duskIds, daylightIds, 'same committed destination NPCs are independently read');
    assert.ok(daylightVisible.visible_npc.some((npc) => npc.observable_cues),
      'daylight makes a destination NPC clearly visible');
    assert.ok(duskVisible.visible_npc.every((npc) => !npc.observable_cues),
      'civil dusk changes destination NPC visibility to partial');
    assert.notDeepEqual(daylightVisible.visible_npc, duskVisible.visible_npc,
      'same destination has different player-visible NPC projection across sunset');
    assert.deepEqual(packageRow.visible_payload.visible_npcs, duskVisible.visible_npc,
      'SQL package matches the independent owner read under the committed clock');
    assert.deepEqual(afterScreen.visible_context?.visible_npc, duskVisible.visible_npc,
      'prepared package matches the independent owner read under the committed clock');
    assert.deepEqual(visibleNpcIds(afterScreen.visible_context), packageRow.visible_payload.visible_npcs
      .map(({ entity_ref: ref }) => ref?.entity_id).filter(Boolean).sort());

    await restart();
    const replay = (await runtime.getPartyScreen(partyId)).screen;
    assert.deepEqual(await clock(env.partyPool, partyId), afterClock);
    assert.equal(replay.visible_context?.current_light_phase, 'civil_dusk');
    const readerCallsBeforeRestartReadback = readbackReaderCalls.length;
    const restartedState = await visibilityRepository().loadPhase2State(partyId);
    const restartReaderCalls = readbackReaderCalls.slice(readerCallsBeforeRestartReadback);
    const restartReaderCall = restartReaderCalls.find(({ positionId }) =>
      positionId === destination.position_id);
    assert.ok(restartReaderCall,
      'restart phase-2 readback invokes the production visibility reader at the destination');
    assert.deepEqual(restartReaderCall.stateClock, afterClock,
      'restart reader receives the persisted after-clock');
    assert.deepEqual(visibleNpcIds(restartedState.current_visible_context), duskIds,
      'independent production readback after restart matches committed dusk visibility');
    assert.deepEqual(restartedState.current_visible_context.visible_npc,
      duskVisible.visible_npc,
      'restart readback matches the complete independent dusk projection, including observable cues');
    assert.deepEqual(replay.visible_context?.visible_npc, duskVisible.visible_npc,
      'restart screen preserves the independently verified destination visibility');
  });
