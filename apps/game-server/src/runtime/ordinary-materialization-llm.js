import { serverError } from '../errors.js';
import {
  snapshotLowerDvinaTraceOrdinaryStageBJson
} from '../internal/lower-dvina-trace-ordinary-stage-b-eval.js';
import { validateLowerDvinaTraceOrdinaryStageBApproval } from
  '../internal/lower-dvina-trace-ordinary-stage-b-approval.js';
import { bindOrdinaryMaterializationPlan } from
  './ordinary-materialization-plan.js';
import {
  admitCallSequence,
  approvedIdentity,
  bindIdentity,
  buildOrdinaryMaterializationMessages,
  cutoverError,
  exactModelContext,
  exactModelIdentity,
  modelInvocation,
  ordinaryMaterializationResponseOf,
  runRole
} from './ordinary-materialization-llm-support.js';

export { bindOrdinaryMaterializationPlan };
export { buildOrdinaryMaterializationMessages,
  ordinaryMaterializationResponseOf } from
  './ordinary-materialization-llm-support.js';

/** Server-only O1 role bound to a pre-activation Stage B eval receipt. */
export function createOrdinaryMaterializationModel({ roleRunner,
  stageBApprovalReceipt, qualifiedO1Identity = null,
  worldKnowledgeGrounder = null } = {}) {
  if (typeof roleRunner?.run !== 'function') throw serverError(
    'TRACE_PHASE_2_DEPENDENCY_MISSING', 'Configured LLM role runner is required.',
    { status: 503 });
  const defaultApprovedIdentity = exactModelIdentity(
    stageBApprovalReceipt?.model_identity);
  const requestCalls = new WeakMap();
  const model = async function resolveOrdinaryMaterialization(request,
    context = {}) {
    const { repair, mechanicsPolicy, semanticContext } =
      exactModelContext(context);
    admitCallSequence(requestCalls, request, repair);
    const expectedIdentity = approvedIdentity({ roleRunner, defaultApprovedIdentity,
      qualifiedO1Identity });
    const modelRequest = worldKnowledgeGrounder == null ? request
      : await worldKnowledgeGrounder.ground(request, 'materialization_support',
          { semantic_context: semanticContext });
    const response = await runRole({ roleRunner, request: modelRequest, repair,
      mechanicsPolicy, semanticContext });
    const output = ordinaryMaterializationResponseOf(response);
    bindIdentity(expectedIdentity, exactModelIdentity(output.provider_record));
    return bindOrdinaryMaterializationPlan(modelRequest, output.output);
  };
  Object.defineProperty(model, 'verifyStageBCutover', {
    enumerable: false,
    value: async (input = {}) => {
      const boundary = snapshotLowerDvinaTraceOrdinaryStageBJson(input);
      const evalContract = boundary?.eval_contract;
      if (!validateLowerDvinaTraceOrdinaryStageBApproval(
        stageBApprovalReceipt, evalContract)) {
        throw cutoverError('TRACE_ORDINARY_STAGE_B_EVAL_INPUT_INVALID');
      }
      if (typeof roleRunner.describe === 'function') {
        const observed = roleRunner.describe(modelInvocation());
        if (observed == null) throw cutoverError(
          'TRACE_ORDINARY_MODEL_IDENTITY_INVALID');
        bindIdentity(approvedIdentity({ roleRunner, defaultApprovedIdentity,
          qualifiedO1Identity }), exactModelIdentity(observed));
      }
      return stageBApprovalReceipt;
    }
  });
  return model;
}
