import { readFile, readdir, realpath as fsRealPath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const REGEX_PREFIX_KEYWORDS = new Set([
  'await', 'case', 'delete', 'do', 'else', 'in', 'instanceof', 'new', 'of',
  'return', 'throw', 'typeof', 'void', 'yield'
]);
const CONTROL_HEADER_KEYWORDS = new Set(['for', 'if', 'while', 'with']);

export async function findRuntimeToolsBoundaryViolations({ root }) {
  const repositoryRoot = resolve(root);
  const toolPackages = new Map();
  const toolOwners = await childDirectories(resolve(repositoryRoot, 'tools'));
  const appDirectories = await childDirectories(resolve(repositoryRoot, 'apps'));
  const appPackages = new Map();
  for (const directory of appDirectories) {
    const manifest = await readManifest(resolve(directory, 'package.json'));
    if (manifest?.name) appPackages.set(manifest.name, directory);
  }
  for (const directory of toolOwners) {
    const manifestPath = resolve(directory, 'package.json');
    const manifest = await readManifest(manifestPath);
    if (manifest?.name) toolPackages.set(manifest.name, directory);
  }

  const violations = [];
  for (const owner of toolOwners) {
    const ownerRelative = relative(repositoryRoot, owner).split(sep).join('/');
    const files = (await sourceFiles(owner)).filter((file) => !isTestFile(file));
    const modulePath = resolve(owner, 'MODULE.md');
    const permissions = await readAppPermissions({
      modulePath, owner, ownerRelative, files, appDirectories, repositoryRoot, violations
    });
    const manifestPath = resolve(owner, 'package.json');
    const manifest = await readManifest(manifestPath);
    if (manifest) {
      for (const field of ['dependencies', 'optionalDependencies']) {
        for (const name of Object.keys(manifest[field] ?? {})) {
          const target = appPackages.get(name);
          if (target) {
            const targetRelative = relative(repositoryRoot, target).split(sep).join('/');
            if (!hasAppPermission(permissions, 'package.json', targetRelative)) {
              violations.push(`${relative(repositoryRoot, manifestPath).split(sep).join('/')}: tools ${field} depends on app ${name}`);
            }
          }
        }
      }
    }

    for (const file of files) {
      const relativeFile = relative(repositoryRoot, file).split(sep).join('/');
      const ownerFile = relative(owner, file).split(sep).join('/');
      const physicalFile = await realPath(file);
      const physicalApp = await resolveAppPath(physicalFile, appDirectories);
      if (physicalApp && physicalFile !== file) {
        reportToolAppEdge(violations, permissions, ownerFile, relativeFile,
          physicalApp, 'tools source resolves to app');
      }
      const source = await readFile(file, 'utf8');
      for (const specifier of importSpecifiers(source)) {
        const target = await resolveAppDependency(specifier, file, appDirectories, appPackages);
        if (target) {
          reportToolAppEdge(violations, permissions, ownerFile, relativeFile,
            relative(repositoryRoot, target).split(sep).join('/'), 'tools import targets app', specifier);
        }
      }
      for (const pathValue of pathReferences(source)) {
        const target = await resolveBoundaryPath(pathValue, file, repositoryRoot, 'apps', appDirectories);
        if (target) {
          reportToolAppEdge(violations, permissions, ownerFile, relativeFile,
            relative(repositoryRoot, target).split(sep).join('/'), 'tools path targets app', pathValue);
        }
      }
    }
  }

  for (const sourceRoot of ['apps', 'packages']) {
    for (const directory of await childDirectories(resolve(repositoryRoot, sourceRoot))) {
      const packageRoot = await realPath(directory);
      const manifestPath = resolve(packageRoot, 'package.json');
      const manifest = await readManifest(manifestPath);
      if (manifest) {
        for (const field of ['dependencies', 'optionalDependencies']) {
          for (const name of Object.keys(manifest[field] ?? {})) {
            if (toolPackages.has(name)) {
              violations.push(`${relative(repositoryRoot, manifestPath).split(sep).join('/')}: runtime ${field} depends on tools package ${name}`);
            }
          }
        }
      }

      const sourceDirectory = resolve(packageRoot, 'src');
      for (const file of await sourceFiles(sourceDirectory)) {
        if (isTestFile(file)) continue;
        const relativeFile = relative(repositoryRoot, file).split(sep).join('/');
        const source = await readFile(file, 'utf8');
        const physicalFile = await realPath(file);
        const sourceTool = await resolveToolPath(physicalFile, repositoryRoot, toolPackages);
        if (sourceTool && physicalFile !== file) {
          violations.push(`${relativeFile}: runtime source resolves to tools package ${sourceTool} (${relative(repositoryRoot, physicalFile).split(sep).join('/')})`);
        }
        for (const specifier of importSpecifiers(source)) {
          const toolName = await resolveToolDependency(specifier, file, repositoryRoot, toolPackages);
          if (toolName) violations.push(`${relativeFile}: runtime import targets tools package ${toolName} (${specifier})`);
        }
        for (const pathValue of pathReferences(source)) {
          const toolPath = await resolveBoundaryPath(pathValue, file, repositoryRoot, 'tools', toolOwners);
          if (toolPath) violations.push(`${relativeFile}: runtime path targets tools (${pathValue})`);
        }
      }
    }
  }
  return violations;
}

async function readAppPermissions({ modulePath, owner, ownerRelative, files, appDirectories, repositoryRoot, violations }) {
  let source;
  try { source = await readFile(modulePath, 'utf8'); }
  catch { return []; }
  const marker = 'architecture-tool-app-dependencies';
  const fences = [...source.matchAll(/```architecture-tool-app-dependencies\s*\r?\n([\s\S]*?)\r?\n```/gu)];
  if (!source.includes(marker)) return [];
  const moduleRelative = `${ownerRelative}/MODULE.md`;
  if (fences.length !== 1) {
    violations.push(`${moduleRelative}: invalid architecture-tool-app-dependencies fence`);
    return [];
  }

  let entries;
  try { entries = JSON.parse(fences[0][1]); }
  catch {
    violations.push(`${moduleRelative}: invalid architecture-tool-app-dependencies JSON`);
    return [];
  }
  if (!Array.isArray(entries)) {
    violations.push(`${moduleRelative}: architecture-tool-app-dependencies must be an array`);
    return [];
  }

  const validFields = new Set(['source', 'target', 'reason', 'temporary', 'issue']);
  const seen = new Set();
  const ownerFiles = new Set(files.map((file) => relative(owner, file).split(sep).join('/')));
  ownerFiles.add('package.json');
  const permissions = [];
  for (const entry of entries) {
    let reason = null;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) reason = 'entry must be an object';
    else if (Object.keys(entry).some((field) => !validFields.has(field))) reason = 'entry has unknown fields';
    else if (typeof entry.source !== 'string' || (entry.source !== '*' && !isNormalizedOwnerFile(entry.source))) reason = 'source must be * or a normalized owner-relative path';
    else if (entry.source !== '*' && !ownerFiles.has(entry.source)) reason = 'source file does not exist in owner';
    else if (typeof entry.target !== 'string' || !/^apps\/[^/]+$/u.test(entry.target)
      || !appDirectories.some((directory) => relative(repositoryRoot, directory).split(sep).join('/') === entry.target)) reason = 'target must name an existing apps/<name> root';
    else if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) reason = 'reason must be nonempty';
    else if (Object.hasOwn(entry, 'temporary') && typeof entry.temporary !== 'boolean') reason = 'temporary must be boolean';
    else if (entry.temporary === true && (typeof entry.issue !== 'string' || !/^#[1-9]\d*$/u.test(entry.issue))) reason = 'temporary permission requires issue #N';
    else if (Object.hasOwn(entry, 'issue') && entry.temporary !== true) reason = 'issue is allowed only for temporary permissions';
    if (reason) {
      violations.push(`${moduleRelative}: invalid app dependency permission (${reason})`);
      continue;
    }
    const key = `${entry.source}\0${entry.target}`;
    if (seen.has(key)) {
      violations.push(`${moduleRelative}: duplicate app dependency permission ${entry.source} -> ${entry.target}`);
      continue;
    }
    seen.add(key);
    permissions.push(entry);
  }
  return permissions;
}

function isNormalizedOwnerFile(path) {
  return path.length > 0 && !path.startsWith('/') && !path.includes('\\')
    && path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function hasAppPermission(permissions, ownerFile, target) {
  return permissions.some((permission) => permission.target === target
    && (permission.source === ownerFile
      || (permission.source === '*' && ownerFile !== 'package.json')));
}

function reportToolAppEdge(violations, permissions, ownerFile, relativeFile, target, kind, detail = '') {
  if (hasAppPermission(permissions, ownerFile, target)) return;
  violations.push(`${relativeFile}: ${kind} ${target}${detail ? ` (${detail})` : ''}`);
}

async function resolveAppDependency(specifier, importer, apps, packageNames) {
  if (specifier.startsWith('.') || isAbsolute(specifier)) {
    return resolveAppPath(resolve(dirname(await realPath(importer)), specifier), apps);
  }
  for (const [name, directory] of packageNames) {
    if (specifier === name || specifier.startsWith(`${name}/`)) return directory;
  }
  return null;
}

async function resolveAppPath(target, apps) {
  const lexicalTarget = resolve(target);
  const physicalTarget = await realPath(target);
  for (const directory of apps) {
    if (isWithin(lexicalTarget, directory) || isWithin(physicalTarget, await realPath(directory))) return directory;
  }
  return null;
}

async function resolveBoundaryPath(value, importer, root, boundary, directories) {
  let target = null;
  if (/^[a-z][a-z\d+.-]*:/iu.test(value) && !value.startsWith('file:')) return null;
  if (value.startsWith('file:')) {
    try { target = fileURLToPath(value); }
    catch { return null; }
  } else if (isAbsolute(value)) {
    target = value;
  } else if (/^(?:\.\.?\/)+/u.test(value)) {
    target = resolve(dirname(await realPath(importer)), value);
  } else {
    target = resolve(root, value);
  }
  const lexicalTarget = resolve(target);
  let physicalTarget = await realPath(target);
  for (const directory of directories) {
    const physicalDirectory = await realPath(directory);
    if (isWithin(lexicalTarget, directory) || isWithin(physicalTarget, physicalDirectory)) return directory;
  }

  // A template rooted in a runtime variable may retain only `/tools/...` or
  // `/apps/...`; recover its repository-relative boundary path.
  const normalized = value.replaceAll('\\', '/');
  const segments = normalized.split('/');
  const index = segments.indexOf(boundary);
  if (index >= 0 && segments[index + 1]) {
    const suffix = segments.slice(index).join('/');
    const lexicalBoundaryTarget = resolve(root, suffix);
    physicalTarget = await realPath(lexicalBoundaryTarget);
    for (const directory of directories) {
      const physicalDirectory = await realPath(directory);
      if (isWithin(lexicalBoundaryTarget, directory) || isWithin(physicalTarget, physicalDirectory)) return directory;
    }
  }
  return null;
}

function pathReferences(source) {
  const tokens = tokenize(source);
  const values = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === 'template' && isConcreteBoundaryPath(token.value)) values.push(token.value);
    if (token.value === 'new' && tokens[index + 1]?.value === 'URL'
      && tokens[index + 2]?.value === '(') {
      const first = tokens[index + 3];
      if (['string', 'template'].includes(first?.type)) values.push(first.value);
    }
    if (token.type !== 'identifier' || !['join', 'resolve'].includes(token.value)
      || tokens[index + 1]?.value !== '(') continue;
    // Architecture tools often read source files as data. That is not a
    // runtime dependency edge; still inspect path builders used elsewhere.
    if (tokens[index - 1]?.value === '(' && tokens[index - 2]?.value === 'readFile') continue;
    const args = callArguments(tokens, index + 1);
    const parts = [];
    for (let argumentIndex = 0; argumentIndex < args.length; argumentIndex += 1) {
      const argument = args[argumentIndex];
      const literals = argument.filter((part) => ['string', 'template'].includes(part.type));
      const other = argument.filter((part) => !['string', 'template'].includes(part.type)
        && part.value !== ',');
      if (literals.length === 1 && other.length === 0) {
        parts.push(literals[0].value);
      } else if (argumentIndex > 0) {
        break;
      }
    }
    const combined = parts.join('/');
    if (isConcreteBoundaryPath(combined)) values.push(combined);
    for (const part of parts) {
      if (/^(?:\.\.?\/)+/u.test(part) && isConcreteBoundaryPath(part)) values.push(part);
    }
  }
  return [...new Set(values)];
}

