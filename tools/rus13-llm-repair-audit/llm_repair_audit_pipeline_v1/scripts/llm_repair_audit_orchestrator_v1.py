#!/usr/bin/env python3
"""LLM repair/audit pipeline skeleton.
Code validates and routes; it does not create or semantically repair world facts.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
import json

@dataclass
class ValidationIssue:
    code: str
    severity: str
    layer: str
    path: str
    message: str
    repairable: bool = True

@dataclass
class PipelineResult:
    final_state: str
    committed_revision: Optional[int]
    issues: List[ValidationIssue] = field(default_factory=list)
    payload: Optional[Dict[str, Any]] = None

class LlmRepairAuditPipeline:
    def __init__(self, schema_registry, llm_client, party_store, max_format_repairs: int = 2, max_semantic_repairs: int = 2):
        self.schema_registry = schema_registry
        self.llm_client = llm_client
        self.party_store = party_store
        self.max_format_repairs = max_format_repairs
        self.max_semantic_repairs = max_semantic_repairs

    def run_step(self, *, party_id: str, source_step_id: str, agent_id: str, raw_response: str, expected_schema_id: str) -> PipelineResult:
        self.party_store.record_raw_llm_step(party_id, source_step_id, agent_id, raw_response, expected_schema_id)

        payload, issues = self._parse_and_validate(raw_response, expected_schema_id)
        if issues:
            payload, issues = self._repair_format_loop(party_id, source_step_id, raw_response, expected_schema_id, issues)
        if issues:
            self.party_store.record_validation_issues(party_id, source_step_id, issues)
            return PipelineResult(final_state='failed_blocked', committed_revision=None, issues=issues)

        source_report = self._audit_sources(party_id, source_step_id, payload)
        semantic_report = self._audit_semantics(party_id, source_step_id, payload)
        visibility_report = self._audit_visibility(party_id, source_step_id, payload)
        write_plan_report = self._validate_write_plan(party_id, source_step_id, payload)

        blocking = self._collect_blocking(source_report, semantic_report, visibility_report, write_plan_report)
        if blocking:
            self.party_store.record_validation_issues(party_id, source_step_id, blocking)
            return PipelineResult(final_state='failed_blocked', committed_revision=None, issues=blocking, payload=payload)

        revision = self.party_store.commit_validated_write_plan(party_id, source_step_id, payload)
        self.party_store.record_post_commit_snapshot(party_id, source_step_id, revision)
        return PipelineResult(final_state='complete', committed_revision=revision, payload=payload)

    def _parse_and_validate(self, raw: str, schema_id: str):
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as e:
            return None, [ValidationIssue('E_JSON_PARSE','blocking','schema','$',str(e))]
        schema = self.schema_registry.get(schema_id)
        issues = self.schema_registry.validate(payload, schema)
        return payload, issues

    def _repair_format_loop(self, party_id, step_id, raw, schema_id, issues):
        current_raw = raw
        for attempt in range(self.max_format_repairs):
            repair_request = {
                'failed_step_id': step_id,
                'allowed_operation': 'format_only',
                'raw_result': current_raw,
                'schema_errors': [issue.__dict__ for issue in issues],
                'expected_schema': self.schema_registry.get(schema_id),
                'strict_constraints': [
                    'Do not add new facts.',
                    'Do not change meaning except to satisfy schema.',
                    'Use null/unknown when input lacks data.'
                ]
            }
            repaired = self.llm_client.call_agent('repair_agent_format_only', repair_request)
            self.party_store.record_repair_attempt(party_id, step_id, attempt + 1, repaired)
            payload, issues = self._parse_and_validate(repaired, schema_id)
            if not issues:
                return payload, []
            current_raw = repaired
        return None, issues

    def _audit_sources(self, party_id, step_id, payload):
        return self.llm_client.call_agent('source_status_auditor', {'payload': payload})

    def _audit_semantics(self, party_id, step_id, payload):
        context = self.party_store.load_semantic_audit_context(party_id, step_id)
        return self.llm_client.call_agent('semantic_consistency_auditor', {'payload': payload, 'context': context})

    def _audit_visibility(self, party_id, step_id, payload):
        context = self.party_store.load_visibility_audit_context(party_id, step_id)
        return self.llm_client.call_agent('visibility_leak_auditor', {'payload': payload, 'context': context})

    def _validate_write_plan(self, party_id, step_id, payload):
        return self.party_store.validate_write_plan(party_id, step_id, payload)

    def _collect_blocking(self, *reports):
        # Adapter layer should convert report-specific issues to ValidationIssue objects.
        blocking = []
        for report in reports:
            for item in getattr(report, 'blocking_issues', []) if not isinstance(report, dict) else report.get('blocking_issues', []):
                if isinstance(item, ValidationIssue):
                    blocking.append(item)
                else:
                    blocking.append(ValidationIssue(
                        code=item.get('code','E_UNKNOWN_BLOCKING'),
                        severity='blocking',
                        layer=item.get('layer','audit'),
                        path=item.get('path','$'),
                        message=item.get('message', str(item)),
                    ))
        return blocking
