import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createProductionLlmRoleRunner } from '../src/infrastructure/provider/deepseek.js';
import { createLowerDvinaTraceSpatialSemanticModel } from '../src/runtime/lower-dvina-trace-s1-llm.js';
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
    const model = createLowerDvinaTraceSpatialSemanticModel({
      roleRunner: createProductionLlmRoleRunner({ env: process.env })
    });
    let requestNumber = 0;
    const report = await runS1SpatialSemanticEval({
      semantic_context: profile.envelopes[0].semantic_context,
      model: async ({ case_id, intent }) => {
        const natural = case_id === 'unseen-ordinary-feature';
        const envelope = profile.envelopes.find(({ kind }) => kind === (
          natural ? 'local_natural_feature' : 'ordinary_structure'
        ));
        const prepared = prepareSpatialSemanticRemainder(request({
          request_id: `s1-live-${++requestNumber}`, envelope
        }));
        const proposal = await model({ ...prepared.model_request,
          evaluation_intent: intent });
        admitSpatialSemanticRemainder({ prepared, proposal });
        return proposal;
      }
    });
    assert.equal(report.pass, true);
  });

function request({ request_id, envelope }) {
  const structural = envelope.structural_variant === 'open_one_space';
  const position_ref = 'position:s1-live';
  return { schema: 'rus.s1_spatial_semantic_request.v1', request_id,
    causal_request_ref: `turn:${request_id}`, party_id: 's1-live-eval',
    need: 'interaction', envelope: {
      ...envelope, baseline_ref: 'baseline:s1-live', g5_ref: 'g5:s1-live',
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
