import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyExistingContainerContents } from '../src/index.js';

const base = () => ({ container: { container_ref: 'chest', commit_state: 'committed',
  template_id: 'chest-template', mechanics_profile_ref: 'chest-mechanics' },
  access: { pass: true }, ordinary_policy: {
    schema: 'rus.items.existing_container_ordinary_policy.v2', version: 2,
    unresolved_ordinary_contents: true, technical_limits: { schema:
      'rus.items.existing_container_ordinary_limits.v1', version: 1,
      max_new_entities: 4 } },
  authoritative_contents: { status: 'authoritative_absent' } });

test('authoritative contents have absolute priority over ordinary unresolved contents', () => {
  const input = base(); input.authoritative_contents = { status: 'authoritative_present' };
  assert.equal(classifyExistingContainerContents(input).route, 'authoritative');
  input.ordinary_policy = null;
  assert.equal(classifyExistingContainerContents(input).route, 'authoritative');
});

test('ordinary contents require committed template mechanics and an explicit policy', () => {
  for (const change of [
    (value) => { value.container.template_id = ''; },
    (value) => { value.container.mechanics_profile_ref = ''; },
    (value) => { value.ordinary_policy.unresolved_ordinary_contents = false; }
  ]) { const input = base(); change(input); assert.equal(
    classifyExistingContainerContents(input).pass, false); }
});

test('desired item phrasing cannot enter the O2b eligibility boundary', () => {
  const input = base(); input.desired_item = 'меч';
  assert.equal(classifyExistingContainerContents(input).errors[0].code,
    'ITEM_CONTAINER_ORDINARY_INPUT_INVALID');
});

test('container reference and descriptor accessors fail closed without executing getters', () => {
  for (const change of [
    (value) => { value.container.container_ref = ''; },
    (value) => { value.container.container_ref = null; },
    (value) => { value.container[Symbol('hidden')] = true; }
  ]) { const input = base(); change(input); assert.equal(
    classifyExistingContainerContents(input).pass, false); }
  let reads = 0;
  const input = base(); Object.defineProperty(input.container, 'template_id', {
    enumerable: true, get() { reads += 1; return 'chest-template'; }
  });
  assert.equal(classifyExistingContainerContents(input).pass, false);
  assert.equal(reads, 0);
});
