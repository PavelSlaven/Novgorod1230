import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
} from '../../../test/spatial-v3/presence-rules-production-e2e-fixture.js';

const root = new URL('../../../', import.meta.url);
const familyPath = 'data/world-catalogs/novgorod/temporal-v4/datasets/body_time_effect_profiles_thresholds.json';
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const records = readJson(familyPath);
const approval = readJson('data/world-catalogs/novgorod/temporal-v4/approvals/body_time_effect_profiles_thresholds.json');
const record = (id) => {
  const selected = records.find(({ payload }) => payload.body_effect_profile_id === id);
  assert.ok(selected, `approved body profile ${id}`);
  assert.equal(selected.status, 'approved');
  assert.ok(approval.record_ids.includes(selected.record_id));
  return selected.payload;
};
const satiety = record('satiety_hourly_spend_v2');
const awake = record('energy_awake_spend_v2');
const starvation = record('starvation_health_harm_v2');

// Expectations come from approved data, never from v17's fixed effort deltas:
// familyPath:49-63 (satiety rate), :211-227 (awake rate), :497-513 (starvation).
const rational = ({ numerator, denominator }) => [BigInt(numerator), BigInt(denominator)];
const decimal = (value) => {
  const text = String(value);
  assert.match(text, /^-?\d+(?:\.\d+)?$/, 'body metric must be an exact decimal');
  const digits = text.split('.')[1]?.length ?? 0;
  return [BigInt(text.replace('.', '')), 10n ** BigInt(digits)];
};
const subtract = ([an, ad], [bn, bd]) => [an * bd - bn * ad, ad * bd];
const multiply = ([an, ad], [bn, bd]) => [an * bn, ad * bd];
const equalRational = (actual, expected, message) => assert.equal(
  actual[0] * expected[1], expected[0] * actual[1],
  `${message}; actual=${actual.join('/')} expected=${expected.join('/')}`,
);
const rate = (profile, key) => rational(profile.exact_rate_or_piecewise_rule[key]);
const spend = (profile, key, minutes, intensity = 'rest_or_ordinary_activity') => {
  const intensityRow = profile.activity_intensity_applicability.find(
    ({ intensity_id }) => intensity_id === intensity);
  assert.ok(intensityRow, `approved intensity ${intensity}`);
  return multiply(multiply(rate(profile, key), [BigInt(minutes), 60n]),
    rational(intensityRow.multiplier));
};
const metricDelta = (before, after, metric) => subtract(decimal(before.body[metric]), decimal(after.body[metric]));
const clockValue = ({ whole_minutes, subminute_numerator, subminute_denominator }) => [
  BigInt(whole_minutes) * BigInt(subminute_denominator) + BigInt(subminute_numerator),
  BigInt(subminute_denominator),
];
const elapsed = (before, after) => subtract(clockValue(after.clock), clockValue(before.clock));
const minutesTo = (value, target, profile) => {
  const [dn, dd] = subtract(decimal(value), decimal(target));
  const [rn, rd] = rate(profile, 'base_spend_points_per_hour');
  const numerator = dn * rd * 60n;
  const denominator = dd * rn;
  assert.equal(numerator % denominator, 0n, 'this pinned start must reach the threshold at a whole minute');
  const minutes = Number(numerator / denominator);
  assert.ok(Number.isSafeInteger(minutes) && minutes > 0);
  return minutes;
};

async function readState(env, runtime, partyId) {
  const body = (await env.partyPool.query(
    `SELECT health::text,energy::text,satiety::text,state_version::text
       FROM party_runtime.party_actor_body_states
      WHERE party_id=$1 AND actor_kind='player_character'`, [partyId])).rows;
  assert.equal(body.length, 1, 'one authoritative player body row');
  const clock = (await env.partyPool.query(
    `SELECT whole_minutes::text,subminute_numerator::text,subminute_denominator::text
       FROM party_runtime.party_clocks WHERE party_id=$1`, [partyId])).rows[0];
  assert.ok(clock, 'authoritative clock row');
  const snapshot = (await env.partyPool.query(
    `SELECT snapshot.state_payload
       FROM party_runtime.parties party
       JOIN party_runtime.party_state_snapshots snapshot
         ON snapshot.party_id=party.party_id AND snapshot.state_version=party.state_version
      WHERE party.party_id=$1`, [partyId])).rows[0]?.state_payload;
  assert.ok(snapshot, 'committed current snapshot');
  const screen = (await runtime.getPartyScreen(partyId)).screen;
  const panel = screen.panels?.character;
  assert.equal(panel?.visible, true, 'body is visible in the character panel');
  const snapshotBody = snapshot.schema === 'rus.authored_start_initial_party_snapshot.v3'
    ? snapshot.persisted_projection.body : snapshot.body_state;
  assert.ok(snapshotBody, 'the actual initial/turn snapshot contains its persisted body');
  for (const metric of ['health', 'energy', 'satiety']) {
    equalRational(decimal(snapshotBody[metric]), decimal(body[0][metric]),
      `snapshot and SQL agree on ${metric}`);
    equalRational(decimal(panel.data[metric]), decimal(body[0][metric]),
      `character screen and SQL agree on ${metric}`);
  }
  return { body: body[0], clock, snapshot, panel: panel.data };
}

