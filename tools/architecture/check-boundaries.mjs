import { readFile, readdir } from 'node:fs/promises';
import { join, relative, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceRoots = ['apps', 'packages'];
const hardBytes = 25 * 1024;
const violations = [];

for (const sourceRoot of sourceRoots) {
  for (const file of await walk(join(root, sourceRoot))) {
    if (!['.js', '.mjs'].includes(extname(file))) continue;
    const rel = relative(root, file).replaceAll('\\', '/');
    const text = await readFile(file, 'utf8');
    const size = Buffer.byteLength(text);
    if (size > hardBytes) violations.push(`${rel}: ${size} bytes exceeds hard module limit ${hardBytes}`);
    for (const specifier of importsOf(text)) {
      if (rel.startsWith('packages/') && specifier.includes('/apps/')) violations.push(`${rel}: packages may not import apps (${specifier})`);
      if (rel.startsWith('packages/') && specifier.includes('/legacy/')) {
        const allowed = rel === 'packages/new-game/src/legacy-adapter.js';
        if (!allowed) violations.push(`${rel}: legacy import is only permitted in named compatibility adapters`);
      }
      if (rel.startsWith('apps/game-web/') && specifier.includes('game-server')) violations.push(`${rel}: web app may not import server app`);
    }
  }
}


const knowledgeSourceRoot = join(root, 'packages/knowledge-source');
for (const requiredPath of ['MODULE.md', 'package.json', 'src/index.js', 'src/errors.js', 'src/services/reader.js', 'src/adapters/filesystem-storage.js']) {
  try { await readFile(join(knowledgeSourceRoot, requiredPath)); }
  catch { violations.push(`packages/knowledge-source/${requiredPath}: required knowledge-source file is missing`); }
}
for (const file of await walk(knowledgeSourceRoot)) {
  if (!['.js', '.mjs'].includes(extname(file))) continue;
  const rel = relative(root, file).replaceAll('\\', '/');
  const source = await readFile(file, 'utf8');
  for (const token of ['legacy/', '/apps/', '@rus/llm-runtime', '@rus/party-store', '@rus/world-base', "from 'pg'", 'from "pg"', 'Math.random(', 'SELECT ', 'INSERT ', 'UPDATE ', 'DELETE FROM ']) {
    if (source.includes(token)) violations.push(`${rel}: forbidden knowledge-source dependency or side effect ${token}`);
  }
}
for (const sourceRoot of ['apps', 'packages']) {
  for (const file of await walk(join(root, sourceRoot))) {
    if (!['.js', '.mjs', '.json'].includes(extname(file))) continue;
    const rel = relative(root, file).replaceAll('\\', '/');
    const source = await readFile(file, 'utf8');
    if (/legacy[\\/]DOCUMENTS|DOCUMENTS[\\/]documents-kg/u.test(source)) violations.push(`${rel}: production source may not reference legacy DOCUMENTS`);
  }
}
const stage26FacadePath = join(root, 'legacy/src/world/new-game-pipeline/stages/stage26-first-game-screen.js');
const stage26Facade = await readFile(stage26FacadePath, 'utf8');
if (!stage26Facade.includes("@rus/new-game/stages/stage-26/compat")) violations.push('legacy Stage 26 must delegate to the modular compatibility entry point');
if (stage26Facade.includes('function ')) violations.push('legacy Stage 26 facade must not contain implementation functions');
if (stage26Facade.split('\n').length > 10) violations.push('legacy Stage 26 facade exceeds 10 lines');
for (const forbidden of ['stage22-narrator-prose.js', 'stage23-narrator-prose-audit.js', 'stage25-party-commit.js']) {
  if (stage26Facade.includes(forbidden)) violations.push(`legacy Stage 26 may not import sibling stage ${forbidden}`);
}

const stage26Root = join(root, 'packages/new-game/src/stages/stage-26-first-game-screen');
const stage26Files = (await walk(stage26Root)).filter((file) => ['.js', '.mjs'].includes(extname(file)));
const stage26Forbidden = ['legacy/', 'stage21-', 'stage22-', 'stage23-', 'stage24-', 'stage25-', '@rus/presentation', '@rus/party-store', '@rus/world-base', 'provider.js', '/ui/'];
for (const file of stage26Files) {
  const rel = relative(root, file).replaceAll('\\', '/');
  const text = await readFile(file, 'utf8');
  if (text.split('\n').length > 500) violations.push(`${rel}: exceeds 500 line Stage 26 limit`);
  if (Buffer.byteLength(text) > hardBytes) violations.push(`${rel}: exceeds Stage 26 hard byte limit`);
  for (const token of stage26Forbidden) if (text.includes(token)) violations.push(`${rel}: forbidden Stage 26 dependency ${token}`);
}
const stage26PublicIndex = await readFile(join(stage26Root, 'index.js'), 'utf8');
const stage26PublicExports = (stage26PublicIndex.match(/\bexport\b/g) ?? []).length;
if (stage26PublicExports > 8) violations.push(`Stage 26 public API exposes ${stage26PublicExports} statements; limit is 8`);

const stage26Graph = new Map();
const stage26Set = new Set(stage26Files.map((file) => resolve(file)));
for (const file of stage26Files) {
  const text = await readFile(file, 'utf8');
  const deps = [];
  for (const specifier of importsOf(text)) {
    if (!specifier.startsWith('.')) continue;
    const resolved = resolve(dirname(file), specifier);
    const candidate = stage26Set.has(resolved) ? resolved : stage26Set.has(`${resolved}.js`) ? `${resolved}.js` : null;
    if (candidate) deps.push(candidate);
  }
  stage26Graph.set(resolve(file), deps);
}
for (const cycle of findCycles(stage26Graph)) {
  violations.push(`Stage 26 cyclic import: ${cycle.map((file) => relative(root, file).replaceAll('\\', '/')).join(' -> ')}`);
}


const stage25FacadePath = join(root, 'legacy/src/world/new-game-pipeline/stages/stage25-party-commit.js');
const stage25Facade = await readFile(stage25FacadePath, 'utf8');
if (!stage25Facade.includes("@rus/new-game/stages/stage-25/compat")) violations.push('legacy Stage 25 must delegate to the modular compatibility entry point');
if (stage25Facade.includes('function ')) violations.push('legacy Stage 25 facade must not contain implementation functions');
if (stage25Facade.split('\n').length > 5) violations.push('legacy Stage 25 facade exceeds 5 lines');
for (const forbidden of ['stage24-party-db-write-plan.js', 'stage26-first-game-screen.js']) {
  if (stage25Facade.includes(forbidden)) violations.push(`legacy Stage 25 may not import sibling stage ${forbidden}`);
}

const stage25Root = join(root, 'packages/new-game/src/stages/stage-25-party-commit');
const stage25Files = (await walk(stage25Root)).filter((file) => ['.js', '.mjs'].includes(extname(file)));
const stage25Forbidden = ['legacy/', 'stage24-party-db-write-plan.js', 'stage26-first-game-screen.js', 'provider.js', '/ui/', "from 'pg'", 'from "pg"'];
for (const file of stage25Files) {
  const rel = relative(root, file).replaceAll('\\', '/');
  const text = await readFile(file, 'utf8');
  if (text.split('\n').length > 500) violations.push(`${rel}: exceeds 500 line Stage 25 limit`);
  if (Buffer.byteLength(text) > hardBytes) violations.push(`${rel}: exceeds Stage 25 hard byte limit`);
  for (const token of stage25Forbidden) if (text.includes(token)) violations.push(`${rel}: forbidden Stage 25 dependency ${token}`);
}
const stage25Orchestrator = await readFile(join(stage25Root, 'orchestration/run-stage-25.js'), 'utf8');
if (stage25Orchestrator.split('\n').length > 250) violations.push('Stage 25 orchestrator exceeds 250 lines');
const stage25PublicIndex = await readFile(join(stage25Root, 'index.js'), 'utf8');
const stage25PublicExports = (stage25PublicIndex.match(/\bexport\b/g) ?? []).length;
if (stage25PublicExports > 8) violations.push(`Stage 25 public API exposes ${stage25PublicExports} statements; limit is 8`);

const stage25Graph = new Map();
const stage25Set = new Set(stage25Files.map((file) => resolve(file)));
for (const file of stage25Files) {
  const text = await readFile(file, 'utf8');
  const deps = [];
  for (const specifier of importsOf(text)) {
    if (!specifier.startsWith('.')) continue;
    const resolved = resolve(dirname(file), specifier);
    const candidate = stage25Set.has(resolved) ? resolved : stage25Set.has(`${resolved}.js`) ? `${resolved}.js` : null;
    if (candidate) deps.push(candidate);
  }
  stage25Graph.set(resolve(file), deps);
}
for (const cycle of findCycles(stage25Graph)) {
  violations.push(`Stage 25 cyclic import: ${cycle.map((file) => relative(root, file).replaceAll('\\', '/')).join(' -> ')}`);
}


const stage24FacadePath = join(root, 'legacy/src/world/new-game-pipeline/stages/stage24-party-db-write-plan.js');
const stage24Facade = await readFile(stage24FacadePath, 'utf8');
if (!stage24Facade.includes("@rus/new-game/stages/stage-24/compat")) violations.push('legacy Stage 24 must delegate to the modular compatibility entry point');
if (stage24Facade.includes('function ')) violations.push('legacy Stage 24 facade must not contain implementation functions');
if (stage24Facade.split('\n').length > 5) violations.push('legacy Stage 24 facade exceeds 5 lines');
for (const forbidden of ['stage23-narrator-prose-audit.js', 'stage25-party-commit.js']) {
  if (stage24Facade.includes(forbidden)) violations.push(`legacy Stage 24 may not import sibling stage ${forbidden}`);
}

const stage24Root = join(root, 'packages/new-game/src/stages/stage-24-party-db-write-plan');
const stage24Files = (await walk(stage24Root)).filter((file) => ['.js', '.mjs'].includes(extname(file)));
const stage24Forbidden = ['legacy/', 'stage23-narrator-prose-audit.js', 'stage25-party-commit.js', '@rus/party-store', 'provider.js', '/ui/', "from 'pg'", 'from "pg"'];
for (const file of stage24Files) {
  const rel = relative(root, file).replaceAll('\\', '/');
  const text = await readFile(file, 'utf8');
  if (text.split('\n').length > 500) violations.push(`${rel}: exceeds 500 line Stage 24 limit`);
  if (Buffer.byteLength(text) > hardBytes) violations.push(`${rel}: exceeds Stage 24 hard byte limit`);
  for (const token of stage24Forbidden) if (text.includes(token)) violations.push(`${rel}: forbidden Stage 24 dependency ${token}`);
}
const stage24Orchestrator = await readFile(join(stage24Root, 'orchestration/run-stage-24.js'), 'utf8');
if (stage24Orchestrator.split('\n').length > 250) violations.push('Stage 24 orchestrator exceeds 250 lines');
const stage24PublicIndex = await readFile(join(stage24Root, 'index.js'), 'utf8');
const stage24PublicExports = (stage24PublicIndex.match(/\bexport\b/g) ?? []).length;
if (stage24PublicExports > 8) violations.push(`Stage 24 public API exposes ${stage24PublicExports} statements; limit is 8`);

const stage24Graph = new Map();
const stage24Set = new Set(stage24Files.map((file) => resolve(file)));
for (const file of stage24Files) {
  const text = await readFile(file, 'utf8');
  const deps = [];
  for (const specifier of importsOf(text)) {
    if (!specifier.startsWith('.')) continue;
    const resolved = resolve(dirname(file), specifier);
    const candidate = stage24Set.has(resolved) ? resolved : stage24Set.has(`${resolved}.js`) ? `${resolved}.js` : null;
    if (candidate) deps.push(candidate);
  }
  stage24Graph.set(resolve(file), deps);
}
for (const cycle of findCycles(stage24Graph)) {
  violations.push(`Stage 24 cyclic import: ${cycle.map((file) => relative(root, file).replaceAll('\\', '/')).join(' -> ')}`);
}



for (const stage of [
  {
    id: 13,
    slug: 'stage-13-g5-materialization',
    facade: 'stage13-g5-materialization.js',
    compat: '@rus/new-game/stages/stage-13/compat',
    maxOrchestratorLines: 250,
    forbidden: ['legacy/', '/stage-14-', '/stage-15-', '/stage-16-', '/stage-17-', 'provider.js', '/ui/', '/server/', '@rus/party-store', '@rus/world-base', "from 'pg'", 'from "pg"']
  },
  {
    id: 14,
    slug: 'stage-14-g5-audit',
    facade: 'stage14-g5-audit.js',
    compat: '@rus/new-game/stages/stage-14/compat',
    maxOrchestratorLines: 250,
    forbidden: ['legacy/', '/stage-13-g5-materialization/', '/stage-15-', '/stage-16-', '/stage-17-', 'provider.js', '/ui/', '/server/', '@rus/party-store', '@rus/world-base', "from 'pg'", 'from "pg"']
  },
  {
    id: 15,
    slug: 'stage-15-npc-placement',
    facade: 'stage15-npc-placement.js',
    compat: '@rus/new-game/stages/stage-15/compat',
    maxOrchestratorLines: 300,
    forbidden: ['legacy/', '/stage-13-', '/stage-14-', '/stage-16-', '/stage-17-', 'provider.js', '/ui/', '/server/', '@rus/party-store', '@rus/world-base', "from 'pg'", 'from "pg"']
  },
  {
    id: 16,
    slug: 'stage-16-item-placement',
    facade: 'stage16-item-placement.js',
    compat: '@rus/new-game/stages/stage-16/compat',
    maxOrchestratorLines: 300,
    forbidden: ['legacy/', '/stage-13-', '/stage-14-', '/stage-15-', '/stage-17-', 'provider.js', '/ui/', '/server/', '@rus/party-store', '@rus/world-base', "from 'pg'", 'from "pg"']
  },
  {
    id: 17,
    slug: 'stage-17-time-light-gate',
    facade: 'stage17-time-light-gate.js',
    compat: '@rus/new-game/stages/stage-17/compat',
    maxOrchestratorLines: 250,
    forbidden: ['legacy/', '/stage-18-', '/stage-19-', '/stage-20-', 'provider.js', '/ui/', "from 'pg'", 'from "pg"']
  },
  {
    id: 18,
    slug: 'stage-18-character-knowledge-map',
    facade: 'stage18-character-knowledge-map.js',
    compat: '@rus/new-game/stages/stage-18/compat',
    maxOrchestratorLines: 300,
    forbidden: ['legacy/', '/stage-17-', '/stage-19-', '/stage-20-', '@rus/party-store', '@rus/world-base', 'provider.js', '/ui/', "from 'pg'", 'from "pg"']
  },
  {
    id: 19,
    slug: 'stage-19-hidden-state',
    facade: 'stage19-hidden-state.js',
    compat: '@rus/new-game/stages/stage-19/compat',
    maxOrchestratorLines: 300,
    forbidden: ['legacy/', '/stage-17-', '/stage-18-', '/stage-20-', '@rus/party-store', '@rus/world-base', 'provider.js', '/ui/', "from 'pg'", 'from "pg"']
  },
  {
    id: 20,
    slug: 'stage-20-visible-context',
    facade: 'stage20-visible-context.js',
    compat: '@rus/new-game/stages/stage-20/compat',
    maxOrchestratorLines: 300,
    forbidden: ['legacy/', 'stage21-', 'stage22-', 'stage23-', 'stage24-', 'stage25-', 'stage26-', '@rus/party-store', '@rus/world-base', 'provider.js', '/ui/', "from 'pg'", 'from "pg"']
  },
  {
    id: 21,
    slug: 'stage-21-visible-context-audit',
    facade: 'stage21-visible-context-audit.js',
    compat: '@rus/new-game/stages/stage-21/compat',
    maxOrchestratorLines: 250,
    forbidden: ['legacy/', 'stage20-visible-context.js', '/stage-20-visible-context/', 'stage22-', 'stage23-', 'stage24-', 'stage25-', 'stage26-', '@rus/party-store', '@rus/world-base', 'provider.js', '/ui/', "from 'pg'", 'from "pg"']
  },
  {
    id: 22,
    slug: 'stage-22-narrator-prose',
    facade: 'stage22-narrator-prose.js',
    compat: '@rus/new-game/stages/stage-22/compat',
    maxOrchestratorLines: 300,
    forbidden: ['legacy/', 'stage21-', 'stage23-', 'stage24-', '@rus/party-store', '@rus/world-base', 'provider.js', '/ui/', "from 'pg'", 'from "pg"']
  },
  {
    id: 23,
    slug: 'stage-23-narrator-prose-audit',
    facade: 'stage23-narrator-prose-audit.js',
    compat: '@rus/new-game/stages/stage-23/compat',
    maxOrchestratorLines: 250,
    forbidden: ['legacy/', 'stage22-narrator-prose.js', 'stage24-', '@rus/party-store', '@rus/world-base', 'provider.js', '/ui/', "from 'pg'", 'from "pg"']
  }
]) {
  const facadePath = join(root, 'legacy/src/world/new-game-pipeline/stages', stage.facade);
  const facade = await readFile(facadePath, 'utf8');
  if (!facade.includes(stage.compat)) violations.push(`legacy Stage ${stage.id} must delegate to ${stage.compat}`);
  if (facade.includes('function ')) violations.push(`legacy Stage ${stage.id} facade must not contain implementation functions`);
  if (facade.split('\n').length > 5) violations.push(`legacy Stage ${stage.id} facade exceeds 5 lines`);

  const stageRoot = join(root, 'packages/new-game/src/stages', stage.slug);
  const stageFiles = (await walk(stageRoot)).filter((file) => ['.js', '.mjs'].includes(extname(file)));
  for (const file of stageFiles) {
    const rel = relative(root, file).replaceAll('\\', '/');
    const text = await readFile(file, 'utf8');
    if (text.split('\n').length > 500) violations.push(`${rel}: exceeds 500 line Stage ${stage.id} limit`);
    if (Buffer.byteLength(text) > hardBytes) violations.push(`${rel}: exceeds Stage ${stage.id} hard byte limit`);
    for (const token of stage.forbidden) if (text.includes(token)) violations.push(`${rel}: forbidden Stage ${stage.id} dependency ${token}`);
  }
  const orchestratorName = `run-stage-${stage.id}.js`;
  const orchestrator = await readFile(join(stageRoot, 'orchestration', orchestratorName), 'utf8');
  if (orchestrator.split('\n').length > stage.maxOrchestratorLines) violations.push(`Stage ${stage.id} orchestrator exceeds ${stage.maxOrchestratorLines} lines`);
  const publicIndex = await readFile(join(stageRoot, 'index.js'), 'utf8');
  const publicExports = (publicIndex.match(/\bexport\b/g) ?? []).length;
  if (publicExports > 8) violations.push(`Stage ${stage.id} public API exposes ${publicExports} statements; limit is 8`);

  const graph = new Map();
  const fileSet = new Set(stageFiles.map((file) => resolve(file)));
  for (const file of stageFiles) {
    const text = await readFile(file, 'utf8');
    const deps = [];
    for (const specifier of importsOf(text)) {
      if (!specifier.startsWith('.')) continue;
      const resolved = resolve(dirname(file), specifier);
      const candidate = fileSet.has(resolved) ? resolved : fileSet.has(`${resolved}.js`) ? `${resolved}.js` : null;
      if (candidate) deps.push(candidate);
    }
    graph.set(resolve(file), deps);
  }
  for (const cycle of findCycles(graph)) {
    violations.push(`Stage ${stage.id} cyclic import: ${cycle.map((file) => relative(root, file).replaceAll('\\', '/')).join(' -> ')}`);
  }
}



for (const stage of [
  [2, 'stage-2-normalization', 'stage2-normalization.js'],
  [3, 'stage-3-historical-frame', 'stage3-historical-frame.js'],
  [4, 'stage-4-regional-context', 'stage4-regional-context.js'],
  [5, 'stage-5-start-candidates', 'stage5-start-candidates.js'],
  [6, 'stage-6-candidate-place-templates', 'stage6-candidate-place-templates.js'],
  [7, 'stage-7-npc-candidates', 'stage7-npc-candidates.js'],
  [8, 'stage-8-item-profile-candidates', 'stage8-item-profile-candidates.js']
]) {
  const [id, slug, facadeName] = stage;
  const facade = await readFile(join(root, 'legacy/src/world/new-game-pipeline/stages', facadeName), 'utf8');
  if (!facade.includes(`@rus/new-game/stages/stage-${id}/compat`)) violations.push(`legacy Stage ${id} must delegate to modular compatibility entry point`);
  if (facade.includes('function ')) violations.push(`legacy Stage ${id} facade must not contain implementation functions`);
  if (facade.split('\n').length > 3) violations.push(`legacy Stage ${id} facade exceeds 3 lines`);
  const files = (await walk(join(root, 'packages/new-game/src/stages', slug))).filter((file) => ['.js', '.mjs'].includes(extname(file)));
  for (const file of files) {
    const rel = relative(root, file).replaceAll('\\', '/');
    const text = await readFile(file, 'utf8');
    if (text.split('\n').length > 500) violations.push(`${rel}: exceeds 500 line Stage ${id} limit`);
    if (Buffer.byteLength(text) > hardBytes) violations.push(`${rel}: exceeds Stage ${id} hard byte limit`);
    if (!rel.endsWith('/compat.js') && text.includes('legacy-adapter.js')) violations.push(`${rel}: core Stage ${id} may not depend on legacy adapter`);
  }
}


for (const stage of [
  [9, 'stage-9-start-node-selection', 'stage9-start-node-selection.js'],
  [10, 'stage-10-start-place-audit', 'stage10-start-place-audit.js'],
  [11, 'stage-11-player-character', 'stage11-player-character.js'],
  [12, 'stage-12-player-character-audit', 'stage12-player-character-audit.js']
]) {
  const [id, slug, facadeName] = stage;
  for (const legacyRoot of [
    'legacy/src/world/new-game-pipeline/stages',
    'legacy/dist/release/src/world/new-game-pipeline/stages'
  ]) {
    let facade = null;
    try { facade = await readFile(join(root, legacyRoot, facadeName), 'utf8'); }
    catch {
      if (legacyRoot.startsWith('legacy/src/')) violations.push(`${legacyRoot}/${facadeName}: required facade is missing`);
      continue;
    }
    if (!facade.includes(`@rus/new-game/stages/stage-${id}/compat`)) violations.push(`${legacyRoot}/${facadeName}: must delegate to modular compatibility entry point`);
    if (facade.includes('function ')) violations.push(`${legacyRoot}/${facadeName}: facade must not contain implementation functions`);
    if (facade.trim().split('\n').length > 1) violations.push(`${legacyRoot}/${facadeName}: facade exceeds one line`);
  }

  const stageRoot = join(root, 'packages/new-game/src/stages', slug);
  const stageFiles = (await walk(stageRoot)).filter((file) => ['.js', '.mjs'].includes(extname(file)));
  const stageSet = new Set(stageFiles.map((file) => resolve(file)));
  const graph = new Map();
  for (const file of stageFiles) {
    const rel = relative(root, file).replaceAll('\\', '/');
    const text = await readFile(file, 'utf8');
    if (text.split('\n').length > 500) violations.push(`${rel}: exceeds 500 line Stage ${id} limit`);
    if (Buffer.byteLength(text) > hardBytes) violations.push(`${rel}: exceeds Stage ${id} hard byte limit`);
    for (const token of ['legacy/', '@rus/world-base', '@rus/party-store', 'provider.js', '/ui/', '/server/', "from 'pg'", 'from "pg"']) {
      if (text.includes(token)) violations.push(`${rel}: forbidden Stage ${id} dependency ${token}`);
    }
    const deps = [];
    for (const specifier of importsOf(text)) {
      if (!specifier.startsWith('.')) continue;
      const candidateBase = resolve(dirname(file), specifier);
      const candidate = stageSet.has(candidateBase) ? candidateBase : stageSet.has(`${candidateBase}.js`) ? `${candidateBase}.js` : null;
      if (candidate) deps.push(candidate);
    }
    graph.set(resolve(file), deps);
  }
  for (const cycle of findCycles(graph)) {
    violations.push(`Stage ${id} cyclic import: ${cycle.map((file) => relative(root, file).replaceAll('\\', '/')).join(' -> ')}`);
  }
  const publicIndex = await readFile(join(stageRoot, 'index.js'), 'utf8');
  const publicExports = (publicIndex.match(/\bexport\b/g) ?? []).length;
  if (publicExports > 8) violations.push(`Stage ${id} public API exposes ${publicExports} statements; limit is 8`);
}

const g5SceneRoot = join(root, 'packages/new-game/src/g5-scene');
const g5SceneFiles = (await walk(g5SceneRoot)).filter((file) => ['.js', '.mjs'].includes(extname(file)));
for (const file of g5SceneFiles) {
  const rel = relative(root, file).replaceAll('\\', '/');
  const text = await readFile(file, 'utf8');
  if (text.split('\n').length > 500) violations.push(`${rel}: exceeds 500 line g5-scene boundary limit`);
  if (Buffer.byteLength(text) > hardBytes) violations.push(`${rel}: exceeds g5-scene boundary hard byte limit`);
  for (const token of ['/stages/', 'legacy/', '@rus/party-store', '@rus/world-base', 'provider.js', '/ui/', '/server/', "from 'pg'", 'from "pg"']) {
    if (text.includes(token)) violations.push(`${rel}: forbidden g5-scene boundary dependency ${token}`);
  }
}

const timeLightRoot = join(root, 'packages/new-game/src/time-light');
const timeLightFiles = (await walk(timeLightRoot)).filter((file) => ['.js', '.mjs'].includes(extname(file)));
for (const file of timeLightFiles) {
  const rel = relative(root, file).replaceAll('\\', '/');
  const text = await readFile(file, 'utf8');
  if (text.split('\n').length > 500) violations.push(`${rel}: exceeds 500 line time-light boundary limit`);
  if (Buffer.byteLength(text) > hardBytes) violations.push(`${rel}: exceeds time-light boundary hard byte limit`);
  for (const token of ['/stages/', 'legacy/', '@rus/party-store', '@rus/world-base', 'provider.js', '/ui/', "from 'pg'", 'from "pg"']) {
    if (text.includes(token)) violations.push(`${rel}: forbidden time-light boundary dependency ${token}`);
  }
}

const visibleContextRoot = join(root, 'packages/new-game/src/visible-context');
const visibleContextFiles = (await walk(visibleContextRoot)).filter((file) => ['.js', '.mjs'].includes(extname(file)));
for (const file of visibleContextFiles) {
  const rel = relative(root, file).replaceAll('\\', '/');
  const text = await readFile(file, 'utf8');
  if (text.split('\n').length > 500) violations.push(`${rel}: exceeds 500 line visible-context boundary limit`);
  if (Buffer.byteLength(text) > hardBytes) violations.push(`${rel}: exceeds visible-context boundary hard byte limit`);
  for (const token of ['/stages/', 'legacy/', '@rus/party-store', '@rus/world-base', 'provider.js', '/ui/', "from 'pg'", 'from "pg"']) {
    if (text.includes(token)) violations.push(`${rel}: forbidden visible-context boundary dependency ${token}`);
  }
}

const newGameOrchestratorRoot = join(root, 'packages/new-game/src/orchestrator');
const newGameOrchestratorFiles = (await walk(newGameOrchestratorRoot)).filter((file) => ['.js', '.mjs'].includes(extname(file)));
const newGameOrchestratorSet = new Set(newGameOrchestratorFiles.map((file) => resolve(file)));
const newGameOrchestratorGraph = new Map();
for (const file of newGameOrchestratorFiles) {
  const rel = relative(root, file).replaceAll('\\', '/');
  const source = await readFile(file, 'utf8');
  if (source.split('\n').length > 350) violations.push(`${rel}: exceeds 350 line new-game orchestrator limit`);
  if (Buffer.byteLength(source) > hardBytes) violations.push(`${rel}: exceeds new-game orchestrator hard byte limit`);
  for (const token of ['legacy/', 'legacy-adapter', '/apps/', '/ui/', '/server/', 'provider.js', "from 'pg'", 'from "pg"']) {
    if (source.includes(token)) violations.push(`${rel}: forbidden new-game orchestrator dependency ${token}`);
  }
  const deps = [];
  for (const specifier of importsOf(source)) {
    if (!specifier.startsWith('.')) continue;
    const candidateBase = resolve(dirname(file), specifier);
    const candidate = newGameOrchestratorSet.has(candidateBase) ? candidateBase : newGameOrchestratorSet.has(`${candidateBase}.js`) ? `${candidateBase}.js` : null;
    if (candidate) deps.push(candidate);
  }
  newGameOrchestratorGraph.set(resolve(file), deps);
}
for (const cycle of findCycles(newGameOrchestratorGraph)) {
  violations.push(`New-game orchestrator cyclic import: ${cycle.map((file) => relative(root, file).replaceAll('\\', '/')).join(' -> ')}`);
}
const newGameOrchestratorIndex = await readFile(join(newGameOrchestratorRoot, 'index.js'), 'utf8');
if ((newGameOrchestratorIndex.match(/\bexport\b/g) ?? []).length > 5) violations.push('New-game orchestrator public API exceeds 5 export statements');


const domainModuleNames = [
  'actors',
  'body-state',
  'items-property',
  'space-map',
  'movement-routes',
  'time-events-history',
  'checks-rng',
  'combat-health',
  'social-law',
  'visibility-knowledge-memory'
];
const baseApprovedDomainImports = new Set([
  '@rus/kernel',
  '@rus/contracts/spatial-v3/ports',
  '@rus/contracts/spatial-v3/registry'
]);
const approvedDomainImportsByModule = new Map([
  ['items-property', new Set([...baseApprovedDomainImports,
    '@rus/contracts/ordinary-materialization-v1'])],
  ['body-state', new Set([...baseApprovedDomainImports, '@rus/time-events-history'])],
  ['combat-health', new Set([...baseApprovedDomainImports, '@rus/contracts/combat-v1'])],
  ['movement-routes', new Set([...baseApprovedDomainImports, '@rus/time-events-history'])],
  ['visibility-knowledge-memory', new Set([
    ...baseApprovedDomainImports,
    '@rus/actors',
    '@rus/contracts/portrait-spec-v1'
  ])]
]);
const domainSourceByModule = new Map();
for (const moduleName of domainModuleNames) {
  const moduleRoot = join(root, 'packages', moduleName);
  for (const requiredPath of ['MODULE.md', 'package.json', 'src/index.js', 'test/domain.test.js']) {
    try { await readFile(join(moduleRoot, requiredPath), 'utf8'); }
    catch { violations.push(`packages/${moduleName}/${requiredPath}: required domain module file is missing`); }
  }
  const files = (await walk(join(moduleRoot, 'src'))).filter((file) => ['.js', '.mjs'].includes(extname(file)));
  const fileSet = new Set(files.map((file) => resolve(file)));
  const graph = new Map();
  const combined = [];
  for (const file of files) {
    const rel = relative(root, file).replaceAll('\\', '/');
    const source = await readFile(file, 'utf8');
    combined.push(source);
    if (source.split('\n').length > 500) violations.push(`${rel}: exceeds 500 line domain module limit`);
    if (Buffer.byteLength(source) > hardBytes) violations.push(`${rel}: exceeds domain module hard byte limit`);
    for (const token of ['legacy/', '/apps/', '/ui/', '/server/', 'provider.js', '@rus/llm-runtime', '@rus/world-base', '@rus/party-store', '@rus/new-game', '@rus/turn', '@rus/presentation', "from 'pg'", 'from "pg"', 'Math.random(', 'SELECT ', 'INSERT ', 'UPDATE ', 'DELETE FROM ']) {
      if (source.includes(token)) violations.push(`${rel}: forbidden domain dependency or side effect ${token}`);
    }
    const deps = [];
    for (const specifier of importsOf(source)) {
      if (!specifier.startsWith('.')) {
        const approvedImports = approvedDomainImportsByModule.get(moduleName) ?? baseApprovedDomainImports;
        if (!approvedImports.has(specifier) && !specifier.startsWith('node:')) violations.push(`${rel}: domain import is not approved (${specifier})`);
        continue;
      }
      const candidateBase = resolve(dirname(file), specifier);
      const candidate = fileSet.has(candidateBase) ? candidateBase : fileSet.has(`${candidateBase}.js`) ? `${candidateBase}.js` : null;
      if (candidate) deps.push(candidate);
    }
    graph.set(resolve(file), deps);
  }
  for (const cycle of findCycles(graph)) {
    violations.push(`Domain ${moduleName} cyclic import: ${cycle.map((file) => relative(root, file).replaceAll('\\', '/')).join(' -> ')}`);
  }
  domainSourceByModule.set(moduleName, combined.join('\n'));
}
for (const [formulaName, owner] of [
  ['attributeBonus', 'checks-rng'],
  ['calculateTravelTime', 'movement-routes'],
  ['combatQualityFromMargin', 'combat-health'],
  ['applyBodyStateChange', 'body-state']
]) {
  const declarations = [...domainSourceByModule.entries()].filter(([, source]) => new RegExp(`export\\s+function\\s+${formulaName}\\b`).test(source));
  if (declarations.length !== 1 || declarations[0]?.[0] !== owner) {
    violations.push(`${formulaName}: canonical formula owner must be packages/${owner}; found ${declarations.map(([name]) => name).join(', ') || 'none'}`);
  }
}

const temporalPureModules = new Map([
  ['environment-state', 'test/environment-state.test.js'],
  ['npc-runtime', 'test/npc-runtime.test.js'],
  ['world-processes', 'test/world-processes.test.js']
]);
const temporalPureImportsByModule = new Map([
  ['npc-runtime', new Set(['@rus/items-property'])]
]);
const temporalPureImports = new Set([
  '@rus/contracts/spatial-v3/registry',
  '@rus/contracts/combat-v1',
  '@rus/kernel',
  '@rus/time-events-history'
]);
for (const [moduleName, testPath] of temporalPureModules) {
  const moduleRoot = join(root, 'packages', moduleName);
  for (const requiredPath of ['MODULE.md', 'package.json', 'src/index.js', testPath]) {
    try { await readFile(join(moduleRoot, requiredPath), 'utf8'); }
    catch { violations.push(`packages/${moduleName}/${requiredPath}: required pure Temporal owner file is missing`); }
  }
  const files = (await walk(join(moduleRoot, 'src'))).filter((file) => ['.js', '.mjs'].includes(extname(file)));
  const fileSet = new Set(files.map((file) => resolve(file)));
  const graph = new Map();
  for (const file of files) {
    const rel = relative(root, file).replaceAll('\\', '/');
    const source = await readFile(file, 'utf8');
    if (source.split('\n').length > 500) violations.push(`${rel}: exceeds 500 line pure Temporal owner limit`);
    if (Buffer.byteLength(source) > hardBytes) violations.push(`${rel}: exceeds pure Temporal owner hard byte limit`);
    for (const token of [
      'legacy/', '/apps/', '/ui/', '/server/', 'provider.js', '@rus/llm-runtime',
      '@rus/world-base', '@rus/party-store', '@rus/new-game', '@rus/turn',
      '@rus/presentation', '@rus/narration', "from 'pg'", 'from "pg"',
      'Math.random(', 'SELECT ', 'INSERT ', 'UPDATE ', 'DELETE FROM '
    ]) {
      if (source.includes(token)) violations.push(`${rel}: forbidden pure Temporal owner dependency or side effect ${token}`);
    }
    const deps = [];
    for (const specifier of importsOf(source)) {
      if (!specifier.startsWith('.')) {
        const approvedImports = temporalPureImportsByModule.get(moduleName) ?? new Set();
        if (!temporalPureImports.has(specifier) && !approvedImports.has(specifier)) violations.push(`${rel}: pure Temporal owner import is not approved (${specifier})`);
        continue;
      }
      const candidateBase = resolve(dirname(file), specifier);
      const candidate = fileSet.has(candidateBase) ? candidateBase : fileSet.has(`${candidateBase}.js`) ? `${candidateBase}.js` : null;
      if (candidate) deps.push(candidate);
    }
    graph.set(resolve(file), deps);
  }
  for (const cycle of findCycles(graph)) {
    violations.push(`Pure Temporal owner ${moduleName} cyclic import: ${cycle.map((file) => relative(root, file).replaceAll('\\', '/')).join(' -> ')}`);
  }
}


for (const spec of [
  {
    name: 'narration',
    required: ['MODULE.md', 'package.json', 'src/index.js', 'src/flow.js', 'test/narration-flow.test.js'],
    approved: new Set(['@rus/kernel', '@rus/visibility-knowledge-memory']),
    forbidden: ['legacy/', '/apps/', '/ui/', '/server/', 'provider.js', '@rus/llm-runtime', '@rus/world-base', '@rus/party-store', '@rus/new-game', '@rus/turn', '@rus/presentation', "from 'pg'", 'from "pg"', 'Math.random(', 'SELECT ', 'INSERT ', 'UPDATE ', 'DELETE FROM '],
    publicNeedle: "from './flow.js'"
  },
  {
    name: 'presentation',
    required: ['MODULE.md', 'package.json', 'src/index.js', 'src/read-models/screens.js', 'test/presentation.test.js'],
    approved: new Set(['@rus/contracts', '@rus/kernel', '@rus/visibility-knowledge-memory']),
    forbidden: ['legacy/', '/apps/', '/ui/', '/server/', 'provider.js', '@rus/llm-runtime', '@rus/world-base', '@rus/party-store', '@rus/new-game', '@rus/turn', '@rus/narration', "from 'pg'", 'from "pg"', 'Math.random(', 'SELECT ', 'INSERT ', 'UPDATE ', 'DELETE FROM '],
    publicNeedle: "from './read-models/index.js'"
  }
]) {
  const moduleRoot = join(root, 'packages', spec.name);
  for (const requiredPath of spec.required) {
    try { await readFile(join(moduleRoot, requiredPath), 'utf8'); }
    catch { violations.push(`packages/${spec.name}/${requiredPath}: required file is missing`); }
  }
  const files = (await walk(join(moduleRoot, 'src'))).filter((file) => ['.js', '.mjs'].includes(extname(file)));
  const fileSet = new Set(files.map((file) => resolve(file)));
  const graph = new Map();
  for (const file of files) {
    const rel = relative(root, file).replaceAll('\\', '/');
    const source = await readFile(file, 'utf8');
    if (source.split('\n').length > 500) violations.push(`${rel}: exceeds 500 line ${spec.name} limit`);
    if (Buffer.byteLength(source) > hardBytes) violations.push(`${rel}: exceeds ${spec.name} hard byte limit`);
    for (const token of spec.forbidden) if (source.includes(token)) violations.push(`${rel}: forbidden ${spec.name} dependency or side effect ${token}`);
    const deps = [];
    for (const specifier of importsOf(source)) {
      if (!specifier.startsWith('.')) {
        if (!spec.approved.has(specifier) && !specifier.startsWith('node:')) violations.push(`${rel}: ${spec.name} import is not approved (${specifier})`);
        continue;
      }
      const candidateBase = resolve(dirname(file), specifier);
      const candidate = fileSet.has(candidateBase) ? candidateBase : fileSet.has(`${candidateBase}.js`) ? `${candidateBase}.js` : null;
      if (candidate) deps.push(candidate);
    }
    graph.set(resolve(file), deps);
  }
  for (const cycle of findCycles(graph)) violations.push(`${spec.name} cyclic import: ${cycle.map((file) => relative(root, file).replaceAll('\\', '/')).join(' -> ')}`);
  const indexSource = await readFile(join(moduleRoot, 'src/index.js'), 'utf8');
  if (!indexSource.includes(spec.publicNeedle)) violations.push(`${spec.name} public API is missing canonical entrypoint`);
}

const narrationFlowSource = await readFile(join(root, 'packages/narration/src/flow.js'), 'utf8');
for (const required of ['writer.generate', 'formatRepairer.repair', 'auditor.audit', 'semanticRepairer.repair']) {
  if (!narrationFlowSource.includes(required)) violations.push(`Narration flow is missing required writer, auditor, or repair port ${required}`);
}
for (const forbidden of ['seniorWriter.repair', 'seniorAuditor.audit', 'router.route']) {
  if (narrationFlowSource.includes(forbidden)) violations.push(`Narration flow must not restore LLM router/senior cascade port ${forbidden}`);
}
if (!narrationFlowSource.includes('detectHiddenLeaks')) violations.push('Narration flow must enforce hidden leak detection');
const presentationScreensSource = await readFile(join(root, 'packages/presentation/src/read-models/screens.js'), 'utf8');
for (const required of ['FIRST_GAME_SCREEN_SCHEMA', 'TURN_SCREEN_SCHEMA', 'intent_not_fact', 'detectHiddenLeaks']) {
  if (!presentationScreensSource.includes(required)) violations.push(`Presentation screen boundary is missing ${required}`);
}


const turnRoot = join(root, 'packages/turn');
for (const requiredPath of ['MODULE.md', 'package.json', 'src/index.js', 'src/orchestrator.js', 'src/compat/index.js', 'test/turn-workflow.test.js']) {
  try { await readFile(join(turnRoot, requiredPath), 'utf8'); }
  catch { violations.push(`packages/turn/${requiredPath}: required turn workflow file is missing`); }
}
const turnFiles = (await walk(join(turnRoot, 'src'))).filter((file) => ['.js', '.mjs'].includes(extname(file)));
const turnFileSet = new Set(turnFiles.map((file) => resolve(file)));
const turnGraph = new Map();
const approvedTurnImports = new Set([
  '@rus/contracts/ordinary-materialization-v1',
  '@rus/contracts/combat-v1',
  '@rus/contracts/spatial-v3/ports',
  '@rus/contracts/spatial-v3/registry',
  '@rus/kernel',
  '@rus/checks-rng',
  '@rus/items-property',
  '@rus/time-events-history',
  '@rus/time-events-history/legacy',
    '@rus/time-events-history/temporal-boundaries',
    '@rus/npc-runtime',
    '@rus/visibility-knowledge-memory',
  '@rus/presentation',
    '@rus/narration',
    '@rus/materialization',
    '@rus/pipeline-engine',
    '@rus/combat-health',
    '@rus/body-state',
    '@rus/world-knowledge'
]);
for (const file of turnFiles) {
  const rel = relative(root, file).replaceAll('\\', '/');
  const source = await readFile(file, 'utf8');
  const maxLines = rel.endsWith('/orchestrator.js') ? 300 : 500;
  if (source.split('\n').length > maxLines) violations.push(`${rel}: exceeds ${maxLines} line turn workflow limit`);
  if (Buffer.byteLength(source) > hardBytes) violations.push(`${rel}: exceeds turn workflow hard byte limit`);
  for (const token of [
    'legacy/', '/apps/', '/ui/', '/server/', 'provider.js', '@rus/llm-runtime', '@rus/world-base',
    "from 'pg'", 'from "pg"', 'Math.random(', 'SELECT ', 'INSERT ', 'UPDATE ', 'DELETE FROM ',
    'const PATTERNS', 'forceDeterministic'
  ]) {
    if (source.includes(token)) violations.push(`${rel}: forbidden turn workflow dependency or deterministic semantic fallback ${token}`);
  }
  const deps = [];
  for (const specifier of importsOf(source)) {
    if (!specifier.startsWith('.')) {
      if (!approvedTurnImports.has(specifier) && !specifier.startsWith('node:')) violations.push(`${rel}: turn import is not approved (${specifier})`);
      continue;
    }
    const candidateBase = resolve(dirname(file), specifier);
    const candidate = turnFileSet.has(candidateBase) ? candidateBase : turnFileSet.has(`${candidateBase}.js`) ? `${candidateBase}.js` : null;
    if (candidate) deps.push(candidate);
  }
  turnGraph.set(resolve(file), deps);
}
for (const cycle of findCycles(turnGraph)) {
  violations.push(`Turn workflow cyclic import: ${cycle.map((file) => relative(root, file).replaceAll('\\', '/')).join(' -> ')}`);
}
const turnIndex = await readFile(join(turnRoot, 'src/index.js'), 'utf8');
if (!turnIndex.includes("from './orchestrator.js'")) violations.push('Turn public API must export the modular orchestrator');
if ((turnIndex.match(/\bexport\b/g) ?? []).length > 12) violations.push('Turn public API exceeds 12 export statements');
const turnOrchestrator = await readFile(join(turnRoot, 'src/workflow-stages.js'), 'utf8');
for (const requiredStage of [
  'normalize_intent', 'resolve_mode', 'load_context', 'availability', 'checks', 'consequence', 'time_update',
  'hidden_update', 'visible_projection', 'narration', 'persistence_plan', 'commit', 'screen_projection'
]) {
  if (!turnOrchestrator.includes(`'${requiredStage}'`)) violations.push(`Turn orchestrator is missing stage ${requiredStage}`);
}



for (const appSpec of [
  {
    name: 'game-server',
    required: ['MODULE.md', 'package.json', 'src/index.js', 'src/composition/root.js', 'src/http/handler.js', 'test/game-server.test.js'],
    approved: new Set([
      '@rus/actors', '@rus/body-state', '@rus/checks-rng', '@rus/combat-health', '@rus/contracts', '@rus/contracts/combat-v1', '@rus/contracts/ordinary-materialization-v1', '@rus/contracts/portrait-spec-v1', '@rus/contracts/spatial-v3/registry', '@rus/knowledge-source', '@rus/llm-runtime',
      '@rus/items-property', '@rus/items-property/action-produced-result',
      '@rus/items-property/action-produced-transition',
      '@rus/items-property/finite-resource-transition', '@rus/materialization', '@rus/materialization/internal/lower-dvina-trace-phase-1a', '@rus/materialization/internal/lower-dvina-trace-s1',
      '@rus/movement-routes', '@rus/new-game',
      '@rus/new-game/stages/stage-11', '@rus/new-game/stages/stage-12',
      '@rus/new-game/stages/stage-24',
      '@rus/new-game/stages/stage-24/internal/lower-dvina-trace-phase-1a', '@rus/new-game/stages/stage-25', '@rus/narration',
      '@rus/party-store', '@rus/party-store/internal/lower-dvina-trace-phase-1a', '@rus/party-store/ordinary-materialization', '@rus/presentation', '@rus/presentation/opening-delivery', '@rus/turn', '@rus/turn/action-produced-result', '@rus/turn/spatial-v3-execution', '@rus/turn/spatial-v3-target-composition', '@rus/turn/spatial-v3-temporal-write-integration', '@rus/turn/temporal-advance',
      '@rus/runtime-catalog', '@rus/runtime-catalog/common-lookups', '@rus/runtime-catalog/runtime-contract', '@rus/social-law', '@rus/time-events-history', '@rus/time-events-history/calendar',
      '@rus/time-events-history/temporal-boundaries',
      '@rus/visibility-knowledge-memory',
      '@rus/visibility-knowledge-memory/ordinary-resolution-capability',
      '@rus/world-base', '@rus/world-knowledge',
      '@rus/world-processes/local-exact-fire',
      '@rus/npc-runtime', 'pg'
    ])
  },
  {
    name: 'game-web',
    required: ['MODULE.md', 'package.json', 'public/index.html', 'src/index.js', 'src/app/bootstrap.js', 'src/api/client.js', 'test/game-web.test.js'],
    approved: new Set([])
  }
]) {
  const appRoot = join(root, 'apps', appSpec.name);
  for (const requiredPath of appSpec.required) {
    try { await readFile(join(appRoot, requiredPath), 'utf8'); }
    catch { violations.push(`apps/${appSpec.name}/${requiredPath}: required application file is missing`); }
  }
  const files = (await walk(join(appRoot, 'src'))).filter((file) => ['.js', '.mjs'].includes(extname(file)));
  const fileSet = new Set(files.map((file) => resolve(file)));
  const graph = new Map();
  for (const file of files) {
    const rel = relative(root, file).replaceAll('\\', '/');
    const source = await readFile(file, 'utf8');
    if (source.split('\n').length > 300) violations.push(`${rel}: exceeds 300 line application file limit`);
    if (Buffer.byteLength(source) > hardBytes) violations.push(`${rel}: exceeds application hard byte limit`);
    if (appSpec.name === 'game-web') {
      for (const token of ['@rus/', 'legacy/', "from 'pg'", 'from "pg"', 'SELECT ', 'INSERT ', 'UPDATE ', 'DELETE FROM ', 'Math.random(']) {
        if (source.includes(token)) violations.push(`${rel}: game-web forbidden dependency or side effect ${token}`);
      }
      if (rel.includes('/features/') && /document\.|querySelector|innerHTML\s*=/.test(source)) violations.push(`${rel}: feature renderer may not mutate DOM directly`);
    } else {
      const postgresInfrastructure = rel.startsWith('apps/game-server/src/infrastructure/postgres/');
      for (const token of ['SELECT ', 'INSERT ', 'UPDATE ', 'DELETE FROM ', 'Math.random(']) {
        if (source.includes(token) && !(postgresInfrastructure && token !== 'Math.random(')) {
          violations.push(`${rel}: game-server composition may not contain SQL or direct randomness (${token})`);
        }
      }
      if (importsOf(source).includes('pg') && !postgresInfrastructure) violations.push(`${rel}: pg import is restricted to PostgreSQL infrastructure adapters`);
      if (source.includes('legacy/')) violations.push(`${rel}: legacy imports are forbidden after production-v3 cutover`);
      if (rel.includes('/http/') && importsOf(source).some((specifier) => specifier.startsWith('@rus/'))) violations.push(`${rel}: HTTP routes may not import workflow/domain packages`);
    }
    const deps = [];
    for (const specifier of importsOf(source)) {
      if (!specifier.startsWith('.')) {
        if (!specifier.startsWith('node:') && !appSpec.approved.has(specifier)) violations.push(`${rel}: ${appSpec.name} import is not approved (${specifier})`);
        continue;
      }
      const candidateBase = resolve(dirname(file), specifier);
      const candidate = fileSet.has(candidateBase) ? candidateBase : fileSet.has(`${candidateBase}.js`) ? `${candidateBase}.js` : null;
      if (candidate) deps.push(candidate);
    }
    graph.set(resolve(file), deps);
  }
  for (const cycle of findCycles(graph)) violations.push(`${appSpec.name} cyclic import: ${cycle.map((file) => relative(root, file).replaceAll('\\', '/')).join(' -> ')}`);
}


const productionRequired = [
  'apps/game-server/src/composition/production-spatial-v3.js',
  'apps/game-server/src/infrastructure/postgres/pools.js',
  'apps/game-server/src/infrastructure/postgres/session-store.js',
  'apps/game-server/src/infrastructure/postgres/stage25.js',
  'apps/game-server/src/infrastructure/provider/deepseek.js',
  'test/integration/production-infrastructure.test.js',
  'test/e2e/browser-game-flow.test.js',
  'schemas/party-db/010_party_runtime_pr8_reaction_options.sql'
];
for (const requiredPath of productionRequired) {
  try { await readFile(join(root, requiredPath), 'utf8'); }
  catch { violations.push(`${requiredPath}: required production integration artifact is missing`); }
}
const productionComposition = await readFile(join(root, 'apps/game-server/src/composition/production-spatial-v3.js'), 'utf8');
for (const marker of ['createPostgresPools', 'runSpatialV3TargetMigrations', 'createSpatialV3WorldBaseReader', 'createSpatialV3PostgresCombinedAtomicCommitter', 'loadSpatialV3RuntimeBindings']) {
  if (!productionComposition.includes(marker)) violations.push(`production-v3 composition is missing ${marker}`);
}
const browserE2e = await readFile(join(root, 'test/e2e/browser-game-flow.test.js'), 'utf8');
for (const marker of ['playwright-core', 'first_game_screen', 'turn_screen', 'intent_not_fact']) {
  if (!browserE2e.includes(marker)) violations.push(`browser E2E is missing ${marker}`);
}

const gameServerEntry = await readFile(join(root, 'apps/game-server/src/server.js'), 'utf8');
if (!gameServerEntry.includes('modular-entry.js') || gameServerEntry.includes('legacy-entry.js') || gameServerEntry.includes('runtimeRoute')) violations.push('game-server entrypoint must expose only the activated modular spatial-v3 route');
const gameWebBootstrap = await readFile(join(root, 'apps/game-web/src/app/bootstrap.js'), 'utf8');
if (!gameWebBootstrap.includes('intent') && !gameWebBootstrap.includes('raw_text')) violations.push('game-web bootstrap must submit player input as an intent payload');
const gameWebContracts = await readFile(join(root, 'apps/game-web/src/api/contracts.js'), 'utf8');
for (const required of ['first_game_screen', 'turn_screen', 'intent_not_fact', 'PUBLIC_PAYLOAD_HIDDEN_LEAK']) {
  if (!gameWebContracts.includes(required)) violations.push(`game-web public boundary is missing ${required}`);
}

const deliveryFacade = await readFile(join(root, 'legacy/src/world/new-game-pipeline/delivery/first-screen-delivery.js'), 'utf8');
if (!deliveryFacade.includes("from '@rus/presentation/opening-delivery'")) violations.push('legacy delivery must be a compatibility facade over @rus/presentation/opening-delivery');


for (const toolSpec of [
  {
    name: 'map-maker',
    required: ['MODULE.md', 'package.json', 'src/index.js', 'src/cli.js', 'test/map-maker.test.js'],
    approved: new Set(['@rus/kernel', '@rus/space-map']),
    forbidden: ['@rus/new-game', '@rus/turn', '@rus/narration', '@rus/party-store', '@rus/llm-runtime', "from 'pg'", 'from "pg"', '/legacy/', '/apps/']
  },
  {
    name: 'db-tools',
    required: ['MODULE.md', 'package.json', 'src/index.js', 'test/db-tools.test.js'],
    approved: new Set([]),
    forbidden: ['@rus/new-game', '@rus/turn', '@rus/llm-runtime', "from 'pg'", 'from "pg"', '/legacy/', '/apps/', 'query(']
  },
  {
    name: 'docs-tools',
    required: ['MODULE.md', 'package.json', 'src/index.js', 'src/documentation.js', 'src/cli.js', 'test/docs-tools.test.js', 'test/documentation-generation.test.js'],
    approved: new Set([]),
    forbidden: ['@rus/new-game', '@rus/turn', '@rus/llm-runtime', 'openai', 'deepseek', "from 'pg'", 'from "pg"', '/legacy/', '/apps/']
  },
  {
    name: 'audit-tools',
    required: ['MODULE.md', 'package.json', 'src/index.js', 'test/audit-tools.test.js'],
    approved: new Set([]),
    forbidden: ['@rus/new-game', '@rus/turn', '@rus/llm-runtime', "from 'pg'", 'from "pg"', '/legacy/', '/apps/']
  },
  {
    name: 'shadow-run',
    required: ['MODULE.md', 'package.json', 'src/index.js', 'src/manifest.js', 'src/runner.js', 'src/report.js', 'src/cli.js', 'test/shadow-run.test.js'],
    approved: new Set([]),
    forbidden: ['@rus/new-game', '@rus/turn', '@rus/llm-runtime', "from 'pg'", 'from "pg"', '/legacy/', '/apps/', 'child_process.exec', 'shell: true']
  },
  {
    name: 'cutover',
    required: ['MODULE.md', 'package.json', 'src/index.js', 'src/manifest.js', 'src/import-graph.js', 'src/runner.js', 'src/report.js', 'src/cli.js', 'test/cutover.test.js'],
    approved: new Set(['@rus/shadow-run']),
    forbidden: ['@rus/new-game', '@rus/turn', '@rus/llm-runtime', "from 'pg'", 'from "pg"', 'child_process.exec', 'shell: true']
  },
  {
    name: 'finalization',
    required: ['MODULE.md', 'package.json', 'src/index.js', 'src/manifest.js', 'src/checklist.js', 'src/evidence.js', 'src/runner.js', 'src/report.js', 'src/cli.js', 'test/finalization.test.js'],
    approved: new Set([]),
    forbidden: ['@rus/new-game', '@rus/turn', '@rus/llm-runtime', "from 'pg'", 'from "pg"', 'child_process.exec', 'shell: true', 'rm -rf', 'unlink(', 'rmdir(']
  }
]) {
  const toolRoot = join(root, 'tools', toolSpec.name);
  for (const requiredPath of toolSpec.required) {
    try { await readFile(join(toolRoot, requiredPath), 'utf8'); }
    catch { violations.push(`tools/${toolSpec.name}/${requiredPath}: required tool file is missing`); }
  }
  const files = (await walk(join(toolRoot, 'src'))).filter((file) => ['.js', '.mjs'].includes(extname(file)));
  const fileSet = new Set(files.map((file) => resolve(file)));
  const graph = new Map();
  for (const file of files) {
    const rel = relative(root, file).replaceAll('\\', '/');
    const source = await readFile(file, 'utf8');
    if (source.split('\n').length > 500) violations.push(`${rel}: exceeds 500 line tool file limit`);
    if (Buffer.byteLength(source) > hardBytes) violations.push(`${rel}: exceeds tool hard byte limit`);
    for (const token of toolSpec.forbidden) if (source.includes(token)) violations.push(`${rel}: forbidden ${toolSpec.name} dependency or side effect ${token}`);
    const deps = [];
    for (const specifier of importsOf(source)) {
      if (!specifier.startsWith('.')) {
        if (!specifier.startsWith('node:') && !toolSpec.approved.has(specifier)) violations.push(`${rel}: ${toolSpec.name} import is not approved (${specifier})`);
        continue;
      }
      const candidateBase = resolve(dirname(file), specifier);
      const candidate = fileSet.has(candidateBase) ? candidateBase : fileSet.has(`${candidateBase}.js`) ? `${candidateBase}.js` : null;
      if (candidate) deps.push(candidate);
    }
    graph.set(resolve(file), deps);
  }
  for (const cycle of findCycles(graph)) violations.push(`${toolSpec.name} cyclic import: ${cycle.map((file) => relative(root, file).replaceAll('\\', '/')).join(' -> ')}`);
  for (const forbiddenDir of ['node_modules', 'dist', 'releases']) {
    try {
      const entries = await readdir(join(toolRoot, forbiddenDir));
      if (entries.length >= 0) violations.push(`tools/${toolSpec.name}: forbidden ${forbiddenDir}/ directory`);
    } catch {}
  }
  for (const file of await walk(toolRoot)) if (file.endsWith('.zip')) violations.push(`${relative(root, file)}: release ZIP is forbidden inside tool source`);
}

const mapMakerSource = await readFile(join(root, 'tools/map-maker/src/index.js'), 'utf8');
for (const required of ['rus.game_graph.v1', 'rus.map_layout.v1', 'graph_digest', 'stripLayout', 'createSquareLayout']) {
  if (!mapMakerSource.includes(required)) violations.push(`MapMaker boundary is missing ${required}`);
}
const dbToolsSource = await readFile(join(root, 'tools/db-tools/src/index.js'), 'utf8');
for (const required of ['dry_run=true', 'approval_id', 'source_checksum', 'executor_required']) {
  if (!dbToolsSource.includes(required)) violations.push(`DB tools approval boundary is missing ${required}`);
}
const docsToolsSource = await readFile(join(root, 'tools/docs-tools/src/index.js'), 'utf8');
if (!docsToolsSource.includes('embedTexts port is required')) violations.push('Docs tools must require an explicit embedding port');
const documentationGenerator = await readFile(join(root, 'tools/docs-tools/src/documentation.js'), 'utf8');
for (const marker of ['rus.module_index.v1', 'rus.generated_schema_reference.v1', 'rus.canonical_document_paths.v1', 'rus.approved_seed_sources.v1', 'rus.artifact_manifest.v1']) {
  if (!documentationGenerator.includes(marker)) violations.push(`documentation generator is missing ${marker}`);
}

const cutoverPlan = JSON.parse(await readFile(join(root, 'data/cutover/plan.json'), 'utf8'));
if (cutoverPlan.schema_version !== 'rus.cutover_plan.v1' || cutoverPlan.steps?.length !== 13) violations.push('cutover plan must contain 13 versioned steps');
const cutoverReportSource = await readFile(join(root, 'tools/cutover/src/report.js'), 'utf8');
for (const marker of ['rus.cutover_report.v1', 'cutover_complete', 'legacy_deletion_allowed']) {
  if (!cutoverReportSource.includes(marker)) violations.push(`cutover report boundary is missing ${marker}`);
}
const serverConfigSource = await readFile(join(root, 'apps/game-server/src/config.js'), 'utf8');
for (const marker of ['RUS_RUNTIME_ROUTE', "'modular'", 'MODULAR_FEATURE_FLAGS_INCOMPLETE', 'CUTOVER_STAGE_INCOMPLETE']) {
  if (!serverConfigSource.includes(marker)) violations.push(`cutover server config is missing ${marker}`);
}
const newGameIndexSource = await readFile(join(root, 'packages/new-game/src/index.js'), 'utf8');
if (newGameIndexSource.includes('legacy-adapter')) violations.push('@rus/new-game default export graph must not load legacy-adapter after cutover');
for (const requiredPath of ['test/cutover/staged-route-smoke.test.js', 'test/cutover/party-state-rollback.test.js', 'test/cutover/modular-runtime-imports.test.js']) {
  try { await readFile(join(root, requiredPath), 'utf8'); } catch { violations.push(`${requiredPath}: required cutover test is missing`); }
}

const finalizationPlan = JSON.parse(await readFile(join(root, 'data/finalization/plan.json'), 'utf8'));
if (finalizationPlan.schema_version !== 'rus.finalization_plan.v1' || finalizationPlan.manual_gates?.length !== 4) violations.push('finalization plan must contain four explicit manual gates');
if (finalizationPlan.safety?.automatic_legacy_deletion !== false || finalizationPlan.safety?.modify_live_environment !== false || finalizationPlan.safety?.accept_secrets !== false) violations.push('finalization safety policy must forbid deletion, live mutation and secrets');
const finalizationReportSource = await readFile(join(root, 'tools/finalization/src/report.js'), 'utf8');
for (const marker of ['rus.finalization_report.v1', 'automation_complete_manual_hold', 'legacy_deletion_allowed']) {
  if (!finalizationReportSource.includes(marker)) violations.push(`finalization report boundary is missing ${marker}`);
}

const shadowRunSource = await readFile(join(root, 'tools/shadow-run/src/report.js'), 'utf8');
for (const required of ['rus.shadow_run_report.v1', 'go_to_staged_cutover', 'blocking_difference_count']) {
  if (!shadowRunSource.includes(required)) violations.push(`shadow-run report boundary is missing ${required}`);
}
const shadowManifest = JSON.parse(await readFile(join(root, 'data/shadow-corpus/manifest.json'), 'utf8'));
if (shadowManifest.schema_version !== 'rus.shadow_corpus.v1') violations.push('shadow corpus has invalid schema_version');
for (const required of ['schema_equivalence', 'canonical_ids', 'no_new_facts_from_code', 'audit_decisions', 'repair_tier', 'db_write_plan', 'commit_result', 'visible_hidden_separation', 'ui_read_model', 'error_classification', 'idempotency', 'telemetry_completeness']) {
  if (!(shadowManifest.cases ?? []).some((item) => (item.categories ?? []).includes(required))) violations.push(`shadow corpus is missing category ${required}`);
}

const documentationRequired = [
  'MODULE_INDEX.md',
  'docs/architecture/MODULE_RULES.md',
  'docs/architecture/DEPENDENCY_RULES.md',
  'docs/architecture/CONTRACT_POLICY.md',
  'docs/pipelines/new-game.md',
  'docs/pipelines/turn.md',
  'docs/migration/CANONICAL_PATHS.json',
  'generated/module-index.json',
  'generated/schema-reference.json',
  'generated/schema-reference.md',
  'generated/generated-manifest.json',
  'data/seeds/APPROVED_SOURCES.json',
  'data/seeds/IMPORT_HISTORY.json',
  'data/LEGACY_RUNTIME_DATA.json'
];
for (const requiredPath of documentationRequired) {
  try { await readFile(join(root, requiredPath)); }
  catch { violations.push(`${requiredPath}: required documentation/generated artifact is missing`); }
}
for (const group of ['packages', 'apps']) {
  for (const moduleDir of await childDirs(join(root, group))) {
    const modulePath = join(moduleDir, 'MODULE.md');
    try {
      const moduleText = await readFile(modulePath, 'utf8');
      if (!/^##\s+(?:Назначение|Purpose)\s*$/mu.test(moduleText)) violations.push(`${relative(root, modulePath)}: purpose section is missing`);
    } catch { violations.push(`${relative(root, modulePath)}: MODULE.md is required`); }
  }
}
const canonicalRegistry = JSON.parse(await readFile(join(root, 'docs/migration/CANONICAL_PATHS.json'), 'utf8'));
if (canonicalRegistry.schema_version !== 'rus.canonical_document_paths.v1') violations.push('canonical document registry has invalid schema_version');
const canonicalTargets = new Set();
const previousPaths = new Set();
for (const document of canonicalRegistry.documents ?? []) {
  if (canonicalTargets.has(document.canonical_path)) violations.push(`${document.canonical_path}: duplicate canonical path`);
  canonicalTargets.add(document.canonical_path);
  try { await readFile(join(root, document.canonical_path)); } catch { violations.push(`${document.canonical_path}: canonical target is missing`); }
  for (const oldPath of document.previous_paths ?? []) {
    if (previousPaths.has(oldPath)) violations.push(`${oldPath}: duplicate historical path mapping`);
    previousPaths.add(oldPath);
    if (oldPath !== document.canonical_path) {
      try { await readFile(join(root, oldPath)); violations.push(`${oldPath}: obsolete root/document duplicate still exists`); } catch {}
    }
  }
}
const allowedRootMarkdown = new Set(['AGENTS.md', 'README.md', 'CHANGELOG.md', 'MIGRATION_PHASES_SHORT.md', 'MIGRATION_STATUS.md', 'MODULE_INDEX.md']);
for (const name of await readdir(root)) if (name.endsWith('.md') && !allowedRootMarkdown.has(name)) violations.push(`${name}: non-canonical markdown remains in root`);
const generatedManifest = JSON.parse(await readFile(join(root, 'generated/generated-manifest.json'), 'utf8'));
if (generatedManifest.schema_version !== 'rus.generated_manifest.v1' || generatedManifest.command !== 'npm run docs:generate') violations.push('generated manifest is invalid');

for (const packageDir of await childDirs(join(root, 'packages'))) {
  const indexPath = join(packageDir, 'src/index.js');
  try {
    const text = await readFile(indexPath, 'utf8');
    const exportsCount = (text.match(/\bexport\b/g) ?? []).length;
    if (exportsCount > 15) violations.push(`${relative(root, indexPath)}: ${exportsCount} public export statements exceeds limit 15`);
  } catch {}
}

if (violations.length) {
  console.error('Architecture violations:\n' + violations.map((item) => `- ${item}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Architecture boundaries: OK');
}

async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else result.push(path);
  }
  return result;
}
async function childDirs(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) if (entry.isDirectory()) result.push(join(dir, entry.name));
  return result;
}
function importsOf(text) {
  return [...text.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map((match) => match[2]);
}

function findCycles(graph) {
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  function visit(node) {
    if (visiting.has(node)) {
      const index = stack.indexOf(node);
      cycles.push([...stack.slice(index), node]);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const dep of graph.get(node) ?? []) visit(dep);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  }
  for (const node of graph.keys()) visit(node);
  return cycles;
}
