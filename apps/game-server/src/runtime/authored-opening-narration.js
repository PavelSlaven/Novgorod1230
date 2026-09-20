import { buildStage22NarratorInput, runStage22NarratorProse,
  runStage22SemanticRepairBlock, buildStage23AuditInput,
  runStage23NarratorProseAudit, validateStage23CommitHandoff } from
  '@rus/new-game';
import { computeVisibleContextPackageDigest } from '@rus/contracts';
import { serverError } from '../errors.js';

const WRITER = `Return only strict JSON matching output_contract. Write 2-4 connected
paragraphs of restrained literary Russian in second person. Use only the supplied
player-safe visible_context_package. The reader must understand identity and role,
preceding context and reason here, known/present people, current event, immediate
obligation/stake/uncertainty, physical near/far surroundings, body, and obvious
directions or interactions. Integrate them as a scene, not a dossier, quest log,
checklist, command menu, or state report. opening source_hint is optional support,
never the whole scene. Mention no prop, person, route, sound, weather, memory or
action absent from supplied persisted sources. action_options must be []; prose_status
must be drafted; used_visible_context_refs may be []; every self_constraints_check
boolean must be true; block_reason must be null.`;

const AUDITOR = `Return only strict JSON matching output_contract. Audit the opening
against visible_context_package, not plausibility. Every required check must appear.
Fail factual, hidden, coverage, technical or agency defects. A literary-only dossier,
checklist or weak composition finding uses NARRATOR_PROSE_WEAK_LITERARY_COMPOSITION
and literary_composition_check=false but pass remains true when all blocking checks
pass. Evidence must be concise and nonempty. Do not rewrite prose or include private
state. repair_route is null; commit permissions are true exactly when pass is true.`;

export function createAuthoredOpeningNarrationService({ roleRunner } = {}) {
  if (typeof roleRunner?.run !== 'function') throw new TypeError(
    'Authored opening narration requires the configured role runner.');
  const role = (roleId, instruction) => async (input) => {
    const response = await roleRunner.run({ scope: 'new_game', role_id: roleId,
      request_identity: input.request_id,
      messages: [{ role: 'system', content: instruction },
        { role: 'user', content: JSON.stringify(input) }],
      overrides: { temperature: roleId.includes('repair') ? 0.2 : 0 } });
    if (!response?.output || typeof response.output !== 'object') throw serverError(
      'AUTHORED_OPENING_PROVIDER_INVALID', 'Opening role returned no JSON object.',
      { status: 503 });
    return response.output;
  };
  const writer = role('opening_narrator', WRITER);
  const formatRepairer = role('opening_narrator_format_repair',
    `${WRITER} Repair only the requested JSON/contract defects.`);
  const seniorWriter = role('opening_narrator_senior',
    `${WRITER} Rebuild the complete opening after the supplied validation errors.`);
  const auditor = role('opening_narrator_auditor', AUDITOR);
  const auditFormatRepairer = role('opening_narrator_audit_format_repair',
    `${AUDITOR} Repair only JSON shape and preserve existing verdict meaning.`);
  const seniorAuditor = role('opening_narrator_senior_auditor',
    `${AUDITOR} Re-audit completely after the supplied validation errors.`);
  const router = role('opening_narrator_audit_router',
    'Return only the exact repair_route JSON requested by the input. Choose narrator_prose_semantic_repair for supported prose defects; never invent a concern.');
  const semanticRepairer = role('opening_narrator_semantic_repair',
    `${WRITER} Repair every supplied Stage 23 concern. Return the complete exact Stage 22 output.`);
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
