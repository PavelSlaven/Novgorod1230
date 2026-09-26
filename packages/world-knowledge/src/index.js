export { WorldKnowledgeError, createWorldKnowledgeCore, validateWorldKnowledgeQuery,
  CONDITION_FACETS } from './world-knowledge.js';
export { normalizeWorldKnowledgeQueryPlan, validateWorldKnowledgeQueryPlan, validateWorldKnowledgeQueryPlannerRequest } from './query-planner-contract.js';
export { createWorldKnowledgeFlatVectorIndex } from './vector-index.js';
export { candidateWorldKnowledgeFocusRefs, isApplicable, canAccess } from './resolution.js';
