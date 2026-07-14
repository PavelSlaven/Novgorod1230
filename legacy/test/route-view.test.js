import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRouteStripText, buildRouteView, humanizeRouteAvailability, formatRouteTime } from '../src/ui/route-view.js';

test('route view renders only visible route archive entries', () => {
  const view = buildRouteView([
    {
      summary: 'Путь к реке открыт и известен персонажу.',
      route: {
        label: 'путь к реке',
        access: 'open',
        type: 'road',
        scale: 'regional',
        base_time: 75,
        risk: 'средний риск',
        from_id: 'market',
        to_id: 'river',
        known_to_player: true
      }
    },
    {
      route: {
        label: 'лесная тропа',
        access: 'blocked',
        type: 'path',
        scale: 'local',
        base_time: 15,
        risk: 'опасный путь',
        from_id: 'market',
        to_id: 'forest',
        known_to_player: false,
        known_to_character: false
      }
    }
  ], 'market');

  assert.equal(view.summaryText, 'Маршруты: 1 маршрут');
  assert.equal(view.items.length, 1);
  assert.match(view.items[0].title, /путь к реке/);
  assert.match(view.items[0].meta, /доступ открыт/);
  assert.match(view.items[0].lines.join(' · '), /известен персонажу/);
  assert.match(view.items[0].lines.join(' · '), /время 1\.3 ч/);
});

test('route view keeps unknown routes only when they have a visible public summary', () => {
  const view = buildRouteView([
    {
      summary: 'Тропа к лесу видна между деревьями.',
      route: {
        label: 'лесная тропа',
        access: 'blocked',
        type: 'path',
        scale: 'local',
        base_time: 15,
        risk: 'опасный путь',
        from_id: 'market',
        to_id: 'forest',
        known_to_player: false,
        known_to_character: false
      }
    }
  ], 'market');

  assert.equal(view.items.length, 1);
  assert.match(view.items[0].meta, /доступ закрыт/);
  assert.match(view.items[0].lines.join(' · '), /причина опасный путь/);
});

test('route view spells out blocked reasons separately from generic risk', () => {
  const view = buildRouteView([
    {
      route: {
        label: 'ворота к торгу',
        access: 'blocked',
        type: 'path',
        scale: 'local',
        base_time: 10,
        risk: 'торг закрыт на ночь',
        from_id: 'road',
        to_id: 'market',
        known_to_player: true
      }
    },
    {
      route: {
        label: 'брод к реке',
        access: 'slow',
        type: 'path',
        scale: 'local',
        base_time: 25,
        risk: 'вода высокая',
        from_id: 'yard',
        to_id: 'river',
        known_to_player: true
      }
    }
  ], 'road');

  assert.match(view.items[0].lines.join(' · '), /причина торг закрыт на ночь/);
  assert.match(view.items[1].lines.join(' · '), /помеха вода высокая/);
});

test('route view formats empty archives and time values', () => {
  assert.equal(buildRouteView([], 'market').summaryText, 'Маршрутов нет');
  assert.equal(humanizeRouteAvailability('slow'), 'замедлен');
  assert.equal(formatRouteTime(45), '45 мин');
  assert.equal(formatRouteTime(120), '2 ч');
});

test('route strip resolves the last route from the visible archive', () => {
  const text = buildRouteStripText({
    place: { name: 'Постоялый двор' },
    microPlace: { name: 'Навес у конюшни' },
    current_position: {
      last_route_id: 'route:known'
    },
    historical: {
      routeArchiveVisible: [
        {
          id: 'route:known',
          summary: 'Известный путь к переправе',
          route: {
            id: 'route:known',
            label: 'путь к переправе'
          }
        }
      ]
    }
  });

  assert.match(text, /Постоялый двор/);
  assert.match(text, /Навес у конюшни/);
  assert.match(text, /последний путь путь к переправе/);
});

test('route strip resolves the last route from public route context too', () => {
  const text = buildRouteStripText({
    place: { name: 'Постоялый двор' },
    microPlace: { name: 'Навес у конюшни' },
    routeContext: {
      lastRouteId: 'route:known'
    },
    historical: {
      routeArchiveVisible: [
        {
          id: 'route:known',
          summary: 'Известный путь к переправе',
          route: {
            id: 'route:known',
            label: 'путь к переправе'
          }
        }
      ]
    }
  });

  assert.match(text, /Постоялый двор/);
  assert.match(text, /Навес у конюшни/);
  assert.match(text, /последний путь путь к переправе/);
});
