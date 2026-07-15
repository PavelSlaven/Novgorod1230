<!-- GENERATED FILE. Run `npm run docs:generate`; do not edit manually. -->
# Schema reference

Release: `0.23.0-migration.24`

## Contract schema names

| Schema | Constant | Source |
|---|---|---|
| `approved_party_transaction_input` | `STAGE25_TRANSACTION_INPUT_SCHEMA` | `packages/new-game/src/stages/stage-25-party-commit/policy/constants.js` |
| `approved_pipeline_manifest` | `STAGE24_MANIFEST_SCHEMA` | `packages/contracts/src/stage24-boundary.js` |
| `character_knowledge_map` | `STAGE18_OUTPUT_SCHEMA` | `packages/contracts/src/time-knowledge-hidden-boundary.js` |
| `character_knowledge_map_audit` | `STAGE18_AUDIT_SCHEMA` | `packages/contracts/src/time-knowledge-hidden-boundary.js` |
| `character_knowledge_map_code_precheck` | `STAGE18_PRECHECK_SCHEMA` | `packages/contracts/src/time-knowledge-hidden-boundary.js` |
| `character_knowledge_map_input` | `STAGE18_INPUT_SCHEMA` | `packages/contracts/src/time-knowledge-hidden-boundary.js` |
| `character_knowledge_write_projection` | `STAGE18_WRITE_PLAN_SCHEMA` | `packages/contracts/src/time-knowledge-hidden-boundary.js` |
| `commit_gate_input` | `STAGE25_INPUT_SCHEMA` | `packages/new-game/src/stages/stage-25-party-commit/policy/constants.js` |
| `commit_gate_result` | `STAGE25_GATE_SCHEMA` | `packages/new-game/src/stages/stage-25-party-commit/policy/constants.js` |
| `first_game_screen` | `FIRST_GAME_SCREEN_SCHEMA` | `packages/presentation/src/read-models/contracts.js` |
| `first_game_screen` | `STAGE26_SCREEN_SCHEMA` | `packages/new-game/src/stages/stage-26-first-game-screen/policy/constants.js` |
| `first_game_screen_input` | `STAGE26_INPUT_SCHEMA` | `packages/new-game/src/stages/stage-26-first-game-screen/policy/constants.js` |
| `first_screen_action_label_audit` | `STAGE26_ACTION_AUDIT_SCHEMA` | `packages/new-game/src/stages/stage-26-first-game-screen/policy/constants.js` |
| `first_screen_code_precheck` | `STAGE26_PRECHECK_SCHEMA` | `packages/new-game/src/stages/stage-26-first-game-screen/policy/constants.js` |
| `first_screen_code_validation` | `STAGE26_CODE_VALIDATION_SCHEMA` | `packages/new-game/src/stages/stage-26-first-game-screen/policy/constants.js` |
| `first_screen_delivery_ack` | `FIRST_SCREEN_DELIVERY_ACK_SCHEMA` | `packages/contracts/src/schema-names.js` |
| `first_screen_delivery_ack_result` | `FIRST_SCREEN_DELIVERY_ACK_RESULT_SCHEMA` | `packages/contracts/src/schema-names.js` |
| `first_screen_delivery_policy` | `STAGE26_DELIVERY_POLICY_SCHEMA` | `packages/new-game/src/stages/stage-26-first-game-screen/policy/constants.js` |
| `first_screen_safety_audit` | `STAGE26_SAFETY_AUDIT_SCHEMA` | `packages/new-game/src/stages/stage-26-first-game-screen/policy/constants.js` |
| `first_turn_pipeline_input` | `STAGE27_FIRST_TURN_INPUT_SCHEMA` | `packages/contracts/src/schema-names.js` |
| `full_hidden_scene_state` | `STAGE19_OUTPUT_SCHEMA` | `packages/contracts/src/time-knowledge-hidden-boundary.js` |
| `full_hidden_state_audit` | `STAGE19_AUDIT_SCHEMA` | `packages/contracts/src/time-knowledge-hidden-boundary.js` |
| `full_hidden_state_code_precheck` | `STAGE19_PRECHECK_SCHEMA` | `packages/contracts/src/time-knowledge-hidden-boundary.js` |
| `g5_materialization_input` | `STAGE13_INPUT_SCHEMA` | `packages/contracts/src/g5-placement-boundary.js` |
| `g5_scene_audit` | `STAGE14_OUTPUT_SCHEMA` | `packages/contracts/src/g5-placement-boundary.js` |
| `g5_scene_audit_input` | `STAGE14_INPUT_SCHEMA` | `packages/contracts/src/g5-placement-boundary.js` |
| `g5_scene_code_precheck` | `STAGE13_CODE_PRECHECK_SCHEMA` | `packages/contracts/src/g5-placement-boundary.js` |
| `g5_scene_code_precheck` | `STAGE14_CODE_PRECHECK_SCHEMA` | `packages/contracts/src/g5-placement-boundary.js` |
| `g5_scene_graph_draft` | `STAGE13_OUTPUT_SCHEMA` | `packages/contracts/src/g5-placement-boundary.js` |
| `hidden_state_builder_input` | `STAGE19_INPUT_SCHEMA` | `packages/contracts/src/time-knowledge-hidden-boundary.js` |
| `initial_item_placement_audit` | `STAGE16_AUDIT_SCHEMA` | `packages/contracts/src/g5-placement-boundary.js` |
| `initial_item_placement_code_precheck` | `STAGE16_PRECHECK_SCHEMA` | `packages/contracts/src/g5-placement-boundary.js` |
| `initial_item_placement_draft` | `STAGE16_DRAFT_SCHEMA` | `packages/contracts/src/g5-placement-boundary.js` |
| `initial_npc_placement_audit` | `STAGE15_AUDIT_SCHEMA` | `packages/contracts/src/g5-placement-boundary.js` |
| `initial_npc_placement_code_precheck` | `STAGE15_PRECHECK_SCHEMA` | `packages/contracts/src/g5-placement-boundary.js` |
| `initial_npc_placement_draft` | `STAGE15_DRAFT_SCHEMA` | `packages/contracts/src/g5-placement-boundary.js` |
| `inventory_panel` | `INVENTORY_PANEL_SCHEMA` | `packages/presentation/src/read-models/contracts.js` |
| `item_placement_input` | `STAGE16_INPUT_SCHEMA` | `packages/contracts/src/g5-placement-boundary.js` |
| `item_profile_candidate_set` | `STAGE8_OUTPUT_SCHEMA` | `packages/new-game/src/stages/stage-8-item-profile-candidates/policy.js` |
| `item_profile_retriever_input` | `STAGE8_INPUT_SCHEMA` | `packages/new-game/src/stages/stage-8-item-profile-candidates/policy.js` |
| `narration_audit` | `NARRATION_AUDIT_SCHEMA` | `packages/narration/src/contracts.js` |
| `narration_flow_result` | `NARRATION_FLOW_RESULT_SCHEMA` | `packages/narration/src/contracts.js` |
| `narration_output` | `NARRATION_OUTPUT_SCHEMA` | `packages/narration/src/contracts.js` |
| `narration_repair_route` | `NARRATION_REPAIR_ROUTE_SCHEMA` | `packages/narration/src/contracts.js` |
| `narration_request` | `NARRATION_REQUEST_SCHEMA` | `packages/narration/src/contracts.js` |
| `narrator_prose_audit` | `STAGE23_AUDIT_SCHEMA` | `packages/contracts/src/narrator-boundary.js` |
| `narrator_prose_audit_approval` | `NARRATOR_PROSE_AUDIT_APPROVAL_SCHEMA` | `packages/contracts/src/schema-names.js` |
| `narrator_prose_audit_input` | `STAGE23_INPUT_SCHEMA` | `packages/contracts/src/narrator-boundary.js` |
| `narrator_prose_audit_route` | `STAGE23_ROUTE_SCHEMA` | `packages/contracts/src/narrator-boundary.js` |
| `narrator_prose_code_precheck` | `STAGE23_PRECHECK_SCHEMA` | `packages/contracts/src/narrator-boundary.js` |
| `narrator_start_code_precheck` | `STAGE22_PRECHECK_SCHEMA` | `packages/contracts/src/narrator-boundary.js` |
| `narrator_start_input` | `STAGE22_INPUT_SCHEMA` | `packages/contracts/src/narrator-boundary.js` |
| `narrator_starting_prose` | `STAGE22_OUTPUT_SCHEMA` | `packages/contracts/src/narrator-boundary.js` |
| `npc_placement_input` | `STAGE15_INPUT_SCHEMA` | `packages/contracts/src/g5-placement-boundary.js` |
| `party_commit_idempotency_result` | `STAGE25_IDEMPOTENCY_SCHEMA` | `packages/new-game/src/stages/stage-25-party-commit/policy/constants.js` |
| `party_database_schema_snapshot` | `PARTY_DB_SCHEMA_SNAPSHOT_SCHEMA` | `packages/contracts/src/stage24-boundary.js` |
| `party_db_write_plan` | `STAGE24_PLAN_SCHEMA` | `packages/contracts/src/stage24-boundary.js` |
| `party_db_write_plan_audit` | `STAGE24_AUDIT_SCHEMA` | `packages/contracts/src/stage24-boundary.js` |
| `party_db_write_plan_code_precheck` | `STAGE24_PRECHECK_SCHEMA` | `packages/contracts/src/stage24-boundary.js` |
| `party_db_write_plan_input` | `STAGE24_INPUT_SCHEMA` | `packages/contracts/src/stage24-boundary.js` |
| `party_db_write_plan_repair_route` | `STAGE24_ROUTE_SCHEMA` | `packages/contracts/src/stage24-boundary.js` |
| `party_first_screen_delivery_attempt` | `FIRST_SCREEN_DELIVERY_ATTEMPT_SCHEMA` | `packages/contracts/src/schema-names.js` |
| `party_physical_plan_mapping_report` | `STAGE25_MAPPING_REPORT_SCHEMA` | `packages/new-game/src/stages/stage-25-party-commit/policy/constants.js` |
| `party_physical_write_plan` | `STAGE25_PHYSICAL_PLAN_SCHEMA` | `packages/new-game/src/stages/stage-25-party-commit/policy/constants.js` |
| `party_postcommit_read_input` | `STAGE25_POSTCOMMIT_READ_SCHEMA` | `packages/new-game/src/stages/stage-25-party-commit/policy/constants.js` |
| `party_postcommit_state` | `STAGE25_POSTCOMMIT_STATE_SCHEMA` | `packages/new-game/src/stages/stage-25-party-commit/policy/constants.js` |
| `party_postcommit_validation` | `STAGE25_POSTCOMMIT_SCHEMA` | `packages/new-game/src/stages/stage-25-party-commit/policy/constants.js` |
| `party_public_state` | `PARTY_PUBLIC_STATE_SCHEMA` | `packages/contracts/src/schema-names.js` |
| `party_transaction_result` | `STAGE25_TRANSACTION_SCHEMA` | `packages/new-game/src/stages/stage-25-party-commit/policy/constants.js` |
| `party_write_plan_dry_run_input` | `STAGE25_DRY_RUN_INPUT_SCHEMA` | `packages/new-game/src/stages/stage-25-party-commit/policy/constants.js` |
| `party_write_plan_dry_run_result` | `STAGE25_DRY_RUN_SCHEMA` | `packages/new-game/src/stages/stage-25-party-commit/policy/constants.js` |
| `player_character_audit` | `STAGE12_OUTPUT_SCHEMA` | `packages/new-game/src/stages/stage-12-player-character-audit/constants.js` |
| `player_character_audit_input` | `STAGE12_INPUT_SCHEMA` | `packages/new-game/src/stages/stage-12-player-character-audit/constants.js` |
| `player_character_code_precheck` | `STAGE12_CODE_PRECHECK_SCHEMA` | `packages/new-game/src/stages/stage-12-player-character-audit/constants.js` |
| `player_character_dossier` | `STAGE11_DOSSIER_SCHEMA` | `packages/new-game/src/stages/stage-12-player-character-audit/constants.js` |
| `player_character_dossier` | `STAGE11_OUTPUT_SCHEMA` | `packages/new-game/src/stages/stage-11-player-character/constants.js` |
| `player_character_game_profile` | `STAGE11_GAME_PROFILE_SCHEMA` | `packages/new-game/src/stages/stage-11-player-character/constants.js` |
| `player_character_generator_input` | `STAGE11_INPUT_SCHEMA` | `packages/new-game/src/stages/stage-11-player-character/constants.js` |
| `player_first_turn_input` | `PLAYER_FIRST_TURN_INPUT_SCHEMA` | `packages/contracts/src/schema-names.js` |
| `presentation_panel` | `PANEL_SCHEMA` | `packages/presentation/src/read-models/contracts.js` |
| `selected_start_node` | `STAGE9_OUTPUT_SCHEMA` | `packages/new-game/src/stages/stage-9-start-node-selection/constants.js` |
| `stage18_character_knowledge_result` | `STAGE18_RESULT_SCHEMA` | `packages/contracts/src/time-knowledge-hidden-boundary.js` |
| `stage19_hidden_state_result` | `STAGE19_RESULT_SCHEMA` | `packages/contracts/src/time-knowledge-hidden-boundary.js` |
| `stage20_visible_context_result` | `STAGE20_RESULT_SCHEMA` | `packages/contracts/src/visible-context-boundary.js` |
| `stage21_visible_context_audit_result` | `STAGE21_RESULT_SCHEMA` | `packages/contracts/src/visible-context-boundary.js` |
| `stage22_narrator_prose_result` | `STAGE22_RESULT_SCHEMA` | `packages/contracts/src/narrator-boundary.js` |
| `stage23_narrator_prose_audit_result` | `STAGE23_RESULT_SCHEMA` | `packages/contracts/src/narrator-boundary.js` |
| `stage23_upstream_repair_request` | `STAGE23_UPSTREAM_REPAIR_SCHEMA` | `packages/contracts/src/narrator-boundary.js` |
| `stage24_party_db_write_plan_approval` | `STAGE24_APPROVAL_SCHEMA` | `packages/contracts/src/stage24-boundary.js` |
| `stage24_party_db_write_plan_result` | `STAGE24_RESULT_SCHEMA` | `packages/contracts/src/stage24-boundary.js` |
| `stage25_commit_preflight` | `STAGE25_PREFLIGHT_SCHEMA` | `packages/new-game/src/stages/stage-25-party-commit/policy/constants.js` |
| `stage25_party_commit_approval` | `STAGE25_PARTY_COMMIT_APPROVAL_SCHEMA` | `packages/contracts/src/schema-names.js` |
| `stage25_party_start_commit_result` | `STAGE25_RESULT_SCHEMA` | `packages/new-game/src/stages/stage-25-party-commit/policy/constants.js` |
| `stage26_first_game_screen_result` | `STAGE26_FIRST_GAME_SCREEN_RESULT_SCHEMA` | `packages/contracts/src/schema-names.js` |
| `stage26_first_game_screen_result` | `STAGE26_RESULT_SCHEMA` | `packages/new-game/src/stages/stage-26-first-game-screen/policy/constants.js` |
| `stage26_screen_approval` | `STAGE26_SCREEN_APPROVAL_SCHEMA` | `packages/contracts/src/schema-names.js` |
| `start_node_selector_input` | `STAGE9_INPUT_SCHEMA` | `packages/new-game/src/stages/stage-9-start-node-selection/constants.js` |
| `start_place_audit` | `STAGE10_OUTPUT_SCHEMA` | `packages/new-game/src/stages/stage-10-start-place-audit/constants.js` |
| `start_place_audit_input` | `STAGE10_INPUT_SCHEMA` | `packages/new-game/src/stages/stage-10-start-place-audit/constants.js` |
| `time_light_audit_route` | `STAGE17_ROUTE_SCHEMA` | `packages/contracts/src/time-knowledge-hidden-boundary.js` |
| `time_light_code_precheck` | `STAGE17_PRECHECK_SCHEMA` | `packages/contracts/src/time-knowledge-hidden-boundary.js` |
| `time_light_consistency_audit` | `STAGE17_AUDIT_SCHEMA` | `packages/contracts/src/time-knowledge-hidden-boundary.js` |
| `time_light_consistency_input` | `STAGE17_INPUT_SCHEMA` | `packages/contracts/src/time-knowledge-hidden-boundary.js` |
| `turn_screen` | `TURN_SCREEN_SCHEMA` | `packages/presentation/src/read-models/contracts.js` |
| `visible_context_audit` | `STAGE21_OUTPUT_SCHEMA` | `packages/contracts/src/visible-context-boundary.js` |
| `visible_context_audit_approval` | `VISIBLE_CONTEXT_AUDIT_APPROVAL_SCHEMA` | `packages/contracts/src/schema-names.js` |
| `visible_context_audit_code_precheck` | `STAGE21_PRECHECK_SCHEMA` | `packages/contracts/src/visible-context-boundary.js` |
| `visible_context_audit_input` | `STAGE21_INPUT_SCHEMA` | `packages/contracts/src/visible-context-boundary.js` |
| `visible_context_audit_repair_route` | `STAGE21_ROUTE_SCHEMA` | `packages/contracts/src/visible-context-boundary.js` |
| `visible_context_builder_input` | `STAGE20_INPUT_SCHEMA` | `packages/contracts/src/visible-context-boundary.js` |
| `visible_context_code_precheck` | `STAGE20_PRECHECK_SCHEMA` | `packages/contracts/src/visible-context-boundary.js` |
| `visible_context_package` | `STAGE20_OUTPUT_SCHEMA` | `packages/contracts/src/visible-context-boundary.js` |
| `visible_context_visibility_filter` | `STAGE20_VISIBILITY_FILTER_SCHEMA` | `packages/contracts/src/visible-context-boundary.js` |
| `weather_state` | `WEATHER_STATE_SCHEMA` | `packages/contracts/src/weather-state.js` |
| `world_base_reference_snapshot` | `WORLD_BASE_REFERENCE_SCHEMA` | `packages/contracts/src/stage24-boundary.js` |

