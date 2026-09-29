import assert from 'node:assert/strict';
import test from 'node:test';
import { collectMovementLabels, renderMovementShortcuts } from
  '../src/features/routes/render.js';

test('movement shortcuts render every route option label as a click target', () => {
  const screen = {
    panels: {
      route: {
        visible: true,
        data: {
          movement: {
            options: [
              { label: 'Переправлюсь на тот берег.' },
              { label: 'Иду к руслу.' },
              { label: 'Переправлюсь на тот берег.' }
            ]
          }
        }
      }
    }
  };
  assert.deepEqual(collectMovementLabels(screen), [
    'Переправлюсь на тот берег.',
    'Иду к руслу.'
  ]);
  const html = renderMovementShortcuts(screen);
  assert.match(html, /data-movement-label="Переправлюсь на тот берег\."/u);
  assert.match(html, /data-movement-label="Иду к руслу\."/u);
});
