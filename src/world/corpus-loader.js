import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { splitDocumentSectionsForLoader } from './corpus-chunks.js';
import {
  buildRetrievalQuery,
  formatRagChunk,
  isCorpusRagEnabled,
  loadRagIndex,
  searchCorpus
} from './corpus-rag.js';
import { isInventoryIntent } from './intent.js';

const CORPUS_DIR = resolve(process.cwd(), 'DOCUMENTS', 'documents-kg', 'corpus', 'DOCUMENTS');
const GRAPH_PATH = resolve(process.cwd(), 'DOCUMENTS', 'documents-kg', 'graphify-out', 'graph.json');
const RUS13_PROMPTS_DIR = resolve(process.env.RUS13_PROMPTS_DIR || resolve(process.cwd(), 'prompts', 'rus13'));
const MAX_BUNDLE_CHARS = Number(process.env.CORPUS_BUNDLE_MAX_CHARS ?? 12000);
const MAX_GRAPH_HINT_CHARS = Number(process.env.GRAPH_HINT_MAX_CHARS ?? 2500);

const TASK_BUDGETS = {
  default: 12000,
  historical_frame: 12000,
  inventory: 16000,
  movement: 18000,
  new_game: 28000,
  master_narrative: 24000,
  combat: 16000,
  player_seed: 42000
};

const TASK_REQUIRED_EXCERPTS = {
  inventory: [
    ['items_and_property.txt', ['контейнер', 'владел', 'доступ', 'риск', 'нельзя создавать предмет', 'fixed items']],
    ['character_inventory_equipment.txt', ['equipment', 'рук', 'нагруз']]
  ],
  movement: [
    ['movement_locations_regions.txt', ['дальний курс', 'фактическая карта', 'last_route_id']],
    ['world_generation_and_turns.txt', ['карта знаний', 'last_route_id']]
  ]
};

const TASK_FILES = {
  new_game: [
    'llm_agent_prompt_templates.md',
    'world_generation_and_turns.txt',
    'time_system.txt',
    'movement_locations_regions.txt',
    'interface_ux.md'
  ],
  historical_frame: [
    'historical_events_and_figures.txt',
    'world_regions.txt',
    'time_system.txt',
    'world_generation_and_turns.txt',
    'information_sources_llm_prompts.md'
  ],
  place_seed: [
    'movement_locations_regions.txt',
    'world_generation_and_turns.txt',
    'time_system.txt'
  ],
  social_tissue: [
    'npc_generation_profiles.txt',
    'movement_locations_regions.txt',
    'world_generation_and_turns.txt'
  ],
  player_seed: [
    'llm_agent_prompt_templates.md',
    'formulas.md',
    'player_character_generation.txt',
    'character_parameters.txt',
    'character_inventory_equipment.txt',
    'items_and_property.txt'
  ],
  actor_profiles: [
    'npc_generation_profiles.txt',
    'formulas.md',
    'character_parameters.txt',
    'items_and_property.txt',
    'interface_ux.md'
  ],
  location_profiles: [
    'movement_locations_regions.txt',
    'formulas.md',
    'time_system.txt',
    'interface_ux.md'
  ],
  master_narrative: [
    'llm_agent_prompt_templates.md',
    'formulas.md',
    'world_generation_and_turns.txt',
    'time_system.txt',
    'movement_locations_regions.txt',
    'interface_ux.md'
  ],
  movement: [
    'movement_locations_regions.txt',
    'formulas.md',
    'time_system.txt',
    'world_regions.txt',
    'world_generation_and_turns.txt'
  ],
  risk_audit: [
    'llm_agent_prompt_templates.md',
    'formulas.md',
    'character_parameters.txt',
    'combat_system.md'
  ],
  combat: [
    'combat_system.md',
    'formulas.md',
    'weapons_and_armor.txt',
    'character_parameters.txt',
    'character_inventory_equipment.txt',
    'npc_inventory_item_marks.txt'
  ],
  inventory: [
    'items_and_property.txt',
    'formulas.md',
    'character_inventory_equipment.txt',
    'npc_inventory_item_marks.txt'
  ],
  action_hints: [
    'llm_agent_prompt_templates.md',
    'interface_ux.md',
    'information_sources_llm_prompts.md'
  ],
  default: ['llm_agent_prompt_templates.md', 'llm_documentation_navigation.md']
};

