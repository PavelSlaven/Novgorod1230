import {
  PORTRAIT_SPEC_V1_JSON_SCHEMA,
  formatPortraitSpecV1Errors,
  validatePortraitSpecV1
} from '@rus/contracts/portrait-spec-v1';
import { PortraitLabRoles } from '@rus/llm-runtime';
import { serverError } from '../errors.js';
import { PORTRAIT_TEXT_MAX_LENGTH } from './request.js';

const EXAMPLE = Object.freeze({
  schema: 'portrait_spec_v1',
  person: {
    sex: 'male', age: 'middle_aged', build: 'average',
    skin_tone: 'light', face_shape: 'broad'
  },
  hair: {
    color: 'dark_brown', length: 'medium', style: 'loose',
    facial_hair: 'short_beard'
  },
  eyes: { color: 'gray', gaze: 'viewer' },
  expression: { emotion: 'suspicious', intensity: 'medium' },
  clothing: {
    base: 'linen_tunic', outer: 'caftan', main_color: 'dark_blue',
    secondary_color: 'undyed_linen', headwear: 'none'
  },
  pose: { body: 'three_quarter', head: 'slightly_turned' },
  background: 'neutral'
});

export const PORTRAIT_SPEC_SYSTEM_PROMPT = [
  'Преобразуй описание человека в один JSON object portrait_spec_v1.',
  'Верни только JSON: без Markdown, пояснений и дополнительных полей.',
  'Используй только enum из JSON Schema ниже и заполни каждое обязательное поле.',
  'Если признак не задан, выбери нейтральный правдоподобный вариант.',
  'Сохрани явно заданные возраст, внешность, эмоцию, взгляд и одежду.',
  'Ориентируйся на визуально правдоподобного персонажа Руси XIII века.',
  'Не добавляй биографию, окружающую сцену, современные или фантазийные предметы.',
  '',
  'JSON Schema:',
  JSON.stringify(PORTRAIT_SPEC_V1_JSON_SCHEMA, null, 2),
  '',
  'Пример JSON:',
  JSON.stringify(EXAMPLE, null, 2)
].join('\n');

export function createPortraitSpecNormalizer({ roleRunner } = {}) {
  if (typeof roleRunner?.run !== 'function') {
    throw new TypeError('portrait roleRunner.run is required.');
  }
  return Object.freeze({
    async normalize(rawText) {
      const text = String(rawText ?? '').trim();
      if (!text) {
        throw serverError('PORTRAIT_TEXT_REQUIRED', 'text is required.', { status: 400 });
      }
      if (text.length > PORTRAIT_TEXT_MAX_LENGTH) {
        throw serverError(
          'PORTRAIT_TEXT_TOO_LONG',
          `text must not exceed ${PORTRAIT_TEXT_MAX_LENGTH} characters.`,
          { status: 400 }
        );
      }

      let response;
      try {
        response = await roleRunner.run({
          scope: 'portrait_lab',
          role_id: PortraitLabRoles.SPEC_NORMALIZER,
          messages: [
            { role: 'system', content: PORTRAIT_SPEC_SYSTEM_PROMPT },
            { role: 'user', content: text }
          ]
        });
      } catch (error) {
        throw serverError(
          'PORTRAIT_SPEC_PROVIDER_FAILED',
          'DeepSeek portrait conversion failed.',
          { status: 502, details: { cause_code: error?.code ?? null } }
        );
      }

      const errors = validatePortraitSpecV1(response?.output);
      if (errors.length) {
        throw serverError(
          'PORTRAIT_SPEC_PROVIDER_INVALID',
          `DeepSeek returned invalid portrait JSON: ${formatPortraitSpecV1Errors(errors)}`,
          { status: 502, details: { validation_errors: errors } }
        );
      }
      return structuredClone(response.output);
    }
  });
}
