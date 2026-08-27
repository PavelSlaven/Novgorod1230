import { deepFreeze, sha256 } from '@rus/kernel';

const internals = new WeakMap();

export function createTurnWorkflowContext({ requestId, partyId, turnNumber, now, initial = null } = {}) {
  const stages = new Map(Object.entries(initial?.stages ?? {}));
  const events = Array.isArray(initial?.events) ? structuredClone(initial.events) : [];
  const context = {
    requestId: text(requestId) || `turn-request:${text(partyId) || 'party'}:${Number(turnNumber) || 0}`,
    partyId: text(partyId) || null,
    turnNumber: Number(turnNumber) || 0,
    now: text(now) || new Date().toISOString(),
    setStage(stageId, output) {
      stages.set(String(stageId), structuredClone(output));
      events.push({ type: 'stage_completed', stage_id: String(stageId) });
      return output;
    },
    getStage(stageId) {
      const value = stages.get(String(stageId));
      return value == null ? null : structuredClone(value);
    },
    addEvent(event) {
      events.push(structuredClone(event));
    },
    snapshot() {
      const state = {
        version: 1,
        schema: 'turn_workflow_checkpoint',
        request_id: context.requestId,
        party_id: context.partyId,
        turn_number: context.turnNumber,
        now: context.now,
        stages: Object.fromEntries([...stages.entries()].map(([key, value]) => [key, structuredClone(value)])),
        events: structuredClone(events)
      };
      return deepFreeze({ ...state, digest: sha256(state) });
    }
  };
  internals.set(context, { stages, events });
  return context;
}

// Internal workflow artifacts are frozen before this call. Retaining their
// identity avoids a second full clone; checkpoint snapshots remain isolated.
export function setTrustedTurnWorkflowStage(context, stageId, output) {
  const internal = internals.get(context);
  if (!internal || !Object.isFrozen(output)) {
    throw new TypeError('Trusted turn workflow stage output must be frozen.');
  }
  internal.stages.set(String(stageId), output);
  internal.events.push({ type: 'stage_completed', stage_id: String(stageId) });
  return output;
}

function text(value) { return String(value ?? '').trim(); }