function activityPlan(request, command) {
  return {
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: command.attempt, adaptation: 'literal' },
    resolution: 'direct', goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'extended', effort: command.effort,
      requested_duration_minutes: command.minutes },
    operation_choice: null, operations: [], check: null, continuation: null,
    clarification: null, direct_result_kind: null,
    reason_code: 'ordinary_semantic_activity', reason: 'Выполнить указанное действие.',
  };
}

function checkPlan(request) {
  const attribute = ['strength', 'endurance'].find((key) =>
    Number.isFinite(request.actor?.attributes?.[key]?.value));
  assert.ok(attribute, 'production actor must supply a body-sensitive physical attribute');
  const outcome = { goal_result: 'achieved', additional_activity: null,
    operations: [], continuation: null };
  return {
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: 'Пробую удержать равновесие.', adaptation: 'literal' },
    resolution: 'generic_check', goal_result: 'pending',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    operation_choice: null, operations: [],
    check: { purpose: 'удержать равновесие', attribute_ref: attribute,
      skill_ref: null, difficulty_id: 'ordinary',
      outcomes: Object.fromEntries(['clean_success', 'success', 'success_with_cost',
        'failure_with_consequence', 'severe_failure'].map((band) => [band, structuredClone(outcome)])) },
    continuation: null, clarification: null, direct_result_kind: null,
    reason_code: 'generic_check', reason: 'Проверка физического усилия.',
  };
}

