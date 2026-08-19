import assert from "node:assert/strict";
import test from "node:test";
import { canonicalDigest, createOrdinaryAggregate } from "@rus/materialization";
import { ordinaryWorldPropertyPlacementContextDigest } from "@rus/items-property";
import { createLowerDvinaTraceOrdinaryDiscoveryResolver } from "../src/runtime/lower-dvina-trace-ordinary-discovery.js";
import { applyOrdinaryMaterializationProjection } from "../src/infrastructure/postgres/lower-dvina-trace-ordinary-p16.js";
import { createOrdinaryMaterializationAtomicWritePlan } from "../src/infrastructure/postgres/ordinary-materialization-phase-6-commit.js";

const scope_ref = { entity_kind: "g6", entity_id: "ruin" },
  source_ref = "remnant:tool",
  permissions = ["remnant:profile", "remnant:source"];
function finite() {
  return {
    source_resource_node_id: source_ref,
    state_version: 6,
    lifecycle_state: "active",
    quantity: { numerator: 2, denominator: 1, unit: "item" },
    quantity_unit_ref: { kind: "unit", id: "item" },
    position_ref: "ruin-floor",
    property_basis_ref: "property:remnant",
  };
}
function enabled({
  basis_kind = "remnant",
  admission_class = "specialized_or_valuable",
  condition_state = "damaged",
} = {}) {
  const armament = admission_class === "weapon_or_armament",
    semantic_type = armament ? "damaged_weapon_remnant" : "damaged_remnant_tool",
    functional_bucket = armament ? "arms" : "stock",
    source = finite(),
    property_placement_context = {
      schema: "rus.items.ordinary_world_property_placement_context.v2",
      version: 2,
      scope_ref: { ...scope_ref },
      item_kind: "man_made",
      property_catalog_version_ref: "property:v2",
      placement_catalog_version_ref: "placement:v2",
      explicit_item_source_refs: [source_ref],
      personal_possession_refs: [],
      communal_public_service_refs: [],
      container_property_refs: [],
      occupied_site_refs: [],
      unowned_cause_refs: [],
      placement_context_refs: ["ruin"],
      property_catalog: [
        {
          property_basis_ref: "property:remnant",
          state: "committed",
          scope_ref: { ...scope_ref },
          basis_class: "explicit_source_item",
          source_ref,
          unowned_cause_ref: null,
          unowned_cause_kind: null,
        },
      ],
      placement_catalog: [
        {
          position_ref: "ruin-floor",
          state: "committed",
          scope_ref: { ...scope_ref },
          position_kind: "scene_position",
          g6_ref: "ruin",
          containment_depth: 0,
          placement_context_ref: "ruin",
        },
      ],
    },
    basis = {
      basis_ref: source_ref,
      state: "committed",
      scope_ref: { ...scope_ref },
      prepared_seed_provenance: null,
      functional_buckets: [functional_bucket],
      allowed_admission_classes: [admission_class],
      permission_refs: [...permissions],
      basis_kind,
    };
  const objective_context = {
    request_id: "enablement",
    scope_ref: { ...scope_ref },
    context_refs: {
      period_ref: "period",
      region_ref: "region",
      function_refs: [],
      environment_refs: ["environment:ruin"],
      occupation_household_refs: [],
      economic_context_ref: "economy",
      occupancy_state_ref: "vacant",
      material_culture_refs: [],
      property_context_ref: "property:remnant",
    },
    policy_refs: {
      authority_policy_ref: "authority",
      density_policy_ref: "density",
      ordinary_presence_policy_ref: "presence",
      runtime_item_mechanics_policy_ref: "mechanics",
      allowed_admission_classes: [admission_class],
      context_bound_permission_refs: [...permissions],
      allowed_supporting_bases: [
        { basis_ref: source_ref, basis_state: "committed" },
      ],
    },
    ordinary_state: {
      seeded: false,
      density_band: null,
      remaining_identity_budget: 0,
      background_groups: [],
      presence_resolutions: [],
      closed_observation_scopes: [],
    },
    technical_limits: {
      max_new_entities: 1,
      max_new_background_groups: 1,
      max_resolution_records: 4,
    },
  };
  const profile = {
    schema: "rus.items.context_bound_ordinary_profile.v2",
    version: 2,
    profile_ref: permissions[0],
    state: "committed",
    scope_ref: { ...scope_ref },
    profile_kind: armament ? "armament" : "specialized_stock",
    semantic_type,
    functional_bucket,
    admission_class,
    permission_refs: [...permissions],
    source_basis_ref: source_ref,
    property_basis_ref: "property:remnant",
    runtime_item_mechanics_policy_ref: "mechanics",
    mechanics_capability_ref: armament ? "combat:mechanics" : "stock:mechanics",
    public_name: armament ? "обычный повреждённый наконечник" : "обычный обломок инструмента",
    condition_state,
    basis_kind,
  };
  const constrained_natural_resource_profile = {
    schema: "rus.items.constrained_natural_resource_profile.v1",
    version: 1,
    profile_ref: "finite:remnant",
    state: "committed",
    scope_ref: { ...scope_ref },
    environment_ref: "environment:ruin",
    semantic_type,
    functional_bucket,
    admission_class,
    regional_permission_ref: permissions[0],
    resource_permission_ref: permissions[1],
    source_basis_ref: source_ref,
    public_name: armament ? "обычный повреждённый наконечник" : "обычный обломок инструмента",
    finite_source: {
      source_resource_node_id: source_ref,
      quantity_unit_ref: structuredClone(source.quantity_unit_ref),
      position_ref: source.position_ref,
      property_basis_ref: source.property_basis_ref,
      initial_amount_bounds: {
        minimum: { numerator: 1, denominator: 1, unit: "item" },
        maximum: { numerator: 8, denominator: 1, unit: "item" },
      },
    },
  };
  const aggregate = createOrdinaryAggregate({
    scope_ref,
    resolution_record_cap: 4,
  });
  return {
    objective_context,
    objective_digest: canonicalDigest(objective_context),
    ordinary_aggregate: aggregate,
    property_placement_context,
    version_pins: {
      party_state_version: 0,
      ordinary_state_version: 0,
      catalog_version: 1,
      property_version: 1,
      placement_version: 1,
      supporting_basis_catalog_version: 1,
      supporting_basis_catalog_digest: canonicalDigest({
        domain: "ordinary_supporting_basis_catalog_v1",
        supporting_bases: [basis],
      }),
      property_placement_context_digest:
        ordinaryWorldPropertyPlacementContextDigest({
          ...property_placement_context,
          supporting_basis_ref: source_ref,
          causal_basis_refs: [source_ref],
          requested_position_ref: "ruin-floor",
        }),
    },
    execution_context: {
      supporting_bases: [basis],
      allowed_disclosure_policy_refs: [],
      density_policy: {
        version: "density",
        mappings: [{ scope_kind: "g6", function_ref: null,
          bands: { sparse: 0, ordinary: 1, dense: 1 } }],
      },
      candidate_context: {
        target_ref: "ruin",
        candidate_ref_namespace: "test-remnant",
        normalizer_version: "ordinary-normalizer-v1",
        semantic_type,
        candidate_hint: null,
        functional_bucket,
        admission_class,
        availability_class: "context_bound",
        coverage_kind: "visible_surface",
        coverage_ref: "ruin:remnant",
        policy_version: "presence",
      },
      stage_b_classification_eval: {},
      mechanics_policy: {
        policy_ref: "mechanics",
        max_mass_grams: 1000,
        allowed_external_hand_costs: [0, 1, 2],
        allowed_carry_forms: ["compact", "regular"],
        max_packing_slot_cost: 10,
        max_quantity: 10,
      },
      causal_ref: "cause:remnant",
      source_refs: [source_ref],
      context_bound_ordinary_profile: profile,
      constrained_natural_resource_profile,
      committed_finite_source: structuredClone(source),
    },
  };
}
function request() {
  return {
    request: { root_turn_id: "turn:remnant" },
    committed_state: { position: { g6_id: "ruin", g5_anchor_id: "anchor:ruin" } },
    operation: { target_refs: ["ruin"], query: "взять обломок" },
    working_projection: {},
  };
}
function model(r, { condition = false, facts = [],
  admission_class = "specialized_or_valuable", basis_kind = "remnant" } = {}) {
  if (r.mode === "seed_scope")
    return {
      schema: "ordinary_materialization_plan_v1",
      request_id: r.request_id,
      resolution: "seeded",
      density_band_proposal: "ordinary",
      background_groups: [],
      entities: [],
      presence_resolutions: [],
      reason_code: "seed",
    };
  return {
    schema: "ordinary_materialization_plan_v1",
    request_id: r.request_id,
    resolution: "materialize",
    density_band_proposal: null,
    background_groups: [],
    presence_resolutions: [],
    reason_code: "remnant",
    entities: [
      {
        semantic_descriptor: {
          semantic_type: admission_class === "weapon_or_armament"
            ? "damaged_weapon_remnant" : "damaged_remnant_tool",
          name: "повреждённый обломок",
          facts,
        },
        authority_class: "ordinary",
        admission_class,
        availability_class: "context_bound",
        functional_bucket: admission_class === "weapon_or_armament" ? "arms" : "stock",
        presence_expectation: "routine",
        supporting_basis_ref: source_ref,
        causal_basis: { basis_kind, basis_refs: [source_ref] },
        property_basis_ref: "property:remnant",
        placement_proposal: { scope_ref: "ruin", position_ref: "ruin-floor" },
        mechanics_proposal: {
          mass_grams: 250,
          external_hand_cost: 1,
          carry_form: "regular",
          packing_slot_cost: 1,
          quantity: { value: 1, unit: "item" },
          container: null,
        },
        ...(condition ? { condition_state: "damaged" } : {}),
      },
    ],
  };
}
function verifiedModel(run) {
  const port = async (...args) => run(...args);
  port.verifyStageBCutover = async () => true;
  return port;
}

