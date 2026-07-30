export const TRACE_PHASE_1B_APPROVED_MANIFEST_DIGEST =
  'a8ca136f815b662add09b5cfe7d981fced6a64583944f2b9af157262862e917f';
export const TRACE_PHASE_1B_APPROVED_BINDING_DIGEST =
  '1e7a45b5017631f381fa972642455cdb8eef81c19d0ecf76bc284bd018560eb9';
export const TRACE_PHASE_1B_APPROVED_PHASE_1A_MANIFEST_DIGEST =
  'c6fcf966ff9638d6649eca90fd7ec45c8252620ce02908c4354e9bd934d0f895';
export const TRACE_PHASE_1B_APPROVED_DEFINITION_DIGEST =
  '3f181993af99ddd7e7d3c0292ac853e168960b99f5cc2c06aaaddd13b8db703c';
export const TRACE_PHASE_1B_APPROVED_MATERIALIZER_VERSION =
  'code_materializer_v2';
export const TRACE_PHASE_1B_APPROVED_RNG_ALGORITHM_ID =
  'mulberry32_v1';

export const TRACE_PHASE_1B_SESSION_IDENTITIES = Object.freeze([
  Object.freeze({
    publication_manifest_digest:
      'f2cb774de97e6959b5ea31efaedf8b81bb3bdd3fb963132999c5b990c662749b',
    publication_binding_id: 'lower_dvina_trace_phase_1b_publication_v1',
    publication_binding_revision: 1,
    publication_binding_digest:
      '594e6f7cde83510ae4b48ee7bc8c2595bddd10bd4d325eeb33ba0487eb9b7810',
    phase_1a_manifest_digest:
      'b458b646afe745e4f3eda6308eb3fa18ceeb6867d3f16fe87088d3a96c46e605',
    scenario_definition_revision: 5,
    scenario_definition_digest:
      '2d4c940867a34a292435915a0e201d986346c10f1eddc31423fe019025dbc6c0',
    materializer_binding_id:
      'lower_dvina_trace_phase_1a_materialization_bindings_v1'
  }),
  Object.freeze({
    publication_manifest_digest:
      TRACE_PHASE_1B_APPROVED_MANIFEST_DIGEST,
    publication_binding_id: 'lower_dvina_trace_phase_1b_publication_v2',
    publication_binding_revision: 2,
    publication_binding_digest:
      TRACE_PHASE_1B_APPROVED_BINDING_DIGEST,
    phase_1a_manifest_digest:
      TRACE_PHASE_1B_APPROVED_PHASE_1A_MANIFEST_DIGEST,
    scenario_definition_revision: 6,
    scenario_definition_digest:
      TRACE_PHASE_1B_APPROVED_DEFINITION_DIGEST,
    materializer_binding_id:
      'lower_dvina_trace_phase_1a_materialization_bindings_v2'
  })
]);
