import { readFile, readdir, realpath as fsRealPath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const FILE_PATH_OPERATIONS = new Set([
  'access', 'accessSync', 'appendFile', 'appendFileSync', 'chmod', 'chmodSync', 'copyFile', 'copyFileSync',
  'createReadStream', 'createWriteStream', 'existsSync', 'lstat', 'lstatSync', 'mkdir', 'mkdirSync',
  'open', 'openSync', 'readFile', 'readFileSync', 'readdir', 'readdirSync', 'realpath', 'realpathSync',
  'rename', 'renameSync', 'rm', 'rmSync', 'stat', 'statSync', 'unlink', 'unlinkSync', 'writeFile', 'writeFileSync'
]);
const PROCESS_PATH_OPERATIONS = new Set(['execFile', 'execFileSync', 'fork', 'spawn', 'spawnSync']);
const ARCHITECTURE_READ_OPERATIONS = new Set([
  'access', 'accessSync', 'createReadStream', 'existsSync', 'lstat', 'lstatSync', 'open', 'openSync',
  'readFile', 'readFileSync', 'readdir', 'readdirSync', 'realpath', 'realpathSync', 'stat', 'statSync'
]);
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
          relative(repositoryRoot, physicalApp).split(sep).join('/'), 'tools source resolves to app');
      }
      const source = await readFile(file, 'utf8');
      for (const specifier of importSpecifiers(source)) {
        const target = await resolveAppDependency(specifier, file, appDirectories, appPackages);
        if (target) {
          reportToolAppEdge(violations, permissions, ownerFile, relativeFile,
            relative(repositoryRoot, target).split(sep).join('/'), 'tools import targets app', specifier);
        }
      }
      for (const pathValue of pathReferences(source, { allowReadOnly: ownerRelative === 'tools/architecture' })) {
        if (pathValue.readOnly) continue;
        const target = await resolveBoundaryPath(pathValue.value, file, repositoryRoot, 'apps', appDirectories,
          pathValue.dynamic);
        if (target) {
          reportToolAppEdge(violations, permissions, ownerFile, relativeFile,
            relative(repositoryRoot, target).split(sep).join('/'), 'tools path targets app', pathValue.value);
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
        for (const pathValue of pathReferences(source, { includeArrayPaths: true })) {
          const toolPath = await resolveBoundaryPath(pathValue.value, file, repositoryRoot, 'tools', toolOwners,
            pathValue.dynamic);
          if (toolPath) violations.push(`${relativeFile}: runtime path targets tools (${pathValue.value})`);
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

async function resolveBoundaryPath(value, importer, root, boundary, directories, dynamic = false) {
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

  if (!dynamic) return null;

  // Dynamic templates may retain only `/tools/...` or `/apps/...`; recover
  // their repository-relative boundary path when the static suffix is known.
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

function pathReferences(source, { allowReadOnly = false, includeArrayPaths = false } = {}) {
  const tokens = tokenize(source);
  const importedSpecifiers = new Set(importSpecifiers(source));
  const bindings = new Map();
  const bindingDeclarations = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (!['const', 'let', 'var'].includes(tokens[index].value)
      || tokens[index + 1]?.type !== 'identifier' || tokens[index + 2]?.value !== '=') continue;
    const start = index + 3;
    const end = expressionEnd(tokens, start);
    const expression = tokens.slice(start, end);
    bindings.set(tokens[index + 1].value, expression);
    bindingDeclarations.push({ name: tokens[index + 1].value, declaration: index, start, end });
  }

  const references = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === 'identifier' && ['const', 'let', 'var'].includes(tokens[index - 1]?.value)
      && tokens[index + 1]?.value === '=') continue;
    let expression = [token];
    if (token.value === 'new' && tokens[index + 1]?.value === 'URL') {
      expression = tokens.slice(index, findCallEnd(tokens, index + 2));
    } else if (token.type === 'identifier' && tokens[index + 1]?.value === '(') {
      expression = tokens.slice(index, findCallEnd(tokens, index + 1));
    }
    for (const pathValue of staticPathReferences(expression, bindings)) {
      if (!isConcreteBoundaryPath(pathValue.value)) continue;
      if (isHandledImportReference(pathValue.value, importedSpecifiers)) continue;
      references.push({
        ...pathValue,
        readOnly: allowReadOnly && isReadOnlyPathReference(tokens, index, bindingDeclarations)
      });
    }
  }
  return [...new Map(references.map((entry) =>
    [`${entry.value}\0${entry.dynamic}\0${entry.readOnly}`, entry])).values()];
}

function isHandledImportReference(value, importedSpecifiers) {
  return !value.startsWith('file:') && importedSpecifiers.has(value);
}

function staticPathReferences(expression, bindings, depth = 0) {
  if (!expression.length || depth > 8) return [];
  const first = expression[0];
  if (first.type === 'string') return [{ value: first.value, dynamic: false }];
  if (first.type === 'template') return [{ value: first.value, dynamic: first.hasSubstitution }];
  if (first.type === 'identifier' && bindings.has(first.value)) {
    return staticPathReferences(bindings.get(first.value), bindings, depth + 1);
  }
  if (first.value === 'new' && expression[1]?.value === 'URL' && expression[2]?.value === '(') {
    return staticPathReferences(callArguments(expression, 2)[0] ?? [], bindings, depth + 1);
  }
  if (first.type !== 'identifier' || expression[1]?.value !== '(') return [];
  const args = callArguments(expression, 1);
  if (['fileURLToPath', 'pathToFileURL'].includes(first.value)) {
    return staticPathReferences(args[0] ?? [], bindings, depth + 1);
  }
  if (!['join', 'resolve'].includes(first.value)) return [];

  const parts = [];
  let dynamic = false;
  for (let index = 0; index < args.length; index += 1) {
    const values = staticPathReferences(args[index], bindings, depth + 1);
    if (values.length === 1) {
      parts.push(values[0].value);
      dynamic ||= values[0].dynamic;
    } else if (index === 0) {
      continue;
    } else {
      break;
    }
  }
  if (!parts.length) return [];
  const combined = parts.join('/');
  return isConcreteBoundaryPath(combined) ? [{ value: combined, dynamic }] : [];
}

function expressionEnd(tokens, start) {
  let depth = 0;
  for (let index = start; index < tokens.length; index += 1) {
    const value = tokens[index].value;
    if (['(', '[', '{'].includes(value)) depth += 1;
    else if ([')', ']', '}'].includes(value)) {
      if (depth === 0) return index;
      depth -= 1;
    } else if (depth === 0 && [';', ','].includes(value)) return index;
  }
  return tokens.length;
}

function isReadOnlyPathReference(tokens, referenceIndex, bindingDeclarations = []) {
  let foundRead = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== 'identifier' || tokens[index + 1]?.value !== '(') continue;
    const name = token.value;
    const args = callArguments(tokens, index + 1);
    if (!args.some((argument) => argument.includes(tokens[referenceIndex]))) continue;
    if (!FILE_PATH_OPERATIONS.has(name) && !PROCESS_PATH_OPERATIONS.has(name)
      && !['import', 'require'].includes(name)) continue;
    if (!ARCHITECTURE_READ_OPERATIONS.has(name)) return false;
    if (name === 'open' || name === 'openSync') {
      if (args[1]?.length !== 1 || args[1][0].type !== 'string' || args[1][0].value !== 'r') return false;
    }
    if (args[0]?.includes(tokens[referenceIndex])) foundRead = true;
  }
  const declaration = bindingDeclarations.find(({ start, end }) => referenceIndex >= start && referenceIndex < end);
  if (declaration) {
    let foundUse = false;
    for (let index = 0; index < tokens.length; index += 1) {
      if (index === declaration.declaration + 1 || tokens[index].type !== 'identifier'
        || tokens[index].value !== declaration.name) continue;
      foundUse = true;
      if (!isReadOnlyPathReference(tokens, index)) return false;
    }
    if (foundUse) return true;
  }
  return foundRead;
}

