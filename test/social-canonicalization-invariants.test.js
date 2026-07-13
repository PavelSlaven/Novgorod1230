import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  isGenerationEligibleSocialRole,
  sameSocialEssence,
  socialRoleGenerationGateSql
} from '../src/world/social-generation-gate.js';

test('sameSocialEssence compares social_position_archetype_id only', () => {
  const nov = {
    id: 'nov_role_guest_merchant',
    title: 'гость',
    historical_term: 'гость',
    social_position_archetype_id: 'privileged_long_distance_merchant'
  };
  const pskov = {
    id: 'pskov_role_guest_merchant',
    title: 'гость',
    historical_term: 'гость-купец',
    social_position_archetype_id: 'privileged_long_distance_merchant'
  };
  const visitor = {
    id: 'pskov_role_casual_visitor',
    title: 'гость',
    historical_term: 'гость',
    social_position_archetype_id: 'foreign_privileged_merchant_outsider'
  };

  assert.equal(sameSocialEssence(nov, pskov), true);
  assert.equal(sameSocialEssence(nov, visitor), false);
  assert.equal(sameSocialEssence(nov, { title: 'гость' }), false);
});

test('cross-region roles with same position archetype share generation eligibility bucket', () => {
  const nov = {
    status: 'approved',
    social_position_archetype_id: 'privileged_long_distance_merchant',
    social_class_id: 'free_commoner',
    role_archetype_id: 'merchant_trader',
    mapping_review_status: 'approved'
  };
  const pskov = {
    ...nov,
    id: 'pskov_role_guest_merchant'
  };
  assert.equal(isGenerationEligibleSocialRole(nov), true);
  assert.equal(isGenerationEligibleSocialRole(pskov), true);
  assert.equal(sameSocialEssence(nov, pskov), true);
});

test('same local title with different position archetype is not equivalent', () => {
  const merchantGuest = {
    title: 'гость',
    social_position_archetype_id: 'privileged_long_distance_merchant'
  };
  const foreignGuest = {
    title: 'гость',
    social_position_archetype_id: 'foreign_privileged_merchant_outsider'
  };
  assert.equal(sameSocialEssence(merchantGuest, foreignGuest), false);
});
