import { createHash } from 'node:crypto';

const LONG_SECTION_CHARS = 1200;
const SUBCHUNK_OVERLAP = 150;

export function buildCorpusChunks(corpusFiles) {
  const chunks = [];
  for (const file of Object.keys(corpusFiles).sort((left, right) => left.localeCompare(right))) {
    const text = String(corpusFiles[file] ?? '').trim();
    if (!text) continue;
    for (const section of splitDocumentSections(file, text)) chunks.push(...sectionToChunks(section));
  }
  return chunks;
}

export function computeCorpusHashFromFiles(corpusFiles) {
  const hash = createHash('sha256');
  for (const file of Object.keys(corpusFiles).sort((left, right) => left.localeCompare(right))) {
    hash.update(file);
    hash.update('\0');
    hash.update(Buffer.from(corpusFiles[file]));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function splitDocumentSections(file, text) {
  const headerMatches = [...text.matchAll(/^(#{1,3}\s+.+)$/gmu)];
  if (headerMatches.length === 0) {
    return [{ file, title: file, body: text, lineStart: 1, lineEnd: text.split(/\r?\n/u).length }];
  }
  const sections = [];
  for (let index = 0; index < headerMatches.length; index += 1) {
    const start = headerMatches[index].index ?? 0;
    const end = index + 1 < headerMatches.length ? (headerMatches[index + 1].index ?? text.length) : text.length;
    const body = text.slice(start, end).trim();
    sections.push({
      file,
      title: headerMatches[index][1].replace(/^#+\s*/u, '').trim(),
      body,
      lineStart: lineNumberAt(text, start),
      lineEnd: lineNumberAt(text, end - 1)
    });
  }
  return sections;
}

function lineNumberAt(text, offset) {
  return text.slice(0, Math.max(0, offset)).split(/\r?\n/u).length;
}

function sectionToChunks(section) {
  return splitLongSection(section).map((part, index) => {
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

function splitLongSection(section) {
  const body = section.body ?? '';
  if (body.length <= LONG_SECTION_CHARS) return [section];
  const paragraphs = body.split(/\n{2,}/u).map((part) => part.trim()).filter(Boolean);
  if (paragraphs.length <= 1) return splitBySize(section);
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
    } else {
      current = candidate;
    }
  }
  if (current) parts.push({ ...section, body: current, lineStart: partStart, lineEnd: section.lineEnd, partIndex: parts.length });
  return parts.length ? parts : [section];
}

function splitBySize(section) {
  const body = section.body ?? '';
  const parts = [];
  let offset = 0;
  while (offset < body.length) {
    const end = Math.min(body.length, offset + LONG_SECTION_CHARS);
    parts.push({ ...section, body: body.slice(offset, end), partIndex: parts.length });
    if (end >= body.length) break;
    offset = Math.max(offset + 1, end - SUBCHUNK_OVERLAP);
  }
  return parts.length ? parts : [section];
}
