import assert from 'node:assert/strict';
import test from 'node:test';
import { createActionProducedOutputAuthority,
  deriveActionProducedOutputProperty,
  validateActionProducedOutputAuthority } from
  '@rus/items-property/action-produced-output-authority';
import { validateActionProducedOutputPropertyBasis } from
  '../src/action-produced-transition-entities.js';

test('new output authority and property are exact code-owned pins', () => {
  const authority = createActionProducedOutputAuthority('independent_output');
  assert.equal(validateActionProducedOutputAuthority(authority,
    'independent_output'), true);
  assert.equal(Object.isFrozen(authority), true);

  const sourceOwnership = ownership();
  const output = deriveActionProducedOutputProperty(sourceOwnership,
    'result:unseen-token');
  assert.equal(output.property_state, null);
  assert.equal(output.ownership.ownership_id,
    'ownership:result:unseen-token');
  assert.equal(Object.isFrozen(output.ownership), true);
});

test('authority and ownership boundaries reject drift without getter reads',
  () => {
    const authority = structuredClone(
      createActionProducedOutputAuthority('independent_output'));
    authority.currency_status = 'currency';
    assert.equal(validateActionProducedOutputAuthority(authority,
      'independent_output'), false);
    assert.equal(validateActionProducedOutputAuthority({ ...authority,
      currency_status: 'not_currency', damage: 900 },
    'independent_output'), false);

    let reads = 0;
    const hostileAuthority = {};
    Object.defineProperty(hostileAuthority, 'schema', { enumerable: true,
      get() { reads += 1; return 'forged'; } });
    assert.equal(validateActionProducedOutputAuthority(hostileAuthority,
      'independent_output'), false);
    const hostileOwnership = ownership();
    Object.defineProperty(hostileOwnership, 'claim_state', { enumerable: true,
      get() { reads += 1; return 'owned'; } });
    assert.throws(() => deriveActionProducedOutputProperty(hostileOwnership,
      'result:x'), { code: 'ITEM_ACTION_PRODUCED_OUTPUT_AUTHORITY_INVALID' });
    assert.equal(reads, 0);
  });

test('output property source must contribute while ownership may differ',
  () => {
    const ownerA = { ownership_snapshot: ownership('ownership:a') };
    const ownerB = { ownership_snapshot: {
      ...ownership('ownership:b'), owner_character_id: 'actor:other'
    } };
    const sources = new Map([
      ['source:a', { source: ownerA }],
      ['source:b', { source: ownerB }]
    ]);
    assert.throws(() => validateActionProducedOutputPropertyBasis('source:a',
      [{ source_ref: 'source:b' }], sources), TypeError);
    assert.doesNotThrow(() => validateActionProducedOutputPropertyBasis(
      'source:a', [{ source_ref: 'source:a' }, { source_ref: 'source:b' }],
      sources));

    sources.set('source:b', { source: {
      ownership_snapshot: ownership('ownership:b') } });
    assert.doesNotThrow(() => validateActionProducedOutputPropertyBasis(
      'source:a', [{ source_ref: 'source:a' }, { source_ref: 'source:b' }],
      sources));
  });

function ownership(ownershipId = 'ownership:source') {
  return { ownership_id: ownershipId, owner_npc_id: null,
    owner_character_id: 'actor:mikula', owner_party: false,
    controller_npc_id: null, controller_character_id: 'actor:mikula',
    claim_state: 'owned' };
}
