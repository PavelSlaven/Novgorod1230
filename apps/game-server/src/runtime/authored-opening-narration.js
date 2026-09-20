import { buildStage22NarratorInput, runStage22NarratorProse,
  runStage22SemanticRepairBlock, buildStage23AuditInput,
  runStage23NarratorProseAudit, validateStage23CommitHandoff,
  SELF_CHECK_FIELDS, STAGE23_REQUIRED_CHECKS, STAGE23_ROUTE_SCHEMA } from
  '@rus/new-game';
import { computeVisibleContextPackageDigest } from '@rus/contracts';
import { serverError } from '../errors.js';

const WRITER = `Return only {"prose":"<complete opening>"}. Write 2-4 connected
paragraphs of restrained literary Russian in second person. Use only the supplied
player-safe visible_context_package. The reader must understand identity and role,
preceding context and reason here, known/present people, current event, immediate
obligation/stake/uncertainty, physical near/far surroundings, body, and obvious
directions or interactions. Integrate them as a scene, not a dossier, quest log,
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

export function createAuthoredOpeningNarrationService({ roleRunner } = {}) {
  if (typeof roleRunner?.run !== 'function') throw new TypeError(
    'Authored opening narration requires the configured role runner.');
  const role = (roleId, instruction, assemble = (output) => output) => async (input) => {
    const response = await roleRunner.run({ scope: 'turn_runtime', role_id: roleId,
      request_identity: input.request_id,
      messages: [{ role: 'system', content: instruction },
        { role: 'user', content: JSON.stringify(input) }],
      overrides: { temperature: roleId.includes('repair') ? 0.2 : 0 } });
    if (!response?.output || typeof response.output !== 'object') throw serverError(
      'AUTHORED_OPENING_PROVIDER_INVALID', 'Opening role returned no JSON object.',
      { status: 503 });
    return assemble(response.output, input);
  };
  const proseOutput = (output, input) => ({ version: 1,
    schema: 'narrator_starting_prose', request_id: input.request_id,
    prose_status: 'drafted', prose: output.prose, action_options: [],
    used_visible_context_refs: [], block_reason: null,
    self_constraints_check: Object.fromEntries(SELF_CHECK_FIELDS.map((key) =>
      [key, true])) });
  const writer = role('gameplay_narrator', WRITER, proseOutput);
  const formatRepairer = role('gameplay_narrator_format_repair',
    `${WRITER} Repair only the requested JSON/contract defects.`, proseOutput);
  const seniorWriter = role('gameplay_narrator',
    `${WRITER} Rebuild the complete opening after the supplied validation errors.`,
    proseOutput);
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
  const auditFormatRepairer = role('gameplay_narrator_auditor',
    `${AUDITOR} Repair only JSON shape and preserve existing verdict meaning.`,
    auditOutput);
  const seniorAuditor = role('gameplay_narrator_auditor',
    `${AUDITOR} Re-audit completely after the supplied validation errors.`,
    auditOutput);
  const router = async (input) => {
    const blocked = input.concerns.some(({ severity }) =>
      ['hard_block', 'upstream_block'].includes(severity));
    return { version: 1, schema: STAGE23_ROUTE_SCHEMA,
      request_id: input.request_id,
      return_to_stage: blocked ? 'blocked' : 'narrator_prose_semantic_repair',
      repair_kind: blocked ? 'blocked_grounding' : 'semantic_grounding',
      reason: blocked ? 'Opening has a non-repairable grounding defect.'
        : 'Repair grounded opening prose.',
      supporting_concern_codes: input.concerns.map(({ code }) => code) };
  };
  const semanticRepairer = role('gameplay_narrator_semantic_repair',
    `${WRITER} Repair every supplied Stage 23 concern.`, proseOutput);
  return Object.freeze({
    async run({ requestId, visibleContextPackage, visibleContextApproval }) {
      const stage22Input = buildStage22NarratorInput({ request_id: requestId,
        visible_context_package: visibleContextPackage,
        visible_context_package_digest:
          computeVisibleContextPackageDigest(visibleContextPackage),
        visible_context_approval: visibleContextApproval,
        narrator_policy: { max_opening_paragraphs: 4, max_action_options: 0 } });
      let stage22 = await runStage22NarratorProse({ input: stage22Input,
        writer, formatRepairer, seniorWriter });
      const audit = async () => {
        const input = buildStage23AuditInput({ request_id: requestId,
          visible_context_package: visibleContextPackage,
          visible_context_approval: visibleContextApproval,
          stage22_result: stage22 });
        return { input, result: await runStage23NarratorProseAudit({ input,
          auditor, formatRepairer: auditFormatRepairer, seniorAuditor, router }) };
      };
      let stage23 = await audit();
      if (stage23.result.pass !== true
          && stage23.result.repair_route?.return_to_stage
            === 'narrator_prose_semantic_repair') {
        stage22 = await runStage22SemanticRepairBlock({ input: stage22Input,
          failedResult: stage22,
          proseAudit: stage23.result.narrator_prose_audit,
          semanticRepairer, formatRepairer, seniorRepairer: seniorWriter });
        stage23 = await audit();
      }
      const handoff = validateStage23CommitHandoff({ request_id: requestId,
        visible_context_package: visibleContextPackage,
        stage22_result: stage22, stage23_result: stage23.result });
      if (handoff.length > 0) throw serverError('AUTHORED_OPENING_AUDIT_REJECTED',
        'Stage 23 rejected the authored opening.', { status: 409,
          details: { codes: handoff.map(({ code }) => code) } });
      return Object.freeze({ prose: stage22.narrator_starting_prose.prose,
        literary_pass: stage23.result.narrator_prose_audit
          .checks.literary_composition_check.pass,
        audit: stage23.result.narrator_prose_audit });
    }
  });
}