test('v17 production body needs follow the approved Temporal rates and hunger thresholds',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t, { postgresProfile: 'canonical-acceptance' });
    let command = null;
    const restoreFetch = installPresenceProductionE2eFetch({
      turnStepPlanner: async ({ request }) => {
        assert.ok(command, 'every provider response belongs to the current public turn');
        assert.equal(request.root_player_action, command.rawText);
        return command.check ? checkPlan(request) : activityPlan(request, command);
      },
    });
    t.after(restoreFetch);
    let { runtime } = await createPresenceProductionRoot(env);
    t.after(() => runtime.close());
    let sequence = 0;
    const newParty = async (name) => {
      const opening = await runtime.startNewGame({ scenario_id: 'novgorod_pine_ridge_approach_v1',
        request_id: `body-needs-v17:start:${name}` });
      assert.equal(opening.screen.schema, 'first_game_screen');
      await runtime.acknowledgeOpening(opening.party_id, { client_ack_id: `body-needs-v17:ack:${name}` });
      return opening.party_id;
    };
    const turn = async (caseT, partyId, input) => {
      command = input;
      const before = await readState(env, runtime, partyId);
      await runtime.submitTurn(partyId, { raw_text: input.rawText,
        request_id: `body-needs-v17:turn:${sequence++}` });
      const after = await readState(env, runtime, partyId);
      caseT.diagnostic(JSON.stringify({ schema: 'body-needs-v17-observation/v1',
        input: input.rawText, requested_minutes: input.minutes ?? null,
        elapsed: elapsed(before, after).map(String), before: before.body, after: after.body,
        screen: Object.fromEntries(['health', 'energy', 'satiety'].map((key) => [key, after.panel[key]])),
        check_state_modifier: after.snapshot.last_turn?.turn_step_commit?.checks?.results?.[0]?.modifiers?.state ?? null,
      }));
      return { before, after };
    };
    const wait = (minutes) => ({ rawText: `Жду на месте ${minutes} минут.`,
      attempt: 'Жду на месте.', minutes, effort: 'none' });
    const work = (minutes) => ({ rawText: `Выполняю тяжёлую работу: приседаю ${minutes} минут.`,
      attempt: 'Выполняю тяжёлую работу: приседаю.', minutes, effort: 'heavy' });

    await t.test('bootstrap imports all four exact approved body-time records', async () => {
      assert.equal(approval.status, 'approved');
      const imported = (await env.worldPool.query(
        `SELECT record_id,status,payload FROM world_base.temporal_authoring_records
          WHERE family_id=$1 ORDER BY record_id`, [approval.family_id])).rows;
      assert.deepEqual(imported.map(({ record_id }) => record_id), [...approval.record_ids].sort());
      for (const row of imported) {
        assert.equal(row.status, 'approved');
        assert.deepEqual(row.payload, records.find(({ record_id }) => record_id === row.record_id).payload);
      }
    });

    // Nine hours makes every expected rate delta a finite decimal. No invented
    // epsilon, binary-float calculation or database rounding policy is needed.
    const minutes = 540;
    let waiting;
    let working;
    await t.test('multi-hour waiting spends satiety by exact elapsed time', async (caseT) => {
      const partyId = await newParty('wait');
      const { before, after } = await turn(caseT, partyId, wait(minutes));
      waiting = { before, after };
      equalRational(elapsed(before, after), [BigInt(minutes), 1n], 'wait commits the requested time');
      equalRational(metricDelta(before, after, 'satiety'), spend(satiety, 'base_spend_points_per_hour', minutes),
        `${familyPath}:49 ordinary waiting spends satiety`);
    });
    await t.test('multi-hour waiting spends awake energy by exact elapsed time', async () => {
      assert.ok(waiting, 'the preceding public wait must reach committed readback');
      const { before, after } = waiting;
      equalRational(metricDelta(before, after, 'energy'), spend(awake, 'base_spend_points_per_hour', minutes),
        `${familyPath}:211 ordinary waiting spends awake energy`);
    });

    await t.test('heavy work spends more satiety by the approved 3/2 multiplier', async (caseT) => {
      const partyId = await newParty('heavy');
      const { before, after } = await turn(caseT, partyId, work(minutes));
      working = { before, after };
      equalRational(elapsed(before, after), [BigInt(minutes), 1n], 'heavy work commits the requested time');
      equalRational(metricDelta(before, after, 'satiety'),
        spend(satiety, 'base_spend_points_per_hour', minutes, 'heavy_activity'),
        `${familyPath}:42 heavy work spends satiety at the approved intensity`);
    });
    await t.test('heavy work spends awake energy by the approved 3/2 multiplier', async () => {
      assert.ok(working, 'the preceding public heavy work must reach committed readback');
      const { before, after } = working;
      equalRational(metricDelta(before, after, 'energy'),
        spend(awake, 'base_spend_points_per_hour', minutes, 'heavy_activity'),
        `${familyPath}:201 heavy work spends awake energy at the approved intensity`);
    });

    await t.test('satiety 50 is unpenalized and a subsequent crossing below 49 penalizes a real check', async (caseT) => {
      const partyId = await newParty('threshold-50');
      const initial = await readState(env, runtime, partyId);
      const to50 = minutesTo(initial.body.satiety, '50', satiety);
      const { before, after } = await turn(caseT, partyId, wait(to50));
      equalRational(elapsed(before, after), [BigInt(to50), 1n], 'wait reaches exact 50 boundary');
      equalRational(decimal(after.body.satiety), [50n, 1n], `${familyPath}:65 satiety must reach exactly 50`);
      const check = { rawText: 'Пробую удержать равновесие.', check: true };
      const normal = await turn(caseT, partyId, check);
      assert.equal(normal.after.snapshot.last_turn.turn_step_commit.checks.results[0].modifiers.state, 0,
        `${familyPath}:67 exactly 50 must not penalize a check`);
      await turn(caseT, partyId, wait(216));
      const below = await readState(env, runtime, partyId);
      assert.ok(Number(below.body.satiety) >= 21 && Number(below.body.satiety) <= 49,
        'the subsequent committed body reaches the approved -1 band');
      const penalized = await turn(caseT, partyId, check);
      assert.equal(penalized.after.snapshot.last_turn.turn_step_commit.checks.results[0].modifiers.state, -1,
        `${familyPath}:73 low satiety must penalize the production check`);
    });

    await t.test('satiety zero activates health harm only for elapsed time after the zero boundary', async (caseT) => {
      const partyId = await newParty('starvation');
      const initial = await readState(env, runtime, partyId);
      const toZero = minutesTo(initial.body.satiety, '0', satiety);
      const { before, after } = await turn(caseT, partyId, wait(toZero));
      equalRational(elapsed(before, after), [BigInt(toZero), 1n], 'wait reaches the starvation boundary');
      equalRational(decimal(after.body.satiety), [0n, 1n], `${familyPath}:498 starvation activates at satiety zero`);
      equalRational(decimal(after.body.health), decimal(before.body.health),
        `${familyPath}:508 no starvation harm before reaching zero`);
      const starving = await turn(caseT, partyId, wait(minutes));
      const time = elapsed(starving.before, starving.after);
      assert.ok(time[0] > 0n && time[0] <= BigInt(minutes) * time[1],
        'starvation uses actual committed elapsed, including any body interruption');
      equalRational(decimal(starving.after.body.satiety), [0n, 1n], 'satiety remains clamped at zero');
      equalRational(metricDelta(starving.before, starving.after, 'health'),
        multiply(rate(starvation, 'base_harm_points_per_hour'), multiply(time, [1n, 60n])),
        `${familyPath}:499 only time after satiety zero spends health`);
    });

    await t.test('committed body and character panel survive a production-root reload', async (caseT) => {
      const partyId = await newParty('reload');
      const { after } = await turn(caseT, partyId, work(minutes));
      await runtime.close();
      ({ runtime } = await createPresenceProductionRoot(env));
      const reloaded = await readState(env, runtime, partyId);
      assert.deepEqual(reloaded.body, after.body);
      assert.deepEqual(reloaded.clock, after.clock);
      assert.deepEqual(reloaded.panel, after.panel);
    });
  });
