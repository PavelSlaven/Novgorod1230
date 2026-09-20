import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRevision } from './generator.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(await readFile(resolve(here, 'source-authoring.json'), 'utf8'));
const candidate = JSON.parse(await readFile(resolve(here, 'candidate.json'), 'utf8'));
const approvalRequest = JSON.parse(await readFile(resolve(here, 'approval-request.json'), 'utf8'));

validateRevision({ source, candidate, approvalRequest });
process.stdout.write(`${JSON.stringify({ pass: true,
  candidate_digest: candidate.candidate_digest,
  approval_request_digest: approvalRequest.request_digest }, null, 2)}\n`);
