import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findOverlappingPresenceRules,
  seasonsOverlap,
  validatePrimarySecondaryPresenceSubjects
} from '../src/presence-rule-conflicts.js';

test('seasonsOverlap treats intersecting and all as overlap', () => {
  assert.equal(seasonsOverlap(['summer'], ['winter']), false);
  assert.equal(seasonsOverlap(['summer', 'autumn'], ['autumn']), true);
  assert.equal(seasonsOverlap(['all'], ['winter']), true);
});

test('findOverlappingPresenceRules rejects overlapping seasons not only identical lists', () => {
  const failures = findOverlappingPresenceRules([
    {
      rule_id: 'a', scope_kind: 'place_family', scope_ref: 'pf_yard',
      region_id: null, subject_kind: 'category', subject_ref: 'cat_x',
      allowed_seasons: ['summer', 'autumn']
    },
    {
      rule_id: 'b', scope_kind: 'place_family', scope_ref: 'pf_yard',
      region_id: null, subject_kind: 'category', subject_ref: 'cat_x',
      allowed_seasons: ['autumn', 'winter']
    }
  ]);
  assert.equal(failures.length, 1);
});

test('findOverlappingPresenceRules rejects equal season sets (N1/F4)', () => {
  const failures = findOverlappingPresenceRules([
    {
      rule_id: 'a', scope_kind: 'place_family', scope_ref: 'pf_yard',
      region_id: 'r1', subject_kind: 'occupation', subject_ref: 'occ_x',
      allowed_seasons: ['summer', 'winter']
    },
    {
      rule_id: 'b', scope_kind: 'place_family', scope_ref: 'pf_yard',
      region_id: 'r1', subject_kind: 'occupation', subject_ref: 'occ_x',
      allowed_seasons: ['winter', 'summer']
    }
  ]);
  assert.equal(failures.length, 1);
});

test('validatePrimarySecondaryPresenceSubjects keeps secondary additive-only', () => {
  const failures = validatePrimarySecondaryPresenceSubjects(
    [{ subject_kind: 'category', subject_ref: 'cat_a', region_id: null }],
    [
      { subject_kind: 'category', subject_ref: 'cat_a', region_id: null },
      { subject_kind: 'category', subject_ref: 'cat_b', region_id: null }
    ]
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /cat_a/);
});