const TASK_SECTIONS = {
  combat: [
    { file: 'formulas.md', mustInclude: ['балл вреда = качество попадания'] },
    { file: 'combat_system.md', mustInclude: ['attack formula', 'damage', 'armor', 'injury', 'npc reaction', 'удар', 'брон', 'травм'] },
    { file: 'weapons_and_armor.txt', mustInclude: ['weapon danger', 'armor defense', 'оруж', 'брон'] },
    { file: 'character_inventory_equipment.txt', mustInclude: ['equipment modifier', 'hands', 'load', 'экип', 'рук', 'нагруз'] }
  ],
  inventory: [
    { file: 'formulas.md', mustInclude: ['инвентарь = предметы при персонаже'] },
    { file: 'items_and_property.txt', mustInclude: ['fixed items', 'containers', 'discoverability', 'ownership', 'контейнер', 'обнаруж', 'владен'] },
    { file: 'character_inventory_equipment.txt', mustInclude: ['inventory', 'load', 'equipment', 'инвент', 'нагруз', 'снаряж'] }
  ],
  movement: [
    { file: 'formulas.md', mustInclude: ['итоговое время = базовое время × множитель условий × множитель нагрузки'] },
    { file: 'movement_locations_regions.txt', mustInclude: ['route', 'time', 'weather', 'маршрут', 'время', 'погод', 'дальний курс', 'last_route_id', 'возврат'] },
    { file: 'world_generation_and_turns.txt', mustInclude: ['travel', 'movement', 'движен', 'переход', 'фактическая карта', 'карта знаний', 'current_position', 'last_route_id'] }
  ],
  master_narrative: [
    { file: 'formulas.md', mustInclude: ['сначала расчёт и фиксация последствий, потом видимое состояние, потом художественная проза'] },
    { file: 'llm_agent_prompt_templates.md', mustInclude: ['промт агента отбора видимого контекста', 'visible_context'] },
    { file: 'llm_agent_prompt_templates.md', mustInclude: ['промт агента художественной прозы'] },
    { file: 'llm_agent_prompt_templates.md', mustInclude: ['промт агента последствий хода'] },
    { file: 'interface_ux.md', mustInclude: ['hidden state', 'raw diagnostics', 'debug', 'скрыт', 'диагност'] }
  ],
  new_game: [
    { file: 'llm_agent_prompt_templates.md', mustInclude: ['промт агента отбора видимого контекста'] },
    { file: 'llm_agent_prompt_templates.md', mustInclude: ['промт агента художественной прозы'] },
    { file: 'interface_ux.md', mustInclude: ['hidden state', 'raw diagnostics', 'скрыт', 'диагност'] }
  ],
  action_hints: [
    { file: 'llm_agent_prompt_templates.md', mustInclude: ['промт агента подсказок действий'] },
    { file: 'interface_ux.md', mustInclude: ['подсказки действий', 'свободный ввод', 'скрыт'] }
  ],
  player_seed: [
    { file: 'llm_agent_prompt_templates.md', mustInclude: ['промт агента структурирования', 'не придумывает'] },
    { file: 'player_character_generation.txt', mustInclude: ['входные данные', 'заявк', 'стартов'] },
    { file: 'player_character_generation.txt', mustInclude: ['главное правило адаптации', 'адаптац'] },
    { file: 'player_character_generation.txt', mustInclude: ['социальное положение', 'статус', 'доступ'] },
    { file: 'player_character_generation.txt', mustInclude: ['тело и состояние', 'здоров', 'одежд'] },
    { file: 'player_character_generation.txt', mustInclude: ['6. характеристик', 'strength', 'agility', 'endurance'] },
    { file: 'player_character_generation.txt', mustInclude: ['7. навыки', 'skill', 'навык'] },
    { file: 'player_character_generation.txt', mustInclude: ['8. знания персонажа', 'known_facts', 'rumors'] },
    { file: 'player_character_generation.txt', mustInclude: ['11. имущество', 'инвентар', 'доступ'] },
    { file: 'player_character_generation.txt', mustInclude: ['15. историческая проверка', 'историческ'] },
    { file: 'player_character_generation.txt', mustInclude: ['19. выходной результат', 'player_character', 'identity'] },
    { file: 'player_character_generation.txt', mustInclude: ['20. ограничения генерации', 'запрет', 'нельзя'] },
    { file: 'character_parameters.txt', mustInclude: ['характеристик', 'навык', 'strength'] },
    { file: 'character_inventory_equipment.txt', mustInclude: ['инвентар', 'снаряж', 'нагруз'] },
    { file: 'items_and_property.txt', mustInclude: ['имущ', 'владен', 'доступ'] }
  ]
};

