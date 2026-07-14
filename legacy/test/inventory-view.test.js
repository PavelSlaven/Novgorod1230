import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInventoryView, formatInventoryItemLine } from '../src/ui/inventory-view.js';

test('inventory view humanizes access risk and legal status in item lines', () => {
  const line = formatInventoryItemLine({
    label: 'мешок зерна',
    type: 'goods',
    material: 'лен',
    condition: 'цел',
    size: 'большой',
    weight: 2.1,
    placement: 'carried',
    containerLabel: 'корзина',
    access: 'immediate',
    visibility: 'visible',
    discoverability: 'obvious',
    legalStatus: 'ordinary',
    function: 'еда',
    value: 'средняя',
    risk: 'low',
    rights: ['хранить'],
    contents: [{ label: 'семена' }],
    ownerName: 'Игрок',
    holderName: 'Игрок'
  });

  assert.match(line, /доступ можно использовать сразу/);
  assert.match(line, /видимость видимый/);
  assert.match(line, /правовой статус обычный/);
  assert.match(line, /риск низкий/);
});

test('inventory view preserves humanized summary metadata', () => {
  const view = buildInventoryView({
    items: {
      carried_items: [
        {
          label: 'нож',
          type: 'weapon',
          placement: 'carried',
          holderName: 'Игрок',
          ownerName: 'Игрок',
          access: 'immediate',
          legalStatus: 'ordinary',
          risk: 'low',
          weight: 0.4
        }
      ],
      equipment: [],
      weapons: [
        {
          label: 'нож',
          type: 'weapon',
          placement: 'carried',
          holderName: 'Игрок',
          ownerName: 'Игрок',
          access: 'immediate',
          legalStatus: 'ordinary',
          risk: 'low',
          weight: 0.4
        }
      ],
      armor: [],
      total_weight: 0.4,
      load_category: 'light',
      property_not_carried: []
    },
    body: {
      clothing: 'рубаха'
    }
  });

  assert.equal(view.detailMetaText, 'Вес: 0.4 кг · Нагрузка: лёгкий');
  assert.match(view.sections[0].lines[0], /доступ можно использовать сразу/);
  assert.match(view.sections[0].lines[0], /правовой статус обычный/);
  assert.match(view.sections[0].lines[0], /риск низкий/);
});

test('inventory view distinguishes quick access from deep container access', () => {
  const quick = formatInventoryItemLine({
    label: 'нож за поясом',
    type: 'weapon',
    placement: 'equipped',
    access: 'quick'
  });
  const deep = formatInventoryItemLine({
    label: 'ключ в мешке',
    type: 'tool',
    placement: 'contained',
    access: 'contained'
  });

  assert.match(quick, /доступ можно быстро достать/);
  assert.match(deep, /доступ нужно время на поиск/);
});

test('inventory view shows load ratio and document-style overload label', () => {
  const view = buildInventoryView({
    items: {
      carried_items: [],
      equipment: [],
      weapons: [],
      armor: [],
      total_weight: 24,
      load_ratio: 2.4,
      load_category: 'overloaded',
      property_not_carried: []
    }
  });

  assert.equal(view.summaryText.includes('сверх предела'), true);
  assert.match(view.detailMetaText, /Коэф\.: 2.4/);
});

test('inventory view ignores legacy arrays when canonical item blocks are missing', () => {
  const view = buildInventoryView({
    inventory: ['legacy knife'],
    property: ['legacy chest'],
    body: {
      clothing: 'рубаха'
    }
  });

  assert.deepEqual(view.sections.find((section) => section.key === 'carried')?.lines, []);
  assert.equal(view.sections.some((section) => section.key === 'property'), false);
  assert.equal(view.sections.find((section) => section.key === 'hands')?.lines.length, 0);
  assert.equal(view.sections.find((section) => section.key === 'body')?.lines.length, 1);
});

test('inventory view does not reveal hidden contents count for closed containers', () => {
  const line = formatInventoryItemLine({
    label: 'закрытый ларец',
    type: 'container',
    access: 'closed_container',
    visibility: 'visible',
    contents: [{ label: 'перстень', visibility: 'hidden' }]
  });

  assert.doesNotMatch(line, /содержит/i);
});
