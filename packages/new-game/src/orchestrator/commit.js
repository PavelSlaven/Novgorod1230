import { shapePlayerCharacterGameProfile } from '../stages/stage-11-player-character/contract.js';

export function commitApprovedStage(context, stage, executionResult, { input = null } = {}) {
  const bundle = executionResult?.artifact ?? executionResult;
  const primary = selectPrimaryArtifact(stage.id, bundle);
  context.setStageResult(stage.id, executionResult);
  context.setStageOutput(stage.id, primary);
  commitAuxiliaryArtifacts(context, stage.id, bundle, input);
  context.freezeArtifact({
    artifactId: `stage:${stage.id}:${primary?.schema ?? stage.name}`,
    artifact: primary,
    stageId: stage.id,
    schema: primary?.schema ?? null,
    metadata: { stage_name: stage.name, status: executionResult?.status ?? 'approved' }
  });

  if (stage.id === 12) {
    const dossier = context.getStageOutput(11);
    const audit = context.getStageOutput(12);
    if (dossier?.schema === 'player_character_dossier' && (audit?.pass === true || audit?.approval_status === 'approved_to_persist')) {
      const profile = shapePlayerCharacterGameProfile(dossier, audit);
      context.setStageOutput(1101, profile);
      context.freezeArtifact({ artifactId: 'stage:11:player_character_game_profile', artifact: profile, stageId: 1101, schema: profile.schema });
    }
  }
  return primary;
}

function selectPrimaryArtifact(stageId, bundle) {
  switch (Number(stageId)) {
    case 13: return bundle?.output ?? bundle;
    case 14: return bundle?.output ?? bundle;
    case 15: return bundle?.draft ?? bundle;
    case 16: return bundle?.draft ?? bundle;
    case 17: return bundle?.audit ?? bundle;
    case 18: return bundle?.character_knowledge_map ?? bundle;
    case 19: return bundle?.full_hidden_scene_state ?? bundle;
    case 20: return bundle?.visible_context_package ?? bundle;
    case 21: return bundle?.visible_context_audit ?? bundle;
    case 22: return bundle?.narrator_starting_prose ?? bundle;
    case 23: return bundle?.narrator_prose_audit ?? bundle;
    case 24: return bundle?.party_db_write_plan ?? bundle;
    default: return bundle;
  }
}

function commitAuxiliaryArtifacts(context, stageId, bundle, input) {
  const entries = [];
  if (stageId === 13) entries.push([1300, input?.allowed_g5_template_set], [1301, bundle?.code_precheck]);
  if (stageId === 14) entries.push([1401, bundle?.code_precheck]);
  if (stageId === 15) entries.push([1501, bundle?.code_precheck], [1502, bundle?.audit]);
  if (stageId === 16) entries.push([1601, bundle?.code_precheck], [1602, bundle?.audit]);
  if (stageId === 17) entries.push([1701, bundle?.code_precheck]);
  if (stageId === 18) entries.push([1801, bundle?.code_precheck], [1802, bundle?.character_knowledge_map_audit], [1803, bundle?.write_plan]);
  if (stageId === 19) entries.push([1901, bundle?.full_hidden_state_code_precheck], [1902, bundle?.full_hidden_state_audit]);
  if (stageId === 20) entries.push([2001, bundle?.visible_context_code_precheck]);
  for (const [id, artifact] of entries) if (artifact != null) context.setStageOutput(id, artifact);
}
