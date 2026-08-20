export function createPostgresOrdinaryContainerContentsLoader({ pool } = {}) {
  if (typeof pool?.query !== 'function') {
    throw new TypeError('O2b committed loader requires a PostgreSQL pool.');
  }
  return async function load({ party_id: partyId, container_ref: containerRef }) {
    if (!text(partyId) || !text(containerRef)) return null;
    const core = await pool.query(`SELECT p.state_version AS party_state_version,
        pc.character_id AS actor_id,pos.g5_anchor_id AS actor_position_ref,
        x.container_id,x.template_id,x.state_version AS container_state_version,
        x.closure_state,x.state AS container_state,x.anchor_id,
        x.parent_container_id,x.holder_npc_id,x.holder_character_id,
        x.physical_position,x.equipment_slot_category_id,
        o.ownership_id,o.owner_npc_id,o.owner_character_id,o.owner_party,
        o.controller_npc_id,o.controller_character_id,o.claim_state,
        a.state_version AS ordinary_state_version,a.aggregate_payload,
        c.catalog_version,c.property_version,c.placement_version,
        c.supporting_basis_catalog_version,c.supporting_basis_catalog_digest,
        c.property_placement_context_digest,c.property_placement_base_snapshot,
        e.objective_snapshot,e.objective_digest,e.enabled
      FROM party_runtime.parties p
      JOIN party_runtime.party_containers x ON x.party_id=p.party_id
      LEFT JOIN party_runtime.party_ownership o
        ON o.party_id=x.party_id AND o.container_id=x.container_id
      LEFT JOIN party_runtime.party_player_characters pc
        ON pc.party_id=p.party_id
        AND pc.character_id=o.owner_character_id
      LEFT JOIN party_runtime.party_positions pos ON pos.party_id=p.party_id
      JOIN party_runtime.party_ordinary_materialization_aggregates a
        ON a.party_id=p.party_id AND a.scope_kind='container'
        AND a.scope_id=x.container_id
      JOIN party_runtime.party_ordinary_materialization_contexts c
        ON c.party_id=a.party_id AND c.scope_kind=a.scope_kind
        AND c.scope_id=a.scope_id
      JOIN party_runtime.party_ordinary_materialization_enablements e
        ON e.party_id=a.party_id AND e.scope_kind=a.scope_kind
        AND e.scope_id=a.scope_id
      WHERE p.party_id=$1 AND x.container_id=$2`, [partyId, containerRef]);
    if (core.rowCount !== 1) return null;
    const [bases, capacity] = await Promise.all([
      pool.query(`SELECT basis_snapshot FROM
        party_runtime.party_ordinary_materialization_basis_catalog
        WHERE party_id=$1 AND scope_kind='container' AND scope_id=$2
        ORDER BY basis_ref`, [partyId, containerRef]),
      pool.query(`SELECT i.item_id,i.template_id,i.profile_id,i.category_id,
          i.quantity,i.condition_state,i.legal_status,i.state,
          q.anchor_id,q.container_id,q.holder_npc_id,q.holder_character_id,
          q.physical_position,q.equipment_slot_category_id,q.attached_item_id
        FROM party_runtime.party_item_placements q
        JOIN party_runtime.party_items i
          ON i.party_id=q.party_id AND i.item_id=q.item_id
        WHERE q.party_id=$1 AND q.container_id=$2
        ORDER BY i.item_id`, [partyId, containerRef])
    ]);
    const row = core.rows[0];
    const capacitySnapshot = capacity.rows.map(capacityRow);
    const context = row.container_state?.ordinary_contents_context;
    return clone({ party_state_version:Number(row.party_state_version),
      container:{ actor_id:row.actor_id,
        actor_position_ref:row.actor_position_ref,
        container_id:row.container_id,template_id:row.template_id,
        state_version:Number(row.container_state_version),
        closure_state:row.closure_state,state:row.container_state,
        ownership:{ownership_id:row.ownership_id,
          owner_npc_id:row.owner_npc_id,
          owner_character_id:row.owner_character_id,
          owner_party:row.owner_party,
          controller_npc_id:row.controller_npc_id,
          controller_character_id:row.controller_character_id,
          claim_state:row.claim_state},
        placement:{anchor_id:row.anchor_id,
          container_id:row.parent_container_id,
          holder_npc_id:row.holder_npc_id,
          holder_character_id:row.holder_character_id,
          physical_position:row.physical_position,
          equipment_slot_category_id:row.equipment_slot_category_id}},
      ordinary_state_version:Number(row.ordinary_state_version),
      ordinary_aggregate:row.aggregate_payload,
      catalog_version:Number(row.catalog_version),
      property_version:Number(row.property_version),
      placement_version:Number(row.placement_version),
      supporting_basis_catalog_version:
        Number(row.supporting_basis_catalog_version),
      supporting_basis_catalog_digest:row.supporting_basis_catalog_digest,
      property_placement_context_digest:
        row.property_placement_context_digest,
      property_placement_context:row.property_placement_base_snapshot,
      enablement:{ objective_snapshot:row.objective_snapshot,
        objective_digest:row.objective_digest,enabled:row.enabled },
      supporting_bases:bases.rows.map(({ basis_snapshot: basis }) => basis),
      capacity_snapshot:capacitySnapshot,
      inventory_input:{ party_id:partyId,
        items:capacitySnapshot.map((item) => ({ item_id:item.item_id,
          template_id:item.template_id,quantity:item.quantity,
          ...(item.state?.runtime_instance_mechanics_snapshot == null ? {} : {
            runtime_instance_mechanics_snapshot:
              structuredClone(
                item.state.runtime_instance_mechanics_snapshot) }) })),
        item_placements:capacitySnapshot.map((item) => ({ party_id:partyId,
          item_id:item.item_id,...item.placement })),item_profiles:[],
        containers:[{container_id:row.container_id,
          template_id:row.template_id}],
        container_placements:[{party_id:partyId,container_id:row.container_id,
          ...placement(row)}],
        container_profiles:context?.container_inventory_profile == null ? []
          : [structuredClone(context.container_inventory_profile)],
        container_compatibility:structuredClone(
          context?.container_compatibility ?? []),
        capacity_snapshot:structuredClone(capacitySnapshot) } });
  };
}

function capacityRow(row) { return { item_id:row.item_id,
  template_id:row.template_id,profile_id:row.profile_id,
  category_id:row.category_id,quantity:Number(row.quantity),
  condition_state:row.condition_state,legal_status:row.legal_status,
  state:row.state,placement:{anchor_id:row.anchor_id,
    container_id:row.container_id,holder_npc_id:row.holder_npc_id,
    holder_character_id:row.holder_character_id,
    physical_position:row.physical_position,
    equipment_slot_category_id:row.equipment_slot_category_id,
    attached_item_id:row.attached_item_id} }; }
function placement(row) { return {anchor_id:row.anchor_id,
  parent_container_id:row.parent_container_id,
  holder_npc_id:row.holder_npc_id,
  holder_character_id:row.holder_character_id,
  physical_position:row.physical_position,
  equipment_slot_category_id:row.equipment_slot_category_id}; }
function text(value) { return typeof value === 'string' && value.trim() === value
  && value.length > 0; }
function clone(value) { return structuredClone(value); }
