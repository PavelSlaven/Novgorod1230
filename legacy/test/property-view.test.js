import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPropertyView, describePropertyItem } from '../src/ui/property-view.js';

test('property view summarizes weight ownership and risk for public display', () => {
  const view = buildPropertyView([
    {
      id: 'item:1',
      label: 'ключ от амбара',
      type: 'tool',
      material: 'железо',
      condition: 'изношен',
      size: 'малый',
      weight: 0.2,
      ownerName: 'Степан',
      holderName: 'Игрок',
      access: 'restricted',
      legalStatus: 'ordinary',
      plausibility: 4,
      function: 'открывает амбар',
      value: 'низкая',
      risk: 'low',
      rights: ['носить']
    },
    {
      id: 'item:2',
      label: 'мешок зерна',
      type: 'goods',
      material: 'лен',
      condition: 'цел',
      size: 'большой',
      weight: 2.1,
      ownerName: 'Игрок',
      holderName: 'Игрок',
      legalStatus: 'ordinary',
      function: 'еда',
      value: 'средняя',
      risk: 'low'
    }
  ]);

  assert.match(view.summaryText, /Имущество: 2 предмета/);
  assert.match(view.summaryText, /Вес: 2.3 кг/);
  assert.match(view.summaryText, /открыть окно/);
  assert.equal(view.detailMetaText, 'Вес: 2.3 кг · Предметов: 2');
  assert.match(view.items[0].meta, /владелец Степан/);
  assert.match(view.items[0].meta, /держатель Игрок/);
  assert.match(view.items[0].meta, /риск низкий/);
  assert.match(view.items[0].summary, /держатель Игрок/);
  assert.match(view.items[0].summary, /доступ можно быстро достать/);
  assert.match(view.items[0].summary, /правдоподобие 4\/5/);
  assert.match(view.items[1].summary, /владелец Игрок/);
  assert.match(view.items[1].summary, /вес 2.1 кг/);
});

test('property view renders structured value facets instead of raw objects', () => {
  const line = describePropertyItem({
    label: 'мешок зерна',
    type: 'container',
    value: {
      practical: 4,
      exchange: 2,
      risk: 1
    },
    risk: 2
  });

  assert.match(line, /ценность практичность 4\/5, обмен 2\/5, риск 1\/5/);
});

test('describePropertyItem keeps the public ownership and access details', () => {
  const line = describePropertyItem({
    label: 'копьё',
    type: 'weapon',
    material: 'дерево',
    condition: 'хорошее',
    weight: 1.4,
    placement: 'carried',
    ownerName: 'Воин',
    holderName: 'Воин',
    access: 'immediate',
    legalStatus: 'ordinary',
    plausibility: 5,
    risk: 'medium'
  });

  assert.match(line, /копьё/);
  assert.match(line, /класс weapon/);
  assert.match(line, /материал дерево/);
  assert.match(line, /вес 1.4 кг/);
  assert.match(line, /владелец Воин/);
  assert.match(line, /правдоподобие 5\/5/);
  assert.match(line, /риск средний/);
});

test('property view humanizes deep and closed access states', () => {
  const deep = describePropertyItem({
    label: 'ключ в мешке',
    type: 'tool',
    placement: 'contained',
    access: 'contained'
  });
  const closed = describePropertyItem({
    label: 'грамота в ларце',
    type: 'document',
    placement: 'carried',
    access: 'closed_container'
  });

  assert.match(deep, /доступ нужно время на поиск/);
  assert.match(closed, /доступ нужно открыть контейнер/);
});

test('property view does not reveal hidden contents count for closed containers', () => {
  const line = describePropertyItem({
    label: 'закрытый ларец',
    type: 'container',
    access: 'closed_container',
    visibility: 'visible',
    contents: [{ label: 'перстень', visibility: 'hidden' }]
  });

  assert.doesNotMatch(line, /содержит/i);
});
