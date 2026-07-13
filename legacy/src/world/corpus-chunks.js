import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LONG_SECTION_CHARS = 1200;
const SUBCHUNK_OVERLAP = 150;

export function splitDocumentSections(file, text) {
  if (!text) return [];
  const headerMatches = [...text.matchAll(/^(#{1,3}\s+.+)$/gm)];
  if (headerMatches.length === 0) {
    return [{
      file,
      title: file,
      body: text,
      lineStart: 1,
      lineEnd: text.split(/\r?\n/u).length
    }];
  }
  const sections = [];
  const lines = text.split(/\r?\n/u);
  for (let index = 0; index < headerMatches.length; index += 1) {
    const start = headerMatches[index].index ?? 0;
    const end = index + 1 < headerMatches.length
      ? (headerMatches[index + 1].index ?? text.length)
      : text.length;
    const chunk = text.slice(start, end).trim();
    const title = headerMatches[index][1].replace(/^#+\s*/, '').trim();
    const lineStart = lineNumberAt(text, start);
    const lineEnd = lineNumberAt(text, end - 1);
    sections.push({ file, title, body: chunk, lineStart, lineEnd });
  }
  return sections;
}

function lineNumberAt(text, offset) {
  return text.slice(0, Math.max(0, offset)).split(/\r?\n/u).length;
}

function splitLongSection(section) {
  const body = section.body ?? '';
  if (body.length <= LONG_SECTION_CHARS) {
    return [section];
  }
  const paragraphs = body.split(/\n{2,}/u).map((part) => part.trim()).filter(Boolean);
  if (paragraphs.length <= 1) {
    return splitBySize(section);
  }
  const parts = [];
  let current = '';
  let partStart = section.lineStart;
  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > LONG_SECTION_CHARS && current) {
      parts.push({ ...section, body: current, lineStart: partStart, lineEnd: section.lineEnd, partIndex: parts.length });
      const overlap = current.slice(Math.max(0, current.length - SUBCHUNK_OVERLAP));
      current = overlap ? `${overlap}\n\n${paragraph}` : paragraph;
      partStart = section.lineStart;
      continue;
    }
    current = candidate;
  }
  if (current) {
    parts.push({ ...section, body: current, lineStart: partStart, lineEnd: section.lineEnd, partIndex: parts.length });
  }
  return parts.length ? parts : [section];
}

function splitBySize(section) {
  const body = section.body ?? '';
  const parts = [];
  let offset = 0;
  while (offset < body.length) {
    const end = Math.min(body.length, offset + LONG_SECTION_CHARS);
    const slice = body.slice(offset, end);
    parts.push({ ...section, body: slice, partIndex: parts.length });
    if (end >= body.length) break;
    offset = Math.max(offset + 1, end - SUBCHUNK_OVERLAP);
  }
  return parts.length ? parts : [section];
}

export function sectionToChunks(section) {
  const parts = splitLongSection(section);
  return parts.map((part, index) => {
    const partIndex = part.partIndex ?? index;
    const sectionName = part.title ?? part.file;
    const text = `## ${part.file} — ${sectionName}\n${part.body}`;
    return {
      id: `${part.file}:${sectionName}:${partIndex}`,
      file: part.file,
      section: sectionName,
      line_start: part.lineStart,
      line_end: part.lineEnd,
      text,
      char_count: text.length
    };
  });
}

export function loadCorpusChunks(corpusDir) {
  if (!existsSync(corpusDir)) return [];
  const files = readdirSync(corpusDir)
    .filter((name) => !name.startsWith('.'))
    .sort((left, right) => left.localeCompare(right));
  const chunks = [];
  for (const file of files) {
    const path = resolve(corpusDir, file);
    const text = readFileSync(path, 'utf8').trim();
    if (!text) continue;
    for (const section of splitDocumentSections(file, text)) {
      chunks.push(...sectionToChunks(section));
    }
  }
  return chunks;
}

export function computeCorpusHash(corpusDir) {
  const hash = createHash('sha256');
  if (!existsSync(corpusDir)) return hash.digest('hex');
  const files = readdirSync(corpusDir)
    .filter((name) => !name.startsWith('.'))
    .sort((left, right) => left.localeCompare(right));
  for (const file of files) {
    hash.update(file);
    hash.update('\0');
    hash.update(readFileSync(resolve(corpusDir, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

// ponytail: sections for corpus-loader reuse same splitter shape
export function splitDocumentSectionsForLoader(file, text) {
  return splitDocumentSections(file, text).map((section) => ({
    file: section.file,
    title: section.title,
    text: `## ${section.file} — ${section.title}\n${section.body}`,
    haystack: `${section.title}\n${section.body}`.toLowerCase()
  }));
}
