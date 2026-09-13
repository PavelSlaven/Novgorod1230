import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { computeVisibleContextPackageDigest } from '@rus/contracts';
import * as stage23 from '@rus/new-game/stages/stage-23/compat';
import { makeNarratorProse, makePassingNarratorAudit, makeStage23Input, makeVisibleContextApproval } from '../fixtures/stage22-23-fixtures.mjs';

test('Stage 23 rejects hidden state in exact audit input', () => {
  const input = structuredClone(makeStage23Input());
  input.hidden_state = { motive: 'secret' };
  const codes = stage23.validateStage23AuditInput(input).map((item) => item.code);
  assert.ok(codes.includes('STAGE23_INPUT_EXTRA_FIELD'));
  assert.ok(codes.includes('STAGE23_INPUT_FORBIDDEN_FIELD'));
});

test('Stage 23 rejects audits that embed prose or hidden payloads', () => {
  const input = makeStage23Input();
  const audit = makePassingNarratorAudit(input);
  audit.modified_prose = 'unsafe';
  const codes = stage23.validateNarratorProseAudit(audit, input).map((item) => item.code);
  assert.ok(codes.includes('STAGE23_AUDIT_EXTRA_FIELD'));
  assert.ok(codes.includes('STAGE23_AUDIT_FORBIDDEN_FIELD'));
});

test('Stage 23 precheck rejects prose references absent from visible context', () => {
  const prose = makeNarratorProse();
  prose.used_visible_context_refs.push('hidden-cellar');
  const input = makeStage23Input(prose);
  const codes = stage23.buildNarratorProseCodePrecheck(input).concerns.map((item) => item.code);
  assert.ok(codes.includes('STAGE23_USED_REF_UNKNOWN'));
  assert.ok(codes.includes('STAGE23_MUST_NOT_INCLUDE_REF_USED'));
});

test('Stage 23 rejects incompatible repair routes', () => {
  const input = makeStage23Input();
  const audit = makePassingNarratorAudit(input);
  audit.pass = false;
  audit.checks.new_fact_check = { pass: false };
  audit.concerns = [{ code: 'NARRATOR_PROSE_ADDED_FACT', severity: 'repairable', message: 'added fact' }];
  audit.evidence = ['added fact'];
  audit.commit_permission = { can_show_to_player: false, can_write_player_visible_message: false, can_mark_opening_scene_presented: false };
  const route = {
    version: 1,
    schema: stage23.STAGE23_ROUTE_SCHEMA,
    request_id: input.request_id,
    return_to_stage: 'time_light_semantic_repair',
    repair_kind: 'semantic_rewrite',
    reason: 'wrong route',
    supporting_concern_codes: ['NARRATOR_PROSE_ADDED_FACT']
  };
  const codes = stage23.validateStage23RepairRoute(route, audit).map((item) => item.code);
  assert.ok(codes.includes('STAGE23_ROUTE_INCOMPATIBLE'));
});


test('Stage 23 requires a literary composition finding instead of factual-only Approved', () => {
  const input = makeStage23Input();
  const audit = makePassingNarratorAudit(input);
  delete audit.checks.literary_composition_check;
  audit.evidence = ['Approved'];
  const issues = stage23.validateNarratorProseAudit(audit, input);
  assert.ok(issues.some((item) => item.code === 'STAGE23_AUDIT_CHECK_INVALID' && item.field === 'checks.literary_composition_check'));
});