function callArguments(tokens, openIndex) {
  const args = [[]];
  let depth = 0;
  for (let index = openIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.value === '(' || token.value === '[' || token.value === '{') depth += 1;
    else if (token.value === ')' && depth === 0) break;
    else if (token.value === ')' || token.value === ']' || token.value === '}') depth -= 1;
    if (token.value === ',' && depth === 0) args.push([]);
    else args.at(-1).push(token);
  }
  return args;
}

function isConcreteBoundaryPath(value) {
  const segments = value.replaceAll('\\', '/').split('/');
  return segments.some((segment, index) => ['tools', 'apps'].includes(segment)
    && Boolean(segments[index + 1]) && !segments[index + 1].includes('${'));
}

async function resolveToolDependency(specifier, importer, root, tools) {
  if (specifier.startsWith('.') || isAbsolute(specifier)) {
    const importerPath = await realPath(importer);
    const target = await realPath(resolve(dirname(importerPath), specifier));
    return resolveToolPath(target, root, tools);
  }
  for (const name of tools.keys()) {
    if (specifier === name || specifier.startsWith(`${name}/`)) return name;
  }
  return null;
}

async function resolveToolPath(target, root, tools) {
  const toolsRoot = await realPath(resolve(root, 'tools'));
  if (!isWithin(target, toolsRoot)) return null;
  for (const [name, directory] of tools) {
    if (isWithin(target, await realPath(directory))) return name;
  }
  return relative(root, target).split(sep).join('/');
}

