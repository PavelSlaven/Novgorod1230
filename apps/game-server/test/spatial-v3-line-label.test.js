import test from 'node:test';
import assert from 'node:assert/strict';
import { spatialV3LineLabel } from '../src/runtime/spatial-v3-line-label.js';

test('canonical line label uses one shared format and rejects empty fields', () => {
  assert.equal(spatialV3LineLabel(' тропой вдоль ручья ', null), 'тропой вдоль ручья');
  assert.equal(spatialV3LineLabel('тропой вдоль ручья', ' у старого дуба '),
    'тропой вдоль ручья · у старого дуба');
  assert.equal(spatialV3LineLabel(' ', null), null);
  assert.equal(spatialV3LineLabel('тропой', ' '), null);
});
