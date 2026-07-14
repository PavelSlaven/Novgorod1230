import { randomUUID } from 'node:crypto';
import { sha256 } from '@rus/kernel';

export function createModularNewGameContext({
  requestId = randomUUID(),
  startText = '',
  playerName = '',
  uiFields = null,
  clientDefaults = null,
  env = process.env,
  tracker = null,
  checkpoint = null
} = {}) {
  const outputs = new Map();
  const results = new Map();
  const gates = new Map();
  const repairs = new Map();
  const frozenArtifacts = new Map();
  const events = [];
  let lastCompletedStage = 1;

  const context = {
    requestId: String(requestId),
    startText: String(startText ?? ''),
    playerName: String(playerName ?? ''),
    uiFields: structuredClone(uiFields),
    clientDefaults: structuredClone(clientDefaults),
    env,
    tracker,

    note(stageId, payload = {}) {
      const event = {
        type: payload.type ?? 'stage_note',
        stage_id: Number(stageId),
        progress: Number.isFinite(payload.progress) ? payload.progress : Math.round((Number(stageId) / 26) * 100),
        ...structuredClone(payload)
      };
      events.push(event);
      if (typeof tracker?.update === 'function') tracker.update(event);
      else tracker?.note?.(event);
      return event;
    },

    setStageOutput(stageId, output) {
      outputs.set(Number(stageId), structuredClone(output));
      lastCompletedStage = Math.max(lastCompletedStage, stageOrder(stageId));
      return output;
    },

    getStageOutput(stageId) {
      const value = outputs.get(Number(stageId));
      return value == null ? null : structuredClone(value);
    },

    requireStageOutput(stageId, label = `stage ${stageId}`) {
      const value = outputs.get(Number(stageId));
      if (value == null) throw new Error(`New-game orchestrator requires ${label} output.`);
      return structuredClone(value);
    },

    setStageResult(stageId, result) {
      results.set(Number(stageId), structuredClone(result));
      return result;
    },

    getStageResult(stageId) {
      const value = results.get(Number(stageId));
      return value == null ? null : structuredClone(value);
    },

    setGateResult(stageId, gate) {
      gates.set(Number(stageId), structuredClone(gate));
      return gate;
    },

    getGateResult(stageId) {
      const value = gates.get(Number(stageId));
      return value == null ? null : structuredClone(value);
    },

    addRepairAttempt(stageId, attempt) {
      const key = Number(stageId);
      const history = repairs.get(key) ?? [];
      history.push(structuredClone(attempt));
      repairs.set(key, history);
      return history.map((item) => structuredClone(item));
    },

    getRepairHistory(stageId) {
      return (repairs.get(Number(stageId)) ?? []).map((item) => structuredClone(item));
    },

    freezeArtifact({ artifactId, artifact, stageId = null, schema = null, metadata = {} } = {}) {
      if (!artifactId) throw new Error('freezeArtifact requires artifactId.');
      const record = {
        artifact_id: String(artifactId),
        stage_id: stageId == null ? null : Number(stageId),
        schema: schema ?? artifact?.schema ?? null,
        digest: sha256(artifact ?? null),
        artifact: structuredClone(artifact),
        metadata: structuredClone(metadata)
      };
      frozenArtifacts.set(record.artifact_id, record);
      return structuredClone(record);
    },

    getFrozenArtifact(artifactId) {
      const value = frozenArtifacts.get(String(artifactId));
      return value == null ? null : structuredClone(value);
    },

    getFrozenArtifactBySchema(schema) {
      for (const value of frozenArtifacts.values()) {
        if (value.schema === schema) return structuredClone(value);
      }
      return null;
    },

    listFrozenArtifacts() {
      return [...frozenArtifacts.values()].map((item) => structuredClone(item));
    },

    clearFromStage(stageId) {
      const from = stageOrder(stageId);
      for (const map of [outputs, results, gates]) {
        for (const key of [...map.keys()]) if (stageOrder(key) >= from) map.delete(key);
      }
      for (const [key, record] of [...frozenArtifacts.entries()]) {
        if (stageOrder(record.stage_id) >= from) frozenArtifacts.delete(key);
      }
      lastCompletedStage = Math.min(lastCompletedStage, from - 1);
    },

    snapshot() {
      return {
        version: 1,
        schema: 'modular_new_game_checkpoint',
        request_id: context.requestId,
        start_text: context.startText,
        player_name: context.playerName,
        ui_fields: structuredClone(context.uiFields),
        client_defaults: structuredClone(context.clientDefaults),
        last_completed_stage: lastCompletedStage,
        outputs: Object.fromEntries(outputs),
        results: Object.fromEntries(results),
        gates: Object.fromEntries(gates),
        repairs: Object.fromEntries(repairs),
        frozen_artifacts: Object.fromEntries(frozenArtifacts),
        events: structuredClone(events)
      };
    }
  };

  if (checkpoint) restoreCheckpoint(context, checkpoint, { outputs, results, gates, repairs, frozenArtifacts, events, setLast: (value) => { lastCompletedStage = value; } });
  return context;
}

function restoreCheckpoint(context, checkpoint, state) {
  if (checkpoint?.schema !== 'modular_new_game_checkpoint' || checkpoint?.version !== 1) {
    throw new Error('Invalid modular new-game checkpoint.');
  }
  if (String(checkpoint.request_id) !== context.requestId) throw new Error('Checkpoint request_id mismatch.');
  for (const [key, value] of Object.entries(checkpoint.outputs ?? {})) state.outputs.set(Number(key), structuredClone(value));
  for (const [key, value] of Object.entries(checkpoint.results ?? {})) state.results.set(Number(key), structuredClone(value));
  for (const [key, value] of Object.entries(checkpoint.gates ?? {})) state.gates.set(Number(key), structuredClone(value));
  for (const [key, value] of Object.entries(checkpoint.repairs ?? {})) state.repairs.set(Number(key), structuredClone(value));
  for (const [key, value] of Object.entries(checkpoint.frozen_artifacts ?? {})) state.frozenArtifacts.set(String(key), structuredClone(value));
  state.events.push(...structuredClone(checkpoint.events ?? []));
  state.setLast(Number(checkpoint.last_completed_stage ?? 1));
}

function stageOrder(stageId) {
  const numeric = Number(stageId);
  if (!Number.isFinite(numeric)) return Number.MAX_SAFE_INTEGER;
  return numeric >= 1000 ? Math.floor(numeric / 100) : numeric;
}
