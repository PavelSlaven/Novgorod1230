// Rebuild every places-binding table in dependency order, then validate.
// Usage: node scripts/build-all.mjs [--extract]   (--extract re-reads the PR #98 worktree)
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { SCRIPTS } from './lib.mjs';

const steps = [
  ...(process.argv.includes('--extract') ? ['extract-pr98-inputs.mjs'] : []),
  'build-place-families.mjs', 'build-node-binding.mjs', 'build-category-registry.mjs',
  'build-presence-rules.mjs', 'build-generation-limits.mjs', 'build-category-parameters.mjs', 'validate.mjs',
];
for (const s of steps) execFileSync(process.execPath, [path.join(SCRIPTS, s)], { stdio: 'inherit' });