function isWithin(path, directory) {
  return path === directory || path.startsWith(`${directory}${sep}`);
}

function importSpecifiers(source) {
  const tokens = tokenize(source);
  const specifiers = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== 'identifier') continue;
    if (['require', 'import'].includes(token.value) && isMemberMethod(tokens, index)) continue;
    if (token.value === 'require' && tokens[index + 1]?.value === '(' && tokens[index + 2]?.type === 'string') {
      specifiers.push(tokens[index + 2].value);
      continue;
    }
    if (token.value !== 'import' && token.value !== 'export') continue;
    if (token.value === 'import' && tokens[index + 1]?.type === 'string') {
      specifiers.push(tokens[index + 1].value);
      continue;
    }
    if (token.value === 'import' && tokens[index + 1]?.value === '(' && tokens[index + 2]?.type === 'string') {
      specifiers.push(tokens[index + 2].value);
      continue;
    }
    for (let cursor = index + 1; cursor < tokens.length && tokens[cursor].value !== ';'; cursor += 1) {
      if (tokens[cursor].value === 'from' && tokens[cursor + 1]?.type === 'string') {
        specifiers.push(tokens[cursor + 1].value);
        break;
      }
      if (tokens[cursor].type === 'identifier' && ['import', 'export'].includes(tokens[cursor].value)) break;
    }
  }
  return specifiers;
}

