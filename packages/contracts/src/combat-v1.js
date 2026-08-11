import { deepFreeze } from '@rus/kernel';
export const COMBAT_CONTRACT_NAMES=deepFreeze(['combat_session_v1','combat_intent_v1','combat_technical_step_proposal_v1','combat_exchange_proposal_v1','npc_combat_decision_request_v1','npc_combat_intent_plan_v1']);
export const COMBAT_INTENT_KINDS=deepFreeze(['engage','control','protect','hold','reach','break_contact','surrender','cease_hostility']);
export const COMBAT_FORCE_LIMITS=deepFreeze(['avoid_harm','nonlethal_if_possible','ordinary','lethal']);
export const COMBAT_RISK_POSTURES=deepFreeze(['cautious','ordinary','desperate']);
const NPC_DECISION_CATEGORIES = new Set([
  'self', 'others', 'environment', 'objective', 'communication'
]);
const INTENT_BOUNDARY_KINDS = new Set([
  'npc_decision_boundary', 'player_combat_response_boundary'
]);
const id=v=>typeof v==='string'&&v.trim()===v&&v.length>0, obj=v=>v&&typeof v==='object'&&!Array.isArray(v), exact=(v,k)=>obj(v)&&Object.keys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x));
const ref=(v,k=null)=>exact(v,['entity_kind','entity_id'])&&id(v.entity_kind)&&id(v.entity_id)&&(k===null||v.entity_kind===k), refs=v=>Array.isArray(v)&&v.every(x=>ref(x))&&new Set(v.map(x=>x.entity_kind+'\0'+x.entity_id)).size===v.length;
const stamp=v=>exact(v,['whole_minutes','subminute_numerator','subminute_denominator'])&&/^\d+$/u.test(v.whole_minutes)&&/^\d+$/u.test(v.subminute_numerator)&&/^[1-9]\d*$/u.test(v.subminute_denominator), pos=v=>typeof v==='string'&&/^[1-9]\d*$/u.test(v), nullableRef=v=>v===null||ref(v);
const sessionKeys=['schema','combat_id','state_version','status','started_at','scope_ref','participant_refs','participant_states','exchange_ordinal','last_exchange_ref','player_response_required','last_change_set_ref'];
const intentKeys=['schema','intent_id','combat_id','actor_ref','intent_kind','target_refs','protected_refs','scope_ref','destination_ref','force_limit','risk_posture','persistence','created_from_boundary_ref','state_version','status'];
export function validateCombatSession(v){return exact(v,sessionKeys)&&v.schema==='combat_session_v1'&&id(v.combat_id)&&pos(v.state_version)&&['active','paused_for_player','paused_for_decisions','ended'].includes(v.status)&&stamp(v.started_at)&&ref(v.scope_ref)&&refs(v.participant_refs)&&v.participant_refs.length>=2&&Array.isArray(v.participant_states)&&v.participant_states.length===v.participant_refs.length&&new Set(v.participant_states.map(x=>x.actor_ref.entity_kind+'\0'+x.actor_ref.entity_id)).size===v.participant_refs.length&&v.participant_states.every(s=>exact(s,['actor_ref','combat_status','current_intent','next_action_boundary_ref'])&&ref(s.actor_ref)&&v.participant_refs.some(p=>p.entity_kind===s.actor_ref.entity_kind&&p.entity_id===s.actor_ref.entity_id)&&['active','disengaging','restrained','surrendered','incapacitated','left'].includes(s.combat_status)&&(s.current_intent===null||validateCombatIntent(s.current_intent))&&nullableRef(s.next_action_boundary_ref))&&Number.isInteger(v.exchange_ordinal)&&v.exchange_ordinal>=0&&nullableRef(v.last_exchange_ref)&&typeof v.player_response_required==='boolean'&&nullableRef(v.last_change_set_ref);}
export function validateCombatIntent(v){if(!(exact(v,intentKeys)&&v.schema==='combat_intent_v1'&&id(v.intent_id)&&id(v.combat_id)&&ref(v.actor_ref)&&COMBAT_INTENT_KINDS.includes(v.intent_kind)&&refs(v.target_refs)&&refs(v.protected_refs)&&nullableRef(v.scope_ref)&&nullableRef(v.destination_ref)&&COMBAT_FORCE_LIMITS.includes(v.force_limit)&&COMBAT_RISK_POSTURES.includes(v.risk_posture)&&v.persistence==='until_decision_boundary'&&ref(v.created_from_boundary_ref)&&INTENT_BOUNDARY_KINDS.has(v.created_from_boundary_ref.entity_kind)&&pos(v.state_version)&&v.status==='active'))return false; if(['engage','control'].includes(v.intent_kind))return v.target_refs.length===1&&v.protected_refs.length===0&&v.scope_ref===null&&v.destination_ref===null;if(v.intent_kind==='hold')return v.scope_ref!==null&&v.target_refs.length===0&&v.protected_refs.length===0&&v.destination_ref===null;if(v.intent_kind==='reach')return v.destination_ref!==null&&v.target_refs.length===0&&v.protected_refs.length===0&&v.scope_ref===null;if(v.intent_kind==='protect')return(v.protected_refs.length>0||v.scope_ref!==null)&&v.target_refs.length===0&&v.destination_ref===null;return v.target_refs.length===0&&v.protected_refs.length===0&&v.scope_ref===null&&(v.intent_kind==='break_contact'||v.destination_ref===null);}
export function validateCombatTechnicalStepProposal(v){return exact(v,['schema','proposal_id','combat_id','exchange_ordinal','actor_ref','intent_ref','step_kind','check_request','preconditions_digest','idempotency_key'])&&v.schema==='combat_technical_step_proposal_v1'&&id(v.proposal_id)&&id(v.combat_id)&&Number.isInteger(v.exchange_ordinal)&&ref(v.actor_ref)&&ref(v.intent_ref,'combat_intent')&&COMBAT_INTENT_KINDS.includes(v.step_kind==='attack'?'engage':v.step_kind)&&(v.check_request===null||obj(v.check_request))&&id(v.preconditions_digest)&&id(v.idempotency_key);}
export function validateCombatExchangeProposal(v){return exact(v,['schema','proposal_id','combat_id','exchange_ordinal','technical_steps','preconditions_digest','idempotency_key'])&&v.schema==='combat_exchange_proposal_v1'&&id(v.proposal_id)&&id(v.combat_id)&&Number.isInteger(v.exchange_ordinal)&&Array.isArray(v.technical_steps)&&v.technical_steps.length>0&&v.technical_steps.every(validateCombatTechnicalStepProposal)&&id(v.preconditions_digest)&&id(v.idempotency_key);}
export function validateNpcCombatDecisionRequest(value) {
  return exact(value, ['schema','request_id','boundary_id','state_version','combat_id','exchange_ordinal','decided_at','npc_ref','decision_reasons','current_intent','npc_subjective_state','perceived_combat_state','relevant_memory','operation_contract'])
    && value.schema === 'npc_combat_decision_request_v1'
    && id(value.request_id) && id(value.boundary_id) && pos(value.state_version)
    && id(value.combat_id) && Number.isInteger(value.exchange_ordinal)
    && stamp(value.decided_at) && ref(value.npc_ref, 'npc')
    && validDecisionReasons(value.decision_reasons)
    && (value.current_intent === null || validCurrentIntent(value.current_intent))
    && obj(value.npc_subjective_state) && obj(value.perceived_combat_state)
    && Array.isArray(value.relevant_memory) && obj(value.operation_contract);
}

