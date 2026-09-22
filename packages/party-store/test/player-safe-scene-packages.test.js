import assert from 'node:assert/strict';
import test from 'node:test';
import {
  playerSafeComponent,
  projectPlayerSafeScenePackages
} from '../src/player-safe-scene-packages.js';

test('player-safe projection keeps concrete facts and strips non-facts', () => {
  const packages = [{
    scene_package_id: 'pkg:1',
    family: 'inland_fishing_worksite',
    g5_node_id: 'g5:1',
    g6_instance_id: 'g6:1',
    position_id: 'pos:1',
    profile: {
      readiness: {
        required_layers_satisfied: true,
        unresolved_current_gaps: [],
        functional_layers: [
          { layer: 'natural_layers', status: 'mapped', factual_basis: 'concrete' },
          { layer: 'tool', status: 'mapped' }
        ]
      },
      components: [
        {
          layer: 'natural_layers',
          required: true,
          typed_semantic_refs: ['riparian_clay_bank', 'generic_substrate'],
          source_value: {
            evidence_digest: 'secret',
            authoring_approval_scope: 'hidden',
            local_taxon_authorized: false
          }
        },
        {
          layer: 'work_zone',
          required: true,
          place_function_ref: {
            scene_template_id: 'tpl',
            g5_id: 'g5',
            scene_slot_key: 'shore',
            physical_class_id: 'open_ground',
            primary_scene_role_id: 'work',
            hidden_owner_note: 'internal'
          }
        },
        {
          layer: 'tool',
          required: true,
          semantics: 'finite_item_alternative_group',
          candidates: [{
            item_template_ref: 'item_tpl_nov_fish_trap_v1',
            inventory_profile_ref: 'inventory_item_tpl_nov_fish_trap_v1',
            object_category_ref: 'cat_item_object_fish_trap_v1',
            min_quantity: 1,
            max_quantity: 1,
            source_binding_refs: ['claim_secret'],
            source_refs: ['src_secret'],
            source_weight: 55
          }]
        },
        {
          layer: 'storage',
          required: false,
          candidates: [{
            item_template_ref: 'item_tpl_nov_basket_v1',
            min_quantity: 1,
            max_quantity: 2
          }]
        }
      ]
    },
    allocation_policy: {
      status: 'materialized_stage16',
      allocations: [{
        layer: 'tool',
        disposition: 'create',
        item_instance_id: 'item:trap',
        item_template_ref: 'item_tpl_nov_fish_trap_v1',
        inventory_profile_ref: 'inventory_item_tpl_nov_fish_trap_v1',
        object_category_ref: 'cat_item_object_fish_trap_v1',
        quantity: 1
      }]
    }
  }];
  const items = [{
    instance_id: 'item:trap',
    template_id: 'item_tpl_nov_fish_trap_v1',
    inventory_profile_ref: 'inventory_item_tpl_nov_fish_trap_v1',
    object_category_ref: 'cat_item_object_fish_trap_v1',
    quantity: 1
  }];
  const projected = projectPlayerSafeScenePackages(packages, items);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].allocation_status, 'resolved');
  assert.equal(projected[0].readiness.required_layers_satisfied, true);
  assert.equal(projected[0].environment_facets.length, 2);
  const natural = projected[0].environment_facets.find(({ layer }) =>
    layer === 'natural_layers');
  assert.deepEqual(natural.typed_semantic_refs, ['riparian_clay_bank']);
  assert.equal(natural.evidence_digest, undefined);
  assert.equal(natural.authoring_approval_scope, undefined);
  assert.equal(natural.factual_status, undefined);
  const zone = projected[0].environment_facets.find(({ layer }) =>
    layer === 'work_zone');
  assert.deepEqual(zone.place_function, {
    scene_template_id: 'tpl',
    g5_id: 'g5',
    scene_slot_key: 'shore',
    physical_class_id: 'open_ground',
    primary_scene_role_id: 'work'
  });
  assert.equal(zone.place_function.hidden_owner_note, undefined);
  assert.equal(projected[0].functional_groups.length, 2);
  const tool = projected[0].functional_groups.find(({ layer }) => layer === 'tool');
  assert.equal(tool.semantics, 'finite_item_alternative_group');
  assert.deepEqual(tool.visible_materials, [{
    item_instance_id: 'item:trap',
    item_template_ref: 'item_tpl_nov_fish_trap_v1',
    quantity: 1,
    inventory_profile_ref: 'inventory_item_tpl_nov_fish_trap_v1',
    object_category_ref: 'cat_item_object_fish_trap_v1'
  }]);
  assert.equal(tool.visible_materials[0].source_binding_refs, undefined);
  const storage = projected[0].functional_groups.find(({ layer }) =>
    layer === 'storage');
  assert.equal(storage.visible_materials, undefined);
  assert.equal(storage.factual_status, 'PROCEDURAL_VISIBLE_MATERIALS_DATA_GAP');
});