function isMemberMethod(tokens, index) {
  return tokens[index - 1]?.value === '.';
}

// Heuristic for ordinary code, not a parser for intentionally obfuscated JavaScript.
function tokenize(source) {
  const tokens = [];
  scanCode(source, 0, tokens, false);
  return tokens;
}

function scanCode(source, start, tokens, templateExpression) {
  const tokenStart = tokens.length;
  let braceDepth = 0;
  for (let index = start; index < source.length;) {
    const char = source[index];
    if (templateExpression && char === '}') {
      if (braceDepth === 0) return index + 1;
      braceDepth -= 1;
    }
    if (/\s/u.test(char)) { index += 1; continue; }
    if (char === '/' && source[index + 1] === '/') {
      index = source.indexOf('\n', index + 2);
      if (index < 0) break;
      continue;
    }
    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end < 0 ? source.length : end + 2;
      continue;
    }
    if (char === '/' && canStartRegex(tokens, tokenStart) && !['/', '*'].includes(source[index + 1])) {
      const end = skipRegexLiteral(source, index);
      if (end > index) {
        tokens.push({ type: 'regex', value: '' });
        index = end;
        continue;
      }
    }
    if (char === '"' || char === "'") {
      const string = readString(source, index);
      index = string.end;
      tokens.push({ type: 'string', value: string.value });
      continue;
    }
    if (char === '`') {
      const template = scanTemplate(source, index + 1, tokens);
      index = template.end;
      tokens.push({ type: 'template', value: template.value });
      continue;
    }
    if (templateExpression && char === '{') braceDepth += 1;
    if (/\d/u.test(char)) {
      const numberStart = index++;
      while (index < source.length && /[\p{L}\p{N}_.]/u.test(source[index])) index += 1;
      tokens.push({ type: 'number', value: source.slice(numberStart, index) });
      continue;
    }
    if (/[$\p{L}_]/u.test(char)) {
      const start = index++;
      while (index < source.length && /[$\p{L}\p{N}_]/u.test(source[index])) index += 1;
      tokens.push({ type: 'identifier', value: source.slice(start, index) });
      continue;
    }
    tokens.push({ type: 'punctuation', value: char });
    index += 1;
  }
  return source.length;
}

