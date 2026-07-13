import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let cachedRunbook = null;

export function loadBaseTurnOrchestrationRunbook() {
  if (cachedRunbook) return cachedRunbook;
  const path = resolve(process.cwd(), 'DOCUMENTS', 'documents-kg', 'corpus', 'DOCUMENTS', 'base_turn_orcestration.txt');
  cachedRunbook = readFileSync(path, 'utf8');
  return cachedRunbook;
}
