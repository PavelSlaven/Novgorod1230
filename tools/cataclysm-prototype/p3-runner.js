#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createP3AttemptBudget, createP3EvidenceRun, P3_ATTEMPT_BUDGET, requireP3CaseId, resolveP3EffectiveConfig,
  createP3NativeFileAdapter, createP3NativeProcessAdapter,
  applyP3CoordinatorSpeech,
  createP3RoleRuntime, runP3TurnStep, validateP3RoleConfigs,
  runP3SealedPackage, runP3NativeNpcFlow, validateP3Readback, writeP3OperationRequest } from './p3-boundary.js';

const usage = `P3 JS boundary (no provider or native process is launched)
  --dry-run --case ID --evidence-root DIR --operation-id ID
  --validate-config
  --native-preflight --native-config CONFIG.json
  --coordinator-create|--coordinator-read --native-config CONFIG.json
  --coordinator-apply --native-config CONFIG.json --request REQUEST.json
  --run --native-config CONFIG.json --intent FREE_TEXT
  --run-npc --native-config CONFIG.json --actor-id NATIVE_ID
  --run-sealed --native-config CONFIG.json --case-pack PACK.json
  --write-request USERDIR REQUEST.json
  --validate-readback REQUEST.json READBACK.json`;

async function jsonFile(file) { return JSON.parse(await readFile(file, 'utf8')); }
function coordinatorNativeAdapter(config) {
  return createP3NativeProcessAdapter({ binary: config.binary, nativeRoot: config.nativeRoot,
    nativeUserDir: config.nativeUserDir, hostUserDir: config.nativeUserDir, world: config.world,
    ...(config.timeout_ms ? { timeoutMs: config.timeout_ms } : {}) });
}
async function main(args) {
  if (args.length === 0 || args.includes('--help')) { process.stdout.write(`${usage}\n`); return; }
  if (args[0] === '--validate-config' && args.length === 1) {
    const roles = ['turn_step_planner', 'npc_autonomous_decider', 'npc_conversation_responder'];
    const configs = roles.map(role_id => resolveP3EffectiveConfig({ roleId: role_id }));
    process.stdout.write(`${JSON.stringify({ provider_calls: 0, effective_roles: configs }, null, 2)}\n`);
    return;
  }
  if (args[0] === '--native-preflight' && args.length === 1) {
    throw new Error('P3_NATIVE_PREFLIGHT_USER_DIR_REQUIRED');
  }
  if (args[0] === '--native-preflight' && args.length === 3 && args[1] === '--native-config') {
    const native = createP3NativeProcessAdapter(await jsonFile(args[2]));
    const observation = await native.preflight();
    process.stdout.write(`${JSON.stringify({ schema: observation.schema, revision: observation.revision,
      actors: observation.actors.length, items: observation.items.length,
      targets: observation.targets.length, provider_calls: 0, native_calls: 1 }, null, 2)}\n`);
    return;
  }
  if (args[0] === '--native-preflight' && args.length === 3 && args[1] === '--user-dir') {
    const adapter = createP3NativeFileAdapter({ userDir: args[2] });
    const observation = await adapter.readObservation();
    process.stdout.write(`${JSON.stringify({ schema: observation.schema, revision: observation.revision,
      actors: observation.actors.length, items: observation.items.length,
      targets: observation.targets.length, provider_calls: 0 }, null, 2)}\n`);
    return;
  }
  if (['--coordinator-create', '--coordinator-read'].includes(args[0])
      && args.length === 3 && args[1] === '--native-config') {
    const config = await jsonFile(args[2]);
    const adapter = coordinatorNativeAdapter(config);
    if (args[0] === '--coordinator-create') await adapter.runNative('create');
    const observation = await adapter.refreshObservation();
    process.stdout.write(`${JSON.stringify({ observation,
      native_action: args[0] === '--coordinator-create' ? 'created' : 'read' })}\n`);
    return;
  }
  if (args[0] === '--coordinator-apply' && args.length === 5
      && args[1] === '--native-config' && args[3] === '--request') {
    const config = await jsonFile(args[2]);
    const request = await jsonFile(args[4]);
    const result = await applyP3CoordinatorSpeech({
      nativeAdapter: coordinatorNativeAdapter(config), request
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (args[0] === '--write-request' && args.length === 3) {
    const file = await writeP3OperationRequest(args[1], await jsonFile(args[2]));
    process.stdout.write(`${JSON.stringify({ written: file, native_executed: false })}\n`);
    return;
  }
  if (args[0] === '--validate-readback' && args.length === 3) {
    const result = validateP3Readback(await jsonFile(args[1]), await jsonFile(args[2]));
    process.stdout.write(`${JSON.stringify({ ...result, readback_schema_validated: true,
      native_execution_verified: false, semantic_boundary_passed: false })}\n`);
    return;
  }
  if (args[0] === '--run' && args.length === 5 && args[1] === '--native-config'
      && args[3] === '--intent') {
    const nativeConfig = await jsonFile(args[2]);
    const intent = args[4];
    const configs = validateP3RoleConfigs();
    const operationId = randomUUID();
    const evidence = await createP3EvidenceRun(nativeConfig.evidence_root,
      { operationId, metadata: { case_id: nativeConfig.case_id ?? null,
        role_config: configs, provider_attempt_budget: P3_ATTEMPT_BUDGET,
        native_binary: nativeConfig.binary, native_root: nativeConfig.nativeRoot,
        intent } });
    const budget = createP3AttemptBudget({
      onAttempt: event => evidence.record({ event: 'provider_attempt', ...event })
    });
    const roles = createP3RoleRuntime({ budget });
    const adapter = createP3NativeProcessAdapter(nativeConfig);
    const observation = await adapter.refreshObservation();
    const result = await runP3TurnStep({ intent, observation, nativeAdapter: adapter,
      turnStepModel: roles.turnStepModel, operationId });
    await evidence.record({ event: 'native_turn_result', result });
    const readback = result.working_projection?.native_readback ?? null;
    process.stdout.write(`${JSON.stringify({ result, evidence_directory: evidence.directory,
      provider_calls: budget.calls, native_execution_verified: readback?.status === 'applied' }, null, 2)}\n`);
    return;
  }
  if (args[0] === '--run-npc' && args.length === 5 && args[1] === '--native-config'
      && args[3] === '--actor-id') {
    const nativeConfig = await jsonFile(args[2]);
    const configs = validateP3RoleConfigs();
    const operationId = randomUUID();
    const evidence = await createP3EvidenceRun(nativeConfig.evidence_root,
      { operationId, metadata: { case_id: nativeConfig.case_id ?? 'T09',
        role_config: configs, provider_attempt_budget: P3_ATTEMPT_BUDGET,
        native_binary: nativeConfig.binary, native_root: nativeConfig.nativeRoot,
        native_npc_actor_id: args[4] } });
    const budget = createP3AttemptBudget({
      onAttempt: event => evidence.record({ event: 'provider_attempt', ...event })
    });
    const roles = createP3RoleRuntime({ budget });
    const nativeAdapter = createP3NativeProcessAdapter(nativeConfig);
    const checkpoint = await runP3NativeNpcFlow({ nativeAdapter, actorId: args[4],
      semanticModel: roles.npcAutonomousModel, evidence });
    process.stdout.write(`${JSON.stringify({ checkpoint,
      evidence_directory: evidence.directory, provider_calls: budget.calls,
      native_execution_verified: checkpoint.native_readback?.status === 'applied' }, null, 2)}\n`);
    return;
  }
  if (args[0] === '--run-sealed' && args.length === 5 && args[1] === '--native-config'
      && args[3] === '--case-pack') {
    const nativeConfig = await jsonFile(args[2]);
    const casePack = await jsonFile(args[4]);
    const configs = validateP3RoleConfigs();
    const result = await runP3SealedPackage({ casePack, nativeConfig, roleConfigs: configs,
      createRuntime: ({ budget }) => createP3RoleRuntime({ budget }) });
    process.stdout.write(`${JSON.stringify({ ...result, role_config: configs }, null, 2)}\n`);
    return;
  }
  if (args[0] === '--dry-run') {
    const value = Object.fromEntries(args.slice(1).reduce((pairs, arg, index, list) => {
      if (arg.startsWith('--') && list[index + 1] && !list[index + 1].startsWith('--')) pairs.push([arg, list[index + 1]]);
      return pairs;
    }, []));
    const caseId = value['--case'];
    const root = value['--evidence-root'];
    const operationId = value['--operation-id'];
    if (!caseId || !root || !operationId) throw new Error('P3_DRY_RUN_ARGUMENTS_REQUIRED');
    requireP3CaseId(caseId);
    const evidence = await createP3EvidenceRun(root, { operationId,
      metadata: { case_id: caseId, reset_count: 3, native_seed: 17,
        global_provider_attempt_budget: P3_ATTEMPT_BUDGET,
        status: 'prepared_without_model_or_native_execution' } });
    process.stdout.write(`${JSON.stringify({ evidence_directory: evidence.directory,
      provider_calls: 0, native_calls: 0, status: 'prepared_without_model_or_native_execution' }, null, 2)}\n`);
    return;
  }
  throw new Error('P3_ARGUMENTS_INVALID');
}

main(process.argv.slice(2)).catch(error => {
  process.stderr.write(`${error?.code ?? error?.message ?? 'P3_RUNNER_FAILED'}\n`);
  process.exitCode = 2;
});