function readString(source, start) {
  const quote = source[start];
  let value = '';
  let index = start + 1;
  while (index < source.length && source[index] !== quote) {
    if (source[index] !== '\\' || index + 1 >= source.length) {
      value += source[index++];
      continue;
    }
    const escaped = source[index + 1];
    if (escaped === '\n') { index += 2; continue; }
    if (escaped === '\r') { index += source[index + 2] === '\n' ? 3 : 2; continue; }
    if (escaped === 'u') {
      if (source[index + 2] === '{') {
        const close = source.indexOf('}', index + 3);
        const digits = close < 0 ? '' : source.slice(index + 3, close);
        if (/^[\da-f]+$/iu.test(digits)) {
          value += String.fromCodePoint(Number.parseInt(digits, 16));
          index = close + 1;
          continue;
        }
      } else {
        const digits = source.slice(index + 2, index + 6);
        if (/^[\da-f]{4}$/iu.test(digits)) {
          value += String.fromCharCode(Number.parseInt(digits, 16));
          index += 6;
          continue;
        }
      }
    }
    if (escaped === 'x') {
      const digits = source.slice(index + 2, index + 4);
      if (/^[\da-f]{2}$/iu.test(digits)) {
        value += String.fromCharCode(Number.parseInt(digits, 16));
        index += 4;
        continue;
      }
    }
    value += ({ b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '0': '\0' })[escaped] ?? escaped;
    index += 2;
  }
  return { value, end: Math.min(index + 1, source.length) };
}

function canStartRegex(tokens, tokenStart) {
  const localTokens = tokens.slice(tokenStart);
  if (!localTokens.length) return true;
  const previous = localTokens.at(-1);
  if (previous.type === 'identifier') return REGEX_PREFIX_KEYWORDS.has(previous.value);
  if (['number', 'regex', 'string', 'template'].includes(previous.type)) return false;
  if (previous.value === ')') return closesControlHeader(localTokens);
  if ([']', '}', '.'].includes(previous.value)) return false;
  if (['+', '-'].includes(previous.value) && localTokens.at(-2)?.value === previous.value) return false;
  return true;
}

function closesControlHeader(tokens) {
  let depth = 0;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (tokens[index].value === ')') depth += 1;
    else if (tokens[index].value === '(') {
      depth -= 1;
      if (depth === 0) {
        const keywordIndex = index - 1;
        return CONTROL_HEADER_KEYWORDS.has(tokens[keywordIndex]?.value)
          && tokens[keywordIndex - 1]?.value !== '.';
      }
    }
  }
  return false;
}

function skipRegexLiteral(source, start) {
  let inCharacterClass = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\n' || char === '\r') return start;
    if (char === '\\') { index += 1; continue; }
    if (char === '[') inCharacterClass = true;
    else if (char === ']') inCharacterClass = false;
    else if (char === '/' && !inCharacterClass) {
      index += 1;
      while (index < source.length && /[$\p{L}\p{N}_]/u.test(source[index])) index += 1;
      return index;
    }
  }
  return start;
}

function scanTemplate(source, start, tokens) {
  let value = '';
  for (let index = start; index < source.length;) {
    if (source[index] === '\\') {
      if (index + 1 < source.length) value += source[index + 1];
      index += 2;
      continue;
    }
    if (source[index] === '`') return { end: index + 1, value };
    if (source[index] === '$' && source[index + 1] === '{') {
      index = scanCode(source, index + 2, tokens, true);
      continue;
    }
    value += source[index];
    index += 1;
  }
  return { end: source.length, value };
}

async function childDirectories(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const directories = [];
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory() || (entry.isSymbolicLink() && (await fileStat(path))?.isDirectory())) {
        directories.push(path);
      }
    }
    return directories;
  } catch {
    return [];
  }
}

async function sourceFiles(directory) {
  const files = [];
  await collectSourceFiles(directory, files, new Set());
  return files;
}

async function collectSourceFiles(directory, files, visitedDirectories) {
  const canonicalDirectory = await realPath(directory);
  if (visitedDirectories.has(canonicalDirectory)) return;
  visitedDirectories.add(canonicalDirectory);
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch { return; }
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collectSourceFiles(path, files, visitedDirectories);
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(path))) files.push(path);
    else if (entry.isSymbolicLink()) {
      const targetStat = await fileStat(path);
      if (targetStat?.isDirectory()) await collectSourceFiles(path, files, visitedDirectories);
      else if (targetStat?.isFile() && SOURCE_EXTENSIONS.has(extname(path))) files.push(path);
    }
  }
}

function isTestFile(path) {
  const normalized = path.split(sep).join('/');
  return /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[cm]?js$/u.test(normalized);
}

async function readManifest(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { return null; }
}

async function realPath(path) {
  try { return await fsRealPath(path); }
  catch { return resolve(path); }
}

async function fileStat(path) {
  try { return await stat(path); }
  catch { return null; }
}
