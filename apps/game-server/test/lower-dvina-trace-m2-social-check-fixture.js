const OUTCOMES = Object.freeze({
  clean_success: {
    delivery_quality: 'compelling', observable_effects: []
  },
  success: {
    delivery_quality: 'credible', observable_effects: []
  },
  success_with_cost: {
    delivery_quality: 'credible_with_visible_cost', observable_effects: []
  },
  failure_with_consequence: {
    delivery_quality: 'unconvincing', observable_effects: []
  },
  severe_failure: {
    delivery_quality: 'transparently_manipulative', observable_effects: []
  }
});

export function requireRatshaSocialCheck(plan, request, responseKind) {
  const [attributeRef] = request.decision_scope.allowed_attribute_refs;
  const [skillRef] = request.decision_scope.allowed_skill_refs;
  plan.resolution = 'check_required';
  plan.check = {
    purpose: responseKind === 'lie'
      ? 'make the falsehood credible' : 'bargain for a concession',
    attribute_ref: attributeRef,
    skill_ref: skillRef,
    difficulty_band: request.decision_scope.allowed_check_profile_refs[0],
    outcomes: structuredClone(OUTCOMES)
  };
  return plan;
}
