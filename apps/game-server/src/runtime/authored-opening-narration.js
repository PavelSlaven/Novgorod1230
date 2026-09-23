import { buildStage22NarratorInput, buildStage23AuditInput,
  validateStage23CommitHandoff, SELF_CHECK_FIELDS, STAGE23_REQUIRED_CHECKS,
  buildNarratorStartCodePrecheck, validateNarratorStartingProseOutput,
  buildNarratorProseCodePrecheck, validateNarratorProseAudit } from
  '@rus/new-game';
import { computeVisibleContextPackageDigest } from '@rus/contracts';
import { adaptApprovedOpeningNarration } from '@rus/narration';
import { serverError } from '../errors.js';

const WRITER = `Return only {"prose":"<complete opening>"}. Write 2-4 connected
paragraphs of restrained literary Russian in second person. Use only the supplied
player-safe visible_context_package. Cover every supplied must_include entry.
Unprovided history, goals, obligations, people, structures and routes remain unstated;
an empty observation list does not establish an empty or silent place.
Integrate the supplied facts as a scene, not a dossier, quest log,
checklist, command menu, or state report. opening source_hint is optional support,
never the whole scene. Mention no prop, person, route, sound, weather, memory or
action absent from supplied persisted sources.`;

const AUDITOR = `Return only {"pass":<boolean>,"failed_checks":["<required check>"],
"concerns":[{"code":"<allowed code>","severity":"warning|repairable|hard_block|upstream_block","message":"<reason>"}],"evidence":["<grounded evidence>"]}.
Audit the opening
against visible_context_package, not plausibility. Every required check must appear.
Fail factual, hidden, coverage, technical or agency defects. A literary-only dossier,
checklist or weak composition finding uses NARRATOR_PROSE_WEAK_LITERARY_COMPOSITION
and literary_composition_check=false but pass remains true when all blocking checks
pass. Evidence must be concise and nonempty. Do not rewrite prose or include private
state. failed_checks names come only from output_contract.required_checks.`;

export function createAuthoredOpeningNarrationService({ roleRunner,
  llmDiagnostics = null } = {}) {
  if (typeof roleRunner?.run !== 'function') throw new TypeError(
    'Authored opening narration requires the configured role runner.');
  const role = (roleId, instruction, assemble = (output) => output) => async (input) => {
    llmDiagnostics?.turnBudget?.assertWithinDeadline?.();
    const response = await roleRunner.run({ scope: 'turn_runtime', role_id: roleId,
      request_identity: input.request_id,
      messages: [{ role: 'system', content: instruction },
        { role: 'user', content: JSON.stringify(input) }],
      overrides: { temperature: roleId.includes('repair') ? 0.2 : 0 } });
    if (!response?.output || typeof response.output !== 'object') throw serverError(
      'AUTHORED_OPENING_PROVIDER_INVALID', 'Opening role returned no JSON object.',
      { status: 503 });
    llmDiagnostics?.turnBudget?.assertWithinDeadline?.();
    return assemble(response.output, input);
  };
  const proseOutput = (output, input) => ({ version: 1,
    schema: 'narrator_starting_prose', request_id: input.request_id,
    prose_status: 'drafted', prose: output.prose, action_options: [],
    used_visible_context_refs: [], block_reason: null,
    self_constraints_check: Object.fromEntries(SELF_CHECK_FIELDS.map((key) =>
      [key, true])) });
  const writer = role('gameplay_narrator', WRITER, proseOutput);
  const auditOutput = (output, input) => {
    const failed = new Set(Array.isArray(output.failed_checks)
      ? output.failed_checks.filter((key) => STAGE23_REQUIRED_CHECKS.includes(key))
      : []);
    const concerns = Array.isArray(output.concerns) ? output.concerns : [];
    const blocking = concerns.some(({ code }) =>
      code !== 'NARRATOR_PROSE_WEAK_LITERARY_COMPOSITION');
    const pass = output.pass === true && !blocking;
    return { version: 1, schema: 'narrator_prose_audit',
      request_id: input.request_id, pass,
      checks: Object.fromEntries(STAGE23_REQUIRED_CHECKS.map((key) => [key,
        { pass: !failed.has(key) }])), concerns,
      evidence: Array.isArray(output.evidence) ? output.evidence : [],
      repair_route: null,
      commit_permission: { can_show_to_player: pass,
        can_write_player_visible_message: pass,
        can_mark_opening_scene_presented: pass } };
  };
  const auditor = role('gameplay_narrator_auditor', AUDITOR, auditOutput);
  const semanticRepairer = role('gameplay_narrator_semantic_repair',
    `${WRITER} Repair every supplied Stage 23 concern.`, proseOutput);
  return Object.freeze({
    async run({ partyId, requestId, visibleContextPackage,
      visibleContextApproval }) {
      const execute = () => runBoundedOpening({ requestId,
        visibleContextPackage, visibleContextApproval, writer, auditor,
        semanticRepairer });
      return typeof llmDiagnostics?.runTurn === 'function'
        ? llmDiagnostics.runTurn({ party_id: partyId,
          request_id: requestId }, execute)
        : execute();
    }
  });
}

