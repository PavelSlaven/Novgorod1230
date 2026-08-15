export function buildLowerDvinaTracePlayerDossier({
  input,
  playerId,
  name,
  profile,
  policy,
  body,
  knifeTemplate,
  knifeInventoryProfile,
  wreck,
  projection,
  sourceDigest,
  actorIdentity = null
}) {
  const item = projection.inventory_item_projections[
    knifeTemplate.item_template_id
  ];
  return {
    schema: 'player_character_dossier',
    version: 1,
    request_id: input.idempotency_key,
    generation_status: 'generated',
    identity: actorIdentity ?? {
      character_id: playerId,
      name: name.display_name,
      name_candidate_id: name.id
    },
    social_status: {
      social_role_id: profile.role.id,
      occupation_id: profile.occupation_id,
      display_name: profile.role.display_name
    },
    origin: {
      current_region_id: wreck.location.region_ref,
      year: projection.historical_year,
      biography_basis: profile.approval.basis
    },
    body: {
      health: body.values.health,
      satiety: body.values.satiety,
      vigor: body.values.energy,
      active_states: body.conditions.map((state) => ({
        state,
        cause: body.profile_id
      }))
    },
    attributes: structuredClone(profile.attributes),
    skills: structuredClone(profile.skills),
    knowledge: structuredClone(projection.knowledge),
    goals: structuredClone(projection.goals),
    inventory: {
      items: [{
        item_profile_candidate_id: knifeTemplate.item_template_id,
        owner: knifeTemplate.weapon_contract.owner_ref,
        holder: knifeTemplate.weapon_contract.holder_ref,
        access: knifeTemplate.weapon_contract.accessibility,
        carry_location: item.physical_position,
        weight: {
          grams: knifeInventoryProfile.mass_grams,
          source_profile_id: knifeInventoryProfile.id
        },
        condition: item.condition_state,
        risk: structuredClone(item.risk),
        use: item.use
      }],
      total_weight: { grams: knifeInventoryProfile.mass_grams },
      load_category: knifeInventoryProfile.carry_form,
      occupied_hands: knifeInventoryProfile.external_hand_cost
    },
    property_and_access: structuredClone(projection.property_and_access),
    relations: structuredClone(projection.relations),
    start_place_connection: structuredClone(projection.start_place_connection),
    selected_candidate_refs: {
      social_role_id: profile.role.id,
      occupation_id: profile.occupation_id,
      name_candidate_id: name.id,
      trace_definition_ref: {
        id: 'lower_dvina_trace_v1',
        revision: 1,
        digest:
          input.scenario_bundle.artifact_pins.player_profile_definition.digest
      },
      trace_player_profile_ref: structuredClone(policy.profile_ref)
    },
    source_trace: [{ source_id: profile.profile_id, digest: sourceDigest }],
    audit_self_check: structuredClone(projection.audit_self_check)
  };
}
