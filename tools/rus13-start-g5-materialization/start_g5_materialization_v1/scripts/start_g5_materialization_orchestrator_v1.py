#!/usr/bin/env python3
"""start_g5_materialization_orchestrator_v1.py

Skeleton only. It orchestrates G5 materialization contracts and validation gates.
It must not invent scene anchors, items, NPCs, routes or hidden facts in code.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Callable

@dataclass(frozen=True)
class Stage:
    step_id: str
    contract_id: str
    blocking_rules: list[str]

STAGES = [
    Stage(step_id='g5_01_start_context_lock', contract_id='G5StartInputContext', blocking_rules=['g5_val_001']),
    Stage(step_id='g5_02_template_match', contract_id='G5TemplateMatch', blocking_rules=['g5_val_002']),
    Stage(step_id='g5_03_existing_state_check', contract_id='G5ExistingStateSnapshot', blocking_rules=[]),
    Stage(step_id='g5_04_scene_graph_draft', contract_id='G5SceneGraphDraft', blocking_rules=['g5_val_003', 'g5_val_004', 'g5_val_005', 'g5_val_006']),
    Stage(step_id='g5_05_visibility_access_ownership_audit', contract_id='G5AnchorAccessVisibilityPackage', blocking_rules=['g5_val_007']),
    Stage(step_id='g5_06_objects_npcs_binding', contract_id='G5ObjectNpcBinding', blocking_rules=['g5_val_008']),
    Stage(step_id='g5_07_edges_movement_graph', contract_id='G5SceneEdgePackage', blocking_rules=['g5_val_009']),
    Stage(step_id='g5_08_current_position_selection', contract_id='G5CurrentPositionCommitPlan', blocking_rules=['g5_val_010']),
    Stage(step_id='g5_09_visible_start_package', contract_id='G5VisibleStartPackage', blocking_rules=['g5_val_011']),
    Stage(step_id='g5_10_commit_gate_audit', contract_id='G5AuditReport', blocking_rules=['g5_val_012']),
    Stage(step_id='g5_11_db_write_plan_and_commit', contract_id='G5CommitResult', blocking_rules=['g5_val_013', 'g5_val_014']),
]

class BlockingValidationError(RuntimeError):
    pass

def validate_required(contract_schema: dict[str, Any], payload: dict[str, Any]) -> None:
    missing = [k for k in contract_schema.get('required', []) if k not in payload]
    if missing:
        raise BlockingValidationError(f"Missing required fields for {contract_schema.get('title')}: {missing}")

def reject_code_side_world_generation(reason: str) -> None:
    raise BlockingValidationError(f"LLM repair required; code-side generation is forbidden: {reason}")

def run_stage(stage: Stage, llm_call: Callable[[str, dict[str, Any]], dict[str, Any]], context: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
    payload = llm_call(stage.step_id, context)
    validate_required(schema, payload)
    return payload

def commit_g5_scene(accepted_write_plan: dict[str, Any], db_execute: Callable[[dict[str, Any]], None]) -> None:
    """Commit only the accepted write plan. Do not fill missing semantic fields here."""
    if not accepted_write_plan.get('commit_allowed'):
        reject_code_side_world_generation('commit gate did not allow DB write')
    db_execute(accepted_write_plan)
