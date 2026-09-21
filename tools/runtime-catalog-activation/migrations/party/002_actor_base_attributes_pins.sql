ALTER TABLE party_runtime.party_catalog_pins
  DROP CONSTRAINT party_catalog_pins_catalog_scope_check,
  ADD CONSTRAINT party_catalog_pins_catalog_scope_check
    CHECK (catalog_scope IN (
      'item_container_materialization_v2',
      'actor_base_attributes_v1'
    ));

ALTER TABLE party_runtime.party_materialization_run_catalog_pins
  DROP CONSTRAINT party_materialization_run_catalog_pins_catalog_scope_check,
  ADD CONSTRAINT party_materialization_run_catalog_pins_catalog_scope_check
    CHECK (catalog_scope IN (
      'item_container_materialization_v2',
      'actor_base_attributes_v1'
    ));
