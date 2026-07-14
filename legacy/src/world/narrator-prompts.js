import {
  buildProsePromptHeader,
  buildRepairPromptHeader,
  buildVisibilityPromptHeader
} from './prompt-headers.js';
import {
  buildVisibleContextAntiRegressionRules,
  buildVisibleContextOutputContract,
  getVisibleContextCanonicalExample
} from './json-contracts.js';

function sanitizeNarratorNarrative(narrative = {}) {
  if (!narrative || typeof narrative !== 'object') return {};
  return {
    scene: narrative.scene ?? '',
    consequence: narrative.consequence ?? '',
    visible_details: Array.isArray(narrative.visible_details) ? narrative.visible_details.slice(0, 6) : [],
    npc_reactions: Array.isArray(narrative.npc_reactions) ? narrative.npc_reactions.slice(0, 6) : [],
    next_pressure: narrative.next_pressure ?? ''
  };
}

export function buildVisibleContextDossierMessages(input) {
  return [
    {
      role: 'system',
      content: buildVisibilityPromptHeader({
        role: 'Ты — агент отбора видимого контекста исторической RPG XIII века.',
        task: 'Собери безопасный visible_context_package: только то, что персонаж видит, слышит, помнит или может осторожно предположить.',
        sources: 'Полное состояние сцены, master_narrative и знания персонажа.',
        facts: 'Не отменяй утверждённый master_narrative; не добавляй новые факты.',
        visible: 'Отделяй видимое от скрытого; скрытые мотивы и будущие события не попадают в пакет.',
        constraints: 'Будущие delayed events без видимого следа не включай. Скрытые предметы в закрытых контейнерах не включай как объекты.',
        format: 'JSON schema=visible_context_package: visible_scene, visible_changes[], sensory_details[], visible_npc[], visible_objects[], known_context[], uncertainties[], allowed_tensions[], do_not_imply[].',
        criteria: 'Пакет безопасен для агента художественной прозы.'
      })
    },
    {
      role: 'user',
      content: JSON.stringify({
        stage: 'visible_context_dossier',
        input
      })
    }
  ];
}

export function buildVisibleContextShapeMessages(input, dossierText, audit, retryInstruction = '', previousPackage = null, validationErrors = []) {
  const outputContract = buildVisibleContextOutputContract();
  const canonicalExample = getVisibleContextCanonicalExample();
  return [
    {
      role: 'system',
      content: buildVisibilityPromptHeader({
        role: 'Ты — VisibleContextShaper для visible_context_package.',
        task: 'Верни только JSON visible_context_package без markdown.',
        sources: 'dossier, audit и входной контекст.',
        facts: 'Не добавляй новых фактов.',
        visible: 'Только видимый слой.',
        constraints: 'Типы из outputContract. Запрещены hidden, audit, dossier, state_delta в output.',
        format: 'version=1, schema=visible_context_package; nested fields per outputContract.',
        criteria: 'Пакет валиден и безопасен для прозы.',
        extra: buildVisibleContextAntiRegressionRules().map((rule) => `- ${rule}`)
      })
    },
    {
      role: 'user',
      content: JSON.stringify({
        stage: 'visible_context_shape',
        dossier: dossierText,
        audit,
        input,
        retryInstruction,
        previousPackage,
        validationErrors,
        outputContract,
        canonicalExample,
        outputRules: {
          allowedRootKeys: outputContract.allowedRootKeys,
          forbiddenRootKeys: ['dossier', 'audit', 'hidden', 'state_delta', 'sourceDossier', 'contract', 'notes', 'raw'],
          schema: 'visible_context_package',
          version: 1
        }
      })
    }
  ];
}

export function buildVisibleContextDossierRepairMessages(input, dossierText, audit) {
  return [
    {
      role: 'system',
      content: buildRepairPromptHeader({
        role: 'Ты — VisibleContextDossierRepairer для исторической RPG XIII века.',
        task: 'Исправь visible context dossier только по concerns аудита.',
        sources: 'input, sourceDossier, audit.',
        constraints: 'Не добавляй новых фактов; не раскрывай скрытые мотивы и будущие события.',
        format: 'Тот же формат dossier, что и у агента отбора видимого контекста.',
        criteria: 'Dossier безопасен для повторного аудита и shape.'
      })
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'semantic_dossier_repair',
        kind: 'visible_context_package',
        input,
        sourceDossier: dossierText,
        audit
      })
    }
  ];
}

