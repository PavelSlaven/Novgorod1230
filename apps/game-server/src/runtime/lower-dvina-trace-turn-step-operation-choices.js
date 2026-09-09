import { isDeepStrictEqual } from 'node:util';

export function turnStepOperationChoices(request, repairContext = null) {
  const operations = [
    ...(request.available_domain_operations ?? []),
    ...(request.player_safe_state?.local_world_process?.allowed ?? [])
  ];
  const seen = new Set();
  const unique = operations.filter((operation) => {
    const key = JSON.stringify(operation);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.map((operation, index) => ({
    choice_id: operationChoiceId(operation, index, unique),
    operation: structuredClone(operation),
    ...operationChoiceGrounding(operation, request)
  })).filter(({ operation }) => !rejectedSemanticChoice(
    repairContext, operation));
}

export function normalizeTurnStepOperationChoice(choice) {
  return choice?.operation_choice === 'null'
    ? { ...choice, operation_choice: null } : choice;
}

export function selectedTurnStepOperation(choice, operationChoices) {
  const selected = operationChoices.find(({ choice_id }) =>
    choice_id === choice.operation_choice);
  return selected != null && (choice.operation_family == null
      || choice.operation_family === selected.operation.op)
    ? selected : undefined;
}

function operationChoiceGrounding(operation, request) {
  const suppliedScope = request.player_safe_state
    ?.available_domain_operation_grounding?.find((entry) =>
      isDeepStrictEqual(entry?.operation, operation))?.semantic_scope;
  const grounding = suppliedScope == null ? {} : {
    semantic_scope: structuredClone(suppliedScope)
  };
  if (operation?.op === 'emit_interaction'
      && operation.target_actor_refs?.length === 1) {
    const target = request.player_safe_state?.current_visible_context
      ?.visible_npc?.find(({ entity_ref: reference }) =>
        reference?.entity_kind === 'npc'
          && reference.entity_id === operation.target_actor_refs[0]);
    if (target != null) grounding.target_actor = structuredClone(target);
  }
  return Object.keys(grounding).length === 0 ? {} : {
    player_safe_grounding: grounding
  };
}

function rejectedSemanticChoice(repairContext, operation) {
  return repairContext?.structural_errors?.some((error) =>
    error.code === 'operation_semantic_grounding'
      && (isDeepStrictEqual(error.rejected_operation, operation)
        || repairContext.original_output?.operations?.some((candidate) =>
          isDeepStrictEqual(candidate, operation)) === true)) === true;
}

function operationChoiceId(operation,index,operations){const qualifier=operationQualifier(operation);const collision=operations.filter((candidate)=>candidate.op===operation.op&&operationQualifier(candidate)===qualifier).length>1;return['domain_operation',index+1,operation.op,qualifier,collision?semanticChoiceLabel(operation.description):null].filter((part)=>part!=null).join('_');}
function operationQualifier(operation){return operation.process_action??operation.discovery_kind??operation.access_kind??operation.movement_kind??operation.use_kind??operation.activity_kind??operation.interaction_kind;}
function semanticChoiceLabel(value){const label=typeof value==='string'?value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/[^\p{L}\p{N}]+/gu,'_').replace(/^_+|_+$/gu,''):'';return label||'variant';}