const TASK_KEYWORDS = {
  combat: ['combat', 'weapon', 'armor', 'attack', 'defend', 'fight', 'battle', 'бой', 'оруж', 'брон', 'удар'],
  movement: ['movement', 'location', 'region', 'road', 'travel', 'движен', 'локац', 'регион', 'дорог', 'путь'],
  master_narrative: ['turn', 'time', 'scene', 'interface', 'ход', 'время', 'сцен', 'интерфейс'],
  inventory: ['inventory', 'item', 'property', 'equipment', 'инвент', 'предмет', 'имущ', 'снаряж'],
  actor_profiles: ['npc', 'character', 'profile', 'персонаж', 'профил'],
  historical_frame: ['historical', 'region', 'year', 'season', 'истор', 'регион', 'год', 'сезон'],
  action_hints: ['hint', 'action', 'ui', 'interface', 'подсказ', 'действ', 'интерфейс']
};

const CORPUS_FILE_DELIMITER = '\n\n<<<corpus-file>>>\n\n';

let graphIndex = null;
const sectionCache = new Map();

export function getCorpusDir() {
  return CORPUS_DIR;
}

export function getTaskFiles(task = 'default') {
  return TASK_FILES[task] ?? TASK_FILES.default;
}

export function loadDesignBundleSync(task = 'default', { frame } = {}) {
  const budget = TASK_BUDGETS[task] ?? MAX_BUNDLE_CHARS;
  const graphHints = loadGraphHints(task);
  const graphSection = graphHints ? `\n\n## graphify hints\n${graphHints}` : '';
  const corpusBudget = Math.max(4000, budget - graphSection.length);
  let corpus = readCorpusBundleSync(task, corpusBudget, frame);
  if (!graphSection) return corpus;
  if (`${corpus}${graphSection}`.length <= budget) {
    return `${corpus}${graphSection}`;
  }
  const tighterBudget = Math.max(3000, budget - graphSection.length - 64);
  corpus = readCorpusBundleSync(task, tighterBudget, frame);
  return `${corpus}${graphSection}`;
}

export async function loadDesignBundle(task = 'default', { frame } = {}) {
  const useRag = isCorpusRagEnabled() && Boolean(loadRagIndex());
  const budget = TASK_BUDGETS[task] ?? MAX_BUNDLE_CHARS;
  const graphHints = loadGraphHints(task);
  const graphSection = graphHints ? `\n\n## graphify hints\n${graphHints}` : '';
  const corpusBudget = Math.max(4000, budget - graphSection.length);
  let corpus = useRag
    ? await readCorpusBundle(task, corpusBudget, frame, true)
    : readCorpusBundleSync(task, corpusBudget, frame);
  if (!graphSection) return corpus;
  if (`${corpus}${graphSection}`.length <= budget) {
    return `${corpus}${graphSection}`;
  }
  const tighterBudget = Math.max(3000, budget - graphSection.length - 64);
  corpus = useRag
    ? await readCorpusBundle(task, tighterBudget, frame, true)
    : readCorpusBundleSync(task, tighterBudget, frame);
  return `${corpus}${graphSection}`;
}

function readCorpusBundleSync(task = 'default', maxChars = MAX_BUNDLE_CHARS, frame = {}) {
  const files = TASK_FILES[task] ?? TASK_FILES.default;
  const sections = [];
  for (const file of files) {
    sections.push(...loadDocumentSections(file));
  }
  sections.push(...loadRus13PromptSections(task));
  const snippets = buildRequiredSnippets(task);
  const snippetLength = snippets ? snippets.length + 2 : 0;
  const result = buildSectionAwareBundleSync(
    task,
    sections,
    Math.max(3000, maxChars - snippetLength),
    frame
  );
  return finalizeCorpusBundle(task, snippets, result);
}

