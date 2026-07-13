#!/usr/bin/env python3
"""new_party_generator_orchestrator_v1.py

Skeleton only. It orchestrates LLM contracts and validation gates.
It must not invent world facts in code.
"""
from __future__ import annotations
import json
from dataclasses import dataclass
from typing import Any, Callable

@dataclass(frozen=True)
class Stage:
    step_id: str
    contract_id: str
    blocking_rules: list[str]

STAGES = [
    Stage(step_id='ng_01_request_intake', contract_id='StartRequestNormalized', blocking_rules=[]),
    Stage(step_id='ng_02_historical_frame', contract_id='HistoricalFrameDraft', blocking_rules=['v002', 'v003']),
    Stage(step_id='ng_03_region_context_retrieval', contract_id='ActiveRegionContext', blocking_rules=['v012']),
    Stage(step_id='ng_04_historical_pressure', contract_id='HistoricalPressurePackage', blocking_rules=[]),
    Stage(step_id='ng_05_start_place_selection', contract_id='StartPlaceDraft', blocking_rules=['v004']),
    Stage(step_id='ng_06_location_chain', contract_id='StartPositionChain', blocking_rules=['v005']),
    Stage(step_id='ng_07_player_character_generation', contract_id='PlayerCharacterStartProfile', blocking_rules=['v006']),
    Stage(step_id='ng_08_bind_character_to_place', contract_id='StartCausalLink', blocking_rules=[]),
    Stage(step_id='ng_09_people_nearby', contract_id='InitialNpcLayer', blocking_rules=[]),
    Stage(step_id='ng_10_item_property_layer', contract_id='InitialItemPropertyLayer', blocking_rules=['v007']),
    Stage(step_id='ng_11_initial_routes_map_knowledge', contract_id='InitialMapKnowledge', blocking_rules=['v008']),
    Stage(step_id='ng_12_initial_tensions_hidden_processes', contract_id='InitialTensionEventLayer', blocking_rules=['v009']),
    Stage(step_id='ng_13_consistency_audit', contract_id='StartConsistencyAuditReport', blocking_rules=['v001', 'v012']),
    Stage(step_id='ng_14_persist_party_start', contract_id='PartyStartTransactionPlan', blocking_rules=['v011']),
    Stage(step_id='ng_15_visible_context_intro_prose', contract_id='InitialVisibleSceneAndIntroProse', blocking_rules=['v010']),
]

class BlockingValidationError(RuntimeError):
    pass

def validate_required(contract_schema: dict[str, Any], payload: dict[str, Any]) -> None:
    missing = [k for k in contract_schema.get("required", []) if k not in payload]
    if missing:
        raise BlockingValidationError(f"Missing required fields for {contract_schema.get('title')}: {missing}")

def run_stage(stage: Stage, llm_call: Callable[[str, dict[str, Any]], dict[str, Any]], context: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
    """Run one LLM stage and validate structure. Semantic repair is delegated back to LLM."""
    payload = llm_call(stage.step_id, context)
    validate_required(schema, payload)
    return payload

def no_code_fallback(reason: str) -> None:
    """Use when a semantic result is missing. Do not synthesize replacements in code."""
    raise BlockingValidationError(f"LLM repair required: {reason}")
