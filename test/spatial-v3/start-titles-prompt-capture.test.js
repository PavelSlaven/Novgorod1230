import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import test from 'node:test';
import { bootstrapV17PresenceE2e, createPresenceProductionRoot,
  installPresenceProductionE2eFetch } from './presence-rules-production-e2e-fixture.js';
import { identifyLlmTestRole } from './llm-test-role.js';
import { readPinnedArtifact } from '../../apps/game-server/src/internal/live-world-authored-starts.js';
import { loadApprovedPlaceLabels } from '../../data/world-catalogs/novgorod/m2c-place-labels/approved-labels.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const MANIFEST = 'data/world-catalogs/novgorod/live-world-runtime-v17/target-starts-manifest.v1.json';
const NATURAL_PLACEMENT = 'data/world-catalogs/novgorod/m2c-natural-placement/scene-template-v2-successor-candidate.json';
const CONNECTION_BINDINGS = 'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_canonical_g5_connection_bindings.json';
const CONNECTION_LABELS = 'data/world-catalogs/novgorod/m2c-canonical-connection-labels/candidate.json';
const OUT = resolve(ROOT, '../../fleet/tasks/start-titles-fix/out/prompt-review-payloads');
const json = async (path) => JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));
const phase = await readFile(join(OUT, 'phase.txt'), 'utf8').then((value) => value.trim()).catch(() => null);

function roleOf(call) {
  const content = call.messages?.find((message) => message.role === 'user')?.content;
  let input;
  try { input = JSON.parse(content); } catch { input = null; }
  if (input?.сцена && typeof input.сцена.граница === 'string') {
    if (Object.hasOwn(input, 'отклонённая_проза')) return 'gameplay_narrator_semantic_repair';
    if (Object.hasOwn(input, 'проверяемая_проза')) return 'gameplay_narrator_auditor';
    return 'gameplay_narrator';
  }
  if (input?.schema === 'narration_request') return 'gameplay_narrator_turn';
  if (input?.schema === 'narration_semantic_audit_request') return 'gameplay_narrator_auditor_turn';
  return identifyLlmTestRole(call) ?? 'unclassified';
}

const g5 = (name) => `cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_${name}`;
const passageLabel = async (from, to) => {
  const bindings = await json(CONNECTION_BINDINGS);
  const binding = bindings.find((row) => row.from_canonical_g5_id === g5(from)
    && row.to_canonical_g5_id === g5(to));
  assert.ok(binding, `approved canonical passage required: ${from} -> ${to}`);
  const { labels } = await json(CONNECTION_LABELS);
  const label = labels.find((row) => row.binding_ref.id === binding.id)?.display_label;
  assert.ok(label, `approved passage label required: ${from} -> ${to}`);
  return label;
};

async function currentPlace(partyPool, partyId) {
  const { rows } = await partyPool.query(`SELECT
      COALESCE(site.canonical_g5_ref->>'entity_id', site.canonical_g5_ref->>'id') AS g5_id,
      COALESCE(site.canonical_g5_ref->>'authoring_version', site.canonical_g5_ref->>'version')::integer AS g5_version,
      site.parent_g4_id AS g4_id, base.scene_template_ref->>'entity_id' AS template_id,
      (base.scene_template_ref->>'authoring_version')::integer AS template_version,
      pos.template_slot_key AS slot
    FROM party_runtime.party_journey_locations loc
    JOIN party_runtime.scene_position_nodes pos ON pos.party_id=loc.party_id AND pos.id=loc.scene_position_id
    JOIN party_runtime.party_g6_instances g6 ON g6.party_id=pos.party_id AND g6.id=pos.g6_instance_id
    JOIN party_runtime.party_scene_baselines base ON base.party_id=g6.party_id AND base.id=g6.scene_baseline_id
    JOIN party_runtime.party_g5_sites site ON site.party_id=base.party_id AND site.id=base.host_id
    WHERE loc.party_id=$1 AND loc.owner_kind='actor'`, [partyId]);
  assert.equal(rows.length, 1, 'one current destination place required');
  return rows[0];
}