async function readCorpusBundle(task = 'default', maxChars = MAX_BUNDLE_CHARS, frame = {}, useRag = true) {
  const files = TASK_FILES[task] ?? TASK_FILES.default;
  const sections = [];
  for (const file of files) {
    sections.push(...loadDocumentSections(file));
  }
  sections.push(...loadRus13PromptSections(task));
  const snippets = buildRequiredSnippets(task);
  const snippetLength = snippets ? snippets.length + 2 : 0;
  const result = await buildSectionAwareBundle(
    task,
    sections,
    Math.max(3000, maxChars - snippetLength),
    frame,
    useRag
  );
  return finalizeCorpusBundle(task, snippets, result);
}

function finalizeCorpusBundle(task, snippets, result) {
  const { bundle, includedSectionIds, missingRequired, truncated, ragUsed, ragChunkIds, ragQuery } = result;
  const combined = snippets ? `${snippets}\n\n${bundle}` : bundle;
  lastBundleCoverage = {
    task,
    includedSectionIds,
    missingRequired,
    truncated: truncated || combined.includes('[corpus bundle truncated]'),
    ragUsed: ragUsed ?? false,
    ragChunkIds: ragChunkIds ?? [],
    ragQuery: ragQuery ?? null
  };
  return combined;
}

let lastBundleCoverage = null;

export function getLastBundleCoverage() {
  return lastBundleCoverage;
}

export function inspectDesignBundleCoverageSync(task = 'default') {
  const bundle = loadDesignBundleSync(task);
  return inspectDesignBundleCoverageFromBundle(task, bundle);
}

export async function inspectDesignBundleCoverage(task = 'default') {
  const bundle = await loadDesignBundle(task);
  return inspectDesignBundleCoverageFromBundle(task, bundle);
}

function inspectDesignBundleCoverageFromBundle(task, bundle) {
  const budget = TASK_BUDGETS[task] ?? MAX_BUNDLE_CHARS;
  const coverage = getLastBundleCoverage();
  const mandatoryRules = TASK_SECTIONS[task] ?? [];
  const files = TASK_FILES[task] ?? TASK_FILES.default;
  const sections = files.flatMap((file) => loadDocumentSections(file));
  const requiredIds = [];
  const missing = [];

  for (const rule of mandatoryRules) {
    for (const section of sections) {
      if (section.file !== rule.file) continue;
      if (!sectionMatchesMustInclude(section, rule.mustInclude)) continue;
      const id = `${section.file}:${section.title}`;
      requiredIds.push(id);
      const marker = section.text.trim().slice(0, 120);
      if (!bundle.includes(marker)) missing.push(id);
    }
  }

  return {
    ok: missing.length === 0 && !bundle.includes('[corpus bundle truncated]'),
    task,
    budget,
    bundleLength: bundle.length,
    includedSectionIds: coverage?.includedSectionIds ?? [],
    missingRequired: [...new Set([...(coverage?.missingRequired ?? []), ...missing])],
    truncated: bundle.includes('[corpus bundle truncated]') || Boolean(coverage?.truncated)
  };
}

function buildRequiredSnippets(task) {
  const rules = TASK_REQUIRED_EXCERPTS[task] ?? [];
  const blocks = [];
  for (const [file, needles] of rules) {
    const path = resolve(CORPUS_DIR, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    const lower = text.toLowerCase();
    for (const needle of needles) {
      const index = lower.indexOf(String(needle).toLowerCase());
      if (index < 0) continue;
      const lines = text.split(/\r?\n/u);
      let cursor = 0;
      let lineIndex = 0;
      for (let i = 0; i < lines.length; i += 1) {
        cursor += lines[i].length + 1;
        if (cursor > index) {
          lineIndex = i;
          break;
        }
      }
      const start = Math.max(0, lineIndex - 8);
      const end = Math.min(lines.length, lineIndex + 12);
      blocks.push(`## ${file} — required\n${lines.slice(start, end).join('\n').trim()}`);
      break;
    }
  }
  return blocks.join('\n\n').trim();
}

function loadDocumentSections(file) {
  const cacheKey = file;
  if (sectionCache.has(cacheKey)) return sectionCache.get(cacheKey);
  const path = resolve(CORPUS_DIR, file);
  if (!existsSync(path)) {
    sectionCache.set(cacheKey, []);
    return [];
  }
  const text = readFileSync(path, 'utf8').trim();
  const sections = splitDocumentSectionsForLoader(file, text);
  sectionCache.set(cacheKey, sections);
  return sections;
}

function loadRus13PromptSections(task) {
  if (!existsSync(RUS13_PROMPTS_DIR)) return [];
  const prompts = [];
  for (const path of listMarkdownFiles(RUS13_PROMPTS_DIR)) {
    const relativePath = path.slice(RUS13_PROMPTS_DIR.length + 1).replace(/\\/gu, '/');
    if (!isRus13PromptRelevant(task, relativePath)) continue;
    const text = readFileSync(path, 'utf8').trim();
    if (!text) continue;
    prompts.push({
      file: `prompts/rus13/${relativePath}`,
      title: relativePath,
      text: `# RUS13 prompt: ${relativePath}\n\n${text}`,
      haystack: `${relativePath}\n${text}`.toLowerCase()
    });
  }
  return prompts;
}

function listMarkdownFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = resolve(dir, entry);
    const info = statSync(path);
    if (info.isDirectory()) {
      files.push(...listMarkdownFiles(path));
    } else if (entry.endsWith('.md')) {
      files.push(path);
    }
  }
  return files;
}

