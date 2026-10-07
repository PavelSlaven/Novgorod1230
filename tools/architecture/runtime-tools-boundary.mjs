import { readFile, readdir, realpath as fsRealPath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const REGEX_PREFIX_KEYWORDS = new Set([
  'await', 'case', 'delete', 'do', 'else', 'in', 'instanceof', 'new', 'of',
  'return', 'throw', 'typeof', 'void', 'yield'
]);

export async function findRuntimeToolsBoundaryViolations({ root }) {
  const repositoryRoot = resolve(root);
  const toolPackages = new Map();
  for (const directory of await childDirectories(resolve(repositoryRoot, 'tools'))) {
    const manifestPath = resolve(directory, 'package.json');
    const manifest = await readManifest(manifestPath);
    if (manifest?.name) toolPackages.set(manifest.name, directory);
  }

  const violations = [];
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
      }
    }
  }
  return violations;
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
      index = scanTemplate(source, index + 1, tokens);
      tokens.push({ type: 'template', value: '' });
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
  if ([')', ']', '}', '.'].includes(previous.value)) return false;
  if (['+', '-'].includes(previous.value) && localTokens.at(-2)?.value === previous.value) return false;
  return true;
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
  for (let index = start; index < source.length;) {
    if (source[index] === '\\') { index += 2; continue; }
    if (source[index] === '`') return index + 1;
    if (source[index] === '$' && source[index + 1] === '{') {
      index = scanCode(source, index + 2, tokens, true);
      continue;
    }
    index += 1;
  }
  return source.length;
}

async function childDirectories(directory) {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => resolve(directory, entry.name));
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
