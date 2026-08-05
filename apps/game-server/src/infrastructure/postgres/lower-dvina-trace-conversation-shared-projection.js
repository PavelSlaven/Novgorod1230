import {
  fail,
  record
} from './lower-dvina-trace-conversation-state-validation.js';
import { validateTerminalNpcOutcomes } from
  './lower-dvina-trace-conversation-terminal-state.js';

export function semanticDecisionTraceReference(trace) {
  return {
    request_id: trace.request_id,
    boundary_id: trace.boundary_id,
    npc_ref: {
      entity_kind: 'npc',
      entity_id: trace.npc_ref
    },
    committed_state_version: trace.committed_state_version,
    root_turn_id: trace.root_turn_id,
    working_revision: trace.working_revision,
    applied_change_set_id: trace.applied_change_set_id,
    status: trace.status
  };
}

export function projectSharedSemanticConsequence(consequence) {
  const shared = structuredClone(consequence);
  for (const branch of [shared?.conversation, shared?.negotiation]) {
    if (!record(branch?.semantic_exchange)) continue;
    branch.semantic_exchange_projection = projectSharedSemanticExchange(
      branch.semantic_exchange
    );
    delete branch.semantic_exchange;
  }
  return shared;
}

export function projectSharedSemanticExchange(semanticExchange) {
  const request = semanticExchange?.decision_request;
  const boundary = semanticExchange?.decision_boundary;
  const firstContribution = semanticExchange?.exchange?.contributions?.[0];
  if (semanticExchange?.exchange?.applied_contribution_count === 0) {
    return {
      request_id: null,
      boundary_id: null,
      conversation_id: null,
      exchange_id: null,
      npc_ref: null,
      response_kind: null,
      factual_status: 'not_applied',
      time_budget: structuredClone(semanticExchange.exchange.time_budget),
      statement_refs: [],
      route_disclosure: null,
      commitment: null,
      surrender: null,
      knife_transition_eligibility: null,
      ...terminalOutcomesProjection(semanticExchange)
    };
  }
  if (request === null && boundary === null
      && semanticExchange?.decision_plan === null
      && record(firstContribution)) {
    const resumed = semanticExchange.resumed_npc_execution ?? null;
    return {
      request_id: resumed?.decision_trace_ref?.entity_id ?? null,
      boundary_id: null,
      conversation_id: firstContribution.conversation_id,
      exchange_id: firstContribution.exchange_id,
      npc_ref: resumed === null
        ? null : structuredClone(firstContribution.speaker_ref),
      response_kind: resumed === null
        ? null : semanticExchange.response_kind,
      time_budget: structuredClone(
        semanticExchange.exchange.time_budget
      ),
      statement_refs: (semanticExchange.statements ?? []).map(
        ({ statement_id: statementId }) => ({
          entity_kind: 'conversation_statement', entity_id: statementId
        })
      ),
      route_disclosure: semanticExchange.route_disclosure == null
        ? null : {
            route_ref: semanticExchange.route_disclosure.route_ref,
            source_statement_ref: structuredClone(
              semanticExchange.route_disclosure.source_statement_ref
            )
          },
      commitment: structuredClone(semanticExchange.commitment ?? null),
      surrender: semanticExchange.surrender == null
        ? null : {
            fact_id: semanticExchange.surrender.fact_id,
            source_statement_ref: structuredClone(
              semanticExchange.surrender.source_statement_ref
            )
          },
      knife_transition_eligibility:
        semanticExchange.knife_transition_eligibility == null
          ? null : {
              eligible:
                semanticExchange.knife_transition_eligibility.eligible === true
            },
      ...terminalOutcomesProjection(semanticExchange)
    };
  }
  if (!record(request)
      || !record(boundary)
      || request.request_id !== semanticExchange?.decision_plan?.request_id
      || request.boundary_id !== boundary.boundary_id) {
    fail(
      'TRACE_M2_SEMANTIC_EXCHANGE_INVALID',
      'The shared semantic projection requires exact persisted lineage.'
    );
  }
  const noAppliedNpcResponse = semanticExchange.response_kind === null;
  const responseNpcRef = semanticExchange.resumed_npc_execution
    ?.plan?.speaker_ref ?? request.npc_ref;
  const responseOutcome = (semanticExchange.npc_outcomes ?? []).filter(
    ({ npc_ref: npcRef, applied }) => applied
      && npcRef?.entity_kind === responseNpcRef.entity_kind
      && npcRef.entity_id === responseNpcRef.entity_id).at(-1) ?? null;
  const responseStatementRef = responseOutcome?.contribution_ref?.entity_kind
    === 'conversation_statement'
    ? responseOutcome.contribution_ref : null;
  return {
    request_id: request.request_id,
    boundary_id: boundary.boundary_id,
    conversation_id: request.conversation_id,
    exchange_id: request.exchange_id,
    npc_ref: noAppliedNpcResponse
      ? null
      : structuredClone(responseNpcRef),
    response_kind: semanticExchange.response_kind,
    time_budget: structuredClone(semanticExchange.exchange.time_budget),
    statement_refs: noAppliedNpcResponse
      ? (semanticExchange.statements ?? [])
          .filter(({ speaker_ref: speaker }) =>
            speaker?.entity_kind === 'player_character')
          .slice(0, 1)
          .map(({ statement_id: statementId }) => ({
            entity_kind: 'conversation_statement',
            entity_id: statementId
          }))
      : responseStatementRef === null ? []
        : [structuredClone(responseStatementRef)],
    route_disclosure: semanticExchange.route_disclosure == null
      ? null
      : {
          route_ref: semanticExchange.route_disclosure.route_ref,
          source_statement_ref: structuredClone(
            semanticExchange.route_disclosure.source_statement_ref
          )
        },
    commitment: structuredClone(semanticExchange.commitment ?? null),
    surrender: semanticExchange.surrender == null
      ? null
      : {
          fact_id: semanticExchange.surrender.fact_id,
          source_statement_ref: structuredClone(
            semanticExchange.surrender.source_statement_ref
          )
        },
    knife_transition_eligibility:
      semanticExchange.knife_transition_eligibility == null
        ? null
        : {
            eligible:
              semanticExchange.knife_transition_eligibility.eligible === true
          },
    ...terminalOutcomesProjection(semanticExchange)
  };
}