function isRus13PromptRelevant(task, relativePath) {
  if (task === 'new_game') return relativePath.startsWith('new-party/');
  if (task === 'historical_frame') return /historical|request_normalizer|audit/u.test(relativePath);
  if (task === 'place_seed') return /start_place|g5_context|g5_template/u.test(relativePath);
  if (task === 'player_seed') return /player_character|request_normalizer|repair/u.test(relativePath);
  if (task === 'master_narrative') return /visible|intro|g5_|repair|audit/u.test(relativePath);
  return /repair|audit/u.test(relativePath);
}

function sectionMatchesMustInclude(section, needles = []) {
  const haystack = section.haystack ?? '';
  return needles.some((needle) => haystack.includes(String(needle).toLowerCase()));
}

function scoreSection(section, keywords = []) {
  let score = 0;
  for (const keyword of keywords) {
    if ((section.haystack ?? '').includes(String(keyword).toLowerCase())) score += 1;
  }
  return score;
}

function collectSectionBundle(task, sections) {
  const keywords = TASK_KEYWORDS[task] ?? [];
  const mandatoryRules = TASK_SECTIONS[task] ?? [];
  const requiredExcerpts = TASK_REQUIRED_EXCERPTS[task] ?? [];
  const picked = [];
  const required = new Set();
  const seen = new Set();

  const pushSection = (section, isRequired = false) => {
    const key = `${section.file}:${section.title}`;
    if (seen.has(key)) return;
    seen.add(key);
    picked.push(section);
    if (isRequired) required.add(key);
  };

  for (const file of TASK_FILES[task] ?? TASK_FILES.default) {
    const first = sections.find((section) => section.file === file);
    if (first) pushSection(first, true);
  }

  for (const rule of mandatoryRules) {
    for (const section of sections) {
      if (section.file !== rule.file) continue;
      if (sectionMatchesMustInclude(section, rule.mustInclude)) pushSection(section, true);
    }
  }

  for (const [file, needles] of requiredExcerpts) {
    for (const section of sections) {
      if (section.file !== file) continue;
      if (sectionMatchesMustInclude(section, needles)) pushSection(section, true);
    }
  }

  const ranked = [...sections]
    .filter((section) => !seen.has(`${section.file}:${section.title}`))
    .sort((left, right) => scoreSection(right, keywords) - scoreSection(left, keywords));

  for (const section of ranked) pushSection(section, false);

  return {
    keywords,
    required,
    seen,
    requiredSections: picked.filter((section) => required.has(`${section.file}:${section.title}`)),
    optionalSections: picked.filter((section) => !required.has(`${section.file}:${section.title}`))
  };
}

function buildSectionAwareBundleSync(task, sections, maxChars, frame = {}) {
  const { keywords, required, seen, requiredSections, optionalSections } = collectSectionBundle(task, sections);
  const parts = [];
  const includedSectionIds = [];
  let used = 0;
  let truncated = false;

  for (const section of requiredSections) {
    const block = section.text.trim();
    if (!block) continue;
    parts.push(block);
    includedSectionIds.push(`${section.file}:${section.title}`);
    used += block.length + CORPUS_FILE_DELIMITER.length;
  }

  return appendKeywordOptional({
    optionalSections,
    parts,
    includedSectionIds,
    maxChars,
    used,
    truncated,
    required,
    ragUsed: false,
    ragChunkIds: [],
    ragQuery: null
  });
}

