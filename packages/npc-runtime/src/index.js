export {
  NPC_RUNTIME_OWNER,
  NPC_RUNTIME_RESOURCE_LIMITS,
  NPC_RUNTIME_TYPED_ERRORS
} from './runtime-configuration.js';
export { orderNpcDecisionRequests } from './bounded-decision.js';
export { proposeNpcPerception } from './perception.js';
export { proposeNpcScheduleTransition } from './schedule.js';

import { decideBoundedNpcAction as decideBoundedNpcActionInternal } from './bounded-decision.js';
import { NPC_RUNTIME_RESOURCE_LIMITS } from './runtime-configuration.js';

export function decideBoundedNpcAction({
  request,
  selection = null,
  current_state_version,
  observed_preconditions_digest = null,
  validated_at,
  persisted_trace = null
} = {}) {
  return decideBoundedNpcActionInternal({
    request,
    selection,
    current_state_version,
    observed_preconditions_digest,
    validated_at,
    persisted_trace
  }, { maxDecisionOptions: NPC_RUNTIME_RESOURCE_LIMITS.max_decision_options });
}