test('abstract natural refs become typed factual data gap, not false facts', () => {
  const projected = projectPlayerSafeScenePackages([{
    scene_package_id: 'pkg',
    family: 'natural_shore',
    g5_node_id: 'g5',
    g6_instance_id: 'g6',
    position_id: 'pos',
    profile: {
      readiness: {
        required_layers_satisfied: false,
        unresolved_current_gaps: ['NATURAL_BASELINE_FACTUAL_DATA_GAP'],
        functional_layers: [{
          layer: 'natural_layers',
          status: 'unresolved',
          factual_basis: 'abstract_generic_only',
          source_gap_code: 'NATURAL_BASELINE_FACTUAL_DATA_GAP'
        }]
      },
      components: [{
        layer: 'natural_layers',
        required: true,
        typed_semantic_refs: ['generic_substrate', 'water_adjacency']
      }]
    },
    allocation_policy: { status: 'pending_runtime_allocation_approval' }
  }]);
  assert.equal(projected[0].readiness.required_layers_satisfied, false);
  assert.deepEqual(projected[0].readiness.unresolved_current_gaps,
    ['NATURAL_BASELINE_FACTUAL_DATA_GAP']);
  const natural = projected[0].environment_facets[0];
  assert.equal(natural.factual_status, 'NATURAL_BASELINE_FACTUAL_DATA_GAP');
  assert.equal(natural.typed_semantic_refs, undefined);
});

test('profile candidates never become visible_materials without persisted items', () => {
  const component = playerSafeComponent({
    layer: 'tool',
    required: true,
    source_value: {
      semantics: 'finite_item_alternative_group',
      candidates: [{
        item_template_ref: 'item_tpl_unseen_oar_v1',
        inventory_profile_ref: 'inventory_unseen_oar',
        min_quantity: 1,
        max_quantity: 1,
        evidence_digest: 'hidden'
      }]
    }
  });
  assert.equal(component.visible_materials, undefined);
  assert.equal(component.factual_status, 'PROCEDURAL_VISIBLE_MATERIALS_DATA_GAP');
  assert.equal(component.semantics, 'finite_item_alternative_group');
  assert.equal(component.evidence_digest, undefined);
});

test('pending allocation stays unresolved and omits candidate materials', () => {
  const projected = projectPlayerSafeScenePackages([{
    scene_package_id: 'pkg',
    family: 'natural_shore',
    g5_node_id: 'g5',
    g6_instance_id: 'g6',
    position_id: 'pos',
    profile: {
      components: [{
        layer: 'tool',
        required: true,
        candidates: [{ item_template_ref: 'item_tpl_net_v1', min_quantity: 1 }]
      }]
    },
    allocation_policy: { status: 'pending_runtime_allocation_approval' }
  }]);
  assert.equal(projected[0].allocation_status, 'pending_runtime_allocation_approval');
  assert.equal(projected[0].functional_groups[0].visible_materials, undefined);
  assert.equal(projected[0].functional_groups[0].factual_status,
    'PROCEDURAL_VISIBLE_MATERIALS_DATA_GAP');
});