async function buildSectionAwareBundle(task, sections, maxChars, frame = {}, useRag = true) {
  const { keywords, required, seen, requiredSections, optionalSections } = collectSectionBundle(task, sections);
  const parts = [];
  const includedSectionIds = [];
  let used = 0;
  let truncated = false;

  for (const section of requiredSections) {
    const block = section.text.trim();
    if (!block) continue;
    parts.push(block);
    includedSectionIds.push(`${section.file}:${section.title}`);
    used += block.length + CORPUS_FILE_DELIMITER.length;
  }

  if (useRag && isCorpusRagEnabled() && loadRagIndex()) {
    const ragResult = await fillOptionalBudgetWithRag({
      task,
      frame,
      keywords,
      seen,
      parts,
      includedSectionIds,
      maxChars,
      used,
      truncated
    });
    if (ragResult.ragUsed) {
      return finalizeSectionBundle(parts, includedSectionIds, required, {
        truncated: ragResult.truncated,
        ragUsed: true,
        ragChunkIds: ragResult.ragChunkIds,
        ragQuery: ragResult.ragQuery
      });
    }
    return appendKeywordOptional({
      optionalSections,
      parts,
      includedSectionIds,
      maxChars,
      used: ragResult.used,
      truncated: ragResult.truncated,
      required,
      ragUsed: false,
      ragChunkIds: [],
      ragQuery: ragResult.ragQuery
    });
  }

  return appendKeywordOptional({
    optionalSections,
    parts,
    includedSectionIds,
    maxChars,
    used,
    truncated,
    required,
    ragUsed: false,
    ragChunkIds: [],
    ragQuery: null
  });
}

async function fillOptionalBudgetWithRag({
  task,
  frame,
  keywords,
  seen,
  parts,
  includedSectionIds,
  maxChars,
  used: initialUsed,
  truncated: initialTruncated
}) {
  let used = initialUsed;
  let truncated = initialTruncated;
  const ragChunkIds = [];
  const ragQuery = buildRetrievalQuery(task, frame, keywords);
  try {
    const hits = await searchCorpus(ragQuery, {
      topK: Number(process.env.CORPUS_RAG_TOP_K ?? 12) || 12,
      excludeIds: includedSectionIds
    });
    for (const hit of hits) {
      const sectionKey = `${hit.file}:${hit.section}`;
      if (seen.has(sectionKey)) continue;
      const block = formatRagChunk(hit).trim();
      if (!block) continue;
      if (used + block.length + 32 <= maxChars) {
        parts.push(block);
        includedSectionIds.push(hit.id);
        ragChunkIds.push(hit.id);
        seen.add(sectionKey);
        used += block.length + CORPUS_FILE_DELIMITER.length;
        continue;
      }
      const remaining = maxChars - used - 32;
      if (remaining > 240) {
        parts.push(`${block.slice(0, remaining)}\n[section truncated]`);
        includedSectionIds.push(hit.id);
        ragChunkIds.push(hit.id);
        truncated = true;
        used = maxChars;
      }
      break;
    }
    return {
      ragUsed: ragChunkIds.length > 0,
      ragChunkIds,
      ragQuery,
      used,
      truncated
    };
  } catch {
    return { ragUsed: false, ragChunkIds: [], ragQuery, used, truncated };
  }
}

function appendKeywordOptional({
  optionalSections,
  parts,
  includedSectionIds,
  maxChars,
  used: initialUsed,
  truncated: initialTruncated,
  required,
  ragUsed,
  ragChunkIds,
  ragQuery
}) {
  let used = initialUsed;
  let truncated = initialTruncated;
  for (const section of optionalSections) {
    const block = section.text.trim();
    if (!block) continue;
    const key = `${section.file}:${section.title}`;
    if (used + block.length + 32 <= maxChars) {
      parts.push(block);
      includedSectionIds.push(key);
      used += block.length + CORPUS_FILE_DELIMITER.length;
      continue;
    }
    const remaining = maxChars - used - 32;
    if (remaining > 240) {
      parts.push(`${block.slice(0, remaining)}\n[section truncated]`);
      includedSectionIds.push(key);
      truncated = true;
      used = maxChars;
    }
    break;
  }
  return finalizeSectionBundle(parts, includedSectionIds, required, {
    truncated,
    ragUsed,
    ragChunkIds,
    ragQuery
  });
}

