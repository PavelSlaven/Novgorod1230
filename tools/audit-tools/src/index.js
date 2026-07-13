import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';

const FORBIDDEN = [/(^|\/)\.git(\/|$)/u, /(^|\/)node_modules(\/|$)/u, /(^|\/)tmp(\/|$)/u, /(^|\/)dist(\/|$)/u, /(^|\/)\.env(?:\.|$)/u, /(^|\/)data\/world-sessions(\/|$)/u, /(^|\/)data\/new-game-process(\/|$)/u, /\.zip$/u];

export async function createAuditManifest(rootPath, options = {}) {
  const root = resolve(rootPath);
  const files = await walk(root);
  const entries = [];
  for (const file of files) {
    const rel = relative(root, file).replaceAll('\\','/');
    if ((options.exclude ?? []).some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))) continue;
    const info = await stat(file);
    const content = await readFile(file);
    entries.push({ path:rel, size:info.size, sha256:createHash('sha256').update(content).digest('hex') });
  }
  entries.sort((a,b) => a.path.localeCompare(b.path));
  const verification = verifyAuditEntries(entries);
  if (!verification.ok) throw new Error(`unsafe audit tree: ${verification.errors.join('; ')}`);
  return Object.freeze({ schema_version:'rus.audit_manifest.v1', file_count:entries.length, entries });
}

export function verifyAuditEntries(entries = []) {
  const errors = [];
  const seen = new Set();
  for (const entry of entries) {
    const path = String(entry?.path ?? '').replaceAll('\\','/').replace(/^\.\//u,'');
    if (!path || path.startsWith('../') || path.startsWith('/')) errors.push(`unsafe relative path: ${path}`);
    if (seen.has(path)) errors.push(`duplicate path: ${path}`);
    seen.add(path);
    if (FORBIDDEN.some((pattern) => pattern.test(path)) || ['.env','.env.local'].includes(basename(path))) errors.push(`forbidden audit entry: ${path}`);
    if (!/^[a-f0-9]{64}$/u.test(String(entry?.sha256 ?? ''))) errors.push(`invalid sha256: ${path}`);
  }
  return Object.freeze({ ok:errors.length===0, errors });
}
async function walk(dir) { const out=[]; for (const entry of await readdir(dir,{withFileTypes:true})) { const path=join(dir,entry.name); if (entry.isDirectory()) out.push(...await walk(path)); else out.push(path); } return out; }
