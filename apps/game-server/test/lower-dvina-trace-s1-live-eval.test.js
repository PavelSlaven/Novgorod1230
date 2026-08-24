import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createProductionLlmRoleRunner } from '../src/infrastructure/provider/deepseek.js';
import { resolveSpatialSemanticDescriptor } from '@rus/turn';
import { runS1SpatialSemanticEval } from '../../../packages/materialization/src/lower-dvina-trace-spatial-semantic-eval.js';
import { admitSpatialSemanticRemainder, prepareSpatialSemanticRemainder } from
  '../../../packages/materialization/src/lower-dvina-trace-spatial-semantic.js';

const enabled = process.env.RUS_S1_LIVE_EVAL === '1'
  && Boolean(process.env.DEEPSEEK_API_KEY?.trim());
const profileUrl = new URL('../../../data/world-catalogs/novgorod/'
  + 'lower-dvina-trace-v1/phase-m12-content/spatial-semantic-profile.json', import.meta.url);

test('S1 live eval uses configured spatial semantic descriptor and admission',
  { skip: enabled ? false : 'set RUS_S1_LIVE_EVAL=1 and DEEPSEEK_API_KEY' }, async () => {
    const profile = JSON.parse(await readFile(profileUrl, 'utf8'));
    const envelope = activeCampEnvelope(profile);
    const roleRunner = createProductionLlmRoleRunner({ env: process.env });
    let requestNumber = 0;
    const report = await runS1SpatialSemanticEval({
      semantic_context: envelope.semantic_context,
      model: async ({ case_id, intent }) => {
        const prepared = prepareSpatialSemanticRemainder(request({
          request_id: `s1-live-${++requestNumber}`, envelope
        }));
        const proposal = await resolveSpatialSemanticDescriptor({
          request: prepared.model_request, roleRunner, evaluation: { case_id, intent } });
        admitSpatialSemanticRemainder({ prepared, proposal });
        return proposal;
      }
    });
    assert.deepEqual(report.cases.filter(({ pass }) => !pass)
      .map(({ id, missing, forbidden }) => ({ id, missing, forbidden })), []);
  });

test('S1 eval contract admits all six cases through active fishing-camp envelope', async () => {
  const profile = JSON.parse(await readFile(profileUrl, 'utf8'));
  const envelope = activeCampEnvelope(profile);
  const admitted = [];
  let requestNumber = 0;
  const report = await runS1SpatialSemanticEval({
    semantic_context: envelope.semantic_context,
    model: () => {
      const prepared = prepareSpatialSemanticRemainder(request({
        request_id: `s1-contract-${++requestNumber}`, envelope
      }));
      const proposal = proposalFor(prepared.request_id);
      admitted.push(admitSpatialSemanticRemainder({ prepared, proposal }));
      return proposal;
    }
  });
  assert.equal(report.pass, true);
  assert.equal(admitted.length, 6);
  assert.ok(admitted.every(({ envelope_ref, outcome }) => envelope_ref === envelope.envelope_ref
    && outcome.semantic_requirements.includes('interior_space')));
});

function activeCampEnvelope(profile) {
  assert.equal(profile.envelopes.length, 1);
  const [envelope] = profile.envelopes;
  assert.equal(envelope.envelope_ref, 'lower_dvina_trace:s1:fishing_camp:ordinary_structure');
  assert.equal(envelope.kind, 'ordinary_structure');
  assert.equal(envelope.structural_variant, 'open_one_space');
  return envelope;
}

function proposalFor(request_id) {
  const description = 'ordinary windbreak of river reeds and driftwood shelter beside a wattle shed for fishing nets';
  return { schema: 'rus.s1_spatial_semantic_proposal.v1', request_id,
    name: description, description,
    semantic_requirements: ['interior_space'] };
}

function request({ request_id, envelope }) {
  const structural = envelope.structural_variant === 'open_one_space';
  const position_ref = 'position:s1-live';
  const { template_id, position_kind, slot_key, ...admittedEnvelope } = envelope;
  return { schema: 'rus.s1_spatial_semantic_request.v1', request_id,
    causal_request_ref: `turn:${request_id}`, party_id: 's1-live-eval',
    need: 'interaction', envelope: {
      ...admittedEnvelope, baseline_ref: 'baseline:s1-live', g5_ref: 'g5:s1-live',
      g6_ref: 'g6:s1-live', position_ref,
      property_ref: 'property:s1-live', function_ref: 'function:s1-live',
      environment_ref: 'environment:s1-live', profile_ref: 'profile:s1-live',
      profile_version: 1, policy_ref: 'policy:s1-live', policy_version: 1,
      baseline_state_version: 1, g5_state_version: 1, g6_state_version: 1,
      position_state_version: 1, topology: structural ? {
        baseline_ref: 'baseline:s1-live', g5_ref: 'g5:s1-live', position_ref,
        g6_instance_ref: `g6:${request_id}`, interior_position_ref: position_ref,
        movement_edge_refs: [`edge:${request_id}:out`, `edge:${request_id}:back`],
        visibility_link_refs: [`visibility:${request_id}:out`, `visibility:${request_id}:back`]
      } : null, consumed_count: 0, state_version: 1
    } };
}
