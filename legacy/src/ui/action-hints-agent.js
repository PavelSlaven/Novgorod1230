import { loadDesignBundleSync } from '../world/corpus-loader.js';
import {
  explainActionHintsValidation,
  findForbiddenPublicKeys,
  parseJsonObject,
  validateActionHintsResponse
} from '../world/json-contracts.js';
import { getProviderConfig } from '../world/provider-config.js';

const REQUEST_TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 2;

function cleanText(value) {
  return String(value ?? '').trim();
}

function createChatClient(config, fetchImpl = globalThis.fetch) {
  const root = config.baseUrl.replace(/\/+$/, '');
  return {
    async complete(messages, options = {}) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error('Action hints request timeout')), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetchImpl(`${root}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: config.model,
            messages,
            temperature: options.temperature ?? 0.35,
            max_tokens: options.max_tokens ?? 700
          }),
          signal: controller.signal
        });
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`LLM request failed (${response.status}): ${body.slice(0, 200)}`);
        }
        const data = await response.json();
        return cleanText(data?.choices?.[0]?.message?.content ?? '');
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

function buildActionHintsMessages(input = {}) {
  const bundle = loadDesignBundleSync('action_hints');
  const safeInput = {
    visible_scene: cleanText(input.visible_scene),
    last_prose: cleanText(input.last_prose),
    player_status: cleanText(input.player_status),
    vitals: input.vitals ?? {},
    alert_tags: Array.isArray(input.alert_tags) ? input.alert_tags.slice(0, 6) : [],
    inventory_summary: cleanText(input.inventory_summary),
    known_obligations: Array.isArray(input.known_obligations) ? input.known_obligations.slice(0, 6) : [],
    known_risks: Array.isArray(input.known_risks) ? input.known_risks.slice(0, 6) : [],
    uncertainties: Array.isArray(input.uncertainties) ? input.uncertainties.slice(0, 6) : [],
    markup: {
      highlights: Array.isArray(input.markup?.highlights) ? input.markup.highlights.slice(0, 6) : [],
      notes: Array.isArray(input.markup?.notes) ? input.markup.notes.slice(0, 4) : [],
      atmosphere: input.markup?.atmosphere ?? {}
    }
  };

  return [
    {
      role: 'system',
      content: [
        '# Проектная документация',
        bundle,
        '',
        '# Роль',
        'Ты — агент подсказок действий исторической текстовой RPG «Русь XIII век».',
        '',
        '# Задача',
        'Предложи 3–5 правдоподобных действий, которые персонаж игрока мог бы сформулировать сейчас.',
        'Подсказки помогают игроку, но не подменяют свободный ввод.',
        '',
        '# Запреты',
        'Нельзя раскрывать скрытые сведения, предлагать мета-оптимальные решения, перечислять все команды, гарантировать успех или опираться на будущие события.',
        '',
        '# Формат ответа',
        'Верни только строгий JSON без markdown:',
        '{"version":1,"schema":"action_hints","hints":[{"text":"...","tone":"...","risk_hint":"..."}]}',
        'Поле text обязательно. tone и risk_hint — короткие строки или null.'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'action_hints_input',
        input: safeInput
      })
    }
  ];
}

function mapValidatedHints(envelope) {
  return envelope.hints.slice(0, 5).map((hint) => ({
    text: cleanText(hint.text),
    tone: hint.tone ?? null,
    risk_hint: hint.risk_hint ?? null,
    action: hint.action ?? null
  })).filter((hint) => hint.text);
}

export async function generateActionHints(input = {}, env = process.env, options = {}) {
  const violations = findForbiddenPublicKeys(input);
  if (violations.length > 0) {
    throw new Error(`Action hints input leaks forbidden keys: ${violations.slice(0, 8).join(', ')}`);
  }

  const config = getProviderConfig(env);
  if (!config.enabled) {
    throw new Error('DeepSeek API key is required for action hints. Set DEEPSEEK_API_KEY.');
  }

  const client = createChatClient(config, options.fetchImpl ?? globalThis.fetch);
  const messages = buildActionHintsMessages(input);
  let lastReason = 'unknown validation failure';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const rawText = await client.complete(messages, { temperature: attempt === 1 ? 0.35 : 0.2 });
    const parsedObject = parseJsonObject(rawText);
    const validated = validateActionHintsResponse(parsedObject);
    if (validated) {
      const hints = mapValidatedHints(validated);
      if (hints.length > 0) {
        return hints;
      }
      lastReason = 'empty hints after validation';
    } else {
      const explanation = explainActionHintsValidation(parsedObject);
      lastReason = explanation.errors?.join('; ') || lastReason;
    }
  }

  throw new Error(`Action hints contract invalid: ${lastReason}`);
}

export function createActionHintsGenerator(env = process.env, options = {}) {
  return (input) => generateActionHints(input, env, options);
}