function terminalOutcomesProjection(semanticExchange) {
  return (semanticExchange.terminal_npc_outcomes?.length ?? 0) === 0
    ? {} : {
        terminal_npc_outcomes: structuredClone(
          semanticExchange.terminal_npc_outcomes
        )
      };
}

export function assertSharedSemanticSnapshotSafe(state) {
  const projections = [];
  const branches = [];
  if (Object.hasOwn(state, 'npc_semantic_decision_traces')) {
    privateSnapshotFail();
  }
  for (const entry of state.activity_history ?? []) {
    branches.push(entry.execution_result);
  }
  for (const entry of state.phase4_history ?? []) {
    branches.push(entry.consequence?.conversation, entry.consequence?.negotiation);
  }
  branches.push(
    state.last_turn?.consequence?.conversation,
    state.last_turn?.consequence?.negotiation
  );
  for (const branch of branches.filter(Boolean)) {
    if (Object.hasOwn(branch, 'semantic_exchange')) privateSnapshotFail();
    if (branch.semantic_exchange_projection != null) {
      projections.push(branch.semantic_exchange_projection);
    }
  }
  for (const projection of projections) {
    const allowed = new Set([
      'request_id', 'boundary_id', 'conversation_id', 'exchange_id',
      'npc_ref', 'response_kind', 'factual_status', 'time_budget',
      'statement_refs',
      'route_disclosure',
      'commitment', 'surrender', 'knife_transition_eligibility',
      'terminal_npc_outcomes'
    ]);
    if (!record(projection)
        || Object.keys(projection).some((key) => !allowed.has(key))) {
      privateSnapshotFail();
    }
    validateTerminalNpcOutcomes(projection.terminal_npc_outcomes ?? []);
  }
  validateTerminalNpcOutcomes(state.npc_decision_terminal_outcomes ?? []);
  const traceRefKeys = [
    'request_id', 'boundary_id', 'npc_ref', 'committed_state_version',
    'root_turn_id', 'working_revision', 'applied_change_set_id', 'status'
  ];
  for (const traceRef of state.npc_semantic_decision_refs ?? []) {
    if (!record(traceRef)
        || Object.keys(traceRef).length !== traceRefKeys.length
        || traceRefKeys.some((key) => !Object.hasOwn(traceRef, key))) {
      privateSnapshotFail();
    }
  }
  return state;
}

function privateSnapshotFail() {
  fail(
    'TRACE_M2_PRIVATE_SEMANTIC_SNAPSHOT_LEAK',
    'Private NPC semantic request or plan cannot enter shared state history.'
  );
}