export function validateNpcCombatIntentPlan(value, request = null) {
  const valid = exact(value, ['schema','request_id','boundary_id','state_version','combat_id','npc_ref','decision','operation','combat_statement','reason'])
    && value.schema === 'npc_combat_intent_plan_v1'
    && id(value.request_id) && id(value.boundary_id) && pos(value.state_version)
    && id(value.combat_id) && ref(value.npc_ref, 'npc')
    && validCombatDecision(value.decision) && validCombatOperation(value.operation)
    && validCombatStatement(value.combat_statement) && id(value.reason);
  return valid && (request === null || (
    value.request_id === request.request_id && value.boundary_id === request.boundary_id
    && value.combat_id === request.combat_id && value.state_version === request.state_version
    && value.npc_ref.entity_id === request.npc_ref.entity_id));
}

function validCombatDecision(value) {
  return exact(value, ['intent_summary','grounded_goal','adaptation'])
    && id(value.intent_summary) && id(value.grounded_goal)
    && ['literal', 'reality_limited'].includes(value.adaptation);
}

function validCombatStatement(value) {
  return value === null || (
    exact(value, ['speech_act','addressed_refs','utterance_text'])
    && id(value.speech_act) && refs(value.addressed_refs)
    && id(value.utterance_text));
}

function validDecisionReasons(value) {
  return exact(value, ['significance','categories','signal_refs','perceived_changes'])
    && ['material', 'critical'].includes(value.significance)
    && Array.isArray(value.categories) && value.categories.length > 0
    && value.categories.every((category) => NPC_DECISION_CATEGORIES.has(category))
    && new Set(value.categories).size === value.categories.length
    && refs(value.signal_refs) && Array.isArray(value.perceived_changes)
    && value.perceived_changes.length === value.signal_refs.length
    && value.perceived_changes.every(id);
}

function validCurrentIntent(value) {
  return exact(value, ['intent_kind','target_refs','status'])
    && COMBAT_INTENT_KINDS.includes(value.intent_kind) && refs(value.target_refs)
    && value.status === 'active';
}

function validCombatOperation(value) {
  return exact(value, ['op','intent_kind','target_refs','protected_refs','scope_ref','destination_ref','force_limit','risk_posture'])
    && value.op === 'set_combat_intent' && COMBAT_INTENT_KINDS.includes(value.intent_kind)
    && refs(value.target_refs) && refs(value.protected_refs)
    && nullableRef(value.scope_ref) && nullableRef(value.destination_ref)
    && COMBAT_FORCE_LIMITS.includes(value.force_limit)
    && COMBAT_RISK_POSTURES.includes(value.risk_posture)
    && validIntentReferences(value);
}

function validIntentReferences(value) {
  if (['engage', 'control'].includes(value.intent_kind)) {
    return value.target_refs.length === 1 && value.protected_refs.length === 0
      && value.scope_ref === null && value.destination_ref === null;
  }
  if (value.intent_kind === 'protect') {
    return value.target_refs.length === 0 && value.destination_ref === null
      && (value.protected_refs.length > 0 || value.scope_ref !== null);
  }
  if (value.intent_kind === 'hold') {
    return value.target_refs.length === 0 && value.protected_refs.length === 0
      && value.scope_ref !== null && value.destination_ref === null;
  }
  if (value.intent_kind === 'reach') {
    return value.target_refs.length === 0 && value.protected_refs.length === 0
      && value.scope_ref === null && value.destination_ref !== null;
  }
  return value.target_refs.length === 0 && value.protected_refs.length === 0
    && value.scope_ref === null
    && (value.intent_kind === 'break_contact'
      || value.destination_ref === null);
}