test("damaged remnant binds server condition, finite decrement, v3 proposal and projection", async () => {
  let calls = 0;
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
      partyId: "party",
      inputDigest: "input",
      loadEnablement: async () => enabled(),
      ordinaryMaterializationModel: verifiedModel(async (r) => {
        calls += 1;
        return model(r);
      }),
    }),
    result = await resolver(request()),
    plan = result.ordinary_materialization_atomic_write_plan;
  assert.equal(calls, 2);
  assert.equal(plan.item.condition_state, "damaged");
  assert.equal(
    plan.item.item_proposal.schema,
    "ordinary_world_item_proposal_v3",
  );
  assert.equal(plan.item.item_proposal.condition_state, "damaged");
  assert.equal(plan.finite_resource_transition.expected_state_version, 6);
  assert.equal(plan.finite_resource_transition.next_state_version, 7);
  const next = {};
  applyOrdinaryMaterializationProjection({
    next,
    visibleContext: { visible_objects: [] },
    ordinaryPlan: plan,
  });
  assert.equal(next.items[0].state.condition_state, "damaged");
});
test("damaged armament remnant stays absent until a combat mechanics owner exists", async () => {
  let calls = 0;
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
    partyId: "party",
    inputDigest: "input",
    loadEnablement: async () => enabled({ admission_class: "weapon_or_armament" }),
    ordinaryMaterializationModel: verifiedModel(async (r) => {
      calls += 1;
      return model(r, { admission_class: "weapon_or_armament" });
    }),
  });
  const plan = (await resolver(request())).ordinary_materialization_atomic_write_plan;
  assert.equal(calls, 1);
  assert.equal(plan.resolution, "absent");
  assert.equal(plan.item, null);
  assert.equal(Object.hasOwn(plan, "finite_resource_transition"), false);
});
test("serviceable finite-source materialization requires the owner-native decrement", async () => {
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
    partyId: "party",
    inputDigest: "input",
    loadEnablement: async () => enabled({
      basis_kind: "finite_source",
      condition_state: "serviceable",
    }),
    ordinaryMaterializationModel: verifiedModel(async (r) => model(r, {
      basis_kind: "finite_source",
    })),
  });
  const plan = (await resolver(request())).ordinary_materialization_atomic_write_plan;
  assert.equal(plan.item.causal_basis_kind, "finite_source");
  assert.equal(plan.finite_resource_transition.source_resource_node_id, source_ref);
  const { schema, write_plan_digest, finite_resource_transition, ...withoutFinite } = plan;
  assert.throws(() => createOrdinaryMaterializationAtomicWritePlan(withoutFinite), {
    code: "ORDINARY_PHASE6_FINITE_SOURCE_INVALID",
  });
});
test("damaged remnant rejects wrong basis, model condition and hidden facts", async () => {
  for (const [options, modelOptions] of [
    [{ basis_kind: "finite_source" }, {}],
    [{}, { condition: true }],
    [{}, { facts: ["hidden fact"] }],
  ]) {
    let calls = 0;
    const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
      partyId: "party",
      inputDigest: "input",
      loadEnablement: async () => enabled(options),
      ordinaryMaterializationModel: verifiedModel(async (r) => {
        calls += 1;
        return model(r, modelOptions);
      }),
    });
    if (options.basis_kind || options.admission_class) {
      const out = await resolver(request());
      assert.equal(calls, 1);
      const plan = out.ordinary_materialization_atomic_write_plan;
      assert.equal(plan.resolution, "absent");
      assert.deepEqual(
        plan.transitions.map(({ kind }) => kind),
        ["seed", "resolve_presence"],
      );
      assert.equal(
        plan.next_aggregate.presence_resolutions.at(-1).resolution,
        "absent",
      );
    } else
      await assert.rejects(
        () => resolver(request()),
        (e) =>
          [
            "TURN_ORDINARY_PRESENCE_PLAN_INVALID",
            "TURN_ORDINARY_PRESENCE_ENTITY_INVALID",
            "TURN_ORDINARY_PRESENCE_PLAN_REJECTED",
          ].includes(e?.code),
      );
  }
});