test('capture exact provider request payloads for seven v17 opening and first-turn paths',
  { timeout: 1_800_000, skip: !['before', 'after'].includes(phase) }, async (t) => {
    const manifest = await json(MANIFEST);
    assert.equal(manifest.status, 'approved');
    assert.equal(manifest.activation_authorized, true);
    assert.equal(manifest.starts.length, 7);
    const env = await bootstrapV17PresenceE2e(t, { postgresProfile: 'canonical-acceptance' });
    const calls = [];
    const naturalLabelLookups = [];
    const mapGet = Map.prototype.get;
    Map.prototype.get = function (key) {
      const value = mapGet.call(this, key);
      if (typeof key === 'string' && key.startsWith('natural:')) {
        naturalLabelLookups.push({ key, display_label: value?.display_label ?? null });
      }
      return value;
    };
    t.after(() => { Map.prototype.get = mapGet; });
    const restore = installPresenceProductionE2eFetch({ observeText: 'Осмотреться',
      movementPrefs: { exactMovement: true } });
    const deterministicFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const payload = JSON.parse(init.body);
      calls.push(payload);
      return deterministicFetch(url, init);
    };
    t.after(restore);
    const { runtime } = await createPresenceProductionRoot(env);
    t.after(() => runtime.close());
    const out = join(OUT, phase);
    await mkdir(out, { recursive: true });
    for (const entry of manifest.starts) {
      const start = JSON.parse(await readPinnedArtifact(ROOT, entry.start));
      const openingFrom = calls.length;
      const opening = await runtime.startNewGame({ scenario_id: entry.scenario_id,
        request_id: `start-title-payload-opening-${entry.scenario_id}` });
      const openingCalls = calls.slice(openingFrom);
      assert.ok(openingCalls.length > 0, `opening provider request required for ${entry.scenario_id}`);
      await writeFile(join(out, `${entry.scenario_id}-opening.json`),
        `${JSON.stringify({ scenario_id: entry.scenario_id, start_title: start.public_metadata?.title ?? null,
          requests: openingCalls.map((payload) => ({ role: roleOf(payload), payload })) }, null, 2)}\n`);
      await runtime.acknowledgeOpening(opening.party_id,
        { client_ack_id: `start-title-payload-ack-${entry.scenario_id}` });
      const turnFrom = calls.length;
      await runtime.submitTurn(opening.party_id, { raw_text: 'Осмотреться',
        request_id: `start-title-payload-turn-${entry.scenario_id}` });
      const turnCalls = calls.slice(turnFrom);
      assert.ok(turnCalls.length > 0, `first-turn provider request required for ${entry.scenario_id}`);
      await writeFile(join(out, `${entry.scenario_id}-turn.json`),
        `${JSON.stringify({ scenario_id: entry.scenario_id,
          requests: turnCalls.map((payload) => ({ role: roleOf(payload), payload })) }, null, 2)}\n`);
    }

    if (phase === 'after') {
      const startEntry = manifest.starts.find((entry) =>
        entry.scenario_id === 'novgorod_vikhtuy_work_storage_v1');
      assert.ok(startEntry, 'approved Vikhtuy work-storage start required');
      const opening = await runtime.startNewGame({ scenario_id: startEntry.scenario_id,
        request_id: 'start-title-payload-natural-opening' });
      await runtime.acknowledgeOpening(opening.party_id,
        { client_ack_id: 'start-title-payload-natural-ack' });
      const routeFrom = calls.length;
      const namedPassage = await passageLabel('work_storage', 'water_access');
      let result = null;
      let destination = await currentPlace(env.partyPool, opening.party_id);
      for (let attempt = 0; attempt < 4 && destination.g5_id !== g5('water_access'); attempt += 1) {
        const raw_text = destination.slot === 'departure' ? namedPassage : `${namedPassage} — подход`;
        result = await runtime.submitTurn(opening.party_id, { raw_text,
          request_id: `start-title-payload-natural-walk-${attempt}` });
        destination = await currentPlace(env.partyPool, opening.party_id);
      }
      assert.equal(destination.g5_id, g5('water_access'), 'natural fallback destination reached');
      assert.equal(destination.g5_version, 1);
      const exactG5Keys = new Set(loadApprovedPlaceLabels().keys());
      assert.ok(!exactG5Keys.has(`${destination.g5_id}@${destination.g5_version}`),
        'destination must use the natural label path, not one of seven exact G5 labels');

      const placements = (await json(NATURAL_PLACEMENT)).placements;
      const selected = placements.filter((row) => row.g4_ref.id === destination.g4_id
        && row.scene_template_ref.id === destination.template_id
        && row.scene_template_ref.version === destination.template_version);
      assert.equal(selected.length, 1, 'one actual G4/template natural placement must match');
      const { natural_profile_ref: profile, scene_template_ref: template } = selected[0];
      const key = `natural:${profile.id}@${profile.version}|${template.id}@${template.version}`;
      const approvedLabels = loadApprovedPlaceLabels();
      const displayLabel = approvedLabels.get(key)?.display_label;
      assert.ok(displayLabel, 'actual natural profile/template pair must be approved');
      const observed = await runtime.getPartyScreen(opening.party_id);
      const requests = calls.slice(routeFrom).map((payload) => ({ role: roleOf(payload), payload }));
      const narrator = requests.filter(({ role, payload }) => {
        if (role !== 'gameplay_narrator_turn') return false;
        const user = payload.messages?.find((message) => message.role === 'user')?.content;
        try { return JSON.parse(user)?.optional_support?.visible_scene === displayLabel; }
        catch { return false; }
      });
      await writeFile(join(out, 'natural-fallback.json'), `${JSON.stringify({
        scenario_id: startEntry.scenario_id, route: ['work_storage', 'water_access'],
        destination: { g5_id: destination.g5_id, g5_version: destination.g5_version,
          g4_id: destination.g4_id, scene_template_id: destination.template_id,
          scene_template_version: destination.template_version,
          natural_profile_id: profile.id, natural_profile_version: profile.version },
        natural_place_label: displayLabel,
        natural_label_lookups: naturalLabelLookups,
        returned_screen_label: result?.screen?.visible_context?.visible_scene ?? null,
        persisted_screen_label: observed.screen?.visible_context?.visible_scene ?? null,
        narrator_payload_count_with_expected_label: narrator.length,
        requests,
      }, null, 2)}\n`);
      assert.equal(observed.screen?.visible_context?.visible_scene, displayLabel,
        'persisted destination screen uses the approved natural label');
      assert.ok(narrator.length > 0,
        'actual production narrator payload after natural arrival contains the approved label');
    }
    console.log(`Exact provider payload captures written for ${phase}: ${basename(OUT)}`);
  });
