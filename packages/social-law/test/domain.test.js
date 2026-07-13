import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLegalConsequencePackage, buildSocialRisk, evaluateRights, validateSocialBinding } from '../src/index.js';

test('social-law evaluates only supplied rights and packages risk for approval', () => {
  const binding = { actor_id:'a', region_id:'r', social_role_id:'role', rights:['trade'], restrictions:['carry_sword'] };
  assert.equal(validateSocialBinding(binding).ok, true);
  assert.equal(evaluateRights(binding, { right_id:'trade' }).decision, 'allowed');
  assert.equal(evaluateRights(binding, { right_id:'carry_sword' }).decision, 'forbidden');
  const risk = buildSocialRisk({ actor_id:'a', witness_ids:['w'], violation_ids:['v'], base_severity:1 });
  assert.equal(risk.severity, 2);
  assert.equal(buildLegalConsequencePackage({ actor_id:'a', risk }).approval_required, true);
});
