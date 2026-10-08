import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccess } from '../src/resolution.js';

const domainInternal = {
  class: 'domain_internal_only',
  required_facets: []
};
const roleBound = {
  class: 'role_bound',
  required_facets: ['role_ref'],
  required_values: { role_ref: 'nov_role_fisher' }
};

test('D15: npc_decision is not actor-facing and sees domain_internal_only', () => {
  assert.equal(canAccess(domainInternal, {}, 'npc_decision'), true);
  assert.equal(canAccess(domainInternal, {}, 'semantic_resolution'), true);
  assert.equal(canAccess(domainInternal, {}, 'conversation'), false);
  assert.equal(canAccess(domainInternal, {}, 'narration'), false);
});

test('D15/D20: conversation and narration still require role facets for role_bound', () => {
  assert.equal(canAccess(roleBound, {}, 'conversation'), false);
  assert.equal(canAccess(roleBound, { role_ref: 'nov_role_fisher' }, 'conversation'), true);
  assert.equal(canAccess(roleBound, { role_ref: 'nov_role_fisher' }, 'narration'), true);
  // npc_decision bypasses actor-facing facet gate entirely
  assert.equal(canAccess(roleBound, {}, 'npc_decision'), true);
});
