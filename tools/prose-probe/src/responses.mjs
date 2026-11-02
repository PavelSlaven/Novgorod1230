export const classes = ['свободно', 'нужна характеристика', 'нарушение'];
export const items = ['нет', ...Array.from({ length: 10 }, (_, index) => String(index + 1))];
const place = { type: 'string', description: 'При «нет» приведите дословную цитату места нарушения; при «да» передайте пустую строку.' };
const nonempty = { type: 'string', minLength: 1 };
const strings = (minItems = 0, maxItems) => ({ type: 'array', items: nonempty, minItems, ...(maxItems ? { maxItems } : {}) });
const object = (properties) => ({ type: 'object', required: Object.keys(properties), properties });

export const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  ...object({
    texts: { type: 'array', items: object({
      blind_id: nonempty,
      criteria: {
        type: 'array', minItems: 15, maxItems: 15,
        items: object({ n: { type: 'integer', minimum: 1, maximum: 15 }, mark: { enum: ['да', 'нет'] }, place }),
        allOf: Array.from({ length: 15 }, (_, index) => ({ contains: { type: 'object', required: ['n'], properties: { n: { const: index + 1 } } }, minContains: 1, maxContains: 1 }))
      },
      liveliness: { type: 'integer', minimum: 0, maximum: 10 },
      inventions: { type: 'array', items: {
        ...object({ quote: nonempty, class: { enum: classes }, item: { enum: items } }),
        allOf: [{ if: { required: ['class'], properties: { class: { const: 'нужна характеристика' } } }, then: { properties: { item: { enum: items.slice(1) } } } }]
      } },
      dislike: { type: 'array', minItems: 1, maxItems: 3, items: object({ what: nonempty, quote: nonempty }) },
      improve: strings(1, 3),
      missing_facts: strings()
    }) },
    improve_general: strings(3, 5)
  })
};

export function stringArray(value, name, min = 0, max = Infinity) {
  const errors = [];
  if (!Array.isArray(value)) return [`${name}: нужен массив`];
  if (value.length < min || value.length > max) errors.push(`${name}: неверное число записей`);
  value.forEach((entry, i) => { if (typeof entry !== 'string' || !entry.length) errors.push(`${name}[${i}]: нужна непустая строка`); });
  return errors;
}

export function validateText(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['нужен объект ответа на текст'];
  const errors = [];
  if (typeof value.blind_id !== 'string' || !value.blind_id.length) errors.push('blind_id: нужна непустая строка');
  if (!Array.isArray(value.criteria)) errors.push('criteria: нужен массив');
  else {
    if (value.criteria.length !== 15) errors.push('criteria: должно быть ровно 15 записей');
    for (let n = 1; n <= 15; n++) if (value.criteria.filter(entry => entry?.n === n).length !== 1) errors.push(`criteria: признак ${n} должен встретиться ровно один раз`);
    value.criteria.forEach((entry, i) => {
      if (!Number.isInteger(entry?.n) || entry.n < 1 || entry.n > 15) errors.push(`criteria[${i}].n: нужен номер от 1 до 15`);
      if (!['да', 'нет'].includes(entry?.mark)) errors.push(`criteria[${i}].mark: нужна отметка да или нет`);
      if (typeof entry?.place !== 'string') errors.push(`criteria[${i}].place: нужна строка`);
    });
  }
  if (!Number.isInteger(value.liveliness) || value.liveliness < 0 || value.liveliness > 10) errors.push('liveliness: нужно целое от 0 до 10');
  if (!Array.isArray(value.inventions)) errors.push('inventions: нужен массив');
  else value.inventions.forEach((entry, i) => {
    if (typeof entry?.quote !== 'string' || !entry.quote.length) errors.push(`inventions[${i}].quote: нужна непустая строка`);
    if (!classes.includes(entry?.class)) errors.push(`inventions[${i}].class: неизвестный класс`);
    if (!items.includes(entry?.item) || (entry?.class === 'нужна характеристика' && entry?.item === 'нет')) errors.push(`inventions[${i}].item: неверный пункт`);
  });
  if (!Array.isArray(value.dislike)) errors.push('dislike: нужен массив');
  else {
    value.dislike.forEach((entry, i) => {
      for (const key of ['what', 'quote']) if (typeof entry?.[key] !== 'string' || !entry[key].length) errors.push(`dislike[${i}].${key}: нужна непустая строка`);
    });
  }
  errors.push(...stringArray(value.improve, 'improve'), ...stringArray(value.missing_facts, 'missing_facts'));
  return errors;
}
