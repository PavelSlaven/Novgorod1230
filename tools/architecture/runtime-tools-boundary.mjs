import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

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
        for (const specifier of importSpecifiers(source)) {
          const toolName = resolveToolDependency(specifier, file, repositoryRoot, toolPackages);
          if (toolName) violations.push(`${relativeFile}: runtime import targets tools package ${toolName} (${specifier})`);
        }
      }
    }
  }
  return violations;
}

function resolveToolDependency(specifier, importer, root, tools) {
  if (specifier.startsWith('.') || isAbsolute(specifier)) {
    const target = resolve(dirname(importer), specifier);
    const toolsRoot = resolve(root, 'tools') + sep;
    if (!target.startsWith(toolsRoot)) return null;
    const toolDirectory = [...tools.values()].find((directory) => {
      const normalized = resolve(directory) + sep;
      return target.startsWith(normalized);
    });
    return toolDirectory
      ? [...tools].find(([, directory]) => directory === toolDirectory)?.[0] ?? relative(root, toolDirectory).split(sep).join('/')
      : relative(root, target).split(sep).join('/');
  }
  for (const name of tools.keys()) {
    if (specifier === name || specifier.startsWith(`${name}/`)) return name;
  }
  return null;
}

function importSpecifiers(source) {
  const tokens = tokenize(source);
  const specifiers = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== 'identifier') continue;
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

function tokenize(source) {
  const tokens = [];
  for (let index = 0; index < source.length;) {
    const char = source[index];
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
    if (char === '"' || char === "'") {
      const quote = char;
      let value = '';
      index += 1;
      while (index < source.length && source[index] !== quote) {
        if (source[index] === '\\' && index + 1 < source.length) {
          value += source[index + 1];
          index += 2;
        } else {
          value += source[index];
          index += 1;
        }
      }
      index += 1;
      tokens.push({ type: 'string', value });
      continue;
    }
    if (char === '`') {
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\') { index += 2; continue; }
        if (source[index] === '`') { index += 1; break; }
        index += 1;
      }
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
  return tokens;
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
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch { return files; }
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(path))) files.push(path);
  }
  return files;
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
  return resolve(path);
}
