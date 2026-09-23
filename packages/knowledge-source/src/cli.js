#!/usr/bin/env node
import { resolve } from 'node:path';
import { createFileSystemKnowledgeSourceStorage } from './adapters/filesystem-storage.js';
import { createKnowledgeSourceReader } from './services/reader.js';
import { createKnowledgeRagReader } from './services/rag-reader.js';
import { KnowledgeSourceError } from './errors.js';

const args = process.argv.slice(2);
const command = args[0] ?? '';

try {
  const root = resolve(option(args, '--root') ?? '.');
  const statuses = csvOption(args, '--statuses') ?? ['active'];
  const storage = createFileSystemKnowledgeSourceStorage({
    sourceRoot: resolve(root, 'data/knowledge-source'),
    generatedRoot: resolve(root, 'generated/knowledge-source')
  });
  const sourceReader = createKnowledgeSourceReader({ storage, allowedStatuses: statuses });
  const ragReader = createKnowledgeRagReader({ storage, allowedStatuses: statuses });

  let result;
  if (command === 'query') {
    const query = requiredOption(args, '--query');
    result = await ragReader.searchKnowledge({
      query,
      limit: integerOption(args, '--limit'),
      statuses,
      allowed_document_ids: csvOption(args, '--document-ids')
    });
  } else if (command === 'read') {
    const document_id = requiredOption(args, '--document-id');
    const section = option(args, '--section');
    const start_line = option(args, '--start-line');
    const end_line = option(args, '--end-line');
    if (section && (start_line || end_line)) throw cliError('Use --section or --start-line/--end-line.');
    result = section || start_line || end_line
      ? await sourceReader.resolveSourceLocation({ document_id, section, start_line, end_line })
      : await sourceReader.getDocument({ document_id });
  } else if (command === 'status') {
    result = await ragReader.getReadinessStatus();
  } else if (command === 'controls') {
    result = await ragReader.runControlQueries({ query_ids: csvOption(args, '--query-ids') });
    if (!result.ok) process.exitCode = 1;
  } else {
    throw cliError('Unknown command. Use query, read, status or controls.');
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  const payload = {
    schema_version: 'rus.knowledge_cli_error.v1',
    code: error?.code ?? 'KNOWLEDGE_CLI_FAILED',
    message: String(error?.message ?? error),
    details: error?.details ?? null
  };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = error?.code === 'CLI_ARGUMENT_INVALID' ? 2 : 1;
}

function requiredOption(values, name) {
  const value = option(values, name);
  if (!value) throw cliError(`${name} is required.`);
  return value;
}

function option(values, name) {
  const index = values.indexOf(name);
  if (index < 0) return null;
  const value = values[index + 1];
  if (!value || value.startsWith('--')) throw cliError(`${name} requires a value.`);
  return value;
}

function csvOption(values, name) {
  const value = option(values, name);
  if (value == null) return null;
  const items = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) throw cliError(`${name} requires at least one value.`);
  return items;
}

function integerOption(values, name) {
  const value = option(values, name);
  if (value == null) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) throw cliError(`${name} must be an integer from 1 to 100.`);
  return parsed;
}

function cliError(message) {
  return new KnowledgeSourceError('CLI_ARGUMENT_INVALID', message);
}