## External schemas

| Path | Type | Bytes | SHA-256 |
|---|---:|---:|---|
| `schemas/knowledge-source/corpus-manifest.schema.json` | json | 1487 | `1584e4b2fd950d30c5a5f37691fa70dfeaf1c661dbcf73aae45cedb0fea1dd1e` |
| `schemas/knowledge-source/graph-manifest.schema.json` | json | 1076 | `b1a7a96fffec9843630415c5e6b456f58f50ab5be97be1c1bd86232874fda4ca` |
| `schemas/knowledge-source/import-history.schema.json` | json | 1047 | `b608e70c982acee2df00aac19c9a72ed557966e8e9ba83756c6d202053aeaef7` |
| `schemas/knowledge-source/rag-manifest.schema.json` | json | 1154 | `a02253c557403a0b9e021611692fda448c74011f8e2a255341ebdefa27fb190d` |
| `schemas/knowledge-source/source-aliases.schema.json` | json | 413 | `ae253bb3e5a0030d67835dc8b965dc2450b3486abaecb87921e7186ff09ad90f` |
| `schemas/materialization/approved-g5-template-bundle-v2.schema.json` | json | 4898 | `00e44ab46395bdb8923ffa717c208c7fa301171342515febd9256b97c9b4866f` |
| `schemas/materialization/bounded-decision-request-v2.schema.json` | json | 1960 | `440a5b0d3b48859f53a35b652ff3d33f75c7512332a0ece2c04ef01b213f2568` |
| `schemas/materialization/bounded-decision-result-v2.schema.json` | json | 605 | `875c4115302982c7b6ff67c70659553436ee0c7557ca5b1e79884652f9d7b287` |
| `schemas/materialization/catalog-import-manifest-v2.schema.json` | json | 1021 | `469ad1d3728ff5b32fac0d6eb879519bac7bfdd4b120cbb8ec4dd886c3cc01c6` |
| `schemas/materialization/category-labels-v1.schema.json` | json | 617 | `1573db65e359e5fef818c2e1a17ac66cf9e0e5a922bf9e9a7824d8304bc6ba78` |
| `schemas/materialization/category-scheme-mappings-v1.schema.json` | json | 732 | `a0f0c10e737b3e06eff1163ebd32b04db26a2a6e17beb0766450fd786ab2b6f0` |
| `schemas/materialization/classification-schemes-v1.schema.json` | json | 754 | `4744d626cd53cc4dae7794ea08162432245eaf2de8fe097e54359be7f83e9034` |
| `schemas/materialization/container-content-category-relations-v1.schema.json` | json | 533 | `3f6c11cea3e82408f1c337bf619dbc0b6a79b128f6b1ee1111f17331bb7eec82` |
| `schemas/materialization/container-content-profile-entries-v1.schema.json` | json | 778 | `6ff7159e75de95256aee61f19a317d7d96a25c79ba43b7d6483392417b02f090` |
| `schemas/materialization/container-content-profiles-v1.schema.json` | json | 433 | `5393e7fb8e27c280582938d9bdedd75cf1be818319947f3b1a4fedc2a847dd43` |
| `schemas/materialization/container-template-facet-bindings-v1.schema.json` | json | 650 | `e5c2d7248a1bc33b5c7c9f73f97843a640a17601d03f69b2c6cca596db7d1fc9` |
| `schemas/materialization/container-template-inventory-profiles-v1.schema.json` | json | 799 | `6e4fac710cc9fbf56c7571bd7fc62902b866269d3d5b9dd707a4def3e5ee4c2a` |
| `schemas/materialization/container-templates-v1.schema.json` | json | 895 | `ea116627196d44ac915835c010f9e6eef4f23a729bfc7b2df0d76832bb1b72bf` |
| `schemas/materialization/item-classification-migration-inventory-v1.schema.json` | json | 738 | `cbcfee73a572cb55bc1861f7444e44666ac2453abd5b341b7b36d5a9d1fc5289` |
| `schemas/materialization/item-profile-entries-v1.schema.json` | json | 819 | `9ed6084519ada39b8f4bcb497d5df91f243d3d7a6c13b5d28697fc33983b1c61` |
| `schemas/materialization/item-profile-sets-v1.schema.json` | json | 668 | `da28c42211e937f4d186d3750b95b92762847ee15a0e9c07b8f75248a0f4cd90` |
| `schemas/materialization/item-template-category-bindings-v1.schema.json` | json | 871 | `0a355b2f66a9eec372b44ef31605bbbd3c808fed9411fa5dafca3baf83e15908` |
| `schemas/materialization/item-template-inventory-profiles-v1.schema.json` | json | 694 | `61b5a6c6c13c65dc116edf74ba0b9fec6e9fd61daef1ca1688b91aaf1e4a56b4` |
| `schemas/materialization/item-templates-v1.schema.json` | json | 582 | `5c508b395d78888f1c7d02f4dfccf3e6e98b19db51b5cb9cca5040e4679ff5f8` |
| `schemas/materialization/normalized-instance-candidate-v2.schema.json` | json | 3150 | `ccbd9e9d518a8ab4b28e937e6e4eb19b88a26f3ea6eeff89aaf24432dd9a0b1d` |
| `schemas/materialization/party-autonomous-update-v2.schema.json` | json | 2515 | `974cf66248b18851ac64b2e80522b0207a28f049088318d578ffbc11b8712397` |
| `schemas/materialization/party-change-set-v2.schema.json` | json | 2816 | `cabbce3e6d6091391cba5b1fa0b6ea09c69f2db6bbed3ac241563171e95b62c1` |
| `schemas/materialization/property-profile-rules-v1.schema.json` | json | 1078 | `fdb63b23c9ffdbbaa9e7562141cc2763ea1538300c5ed79f0b7d8c55604f9c30` |
| `schemas/materialization/property-profiles-v1.schema.json` | json | 499 | `6cd5d5bdb462d8f4e1a60af1457faaba4c1aa11f9ded629a2cade6ae37adf0cd` |
| `schemas/materialization/region-category-options-v1.schema.json` | json | 825 | `0acabbad107562f88424ff0215d9619d26f63aaaa829ba75e274708fce11da0e` |
| `schemas/materialization/region-equipment-profile-entries-v1.schema.json` | json | 649 | `92ff1c9a1cb43b62770c178af635a3cb9ed18a043a9fb0d2a1deb8b2d8fafeee` |
| `schemas/materialization/region-equipment-profiles-v1.schema.json` | json | 454 | `33b1f3a2febb0ca72dd388804dd06501703a71ea913fa7cf48fdd9dff92976b9` |
| `schemas/materialization/source-records-v1.schema.json` | json | 697 | `037a2be66fdce964f9bde13c3d4031c0a1b4c9c2ebb7b26e3cf72aa3e61a9b1c` |
| `schemas/materialization/universal-categories-v1.schema.json` | json | 905 | `b2110a8b777c2d26049337f07826c254eb1f9854535ae7990f4c2f40bc4df972` |
| `schemas/materialization/universal-category-relations-v1.schema.json` | json | 512 | `31fd11130f43de9a61d58b8fde877527649eaad8915af99225f982033b179f38` |
| `schemas/materialization/world-materialization-repair-request-v2.schema.json` | json | 945 | `ba34924dd6587d7a5044498766cc8c0ff81167eae9fbee3e98e63ad0fb75fd59` |
| `schemas/materialization/world-materialization-request-v2.schema.json` | json | 10347 | `3b6739984a1ec31a01d99867f13d8a5c9f4f87f4ab7a2d4ba5b911282629ae7f` |
| `schemas/materialization/world-materialization-result-v2.schema.json` | json | 5190 | `92ee591037949a9e55ded6fe2813516718b5ade28b7cd7c8b592185c356db163` |
| `schemas/materialization/world-revisions-v1.schema.json` | json | 571 | `47693c523b2000430235dafd8e7a5669355cf67208c53f6f497f95a985df4214` |
| `schemas/party-db/001_party_runtime.sql` | sql | 19734 | `5cab24b65540da3f9857c2e70cd9e93c9761bac439839dbde1940cde24b5f6a1` |
| `schemas/world-base/world-base-source-bundle.schema.json` | json | 1447 | `358430badf2821197ffc74d4600b2cc2b153d1a1a141020e998650cb1c325dc2` |
| `schemas/world-catalogs/g1-boundary-contract.schema.json` | json | 1199 | `9a255c612dc382e4ead28c5566ae6583878840651904a134f364bb1b1291f3aa` |
| `schemas/world-catalogs/g1-cell-package.schema.json` | json | 1794 | `d917ec67f99c965c0257f7dbc1b2498e123aff756f4b71c68e7da0f1b6fe8381` |
| `schemas/world-catalogs/g1-mask-record.schema.json` | json | 1686 | `b7e681769d7aa72c8717fc98dac2b1dbaf7d1e9a33ed163dfb7ede788f2b0a53` |
| `schemas/world-catalogs/g1-work-queue.schema.json` | json | 1358 | `5ee65e8ee26f8b511d9ecc44e4d704bb979fe9d758310f7523ddd612ddba2f3f` |
| `schemas/world-catalogs/region-map-revision.schema.json` | json | 1737 | `6da5c76805856aaba0e6013dfc2afe1e7cc1786520e0e865058ae5a14987656c` |
| `schemas/world-catalogs/world-catalog-source.schema.json` | json | 1244 | `ec614e9337ad15352c245f94b7ec5761f2ec56bf919ceb5f70d9c6df87f53670` |