function finalizeSectionBundle(parts, includedSectionIds, required, meta) {
  if (parts.length === 0) {
    return {
      bundle: '[corpus bundle empty]',
      includedSectionIds,
      missingRequired: [...required],
      truncated: true,
      ragUsed: meta.ragUsed ?? false,
      ragChunkIds: meta.ragChunkIds ?? [],
      ragQuery: meta.ragQuery ?? null
    };
  }
  const bundle = parts.join(CORPUS_FILE_DELIMITER);
  const missingRequired = [...required].filter((key) => !includedSectionIds.includes(key));
  return {
    bundle: meta.truncated ? `${bundle}\n\n[corpus bundle truncated]` : bundle,
    includedSectionIds,
    missingRequired,
    truncated: meta.truncated,
    ragUsed: meta.ragUsed ?? false,
    ragChunkIds: meta.ragChunkIds ?? [],
    ragQuery: meta.ragQuery ?? null
  };
}

export function loadGraphHints(task = 'default') {
  const files = TASK_FILES[task] ?? TASK_FILES.default;
  const index = loadGraphIndex();
  if (!index) return '';

  const keywords = TASK_KEYWORDS[task] ?? [];
  const hints = [];
  for (const file of files) {
    const key = file.toLowerCase();
    const nodes = rankGraphNodes(index.get(key) ?? [], keywords);
    for (const node of nodes.slice(0, 4)) {
      const location = formatSourceLocation(node.sourceLocation);
      const prefix = location ? `${node.label} (${location})` : node.label;
      hints.push(`- ${prefix}: ${node.description}`);
    }
  }

  const text = hints.join('\n').trim();
  if (!text) return '';
  if (text.length <= MAX_GRAPH_HINT_CHARS) return text;
  return `${text.slice(0, MAX_GRAPH_HINT_CHARS)}\n[graph hints truncated]`;
}

function rankGraphNodes(nodes, keywords = []) {
  if (!keywords.length) return nodes;
  return [...nodes].sort((left, right) => scoreGraphNode(right, keywords) - scoreGraphNode(left, keywords));
}

function scoreGraphNode(node, keywords) {
  const haystack = `${node.label} ${node.description}`.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) score += 1;
  }
  return score;
}

export function formatSourceLocation(sourceLocation = null) {
  if (!sourceLocation || typeof sourceLocation !== 'object') return '';
  const file = String(sourceLocation.file ?? '').split('/').pop();
  const section = sourceLocation.section ? `#${sourceLocation.section}` : '';
  const lineRange = sourceLocation.line_range
    ?? (sourceLocation.line_start != null && sourceLocation.line_end != null
      ? `L${sourceLocation.line_start}-L${sourceLocation.line_end}`
      : sourceLocation.lines);
  const lines = lineRange ? `:${lineRange}` : '';
  return `${file}${section}${lines}`.trim();
}

function loadGraphIndex() {
  if (graphIndex) return graphIndex;
  if (!existsSync(GRAPH_PATH)) return null;

  try {
    const graph = JSON.parse(readFileSync(GRAPH_PATH, 'utf8'));
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    const byFile = new Map();

    for (const node of nodes) {
      const sourceFile = String(node?.source_file ?? node?.source_location?.file ?? '');
      const basename = sourceFile.split('/').pop()?.toLowerCase();
      if (!basename) continue;
      const bucket = byFile.get(basename) ?? [];
      bucket.push({
        label: String(node.label ?? node.id ?? basename),
        description: String(node.description ?? node.norm_label ?? '').trim() || 'graph node',
        sourceLocation: node?.source_location ?? null
      });
      byFile.set(basename, bucket);
    }

    graphIndex = byFile;
    return graphIndex;
  } catch {
    return null;
  }
}

export function resolveDesignTask(frame = {}) {
  const intentType = String(frame?.intent?.type ?? '').toLowerCase();
  if (['attack', 'defend', 'flee'].includes(intentType)) return 'combat';
  if (frame?.world?.inventoryFocus || isInventoryIntent(intentType)) return 'inventory';
  if (['move', 'travel', 'return'].includes(intentType)) return 'movement';
  if (frame?.world?.isNewGame) return 'new_game';
  if (frame?.pipelineStage) return String(frame.pipelineStage);
  return 'master_narrative';
}
