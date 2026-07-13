export function assertStage25Ports({
  physicalPlanAdapter,
  idempotencyChecker,
  dryRunExecutor,
  transactionExecutor,
  postcommitReader
} = {}) {
  for (const [name, value] of Object.entries({ physicalPlanAdapter, idempotencyChecker, dryRunExecutor, transactionExecutor, postcommitReader })) {
    if (value != null && typeof value !== 'function') throw new TypeError(`Stage 25 ${name} must be a function when provided.`);
  }
  for (const [name, value] of Object.entries({ idempotencyChecker, dryRunExecutor, transactionExecutor, postcommitReader })) {
    if (typeof value !== 'function') throw new TypeError(`Stage 25 ${name} must be a function.`);
  }
  return Object.freeze({ physicalPlanAdapter, idempotencyChecker, dryRunExecutor, transactionExecutor, postcommitReader });
}
