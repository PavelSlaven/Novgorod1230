import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('temporal location facts never authorize a node from schedule home or composition context', () => {
  const source = readFileSync(new URL('../src/runtime/npc-routine-temporal.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:home_scope_ref|composition_ref)\b/,
    'Schedule scope and composition provenance cannot establish the current node location.');
});

test('first-entry location facts use the declared approved source PF', () => {
  const source = readFileSync(new URL(
    '../src/infrastructure/postgres/target-place-people-first-entry.js', import.meta.url), 'utf8');
  const start = source.indexOf('function firstEntryBinding(');
  assert.notEqual(start, -1);
  const next = source.indexOf('\nfunction ', start + 1);
  const binding = source.slice(start, next === -1 ? source.length : next);
  assert.doesNotMatch(binding, /\bhome_scope_ref\b/);
  assert.match(binding, /composition\??\.place_family_id/,
    'The location must be checked against the PF declared by the approved source.');
  assert.doesNotMatch(binding, /location_ref\s*:\s*[^,\n]*\bcomposition_ref\b/,
    'Composition identity is provenance, not a location.');
});
