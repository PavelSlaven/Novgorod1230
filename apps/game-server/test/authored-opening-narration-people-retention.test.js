import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVisibleContextAuditApproval,
  computeVisibleContextPackageDigest } from '@rus/contracts';
import { createAuthoredOpeningNarrationService } from
  '../src/runtime/authored-opening-narration.js';

test('opening narration retains every visible person when only the label is known', async () => {
  const pkg = packageWithTwoUnknownPeople();
  const digest = computeVisibleContextPackageDigest(pkg);
  const approval = buildVisibleContextAuditApproval({ request_id: pkg.request_id,
    pass: true, visible_context_package_digest: digest,
    visible_context_audit: { request_id: pkg.request_id, pass: true,
      visible_context_package_digest: digest },
    commit_permission: { can_send_to_narrator: true,
      can_write_visible_context_snapshot: true,
      can_generate_player_facing_prose: true } });
  const calls = [];
  let audits = 0;
  const service = createAuthoredOpeningNarrationService({ roleRunner: {
    async run(call) {
      calls.push({ role: call.role_id,
        input: JSON.parse(call.messages[1].content) });
      if (call.role_id === 'gameplay_narrator') {
        return { output: { prose: 'У порога замерли двое; сырой ветер тронул полы их одежд.' } };
      }
      if (call.role_id === 'gameplay_narrator_semantic_repair') {
        return { output: { prose: 'У порога стояли двое. Ветер шевелил их одежду.' } };
      }
      audits += 1;
      return audits === 1 ? { output: { pass: false,
        failed_checks: ['must_not_include_check'],
        concerns: [{ code: 'NARRATOR_PROSE_MUST_NOT_INCLUDE_VIOLATION',
          severity: 'repairable', message: 'Исправьте неподтверждённое утверждение.' }],
        evidence: ['Неподтверждённое утверждение.'] } } : { output: {
        pass: true, failed_checks: [], concerns: [], evidence: ['Факты соблюдены.'] } };
    }
  } });

  await service.run({ partyId: 'party:people-retention',
    requestId: pkg.request_id, visibleContextPackage: pkg,
    visibleContextApproval: approval });

  assert.deepEqual(calls.map(({ role }) => role), [
    'gameplay_narrator', 'gameplay_narrator_auditor',
    'gameplay_narrator_semantic_repair', 'gameplay_narrator_auditor'
  ]);
  for (const { role, input } of calls) {
    const people = input.сцена?.персонажи;
    assert.equal(people?.length, 2, `${role} receives both visible people`);
    assert.deepEqual(people.map(({ имя }) => имя), ['человек', 'человек']);
    assert.doesNotMatch(JSON.stringify(input), /npc:private/u,
      `${role} receives no private NPC references`);
    if (role === 'gameplay_narrator') {
      assert.deepEqual(people.map(({ факты }) => факты), [[], []],
        'deduplicating the label must not invent additional facts');
    } else {
      assert.deepEqual(people.map(({ факты }) => факты.map(({ текст }) => текст)),
        [['человек'], ['человек']], `${role} retains the label facts`);
    }
  }
});

function packageWithTwoUnknownPeople() {
  const refs = ['npc:private:first', 'npc:private:second'];
  return {
    version: 1, schema: 'visible_context_package', request_id: 'opening:people-retention',
    visible_context_status: 'formed',
    frame: { region_id: 'region', year: 1230, season: 'late_summer',
      clock: { whole_minutes: '1' }, weather_state: { facts: [] } },
    position: { region_id: 'region', place_id: 'shore', location_id: 'shore',
      minilocation_id: 'threshold', anchor_id: 'anchor:threshold' },
    narrator_scope: { allowed_surfaces: ['opening'], forbidden_surfaces: ['hidden_state'],
      style_constraints: ['connected_literary_russian'],
      knowledge_boundary: { player_safe_only: true } },
    visible_scene_dossier: { must_include: [
      { category: 'people', text: 'человек; человек' },
      { category: 'surroundings', text: 'Порог и ветер.' }
    ], must_not_include: ['unprovided hidden facts'] },
    visible_scene_facts: refs.map((ref, index) => ({
      fact_id: `opening:person:${index + 1}`, text: 'человек', source_refs: [ref]
    })),
    visible_anchors: [], visible_exits: [],
    visible_npcs: refs.map((npc_instance_id) => ({ npc_instance_id,
      label: 'человек', recognition: 'unrecognized' })),
    visible_items: [], visible_containers: [], visible_risks: [],
    audible_context: [], smell_context: [], touch_body_context: [],
    weather_light_context: [], known_context: [], rumor_context: [],
    uncertain_context: [], available_actions_context: [], hidden_filtered_out: []
  };
}
