#!/usr/bin/env node
import { resolve } from 'node:path';
import { createRepositoryIntelligenceService, RepositoryIntelligenceError } from './index.js';

const [command, ...args] = process.argv.slice(2);

try {
  const service = createRepositoryIntelligenceService({ root: resolve(option('--root') ?? '.') });
  const handlers = {
    status: () => service.status(),
    query: () => service.query({ query: option('--query') }),
    build: () => service.build()
  };
  if (!handlers[command]) throw new RepositoryIntelligenceError('INVALID_ARGUMENT', 'Use status, query or build.');
  const result = await handlers[command]();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.ok === false) process.exitCode = 1;
} catch (cause) {
  process.stderr.write(`${JSON.stringify({
    schema_version: 'rus.repository_intelligence_error.v1',
    code: cause.code ?? 'INTERNAL_ERROR',
    message: cause.message,
    details: cause.details ?? {}
  }, null, 2)}\n`);
  process.exitCode = cause.code === 'INVALID_ARGUMENT' ? 2 : 1;
}

function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new RepositoryIntelligenceError('INVALID_ARGUMENT', `${name} requires a value.`);
  return value;
}