for (const fixture of [
  {
    name: 'grounded dossier needs semantic prose repair', pass: false,
    facts: ['Вы кузнец.', 'Вчера вы пришли к этому двору за работой.', 'Вы ещё не знаете, найдётся ли здесь работа.'],
    prose: 'Вы кузнец. Вчера вы пришли к этому двору за работой. Работа неизвестна. Сейчас серый рассвет. Перед вами ворота двора. На воротах иней. У ворот сторож.',
    evidence: 'Фразы «Вы кузнец», «Работа неизвестна», «Сейчас серый рассвет» перечисляют справочные поля; прошлое и нынешняя неопределённость не связаны в сцену.'
  },
  {
    name: 'unseen grounded opening connects past to present without adding facts', pass: true,
    facts: ['Вы купец.', 'Накануне вы пришли к этому двору вслед за пропавшим грузом.', 'Вы не знаете, находится ли груз во дворе.'],
    prose: 'Вчера поиски пропавшего груза привели вас, купца, к этому двору; теперь перед вами его ворота, белые от инея в сером рассвете. У створки стоит сторож. Здесь ли ваш груз — вы пока не знаете.',
    evidence: '«Вчера поиски ... привели» связывает supplied прошлое с нынешними воротами; «Здесь ли ваш груз» сохраняет supplied неопределённость. Иней и сторож уже есть в visible context.'
  }
]) {
  test(`Stage 23 literary gate: ${fixture.name}`, async () => {
    const input = makeStage23Input(makeNarratorProse({ prose: fixture.prose }), (values, pkg) => {
      pkg.visible_facts.push(...fixture.facts.map((label, index) => ({ visible_fact_id: `fact-opening-${index}`, label })));
      values.visible_context_package_digest = computeVisibleContextPackageDigest(pkg);
      values.visible_context_approval = makeVisibleContextApproval(pkg);
    });
    assert.equal(stage23.buildNarratorProseCodePrecheck(input).pass, true);
    const audit = makePassingNarratorAudit(input);
    audit.pass = fixture.pass;
    audit.checks.literary_composition_check = { pass: fixture.pass };
    audit.evidence = [fixture.evidence];
    if (!fixture.pass) {
      audit.concerns = [{ code: 'NARRATOR_PROSE_WEAK_LITERARY_COMPOSITION', severity: 'repairable', message: fixture.evidence }];
      for (const key of Object.keys(audit.commit_permission)) audit.commit_permission[key] = false;
    }
    const calls = [];
    const result = await stage23.runStage23NarratorProseAuditBlock({
      input,
      auditor: async (request) => {
        calls.push('auditor');
        assert.ok(request.output_contract.required_checks.includes('literary_composition_check'));
        assert.ok(request.output_contract.allowed_concern_codes.includes('NARRATOR_PROSE_WEAK_LITERARY_COMPOSITION'));
        assert.match(request.output_contract.literary_composition_rule, /identity and past to present orientation and stake/u);
        assert.match(request.output_contract.literary_composition_rule, /Do not invent biography/u);
        assert.equal(request.narrator_starting_prose.prose, fixture.prose);
        return structuredClone(audit);
      },
      formatRepairer: async () => assert.fail('semantic findings are not format errors'),
      seniorAuditor: async () => assert.fail('valid semantic verdict needs no senior retry'),
      router: async () => {
        calls.push('router');
        return { version: 1, schema: stage23.STAGE23_ROUTE_SCHEMA, request_id: input.request_id,
          return_to_stage: 'narrator_prose_semantic_repair', repair_kind: 'semantic_rewrite',
          reason: fixture.evidence, supporting_concern_codes: ['NARRATOR_PROSE_WEAK_LITERARY_COMPOSITION'] };
      }
    });
    assert.equal(result.pass, fixture.pass);
    assert.equal(result.commit_permission.can_show_to_player, fixture.pass);
    assert.deepEqual(calls, fixture.pass ? ['auditor'] : ['auditor', 'router']);
    assert.equal(result.repair_route?.return_to_stage ?? null, fixture.pass ? null : 'narrator_prose_semantic_repair');
  });
}

test('Stage 23 production prompt preserves the required literary gate', async () => {
  const spec = await readFile(new URL('../../DOCUMENTS/documents-kg/corpus/DOCUMENTS/new_game_start/23.txt', import.meta.url), 'utf8');
  assert.match(spec, /literary_composition_check/u);
  assert.match(spec, /NARRATOR_PROSE_WEAK_LITERARY_COMPOSITION/u);
  assert.match(spec, /Досье, отчёт, перечень и декоративное заполнение — fail/u);
});