function findCallEnd(tokens, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    if (tokens[index].value === '(') depth += 1;
    else if (tokens[index].value === ')' && --depth === 0) return index + 1;
  }
  return tokens.length;
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
  if (isAbsolute(value) || value.startsWith('file:') || /^(?:\.\.?\/)/u.test(value)) return true;
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
    if (token.value === 'require' && tokens[index + 1]?.value === '(') {
      const specifier = staticSpecifier(tokens[index + 2]);
      if (specifier !== null) specifiers.push(specifier);
      continue;
    }
    if (token.value !== 'import' && token.value !== 'export') continue;
    if (token.value === 'import' && staticSpecifier(tokens[index + 1]) !== null) {
      specifiers.push(staticSpecifier(tokens[index + 1]));
      continue;
    }
    if (token.value === 'import' && tokens[index + 1]?.value === '(') {
      const specifier = staticSpecifier(tokens[index + 2]);
      if (specifier !== null) specifiers.push(specifier);
      continue;
    }
    for (let cursor = index + 1; cursor < tokens.length && tokens[cursor].value !== ';'; cursor += 1) {
      if (tokens[cursor].value === 'from' && staticSpecifier(tokens[cursor + 1]) !== null) {
        specifiers.push(staticSpecifier(tokens[cursor + 1]));
        break;
      }
      if (tokens[cursor].type === 'identifier' && ['import', 'export'].includes(tokens[cursor].value)) break;
    }
  }
  return specifiers;
}