export function buildNarratorDossierMessages(visiblePackage, clock, clockMoment) {
  return [
    {
      role: 'system',
      content: buildProsePromptHeader({
        role: 'Ты — narrator для исторической RPG XIII века.',
        task: 'Сделай prose dossier только из visible_context_package.',
        sources: 'Используй только поля visible_context_package и clockMoment.',
        facts: 'Не добавляй новых фактов и не меняй смысл пакета.',
        visible: 'Только видимый слой пакета.',
        constraints: 'Согласуй время суток с clockMoment.',
        format: 'Естественная проза без JSON.',
        criteria: 'Краткий фрагмент сцены для UI.'
      })
    },
    {
      role: 'user',
      content: JSON.stringify({
        stage: 'semantic_dossier',
        clock,
        clockMoment,
        visiblePackage
      })
    }
  ];
}

export function buildNarratorAuditMessages(visiblePackage, dossierText, clock, clockMoment) {
  return [
    {
      role: 'system',
      content: buildProsePromptHeader({
        role: 'Ты — narrator-аудит исторической RPG XIII века.',
        task: 'Проверь, что prose dossier не выходит за пределы visible_context_package.',
        sources: 'dossier и visiblePackage.',
        facts: 'Пакет менять нельзя.',
        visible: 'Сверяй только видимый слой.',
        constraints: 'Проверь согласованность с clockMoment.',
        format: 'JSON schema=semantic_audit.',
        criteria: 'Audit однозначно говорит pass/fail.',
        extra: ['Schema обязательна: schema = "semantic_audit".']
      })
    },
    {
      role: 'user',
      content: JSON.stringify({
        stage: 'semantic_audit',
        visiblePackage,
        dossier: dossierText,
        clock,
        clockMoment
      })
    }
  ];
}

export function buildNarratorShapeMessages(visiblePackage, dossierText, audit, clock, clockMoment) {
  return [
    {
      role: 'system',
      content: buildProsePromptHeader({
        role: 'Ты — SemanticDataShaper для narrator-прозы исторической RPG XIII века.',
        task: 'Верни только чистую прозу для UI из visible_context_package.',
        sources: 'approvedProse, visiblePackage и clock.',
        facts: 'Не меняй смысл пакета.',
        visible: 'Только видимый слой.',
        constraints: 'Согласуй время суток с clockMoment; пиши сдержанно.',
        format: 'Только проза без JSON и markdown.',
        criteria: 'Фрагмент книги, но игровой.'
      })
    },
    {
      role: 'user',
      content: JSON.stringify({
        stage: 'semantic_shape',
        visiblePackage,
        approvedProse: dossierText,
        clock,
        clockMoment
      })
    }
  ];
}

export function buildNarratorDossierRepairMessages(visiblePackage, dossierText, audit, clock, clockMoment) {
  return [
    {
      role: 'system',
      content: buildRepairPromptHeader({
        role: 'Ты — NarratorDossierRepairer для исторической RPG XIII века.',
        task: 'Исправь prose dossier только по concerns аудита.',
        sources: 'visiblePackage, sourceDossier, audit.',
        constraints: 'Не добавляй новых фактов; не выходи за visible_context_package.',
        format: 'Естественная проза без JSON.',
        criteria: 'Dossier безопасен для повторного аудита.'
      })
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'semantic_dossier_repair',
        kind: 'narrator_dossier',
        visiblePackage,
        sourceDossier: dossierText,
        audit,
        clock,
        clockMoment
      })
    }
  ];
}

export function buildNarratorProseRepairMessages(visiblePackage, dossierText, audit, proseText, validationErrors = [], clock, clockMoment) {
  const errors = Array.isArray(validationErrors)
    ? validationErrors.filter(Boolean)
    : (validationErrors ? [String(validationErrors)] : []);
  return [
    {
      role: 'system',
      content: buildRepairPromptHeader({
        role: 'Ты — NarratorProseRepairer для narrator-прозы исторической RPG XIII века.',
        task: 'Исправь прозу только по validationErrors.',
        sources: 'visiblePackage, approvedDossier, previousProse, validationErrors.',
        constraints: 'Не добавляй новых фактов; не меняй смысл пакета.',
        format: 'Только чистая проза.',
        criteria: 'Все validationErrors устранены.'
      })
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'semantic_prose_repair',
        kind: 'narrator_prose',
        visiblePackage,
        approvedDossier: dossierText,
        audit,
        previousProse: proseText,
        validationErrors: errors,
        conflictReason: errors.join('; ') || null,
        clock,
        clockMoment
      })
    }
  ];
}

export { sanitizeNarratorNarrative };
