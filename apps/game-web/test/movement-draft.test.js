import assert from 'node:assert/strict';
import test from 'node:test';
import { fillDraftFromMovementButton } from '../src/app/movement-draft.js';

function setup({ disabled = false, label = 'Иду к воде.' } = {}) {
  const draft = [];
  const textarea = { value: '', focused: false, focus() { this.focused = true; } };
  const button = { disabled, dataset: { movementLabel: label } };
  return { draft, textarea, button,
    run: (isBlocked = () => false, target = { closest: (selector) =>
      selector === '[data-movement-label]' ? button : null }) => fillDraftFromMovementButton({
      target, isBlocked,
      store: { getState: () => ({}), setDraft: (...args) => draft.push(args) },
      root: { querySelector: (selector) => selector === '#turn-intent' ? textarea : null } }) };
}

test('a movement button puts its exact label into the draft and the input, and focuses it', () => {
  const s = setup();
  assert.equal(s.run(), true);
  assert.deepEqual(s.draft, [['turn', 'Иду к воде.']]);
  assert.equal(s.textarea.value, 'Иду к воде.');
  assert.equal(s.textarea.focused, true);
});

test('a disabled button, a blocked flow or another target changes nothing', () => {
  const disabled = setup({ disabled: true });
  assert.equal(disabled.run(), false);
  const blocked = setup();
  assert.equal(blocked.run(() => true), false);
  const other = setup();
  assert.equal(other.run(() => false, { closest: () => null }), false);
  for (const s of [disabled, blocked, other]) {
    assert.deepEqual(s.draft, []);
    assert.equal(s.textarea.value, '');
    assert.equal(s.textarea.focused, false);
  }
});