async function runBoundedOpening({ requestId, visibleContextPackage,
  visibleContextApproval, writer, auditor, semanticRepairer }) {
      const stage22Input = buildStage22NarratorInput({ request_id: requestId,
        visible_context_package: visibleContextPackage,
        visible_context_package_digest:
          computeVisibleContextPackageDigest(visibleContextPackage),
        visible_context_approval: visibleContextApproval,
        narrator_policy: { max_opening_paragraphs: 4, max_action_options: 0 } });
  let stage22 = stage22Result(stage22Input, await writer(stage22Input), []);
  const audit = async () => {
    const input = buildStage23AuditInput({ request_id: requestId,
          visible_context_package: visibleContextPackage,
          visible_context_approval: visibleContextApproval,
          stage22_result: stage22 });
    const value = await auditor(input);
    const validation = validateNarratorProseAudit(value, input, {
      allowRouteMissing: value.pass === false
    });
    if (validation.length > 0) openingError('AUTHORED_OPENING_AUDIT_INVALID',
      validation);
    return { input, result: stage23Result(input, value) };
  };
  let stage23 = await audit();
  const originalStage23Audit = structuredClone(
    stage23.result.narrator_prose_audit);
  if (stage23.result.pass !== true) {
    if (stage23.result.narrator_prose_audit.concerns.some(({ severity }) =>
      ['hard_block', 'upstream_block'].includes(severity))) {
      openingError('AUTHORED_OPENING_AUDIT_REJECTED',
        stage23.result.narrator_prose_audit.concerns);
    }
    stage22 = stage22Result(stage22Input,
      await semanticRepairer({ ...stage22Input,
        failed_narrator_starting_prose: stage22.narrator_starting_prose,
        prose_audit_concerns: originalStage23Audit.concerns,
        prose_audit_evidence: originalStage23Audit.evidence }), [{
          role: 'semantic_repair', value: stage22.narrator_starting_prose
        }]);
    stage23 = await audit();
  }
      const handoff = validateStage23CommitHandoff({ request_id: requestId,
        visible_context_package: visibleContextPackage,
        stage22_result: stage22, stage23_result: stage23.result });
      if (handoff.length > 0) throw serverError('AUTHORED_OPENING_AUDIT_REJECTED',
        'Stage 23 rejected the authored opening.', { status: 409,
          details: { codes: handoff.map(({ code }) => code) } });
  const flow = adaptApprovedOpeningNarration({ stage22Result: stage22,
    stage23Result: stage23.result });
      return Object.freeze({ prose: flow.approved_output.prose,
        literary_pass: stage23.result.narrator_prose_audit
          .checks.literary_composition_check.pass,
        flow, stage22_result: structuredClone(stage22),
        stage23_result: structuredClone(stage23.result),
        original_stage23_audit: originalStage23Audit });
}

function stage22Result(input, output, history) {
  const precheck = buildNarratorStartCodePrecheck(input);
  const concerns = validateNarratorStartingProseOutput(output, input, precheck);
  if (concerns.length > 0) openingError('AUTHORED_OPENING_WRITER_INVALID',
    concerns);
  return { version: 1, schema: 'stage22_narrator_prose_result',
    request_id: input.request_id, pass: true,
    visible_context_package_digest: input.visible_context_package_digest,
    narrator_start_code_precheck: precheck,
    narrator_starting_prose: structuredClone(output),
    generation_history: structuredClone(history), diagnostics: {
      bounded_opening_calls: true },
    handoff_permission: { can_send_to_prose_audit: true } };
}

function stage23Result(input, audit) {
  const precheck = buildNarratorProseCodePrecheck(input);
  const pass = audit.pass === true;
  return { version: 1, schema: 'stage23_narrator_prose_audit_result',
    request_id: input.request_id, pass,
    visible_context_package_digest: input.visible_context_package_digest,
    narrator_starting_prose_digest: input.narrator_starting_prose_digest,
    narrator_prose_code_precheck: precheck,
    narrator_prose_audit: structuredClone(audit), repair_route: null,
    audit_history: [], diagnostics: { bounded_opening_calls: true },
    commit_permission: { can_show_to_player: pass,
      can_write_player_visible_message: pass,
      can_mark_opening_scene_presented: pass } };
}

function openingError(code, concerns) {
  throw serverError(code, 'Authored opening narration failed closed.', {
    status: 409, details: { codes: concerns.map(({ code: item }) => item) }
  });
}