function staticSpecifier(token) {
  if (token?.type === 'string') return token.value;
  if (token?.type === 'template' && !token.hasSubstitution && token.cooked) return token.value;
  return null;
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
      tokens.push({ type: 'template', value: template.value,
        hasSubstitution: template.hasSubstitution, cooked: template.cooked });
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
  let hasSubstitution = false;
  let cooked = true;
  for (let index = start; index < source.length;) {
    if (source[index] === '\\') {
      const escape = decodeTemplateEscape(source, index);
      if (escape.value === null) cooked = false;
      else value += escape.value;
      index = escape.end;
      continue;
    }
    if (source[index] === '`') return { end: index + 1, value, hasSubstitution, cooked };
    if (source[index] === '$' && source[index + 1] === '{') {
      hasSubstitution = true;
      index = scanCode(source, index + 2, [], true);
      continue;
    }
    value += source[index];
    index += 1;
  }
  return { end: source.length, value, hasSubstitution, cooked };
}

function decodeTemplateEscape(source, start) {
  const escaped = source[start + 1];
  if (escaped === undefined) return { value: null, end: start + 1 };
  if (escaped === '\n') return { value: '', end: start + 2 };
  if (escaped === '\r') return { value: '', end: start + (source[start + 2] === '\n' ? 3 : 2) };
  if (escaped === 'u') {
    if (source[start + 2] === '{') {
      const close = source.indexOf('}', start + 3);
      const digits = close < 0 ? '' : source.slice(start + 3, close);
      if (/^[\da-f]{1,6}$/iu.test(digits) && Number.parseInt(digits, 16) <= 0x10ffff) {
        return { value: String.fromCodePoint(Number.parseInt(digits, 16)), end: close + 1 };
      }
      return { value: null, end: close < 0 ? start + 2 : close + 1 };
    }
    const digits = source.slice(start + 2, start + 6);
    if (/^[\da-f]{4}$/iu.test(digits)) {
      return { value: String.fromCharCode(Number.parseInt(digits, 16)), end: start + 6 };
    }
    return { value: null, end: start + 2 };
  }
  if (escaped === 'x') {
    const digits = source.slice(start + 2, start + 4);
    if (/^[\da-f]{2}$/iu.test(digits)) {
      return { value: String.fromCharCode(Number.parseInt(digits, 16)), end: start + 4 };
    }
    return { value: null, end: start + 2 };
  }
  const shortEscapes = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' };
  if (Object.hasOwn(shortEscapes, escaped)) return { value: shortEscapes[escaped], end: start + 2 };
  if (escaped === '0') {
    if (/\d/u.test(source[start + 2] ?? '')) return { value: null, end: start + 2 };
    return { value: '\0', end: start + 2 };
  }
  if (['\\', '`', '$', '"', "'"].includes(escaped)) return { value: escaped, end: start + 2 };
  return { value: null, end: start + 2 };
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
