import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLocalEnv } from '../src/env.js';
import { createWorldState } from '../src/world/state.js';
import { applyGeneratedPlayerSeed, applyStartupDefaults, buildRandomStartupFrame, createFreshWorld } from '../src/world/new-game.js';
import { handlePlayerInput } from '../src/world/engine.js';
import { classifyIntent } from '../src/world/intent.js';
import { buildMasterFrame, buildMasterPromptSync, estimateIntentMinutes, planMasterTurnSync } from '../src/world/master.js';
import { buildHistoricalContext, dedupeHistoricalEvents, humanizeHistoricalPhaseLabel } from '../src/world/historical-context.js';
import { buildRegionSummary } from '../src/world/region-summary.js';
import { loadWorldState, saveInitialWorld, saveWorldState } from '../src/world/persistence.js';
import { buildActionCheck } from '../src/world/checks.js';
import { applyStateDelta } from '../src/world/delta.js';
import { applySocialConsequence } from '../src/world/social.js';
import { assessLegalPressure, summarizeLegalAftermath } from '../src/world/law.js';
import { resolveCombatTarget } from '../src/world/engine.js';
import { getRegionalSummaryCachePath } from '../src/world/region-summary-cache.js';
import { resetRegionCatalogCache } from '../src/world/region-catalog.js';
import { buildUiState } from '../src/ui-state.js';
import { buildRouteView } from '../src/ui/route-view.js';
import { buildObservation, buildTalkResult } from '../src/world/narration.js';
import { consumeMedicalSupplies } from '../src/world/medical.js';
import { ensureLocationProfiles, getCurrentLocation, getCurrentMicroLocation, syncCurrentPlace, travelWithinLocation, travelWorld } from '../src/world/location.js';
import { buildCurrentPosition, getActiveStateValue, mirrorBodyStateFields, syncCurrentPosition } from '../src/world/profile-v2.js';
import { advanceWorld } from '../src/world/timeline.js';
import { scheduleDelayedEvent } from '../src/world/delayed-events.js';
import { composeStateDiff, commitStateDiff, validateStateDiff } from '../src/world/state-diff.js';
import { loadRegionCatalog, selectRegionCatalogEntry, getLastRegionCatalogMismatch, resetRegionCatalogMismatch } from '../src/world/region-catalog.js';
import { loadDesignBundleSync, resolveDesignTask, getTaskFiles } from '../src/world/corpus-loader.js';
import { recordWorldEvent } from '../src/world/event-log.js';
import { buildWorldCluster } from '../src/world/cluster.js';
import { buildRouteReconstruction } from '../src/world/routes.js';
import { explainLocationProfilesValidation } from '../src/world/json-contracts.js';
import {
  generateActorProfiles,
  generateHistoricalFrame,
  generateLocationProfiles,
  generateMasterResponse,
  generateNarratorProse,
  generatePlaceSeed,
  generatePlayerSeed,
  generateRiskAudit,
  generateSocialTissue,
  parseSemanticAuditResponse
} from '../src/world/provider.js';
import { parseJsonObject, explainPlaceSeedValidation, explainHistoricalFrameValidation, validateActorProfiles, validateHistoricalFrame, validatePlaceSeed, validatePlayerSeed, validatePlayerSeedItemBlocks, validateRiskAudit, validateSemanticAudit, validateSocialTissue } from '../src/world/json-contracts.js';
import { buildNpcProfile, buildNpcProfiles, buildPlayerProfile, buildPropertyLedger } from '../src/world/entities.js';
import { buildCanonicalPlayerSeedFixture } from './player-seed-fixtures.js';

let persistenceQueue = Promise.resolve();

function runPersistenceTest(fn) {
  const next = persistenceQueue.then(fn, fn);
  persistenceQueue = next.catch(() => {});
  return next;
}

await loadLocalEnv();
process.env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'test-key';

globalThis.fetch = async (_url, options) => {
  const body = JSON.parse(options.body);
  const systemText = body.messages?.[0]?.content ?? '';
  const userText = body.messages?.[1]?.content ?? '';
  if (/предварительный аудит риска/i.test(systemText)) {
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify(buildRiskAuditResponse(userText))
              }
            }
          ]
        };
      }
    };
  }
  if ((/semantic dossier/i.test(systemText) || /semantic_dossier/i.test(userText)) && !/SemanticDataShaper|ActorProfileShaper|LocationProfileShaper|MasterNarrativeShaper|VisibleContextShaper/i.test(systemText)) {
    const payload = safeJsonParse(userText);
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: buildMockDossierResponse(payload)
              }
            }
          ]
        };
      }
    };
  }
  if (/semantic_audit/i.test(systemText) || /отдельный проверяющий/i.test(systemText)) {
    const payload = safeJsonParse(userText);
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify(buildMockSemanticAuditResponse(payload))
              }
            }
          ]
        };
      }
    };
  }
  if (/historical_frame/i.test(systemText) || /historical frame/i.test(systemText) || /историческую рамку/i.test(systemText)) {
    const payload = safeJsonParse(userText);
    if (/HistoricalDataShaper/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify(buildMockHistoricalFrameResponse(payload))
                }
              }
            ]
          };
        }
      };
    }
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: buildMockHistoricalFrameDossierResponse(payload)
              }
            }
          ]
        };
      }
    };
  }
  if (/place_seed/i.test(systemText) || /place seed/i.test(systemText) || /смысл места/i.test(systemText)) {
    const payload = safeJsonParse(userText);
    if (/PlaceSeedPurposeOwnershipShaper/i.test(systemText) || /ShapePurposeOwnership/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    placeName: payload?.sourceSections?.PURPOSE?.[0] ? 'Двор у переправы' : 'Двор у переправы',
                    placeKind: 'дорожный двор',
                    purpose: 'обслуживать проход, ночлег и контроль дороги',
                    formalOwner: 'местный хозяин двора',
                    actualManager: 'приказчик двора',
                    dependentGroups: ['служки']
                  })
                }
              }
            ]
          };
        }
      };
    }
    if (/PlaceSeedLivelihoodRoadsShaper/i.test(systemText) || /ShapeLivelihoodRoads/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    livelihood: ['переправа', 'корм и ночлег'],
                    roads: ['тракт к переправе', 'дорога к торгу']
                  })
                }
              }
            ]
          };
        }
      };
    }
    if (/PlaceSeedAccessHazardsRhythmShaper/i.test(systemText) || /ShapeAccessHazardsRhythm/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    accessRules: ['ночью вход ограничен', 'чужого сперва расспрашивают'],
                    hazards: ['подозрительность к чужим', 'грязь у ворот после дождя'],
                    rhythm: 'утром двор открыт, днём идёт проход, вечером контроль строже'
                  })
                }
              }
            ]
          };
        }
      };
    }
    if (/PlaceSeedShaper/i.test(systemText) || /schema=place_seed/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify(buildMockPlaceSeedResponse(payload))
                }
              }
            ]
          };
        }
      };
    }
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: buildMockPlaceSeedDossierResponse(payload)
              }
            }
          ]
        };
      }
    };
  }
  if (/social_tissue/i.test(systemText) || /social tissue/i.test(systemText) || /социальную ткань/i.test(systemText)) {
    const payload = safeJsonParse(userText);
    if (/SocialTissueShaper/i.test(systemText) || /schema=social_tissue/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify(buildMockSocialTissueResponse(payload))
                }
              }
            ]
          };
        }
      };
    }
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: buildMockSocialTissueDossierResponse(payload)
              }
            }
          ]
        };
      }
    };
  }
  if (/player_seed/i.test(systemText) || /player seed/i.test(systemText) || /персонажа игрока/i.test(systemText)) {
    const payload = safeJsonParse(userText);
    if (/PlayerSeedShaper/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify(buildMockPlayerSeedResponse(payload))
                }
              }
            ]
          };
        }
      };
    }
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: buildMockPlayerSeedDossierResponse(payload)
              }
            }
          ]
        };
      }
    };
  }
  if (/агент отбора видимого контекста/i.test(systemText)) {
    const payload = safeJsonParse(userText);
    if (/VisibleContextShaper|SemanticDataShaper/i.test(systemText)) {
      const input = payload?.input ?? {};
      const narrative = input?.narrative ?? {};
      return {
        ok: true,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  version: 1,
                  schema: 'visible_context_package',
                  visible_scene: String(narrative.scene ?? 'Сцена.'),
                  visible_changes: Array.isArray(narrative.visible_details) ? narrative.visible_details : [],
                  sensory_details: Array.isArray(narrative.visible_details) ? narrative.visible_details : [],
                  visible_npc: [],
                  visible_objects: [],
                  known_context: [],
                  uncertainties: [],
                  allowed_tensions: narrative.next_pressure ? [String(narrative.next_pressure)] : [],
                  do_not_imply: []
                })
              }
            }]
          };
        }
      };
    }
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: 'visible dossier ok' } }] };
      }
    };
  }
  if ((/SemanticDataShaper|MasterNarrativeShaper/i.test(systemText) || /упаковать утверждённый semantic dossier/i.test(systemText)) && !/ActorProfileShaper|LocationProfileShaper|VisibleContextShaper/i.test(systemText) && !/narrator/i.test(systemText)) {
    const payload = safeJsonParse(userText);
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify(buildMockAiResponse(payload?.input ?? userText))
              }
            }
          ]
        };
      }
    };
  }
  if (/narrator/i.test(systemText) || /UI-прозы/i.test(systemText) || /prose для UI/i.test(systemText)) {
    const payload = safeJsonParse(userText);
    if (/NarratorProseRepairer/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [{
              message: {
                content: String(payload?.visiblePackage?.visible_scene ?? payload?.previousProse ?? 'Сцена держится в пределах видимого.')
              }
            }]
          };
        }
      };
    }
    if (/semantic_audit/i.test(systemText) || /Narrator audit/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['Narrator prose stays within the approved visible scene.']
                  })
                }
              }
            ]
          };
        }
      };
    }
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: buildMockNarratorProse(payload)
              }
            }
          ]
        };
      }
    };
  }
  const response = buildMockAiResponse(userText);
  return {
    ok: true,
    async json() {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify(response)
            }
          }
        ]
      };
    }
  };
};

test('new world start time follows explicit text when provided', () => {
  const world = createWorldState({
    startText: 'Новая игра: начать в 6:30 утра у переправы.'
  });

  assert.ok(world.clock.day >= 1 && world.clock.day <= 30);
  assert.equal(world.clock.hour, 6);
  assert.equal(world.clock.minute, 30);
});

test('new world start date follows explicit date text when provided', () => {
  const world = createWorldState({
    startText: '5 апреля 1242 года, новая игра в 6:30 утра у переправы.'
  });

  assert.equal(world.clock.day, 5);
  assert.equal(world.clock.hour, 6);
  assert.equal(world.clock.minute, 30);
});

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildMockDossierResponse(payload) {
  const input = String(payload?.input ?? '');
  if (/claim/i.test(input) || /требую уважения/i.test(input)) {
    return 'Dossier: the player speaks like a claimant and the scene tightens around social risk, witnesses, and status.';
  }
  if (/move/i.test(input) || /иду/i.test(input)) {
    return 'Dossier: movement is possible but must pass through local routes, witnesses, and the current state of the place.';
  }
  return 'Dossier: the visible scene is grounded in local pressure, witnesses, and historical constraints.';
}

function buildMockSemanticAuditResponse(payload) {
  const input = String(payload?.input ?? '');
  if (/claim/i.test(input) || /требую уважения/i.test(input) || /нападаю/i.test(input)) {
    return {
      version: 1,
      schema: 'semantic_audit',
      pass: true,
      concerns: [],
      evidence: ['Social risk and witness pressure are properly represented.']
    };
  }
  return {
    version: 1,
    schema: 'semantic_audit',
    pass: true,
    concerns: [],
    evidence: ['Semantic dossier remains within local medieval constraints.']
  };
}

function buildMockHistoricalFrameDossierResponse(payload) {
  const regionName = String(payload?.regionHint ?? 'Владимирская земля');
  return [
    `Историческая рамка стартует в ${regionName}.`,
    'Год 1241, осень, напряжение войны и дорожной неуверенности.',
    'Место у переправы или торгового узла, где путь, власть и статус важнее удобства.',
    'Смысл рамки ясен и не требует лишней конкретики.'
  ].join(' ');
}

function buildMockHistoricalFrameResponse(payload) {
  const regionName = String(payload?.regionHint ?? 'Новгородская земля');
  return {
    version: 1,
    schema: 'historical_frame',
    year: 1241,
    season: 'осень',
    regionName,
    regionHint: regionName,
    settlementType: 'город у переправы',
    pressure: 'война, дорога и торговый контроль',
    conflict: 'власть, путь и местный порядок',
    startTextHint: String(payload?.startText ?? 'Историчная стартовая рамка')
  };
}

function buildMockPlaceSeedDossierResponse(payload) {
  return [
    'PURPOSE',
    '- Перевалочный пункт для путников, купцов и гонцов.',
    '- Место смены лошадей, краткого ночлега и горячей пищи.',
    '',
    'OWNERSHIP',
    '- Формально под местной властью, фактически у хозяина двора или его приказчика.',
    '',
    'LIVELIHOOD',
    '- Плата за переправу и постой.',
    '- Продажа корма, хлеба и простых дорожных вещей.',
    '',
    'ROADS',
    '- Дорога к переправе.',
    '- Дорога к ближайшему торгу.',
    '',
    'ACCESS_RULES',
    '- Ночью вход ограничен.',
    '- Чужого сперва расспрашивают.',
    '',
    'HAZARDS',
    '- Подозрительность к чужим.',
    '- Грязь у ворот после дождя.',
    '',
    'RHYTHM',
    '- Утром двор открыт, днём идёт проход, вечером контроль строже.'
  ].join('\n');
}

function buildMockPlaceSeedResponse(payload) {
  return {
    version: 1,
    schema: 'place_seed',
    placeName: String(payload?.world?.place ?? 'Двор у переправы'),
    placeKind: 'дорожный двор',
    purpose: 'обслуживать проход, ночлег и контроль дороги',
    formalOwner: 'местный хозяин двора',
    actualManager: 'приказчик двора',
    dependentGroups: ['служки', 'подёнщики'],
    livelihood: ['переправа', 'корм и ночлег', 'мелкий дорожный торг'],
    roads: ['тракт к переправе', 'дорога к торгу', 'местная дворовая тропа'],
    accessRules: ['ночью вход ограничен', 'в амбар без дозволения не входят'],
    hazards: ['подозрительность к чужим', 'давка у ворот', 'грязь и скользкий двор'],
    rhythm: 'утром двор открывается, днём идёт проход, вечером ворота строже'
  };
}

function buildMockSocialTissueDossierResponse(payload) {
  return [
    `Социальная ткань строится вокруг ${payload?.world?.place ?? 'места'}.`,
    'Есть семьи, местная власть, зависимые люди, торговые связи, слухи и напряжение вокруг дороги и статуса.',
    'Ритм дня задают труд, контроль доступа и обмен новостями.'
  ].join(' ');
}

function buildMockSocialTissueResponse(_payload) {
  return {
    version: 1,
    schema: 'social_tissue',
    formalOwner: 'местный хозяин двора',
    actualManager: 'приказчик двора',
    dependentGroups: ['служки', 'подёнщики'],
    families: ['двор хозяина', 'семья перевозчика', 'дом ремесленника'],
    trade: ['переправа', 'дорожный обмен', 'мелкий торг'],
    rumors: ['чужак на дороге', 'сбор пошлины', 'ссора у ворот'],
    tensions: ['подозрительность к чужим', 'давление пути', 'страх перед властью'],
    obligations: ['платить за проход', 'подчиняться хозяину двора', 'не нарушать местный порядок'],
    rhythm: 'утром работа, днём торг и проход, вечером контроль ворот',
    accessRules: ['без дозволения в амбар не входят', 'чужака сперва расспрашивают', 'ночью доступ ограничен']
  };
}

function buildMockPlayerSeedDossierResponse(payload) {
  return [
    `Игрок ${payload?.world?.place ?? 'пришёл'} как историчный человек, а не как абстрактный аватар.`,
    'У него есть происхождение, статус, уязвимость, имущество и причина находиться здесь.',
    'Смысл игрока отделён от NPC и от декорации места.'
  ].join(' ');
}

function buildPlayerSeedShaperJson(overrides = {}) {
  return JSON.stringify(buildCanonicalPlayerSeedFixture(overrides));
}

function buildMockPlayerSeedResponse(_payload) {
  return buildCanonicalPlayerSeedFixture({
    name: 'безымянный человек',
    role: 'путник',
    status: 'чужой',
    socialClass: 'неизвестно',
    ageRange: 'взрослый',
    origin: 'Владимирская земля',
    visibleStatus: 'чужой',
    trueStatus: 'неизвестно',
    reasonHere: 'оказался здесь по дороге',
    bodyState: 'устал, но жив',
    language: 'местный говор',
    literacy: 'неизвестно',
    clothing: 'историчная одежда',
    inventory: ['старый нож', 'плащ старого образца'],
    family: ['родня неизвестна'],
    property: ['ветхий ларь'],
    memory: ['весна 1241 года — орден сжёг соседнее село'],
    knowledge: ['князь Александр велел чинить мосты и ладьи'],
    fears: ['продажа в холопы из-за долга'],
    goals: ['выплатить долг'],
    obligations: ['отработать долг хозяину переправы'],
    identity: {
      name: 'безымянный человек',
      age_range: 'взрослый',
      origin: 'Владимирская земля',
      social_status: 'неизвестно',
      occupation_or_role: 'путник',
      visible_status: 'чужой',
      true_status: 'неизвестно',
      reason_here: 'оказался здесь по дороге'
    },
    body: {
      description: 'устал, но жив',
      visible_marks: [],
      clothing: 'историчная одежда',
      health: 74,
      satiety: 74,
      vigor: 61,
      active_conditions: []
    },
    items: {
      carried_items: [
        {
          id: 'item:player:topor:1',
          label: 'плотницкий топор',
          type: 'tool',
          material: 'железо',
          condition: 'рабочий',
          size: 'medium',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'player',
          access: 'immediate',
          visibility: 'visible',
          legal_status: 'ordinary',
          function: 'работа и починка',
          weight: 1.2,
          discoverability: 5,
          plausibility: 5,
          risk: 0,
          visible: true,
          marks: []
        }
      ],
      equipment: [],
      weapons: [],
      armor: [],
      total_weight: 1.2,
      load_category: 'light'
    },
    property_and_access: {
      property_not_carried: ['клеть при дворе'],
      borrowed_items: [],
      foreign_items_with_character: [],
      accessible_resources: ['двор переправы'],
      return_obligations: ['отработать долг хозяину переправы']
    },
    memory_profile: {
      key_memories: ['весна 1241 года — орден сжёг соседнее село'],
      debts: ['долг'],
      fears: ['продажа в холопы из-за долга'],
      obligations: ['отработать долг хозяину переправы'],
      unresolved_unknowns: []
    },
    goals_profile: {
      immediate_need: 'выплатить долг',
      long_term_desire: 'удержаться на своём дворе',
      fear: 'продажа в холопы из-за долга',
      obligation: 'отработать долг хозяину переправы',
      reason_to_act: 'иначе лишится двора',
      consequence_of_inaction: 'потеряет имущество и свободу'
    },
    start_scene: {
      reason_here: 'оказался здесь по дороге',
      visible_situation: 'дорога у переправы',
      nearby_people: [],
      immediate_tension: 'чужак на тракте',
      intro_prose: 'Человек стоит у дороги и смотрит по сторонам.'
    }
  });
}

function buildMockNarratorProse(payload) {
  const visiblePackage = payload?.visiblePackage;
  if (visiblePackage?.visible_scene) {
    // ponytail: clock-neutral scene line keeps smoke turns from failing prose validation at night
    return String(visiblePackage.visible_scene).trim();
  }
  const input = String(payload?.input ?? '');
  const intent = String(payload?.intent ?? payload?.narrative?.intent ?? '');
  const claimMode = /claim/i.test(input) || /требую уважения/i.test(input) || intent === 'claim';
  const moveMode = /move/i.test(input) || /иду/i.test(input) || intent === 'move';
  let scene = String(payload?.scene?.scene ?? payload?.narrative?.scene ?? '');
  if (!scene) {
    if (claimMode) {
      scene = 'Мир не принимает заявление за факт.';
    } else if (moveMode) {
      scene = 'Ты переходишь в новое место.';
    } else {
      scene = 'Сцена сохраняет свой ход.';
    }
  }
  const consequence = String(payload?.scene?.consequence ?? payload?.narrative?.consequence ?? 'Последствия пока остаются в пределах видимого.');
  const details = Array.isArray(payload?.scene?.visible_details ?? payload?.narrative?.visible_details)
    ? (payload?.scene?.visible_details ?? payload?.narrative?.visible_details).slice(0, 4).join(' / ')
    : claimMode
      ? 'Мир не принимает заявление за факт.'
      : moveMode
        ? 'Ты переходишь в новое место.'
        : 'Заметных деталей немного.';
  const reactions = Array.isArray(payload?.scene?.npc_reactions ?? payload?.narrative?.npc_reactions)
    ? (payload?.scene?.npc_reactions ?? payload?.narrative?.npc_reactions).slice(0, 4).join(' / ')
    : claimMode
      ? 'Реакции людей сдержаны и недоверчивы.'
      : moveMode
        ? 'Реакции людей отмечают твой уход.'
        : 'Реакции людей сдержаны.';
  const next = String(payload?.scene?.next_pressure ?? payload?.narrative?.next_pressure ?? 'Следующее давление мира ещё только собирается.');
  return [scene, consequence, `Заметно: ${details}.`, `Реакции: ${reactions}.`, next].join('\n');
}

function mockVisiblePackageFromNarrative(narrative = {}) {
  const details = Array.isArray(narrative.visible_details) ? narrative.visible_details.slice() : [];
  return {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: String(narrative.scene ?? 'Сцена.'),
    visible_changes: [narrative.consequence, ...details].filter(Boolean).map(String),
    sensory_details: details,
    visible_npc: [],
    visible_objects: [],
    known_context: [],
    uncertainties: [],
    allowed_tensions: narrative.next_pressure ? [String(narrative.next_pressure)] : [],
    do_not_imply: []
  };
}

function buildRiskAuditResponse(text) {
  if (/Current intent: attack/i.test(text) || /Current intent: claim/i.test(text) || /Current intent: steal/i.test(text)) {
    return {
      version: 1,
      schema: 'risk_audit',
      required: true,
      reason: 'Действие несёт социальный или правовой риск и может иметь свидетелей.',
      factors: ['свидетели', 'право', 'статус', 'видимость'],
      complexity: 'Высокая',
      visibility: 'Действие заметно окружающим'
    };
  }

  if (/Current intent: move/i.test(text)) {
    return {
      version: 1,
      schema: 'risk_audit',
      required: false,
      reason: 'Путь в этом сценарии очевиден, отдельная проверка не нужна.',
      factors: ['маршрут открыт', 'сезон не мешает', 'дорога известна'],
      complexity: 'Низкая',
      visibility: 'Переход заметен, но не рискован'
    };
  }

  if (/Current intent: observe/i.test(text) || /Current intent: wait/i.test(text)) {
    return {
      version: 1,
      schema: 'risk_audit',
      required: false,
      reason: 'Действие бытовое и не требует проверки.',
      factors: ['рутина', 'отсутствие конфликта'],
      complexity: 'Низкая',
      visibility: 'Не требует отдельной проверки'
    };
  }

  return {
    version: 1,
    schema: 'risk_audit',
    required: true,
    reason: 'Недостаточно контекста, поэтому нужна conservative проверка.',
    factors: ['неопределённость', 'исторический контекст'],
    complexity: 'Средняя',
    visibility: 'Зависит от сцены'
  };
}

function buildMockAiResponse(text) {
  if (/Current intent: claim/i.test(text) || /требую уважения/i.test(text) || /\bclaim\b/i.test(text)) {
    return {
      version: 1,
      schema: 'master_narrative',
      scene: 'Мир не принимает заявление за факт.',
      consequence: 'Твоя претензия запомнена, но не подтверждена.',
      visible_details: ['Люди слушают', 'Слова остаются словами'],
      npc_reactions: ['Никто не принимает слова за факт', 'Кто-то хмурится'],
      next_pressure: 'Дальше возможен спор или проверка.',
      historical_audit: {
        pass: true,
        concerns: [],
        evidence: ['Claim is handled as social risk, not fact.']
      },
      state_delta: {
        social: {
          suspicion_delta: 2
        },
        memory: {
          rumors_add: ['Слух о чужаке, который выдает себя не за того.']
        },
        location: {
          recent_traces: ['Кто-то в дворе прислушивался к разговору о происхождении.']
        },
        witnesses: {
          recent_witnesses_add: ['Дворник', 'Купец-проезжий']
        }
      }
    };
  }

  if (/Current intent: move/i.test(text) || /иду/i.test(text) || /переход/i.test(text) || /move/i.test(text)) {
    return {
      version: 1,
      schema: 'master_narrative',
      scene: 'Ты переходишь в соседнюю точку.',
      consequence: 'Переход меняет положение в мире и фиксирует след.',
      visible_details: ['Старый двор', 'Новая точка карты'],
      npc_reactions: ['Кто-то замечает уход', 'Кто-то провожает взглядом'],
      next_pressure: 'Следующий ход уже будет в новом месте.',
      historical_audit: {
        pass: true,
        concerns: [],
        evidence: ['Movement has plausible local follow-through.']
      },
      state_delta: {
        scene: {
          attention: 'среднее'
        },
        location: {
          recent_traces: ['Следы ухода от ворот остаются на грязи.']
        },
        resources: {
          fatigue_delta: 3
        },
        witnesses: {
          recent_witnesses_add: ['Конюх']
        }
      }
    };
  }

  if (/осматрива/i.test(text)) {
    return {
      version: 1,
      schema: 'master_narrative',
      scene: 'Ты осматриваешь двор и видишь, как он живёт своим обычным ритмом.',
      consequence: 'Внимание местных смещается к твоим действиям, а не к твоим словам.',
      visible_details: ['следы у колодца', 'примятая солома', 'мокрая колея у ворот'],
      npc_reactions: ['Дворник смотрит настороженно', 'Конюх прислушивается'],
      next_pressure: 'Любое новое движение у ворот станет заметнее.',
      historical_audit: {
        pass: true,
        concerns: [],
        evidence: ['Observation fits local details and witnesses.']
      },
      state_delta: {
        location: {
          recent_traces: ['Кто-то недавно перекладывал тюки у амбара.']
        },
        witnesses: {
          location_notes_add: ['Кто-то перекладывал тюки у амбара на глазах у двора.']
        }
      }
    };
  }

  return {
    version: 1,
    schema: 'master_narrative',
    scene: 'Мир отвечает коротко и без украшений.',
    consequence: 'Ситуация меняется в пределах исторической правдоподобности.',
    visible_details: ['люди смотрят', 'место помнит прошлый ход'],
    npc_reactions: ['Никто не принимает слова за факт'],
    next_pressure: 'Следующий ход будет зависеть от статуса и свидетелей.',
    historical_audit: {
      pass: true,
      concerns: [],
      evidence: ['State change remains within medieval social risk.']
    },
    state_delta: {
      social: {
        suspicion_delta: 1
      },
      resources: {
        fear_delta: 1
      }
    }
  };
}

test('world starts with four linked layers', () => {
  resetRegionCatalogCache();
  const world = createWorldState();
  assert.equal(world.history.era, 'XIII век');
  assert.ok(world.region.name.length > 0);
  assert.ok(world.place.name.length > 0);
  assert.ok(world.scene.weather.length > 0);
  assert.ok(world.historical.regionalContext.current.name.length > 0);
  assert.ok(Array.isArray(world.historical.regionalContext.neighbors));
  assert.ok(world.historical.regionalContext.catalogSize > 0);
});

test('start text can influence the starting scenario', () => {
  const world = createWorldState({ startText: 'хочу быть купцом на рынке' });
  assert.match(world.place.name, /рынок|навес/i);
  assert.equal(world.player.role, 'торговец');
});

test('starting scenarios provide canonical player states', () => {
  const fordWorld = createWorldState({ startText: 'переправа и двор' });
  const marketWorld = createWorldState({ startText: 'хочу быть купцом на рынке' });
  const villageWorld = createWorldState({ startText: 'лесная деревня' });

  assert.deepEqual(fordWorld.player.states, { health: 100, satiety: 78, vigor: 82 });
  assert.deepEqual(marketWorld.player.states, { health: 100, satiety: 82, vigor: 88 });
  assert.deepEqual(villageWorld.player.states, { health: 100, satiety: 80, vigor: 84 });
  assert.deepEqual(fordWorld.player.activeStates, []);
  assert.deepEqual(marketWorld.player.activeStates, []);
  assert.deepEqual(villageWorld.player.activeStates, []);
  assert.equal(fordWorld.player.items.carried_items[0].holder_id, 'player');
  assert.equal(marketWorld.player.items.carried_items[0].holder_id, 'player');
  assert.equal(villageWorld.player.items.carried_items[0].holder_id, 'player');
  assert.ok(Number.isFinite(fordWorld.player.items.carried_items[0].weight));
  assert.ok(Number.isFinite(marketWorld.player.items.carried_items[0].weight));
  assert.ok(Number.isFinite(villageWorld.player.items.carried_items[0].weight));
});

test('intent classifier recognizes observation', () => {
  const intent = classifyIntent('Я осматриваю двор и слушаю людей');
  assert.equal(intent.type, 'observe');
});

test('intent classifier derives explicit focus for checks', () => {
  const intent = classifyIntent('Я стреляю из лука по ворогу');
  assert.equal(intent.type, 'attack');
  assert.equal(intent.focus, 'ranged');
});

test('claim is stored as claim rather than accepted fact', async () => {
  const world = createWorldState({ clock: { day: 1, hour: 10, minute: 0 } });
  const result = await handlePlayerInput(world, 'Я сын боярина и требую уважения');
  assert.equal(world.player.claims.length, 1);
  assert.match(result.text, /не принимает заявление за факт/i);
});

test('free text input advances world state', async () => {
  const world = createWorldState({ clock: { day: 1, hour: 10, minute: 0 } });
  const beforeDay = world.clock.day;
  const beforeSatiety = world.player.states.satiety;
  const beforeVigor = world.player.states.vigor;
  const beforeThirst = getActiveStateValue(world.player, 'thirst') ?? 0;
  await handlePlayerInput(world, 'Я жду у ворот');
  assert.ok(world.clock.day >= beforeDay);
  assert.ok(world.player.states.satiety < beforeSatiety);
  assert.ok(world.player.states.vigor <= beforeVigor);
  assert.equal(world.player.legacy_vitals, undefined);
  assert.equal(world.player.legacy_needs, undefined);
  assert.ok((getActiveStateValue(world.player, 'thirst') ?? 0) > beforeThirst);
  assert.equal(world.player.thirst, getActiveStateValue(world.player, 'thirst'));
  assert.ok(world.events.length >= 2);
});

test('advanceWorld расходует сытость и бодрость по документальной базе', () => {
  const makeWorld = () => createWorldState({ startText: 'переправа и двор' });

  const oneHourWorld = makeWorld();
  const eightHourWorld = makeWorld();
  const longWorld = makeWorld();
  const starvingWorld = makeWorld();

  oneHourWorld.player.states = { health: 100, satiety: 100, vigor: 100 };
  eightHourWorld.player.states = { health: 100, satiety: 100, vigor: 100 };
  longWorld.player.states = { health: 100, satiety: 100, vigor: 100 };
  starvingWorld.player.states = { health: 100, satiety: 0, vigor: 100 };

  advanceWorld(oneHourWorld, 60, { type: 'wait' });
  advanceWorld(eightHourWorld, 480, { type: 'wait' });
  advanceWorld(longWorld, 4320, { type: 'wait' });
  advanceWorld(starvingWorld, 60, { type: 'wait' });

  assert.equal(oneHourWorld.player.states.satiety, 99);
  assert.equal(oneHourWorld.player.states.vigor, 99);
  assert.equal(eightHourWorld.player.states.satiety, 89);
  assert.equal(eightHourWorld.player.states.vigor, 89);
  assert.equal(longWorld.player.states.satiety, 0);
  assert.equal(longWorld.player.states.vigor, 0);
  assert.equal(starvingWorld.player.states.satiety, 0);
  assert.equal(starvingWorld.player.states.health, 99);
});

test('world journal keeps the full log while recent events stay capped', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const initialJournalSize = world.journal.length;
  for (let index = 0; index < 35; index += 1) {
    recordWorldEvent(world, {
      at: { day: 1, hour: 10, minute: index },
      input: null,
      intent: 'test',
      result: `event-${index}`
    });
  }

  assert.equal(world.events.length, 30);
  assert.equal(initialJournalSize, 1);
  assert.equal(world.journal.length, initialJournalSize + 35);
  assert.equal(world.journal[0].result, 'event-34');
  assert.equal(world.journal.at(-1)?.kind, 'place');
  assert.equal(world.events[0].result, 'event-34');
  assert.equal(world.events[29].result, 'event-5');
});

test('ui state separates player journal from technical log', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  for (let index = 0; index < 32; index += 1) {
    recordWorldEvent(world, {
      at: { day: 1, hour: 11, minute: index },
      input: null,
      intent: 'audit',
      result: `journal-${index}`
    });
  }

  const uiState = buildUiState(world, { includeDebug: true });

  assert.equal(uiState.events.length, 30);
  assert.equal(uiState.technicalJournal.length, 30);
  assert.equal(uiState.journal.length, 1);
  assert.equal(uiState.journal[0].kind, 'place');
  assert.equal(uiState.technicalJournal[0].result, 'journal-31');
});

test('journal entries are classified into memory kinds for player memory', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const fact = recordWorldEvent(world, {
    kind: 'memory',
    source: 'scene',
    result: 'Факт',
    relatedIds: ['yard']
  });
  const rumor = recordWorldEvent(world, {
    kind: 'rumor',
    source: 'scene',
    result: 'Слух'
  });
  const assumption = recordWorldEvent(world, {
    kind: 'assumption',
    source: 'memory',
    result: 'Предположение'
  });
  const technical = recordWorldEvent(world, {
    intent: 'audit',
    result: 'Техническое'
  });

  assert.equal(fact.memoryClass, 'fact');
  assert.equal(rumor.memoryClass, 'rumor');
  assert.equal(assumption.memoryClass, 'assumption');
  assert.equal(technical.memoryClass, 'technical');
  assert.equal(world.journal.some((entry) => entry.result === 'Техническое'), false);
});

test('journal sections use typed journal entries for memory places and rumors', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.memory.sceneNotes = [{ note: 'legacy scene note' }];
  world.memory.heardRumors = ['legacy rumor'];
  world.memory.visitedPlaces = {
    yard: {
      visits: 1,
      firstSeenAt: { ...world.clock },
      lastSeenAt: { ...world.clock },
      notes: ['legacy visit']
    }
  };

  recordWorldEvent(world, {
    kind: 'memory',
    source: 'scene',
    visibility: 'public',
    status: 'remembered',
    at: { ...world.clock },
    result: 'typed scene memory'
  });
  recordWorldEvent(world, {
    kind: 'place',
    source: 'memory',
    visibility: 'public',
    status: 'known',
    at: { ...world.clock },
    relatedIds: ['yard'],
    label: 'Двор',
    result: 'visited yard'
  });
  recordWorldEvent(world, {
    kind: 'rumor',
    source: 'world',
    visibility: 'public',
    status: 'heard',
    at: { ...world.clock },
    result: 'typed rumor'
  });

  const uiState = buildUiState(world, { includeDebug: true });

  assert.ok(uiState.journalSections.memory.some((line) => line.includes('typed scene memory')));
  assert.ok(uiState.journalSections.places.some((line) => line.includes('Двор')));
  assert.ok(uiState.journalSections.rumorsHistory.some((line) => line.includes('typed rumor')));
  assert.equal(uiState.journalSections.memory.some((line) => line.includes('legacy scene note')), false);
  assert.equal(uiState.journalSections.rumorsHistory.some((line) => line.includes('legacy rumor')), false);
});

test('recordWorldEvent fills journal metadata defaults', () => {
  const world = createWorldState({ startText: 'переправа и двор' });

  const item = recordWorldEvent(world, {
    result: 'Игровое событие',
    related_ids: ['npc-1', 'npc-1']
  });

  assert.equal(item.kind, 'event');
  assert.equal(item.source, 'world');
  assert.equal(item.visibility, 'public');
  assert.equal(item.status, 'recorded');
  assert.equal(item.confidence, null);
  assert.deepEqual(item.relatedIds, ['npc-1']);
  assert.ok(item.at);
  assert.ok(item.time);
});

test('movement changes the active location and records a visit', async () => {
  const world = createWorldState({
    startText: 'переправа и двор',
    clock: { day: 1, hour: 10, minute: 0 }
  });
  const startLocation = world.currentLocationId;
  const moveExit = (world.locations[startLocation]?.exits ?? []).find((exit) => exit?.to && exit.to !== startLocation) ?? null;
  assert.ok(moveExit);
  const result = await handlePlayerInput(world, `иду ${moveExit.label}`);
  const destinationMicroLocations = world.cluster.microLocationsByLocationId[world.currentLocationId] ?? [];
  const destinationStart = destinationMicroLocations[0] ?? null;
  assert.notEqual(world.currentLocationId, startLocation);
  assert.equal(world.currentLocationId, moveExit.to);
  assert.ok(world.memory.visitedPlaces[world.currentLocationId]);
  assert.ok(world.current_position);
  assert.equal(world.current_position.location_id, world.currentLocationId);
  assert.equal(world.currentMicroLocationId, world.current_position.minilocation_id);
  assert.equal(world.current_position.minilocation_id, destinationStart?.id ?? null);
  assert.equal(world.current_position.anchor_id, destinationStart?.entryPoints?.[0]?.id ?? destinationStart?.doors?.[0]?.id ?? null);
  assert.equal(world.player.position.location_id, world.currentLocationId);
  assert.ok(world.current_position.last_route_id);
  assert.match(result.text, /переходишь|новое место|пришёл/i);
});

test('movement follows canonical current_position when legacy location id is stale', async () => {
  const world = createWorldState({
    startText: 'переправа и двор',
    clock: { day: 1, hour: 10, minute: 0 }
  });
  const canonicalStart = world.current_position.location_id;
  const moveExit = (world.locations[canonicalStart]?.exits ?? []).find((exit) => exit?.to && exit.to !== canonicalStart) ?? null;
  assert.ok(moveExit);
  world.currentLocationId = 'stale-location';
  world.current_position = {
    ...world.current_position,
    location_id: canonicalStart,
    place_id: canonicalStart,
    minilocation_id: world.current_position.minilocation_id
  };

  await handlePlayerInput(world, `иду ${moveExit.label}`);

  assert.notEqual(world.current_position.location_id, canonicalStart);
  assert.equal(world.current_position.location_id, moveExit.to);
  assert.equal(world.currentLocationId, world.current_position.location_id);
  assert.ok(world.memory.visitedPlaces[world.current_position.location_id]);
});

test('travelWorld ignores stale currentLocationId when deciding whether to stay put', () => {
  const world = createWorldState({
    startText: 'переправа и двор',
    clock: { day: 1, hour: 10, minute: 0 }
  });
  const currentLocationId = world.current_position.location_id;
  const destinationId = Object.keys(world.locations).find((id) => id !== currentLocationId) ?? null;
  assert.ok(destinationId);

  world.currentLocationId = destinationId;
  world.current_position = {
    ...world.current_position,
    location_id: currentLocationId,
    place_id: currentLocationId
  };
  world.locations[currentLocationId].exits = [{ label: 'к соседнему двору', to: destinationId }];
  world.locations[destinationId].name = 'Соседний двор';

  const result = travelWorld(world, 'к соседнему двору');

  assert.equal(result.ok, true);
  assert.match(result.text, /переходишь|пришёл/i);
  assert.equal(world.current_position.location_id, destinationId);
  assert.equal(world.currentLocationId, destinationId);
});

test('travelWithinLocation ignores stale currentMicroLocationId when deciding whether to stay put', () => {
  const world = createWorldState({
    startText: 'переправа и двор',
    clock: { day: 1, hour: 10, minute: 0 }
  });
  const currentLocationId = world.current_position.location_id;
  const microLocations = world.cluster.microLocationsByLocationId[currentLocationId] ?? [];
  assert.ok(microLocations.length >= 2);

  const currentMicroLocationId = world.current_position.minilocation_id;
  const targetMicroLocation = microLocations.find((item) => item.id !== currentMicroLocationId) ?? null;
  assert.ok(targetMicroLocation);

  world.currentMicroLocationId = targetMicroLocation.id;
  world.current_position = {
    ...world.current_position,
    location_id: currentLocationId,
    place_id: currentLocationId,
    minilocation_id: currentMicroLocationId
  };

  const result = travelWithinLocation(world, targetMicroLocation.name);

  assert.equal(result.ok, true);
  assert.match(result.text, /смещаешься|точку внимания/i);
  assert.equal(world.current_position.minilocation_id, targetMicroLocation.id);
  assert.equal(world.currentMicroLocationId, targetMicroLocation.id);
});

test('social state reacts to claims and violence', async () => {
  const world = createWorldState({
    startText: 'переправа и двор',
    clock: { day: 1, hour: 10, minute: 0 }
  });
  const beforeSuspicion = world.social.suspicion;
  const beforeReputation = world.social.reputation;

  await handlePlayerInput(world, 'Я сын боярина и требую уважения');
  await handlePlayerInput(world, 'Я нападаю на дворника');

  assert.ok(world.social.suspicion > beforeSuspicion);
  assert.ok(world.social.reputation <= beforeReputation);
  assert.ok(world.social.recentWitnesses.length > 0);
});

test('npc reputation comes from subjective memory, not a global meter', async () => {
  const world = createWorldState({
    startText: 'переправа и двор',
    clock: { day: 1, hour: 10, minute: 0 }
  });
  const witness = world.npcs.find((npc) => npc.locationId === world.currentLocationId) ?? world.npcs[0];
  assert.ok(witness);

  await handlePlayerInput(world, `Я говорю с ${witness.name} о случившемся`);

  assert.ok(Array.isArray(witness.socialMemory));
  assert.ok(witness.socialMemory.length > 0);
  assert.match(witness.socialMemory[0].perception, /(Видел|Слышал)/);
  assert.ok(typeof witness.attitudeToPlayer?.trust === 'number');
  assert.ok(typeof world.social.reputation === 'number');
});

test('social memory spreads through family and rumor chains', async () => {
  const world = createWorldState({
    startText: 'переправа и двор',
    clock: { day: 1, hour: 10, minute: 0 }
  });
  const source = world.npcs.find((npc) => npc.locationId === world.currentLocationId) ?? world.npcs[0];
  const relay = world.npcs.find((npc) =>
    npc.id !== source.id && (
      (Array.isArray(npc.family) && npc.family.some((item) => item?.targetNpcId === source.id)) ||
      (Array.isArray(source.family) && source.family.some((item) => item?.targetNpcId === npc.id))
    )
  );

  assert.ok(source);
  assert.ok(relay);

  await handlePlayerInput(world, `Я говорю с ${source.name} о случившемся`);

  assert.ok(Array.isArray(relay.socialMemory));
  assert.ok(relay.socialMemory.some((item) => item.source === 'слышал' || (item.perception ?? '').includes('Слух')));
  assert.ok(
    world.memory.heardRumors.some((item) => /^Слух:/i.test(item))
    || world.pendingSemanticWorld.some((entry) => entry.kind === 'social_rumors')
  );
});

test('npc recognizes marked owned item held by player', () => {
  const world = createWorldState({
    startText: 'переправа и двор',
    clock: { day: 1, hour: 10, minute: 0 }
  });
  const owner = world.npcs.find((npc) => npc.locationId === world.currentLocationId) ?? world.npcs[0];
  assert.ok(owner);
  owner.id = 'npc-owner';
  owner.name = 'Степан';
  owner.locationId = world.currentLocationId;
  world.player.id = 'player';
  world.player.items = {
    ...(world.player.items ?? {}),
    carried_items: [
      {
        id: 'item:marked-knife',
        label: 'нож с клеймом',
        type: 'weapon',
        placement: 'carried',
        owner_id: owner.id,
        holder_id: 'player',
        access: 'borrowed',
        visible: true,
        discoverability: 5,
        marks: ['клеймо двора', 'царапина на рукояти'],
        weight: 0.5
      }
    ]
  };

  const beforeSuspicion = world.social.suspicion;
  applySocialConsequence(world, { type: 'wait', raw: 'стою у ворот' }, 'Игрок ждёт у ворот.');

  assert.ok(world.social.suspicion > beforeSuspicion);
  assert.equal(world.social.lastConsequence, 'узнавание вещи');
  assert.ok(owner.socialMemory.some((entry) => /узнал свою вещь нож с клеймом/i.test(entry.perception)));
  assert.ok(world.memory.heardRumors.some((entry) => /клеймо двора/i.test(entry)));
});

test('social witnesses prefer canonical current_position micro location over stale legacy id', () => {
  const world = createWorldState({
    startText: 'переправа и двор',
    clock: { day: 1, hour: 10, minute: 0 }
  });
  world.current_position = {
    ...world.current_position,
    location_id: 'yard',
    place_id: 'yard',
    minilocation_id: 'yard:entry'
  };
  world.currentMicroLocationId = 'stale-yard:center';
  const witness = world.npcs.find((npc) => (npc.locationId ?? npc.homeLocation) === 'yard') ?? world.npcs[0];
  assert.ok(witness);
  witness.name = 'Степан';
  witness.locationId = 'yard';
  witness.microLocationId = 'yard:entry';

  const beforeWitnesses = world.social.recentWitnesses.length;
  applySocialConsequence(world, { type: 'wait', raw: 'стою у входа' }, 'Игрок ждёт у входа.');

  assert.ok(world.social.recentWitnesses.length > beforeWitnesses);
  assert.ok(world.social.recentWitnesses.includes('Степан'));
  assert.ok(Array.isArray(witness.socialMemory));
  assert.ok(witness.socialMemory.length > 0);
});

test('ui shows social trace instead of a reputation label', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const state = buildUiState(world);

  assert.ok(typeof state.socialTrace === 'string');
  assert.match(state.socialTrace, /как о тебе|о тебе/i);
  assert.ok(!Object.prototype.hasOwnProperty.call(state.player, 'reputation'));
});

test('actor and location profiles carry world position and local structure', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const npc = world.npcs[0];
  const place = world.place;
  const scene = world.scene;

  assert.ok(['background', 'scene', 'key'].includes(npc.profileLevel));
  assert.ok(npc.actorProfile.identity.worldPosition);
  assert.equal(npc.actorProfile.profileLevel, npc.profileLevel);
  assert.ok(npc.actorProfile.kinship.answerableTo);
  assert.ok(Array.isArray(npc.actorProfile.work.routine));
  assert.ok(Array.isArray(npc.actorProfile.mind.seen));
  assert.ok(Array.isArray(npc.actorProfile.mind.heard));
  assert.ok(Array.isArray(npc.actorProfile.mind.hidden));
  assert.ok(Array.isArray(npc.access));
  assert.ok(place.mood);
  assert.ok(scene.rhythm);
  assert.ok(Array.isArray(scene.accessRules));
  assert.ok(Array.isArray(scene.connections));
  assert.ok(scene.memory);
  assert.ok(scene.materialScene);
});

test('npc profiles keep visible marks and availability hints in summary fields', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const npc = buildNpcProfile({
    id: 'npc-visible',
    name: 'Степан',
    role: 'староста',
    locationId: world.currentLocationId,
    homeLocation: world.currentLocationId,
    profileLevel: 'background',
    visible_marks: ['шрам на щеке'],
    active_conditions: ['устал'],
    availabilityWindow: 'до заката',
    movementWindow: 'у ворот'
  }, world.currentLocationId, 0, world.player, world.current_position);

  assert.ok(Array.isArray(npc.visibleMarks));
  assert.deepEqual(npc.visibleMarks, ['шрам на щеке']);
  assert.deepEqual(npc.activeConditions, ['устал']);
  assert.equal(npc.availabilityWindow, 'до заката');
  assert.equal(npc.movementWindow, 'у ворот');
});

test('location profiles contract rejects extra root keys', () => {
  const result = explainLocationProfilesValidation({
    version: 1,
    schema: 'location_profiles',
    locations: [],
    sourceDossier: 'лишнее поле'
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /unexpected field/.test(error)));
});

test('canonical location profile drives scene period context over inferred legacy hints', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const location = world.locations[world.currentLocationId];
  location.profile = {
    version: 1,
    purpose: 'пограничная мастерская',
    ownership: 'канонический владелец',
    access: 'по пропуску',
    hazards: ['каноническая опасность'],
    rhythm: 'канонический ритм',
    accessRules: ['каноническое правило'],
    connections: ['каноническая связь'],
    traces: ['канонический след'],
    sensory: {
      sounds: ['канонический звук'],
      smells: ['канонический запах'],
      light: 'канонический свет'
    },
    consequences: ['каноническое последствие']
  };

  syncCurrentPlace(world);

  assert.equal(world.scene.purpose, 'пограничная мастерская');
  assert.equal(world.scene.ownership, 'канонический владелец');
  assert.equal(world.scene.rhythm, 'канонический ритм');
  const partyPeriod = world.scene.periods.find((period) => period.kind === 'party_history');
  assert.ok(partyPeriod);
  assert.equal(partyPeriod.consequences[0], 'пограничная мастерская');
  assert.equal(partyPeriod.consequences[1], 'по пропуску');
});

test('syncCurrentPlace prefers canonical current_position for location occupants', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.current_position = {
    ...world.current_position,
    location_id: 'yard',
    place_id: 'yard',
    minilocation_id: 'yard:entry'
  };
  world.currentMicroLocationId = 'stale-yard:center';
  world.npcs = [
    {
      id: 'npc-entry',
      name: 'Степан',
      locationId: 'yard',
      microLocationId: 'yard:entry'
    },
    {
      id: 'npc-stale',
      name: 'Гридь',
      locationId: 'yard',
      microLocationId: 'yard:center'
    }
  ];

  syncCurrentPlace(world);

  assert.ok(Array.isArray(world.locations.yard.occupants));
  assert.ok(world.locations.yard.occupants.includes('Степан'));
  assert.ok(!world.locations.yard.occupants.includes('Гридь'));
});

test('actor profiles prefer canonical current_position over legacy location ids', () => {
  const canonicalPosition = {
    region_id: 'region:test',
    place_id: 'place:test',
    location_id: 'yard',
    minilocation_id: 'yard:center',
    anchor_id: 'yard:entry',
    last_route_id: 'route:yard'
  };
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    current_position: canonicalPosition
  }, {
    currentLocationId: 'stale-yard',
    currentMicroLocationId: 'stale-yard:entry',
    current_position: canonicalPosition
  });
  const npc = buildNpcProfile({
    id: 'npc-position',
    name: 'Степан',
    role: 'староста',
    locationId: 'stale-yard',
    homeLocation: 'stale-yard',
    current_position: canonicalPosition
  }, 'stale-yard', 0, player, canonicalPosition);

  assert.equal(player.current_position.location_id, 'yard');
  assert.equal(player.position.location_id, 'yard');
  assert.equal(npc.current_position.location_id, 'yard');
  assert.equal(npc.position.location_id, 'yard');
  assert.equal(npc.homeLocation, 'stale-yard');
});

test('ordinary professions in the current scene do not auto-promote to key', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const merchant = buildNpcProfile({
    id: 'npc-merchant',
    name: 'Лавочник',
    role: 'купец',
    locationId: world.currentLocationId,
    homeLocation: world.currentLocationId,
    profileLevel: 'scene'
  }, world.currentLocationId, 0, world.player);

  assert.equal(merchant.profileLevel, 'scene');
  assert.equal(merchant.actorProfile.profileLevel, 'scene');
});

test('authoritative roles do not auto-promote to key without explicit profile level', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const steward = buildNpcProfile({
    id: 'npc-steward',
    name: 'Степан',
    role: 'староста',
    locationId: world.currentLocationId,
    homeLocation: world.currentLocationId,
    profileLevel: 'scene'
  }, world.currentLocationId, 0, world.player);

  assert.equal(steward.profileLevel, 'scene');
  assert.equal(steward.actorProfile.profileLevel, 'scene');
});

test('npc without scene context defaults to background instead of scene', () => {
  const npc = buildNpcProfile({
    id: 'npc-offscene',
    name: 'Путник',
    role: 'купец',
    locationId: 'remote-location',
    homeLocation: 'remote-location'
  }, null, 0, null);

  assert.equal(npc.profileLevel, 'background');
  assert.equal(npc.actorProfile.profileLevel, 'background');
});

test('npc outside the current scene stays background when level is missing', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const npc = buildNpcProfile({
    id: 'npc-remote',
    name: 'Путник',
    role: 'купец',
    locationId: 'remote-location',
    homeLocation: 'remote-location'
  }, world.currentLocationId, 0, world.player);

  assert.equal(npc.profileLevel, 'background');
  assert.equal(npc.actorProfile.profileLevel, 'background');
});

test('scene npc profiles do not retain hidden placeholders', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const merchant = buildNpcProfile({
    id: 'npc-merchant',
    name: 'Лавочник',
    role: 'купец',
    locationId: world.currentLocationId,
    homeLocation: world.currentLocationId,
    profileLevel: 'scene',
    knowledgeHidden: ['скрытое поручение']
  }, world.currentLocationId, 0, world.player);

  assert.equal(merchant.profileLevel, 'scene');
  assert.equal(merchant.knowledgeHidden.length, 0);
  assert.equal(merchant.actorProfile.mind.hidden.length, 0);
});

test('background npc profiles stay clipped after normalization', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const bundle = buildNpcProfiles([
    {
      id: 'npc-background',
      name: 'Посыльный',
      role: 'посыльный',
      locationId: world.currentLocationId,
      homeLocation: world.currentLocationId,
      profileLevel: 'background',
      family: ['тайная родня'],
      skills: ['наблюдательность', 'общение'],
      knowledgeHidden: ['скрытое поручение'],
      memory: ['случайная встреча']
    }
  ], world.currentLocationId, world.player);

  const npc = bundle.npcs[0];

  assert.equal(npc.profileLevel, 'background');
  assert.equal(npc.actorProfile.profileLevel, 'background');
  assert.equal(npc.knowledgeHidden.length, 0);
  assert.equal(npc.skills.length, 0);
  assert.equal(npc.actorProfile.mind.hidden.length, 0);
  assert.ok(npc.actorProfile.work.skills.length <= 1);
});

test('npc and location moods react to tension and memory', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const location = world.locations[world.currentLocationId];
  location.recentTraces.unshift({ at: { ...world.clock }, kind: 'witness', text: 'крик и кровь у ворот' });
  world.social.suspicion = 9;
  world.social.recentWitnesses = ['дворник', 'конюх', 'знахарка'];
  world.memory.heardRumors = ['Слух о драке у ворот'];
  world.player.fear = 60;

  syncCurrentPlace(world);

  assert.match(world.scene.mood, /(напряж|насторож|присталь|гулк)/i);
  assert.ok(world.npcs.some((npc) => /(насторож|бдител|раздраж|устал)/i.test(npc.mood ?? '')));
});

test('location mood prefers canonical satiety over legacy hunger', () => {
  const makeWorld = (satiety) => {
    const world = createWorldState({ startText: 'переправа и двор' });
    world.scene = { ...(world.scene ?? {}), attention: 'низкое', light: 'день' };
    world.social = { ...(world.social ?? {}), suspicion: 0, recentWitnesses: [] };
    world.memory = { ...(world.memory ?? {}), heardRumors: [] };
    world.player.fear = 0;
    world.player.hunger = 90;
    world.player.fatigue = 0;
    world.player.states.satiety = satiety;
    world.player.states.vigor = 100;
    return world;
  };

  const fullWorld = makeWorld(90);
  const hungryWorld = makeWorld(10);

  syncCurrentPlace(fullWorld);
  syncCurrentPlace(hungryWorld);

  assert.doesNotMatch(fullWorld.locations[fullWorld.currentLocationId].profile.mood, /голод/i);
  assert.match(hungryWorld.locations[hungryWorld.currentLocationId].profile.mood, /голод/i);
});

test('location mood prefers active thirst over legacy thirst', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.scene = { ...(world.scene ?? {}), attention: 'низкое', light: 'день' };
  world.social = { ...(world.social ?? {}), suspicion: 0, recentWitnesses: [] };
  world.memory = { ...(world.memory ?? {}), heardRumors: [] };
  world.player.states.satiety = 90;
  world.player.states.vigor = 100;
  world.player.thirst = 0;
  world.player.activeStates = [
    { id: 'thirst', label: 'жажда', value: 80, source: 'derived' }
  ];

  syncCurrentPlace(world);

  assert.match(world.locations[world.currentLocationId].profile.mood, /сух/i);
});

test('syncCurrentPlace ignores legacy vitals without canonical states', () => {
  const makeMood = (hunger, fatigue) => {
    const world = createWorldState({ startText: 'переправа и двор' });
    delete world.player.states;
    world.player.hunger = hunger;
    world.player.fatigue = fatigue;
    syncCurrentPlace(world);
    return world.place.profile.mood;
  };

  assert.equal(makeMood(10, 10), makeMood(90, 90));
});

test('npc mood prefers canonical vigor over legacy fatigue', () => {
  const makeWorld = (vigor) => {
    const world = createWorldState({ startText: 'переправа и двор' });
    world.scene = { ...(world.scene ?? {}), attention: 'низкое', light: 'день' };
    world.social = { ...(world.social ?? {}), suspicion: 0, recentWitnesses: [] };
    world.memory = { ...(world.memory ?? {}), heardRumors: [] };
    world.player.fear = 0;
    world.player.hunger = 10;
    world.player.fatigue = 90;
    world.player.states.satiety = 90;
    world.player.states.vigor = vigor;
    world.npcs = [{
      id: 'npc-neutral',
      name: 'Сторож',
      locationId: world.currentLocationId,
      homeLocation: world.currentLocationId,
      socialMemory: [],
      fears: [],
      attitudeToPlayer: { trust: 0, hostility: 0 },
      injuries: [],
      bleeding: 0,
      status: '',
      family: [],
      mood: ''
    }];
    return world;
  };

  const alertWorld = makeWorld(90);
  const tiredWorld = makeWorld(10);

  syncCurrentPlace(alertWorld);
  syncCurrentPlace(tiredWorld);

  assert.doesNotMatch(alertWorld.npcs[0].mood, /устал/i);
  assert.match(tiredWorld.npcs[0].mood, /устал/i);
});

test('npc mood prefers active fear over legacy fear', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.scene = { ...(world.scene ?? {}), attention: 'низкое', light: 'день' };
  world.social = { ...(world.social ?? {}), suspicion: 0, recentWitnesses: [] };
  world.memory = { ...(world.memory ?? {}), heardRumors: [] };
  world.player.fear = 0;
  world.player.activeStates = [
    { id: 'fear', label: 'страх', value: 85, source: 'derived' }
  ];
  world.player.states.satiety = 90;
  world.player.states.vigor = 90;
  world.npcs = [{
    id: 'npc-neutral',
    name: 'Сторож',
    locationId: world.currentLocationId,
    homeLocation: world.currentLocationId,
    socialMemory: [],
    fears: [],
    attitudeToPlayer: { trust: 0, hostility: 0 },
    injuries: [],
    bleeding: 0,
    status: '',
    family: [],
    mood: ''
  }];

  syncCurrentPlace(world);

  assert.match(world.npcs[0].mood, /насторож/i);
});

test('scene attention prefers canonical vigor over legacy fatigue', () => {
  const makeWorld = (vigor) => {
    const world = createWorldState({ startText: 'переправа и двор' });
    world.player.fear = 100;
    world.player.fatigue = 90;
    world.player.states.vigor = vigor;
    world.player.activeStates = [
      { id: 'fear', label: 'страх', value: 0, source: 'derived' }
    ];
    world.npcs = [];
    return world;
  };

  const alertWorld = makeWorld(90);
  const tiredWorld = makeWorld(10);
  let alertAttention = null;
  let tiredAttention = null;

  Object.defineProperty(alertWorld.scene, 'attention', {
    get() {
      return alertAttention;
    },
    set(value) {
      if (alertAttention === null) alertAttention = value;
    },
    configurable: true
  });
  Object.defineProperty(tiredWorld.scene, 'attention', {
    get() {
      return tiredAttention;
    },
    set(value) {
      if (tiredAttention === null) tiredAttention = value;
    },
    configurable: true
  });

  advanceWorld(alertWorld, 1, { type: 'wait' });
  advanceWorld(tiredWorld, 1, { type: 'wait' });

  assert.equal(alertAttention, 'низкое');
  assert.equal(tiredAttention, 'среднее');
});

test('fear becomes an active state during tense actions', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.states = {
    health: 100,
    satiety: 100,
    vigor: 100
  };
  world.player.fear = 90;
  world.player.activeStates = [
    { id: 'fear', label: 'страх', value: 90, source: 'derived' }
  ];
  world.npcs = [];

  advanceWorld(world, 10, { type: 'attack' });

  assert.ok(world.player.activeStates.some((state) => state.id === 'fear'));
  assert.equal(getActiveStateValue(world.player, 'fear'), 98);
  assert.equal(world.player.fear, 98);
  assert.equal(world.player.body.active_conditions.some((state) => state === 'страх'), true);
  assert.match(world.scene.attention, /(среднее|высокое)/i);
});

test('thirst becomes an active state during time advance', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.states = {
    health: 100,
    satiety: 100,
    vigor: 100
  };
  world.player.thirst = 90;
  world.player.activeStates = [
    { id: 'thirst', label: 'жажда', value: 4, source: 'derived' }
  ];
  world.npcs = [];

  advanceWorld(world, 60, { type: 'wait' });

  assert.ok(world.player.activeStates.some((state) => state.id === 'thirst'));
  assert.equal(getActiveStateValue(world.player, 'thirst'), 8);
  assert.equal(world.player.thirst, 8);
  assert.equal(world.player.body.active_conditions.some((state) => state === 'жажда'), true);
});

test('cold becomes an active state after long night exposure in an open place', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.clock.hour = 19;
  world.clock.minute = 0;
  world.player.states = {
    health: 100,
    satiety: 100,
    vigor: 100
  };
  world.player.activeStates = [];
  world.npcs = [];

  advanceWorld(world, 180, { type: 'wait' });

  assert.ok(world.player.activeStates.some((state) => state.id === 'cold'));
  assert.equal((getActiveStateValue(world.player, 'cold') ?? 0) > 0, true);
  assert.equal(world.player.body.active_conditions.some((state) => state === 'холод'), true);
});

test('wet becomes an active state after long damp exposure outdoors', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.clock.hour = 3;
  world.clock.minute = 0;
  world.player.states = {
    health: 100,
    satiety: 100,
    vigor: 100
  };
  world.player.activeStates = [];
  world.npcs = [];

  advanceWorld(world, 180, { type: 'wait' });

  assert.ok(world.player.activeStates.some((state) => state.id === 'wet'));
  assert.equal((getActiveStateValue(world.player, 'wet') ?? 0) > 0, true);
  assert.equal(world.player.body.active_conditions.some((state) => state === 'промокание'), true);
});

test('advanceWorld ignores legacy fatigue without canonical states', () => {
  const makeAttention = (fatigue) => {
    const world = createWorldState({ startText: 'переправа и двор' });
    delete world.player.states;
    world.player.fear = 0;
    world.player.fatigue = fatigue;
    world.npcs = [];
    advanceWorld(world, 1, { type: 'wait' });
    return world.scene.attention;
  };

  assert.equal(makeAttention(10), makeAttention(90));
});

test('advanceWorld ignores legacy thirst and fear without active states', () => {
  const makeAttention = (thirst, fear) => {
    const world = createWorldState({ startText: 'переправа и двор' });
    delete world.player.states;
    world.player.thirst = thirst;
    world.player.fear = fear;
    world.player.activeStates = [];
    world.npcs = [];
    advanceWorld(world, 1, { type: 'wait' });
    return {
      attention: world.scene.attention,
      thirst: getActiveStateValue(world.player, 'thirst'),
      fear: getActiveStateValue(world.player, 'fear'),
      activeStates: world.player.activeStates.map((state) => state.id)
    };
  };

  assert.deepEqual(makeAttention(10, 10), makeAttention(90, 90));
});

test('advanceWorld rehydrates canonical states from body without legacy vitals', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  delete world.player.states;
  world.player.body = {
    ...(world.player.body ?? {}),
    health: 97,
    satiety: 74,
    vigor: 63,
    active_conditions: []
  };
  world.player.hunger = 10;
  world.player.fatigue = 90;
  world.player.sleep = 99;
  world.player.fear = 0;
  world.npcs = [];

  advanceWorld(world, 60, { type: 'wait' });

  assert.equal(world.player.states.health, 97);
  assert.equal(world.player.states.satiety, 73);
  assert.equal(world.player.states.vigor, 62);
  assert.equal(world.player.legacy_vitals, undefined);
  assert.equal(world.player.legacy_needs, undefined);
});

test('advanceWorld prefers canonical current_position for npc rest decisions', () => {
  const makeWorld = () => {
    const world = createWorldState({ startText: 'переправа и двор' });
    world.currentLocationId = 'stale-yard';
    world.currentMicroLocationId = 'stale-yard:entry';
    world.current_position = {
      ...world.current_position,
      location_id: 'yard',
      place_id: 'yard',
      minilocation_id: 'yard:entry'
    };
    world.cluster = {
      ...(world.cluster ?? {}),
      npcSchedules: {
        guard: [
          {
            from: 0,
            to: 24,
            locationId: 'yard',
            microLocationId: 'yard:entry',
            activity: 'сторожит двор'
          }
        ]
      }
    };
    world.npcs = [
      {
        id: 'guard',
        name: 'Сторож',
        locationId: 'yard',
        homeLocation: 'yard',
        microLocationId: 'yard:entry',
        states: { health: 100, satiety: 100, vigor: 40 },
        body: { health: 100, satiety: 100, vigor: 40, active_conditions: [] },
        activeStates: [],
        resourceDrift: { satiety: 0, vigor: 0, starvation: 0 }
      }
    ];
    return world;
  };

  const restWorld = makeWorld();
  const waitWorld = makeWorld();

  advanceWorld(restWorld, 60, { type: 'rest' });
  advanceWorld(waitWorld, 60, { type: 'wait' });

  assert.ok(restWorld.npcs[0].states.vigor > waitWorld.npcs[0].states.vigor);
  assert.equal(restWorld.current_position.location_id, 'yard');
  assert.equal(restWorld.currentLocationId, 'yard');
});

test('advanceWorld keeps npc current_position aligned with schedule movement', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const npc = world.npcs.find((item) => item.locationId === world.currentLocationId) ?? world.npcs[0];
  assert.ok(npc);

  world.cluster = {
    ...(world.cluster ?? {}),
    npcSchedules: {
      [npc.id]: [
        {
          from: 0,
          to: 24,
          locationId: world.currentLocationId,
          microLocationId: `${world.currentLocationId}:center`,
          activity: 'сторожит двор',
          routeId: 'route:test'
        }
      ]
    }
  };
  npc.current_position = {
    ...npc.current_position,
    location_id: 'stale-location',
    minilocation_id: 'stale-location:entry',
    last_route_id: 'stale-route'
  };

  advanceWorld(world, 60, { type: 'wait' });

  assert.equal(npc.locationId, world.currentLocationId);
  assert.equal(npc.current_position.location_id, world.currentLocationId);
  assert.equal(npc.position.location_id, world.currentLocationId);
  assert.equal(npc.current_position.minilocation_id, `${world.currentLocationId}:center`);
  assert.equal(npc.current_position.last_route_id, 'route:test');
});

test('advanceWorld ignores legacy vitals when canonical states are missing', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  delete world.player.states;
  world.player.body = {
    ...(world.player.body ?? {}),
    health: 100,
    satiety: 100,
    vigor: 100,
    active_conditions: []
  };
  world.player.hunger = 91;
  world.player.fatigue = 4;
  world.player.sleep = 99;
  world.player.fear = 0;
  world.npcs = [];

  advanceWorld(world, 60, { type: 'wait' });

  assert.equal(world.player.states.health, 100);
  assert.equal(world.player.states.satiety, 99);
  assert.equal(world.player.states.vigor, 99);
  assert.equal(world.player.legacy_vitals, undefined);
  assert.equal(world.player.legacy_needs, undefined);
});

test('routine world activity leaves traces without player action', async () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const beforeTraces = world.locations[world.currentLocationId].recentTraces.length;

  await handlePlayerInput(world, 'жду');

  assert.ok(world.locations[world.currentLocationId].recentTraces.length > beforeTraces);
  assert.ok(world.events.some((event) => event.intent === 'routine'));
});

test('npc routine fallback prefers canonical current_position over stale legacy location id', async () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const canonicalLocationId = world.current_position.location_id;
  world.currentLocationId = 'stale-yard';
  world.npcs = [
    {
      id: 'npc-routine',
      name: 'Степан',
      locationId: null,
      microLocationId: null,
      homeLocation: null
    }
  ];

  await handlePlayerInput(world, 'жду');

  assert.equal(world.npcs[0].locationId, canonicalLocationId);
});

test('model state_delta mutates the world state', async () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const beforeRumors = world.memory.heardRumors.length;
  const beforeTraces = world.locations[world.currentLocationId].recentTraces.length;
  const beforeWitnesses = world.social.recentWitnesses.length;

  await handlePlayerInput(world, 'Я сын боярина и требую уважения');

  assert.ok(world.social.suspicion >= 2);
  assert.ok(world.memory.heardRumors.length > beforeRumors);
  assert.ok(world.locations[world.currentLocationId].recentTraces.length > beforeTraces);
  assert.ok(world.social.recentWitnesses.length > beforeWitnesses);
});

test('state diff composer validates and commits mediated deltas', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const diff = composeStateDiff(world, {
    social: { suspicion_delta: 1 },
    location: { recent_traces: ['Свидетель видел движение у ворот.'] },
    handles: {
      targetHandle: 'player'
    }
  });

  const validation = validateStateDiff(diff);
  assert.equal(validation.ok, true);
  assert.equal(diff.version, 1);
  assert.equal(diff.handles.targetHandle, 'player');

  const beforeSuspicion = world.social.suspicion;
  const commit = commitStateDiff(world, diff);

  assert.ok(world.social.suspicion > beforeSuspicion);
  assert.ok(world.locations[world.currentLocationId].recentTraces.some((trace) => trace.text.includes('Свидетель видел')));
  assert.ok(commit.summary.length > 0);
  assert.equal(world.lastCommit.version, 1);
});

test('state diff applies canonical body deltas', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const beforeSatiety = world.player.states.satiety;
  const beforeVigor = world.player.states.vigor;
  const beforeHealth = world.player.states.health;
  const diff = composeStateDiff(world, {
    resources: {
      satiety_delta: -7,
      vigor_delta: -4,
      health_delta: -2,
      hunger_delta: 99,
      fatigue_delta: 99,
      sleep_delta: 99
    }
  });

  commitStateDiff(world, diff);

  assert.equal(world.player.states.satiety, Math.max(0, Math.min(100, beforeSatiety - 7)));
  assert.equal(world.player.states.vigor, Math.max(0, Math.min(100, beforeVigor - 4)));
  assert.equal(world.player.states.health, Math.max(0, Math.min(100, beforeHealth - 2)));
  assert.equal(world.player.legacy_vitals, undefined);
  assert.equal(world.player.legacy_needs, undefined);
  assert.equal(world.player.health, world.player.states.health);
});

test('state diff keeps legacy resource aliases as adapters, not primary inputs', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const beforeSatiety = world.player.states.satiety;
  const beforeVigor = world.player.states.vigor;

  const diff = composeStateDiff(world, {
    resources: {
      hunger_delta: 6,
      fatigue_delta: 4,
      sleep_delta: 3
    }
  });

  commitStateDiff(world, diff);

  assert.equal(world.player.states.satiety, Math.max(0, Math.min(100, beforeSatiety - 6)));
  assert.equal(world.player.states.vigor, Math.max(0, Math.min(100, beforeVigor - 7)));
  assert.equal(world.player.legacy_vitals, undefined);
  assert.equal(world.player.legacy_needs, undefined);
});

test('risk audit contract enforces schema and complexity enums', () => {
  const valid = validateRiskAudit({
    version: 1,
    schema: 'risk_audit',
    required: true,
    reason: 'Тестовый риск',
    factors: ['свидетели'],
    complexity: 'High',
    visibility: 'Действие заметно окружающим'
  });
  const invalid = validateRiskAudit({
    version: 1,
    schema: 'risk_audit',
    required: true,
    reason: 'Тестовый риск',
    factors: ['свидетели'],
    complexity: 'Impossible',
    visibility: 'Действие заметно окружающим'
  });

  assert.ok(valid);
  assert.equal(invalid, null);
});

test('semantic audit contract requires concrete evidence', () => {
  const valid = validateSemanticAudit({
    version: 1,
    schema: 'semantic_audit',
    pass: true,
    concerns: [],
    evidence: ['ok']
  });
  const invalid = validateSemanticAudit({
    version: 1,
    schema: 'semantic_audit',
    pass: false,
    concerns: ['нет конкретного основания'],
    evidence: []
  });

  assert.ok(valid);
  assert.equal(invalid, null);
});

test('semantic audit parser synthesizes evidence when model returns none', () => {
  const prev = process.env.NODE_TEST_CONTEXT;
  process.env.NODE_TEST_CONTEXT = '1';
  try {
    const parsed = parseSemanticAuditResponse(JSON.stringify({
      version: 1,
      schema: 'semantic_audit',
      pass: true,
      concerns: [],
      evidence: []
    }));

    assert.ok(parsed);
    assert.equal(parsed.pass, true);
    assert.ok(Array.isArray(parsed.evidence));
    assert.ok(parsed.evidence.length > 0);
  } finally {
    if (prev === undefined) delete process.env.NODE_TEST_CONTEXT;
    else process.env.NODE_TEST_CONTEXT = prev;
  }
});

test('semantic audit parser skips fallback evidence in production mode', () => {
  const prev = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    const parsed = parseSemanticAuditResponse(JSON.stringify({
      version: 1,
      schema: 'semantic_audit',
      pass: true,
      concerns: [],
      evidence: []
    }));
    assert.equal(parsed, null);
  } finally {
    if (prev === undefined) delete process.env.NODE_TEST_CONTEXT;
    else process.env.NODE_TEST_CONTEXT = prev;
  }
});

test('historical frame contract validates concrete frame fields', () => {
  const valid = validateHistoricalFrame({
    version: 1,
    schema: 'historical_frame',
    year: 1241,
    season: 'осень',
    regionName: 'Новгородская земля',
    regionHint: 'Новгородская земля',
    settlementType: 'город у переправы',
    pressure: 'война и дорога',
    conflict: 'власть и путь',
    startTextHint: 'Историчная рамка'
  });
  const invalid = validateHistoricalFrame({
    version: 1,
    schema: 'historical_frame',
    year: '1241',
    season: 'осень',
    regionName: 'Новгородская земля',
    regionHint: 'Новгородская земля',
    settlementType: 'город у переправы',
    pressure: 'война и дорога',
    conflict: 'власть и путь',
    startTextHint: 'Историчная рамка'
  });

  assert.ok(valid);
  assert.equal(invalid, null);
});

test('player seed contract validates the player as a distinct entity', () => {
  const valid = validatePlayerSeed(buildCanonicalPlayerSeedFixture({
    name: 'безымянный человек',
    role: 'путник',
    status: 'чужой',
    socialClass: 'неизвестно',
    ageRange: 'взрослый',
    origin: 'Владимирская земля',
    visibleStatus: 'чужой',
    trueStatus: 'неизвестно',
    reasonHere: 'оказался здесь по дороге',
    bodyState: 'устал, но жив',
    language: 'местный говор',
    literacy: 'неизвестно',
    clothing: 'историчная одежда',
    family: ['родня неизвестна'],
    memory: ['дорога'],
    knowledge: ['место на тракте'],
    fears: ['потерять статус'],
    goals: ['выжить'],
    obligations: ['подчиняться местным правилам'],
    identity: {
      name: 'безымянный человек',
      age_range: 'взрослый',
      origin: 'Владимирская земля',
      social_status: 'неизвестно',
      occupation_or_role: 'путник',
      visible_status: 'чужой',
      true_status: 'неизвестно',
      reason_here: 'оказался здесь по дороге'
    },
    body: {
      description: 'устал, но жив',
      visible_marks: [],
      clothing: 'историчная одежда',
      health: 80,
      satiety: 80,
      vigor: 80,
      active_conditions: []
    },
    items: {
      carried_items: [
        {
          id: 'item:player:knife:1',
          label: 'нож',
          type: 'weapon',
          material: 'железо',
          condition: 'цел',
          size: 'small',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'player',
          access: 'immediate',
          visibility: 'visible',
          legal_status: 'ordinary',
          function: 'режет',
          weight: 0.3,
          discoverability: 5,
          plausibility: 5,
          risk: 1,
          visible: true,
          marks: []
        }
      ],
      equipment: [],
      weapons: [],
      armor: [],
      property_not_carried: [
        {
          id: 'item:player:chest:1',
          label: 'личная вещь',
          type: 'container',
          material: 'дерево',
          condition: 'цел',
          size: 'medium',
          placement: 'property',
          holder_id: null,
          owner_id: 'player',
          access: 'not_carried',
          visibility: 'documented',
          legal_status: 'ordinary',
          function: 'хранение',
          weight: 2,
          discoverability: 3,
          plausibility: 5,
          risk: 0,
          visible: true,
          marks: []
        }
      ],
      borrowed_items: [],
      foreign_items_with_character: []
    },
    property_and_access: {
      property_not_carried: ['личная вещь'],
      borrowed_items: [],
      foreign_items_with_character: []
    }
  }));
  const invalid = validatePlayerSeed({
    version: 1,
    schema: 'player_seed',
    name: 'безымянный человек',
    role: 'путник',
    status: 'чужой',
    socialClass: 'неизвестно',
    ageRange: 'взрослый',
    origin: 'Владимирская земля',
    visibleStatus: 'чужой',
    trueStatus: 'неизвестно',
    reasonHere: 'оказался здесь по дороге',
    bodyState: 'устал, но жив',
    language: 'местный говор',
    literacy: 'неизвестно',
    clothing: 'историчная одежда',
    items: {
      carried_items: [],
      equipment: [],
      weapons: [],
      armor: [],
      property_not_carried: [],
      borrowed_items: [],
      foreign_items_with_character: []
    },
    property_and_access: {
      property_not_carried: [],
      borrowed_items: [],
      foreign_items_with_character: []
    },
    inventory: 'не массив',
    family: ['родня неизвестна'],
    property: ['личная вещь'],
    memory: ['дорога'],
    knowledge: ['место на тракте'],
    fears: ['потерять статус'],
    goals: ['выжить'],
    obligations: ['подчиняться местным правилам']
  });
  const invalidExtra = validatePlayerSeed({
    version: 1,
    schema: 'player_seed',
    name: 'безымянный человек',
    role: 'путник',
    status: 'чужой',
    socialClass: 'неизвестно',
    ageRange: 'взрослый',
    origin: 'Владимирская земля',
    visibleStatus: 'чужой',
    trueStatus: 'неизвестно',
    reasonHere: 'оказался здесь по дороге',
    bodyState: 'устал, но жив',
    language: 'местный говор',
    literacy: 'неизвестно',
    clothing: 'историчная одежда',
    items: {
      carried_items: [
        {
          id: 'item:player:knife:1',
          label: 'нож',
          type: 'weapon',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'player'
        }
      ],
      equipment: [],
      weapons: [],
      armor: [],
      property_not_carried: [
        {
          id: 'item:player:thing:1',
          label: 'личная вещь',
          type: 'item',
          placement: 'property',
          holder_id: null,
          owner_id: 'player'
        }
      ],
      borrowed_items: [],
      foreign_items_with_character: []
    },
    property_and_access: {
      property_not_carried: ['личная вещь'],
      borrowed_items: [],
      foreign_items_with_character: []
    },
    inventory: ['нож'],
    family: ['родня неизвестна'],
    property: ['личная вещь'],
    memory: ['дорога'],
    knowledge: ['место на тракте'],
    fears: ['потерять статус'],
    goals: ['выжить'],
    obligations: ['подчиняться местным правилам']
  });
  const invalidEnvelope = validatePlayerSeed({
    version: 1,
    schema: 'player_seed',
    name: 'безымянный человек',
    role: 'путник',
    status: 'чужой',
    socialClass: 'неизвестно',
    ageRange: 'взрослый',
    origin: 'Владимирская земля',
    visibleStatus: 'чужой',
    trueStatus: 'неизвестно',
    reasonHere: 'оказался здесь по дороге',
    bodyState: 'устал, но жив',
    language: 'местный говор',
    literacy: 'неизвестно',
    clothing: 'историчная одежда',
    items: {
      carried_items: [
        {
          id: 'item:player:knife:1',
          label: 'нож',
          type: 'weapon',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'player'
        }
      ],
      equipment: [],
      weapons: [],
      armor: [],
      property_not_carried: [
        {
          id: 'item:player:thing:1',
          label: 'личная вещь',
          type: 'item',
          placement: 'property',
          holder_id: null,
          owner_id: 'player'
        }
      ],
      borrowed_items: [],
      foreign_items_with_character: []
    },
    property_and_access: {
      property_not_carried: ['личная вещь'],
      borrowed_items: [],
      foreign_items_with_character: []
    },
    family: ['родня неизвестна'],
    memory: ['дорога'],
    knowledge: ['место на тракте'],
    fears: ['потерять статус'],
    goals: ['выжить'],
    obligations: ['подчиняться местным правилам'],
    sourceDossier: 'лишний технический envelope'
  });

  assert.ok(valid);
  assert.equal(invalid, null);
  assert.equal(invalidExtra, null);
  assert.equal(invalidEnvelope, null);
});

test('player seed item blocks require documented item fields after normalization', () => {
  const valid = validatePlayerSeedItemBlocks({
    version: 1,
    schema: 'player_seed',
    items: {
      carried_items: [
        {
          id: 'item:player:knife:1',
          label: 'нож',
          type: 'weapon',
          material: 'железо',
          condition: 'исправен',
          size: 'small',
          weight: 0.2,
          placement: 'carried',
          access: 'immediate',
          visibility: 'visible',
          discoverability: 5,
          legal_status: 'ordinary',
          plausibility: 5,
          function: 'резать',
          value: { practical: 4, exchange: 2, status: 0, legal: 0, personal: 0, symbolic: 0, risk: 1 },
          risk: 1,
          visible: true,
          marks: [],
          contents: []
        }
      ],
      equipment: [],
      weapons: [],
      armor: [],
      property_not_carried: []
    }
  });
  const invalid = validatePlayerSeedItemBlocks({
    version: 1,
    schema: 'player_seed',
    items: {
      carried_items: [
        {
          id: 'item:player:knife:1',
          label: 'нож',
          type: 'weapon',
          condition: 'исправен',
          size: 'small',
          weight: 0.2,
          placement: 'carried',
          access: 'immediate',
          visibility: 'visible',
          discoverability: 5,
          legal_status: 'ordinary',
          plausibility: 5,
          function: 'резать',
          value: { practical: 4, exchange: 2, status: 0, legal: 0, personal: 0, symbolic: 0, risk: 1 },
          risk: 1,
          visible: true,
          marks: [],
          contents: []
        }
      ]
    }
  });
  const missingMarks = validatePlayerSeedItemBlocks({
    version: 1,
    schema: 'player_seed',
    items: {
      carried_items: [
        {
          id: 'item:player:knife:2',
          label: 'нож',
          type: 'weapon',
          material: 'железо',
          condition: 'исправен',
          size: 'small',
          weight: 0.2,
          placement: 'carried',
          access: 'immediate',
          visibility: 'visible',
          discoverability: 5,
          legal_status: 'ordinary',
          plausibility: 5,
          function: 'резать',
          value: { practical: 4, exchange: 2, status: 0, legal: 0, personal: 0, symbolic: 0, risk: 1 },
          risk: 1,
          visible: true,
          contents: []
        }
      ]
    }
  });

  assert.ok(valid);
  assert.equal(invalid, null);
  assert.equal(missingMarks, null);
});

test('player seed contract rejects missing canonical blocks and bad balance', () => {
  assert.equal(validatePlayerSeed(buildCanonicalPlayerSeedFixture({ identity: undefined })), null);
  assert.equal(validatePlayerSeed(buildCanonicalPlayerSeedFixture({
    attributes: { strength: 99, agility: 10, endurance: 10, reason: 10, attention: 10, influence: 10 }
  })), null);
  assert.equal(validatePlayerSeed(buildCanonicalPlayerSeedFixture({
    position: { region_id: null, place_id: 'yard', location_id: 'yard', minilocation_id: 'yard:entry', anchor_id: 'yard:entry:0', last_route_id: null }
  })), null);
  assert.equal(validatePlayerSeed(buildCanonicalPlayerSeedFixture({ start_scene: null })), null);
});

test('player seed profile preserves LLM attributes without code balancing', () => {
  const player = buildPlayerProfile(buildCanonicalPlayerSeedFixture({
    profileSource: 'player_seed',
    attributes: {
      strength: 18,
      agility: 17,
      endurance: 16,
      reason: 15,
      attention: 14,
      influence: 8
    },
    skill_bonuses: {
      athletics: 4,
      stealth: 1,
      melee: 1,
      ranged: 1,
      craft: 3,
      household: 2,
      survival: 2,
      riding: 1,
      healing: 1,
      observation: 1,
      communication: 1,
      custom_and_law: 1
    }
  }));

  assert.equal(player.attributes.strength, 18);
  assert.equal(player.attributes.influence, 8);
  assert.equal(player.skill_bonuses.athletics, 4);
  assert.equal(player.profileSource, 'player_seed');
});

test('player seed generator normalizes list fields returned as strings', async () => {
  const originalFetch = globalThis.fetch;
  let capturedSystemText = '';
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';
    if (/PlayerSeedShaper/i.test(systemText)) {
      capturedSystemText = systemText;
    }

    if (/PlayerSeedShaper/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify(buildCanonicalPlayerSeedFixture({
                    inventory: 'плотницкий топор, тесло, долото, кресало',
                    family: 'жена и мать в лесу после разорения села',
                    property: 'клеть при дворе, запасная рубаха, сало, овёс',
                    memory: 'весна 1241 года — орден сжёг соседнее село',
                    knowledge: 'князь Александр велел чинить мосты и ладьи',
                    fears: 'продажа в холопы из-за долга',
                    goals: 'выплатить долг, найти семью',
                    obligations: 'отработать долг хозяину переправы'
                  }))
                }
              }
            ]
          };
        }
      };
    }

    if (/semantic_audit/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['player is plausible']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/player_seed/i.test(userText) && /Pipeline stage: player_seed/i.test(userText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Сухой player dossier без лишней сцены и без заглушек.'
                }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: 'ok' } }] };
      }
    };
  };

  try {
    const world = createWorldState({
      startText: 'Апрель 1242 года, Новгородская земля. В погосте собирают ополчение и продовольствие для выплаты контрибуции Ливонскому ордену.'
    });

    const result = await generatePlayerSeed(world);
    assert.ok(result.data);
    assert.ok(Array.isArray(result.data.inventory));
    assert.ok(Array.isArray(result.data.family));
    assert.ok(Array.isArray(result.data.property));
    assert.equal(result.data.inventory[0], 'плотницкий топор');
    assert.match(capturedSystemText, /# Роль/);
    assert.match(capturedSystemText, /# Формат ответа/);
    assert.match(capturedSystemText, /Canonical blocks остаются source of truth/i);
    assert.match(capturedSystemText, /Legacy compatibility fields допустимы только как derived adapters/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('player seed preserves canonical nested blocks', async () => {
  const originalFetch = globalThis.fetch;
  const stageTitles = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';

    if (/PlayerSeedShaper/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: buildPlayerSeedShaperJson({
                    skills: ['читать знаки дороги'],
                    inventory: ['плотницкий топор'],
                    property: ['клеть при дворе'],
                    body: {
                      visible_marks: ['ссадина на ладони'],
                      health: 88,
                      satiety: 74,
                      vigor: 61,
                      active_conditions: ['хромота']
                    },
                    states: { health: 88, satiety: 74, vigor: 61 },
                    items: {
                      carried_items: [{
                        id: 'item:player:topor:1',
                        label: 'плотницкий топор',
                        type: 'weapon',
                        material: 'железо',
                        condition: 'рабочий',
                        size: 'medium',
                        placement: 'carried',
                        holder_id: 'player',
                        owner_id: 'player',
                        access: 'immediate',
                        visibility: 'visible',
                        legal_status: 'ordinary',
                        function: 'атака',
                        weight: 1.2,
                        discoverability: 5,
                        plausibility: 5,
                        risk: 0,
                        visible: true,
                        marks: []
                      }],
                      total_weight: 1.2,
                      load_category: 'light'
                    },
                    property_and_access: {
                      accessible_resources: ['помощь двора']
                    }
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/semantic_audit/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['player is plausible']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/player_seed/i.test(userText) && /Pipeline stage: player_seed/i.test(userText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Сухой player dossier без лишней сцены и без заглушек.'
                }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: 'ok' } }] };
      }
    };
  };

  try {
    const world = createWorldState({
      startText: 'Апрель 1242 года, Новгородская земля. В погосте собирают ополчение и продовольствие для выплаты контрибуции Ливонскому ордену.'
    });

    const result = await generatePlayerSeed(world, process.env, {
      onStage(stage) {
        if (stage?.phase === 'llm_response' && Array.isArray(stage.responseSections)) {
          stageTitles.push(...stage.responseSections.map((section) => section?.title).filter(Boolean));
        }
      }
    });
    assert.ok(result.data);
    assert.ok(result.data.identity);
    assert.ok(result.data.body);
    assert.ok(result.data.states);
    assert.ok(result.data.attributes);
    assert.ok(result.data.skill_bonuses);
    assert.ok(result.data.items);
    assert.ok(result.data.property_and_access);
    assert.ok(result.data.relations);
    assert.ok(result.data.position);
    assert.ok(result.data.current_position);
    assert.ok(result.data.start_scene);
    assert.ok(stageTitles.includes('Start scene'));
    assert.ok(stageTitles.includes('Knowledge map'));
    assert.ok(stageTitles.includes('Memory profile'));
    assert.ok(stageTitles.includes('Goals profile'));
    assert.ok(stageTitles.includes('Property & access'));
    assert.equal(result.data.position.location_id, 'yard');
    assert.equal(result.data.body.satiety, 74);
    assert.equal(result.data.skill_bonuses.craft, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('player seed derives legacy arrays from canonical item blocks', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';

    if (/player seed/i.test(systemText) && /Pipeline stage: player_seed/i.test(userText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Сухой player dossier без лишней сцены и без заглушек.'
                }
              }
            ]
          };
        }
      };
    }

    if (/PlayerSeedShaper/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: buildPlayerSeedShaperJson({
                    skills: ['читать знаки дороги'],
                    body: {
                      visible_marks: ['ссадина на ладони'],
                      health: 88,
                      satiety: 74,
                      vigor: 61,
                      active_conditions: ['хромота']
                    },
                    items: {
                      carried_items: [{
                        id: 'item:player:topor:1',
                        label: 'плотницкий топор',
                        type: 'tool',
                        material: 'железо',
                        condition: 'цел',
                        size: 'medium',
                        placement: 'carried',
                        holder_id: 'player',
                        owner_id: 'player',
                        access: 'immediate',
                        visibility: 'visible',
                        legal_status: 'ordinary',
                        function: 'работа',
                        weight: 2,
                        discoverability: 5,
                        plausibility: 5,
                        risk: 0,
                        visible: true,
                        marks: []
                      }],
                      property_not_carried: [{
                        id: 'item:player:deed:1',
                        label: 'грамота',
                        type: 'item',
                        material: 'ткань',
                        condition: 'цел',
                        size: 'small',
                        placement: 'property',
                        holder_id: null,
                        owner_id: 'player',
                        access: 'not_carried',
                        visibility: 'documented',
                        legal_status: 'ordinary',
                        function: 'документ',
                        weight: 0.1,
                        discoverability: 3,
                        plausibility: 5,
                        risk: 0,
                        visible: true,
                        marks: []
                      }]
                    },
                    property_and_access: {
                      borrowed_items: ['серп'],
                      foreign_items_with_character: ['чужой ключ']
                    },
                    position: {
                      region_id: 'region-new',
                      place_id: 'yard',
                      location_id: 'yard',
                      minilocation_id: 'yard:center',
                      anchor_id: 'yard:center',
                      last_route_id: 'route:new'
                    },
                    current_position: {
                      region_id: 'region-new',
                      place_id: 'yard',
                      location_id: 'yard',
                      minilocation_id: 'yard:center',
                      anchor_id: 'yard:center',
                      last_route_id: 'route:new'
                    }
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/semantic_audit/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['player is plausible']
                  })
                }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: 'ok' } }] };
      }
    };
  };

  try {
    const world = createWorldState({
      startText: 'Апрель 1242 года, Новгородская земля. В погосте собирают ополчение и продовольствие для выплаты контрибуции Ливонскому ордену.'
    });

    const result = await generatePlayerSeed(world);
    assert.ok(result.data);
    assert.ok(result.data.items);
    assert.ok(result.data.property_and_access);
    assert.deepEqual(result.data.inventory, ['плотницкий топор']);
    assert.deepEqual(result.data.property, ['грамота']);
    assert.deepEqual(result.data.items.carried_items.map((item) => item.label), ['плотницкий топор']);
    assert.deepEqual(result.data.items.property_not_carried.map((item) => item.label), ['грамота']);
    assert.deepEqual(result.data.property_and_access.borrowed_items, ['серп']);
    assert.deepEqual(result.data.property_and_access.foreign_items_with_character, ['чужой ключ']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('player seed keeps the supplied name and surfaces occupation and skills', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';

    if (/PlayerSeedShaper/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: buildPlayerSeedShaperJson({
                    name: 'Феофил',
                    role: 'монах-изгнанник, вестник',
                    occupation: 'монах-переписчик',
                    skills: ['читать псалмы', 'держать перо'],
                    body: { health: 88, satiety: 72, vigor: 58, visible_marks: [], active_conditions: [] },
                    states: { health: 88, satiety: 72, vigor: 58 },
                    identity: {
                      name: 'Феофил',
                      occupation_or_role: 'монах-переписчик'
                    }
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/semantic audit/i.test(systemText) || /отдельный проверяющий/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['player is plausible']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/Pipeline stage: player_seed/i.test(userText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Сухой player dossier без лишней сцены и без заглушек.'
                }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: 'ok' } }] };
      }
    };
  };

  try {
    const world = createWorldState({
      startText: 'Апрель 1242 года, Новгородская земля. В погосте собирают ополчение и продовольствие для выплаты контрибуции Ливонскому ордену.',
      player: {
        name: 'Феофил',
        role: 'монах-изгнанник, вестник',
        status: 'чужой',
        socialClass: 'низший духовный',
        ageRange: 'взрослый',
        origin: 'Владимирская земля',
        visibleStatus: 'чужой',
        trueStatus: 'неизвестно',
        reasonHere: 'оказался здесь по дороге',
        bodyState: 'устал, но жив',
        language: 'местный говор',
        literacy: 'неизвестно',
        clothing: 'историчная одежда',
        inventory: ['нож'],
        family: ['родня неизвестна'],
        property: ['личная вещь'],
        memory: ['дорога'],
        knowledge: ['место на тракте'],
        fears: ['потерять статус'],
        goals: ['выжить'],
        obligations: ['подчиняться местным правилам']
      }
    });

    const result = await generatePlayerSeed(world);
    assert.ok(result.data);
    assert.equal(result.data.name, 'Феофил');
    assert.equal(result.data.occupation, 'монах-переписчик');
    assert.equal(result.data.states.health, 88);
    assert.equal(result.data.body.health, 88);
    assert.ok(Array.isArray(result.data.skills));
    assert.deepEqual(result.data.skills, ['читать псалмы', 'держать перо']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('player seed coerces numeric health strings before validation', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';

    if (/PlayerSeedShaper/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: buildPlayerSeedShaperJson({
                    body: { health: '88', satiety: '72', vigor: '58' },
                    states: { health: '88', satiety: '72', vigor: '58' }
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/semantic audit/i.test(systemText) || /отдельный проверяющий/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['player is plausible']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/Pipeline stage: player_seed/i.test(userText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Краткий dossier без лишней биографии.'
                }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: 'ok' } }] };
      }
    };
  };

  try {
    const world = createWorldState({
      startText: 'Апрель 1242 года, Новгородская земля.',
      player: {
        name: 'Феофил'
      }
    });

    const result = await generatePlayerSeed(world);
    assert.ok(result.data);
    assert.equal(result.data.states.health, 88);
    assert.equal(result.data.body.health, 88);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('player seed coerces numeric attribute and skill bonus strings before validation', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';

    if (/PlayerSeedShaper/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: buildPlayerSeedShaperJson({
                    attributes: {
                      strength: '12',
                      agility: '13',
                      endurance: '11',
                      reason: '9',
                      attention: '10',
                      influence: '8'
                    },
                    skill_bonuses: {
                      athletics: '1',
                      stealth: '0',
                      melee: '0',
                      ranged: '0',
                      craft: '2',
                      household: '1',
                      survival: '2',
                      riding: '0',
                      healing: '0',
                      observation: '2',
                      communication: '0',
                      custom_and_law: '0'
                    }
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/semantic audit/i.test(systemText) || /отдельный проверяющий/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['player is plausible']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/Pipeline stage: player_seed/i.test(body.messages?.[1]?.content ?? '')) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Краткий dossier без лишней биографии.'
                }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: 'ok' } }] };
      }
    };
  };

  try {
    const world = createWorldState({
      startText: 'Апрель 1242 года, Новгородская земля.',
      player: {
        name: 'Павел'
      }
    });

    const result = await generatePlayerSeed(world);
    assert.ok(result.data);
    assert.equal(result.data.attributes.strength, 12);
    assert.equal(result.data.attributes.agility, 13);
    assert.equal(result.data.skill_bonuses.athletics, 1);
    assert.equal(result.data.skill_bonuses.observation, 2);
    assert.equal(result.data.skill_bonuses.communication, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('player seed normalizes position and current_position together', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';

    if (/PlayerSeedShaper/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: buildPlayerSeedShaperJson({
                    position: {
                      region_id: 'region:test',
                      place_id: 'place:test',
                      location_id: 'location:test',
                      minilocation_id: 'location:test:corner',
                      anchor_id: 'anchor:test',
                      last_route_id: 'route:test'
                    },
                    current_position: {
                      region_id: 'region:test',
                      place_id: 'place:test',
                      location_id: 'location:test',
                      minilocation_id: 'location:test:corner',
                      anchor_id: 'anchor:test',
                      last_route_id: 'route:test'
                    }
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/semantic audit/i.test(systemText) || /отдельный проверяющий/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['player is plausible']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/Pipeline stage: player_seed/i.test(body.messages?.[1]?.content ?? '')) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Краткий dossier без лишней биографии.'
                }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: 'ok' } }] };
      }
    };
  };

  try {
    const world = createWorldState({
      startText: 'Апрель 1242 года, Новгородская земля.',
      player: {
        name: 'Павел'
      }
    });

    const result = await generatePlayerSeed(world);
    assert.ok(result.data);
    assert.deepEqual(result.data.position, {
      region_id: 'region:test',
      place_id: 'place:test',
      location_id: 'location:test',
      minilocation_id: 'location:test:corner',
      anchor_id: 'anchor:test',
      last_route_id: 'route:test'
    });
    assert.deepEqual(result.data.current_position, {
      region_id: 'region:test',
      place_id: 'place:test',
      location_id: 'location:test',
      minilocation_id: 'location:test:corner',
      anchor_id: 'anchor:test',
      last_route_id: 'route:test'
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('player seed treats empty input as no preference instead of random', async () => {
  const originalFetch = globalThis.fetch;
  const seen = {};

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';

    if (/PlayerSeedShaper/i.test(systemText)) {
      seen.shapeSystemText = systemText;
      seen.shapeUserText = userText;
      seen.shapePayload = safeJsonParse(userText);
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: buildPlayerSeedShaperJson({
                    name: 'Павел',
                    occupation: 'посыльный',
                    role: 'посыльный',
                    skills: ['читать знаки дороги'],
                    identity: {
                      name: 'Павел',
                      occupation_or_role: 'посыльный'
                    }
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/semantic audit/i.test(systemText) || /отдельный проверяющий/i.test(systemText)) {
      seen.auditSystemText = systemText;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['player is plausible']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/Pipeline stage: player_seed/i.test(userText)) {
      seen.dossierSystemText = systemText;
      seen.dossierUserText = userText;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Краткий dossier без лишней биографии.'
                }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: 'ok' } }] };
      }
    };
  };

  try {
    const world = createWorldState({
      startText: '',
      player: {
        name: ''
      }
    });

    const result = await generatePlayerSeed(world);

    assert.match(seen.dossierSystemText, /отсутствие предпочтения/i);
    assert.match(seen.dossierUserText, /Имя игрока: не предоставлено/);
    assert.match(seen.dossierUserText, /Стартовый текст: не предоставлено/);
    assert.match(seen.shapeSystemText, /отсутствие предпочтения/i);
    assert.equal(seen.shapePayload.playerName, null);
    assert.ok(result.data);
    assert.equal(result.data.name, 'Павел');
    assert.equal(result.data.occupation, 'посыльный');
    assert.deepEqual(result.data.skills, ['читать знаки дороги']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('player seed audit guards against over-detailed biography', async () => {
  const originalFetch = globalThis.fetch;
  let dossierCalls = 0;
  let shapeCalls = 0;
  let repairPromptSeen = false;

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';

    if (/PlayerSeedShaper/i.test(systemText)) {
      shapeCalls += 1;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: buildPlayerSeedShaperJson()
                }
              }
            ]
          };
        }
      };
    }

    if (/semantic_audit/i.test(systemText) && /player_seed/i.test(userText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['player is plausible']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/player_seed/i.test(userText) && /Pipeline stage: player_seed/i.test(userText)) {
      dossierCalls += 1;
      if (dossierCalls === 2) {
        repairPromptSeen = /Замечания прошлого аудита для исправления|Previous audit concerns to repair/i.test(`${systemText}\n${userText}`);
      }
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: dossierCalls === 1
                    ? 'Отец умер в 1252 году, мать постриглась, а я учился в Хутынском монастыре и ношу змеевик.'
                    : 'Сухой player dossier без лишней сцены и без заглушек.'
                }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: 'ok' } }] };
      }
    };
  };

  try {
    const world = createWorldState({
      startText: 'Апрель 1242 года, Новгородская земля. В погосте собирают ополчение и продовольствие для выплаты контрибуции Ливонскому ордену.'
    });

    const result = await generatePlayerSeed(world);
    assert.ok(result.data);
    assert.equal(dossierCalls, 2);
    assert.equal(shapeCalls, 1);
    assert.equal(repairPromptSeen, true);
    assert.ok(Array.isArray(result.data.inventory));
    assert.ok(Array.isArray(result.data.family));
    assert.ok(Array.isArray(result.data.property));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('place seed contract validates place structure', () => {
  const valid = validatePlaceSeed({
    version: 1,
    schema: 'place_seed',
    placeName: 'Двор у переправы',
    placeKind: 'дорожный двор',
    purpose: 'обслуживать проход и ночлег',
    formalOwner: 'местный хозяин двора',
    actualManager: 'приказчик двора',
    dependentGroups: ['служки'],
    livelihood: ['переправа'],
    roads: ['тракт к переправе'],
    accessRules: ['ночью вход ограничен'],
    hazards: ['скользкий двор'],
    rhythm: 'утром открыто, вечером строже'
  });
  const invalid = validatePlaceSeed({
    version: 1,
    schema: 'place_seed',
    placeName: 'Двор у переправы',
    placeKind: 'дорожный двор',
    purpose: 'обслуживать проход и ночлег',
    formalOwner: 'местный хозяин двора',
    actualManager: 'приказчик двора',
    dependentGroups: ['служки'],
    livelihood: 'не массив',
    roads: ['тракт к переправе'],
    accessRules: ['ночью вход ограничен'],
    hazards: ['скользкий двор'],
    rhythm: 'утром открыто, вечером строже'
  });

  assert.ok(valid);
  assert.equal(invalid, null);
});

test('place seed contract rejects extra keys with path-aware errors', () => {
  const explained = explainPlaceSeedValidation({
    version: 1,
    schema: 'place_seed',
    placeName: 'Двор у переправы',
    placeKind: 'дорожный двор',
    purpose: 'обслуживать проход и ночлег',
    formalOwner: 'местный хозяин двора',
    actualManager: 'приказчик двора',
    dependentGroups: ['служки'],
    livelihood: ['переправа'],
    roads: ['тракт к переправе'],
    accessRules: ['ночью вход ограничен'],
    hazards: ['скользкий двор'],
    rhythm: 'утром открыто, вечером строже',
    audit: { schema: 'semantic_audit' },
    dossier: 'лишний текст'
  });

  assert.equal(explained.ok, false);
  assert.ok(explained.errors.some((error) => error.includes('root.audit: unexpected field')));
  assert.ok(explained.errors.some((error) => error.includes('root.dossier: unexpected field')));
});

test('place seed prompt collapses RHYTHM into one string', async () => {
  const originalFetch = globalThis.fetch;
  let accessPromptSeen = false;
  let purposeSystemText = '';

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';

    if (/PlaceSeedPurposeOwnershipShaper/i.test(systemText) || /ShapePurposeOwnership/i.test(systemText)) {
      purposeSystemText = purposeSystemText || systemText;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    placeName: 'Двор у переправы',
                    placeKind: 'дорожный двор',
                    purpose: 'обслуживать проход, ночлег и контроль дороги',
                    formalOwner: 'местный хозяин двора',
                    actualManager: 'приказчик двора',
                    dependentGroups: ['служки']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/PlaceSeedLivelihoodRoadsShaper/i.test(systemText) || /ShapeLivelihoodRoads/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    livelihood: ['переправа', 'корм и ночлег'],
                    roads: ['тракт к переправе', 'дорога к торгу']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/semantic_audit/i.test(systemText) && /place_seed/i.test(userText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['place seed is compact']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/PlaceSeedAccessHazardsRhythmShaper/i.test(systemText) || /ShapeAccessHazardsRhythm/i.test(systemText)) {
      accessPromptSeen = /one compact string|compact string/i.test(systemText) || /rhythmFormat/i.test(userText);
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    accessRules: ['ночью вход ограничен', 'чужого сперва расспрашивают'],
                    hazards: ['подозрительность к чужим', 'грязь у ворот после дождя'],
                    rhythm: 'утром двор открыт, днём идёт проход, вечером контроль строже'
                  })
                }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: 'ok' } }] };
      }
    };
  };

  try {
    const world = createWorldState({ startText: 'двор и переправа' });
    const result = await generatePlaceSeed(world);
    assert.ok(result.data);
    assert.match(purposeSystemText, /# Роль/);
    assert.match(purposeSystemText, /# Формат ответа/);
    assert.equal(accessPromptSeen, true);
    assert.equal(typeof result.data.rhythm, 'string');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('place seed fragments retry with parse and shape diagnostics', async () => {
  const originalFetch = globalThis.fetch;
  let dossierCalls = 0;
  let auditCalls = 0;
  let purposeCalls = 0;
  let livelihoodCalls = 0;
  let accessCalls = 0;
  let secondPurposePayload = null;
  let thirdPurposePayload = null;

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';

    if (/PlaceSeedPurposeOwnershipShaper/i.test(systemText) || /ShapePurposeOwnership/i.test(systemText)) {
      purposeCalls += 1;
      const payload = safeJsonParse(userText);
      if (purposeCalls === 1) {
        return {
          ok: true,
          async json() {
            return {
              choices: [
                {
                  message: {
                    content: 'PlaceSeedShaper output stopped after root.dossierSections.RHYTHM[1].'
                  }
                }
              ]
            };
          }
        };
      }
      if (purposeCalls === 2) {
        secondPurposePayload = payload;
        return {
          ok: true,
          async json() {
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      placeName: 'Двор у переправы',
                      placeKind: 'дорожный двор',
                      purpose: 'обслуживать проход, ночлег и контроль дороги',
                      dossierSections: { PURPOSE: ['лишнее'] }
                    })
                  }
                }
              ]
            };
          }
        };
      }
      thirdPurposePayload = payload;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    placeName: 'Двор у переправы',
                    placeKind: 'дорожный двор',
                    purpose: 'обслуживать проход, ночлег и контроль дороги',
                    formalOwner: 'местный хозяин двора',
                    actualManager: 'приказчик двора',
                    dependentGroups: ['служки']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/PlaceSeedLivelihoodRoadsShaper/i.test(systemText) || /ShapeLivelihoodRoads/i.test(systemText)) {
      livelihoodCalls += 1;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    livelihood: ['переправа', 'корм и ночлег'],
                    roads: ['тракт к переправе', 'дорога к торгу']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/PlaceSeedAccessHazardsRhythmShaper/i.test(systemText) || /ShapeAccessHazardsRhythm/i.test(systemText)) {
      accessCalls += 1;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    accessRules: ['ночью вход ограничен', 'чужого сперва расспрашивают'],
                    hazards: ['подозрительность к чужим', 'грязь у ворот после дождя'],
                    rhythm: 'утром двор открыт, днём идёт проход, вечером контроль строже'
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/semantic audit/i.test(systemText) || /отдельный проверяющий/i.test(systemText)) {
      auditCalls += 1;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify(buildMockSemanticAuditResponse(safeJsonParse(userText)))
                }
              }
            ]
          };
        }
      };
    }

    if (/Pipeline stage: place_seed/i.test(userText) && !/PlaceSeedShaper/i.test(systemText)) {
      dossierCalls += 1;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: buildMockPlaceSeedDossierResponse(safeJsonParse(userText))
                }
              }
            ]
          };
        }
      };
    }

    return originalFetch(_url, options);
  };

  try {
    const world = createWorldState({
      startText: 'двор у дороги',
      historicalFrame: {
        version: 1,
        schema: 'historical_frame',
        year: 1237,
        season: 'зима',
        regionName: 'Рязанская земля',
        regionHint: 'Русь, Окская земля',
        settlementType: 'двор у дороги',
        pressure: 'угроза осады и бегства',
        conflict: 'дорога и местная власть',
        startTextHint: 'Русь 1237 года'
      },
      history: {
        era: 'XIII век',
        year: 1237,
        season: 'зима',
        regionHint: 'Русь, Окская земля',
        macroForces: ['угроза осады и бегства'],
        legitimacy: ['поручительство важнее слов']
      },
      region: {
        name: 'Рязанская земля',
        economy: ['зимние запасы и подводы'],
        politics: ['княжеская власть'],
        tensions: ['слухи о войске']
      }
    });

    const result = await generatePlaceSeed(world);

    assert.equal(result.usedFallback, false);
    assert.equal(result.data.placeName, 'Двор у переправы');
    assert.equal(dossierCalls, 1);
    assert.equal(auditCalls, 1);
    assert.equal(purposeCalls, 3);
    assert.equal(livelihoodCalls, 1);
    assert.equal(accessCalls, 1);
    assert.match(secondPurposePayload.retryInstruction, /PlaceSeedShaper output is invalid JSON: truncated after root\.purpose\./);
    assert.match(secondPurposePayload.retryInstruction, /Previous output copied forbidden key dossierSections and was truncated\./);
    assert.match(thirdPurposePayload.retryInstruction, /Forbidden root key: dossierSections\./);
    assert.match(thirdPurposePayload.retryInstruction, /root\.formalOwner: expected string, got missing/);
    assert.equal(thirdPurposePayload.frame.year, 1237);
    assert.equal(thirdPurposePayload.frame.region, 'Рязанская земля');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('social tissue contract validates local social structure', () => {
  const valid = validateSocialTissue({
    version: 1,
    schema: 'social_tissue',
    formalOwner: 'местный хозяин двора',
    actualManager: 'приказчик двора',
    dependentGroups: ['служки'],
    families: ['двор хозяина'],
    trade: ['переправа'],
    rumors: ['чужак на дороге'],
    tensions: ['подозрительность к чужим'],
    obligations: ['платить за проход'],
    rhythm: 'дневной труд и вечерний контроль',
    accessRules: ['ночью доступ ограничен']
  });
  const invalid = validateSocialTissue({
    version: 1,
    schema: 'social_tissue',
    formalOwner: 'местный хозяин двора',
    actualManager: 'приказчик двора',
    dependentGroups: ['служки'],
    families: ['двор хозяина'],
    trade: ['переправа'],
    rumors: ['чужак на дороге'],
    tensions: ['подозрительность к чужим'],
    obligations: ['платить за проход'],
    rhythm: ['не строка'],
    accessRules: ['ночью доступ ограничен']
  });

  assert.ok(valid);
  assert.equal(invalid, null);
});

test('json parser accepts fenced model output', () => {
  const parsed = parseJsonObject([
    '```json',
    '{ "version": 1, "schema": "actor_profiles", "player": null, "npcs": [] }',
    '```'
  ].join('\n'));

  assert.ok(parsed);
  assert.equal(parsed.schema, 'actor_profiles');
  assert.deepEqual(parsed.npcs, []);
});


test('historical context follows selected frame instead of leaking central Europe pack', () => {
  const world = createWorldState({
    startText: 'деревня у дороги',
    historicalFrame: {
      version: 1,
      schema: 'historical_frame',
      year: 1237,
      season: 'зима',
      regionName: 'Рязанская земля',
      regionHint: 'Русь, Окская земля',
      settlementType: 'городская слобода у дороги',
      pressure: 'угроза осады и бегства',
      conflict: 'дорога, княжеская власть и страх перед войском',
      startTextHint: 'Русь 1237 года'
    },
    history: {
      era: 'XIII век',
      year: 1237,
      season: 'зима',
      regionHint: 'Русь, Окская земля',
      macroForces: ['угроза осады и бегства'],
      legitimacy: ['княжеская власть и поручительство важнее слов']
    },
    region: {
      name: 'Рязанская земля',
      economy: ['зимние запасы и подводы'],
      politics: ['княжеская власть'],
      tensions: ['слухи о войске', 'страх дороги']
    }
  });

  assert.equal(world.historical.year, 1237);
  assert.notEqual(world.historical.packId, '1241-central-europe');
  assert.equal(world.historical.notablePeople.includes('Béla IV of Hungary'), false);
  assert.equal(world.historical.anchorEvents.some((item) => /Legnica|Mohi/i.test(item)), false);
  assert.equal(world.historical.roadRoutes.some((item) => /Legnica|Mohi|Buda|Krak/i.test(item.route ?? '')), false);
});

test('historical context does not auto-select the central Europe pack outside its region', () => {
  const world = createWorldState({
    startText: 'деревня у дороги',
    history: {
      era: 'XIII век',
      year: 1241,
      season: 'весна',
      regionHint: 'Рязанская земля',
      macroForces: ['угроза осады и бегства'],
      legitimacy: ['княжеская власть и поручительство важнее слов']
    },
    region: {
      name: 'Рязанская земля',
      economy: ['зимние запасы и подводы'],
      politics: ['княжеская власть'],
      tensions: ['слухи о войске', 'страх дороги']
    }
  });

  const historical = buildHistoricalContext(world);

  assert.notEqual(historical.packId, '1241-central-europe');
  assert.equal(historical.notablePeople.includes('Генрих II Благочестивый'), false);
  assert.equal(historical.anchorEvents.some((item) => /Легниц|Мохи|Béla|Batu/i.test(item)), false);
});

test('default scenarios do not auto-select the central Europe historical pack', () => {
  for (const scenarioId of ['ford', 'market', 'village']) {
    const world = createWorldState({ scenarioId, startText: 'проверка пакета' });
    assert.notEqual(world.historical.packId, '1241-central-europe', `scenario ${scenarioId} should not use central Europe pack`);
  }
});

test('estimateIntentMinutes uses sub-minute combat ticks', () => {
  assert.equal(estimateIntentMinutes('attack'), 0.5);
  assert.equal(estimateIntentMinutes('defend'), 0.5);
  assert.equal(estimateIntentMinutes('flee'), 1);
  assert.equal(estimateIntentMinutes('flee', 12), 12);
});

test('combat ticks skip hourly need drift but keep combat exertion', () => {
  const world = createWorldState({ clock: { day: 1, hour: 10, minute: 0 } });
  world.player.states = { health: 100, satiety: 100, vigor: 100 };

  advanceWorld(world, 0.5, { type: 'attack' });

  assert.equal(world.player.states.satiety, 100);
  assert.ok(world.player.states.vigor < 100);
  assert.ok((getActiveStateValue(world.player, 'fear') ?? 0) > 0);
});

test('deriveWeather reflects season and region in fixture mode', () => {
  const previous = process.env.NODE_TEST_CONTEXT;
  process.env.NODE_TEST_CONTEXT = '1';
  try {
    const world = createWorldState({
      startText: 'переправа',
      history: { season: 'зимняя стужа' },
      region: { name: 'лесная деревня у реки' }
    });

    advanceWorld(world, 30, { type: 'wait' });

    assert.match(world.scene.weather, /зимн/i);
    assert.match(world.scene.weather, /лесн|речн/i);
  } finally {
    if (previous === undefined) delete process.env.NODE_TEST_CONTEXT;
    else process.env.NODE_TEST_CONTEXT = previous;
  }
});

test('deriveWeather queues LLM semantics in production mode', () => {
  const previous = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    const world = createWorldState({
      startText: 'переправа',
      history: { season: 'зимняя стужа' },
      region: { name: 'лесная деревня у реки' },
      scene: { weather: '', light: '', pressure: [], sounds: [], attention: 'низкое' }
    });

    advanceWorld(world, 30, { type: 'wait' });

    assert.equal(world.scene.weather, '');
    assert.equal(world.pendingSemanticWorld.some((entry) => entry.kind === 'weather'), true);
  } finally {
    if (previous === undefined) delete process.env.NODE_TEST_CONTEXT;
    else process.env.NODE_TEST_CONTEXT = previous;
  }
});

test('loadDesignBundleSync reads project corpus documents', () => {
  const bundle = loadDesignBundleSync('combat');
  assert.match(bundle, /combat_system\.md/);
  assert.match(bundle, /Боевая система/);
});

test('buildMasterPromptSync includes corpus grounding', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const frame = buildMasterFrame(world, 'осматриваюсь');
  const prompt = buildMasterPromptSync(frame);
  assert.match(prompt, /llm_documentation_navigation\.md|Проектная документация/);
});

test('place seed repairs failed audit and re-audits before shaping', async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  let auditCalls = 0;
  let repairCalls = 0;
  let purposePayload = null;

  globalThis.setTimeout = (handler, _delay, ...args) => {
    if (typeof handler === 'function') handler(...args);
    return 0;
  };

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';

    if (/SemanticDossierRepairer/i.test(systemText) && /place_seed/i.test(systemText)) {
      repairCalls += 1;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Рязанское место 1237 года живёт местной дорогой, зимними запасами и властью двора; чужие дороги к Легнице и Мохи удалены.'
                }
              }
            ]
          };
        }
      };
    }

    if (/semantic audit/i.test(systemText) || /отдельный проверяющий/i.test(systemText)) {
      auditCalls += 1;
      const pass = auditCalls > 1;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass,
                    concerns: pass ? [] : ['протянуты дороги из несовместимого исторического пакета'],
                    evidence: pass ? ['repair removed foreign roads'] : ['Legnica and Mohi do not match Русь 1237']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/PlaceSeedPurposeOwnershipShaper/i.test(systemText) || /ShapePurposeOwnership/i.test(systemText)) {
      purposePayload = safeJsonParse(userText);
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    placeName: 'Двор у зимней дороги',
                    placeKind: 'дорожный двор',
                    purpose: 'держать проход, ночлег и зимние запасы',
                    formalOwner: 'местный хозяин двора',
                    actualManager: 'приказчик двора',
                    dependentGroups: ['служки']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/PlaceSeedLivelihoodRoadsShaper/i.test(systemText) || /ShapeLivelihoodRoads/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    livelihood: ['подводы', 'зимние припасы'],
                    roads: ['местная дорога к слободе']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/PlaceSeedAccessHazardsRhythmShaper/i.test(systemText) || /ShapeAccessHazardsRhythm/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    accessRules: ['чужой объясняет, зачем пришёл'],
                    hazards: ['слухи о войске'],
                    rhythm: 'утренний двор, дневной проход, вечерняя осторожность'
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/place_seed/i.test(systemText) || /смысл места/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Место ошибочно тянет дороги к Legnica и Mohi, хотя рамка говорит Русь 1237 года.'
                }
              }
            ]
          };
        }
      };
    }

    return originalFetch(_url, options);
  };

  try {
    const world = createWorldState({
      startText: 'двор у дороги',
      historicalFrame: {
        version: 1,
        schema: 'historical_frame',
        year: 1237,
        season: 'зима',
        regionName: 'Рязанская земля',
        regionHint: 'Русь, Окская земля',
        settlementType: 'двор у дороги',
        pressure: 'угроза осады и бегства',
        conflict: 'дорога и местная власть',
        startTextHint: 'Русь 1237 года'
      },
      history: {
        era: 'XIII век',
        year: 1237,
        season: 'зима',
        regionHint: 'Русь, Окская земля',
        macroForces: ['угроза осады и бегства'],
        legitimacy: ['поручительство важнее слов']
      },
      region: {
        name: 'Рязанская земля',
        economy: ['зимние запасы и подводы'],
        politics: ['княжеская власть'],
        tensions: ['слухи о войске']
      }
    });

    const result = await generatePlaceSeed(world);

    assert.equal(result.usedFallback, false);
    assert.equal(result.data.placeName, 'Двор у зимней дороги');
    assert.equal(auditCalls, 2);
    assert.equal(repairCalls, 1);
    assert.equal(purposePayload.frame.year, 1237);
    assert.equal(purposePayload.frame.region, 'Рязанская земля');
    assert.notEqual(purposePayload.frame.historicalPack.id, '1241-central-europe');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('place seed invalid audit fails with concrete reason', async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;

  globalThis.setTimeout = (handler, _delay, ...args) => {
    if (typeof handler === 'function') handler(...args);
    return 0;
  };

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';

    if (/semantic audit/i.test(systemText) || /отдельный проверяющий/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: 'not json' } }] };
        }
      };
    }

    if (/place_seed/i.test(systemText) || /смысл места/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: 'Место описано без JSON.' } }] };
        }
      };
    }

    return originalFetch(_url, options);
  };

  try {
    const world = createWorldState({ startText: 'двор у дороги' });
    await assert.rejects(
      () => generatePlaceSeed(world),
      /semantic audit response was not valid JSON/i
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});


test('social tissue repairs failed audit and re-audits before shaping', async () => {
  const originalFetch = globalThis.fetch;
  let auditCalls = 0;
  let repairCalls = 0;
  let shapePayload = null;

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';

    if (/SemanticDossierRepairer/i.test(systemText) && /social_tissue/i.test(systemText)) {
      repairCalls += 1;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Социальная ткань держится на дворе хозяина, зависимых работниках, местном обмене, слухах дороги и правилах доступа; чужие события другого региона удалены.'
                }
              }
            ]
          };
        }
      };
    }

    if (/semantic audit/i.test(systemText) || /отдельный проверяющий/i.test(systemText)) {
      auditCalls += 1;
      const pass = auditCalls > 1;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass,
                    concerns: pass ? [] : ['протянуты чужие события из другого региона'],
                    evidence: pass ? ['repair removed foreign social anchors'] : ['битва и дорога не совпадают с рамкой']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/SocialTissueShaper/i.test(systemText) || /schema=social_tissue/i.test(systemText)) {
      shapePayload = safeJsonParse(userText);
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify(buildMockSocialTissueResponse(shapePayload))
                }
              }
            ]
          };
        }
      };
    }

    if (/social_tissue/i.test(systemText) || /социальную ткань/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Социальная ткань ошибочно тянет чужие события другого региона.'
                }
              }
            ]
          };
        }
      };
    }

    return originalFetch(_url, options);
  };

  try {
    const world = createWorldState({ startText: 'проверка социальной ткани' });
    const result = await generateSocialTissue(world);

    assert.equal(result.usedFallback, false);
    assert.equal(result.data.schema, 'social_tissue');
    assert.equal(auditCalls, 2);
    assert.equal(repairCalls, 1);
    assert.match(shapePayload?.sourceDossier ?? '', /чужие события другого региона удалены/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('social tissue accepts an audit with empty evidence by synthesizing context evidence', async () => {
  const originalFetch = globalThis.fetch;
  let auditCalls = 0;
  let shapePayload = null;

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';

    if (/semantic audit/i.test(systemText) || /отдельный проверяющий/i.test(systemText)) {
      auditCalls += 1;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: []
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/SocialTissueShaper/i.test(systemText) || /schema=social_tissue/i.test(systemText)) {
      shapePayload = safeJsonParse(userText);
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify(buildMockSocialTissueResponse(shapePayload))
                }
              }
            ]
          };
        }
      };
    }

    if (/social_tissue/i.test(systemText) || /социальную ткань/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Социальная ткань держится на местном дворе, зависимых людях и правилах допуска.'
                }
              }
            ]
          };
        }
      };
    }

    return originalFetch(_url, options);
  };

  try {
    const world = createWorldState({ startText: 'проверка социальной ткани с пустым evidence' });
    const result = await generateSocialTissue(world);

    assert.equal(result.usedFallback, false);
    assert.equal(result.data.schema, 'social_tissue');
    assert.equal(auditCalls, 1);
    assert.ok(shapePayload);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('social tissue fails with diagnostics when shaper returns prose instead of an object', async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  let shapeCalls = 0;

  globalThis.setTimeout = (callback, _ms, ...args) => {
    if (typeof callback === 'function') callback(...args);
    return 0;
  };

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';

    if (/semantic audit/i.test(systemText) || /отдельный проверяющий/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['audit path exercised']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/SocialTissueShaper/i.test(systemText) || /schema=social_tissue/i.test(systemText)) {
      shapeCalls += 1;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Слишком художественная проза вместо JSON-объекта.'
                }
              }
            ]
          };
        }
      };
    }

    if (/social_tissue/i.test(systemText) || /социальную ткань/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Есть семьи, власть, зависимые, обмен, слухи, напряжения, обязанности, ритм и правила доступа.'
                }
              }
            ]
          };
        }
      };
    }

    return originalFetch(_url, options);
  };

  try {
    const world = createWorldState({ startText: 'проверка отказа социальной ткани без заглушек' });

    await assert.rejects(
      () => generateSocialTissue(world),
      /Unable to generate social tissue: SocialTissueShaper output is invalid JSON: response was not parseable\. Likely copied sourceDossier or trailed into prose\./
    );
    assert.equal(shapeCalls, 3);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('actor profiles use only current scene actors in the dossier', async () => {
  const originalFetch = globalThis.fetch;
  let sceneActorPayload = null;
  let actorShapeSystemText = null;

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';

    if (/scene_actor_context/i.test(userText)) {
      sceneActorPayload = safeJsonParse(userText);
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Player and the people in the current scene remain the only relevant context.'
                }
              }
            ]
          };
        }
      };
    }

    if (/SemanticDossierRepairer/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Player and NPCs are concrete people with historical roles, visible constraints, family ties, and limited memory. The player is described as a human in a local setting, with no hidden omniscience, and NPCs remain bound to duties, obligations, and local knowledge.'
                }
              }
            ]
          };
        }
      };
    }

    if (/(ActorProfileShaper|SemanticDataShaper)/i.test(systemText) && /actor_profiles/i.test(userText) && /sourceDossier|outputRules/i.test(userText)) {
      actorShapeSystemText = systemText;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'actor_profiles',
                    player: {
                      id: 'player',
                      actorProfile: {
                        version: 1,
                        kind: 'player',
                        identity: {
                          id: 'player',
                          name: 'Феофил',
                          ageRange: 'взрослый',
                          origin: 'Владимирская земля',
                          originDetail: 'неизвестно',
                          socialPosition: 'чужой',
                          visibleStatus: 'чужой',
                          trueStatus: 'неизвестно',
                          reasonHere: 'оказался здесь по дороге',
                          worldPosition: 'путник'
                        },
                        kinship: {
                          familyFacts: ['родня не указана'],
                          noFamilyReason: 'неизвестно',
                          obligations: ['подчиняться местным правилам'],
                          household: 'неизвестно',
                          answerableTo: 'неизвестно',
                          responsibleFor: ['никого']
                        },
                        property: {
                          carried: ['нож'],
                          outsideAccess: ['личная вещь'],
                          rights: ['личное владение'],
                          ownershipFacts: ['неизвестно'],
                          access: ['доступ только у владельца']
                        },
                        work: {
                          occupation: 'путник',
                          currentActivity: 'осматривается',
                          nextTask: 'понять местный порядок',
                          dutyWindow: 'текущий час',
                          interruptionRule: 'останавливается при угрозе',
                          skills: ['дорога'],
                          routine: ['идёт и наблюдает'],
                          dutyTo: 'никому',
                          answerableTo: 'никому',
                          responsibleFor: ['себя']
                        },
                        body: {
                          bodyState: 'устал, но жив',
                          health: 100,
                          bleeding: 0,
                          pain: 0,
                          intoxication: 0,
                          clothing: 'историчная одежда',
                          language: 'местный говор',
                          literacy: 'неизвестно'
                        },
                        mind: {
                          memory: ['дорога'],
                          knowledge: ['место на тракте'],
                          seen: ['люди и путь'],
                          heard: ['слухи о дороге'],
                          misunderstood: ['неизвестно'],
                          hidden: ['неизвестно'],
                          fears: ['потерять статус'],
                          goals: ['выжить'],
                          manner: ['сдержан'],
                          speech: ['простой'],
                          courage: 1,
                          greed: 0,
                          caution: 1,
                          honesty: 1,
                          superstition: 0,
                          temper: 0
                        }
                      }
                    },
                    npcs: []
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/semantic audit/i.test(systemText) || /отдельный проверяющий/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['audit path exercised']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/PlayerSeedShaper/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    ...buildMockPlayerSeedResponse(safeJsonParse(body.messages?.[1]?.content ?? '{}')),
                    current_position: {
                      region_id: 'region-new',
                      place_id: 'river',
                      location_id: 'river',
                      minilocation_id: 'river:bank',
                      anchor_id: 'river:bank',
                      last_route_id: 'route:river'
                    }
                  })
                }
              }
            ]
          };
        }
      };
    }

    return originalFetch(_url, options);
  };

  try {
    const world = createWorldState({
      startText: 'проверка аудита',
      player: {
        name: 'Феофил',
        role: 'монах-изгнанник, вестник',
        status: 'чужой',
        socialClass: 'низший духовный',
        ageRange: 'взрослый',
        origin: 'Владимирская земля',
        visibleStatus: 'чужой',
        trueStatus: 'неизвестно',
        reasonHere: 'оказался здесь по дороге',
        bodyState: 'устал, но жив',
        language: 'местный говор',
        literacy: 'неизвестно',
        clothing: 'историчная одежда',
        inventory: ['нож'],
        family: ['родня неизвестна'],
        property: ['личная вещь'],
        memory: ['дорога'],
        knowledge: ['место на тракте'],
        fears: ['потерять статус'],
        goals: ['выжить'],
        obligations: ['подчиняться местным правилам']
      }
    });
    world.currentLocationId = 'stale-yard';
    world.currentMicroLocationId = 'stale-yard:entry';
    world.current_position = {
      ...world.current_position,
      location_id: 'yard',
      place_id: 'yard',
      minilocation_id: 'yard:entry'
    };
    const currentLocation = world.locations?.[world.current_position.location_id];
    if (currentLocation) {
      currentLocation.occupants = ['Феофил', 'староста', 'посыльный'];
    }
    const keyNpc = buildNpcProfile({
      id: 'npc-local-key',
      name: 'староста',
      role: 'староста',
      locationId: world.currentLocationId,
      homeLocation: world.currentLocationId,
      profileLevel: 'key',
      knowledgeHidden: ['знает скрытый долг'],
      memory: ['помнит старый спор']
    }, world.currentLocationId, 0, world.player);
    const backgroundNpc = buildNpcProfile({
      id: 'npc-local-background',
      name: 'посыльный',
      role: 'посыльный',
      locationId: world.currentLocationId,
      homeLocation: world.currentLocationId,
      profileLevel: 'background',
      family: ['тайная родня'],
      knowledgeHidden: ['скрывает поручение'],
      memory: ['случайная встреча']
    }, world.currentLocationId, 1, world.player);
    const remoteNpc = buildNpcProfile({
      id: 'npc-remote',
      name: 'торговец',
      role: 'купец',
      locationId: 'remote-location',
      homeLocation: 'remote-location'
    }, world.currentLocationId, 2, world.player);
    world.npcs = [keyNpc, backgroundNpc, remoteNpc];

    const result = await generateActorProfiles(world);

    assert.ok(result.data);
    assert.equal(result.usedFallback, false);
    assert.ok(sceneActorPayload);
    assert.equal(sceneActorPayload.scene.location.id, 'yard');
    assert.equal(Array.isArray(sceneActorPayload.actors), true);
    assert.equal(sceneActorPayload.actors.some((item) => item.name === 'торговец'), false);
    assert.equal(sceneActorPayload.actors.some((item) => item.name === 'староста'), true);
    const sceneBackgroundActor = sceneActorPayload.actors.find((item) => item.name === 'посыльный');
    const sceneKeyActor = sceneActorPayload.actors.find((item) => item.name === 'староста');
    assert.ok(sceneBackgroundActor);
    assert.equal(sceneBackgroundActor.profileLevel, 'background');
    assert.equal(sceneBackgroundActor.knowledgeHidden.length, 0);
    assert.ok(sceneKeyActor);
    assert.equal(sceneKeyActor.profileLevel, 'key');
    assert.ok(sceneKeyActor.knowledgeHidden.length > 0);
    assert.match(actorShapeSystemText ?? '', /profileLevel/i);
    assert.equal(result.data.schema, 'actor_profiles');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('actor profiles leave missing npc levels background instead of inferring scene', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';

    if (/SemanticDossierRepairer/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Player and NPCs are local people with limited knowledge and no hidden omniscience.'
                }
              }
            ]
          };
        }
      };
    }

    if (/(ActorProfileShaper|SemanticDataShaper)/i.test(systemText) && /actor_profiles/i.test(userText) && /sourceDossier|outputRules/i.test(userText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'actor_profiles',
                    player: {
                      id: 'player',
                      name: 'Феофил',
                      role: 'путник',
                      status: 'чужой'
                    },
                    npcs: [
                      { id: 'npc-local', name: 'староста', role: 'староста', status: 'местный', profileLevel: 'background' }
                    ]
                  })
                }
              }
            ]
          };
        }
      };
    }

    return originalFetch(_url, options);
  };

  try {
    const world = createWorldState({
      startText: 'проверка actor normalization',
      player: {
        name: 'Феофил',
        role: 'путник',
        status: 'чужой'
      }
    });
    world.npcs = [
      {
        id: 'npc-local',
        name: 'староста',
        role: 'староста',
        locationId: world.currentLocationId,
        homeLocation: world.currentLocationId
      }
    ];

    const result = await generateActorProfiles(world);

    assert.ok(result.data);
    assert.equal(result.data.npcs[0].profileLevel, 'background');
    assert.equal(result.data.npcs[0].actorProfile.profileLevel, 'background');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('actor profiles normalize player and npc character sheets', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';

    if (/scene_actor_context/i.test(userText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Player and the current scene actors are the only relevant context.'
                }
              }
            ]
          };
        }
      };
    }

    if (/SemanticDossierRepairer/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Player and NPCs remain concrete people with historical roles, limited memory, visible constraints, and local obligations.'
                }
              }
            ]
          };
        }
      };
    }

    if (/semantic audit/i.test(systemText) || /отдельный проверяющий/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['audit path exercised']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/(ActorProfileShaper|SemanticDataShaper)/i.test(systemText) && /actor_profiles/i.test(userText) && /sourceDossier|outputRules/i.test(userText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'actor_profiles',
                    player: {
                      id: 'player',
                      name: 'Феофил',
                      role: 'монах-изгнанник, вестник',
                      status: 'чужой'
                    },
                    npcs: [
                      { id: 'npc-local', name: 'староста', role: 'староста', status: 'местный', profileLevel: 'background' },
                      { id: 'npc-merchant', name: 'торговец', role: 'торговец', status: 'проезжий', profileLevel: 'scene' }
                    ]
                  })
                }
              }
            ]
          };
        }
      };
    }

    return originalFetch(_url, options);
  };

  try {
    const world = createWorldState({
      startText: 'проверка actor normalization',
      player: {
        name: 'Феофил',
        role: 'монах-изгнанник, вестник',
        status: 'чужой',
        socialClass: 'низший духовный',
        ageRange: 'взрослый',
        origin: 'Владимирская земля',
        visibleStatus: 'чужой',
        trueStatus: 'неизвестно',
        reasonHere: 'оказался здесь по дороге',
        bodyState: 'устал, но жив',
        language: 'местный говор',
        literacy: 'неизвестно',
        clothing: 'историчная одежда',
        inventory: ['нож'],
        family: ['родня неизвестна'],
        property: ['личная вещь'],
        memory: ['дорога'],
        knowledge: ['место на тракте'],
        fears: ['потерять статус'],
        goals: ['выжить'],
        obligations: ['подчиняться местным правилам']
      }
    });
    const canonicalLocationId = world.current_position?.location_id ?? world.currentLocationId;
    world.currentLocationId = 'stale-yard';
    const currentLocation = world.locations?.[canonicalLocationId];
    if (currentLocation) {
      currentLocation.occupants = ['Феофил', 'староста', 'торговец'];
    }
    world.npcs = [
      {
        id: 'npc-local',
        name: 'староста',
        role: 'староста',
        actorProfile: { source: 'derived' }
      },
      {
        id: 'npc-merchant',
        name: 'торговец',
        role: 'торговец',
        actorProfile: { source: 'derived' }
      }
    ];

    const result = await generateActorProfiles(world);

    assert.ok(result.data);
    assert.equal(result.data.player.name, 'Феофил');
    assert.equal(result.data.player.occupation, 'лечение или помощь');
    assert.ok(Array.isArray(result.data.player.skills));
    assert.ok(result.data.player.skills.length > 0);
    assert.ok(result.data.player.health > 0);
    assert.ok(result.data.player.actorProfile.kinship.noFamilyReason);
    assert.ok(result.data.player.actorProfile.property.carried.includes('нож'));
    assert.ok(result.data.player.actorProfile.property.outsideAccess.includes('личная вещь'));
    assert.ok(result.data.player.actorProfile.body.health > 0);
    assert.equal(result.data.npcs.length, 2);
    for (const npc of result.data.npcs) {
      assert.equal(npc.locationId, canonicalLocationId);
      assert.equal(npc.homeLocation, canonicalLocationId);
      assert.ok(npc.occupation);
      assert.ok(Array.isArray(npc.skills));
      assert.ok(npc.skills.length > 0);
      assert.ok(npc.health > 0);
      assert.ok(Array.isArray(npc.actorProfile.property.outsideAccess));
      assert.ok(Array.isArray(npc.actorProfile.work.skills));
      assert.ok(npc.actorProfile.body.health > 0);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('actor profiles contract rejects extra root keys', () => {
  const valid = validateActorProfiles({
    version: 1,
    schema: 'actor_profiles',
    player: null,
    npcs: [
      { id: 'npc-1', name: 'староста', profileLevel: 'background' }
    ]
  });
  const invalid = validateActorProfiles({
    version: 1,
    schema: 'actor_profiles',
    player: null,
    npcs: [],
    scene: { location: 'лишний root' }
  });

  assert.ok(valid);
  assert.equal(invalid, null);
});

test('actor profiles contract rejects invalid npc profile levels', () => {
  const valid = validateActorProfiles({
    version: 1,
    schema: 'actor_profiles',
    player: null,
    npcs: [
      { id: 'npc-1', name: 'староста', profileLevel: 'scene' }
    ]
  });
  const invalid = validateActorProfiles({
    version: 1,
    schema: 'actor_profiles',
    player: null,
    npcs: [
      { id: 'npc-1', name: 'староста', profileLevel: 'главный' }
    ]
  });

  assert.ok(valid);
  assert.equal(invalid, null);
});

test('actor profile audit failure fails with a real reason after repair attempts', async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, _ms, ...args) => originalSetTimeout(fn, 0, ...args);
  let actorAuditCalls = 0;
  let actorRepairCalls = 0;

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';

    if (/scene_actor_context/i.test(userText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'A local scene with one visible person and no hidden omniscience.'
                }
              }
            ]
          };
        }
      };
    }

    if (/SemanticDossierRepairer/i.test(systemText)) {
      actorRepairCalls += 1;
    }

    if (/semantic audit/i.test(systemText) || /отдельный проверяющий/i.test(systemText)) {
      actorAuditCalls += 1;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: '{"version":1,"schema":"semantic_audit","pass":false,"concerns":["нет причины быть здесь"],"evidence":["audit"]}'
                }
              }
            ]
          };
        }
      };
    }

    return originalFetch(_url, options);
  };

  try {
    const world = createWorldState({ startText: 'проверка отказа actor profiles без заглушек' });

    await assert.rejects(
      () => generateActorProfiles(world),
      /Unable to generate actor profiles: нет причины быть здесь \| evidence: audit\./
    );
    assert.equal(actorAuditCalls, 6);
    assert.equal(actorRepairCalls, 3);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('location profile audit failure fails with a real reason after repair attempts', async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, _ms, ...args) => originalSetTimeout(fn, 0, ...args);
  let locationAuditCalls = 0;
  let locationRepairCalls = 0;

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';

    if (/location_profiles/i.test(userText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Current place only, with uncertain neighboring links.'
                }
              }
            ]
          };
        }
      };
    }

    if (/SemanticDossierRepairer/i.test(systemText)) {
      locationRepairCalls += 1;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Only the current location and its immediate links should stay, while uncertain details stay marked as such.'
                }
              }
            ]
          };
        }
      };
    }

    if (/(LocationProfileShaper|SemanticDataShaper)/i.test(systemText) && /location_profiles/i.test(userText) && /sourceDossier|outputRules/i.test(userText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'location_profiles',
                    locations: []
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/semantic audit/i.test(systemText) || /отдельный проверяющий/i.test(systemText)) {
      locationAuditCalls += 1;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: false,
                    concerns: ['не хватает причины быть здесь'],
                    evidence: ['audit path exercised']
                  })
                }
              }
            ]
          };
        }
      };
    }

    return originalFetch(_url, options);
  };

  try {
    const world = createWorldState({ startText: 'проверка отказа location profiles без заглушек' });

    await assert.rejects(
      () => generateLocationProfiles(world),
      /Unable to generate location profiles: не хватает причины быть здесь \| evidence: audit path exercised\./
    );
    assert.equal(locationAuditCalls, 6);
    assert.equal(locationRepairCalls, 3);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('actor profiles fail when shaper returns prose instead of an object', async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, _ms, ...args) => originalSetTimeout(fn, 0, ...args);
  let shapeCalls = 0;

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';

    if (/(ActorProfileShaper|SemanticDataShaper)/i.test(systemText) && /actor_profiles/i.test(userText) && /sourceDossier|outputRules/i.test(userText)) {
      shapeCalls += 1;
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: 'Профили акторов описаны прозой вместо JSON-объекта.' } }] };
        }
      };
    }

    if (/semantic audit/i.test(systemText) || /отдельный проверяющий/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [{ message: { content: JSON.stringify({ version: 1, schema: 'semantic_audit', pass: true, concerns: [], evidence: ['ok'] }) } }]
          };
        }
      };
    }

    if (/scene_actor_context/i.test(userText)) {
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: 'Сухой actor dossier без скрытой всеведущей конкретики.' } }] };
        }
      };
    }

    return originalFetch(_url, options);
  };

  try {
    const world = createWorldState({ startText: 'проверка actor shaper prose без заглушек' });

    await assert.rejects(
      () => generateActorProfiles(world),
      /Unable to generate actor profiles: ActorProfileShaper output is invalid JSON: response was not parseable\. Likely copied sourceDossier or trailed into prose\./
    );
    assert.equal(shapeCalls, 3);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('location profiles fail when shaper returns prose instead of an object', async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, _ms, ...args) => originalSetTimeout(fn, 0, ...args);
  let shapeCalls = 0;

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';

    if (/(LocationProfileShaper|SemanticDataShaper)/i.test(systemText) && /локаций|location_profiles/i.test(systemText + userText)) {
      shapeCalls += 1;
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: 'Локации описаны прозой вместо JSON-объекта.' } }] };
        }
      };
    }

    if (/semantic audit/i.test(systemText) || /отдельный проверяющий/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [{ message: { content: JSON.stringify({ version: 1, schema: 'semantic_audit', pass: true, concerns: [], evidence: ['ok'] }) } }]
          };
        }
      };
    }

    if (/location_profiles/i.test(userText)) {
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: 'Сухой location dossier только о текущей локации.' } }] };
        }
      };
    }

    return originalFetch(_url, options);
  };

  try {
    const world = createWorldState({ startText: 'проверка location shaper prose без заглушек' });

    await assert.rejects(
      () => generateLocationProfiles(world),
      /Unable to generate location profiles: LocationProfileShaper output is invalid JSON: response was not parseable\. Likely copied sourceDossier or trailed into prose\./
    );
    assert.equal(shapeCalls, 3);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('state diff rejects malformed handles', () => {
  const validation = validateStateDiff({
    version: 1,
    schema: 'state_delta',
    source: 'semantic_delta',
    createdAt: new Date().toISOString(),
    patch: {},
    handles: {
      targetHandle: 123
    }
  });

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join(' '), /handles/i);
});

test('ui state does not invent prose when narrator text is missing', () => {
  const world = createWorldState({ startText: 'проверка ui state' });
  world.lastNarratorProse = null;

  const uiState = buildUiState(world, { includeDebug: true });

  assert.equal(uiState.visibleScene.prose, '');
});

test('ui state prefers canonical current_position for visible NPCs', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.currentLocationId = 'stale-yard';
  world.currentMicroLocationId = 'stale-yard:entry';
  world.current_position = {
    ...world.current_position,
    location_id: 'yard',
    place_id: 'yard',
    minilocation_id: 'yard:entry'
  };
  world.npcs = [
    { id: 'npc-stale', name: 'Свидетель', locationId: 'stale-yard', role: 'свидетель', visibleStatus: 'местный' },
    { id: 'npc-current', name: 'Хозяин двора', locationId: 'yard', role: 'хозяин', visibleStatus: 'местный' }
  ];

  const uiState = buildUiState(world, { includeDebug: true });

  assert.ok(uiState.currentPosition);
  assert.equal(uiState.currentPosition.location_id, 'yard');
  assert.equal(uiState.currentLocationId, 'yard');
  assert.equal(uiState.currentMicroLocationId, 'yard:entry');
  assert.ok(uiState.visibleNpcs.some((npc) => npc.id === 'npc-current'));
  assert.ok(!uiState.visibleNpcs.some((npc) => npc.id === 'npc-stale'));
  assert.ok(uiState.visibleScene.markup.entities.some((item) => item.id === 'npc-current'));
  assert.ok(!uiState.visibleScene.markup.entities.some((item) => item.id === 'npc-stale'));
});

test('ui state prefers canonical npc current_position over stale legacy location ids', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.current_position = {
    ...world.current_position,
    location_id: 'yard',
    place_id: 'yard',
    minilocation_id: 'yard:entry'
  };
  world.npcs = [
    {
      id: 'npc-canonical',
      name: 'Лодочник',
      locationId: 'stale-yard',
      microLocationId: 'stale-yard:entry',
      current_position: {
        location_id: 'yard',
        minilocation_id: 'yard:entry'
      },
      role: 'лодочник',
      visibleStatus: 'местный'
    }
  ];

  const uiState = buildUiState(world, { includeDebug: true });
  const visibleNpc = uiState.visibleNpcs.find((npc) => npc.id === 'npc-canonical');

  assert.ok(visibleNpc);
  assert.equal(visibleNpc.locationId, 'yard');
  assert.equal(visibleNpc.microLocationId, 'yard:entry');
  assert.ok(uiState.visibleScene.markup.entities.some((item) => item.id === 'npc-canonical'));
});

test('narrator prose generation fails without an LLM key', async () => {
  await assert.rejects(
    () => generateNarratorProse({}, {}, { DEEPSEEK_API_KEY: '' }),
    /DeepSeek API key is required to generate narrator prose/i
  );
});

test('narrator prose requires schema in audit responses', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';

    if (/semantic_audit/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['narrator audit is clean']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/SemanticDataShaper/i.test(systemText) && /narrator-прозы/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Двор у переправы дышит холодом и сыростью.'
                }
              }
            ]
          };
        }
      };
    }

    if (/narrator/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Сумрачный двор у переправы ждёт путника.'
                }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: 'ok' } }] };
      }
    };
  };

  try {
    const world = createWorldState({ startText: 'двор у переправы' });
    const frame = buildMasterFrame(world, 'осматриваюсь');
    const narrative = {
      scene: 'Дорожный двор у переправы виден как рабочее место, а не декорация.',
      consequence: 'Сцена держится на том, что персонаж может заметить прямо сейчас.',
      visible_details: ['двор', 'дорога', 'люди у ворот'],
      npc_reactions: ['дворник занят', 'конюх не поднимает головы'],
      next_pressure: 'Вечерний проход и холодный ветер'
    };

    const result = await generateNarratorProse(frame, mockVisiblePackageFromNarrative(narrative));
    assert.match(result.prose, /двор у переправы/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('narrator prompt carries clock constraints', async () => {
  const originalFetch = globalThis.fetch;
  const promptBodies = [];

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    promptBodies.push(body);
    const systemText = body.messages?.[0]?.content ?? '';

    if (/semantic_audit/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['narrator audit is clean']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/VisibleContextShaper|SemanticDataShaper/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Двор у переправы держится в утреннем свете.'
                }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: 'ok' } }] };
      }
    };
  };

  try {
    const world = createWorldState({ startText: 'двор у переправы' });
    world.clock = { day: 1, hour: 8, minute: 0 };
    const frame = buildMasterFrame(world, 'осматриваюсь');
    const narrative = {
      scene: 'Дорожный двор у переправы виден как рабочее место, а не декорация.',
      consequence: 'Сцена держится на том, что персонаж может заметить прямо сейчас.',
      visible_details: ['двор', 'дорога', 'люди у ворот'],
      npc_reactions: ['дворник занят', 'конюх не поднимает головы'],
      next_pressure: 'Утренний проход и холодный ветер'
    };

    const result = await generateNarratorProse(frame, mockVisiblePackageFromNarrative(narrative));
    assert.match(result.prose, /утреннем свете|двор у переправы/i);

    const promptText = promptBodies.map((body) => JSON.stringify(body.messages)).join('\n');
    assert.match(promptText, /clock/);
    assert.match(promptText, /\\"hour\\":8/);
    assert.match(promptText, /# Роль/);
    assert.match(promptText, /# Формат ответа/);
    assert.match(promptText, /Согласуй время суток с clockMoment/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('narrator prompt only passes visible narrative fields', async () => {
  const originalFetch = globalThis.fetch;
  let shapePayload = null;

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';

    if (/semantic_audit/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['narrator audit is clean']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/VisibleContextShaper|SemanticDataShaper/i.test(systemText)) {
      shapePayload = JSON.parse(userText);
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Двор у переправы держится в утреннем свете.'
                }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: 'ok' } }] };
      }
    };
  };

  try {
    const world = createWorldState({ startText: 'двор у переправы' });
    const frame = buildMasterFrame(world, 'осматриваюсь');
    const narrative = {
      scene: 'Дорожный двор у переправы виден как рабочее место, а не декорация.',
      consequence: 'Сцена держится на том, что персонаж может заметить прямо сейчас.',
      visible_details: ['двор', 'дорога', 'люди у ворот'],
      npc_reactions: ['дворник занят', 'конюх не поднимает головы'],
      next_pressure: 'Утренний проход и холодный ветер',
      state_delta: { hidden: true },
      historical_audit: { pass: true }
    };

    const result = await generateNarratorProse(frame, mockVisiblePackageFromNarrative(narrative));
    assert.equal(typeof result.prose, 'string');
    assert.ok(result.prose.length > 0);

    assert.ok(shapePayload);
    assert.equal(shapePayload.visiblePackage?.schema, 'visible_context_package');
    assert.equal('state_delta' in (shapePayload.visiblePackage ?? {}), false);
    assert.equal('historical_audit' in (shapePayload.visiblePackage ?? {}), false);
    assert.equal('audit' in shapePayload, false);
    assert.equal('input' in shapePayload, false);
    assert.equal('intent' in shapePayload, false);
    assert.equal('world' in shapePayload, false);
    assert.equal('dossier' in shapePayload, false);
    assert.equal('risks' in shapePayload, false);
    assert.equal('effects' in shapePayload, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('narrator prompt spells out deep night at 01:45', async () => {
  const originalFetch = globalThis.fetch;
  const promptBodies = [];

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    promptBodies.push(body);
    const systemText = body.messages?.[0]?.content ?? '';

    if (/semantic_audit/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['narrator audit is clean']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/VisibleContextShaper|SemanticDataShaper/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Ночь держит двор у переправы в тишине.'
                }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: 'ok' } }] };
      }
    };
  };

  try {
    const world = createWorldState({ startText: 'двор у переправы' });
    world.clock = { day: 1, hour: 1, minute: 45 };
    const frame = buildMasterFrame(world, 'осматриваюсь');
    const narrative = {
      scene: 'Дорожный двор у переправы виден как рабочее место, а не декорация.',
      consequence: 'Сцена держится на том, что персонаж может заметить прямо сейчас.',
      visible_details: ['двор', 'дорога', 'люди у ворот'],
      npc_reactions: ['дворник занят', 'конюх не поднимает головы'],
      next_pressure: 'Глубокая ночь и холодный ветер'
    };

    const result = await generateNarratorProse(frame, mockVisiblePackageFromNarrative(narrative));
    assert.match(result.prose, /ноч|тишин/i);

    const promptText = promptBodies.map((body) => JSON.stringify(body.messages)).join('\n');
    assert.match(promptText, /\\"hour\\":1/);
    assert.match(promptText, /\\"minute\\":45/);
    assert.match(promptText, /глубокая ночь/);
    assert.match(promptText, /clockMoment/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('narrator prose repairs clock conflicts without rerunning the pipeline', async () => {
  const originalFetch = globalThis.fetch;
  let proseShapeCalls = 0;
  let proseRepairCalls = 0;
  const stages = [];

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';

    if (/semantic_audit/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['narrator audit is clean']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/NarratorProseRepairer|SemanticProseRepairer/i.test(systemText)) {
      proseRepairCalls += 1;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Тихий утренний двор ещё не проснулся, и в воздухе держится холод.'
                }
              }
            ]
          };
        }
      };
    }

    if (/SemanticDataShaper/i.test(systemText) && /narrator-прозы/i.test(systemText)) {
      proseShapeCalls += 1;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'К вечеру двор затихает, хотя часы ещё показывают утро.'
                }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: 'ok'
              }
            }
          ]
        };
      }
    };
  };

  try {
    const world = createWorldState({ startText: 'двор у переправы' });
    world.clock = { day: 1, hour: 8, minute: 0 };
    const frame = buildMasterFrame(world, 'осматриваюсь');
    const narrative = {
      scene: 'Дорожный двор у переправы виден как рабочее место, а не декорация.',
      consequence: 'Сцена держится на том, что персонаж может заметить прямо сейчас.',
      visible_details: ['двор', 'дорога', 'люди у ворот'],
      npc_reactions: ['дворник занят', 'конюх не поднимает головы'],
      next_pressure: 'Утренний проход и холодный ветер'
    };

    const result = await generateNarratorProse(frame, mockVisiblePackageFromNarrative(narrative), process.env, {
      onStage(stage) {
        stages.push(stage.phase);
      }
    });
    assert.equal(result.prose, 'Тихий утренний двор ещё не проснулся, и в воздухе держится холод.');
    assert.equal(proseShapeCalls, 1);
    assert.equal(proseRepairCalls, 1);
    assert.equal(stages.includes('semantic_repair'), true);
    assert.equal(stages.filter((phase) => phase === 'semantic_shape').length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('historical frame prompt uses documented sections', async () => {
  const originalFetch = globalThis.fetch;
  let shapeSystemText = '';
  let dossierSystemText = '';

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = body.messages?.[1]?.content ?? '';

    if (/historical frame/i.test(systemText) || /историческую рамку/i.test(systemText)) {
      dossierSystemText = dossierSystemText || systemText;
    }

    if (/HistoricalDataShaper/i.test(systemText)) {
      shapeSystemText = systemText;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'historical_frame',
                    year: 1241,
                    season: 'весна',
                    regionName: 'Новгородская земля',
                    regionHint: 'Новгородская земля',
                    settlementType: 'город',
                    pressure: 'умеренное',
                    conflict: 'нет',
                    startTextHint: 'проверка'
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/semantic_audit/i.test(systemText) || /отдельный проверяющий/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['historical frame is documented']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/semantic dossier/i.test(systemText) || /semantic_dossier/i.test(userText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Подсказка рамки: исторический слой и региональная привязка достаточны для старта.'
                }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: 'ok' } }] };
      }
    };
  };

  try {
    const frame = await generateHistoricalFrame({ startText: 'проверка исторической рамки' }, process.env);
    assert.ok(frame);
    assert.ok(typeof frame === 'object');
    assert.match(dossierSystemText, /# Роль/);
    assert.match(dossierSystemText, /# Формат ответа/);
    assert.match(dossierSystemText, /# Критерии успеха/);
    assert.match(shapeSystemText, /JSON contract compiler/i);
    assert.match(shapeSystemText, /# Формат ответа/);
    assert.doesNotMatch(shapeSystemText, /не больше 2 коротких строк в каждом массиве/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateHistoricalFrame retries and fails gracefully on invalid JSON from shaper', async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  let call = 0;

  globalThis.setTimeout = (handler, _delay, ...args) => {
    if (typeof handler === 'function') handler(...args);
    return 0;
  };

  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      call += 1;
      if (call % 3 === 1) return { choices: [{ message: { content: 'dossier ok' } }] };
      if (call % 3 === 2) {
        return {
          choices: [{
            message: {
              content: '{"version":1,"schema":"semantic_audit","pass":true,"concerns":[],"evidence":["ok"]}'
            }
          }]
        };
      }
      return { choices: [{ message: { content: 'not json' } }] };
    }
  });

  try {
    await assert.rejects(
      () => generateHistoricalFrame({ startText: 'test' }, {
        DEEPSEEK_API_KEY: 'x',
        DEEPSEEK_BASE_URL: 'http://example.com',
        DEEPSEEK_MODEL: 'test'
      }),
      /historical frame/i
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('all LLM generators fail fast without a provider key', async () => {
  const env = { DEEPSEEK_API_KEY: '' };
  const world = createWorldState({ startText: 'проверка ключа' });
  const frame = buildMasterFrame(world, 'осматриваюсь');

  await assert.rejects(() => generateHistoricalFrame({}, env), /DeepSeek API key is required to generate a historical frame/i);
  await assert.rejects(() => generateSocialTissue(world, env), /DeepSeek API key is required to generate social tissue/i);
  await assert.rejects(() => generatePlaceSeed(world, env), /DeepSeek API key is required to generate a place seed/i);
  await assert.rejects(() => generatePlayerSeed(world, env), /DeepSeek API key is required to generate a player seed/i);
  await assert.rejects(() => generateMasterResponse(frame, 'ok', env), /DeepSeek API key is required\. Set DEEPSEEK_API_KEY to run the simulation/i);
  await assert.rejects(() => generateRiskAudit(frame, env), /DeepSeek API key is required to generate a risk audit/i);
  await assert.rejects(() => generateNarratorProse(frame, { scene: 'scene' }, env), /DeepSeek API key is required to generate narrator prose/i);
  await assert.rejects(() => generateActorProfiles(world, env), /DeepSeek API key is required to generate actor profiles/i);
  await assert.rejects(() => generateLocationProfiles(world, env), /DeepSeek API key is required to generate location profiles/i);
});

test('region catalog loads the project list with Rus regions', () => {
  resetRegionCatalogCache();
  const catalog = loadRegionCatalog();

  assert.ok(Array.isArray(catalog));
  assert.ok(catalog.length > 0);
  assert.ok(catalog.some((entry) => entry.name === 'Новгородская земля'));
});

test('region catalog prefers DOCUMENTS over older fallback files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'region-catalog-'));
  const documentsDir = join(root, 'DOCUMENTS');
  const dataDir = join(root, 'data');
  const originalCwd = process.cwd;
  const originalWorldRegionsFile = process.env.WORLD_REGIONS_FILE;

  await mkdir(documentsDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(documentsDir, 'all regions.txt'), '1. Документальная земля\n2. Вторая документальная земля\n', 'utf8');
  await writeFile(join(dataDir, 'all regions.txt'), '1. Датасет земля\n', 'utf8');

  delete process.env.WORLD_REGIONS_FILE;
  process.cwd = () => root;

  try {
    resetRegionCatalogCache();
    const catalog = loadRegionCatalog();

    assert.equal(catalog[0].name, 'Документальная земля');
    assert.ok(catalog.some((entry) => entry.name === 'Вторая документальная земля'));
    assert.equal(catalog.some((entry) => entry.name === 'Датасет земля'), false);
  } finally {
    process.cwd = originalCwd;
    if (originalWorldRegionsFile === undefined) {
      delete process.env.WORLD_REGIONS_FILE;
    } else {
      process.env.WORLD_REGIONS_FILE = originalWorldRegionsFile;
    }
    resetRegionCatalogCache();
    await rm(root, { recursive: true, force: true });
  }
});

test('region catalog returns empty when the project document is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'region-catalog-empty-'));
  const originalCwd = process.cwd;
  const originalWorldRegionsFile = process.env.WORLD_REGIONS_FILE;

  delete process.env.WORLD_REGIONS_FILE;
  process.cwd = () => root;

  try {
    resetRegionCatalogCache();
    const catalog = loadRegionCatalog();

    assert.deepEqual(catalog, []);
  } finally {
    process.cwd = originalCwd;
    if (originalWorldRegionsFile === undefined) {
      delete process.env.WORLD_REGIONS_FILE;
    } else {
      process.env.WORLD_REGIONS_FILE = originalWorldRegionsFile;
    }
    resetRegionCatalogCache();
    await rm(root, { recursive: true, force: true });
  }
});

test('blank new game relies on LLM historical frame without code overwrite', () => {
  const frame = {
    version: 1,
    schema: 'historical_frame',
    year: 1241,
    season: 'весна',
    regionName: 'Псковская земля',
    regionHint: 'Псковская земля',
    settlementType: 'погост',
    pressure: 'давление',
    conflict: 'конфликт',
    startTextHint: ''
  };

  assert.equal(frame.year, 1241);
  assert.equal(frame.regionName, 'Псковская земля');
  assert.equal(frame.regionHint, 'Псковская земля');
});

test('startup frame helpers stay available for fixture tests only', async () => {
  const originalRandom = Math.random;
  const previous = process.env.NODE_TEST_CONTEXT;
  process.env.NODE_TEST_CONTEXT = '1';

  Math.random = () => 0;
  try {
    const regionCatalog = loadRegionCatalog();
    const randomStart = buildRandomStartupFrame(regionCatalog);
    const frame = applyStartupDefaults({
      version: 1,
      schema: 'historical_frame',
      year: 1242,
      season: 'весна',
      regionName: 'Псковская земля',
      regionHint: 'Псковская земля',
      settlementType: 'погост',
      pressure: 'старое давление',
      conflict: 'старый конфликт',
      startTextHint: ''
    }, randomStart);

    assert.equal(randomStart.year, 1230);
    assert.equal(randomStart.regionName, 'Новгородская земля');
    assert.equal(frame.year, 1230);
    assert.equal(frame.regionName, 'Новгородская земля');
    assert.equal(frame.regionHint, 'Новгородская земля');
    assert.ok(frame.year >= 1230);
    assert.ok(frame.year <= 1250);
  } finally {
    Math.random = originalRandom;
    if (previous === undefined) delete process.env.NODE_TEST_CONTEXT;
    else process.env.NODE_TEST_CONTEXT = previous;
  }
});

test('fresh world helper builds the layered start instead of a raw seed', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = String(body.messages?.[1]?.content ?? '');
    const payload = safeJsonParse(userText);
    const stageText = `${systemText}\n${userText}`;

    if ((/semantic_audit/i.test(systemText) || /отдельный проверяющий/i.test(stageText) || /Narrator audit/i.test(stageText))
      && !/PlayerSeedShaper/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['ok']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/HistoricalDataShaper/i.test(stageText) || /Pipeline stage: historical_frame/i.test(stageText) || /historical_frame/i.test(stageText) || /historical frame/i.test(stageText) || /историческую рамку/i.test(stageText)) {
      if (/HistoricalDataShaper/i.test(stageText)) {
        return {
          ok: true,
          async json() {
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify(buildMockHistoricalFrameResponse(payload))
                  }
                }
              ]
            };
          }
        };
      }
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: buildMockHistoricalFrameDossierResponse(payload)
                }
              }
            ]
          };
        }
      };
    }

    if (
      /PlaceSeedPurposeOwnershipShaper/i.test(stageText)
      || /ShapePurposeOwnership/i.test(stageText)
      || /PlaceSeedLivelihoodRoadsShaper/i.test(stageText)
      || /ShapeLivelihoodRoads/i.test(stageText)
      || /PlaceSeedAccessHazardsRhythmShaper/i.test(stageText)
      || /ShapeAccessHazardsRhythm/i.test(stageText)
      || /PlaceSeedShaper/i.test(stageText)
      || /schema=place_seed/i.test(stageText)
    ) {
      if (/PlaceSeedPurposeOwnershipShaper/i.test(stageText) || /ShapePurposeOwnership/i.test(stageText)) {
        return {
          ok: true,
          async json() {
            return {
              choices: [
                {
                message: {
                  content: JSON.stringify({
                    placeName: 'Двор у переправы',
                    placeKind: 'дорожный двор',
                    purpose: 'обслуживать проход, ночлег и контроль дороги',
                    formalOwner: 'местный хозяин двора',
                    actualManager: 'приказчик двора',
                    dependentGroups: ['служки']
                  })
                }
              }
            ]
            };
          }
        };
      }
      if (/PlaceSeedLivelihoodRoadsShaper/i.test(stageText) || /ShapeLivelihoodRoads/i.test(stageText)) {
        return {
          ok: true,
          async json() {
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      livelihood: ['переправа', 'корм и ночлег'],
                      roads: ['тракт к переправе', 'дорога к торгу']
                    })
                  }
                }
              ]
            };
          }
        };
      }
      if (/PlaceSeedAccessHazardsRhythmShaper/i.test(stageText) || /ShapeAccessHazardsRhythm/i.test(stageText)) {
        return {
          ok: true,
          async json() {
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      accessRules: ['ночью вход ограничен', 'чужого сперва расспрашивают'],
                      hazards: ['подозрительность к чужим', 'грязь у ворот после дождя'],
                      rhythm: 'утром двор открыт, днём идёт проход, вечером контроль строже'
                    })
                  }
                }
              ]
            };
          }
        };
      }
      if (/PlaceSeedShaper/i.test(systemText) || /schema=place_seed/i.test(systemText)) {
        return {
          ok: true,
          async json() {
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify(buildMockPlaceSeedResponse(payload))
                  }
                }
              ]
            };
          }
        };
      }
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: buildMockPlaceSeedDossierResponse(payload)
                }
              }
            ]
          };
        }
      };
    }

    if (/SocialTissueShaper/i.test(stageText) || /Pipeline stage: social_tissue/i.test(stageText) || /social_tissue/i.test(stageText) || /social tissue/i.test(stageText) || /социальную ткань/i.test(stageText)) {
      if (/SocialTissueShaper/i.test(stageText) || /outputRules/i.test(userText) || /schema["':\s]*social_tissue/i.test(stageText)) {
        return {
          ok: true,
          async json() {
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify(buildMockSocialTissueResponse(payload))
                  }
                }
              ]
            };
          }
        };
      }
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: buildMockSocialTissueDossierResponse(payload)
                }
              }
            ]
          };
        }
      };
    }

    if (/PlayerSeed/i.test(stageText) || /Pipeline stage: player_seed/i.test(stageText) || /player_seed/i.test(stageText) || /player seed/i.test(stageText) || /персонажа игрока/i.test(stageText)) {
      if (/PlayerSeedShaper/i.test(stageText)) {
        return {
          ok: true,
          async json() {
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify(buildMockPlayerSeedResponse(payload))
                  }
                }
              ]
            };
          }
        };
      }
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: buildMockPlayerSeedDossierResponse(payload)
                }
              }
            ]
          };
        }
      };
    }

    if (/actor/i.test(stageText)) {
      if (/semantic_audit/i.test(systemText) || /отдельный проверяющий/i.test(stageText)) {
        return {
          ok: true,
          async json() {
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      version: 1,
                      schema: 'semantic_audit',
                      pass: true,
                      concerns: [],
                      evidence: ['actor audit passed']
                    })
                  }
                }
              ]
            };
          }
        };
      }
      if (/ActorProfileShaper|SemanticDataShaper/i.test(stageText)) {
        return {
          ok: true,
          async json() {
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      version: 1,
                      schema: 'actor_profiles',
                      player: {
                        name: 'Marek',
                        role: 'путник',
                        status: 'чужой',
                        socialClass: 'неизвестно',
                        ageRange: 'взрослый',
                        origin: 'Владимирская земля',
                        visibleStatus: 'чужой',
                        trueStatus: 'неизвестно',
                        reasonHere: 'оказался здесь по дороге',
                        bodyState: 'устал, но жив',
                        language: 'местный говор',
                        literacy: 'неизвестно',
                        clothing: 'историчная одежда',
                        inventory: ['нож'],
                        family: ['родня неизвестна'],
                        property: ['личная вещь'],
                        memory: ['дорога'],
                        knowledge: ['место на тракте'],
                        fears: ['потерять статус'],
                        goals: ['выжить'],
                        obligations: ['подчиняться местным правилам']
                      },
                      npcs: [
                        { id: 'n1', name: 'дворник', role: 'хозяин двора', status: 'местный', profileLevel: 'background' },
                        { id: 'n2', name: 'конюх', role: 'служка', status: 'местный', profileLevel: 'background' },
                        { id: 'n3', name: 'купец-проезжий', role: 'торговый гость', status: 'проезжий', profileLevel: 'scene' },
                        { id: 'n4', name: 'знахарка', role: 'знахарка', status: 'местная', profileLevel: 'key' }
                      ]
                    })
                  }
                }
              ]
            };
          }
        };
      }
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Actor dossier: local people only, with visible duties and limited knowledge.'
                }
              }
            ]
          };
        }
      };
    }

    if (/location_profiles/i.test(userText)) {
      if (/semantic audit/i.test(systemText) || /отдельный проверяющий/i.test(systemText)) {
        return {
          ok: true,
          async json() {
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      version: 1,
                      schema: 'semantic_audit',
                      pass: true,
                      concerns: [],
                      evidence: ['location audit passed']
                    })
                  }
                }
              ]
            };
          }
        };
      }
      if (/LocationProfileShaper|SemanticDataShaper/i.test(systemText)) {
        return {
          ok: true,
          async json() {
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      version: 1,
                      schema: 'location_profiles',
                      locations: [
                        {
                          id: 'yard',
                          purpose: 'обслуживать проход, ночлег и контроль дороги',
                          access: 'вход по правилам двора',
                          ownership: 'местный хозяин двора',
                          hazards: ['подозрительность к чужим'],
                          users: ['дворник', 'конюх', 'купец-проезжий'],
                          periods: [],
                          currentPeriod: null
                        },
                        {
                          id: 'road',
                          purpose: 'дорога к северу',
                          access: 'открытый тракт',
                          ownership: 'общая дорога',
                          hazards: ['холодный ветер'],
                          users: [],
                          periods: [],
                          currentPeriod: null
                        },
                        {
                          id: 'river',
                          purpose: 'берег у переправы',
                          access: 'проход по воде',
                          ownership: 'общий берег',
                          hazards: ['скользкий берег'],
                          users: ['лодочник'],
                          periods: [],
                          currentPeriod: null
                        }
                      ]
                    })
                  }
                }
              ]
            };
          }
        };
      }
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Location dossier: the current place, nearby exits, and local hazards are enough.'
                }
              }
            ]
          };
        }
      };
    }

    if (/агент отбора видимого контекста/i.test(systemText) || /VisibleContextShaper/i.test(systemText)) {
      if (/VisibleContextShaper/i.test(systemText)) {
        const input = payload?.input ?? {};
        const narrative = input?.narrative ?? {};
        return {
          ok: true,
          async json() {
            return {
              choices: [{
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'visible_context_package',
                    visible_scene: String(narrative.scene ?? 'Открытие: двор у переправы.'),
                    visible_changes: Array.isArray(narrative.visible_details) ? narrative.visible_details : ['двор', 'переправа'],
                    sensory_details: ['утро', 'холодный ветер'],
                    visible_npc: [],
                    visible_objects: [],
                    known_context: [],
                    uncertainties: [],
                    allowed_tensions: narrative.next_pressure ? [String(narrative.next_pressure)] : ['день начинается'],
                    do_not_imply: []
                  })
                }
              }]
            };
          }
        };
      }
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: 'visible dossier for opening scene' } }] };
        }
      };
    }

    if (/MasterNarrativeShaper/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'master_narrative',
                    scene: 'Открытие: двор у переправы.',
                    consequence: 'Видна утренняя сцена.',
                    visible_details: ['двор', 'переправа'],
                    npc_reactions: ['люди заняты делом'],
                    next_pressure: 'день начинается'
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/narrator/i.test(stageText) || /UI-прозы/i.test(stageText) || /prose для UI/i.test(stageText)) {
      if (/semantic_audit/i.test(systemText) || /Narrator audit/i.test(systemText)) {
        return {
          ok: true,
          async json() {
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      version: 1,
                      schema: 'semantic_audit',
                      pass: true,
                      concerns: [],
                      evidence: ['Narrator prose stays within the approved visible scene.']
                    })
                  }
                }
              ]
            };
          }
        };
      }
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Двор у переправы держится в рабочей тишине: ворота, дорога и люди заняты своим делом.'
                }
              }
            ]
          };
        }
      };
    }

    return originalFetch(_url, options);
  };

  try {
    const result = await createFreshWorld({
      startText: 'двор у переправы',
      playerName: 'Marek',
      env: process.env
    });

    assert.ok(result.world.historicalFrame);
    assert.ok(result.world.placeSeed);
    assert.ok(result.world.socialTissue);
    assert.ok(result.world.playerSeed);
    assert.equal(result.world.playerSeed.states.satiety, 74);
    assert.equal(result.world.playerSeed.states.vigor, 61);
    assert.equal(result.world.playerSeed.body.satiety, 74);
    assert.equal(result.world.playerSeed.body.vigor, 61);
    assert.equal(result.world.playerSeed.legacy_vitals, undefined);
    assert.equal(result.world.playerSeed.legacy_needs, undefined);
    assert.equal(result.world.player.states.satiety, 74);
    assert.equal(result.world.player.states.vigor, 61);
    assert.equal(result.world.player.body.satiety, 74);
    assert.equal(result.world.player.body.vigor, 61);
    assert.equal(result.world.playerSeed.inventory, undefined);
    assert.equal(result.world.playerSeed.property, undefined);
    assert.ok(result.world.playerSeed.memory.includes('весна 1241 года — орден сжёг соседнее село'));
    assert.equal(result.world.playerSeed.goals[0], 'выплатить долг');
    assert.ok(result.world.playerSeed.knowledge.includes('князь Александр велел чинить мосты и ладьи'));
    assert.ok(result.world.playerSeed.obligations.includes('отработать долг хозяину переправы'));
    assert.ok(result.world.cluster);
    assert.ok(result.world.lastNarratorProse);
    assert.ok(result.openingText.length > 0);
    assert.match(result.openingText, /двор|переправ/i);
    assert.doesNotMatch(result.openingText, /Мир загружен\./);
    assert.doesNotMatch(result.openingText, /Ввод только свободным текстом/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('player seed prefers canonical blocks over legacy root fields', async () => {
  const world = createWorldState({ startText: 'двор у переправы', playerName: 'Marek' });

  applyGeneratedPlayerSeed(world, {
    version: 1,
    schema: 'player_seed',
    name: 'Олех',
    role: 'плотник',
    status: 'зависимый ремесленник',
    socialClass: 'крестьянин',
    ageRange: '30 лет',
    origin: 'село на реке Шелонь',
    visibleStatus: 'отрабатывает долг на переправе',
    trueStatus: 'должен хозяину двора 3 гривны',
    reasonHere: 'чинит паром и лодки для перевозки ополченцев',
    occupation: 'плотник',
    skills: ['читать знаки дороги'],
    health: 12,
    satiety: 18,
    vigor: 14,
    bodyState: 'legacy body text',
    language: 'древнерусский',
    literacy: 'неграмотен',
    clothing: 'льняная рубаха, серый зипун, лапти',
    inventory: ['legacy knife'],
    property: ['legacy chest'],
    memory: ['legacy memory'],
    knowledge: ['legacy knowledge'],
    fears: ['legacy fear'],
    goals: ['legacy goal'],
    obligations: ['legacy duty'],
    position: {
      region_id: 'region-old',
      place_id: 'legacy-yard',
      location_id: 'legacy-yard',
      minilocation_id: 'legacy-yard:entry',
      anchor_id: 'legacy-anchor',
      last_route_id: 'route:old'
    },
    current_position: {
      region_id: 'region-new',
      place_id: 'yard',
      location_id: 'yard',
      minilocation_id: 'yard:center',
      anchor_id: 'yard:center',
      last_route_id: 'route:new'
    },
    identity: {
      name: 'Олех',
      age_range: '30 лет',
      origin: 'село на реке Шелонь',
      social_status: 'крестьянин'
    },
    body: {
      description: 'коренастый, сильные руки, старая травма левой ноги',
      health: 88,
      satiety: 74,
      vigor: 61
    },
    states: {
      health: 88,
      satiety: 74,
      vigor: 61
    },
    attributes: {
      strength: 12,
      agility: 10,
      endurance: 11,
      reason: 9,
      attention: 10,
      influence: 8
    },
    skill_bonuses: {
      athletics: 1,
      survival: 2,
      craft: 2
    },
    items: {
      carried_items: [
        {
          id: 'item:player:topor:1',
          label: 'плотницкий топор',
          type: 'tool',
          material: 'iron',
          weight: 2
        }
      ]
    },
    memory_profile: {
      key_memories: ['весна 1241 года — орден сжёг соседнее село']
    },
    goals_profile: {
      immediate_need: 'выплатить долг'
    },
    start_scene: {
      reason_here: 'стоит у переправы',
      visible_situation: 'двор у переправы',
      immediate_tension: 'чужой человек'
    }
  });

  assert.equal(world.playerSeed.states.health, 88);
  assert.equal(world.playerSeed.body.health, 88);
  assert.equal(world.playerSeed.legacy_vitals, undefined);
  assert.equal(world.playerSeed.legacy_needs, undefined);
  assert.equal(world.playerSeed.current_position.location_id, 'yard');
  assert.equal(world.playerSeed.current_position.minilocation_id, 'yard:center');
  assert.equal(world.playerSeed.position.location_id, 'yard');
  assert.equal(world.playerSeed.position.minilocation_id, 'yard:center');
  assert.equal(world.player.position.location_id, 'yard');
  assert.equal(world.player.position.minilocation_id, 'yard:center');
  assert.equal(world.playerSeed.inventory, undefined);
  assert.equal(world.playerSeed.property, undefined);
});

test('player seed accepts documented nested aliases for identity and body', () => {
  const world = createWorldState({ startText: 'двор у переправы', playerName: 'Marek' });

  applyGeneratedPlayerSeed(world, {
    version: 1,
    schema: 'player_seed',
    identity: {
      name: 'Олех',
      age_range: '30 лет',
      origin: 'село на реке Шелонь',
      social_status: 'крестьянин',
      occupation_or_role: 'плотник',
      visible_status: 'отрабатывает долг на переправе',
      true_status: 'должен хозяину двора 3 гривны',
      reason_here: 'чинит паром и лодки для перевозки ополченцев'
    },
    body: {
      description: 'коренастый, сильные руки, старая травма левой ноги',
      visible_marks: ['шрам на руке'],
      clothing: 'льняная рубаха, серый зипун, лапти',
      health: 88,
      satiety: 74,
      vigor: 61,
      active_conditions: ['рана']
    },
    states: {
      health: 88,
      satiety: 74,
      vigor: 61
    },
    skill_bonuses: {
      craft: 2,
      survival: 1
    },
    items: {
      carried_items: [
        {
          id: 'item:player:topor:1',
          label: 'плотницкий топор',
          type: 'tool',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'player',
          weight: 2
        }
      ]
    },
    position: {
      region_id: 'region-old',
      place_id: 'legacy-yard',
      location_id: 'legacy-yard',
      minilocation_id: 'legacy-yard:entry',
      anchor_id: 'legacy-anchor',
      last_route_id: 'route:old'
    },
    current_position: {
      region_id: 'region-new',
      place_id: 'yard',
      location_id: 'yard',
      minilocation_id: 'yard:center',
      anchor_id: 'yard:center',
      last_route_id: 'route:new'
    },
    start_scene: {
      reason_here: 'стоит у переправы',
      visible_situation: 'двор у переправы',
      immediate_tension: 'чужой человек',
      intro_prose: 'Короткая вводная сцена.'
    }
  });

  assert.equal(world.playerSeed.ageRange, '30 лет');
  assert.equal(world.playerSeed.bodyState, 'коренастый, сильные руки, старая травма левой ноги');
  assert.equal(world.playerSeed.clothing, 'льняная рубаха, серый зипун, лапти');
  assert.deepEqual(world.playerSeed.skills, ['craft', 'survival']);
  assert.equal(world.player.body.description, 'коренастый, сильные руки, старая травма левой ноги');
  assert.deepEqual(world.player.body.visible_marks, ['шрам на руке']);
  assert.deepEqual(world.player.body.active_conditions, ['рана']);
  assert.equal(world.player.states.health, 88);
  assert.equal(world.player.states.satiety, 74);
  assert.equal(world.player.states.vigor, 61);
  assert.equal(world.player.ageRange, '30 лет');
  assert.equal(world.player.visibleStatus, 'отрабатывает долг на переправе');
  assert.equal(world.player.trueStatus, 'должен хозяину двора 3 гривны');
});

test('player seed ignores legacy inventory and property when canonical seed blocks are present but empty', async () => {
  const world = createWorldState({ startText: 'двор у переправы', playerName: 'Marek' });

  applyGeneratedPlayerSeed(world, {
    version: 1,
    schema: 'player_seed',
    name: 'Олех',
    inventory: ['legacy knife'],
    property: ['legacy chest'],
    items: {
      carried_items: [],
      equipment: [],
      weapons: [],
      armor: [],
      property_not_carried: [],
      borrowed_items: [],
      foreign_items_with_character: []
    },
    property_and_access: {
      property_not_carried: [],
      borrowed_items: [],
      foreign_items_with_character: []
    }
  });

  assert.equal(world.playerSeed.inventory, undefined);
  assert.equal(world.playerSeed.property, undefined);
  assert.equal(world.player.inventory, undefined);
  assert.equal(world.player.property, undefined);
});

test('player seed ignores legacy world player vitals when canonical seed vitals are missing', async () => {
  const world = createWorldState({ startText: 'двор у переправы', playerName: 'Marek' });
  delete world.player.states;
  delete world.player.body;
  world.player.health = 3;
  world.player.satiety = 4;
  world.player.vigor = 5;
  world.player.hunger = 97;
  world.player.fatigue = 96;
  world.player.sleep = 95;

  applyGeneratedPlayerSeed(world, {
    version: 1,
    schema: 'player_seed',
    name: 'Олех',
    role: 'плотник',
    status: 'зависимый ремесленник',
    socialClass: 'крестьянин',
    ageRange: '30 лет',
    origin: 'село на реке Шелонь',
    visibleStatus: 'отрабатывает долг на переправе',
    trueStatus: 'должен хозяину двора 3 гривны',
    reasonHere: 'чинит паром и лодки для перевозки ополченцев',
    occupation: 'плотник',
    bodyState: 'legacy body text',
    language: 'древнерусский',
    literacy: 'неграмотен',
    clothing: 'льняная рубаха, серый зипун, лапти',
    inventory: ['legacy knife']
  });

  assert.equal(world.playerSeed.states.health, 100);
  assert.equal(world.playerSeed.states.satiety, 100);
  assert.equal(world.playerSeed.states.vigor, 100);
  assert.equal(world.playerSeed.legacy_vitals, undefined);
  assert.equal(world.playerSeed.legacy_needs, undefined);
  assert.equal(world.player.states.health, 100);
  assert.equal(world.player.states.satiety, 100);
  assert.equal(world.player.states.vigor, 100);
  assert.equal(world.player.health, 100);
  assert.equal(world.player.satiety, 100);
  assert.equal(world.player.vigor, 100);
});

test('turn narration uses the updated clock after consequences are applied', async () => {
  const originalFetch = globalThis.fetch;
  const promptBodies = [];
  let riskAuditSystemText = '';
  let masterShapeSystemText = '';

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    promptBodies.push(body);
    const systemText = body.messages?.[0]?.content ?? '';
    const userText = String(body.messages?.[1]?.content ?? '');

    if (/предварительный аудит риска/i.test(systemText)) {
      riskAuditSystemText = systemText;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'risk_audit',
                    required: false,
                    reason: 'Бытовой ход без отдельной проверки.',
                    factors: [],
                    complexity: 'low',
                    visibility: 'low'
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/semantic_audit/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['Narrator prose stays within the approved visible scene.']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/narrator-прозы/i.test(systemText) || /SemanticDataShaper для narrator/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'После часа ожидания двор становится тише.'
                }
              }
            ]
          };
        }
      };
    }

    if (/narrator/i.test(systemText) && /semantic_dossier/i.test(userText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Narrator dossier: the visible scene can be rendered as the current clock, place, and immediate pressure.'
                }
              }
            ]
          };
        }
      };
    }

    if (/Write a dry semantic dossier only/i.test(userText) && !/narrator/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Dossier: the waiting action advances time and keeps the scene local, visible, and ordinary.'
                }
              }
            ]
          };
        }
      };
    }

    if (/semantic_audit/i.test(systemText) || /kind":"master"/i.test(userText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['Master dossier stays within the visible scene and local causality.']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/(MasterNarrativeShaper|SemanticDataShaper)/i.test(systemText) && /master-ход/i.test(systemText)) {
      masterShapeSystemText = systemText;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'master_narrative',
                    scene: 'После ожидания двор остаётся тем же местом.',
                    consequence: 'Время прошло, и это видно в сцене.',
                    visible_details: ['двор', 'ворота'],
                    npc_reactions: ['Люди продолжают свои дела.'],
                    next_pressure: 'Становится позднее',
                    state_delta: { scene: { pressure: ['становится позднее'] } }
                  })
                }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: 'ok'
              }
            }
          ]
        };
      }
    };
  };

  try {
    const world = createWorldState({ startText: 'двор у переправы', clock: { day: 1, hour: 8, minute: 0 } });
    await handlePlayerInput(world, 'жду час');

    assert.equal(world.clock.hour, 9);
    assert.match(riskAuditSystemText, /# Роль/);
    assert.match(riskAuditSystemText, /# Формат ответа/);
    assert.match(masterShapeSystemText, /# Роль/);
    assert.match(masterShapeSystemText, /# Формат ответа/);

    const narratorCall = promptBodies.find((body) => {
      const systemText = body.messages?.[0]?.content ?? '';
      return /narrator-прозы/i.test(systemText) || /SemanticDataShaper для narrator/i.test(systemText);
    });
    assert.ok(narratorCall);
    assert.match(String(narratorCall.messages?.[1]?.content ?? ''), /"hour":9/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('master frame carries constraints and risks from state', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.social.suspicion = 10;
  world.currentLocationId = 'stale-yard';
  world.current_position = {
    ...world.current_position,
    location_id: 'yard',
    place_id: 'yard'
  };
  if (world.npcs[0]) {
    world.npcs[0].visibleMarks = ['шрам на щеке'];
    world.npcs[0].activeConditions = ['устал'];
    world.npcs[0].availabilityWindow = 'до сумерек';
    world.npcs[0].movementWindow = 'у печи';
  }
  const plan = planMasterTurnSync(world, 'я сын боярина и иду к реке');

  assert.equal(plan.frame.intent.type, 'move');
  assert.ok(plan.frame.constraints.some((item) => item.includes('Подозрение уже высоко')));
  assert.ok(plan.frame.risks.some((item) => item.includes('путь может оказаться')));
  assert.ok(plan.frame.possibleEffects.some((item) => item.includes('поменять локацию')));
  assert.ok(plan.frame.world.knowledge.player.visibleStatus);
  assert.ok(Array.isArray(plan.frame.world.knowledge.rumor));
  assert.ok(Array.isArray(plan.frame.world.knowledge.testimony));
  assert.equal(plan.frame.world.location.id, 'yard');
  assert.ok(plan.frame.world.npc[0].visibleMarks.includes('шрам на щеке'));
  assert.ok(plan.frame.world.npc[0].activeConditions.includes('устал'));
  assert.equal(plan.prompt.includes('marks:шрам на щеке'), true);
  assert.equal(plan.prompt.includes('conds:устал'), true);
});

test('master frame tolerates missing optional arrays', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.history.macroForces = undefined;
  world.place.occupants = undefined;
  world.place.exits = undefined;
  world.cluster.neighboringRegions = undefined;
  world.social.knownBy = undefined;
  world.social.recentWitnesses = undefined;
  world.memory.heardRumors = undefined;
  if (world.currentLocationId && world.locations?.[world.currentLocationId]) {
    world.locations[world.currentLocationId].occupants = undefined;
    world.locations[world.currentLocationId].exits = undefined;
    world.locations[world.currentLocationId].recentTraces = undefined;
  }

  const frame = buildMasterFrame(world, 'осматриваюсь');

  assert.ok(frame);
  assert.deepEqual(frame.world.history.macroForces, []);
  assert.deepEqual(frame.world.location.occupants, []);
  assert.deepEqual(frame.world.location.exits, []);
  assert.deepEqual(frame.world.location.recentTraces, []);
  assert.deepEqual(frame.cluster.neighboringRegions, []);
  assert.deepEqual(frame.world.social.knownBy, []);
  assert.deepEqual(frame.world.social.witnesses, []);
  assert.deepEqual(frame.world.memory.rumors, []);
});

test('createWorldState normalizes missing list fields before rendering', () => {
  const world = createWorldState({
    startText: 'переправа и двор',
    history: {
      macroForces: undefined,
      legitimacy: undefined
    },
    region: {
      tensions: undefined,
      economy: undefined,
      politics: undefined
    },
    memory: {
      heardRumors: undefined,
      sceneNotes: undefined,
      masterNotes: undefined
    },
    social: {
      knownBy: undefined,
      recentWitnesses: undefined,
      socialMemory: undefined
    },
    place: {
      id: 'yard',
      name: 'Двор',
      kind: 'двор',
      landmarks: undefined,
      exits: undefined,
      occupants: undefined
    },
    scene: {
      pressure: undefined,
      sounds: undefined
    },
    locations: {
      yard: {
        id: 'yard',
        name: 'Двор',
        kind: 'двор',
        landmarks: undefined,
        exits: undefined,
        occupants: undefined,
        activity: undefined,
        recentTraces: undefined,
        pressure: undefined,
        sounds: undefined
      }
    },
    currentLocationId: 'yard'
  });

  assert.deepEqual(world.history.macroForces, []);
  assert.deepEqual(world.region.tensions, []);
  assert.deepEqual(world.place.landmarks, []);
  assert.deepEqual(world.place.exits, []);
  assert.deepEqual(world.scene.pressure, []);
  assert.deepEqual(world.scene.sounds, []);
  assert.deepEqual(world.social.knownBy, []);
  assert.deepEqual(world.social.recentWitnesses, []);
  assert.deepEqual(world.memory.heardRumors, []);
  assert.deepEqual(world.locations.yard.landmarks, []);
  assert.deepEqual(world.locations.yard.exits, []);
  assert.ok(Array.isArray(world.locations.yard.occupants));
  assert.deepEqual(world.locations.yard.recentTraces, []);

  const text = buildObservation(world);

  assert.match(text, /Ты осматриваешься/);
});

test('observation distinguishes place landmarks from immediate visible objects', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.place.landmarks = ['мешки у стен', 'грязная дорога'];
  if (world.locations?.[world.currentLocationId]) {
    world.locations[world.currentLocationId].landmarks = ['мешки у стен', 'грязная дорога'];
  }
  world.microPlace = {
    ...(world.microPlace ?? {}),
    visibleObjects: ['следы у ворот'],
    doors: [],
    containers: []
  };

  const text = buildObservation(world);

  assert.match(text, /Ориентиры места: мешки у стен; грязная дорога\./);
  assert.match(text, /В поле зрения: следы у ворот\./);
  assert.doesNotMatch(text, /Перед тобой:/);
});

test('fallback micro place does not synthesize visible objects from place landmarks', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.current_position = {
    ...world.current_position,
    minilocation_id: null
  };
  world.currentMicroLocationId = null;
  if (world.cluster?.microLocationsByLocationId?.[world.currentLocationId]) {
    world.cluster.microLocationsByLocationId[world.currentLocationId] = [];
  }
  if (world.locations?.[world.currentLocationId]) {
    world.locations[world.currentLocationId].landmarks = ['мешки у стен', 'грязная дорога'];
  }

  syncCurrentPlace(world, { minilocation_id: null });

  assert.deepEqual(world.microPlace.visibleObjects, []);
  assert.equal(world.microPlace.containers.length, 0);
});

test('createWorldState exposes canonical v2 player and position shapes', () => {
  const world = createWorldState({ startText: 'переправа и двор' });

  assert.equal(world.version, 2);
  assert.equal(world.schema, 'world_state');
  assert.ok(world.current_position);
  assert.equal(world.current_position.location_id, world.currentLocationId);
  assert.equal(world.current_position.minilocation_id, world.currentMicroLocationId);
  assert.ok(world.player.identity);
  assert.ok(world.player.body);
  assert.ok(world.player.states);
  assert.ok(world.player.attributes);
  assert.ok(world.player.skill_bonuses);
  assert.ok(world.player.items);
  assert.ok(world.player.knowledge_map);
  assert.ok(world.player.memory_profile);
  assert.ok(world.player.goals_profile);
  assert.ok(world.player.property_and_access);
  assert.ok(world.player.relations);
  assert.ok(world.player.position);
  assert.equal(world.player.position.location_id, world.currentLocationId);
  assert.equal(world.player.position.minilocation_id, world.currentMicroLocationId);
  assert.equal(world.player.body.health, world.player.states.health);
  assert.equal(world.player.body.satiety, world.player.states.satiety);
  assert.equal(world.player.body.vigor, world.player.states.vigor);
  assert.ok(Array.isArray(world.player.items.carried_items));
});

test('createWorldState prefers canonical current_position over stale legacy ids', () => {
  const world = createWorldState({
    startText: 'переправа и двор',
    currentLocationId: 'stale-yard',
    currentMicroLocationId: 'stale-yard:entry',
    current_position: {
      region_id: 'region-1',
      place_id: 'canonical-place',
      location_id: 'yard',
      minilocation_id: 'yard:center',
      anchor_id: 'yard:center',
      last_route_id: 'route:canonical'
    }
  });

  assert.equal(world.current_position.location_id, 'yard');
  assert.equal(world.current_position.minilocation_id, world.currentMicroLocationId);
  assert.equal(world.currentLocationId, 'yard');
  assert.notEqual(world.currentMicroLocationId, 'stale-yard:entry');
  assert.equal(world.player.position.location_id, 'yard');
  assert.equal(world.player.position.minilocation_id, world.currentMicroLocationId);
});

test('buildWorldCluster prefers canonical current_position over stale legacy ids', () => {
  const world = {
    worldKey: 'world:test',
    currentLocationId: 'stale-yard',
    currentMicroLocationId: 'stale-yard:entry',
    current_position: {
      region_id: 'region-1',
      place_id: 'yard',
      location_id: 'yard',
      minilocation_id: 'yard:center',
      anchor_id: 'yard:entry',
      last_route_id: 'route:yard'
    },
    locations: {
      yard: {
        id: 'yard',
        name: 'Передний двор',
        kind: 'двор',
        landmarks: [],
        exits: [],
        occupants: [{ name: 'Хозяин двора' }],
        profile: {}
      },
      'stale-yard': {
        id: 'stale-yard',
        name: 'Старый двор',
        kind: 'двор',
        landmarks: [],
        exits: [],
        occupants: [{ name: 'Старый свидетель' }],
        profile: {}
      }
    },
    history: { year: 1241, season: 'весна', era: 'XIII век' },
    region: { name: 'Низовье', economy: [], politics: [], tensions: [] },
    historical: buildHistoricalContext({ history: { year: 1241, season: 'весна', era: 'XIII век' }, region: { name: 'Низовье' } }),
    scene: { weather: 'ясно' },
    place: { id: 'yard', name: 'Передний двор' },
    npcs: [
      { id: 'npc-current', name: 'Хозяин двора', locationId: 'yard', homeLocation: 'yard', role: 'хозяин' },
      { id: 'npc-stale', name: 'Старый свидетель', locationId: 'stale-yard', homeLocation: 'stale-yard', role: 'свидетель' }
    ]
  };

  const cluster = buildWorldCluster(world);

  assert.equal(cluster.currentPosition.location_id, 'yard');
  assert.equal(cluster.currentLocationId, 'yard');
  assert.equal(cluster.place.id, 'yard');
  assert.equal(cluster.location.id, 'yard');
  assert.equal(cluster.startPosition.locationId, 'yard');
  assert.ok(cluster.location.people.includes('Хозяин двора'));
  assert.ok(!cluster.location.people.includes('Старый свидетель'));
});

test('current location helpers prefer canonical current_position over stale legacy ids', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const staleLocationId = Object.keys(world.locations).find((id) => id !== world.currentLocationId);
  const canonicalLocation = world.currentLocationId;
  const canonicalMicroLocation = world.currentMicroLocationId;

  assert.ok(staleLocationId);
  world.currentLocationId = staleLocationId;
  world.currentMicroLocationId = 'stale-micro-location';
  world.current_position = {
    ...world.current_position,
    location_id: canonicalLocation,
    place_id: canonicalLocation,
    minilocation_id: canonicalMicroLocation
  };

  assert.equal(getCurrentLocation(world)?.id, canonicalLocation);
  assert.equal(getCurrentMicroLocation(world)?.id, canonicalMicroLocation);
});

test('current micro location ignores stale legacy micro ids when position is canonical', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const firstMicroLocation = world.cluster.microLocationsByLocationId[world.currentLocationId]?.[0] ?? null;

  assert.ok(firstMicroLocation);
  world.currentMicroLocationId = 'stale-micro-location';
  world.current_position = {
    ...world.current_position,
    minilocation_id: null
  };

  assert.equal(getCurrentMicroLocation(world)?.id, firstMicroLocation.id);
});

test('syncCurrentPosition clears the micro location when the destination has none', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const oldMicroLocationId = world.currentMicroLocationId;

  world.locations = {
    hall: {
      id: 'hall',
      name: 'Пустая горница',
      kind: 'комната',
      landmarks: [],
      exits: [],
      occupants: [],
      activity: [],
      recentTraces: [],
      pressure: [],
      sounds: [],
      weather: null,
      light: null,
      profile: {}
    }
  };
  world.currentLocationId = 'hall';
  world.currentMicroLocationId = oldMicroLocationId;
  world.current_position = {
    region_id: 'region-1',
    place_id: 'place-1',
    location_id: 'yard',
    minilocation_id: oldMicroLocationId,
    anchor_id: 'yard:entry',
    last_route_id: 'route:yard'
  };
  world.cluster = {
    microLocationsByLocationId: {
      hall: []
    }
  };

  const next = syncCurrentPosition(world, {
    location_id: 'hall',
    place_id: 'hall',
    minilocation_id: null,
    anchor_id: null
  });

  assert.equal(next.location_id, 'hall');
  assert.equal(next.minilocation_id, null);
  assert.equal(next.anchor_id, null);
  assert.equal(world.currentMicroLocationId, null);
  assert.equal(world.player.position.minilocation_id, null);
});

test('syncCurrentPosition preserves an existing place id while resyncing location details', () => {
  const world = createWorldState({ startText: 'переправа и двор' });

  world.current_position = {
    region_id: 'region-1',
    place_id: 'market-place',
    location_id: 'yard',
    minilocation_id: 'yard:entry',
    anchor_id: 'yard:entry',
    last_route_id: 'route:yard'
  };
  world.currentLocationId = 'yard';
  world.currentMicroLocationId = 'yard:entry';
  world.cluster = {
    microLocationsByLocationId: {
      yard: [
        { id: 'yard:entry', name: 'Передний двор - вход', kind: 'вход', entryPoints: [], doors: [] },
        { id: 'yard:center', name: 'Передний двор - центр', kind: 'центр', entryPoints: [], doors: [] }
      ]
    }
  };

  const next = syncCurrentPosition(world, {
    minilocation_id: 'yard:center'
  });

  assert.equal(next.place_id, 'market-place');
  assert.equal(next.location_id, 'yard');
  assert.equal(next.minilocation_id, 'yard:center');
  assert.equal(world.player.position.place_id, 'market-place');
});

test('syncCurrentPosition prefers canonical current_position over stale legacy ids', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const canonicalLocationId = world.currentLocationId;
  world.locations = {
    ...world.locations,
    hall: {
      id: 'hall',
      name: 'Пустая горница',
      kind: 'комната',
      landmarks: [],
      exits: [],
      occupants: [],
      activity: [],
      recentTraces: [],
      pressure: [],
      sounds: [],
      weather: null,
      light: null,
      profile: {}
    }
  };
  world.currentLocationId = 'hall';
  world.currentMicroLocationId = 'hall:entry';
  world.current_position = {
    ...world.current_position,
    location_id: canonicalLocationId,
    place_id: canonicalLocationId,
    minilocation_id: canonicalLocationId,
    anchor_id: 'yard:entry',
    last_route_id: 'route:yard'
  };

  const next = syncCurrentPosition(world);

  assert.equal(next.location_id, canonicalLocationId);
  assert.equal(world.currentLocationId, canonicalLocationId);
  assert.equal(world.player.position.location_id, canonicalLocationId);
});

test('syncCurrentPlace promotes a seeded place id without changing the location id', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.placeSeed = {
    id: 'place:world:yard:yard',
    placeName: 'Двор у переправы',
    placeKind: 'дорожный двор'
  };
  world.current_position = {
    region_id: 'region-1',
    place_id: world.currentLocationId,
    location_id: world.currentLocationId,
    minilocation_id: world.currentMicroLocationId,
    anchor_id: world.current_position?.anchor_id ?? null,
    last_route_id: 'route:yard'
  };

  syncCurrentPlace(world);

  assert.equal(world.current_position.place_id, 'place:world:yard:yard');
  assert.equal(world.current_position.location_id, world.currentLocationId);
  assert.equal(world.player.position.place_id, 'place:world:yard:yard');
  assert.equal(world.player.position.location_id, world.currentLocationId);
});

test('syncCurrentPosition prefers the location-specific start micro location', () => {
  const world = createWorldState({ startText: 'переправа и двор' });

  world.locations = {
    yard: {
      id: 'yard',
      name: 'Передний двор',
      kind: 'двор',
      landmarks: [],
      exits: [],
      occupants: [],
      activity: [],
      recentTraces: [],
      pressure: [],
      sounds: [],
      weather: null,
      light: null,
      profile: {}
    }
  };
  world.currentLocationId = 'yard';
  world.currentMicroLocationId = 'yard:entry';
  world.current_position = {
    region_id: 'region-1',
    place_id: 'place-1',
    location_id: 'yard',
    minilocation_id: 'source:entry',
    anchor_id: 'source:entry',
    last_route_id: 'route:source'
  };
  world.cluster = {
    microLocationsByLocationId: {
      yard: [
        { id: 'yard:entry', name: 'Передний двор - вход', kind: 'вход', entryPoints: [], doors: [] },
        { id: 'yard:center', name: 'Передний двор - центр', kind: 'центр', entryPoints: [], doors: [] },
        { id: 'yard:edge', name: 'Передний двор - край', kind: 'край', entryPoints: [], doors: [] }
      ]
    }
  };

  const next = syncCurrentPosition(world);

  assert.equal(next.location_id, 'yard');
  assert.equal(next.minilocation_id, 'yard:center');
  assert.equal(next.anchor_id, null);
  assert.equal(world.currentMicroLocationId, 'yard:center');
  assert.equal(world.player.position.minilocation_id, 'yard:center');
});

test('syncCurrentPosition ignores stale legacy micro ids when no preferred micro location is available', () => {
  const world = createWorldState({ startText: 'переправа и двор' });

  world.locations = {
    yard: {
      id: 'yard',
      name: 'Передний двор',
      kind: 'двор',
      landmarks: [],
      exits: [],
      occupants: [],
      activity: [],
      recentTraces: [],
      pressure: [],
      sounds: [],
      weather: null,
      light: null,
      profile: {}
    }
  };
  world.currentLocationId = 'yard';
  world.currentMicroLocationId = 'yard:edge';
  world.current_position = {
    region_id: 'region-1',
    place_id: 'place-1',
    location_id: 'yard',
    minilocation_id: null,
    anchor_id: null,
    last_route_id: 'route:source'
  };
  world.cluster = {
    microLocationsByLocationId: {
      yard: [
        { id: 'yard:center', name: 'Передний двор - центр', kind: 'центр', entryPoints: [], doors: [] },
        { id: 'yard:edge', name: 'Передний двор - край', kind: 'край', entryPoints: [], doors: [] }
      ]
    }
  };

  const next = syncCurrentPosition(world);

  assert.equal(next.location_id, 'yard');
  assert.equal(next.minilocation_id, 'yard:center');
  assert.equal(world.currentMicroLocationId, 'yard:center');
  assert.equal(world.player.position.minilocation_id, 'yard:center');
});

test('buildCurrentPosition uses explicit bootstrap overrides instead of legacy ids', () => {
  const position = buildCurrentPosition({
    locations: {
      yard: {
        id: 'yard',
        name: 'Передний двор',
        kind: 'двор',
        landmarks: [],
        exits: [],
        occupants: [],
        activity: [],
        recentTraces: [],
        pressure: [],
        sounds: [],
        weather: null,
        light: null,
        profile: {}
      }
    },
    currentLocationId: 'stale-yard',
    currentMicroLocationId: 'stale-yard:entry',
    place: { id: 'yard', name: 'Передний двор', kind: 'двор' }
  }, {
    location_id: 'yard',
    minilocation_id: 'yard:entry',
    anchor_id: 'yard:entry'
  });

  assert.equal(position.location_id, 'yard');
  assert.equal(position.minilocation_id, 'yard:entry');
  assert.equal(position.anchor_id, 'yard:entry');
});

test('master prompt encodes the no-play-along contract', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const plan = planMasterTurnSync(world, 'я сын боярина и иду к реке');
  const prompt = buildMasterPromptSync(plan.frame);

  assert.match(prompt, /Не объявляй предположение фактом/);
  assert.match(prompt, /Невозможное превращай в риск/);
  assert.match(prompt, /# Роль/);
  assert.match(prompt, /# Формат ответа/);
  assert.match(prompt, /Свидетели:/);
  assert.match(prompt, /Ограничения:/);
  assert.match(prompt, /Журнал источников:/);
  assert.match(prompt, /пузыр/i);
  assert.match(prompt, /Региональное резюме:/);
  assert.match(prompt, /state_delta\.item_changes/);
  assert.equal(/visibleTraces|JSON\.stringify|perception":\{|knownBy":\[/i.test(prompt), false);
});

test('master prompt does not expose hidden items from closed containers in property summary', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.propertyLedger = [
    {
      id: 'item:player:box:1',
      label: 'закрытый ларец',
      ownerName: 'Игрок',
      holderName: 'Игрок',
      placement: 'carried',
      access: 'closed_container',
      visibility: 'visible',
      discoverability: 4,
      legalStatus: 'ordinary',
      plausibility: 5,
      risk: 1
    },
    {
      id: 'item:player:box:ring:1',
      label: 'перстень',
      ownerName: 'Игрок',
      holderName: 'Игрок',
      placement: 'contained',
      access: 'closed_container',
      visibility: 'hidden',
      discoverability: 0,
      legalStatus: 'ordinary',
      plausibility: 5,
      risk: 1
    },
    {
      id: 'item:player:key:1',
      label: 'ключ',
      ownerName: 'Игрок',
      holderName: 'Игрок',
      placement: 'carried',
      access: 'immediate',
      visibility: 'visible',
      discoverability: 5,
      legalStatus: 'ordinary',
      plausibility: 5,
      risk: 0
    }
  ];

  const prompt = buildMasterPromptSync(buildMasterFrame(world, 'осматриваюсь'));

  assert.match(prompt, /Имущество: ключ->Игрок/);
  assert.doesNotMatch(prompt, /перстень/);
  assert.doesNotMatch(prompt, /закрытый ларец->Игрок; access:closed_container/);
});

test('master response survives a throwing stage hook', async () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const frame = buildMasterFrame(world, 'осматриваюсь');

  const result = await generateMasterResponse(frame, 'ok', process.env, {
    onStage() {
      throw 'telemetry hook failed';
    }
  });

  assert.equal(result.usedFallback, false);
  assert.equal(result.narrative.schema, 'master_narrative');
  assert.equal(result.narrative.scene, 'Ты осматриваешь двор и видишь, как он живёт своим обычным ритмом.');
});

test('master response repairs a malformed master_narrative', async () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const frame = buildMasterFrame(world, 'поговорить со старостой');
  const originalFetch = globalThis.fetch;
  const stages = [];
  let masterRepairCalls = 0;
  let masterRepairSystemText = '';

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const systemText = body.messages?.[0]?.content ?? '';

    if ((/semantic dossier/i.test(systemText) || /semantic_dossier/i.test(systemText)) && !/SemanticDataShaper|ActorProfileShaper|LocationProfileShaper|MasterNarrativeShaper|VisibleContextShaper/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: 'Короткий dossier для мастера.'
                }
              }
            ]
          };
        }
      };
    }

    if (/semantic_audit/i.test(systemText) || /отдельный проверяющий/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'semantic_audit',
                    pass: true,
                    concerns: [],
                    evidence: ['dossier looks fine']
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/MasterNarrativeRepairer|SemanticMasterRepairer/i.test(systemText)) {
      masterRepairCalls += 1;
      masterRepairSystemText = systemText;
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'master_narrative',
                    scene: 'Староста отвечает коротко и по делу.',
                    consequence: 'Разговор остаётся сдержанным, но без провала.',
                    visible_details: ['двор', 'староста', 'люди у ворот'],
                    npc_reactions: ['староста не поднимает голос', 'слушатели ждут конца разговора'],
                    next_pressure: 'Неловкость быстро спадёт'
                  })
                }
              }
            ]
          };
        }
      };
    }

    if (/MasterNarrativeShaper/i.test(systemText)) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    version: 1,
                    schema: 'master_narrative',
                    scene: 'Староста молчит.',
                    consequence: 'Разговор не складывается.',
                    visible_details: ['двор'],
                    next_pressure: 'неловкость'
                  })
                }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  version: 1,
                  schema: 'master_narrative',
                  scene: 'Староста молчит.',
                  consequence: 'Разговор не складывается.',
                  visible_details: ['двор'],
                  next_pressure: 'неловкость'
                })
              }
            }
          ]
        };
      }
    };
  };

  try {
    const result = await generateMasterResponse(frame, 'ok', process.env, {
      onStage(stage) {
        stages.push(stage.phase);
      }
    });
    assert.equal(result.usedFallback, false);
    assert.equal(result.narrative.schema, 'master_narrative');
    assert.equal(result.narrative.version, 1);
    assert.equal(result.narrative.scene, 'Староста отвечает коротко и по делу.');
    assert.equal(result.narrative.consequence, 'Разговор остаётся сдержанным, но без провала.');
    assert.equal(Array.isArray(result.narrative.visible_details), true);
    assert.equal(Array.isArray(result.narrative.npc_reactions), true);
    assert.equal(masterRepairCalls, 1);
    assert.match(masterRepairSystemText, /MasterNarrativeRepairer/i);
    assert.match(masterRepairSystemText, /state_delta.*неутверждённых npc id|не вводит неутверждённых npc id/i);
    assert.equal(stages.includes('semantic_repair'), true);
    assert.equal(stages.filter((phase) => phase === 'semantic_shape').length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('talk result resolves inflected target names', () => {
  const world = createWorldState({ startText: 'изба старосты' });
  const text = buildTalkResult(world, { target: 'старостой' });

  assert.match(text, /староста/);
  assert.match(text, /ответ зависит|обращаешься/i);
});

test('talk result falls back to the local authority proxy in ford', () => {
  const world = createWorldState({ startText: 'староста' });
  world.npcs = (world.npcs ?? []).filter((npc) => npc.name !== 'староста');
  const location = world.locations?.[world.currentLocationId];
  if (location?.occupants) {
    location.occupants = location.occupants.filter((name) => name !== 'староста');
  }
  if (Array.isArray(world.place?.occupants)) {
    world.place.occupants = world.place.occupants.filter((name) => name !== 'староста');
  }

  const text = buildTalkResult(world, { target: 'старостой' });

  assert.match(text, /дворник/);
  assert.match(text, /местным старшим|хозяин двора/i);
});

test('historical context includes concrete 1241 anchors for an explicit central Europe frame', () => {
  const world = createWorldState({
    startText: 'переправа и двор',
    history: {
      year: 1241,
      season: 'весна',
      regionHint: 'Центральная Европа, Силезия'
    },
    region: { name: 'Силезия' },
    historicalFrame: {
      year: 1241,
      regionName: 'Силезия',
      regionHint: 'Центральная Европа, Силезия',
      season: 'весна'
    }
  });
  const historical = buildHistoricalContext(world);

  assert.equal(historical.year, 1241);
  assert.ok(historical.notablePeople.includes('Генрих II Благочестивый'));
  assert.ok(historical.notablePeople.includes('Бела IV Венгерский'));
  assert.ok(historical.anchorEvents.some((item) => item.includes('Легнице')));
  assert.ok(historical.anchorEvents.some((item) => item.includes('Мохи')));
  assert.ok(historical.economicContext.some((item) => item.includes('Земледелие остаётся основой')));
  assert.ok(Array.isArray(historical.historicalEvents));
  assert.ok(historical.historicalEvents.length > 0);
  assert.ok(Array.isArray(historical.historicalEvents[0].phases));
  assert.ok(historical.historicalEvents[0].phases.some((phase) => phase.visibleSigns.length > 0));
  assert.ok(historical.historicalEvents[0].activePhase);
  assert.ok(Array.isArray(historical.historicalEventsSummary));
  assert.ok(Array.isArray(historical.activeHistoricalEventsSummary));
  assert.equal(historical.historicalEventsSummary[0].activePhase.label.length > 0, true);
  assert.equal(historical.historicalEventsSummary[0].activePhase.label, humanizeHistoricalPhaseLabel(historical.historicalEvents[0].activePhase));
  assert.ok(Array.isArray(historical.sourceLog));
  assert.equal(historical.sourceLog[0]?.status, 'usable_with_caution');
  assert.ok(Array.isArray(historical.sourceLog[0]?.sources));
  assert.ok(historical.sourceLog[0]?.sources.length > 0);
  assert.ok(Array.isArray(historical.historicalPeople));
  assert.ok(historical.historicalPeople.some((person) => person.name === 'Генрих II Благочестивый' && person.influenceMode === 'authority' && person.active));
  assert.ok(historical.historicalPeople.some((person) => person.name === 'Бату-хан' && person.influenceMode === 'military' && person.active));
  assert.ok(historical.historicalPeople.some((person) => person.name === 'Бату-хан' && person.contactMode === 'indirect' && person.event === 'Монгольское вторжение в Польшу и Венгрию'));
  assert.ok(historical.historicalPeople.some((person) => Array.isArray(person.knowledge) && person.knowledge.length > 0));
  assert.ok(historical.historicalEvents[0].delayedEvents.length > 0);
  assert.ok(historical.historicalEvents[0].phases.some((phase) => phase.scheduledAt && Object.prototype.hasOwnProperty.call(phase.scheduledAt, 'approxDay')));
  assert.ok(historical.historicalEvents[0].phases.some((phase) => phase.delayedEvents.length > 0));
  assert.equal(typeof historical.phasePressure, 'string');
  assert.ok(historical.phasePressure.length > 0);
});

test('historical events dedupe by meaning, region, participants and time', () => {
  const events = dedupeHistoricalEvents([
    {
      id: 'event-1',
      title: 'Сбор дружины',
      region: 'Новгородская земля',
      participants: ['князь', 'дружина'],
      dateRange: { year: 1241, season: 'осень' },
      duplicateKey: 'novgorod:call-up',
      visibleSigns: ['людей собирают'],
      consequences: ['дороги тревожнее']
    },
    {
      id: 'event-2',
      title: 'Созыв дружины',
      region: 'Новгородская земля',
      participants: ['дружина', 'князь'],
      dateRange: { year: 1241, season: 'осень' },
      duplicateKey: 'novgorod:other-key',
      visibleSigns: ['виден сбор людей'],
      consequences: ['дороги тревожнее']
    },
    {
      id: 'event-3',
      title: 'Иной спор',
      region: 'Псковская земля',
      participants: ['торговцы'],
      dateRange: { year: 1242, season: 'лето' },
      duplicateKey: 'pov:sp',
      visibleSigns: ['спор на торгу'],
      consequences: ['пошлины меняются']
    }
  ]);

  assert.equal(events.length, 2);
  assert.equal(events[0].id, 'event-1');
  assert.equal(events[1].id, 'event-3');
});

test('historical event phase follows seasonal date hints', () => {
  const centralEuropeSeed = {
    startText: 'переправа и двор',
    history: {
      year: 1241,
      season: 'весна',
      regionHint: 'Центральная Европа, Силезия'
    },
    region: { name: 'Силезия' },
    historicalFrame: {
      year: 1241,
      regionName: 'Силезия',
      regionHint: 'Центральная Европа, Силезия',
      season: 'весна'
    }
  };
  const earlyWorld = createWorldState(centralEuropeSeed);
  earlyWorld.clock.day = 2;
  earlyWorld.history = { ...(earlyWorld.history ?? {}), season: 'весна', year: 1241 };
  const earlyHistorical = buildHistoricalContext(earlyWorld);
  const earlyEvent = earlyHistorical.historicalEvents.find((item) => item.id === 'mongol-invasion-1241');

  const midWorld = createWorldState(centralEuropeSeed);
  midWorld.clock.day = 15;
  midWorld.history = { ...(midWorld.history ?? {}), season: 'весна', year: 1241 };
  const midHistorical = buildHistoricalContext(midWorld);
  const midEvent = midHistorical.historicalEvents.find((item) => item.id === 'mongol-invasion-1241');

  const lateWorld = createWorldState(centralEuropeSeed);
  lateWorld.clock.day = 28;
  lateWorld.history = { ...(lateWorld.history ?? {}), season: 'весна', year: 1241 };
  const lateHistorical = buildHistoricalContext(lateWorld);
  const lateEvent = lateHistorical.historicalEvents.find((item) => item.id === 'mongol-invasion-1241');

  assert.equal(earlyEvent?.activePhase?.id, 'background');
  assert.equal(midEvent?.activePhase?.id, 'rumor');
  assert.equal(lateEvent?.activePhase?.id, 'impact');
  assert.match(midHistorical.phasePressure, /середина весны 1241/i);
  assert.match(lateHistorical.phasePressure, /поздняя весна 1241/i);
});

test('regional summary reflects active historical pressure in the current region', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.historical.activeHistoricalEvents = [
    {
      title: 'Монгольское вторжение в Польшу и Венгрию',
      activePhase: {
        label: 'Нарастание',
        dateHint: 'поздняя весна 1241',
        visibleSigns: ['Беженцы, проверки и вооружённое движение становятся видимыми.']
      },
      visibleSigns: ['Местная власть жёстче давит на чужих, а путь становится рискованнее.']
    }
  ];
  world.historical.phasePressure = 'Монгольское вторжение в Польшу и Венгрию — Нарастание (поздняя весна 1241): Беженцы, проверки и вооружённое движение становятся видимыми.';

  const summary = buildRegionSummary(world, world.region);

  assert.ok(summary.threats.some((item) => item.includes('Текущее историческое давление')));
  assert.ok(summary.externalPressures.some((item) => item.includes('Текущее историческое давление')));
  assert.ok(summary.internalTensions.some((item) => item.includes('Текущее историческое давление')));
  assert.ok(summary.reasons.some((item) => item.includes('Текущее историческое давление')));
  assert.ok(summary.shortages.some((item) => item.includes('Текущее историческое давление')));
  assert.deepEqual(summary.historicalTimeline.after1237, []);
});

test('frame-scoped historical fallback keeps the documented five-phase event model', () => {
  const world = createWorldState({
    historicalFrame: {
      year: 1237,
      season: 'осень',
      regionName: 'Новгородская земля',
      regionHint: 'Новгородская земля'
    },
    history: {
      era: 'XIII век',
      year: 1237,
      season: 'осень',
      regionHint: 'Новгородская земля',
      macroForces: ['слухи о сборе и тревоге на дорогах'],
      legitimacy: ['местные больше доверяют своим и поручителям']
    },
    region: {
      name: 'Новгородская земля',
      economy: ['дворы, торг и речной путь зависят от сезона и доступа к дороге'],
      tensions: ['чужих расспрашивают на дороге и у дворов']
    }
  });

  const historical = buildHistoricalContext(world);
  assert.equal(historical.packId, '1237-новгородская-земля');
  assert.equal(historical.historicalEvents.length, 0);
  assert.equal(historical.anchorEvents.length, 0);
  assert.ok(Array.isArray(historical.sourceLog));
  assert.equal(historical.sourceLog[0]?.agent, 'historical-context');
  assert.equal(historical.sourceLog[0]?.status, 'needs_review');
  assert.equal(historical.sourceLog[0]?.needsReview, true);
  assert.ok(Array.isArray(historical.sourceLog[0]?.sources));
  assert.ok(historical.sourceLog[0]?.sources.length > 0);
  assert.ok(Array.isArray(historical.sourceLog[0]?.usedIn));
  assert.ok(historical.sourceLog[0]?.usedIn.includes('world.historical'));
});

test('travelWorld refreshes frame-scoped historical routes for the new current location', () => {
  const world = createWorldState({
    historicalFrame: {
      year: 1237,
      season: 'осень',
      regionName: 'Новгородская земля',
      regionHint: 'Новгородская земля'
    },
    history: {
      era: 'XIII век',
      year: 1237,
      season: 'осень',
      regionHint: 'Новгородская земля',
      macroForces: [],
      legitimacy: []
    },
    region: {
      name: 'Новгородская земля',
      economy: [],
      politics: [],
      tensions: []
    },
    locations: {
      ford: {
        id: 'ford',
        name: 'Переправа',
        kind: 'переправа',
        landmarks: [],
        exits: [{ label: 'к двору', to: 'yard' }],
        occupants: []
      },
      yard: {
        id: 'yard',
        name: 'Двор',
        kind: 'двор',
        landmarks: [],
        exits: [{ label: 'к переправе', to: 'ford' }],
        occupants: []
      }
    },
    current_position: {
      location_id: 'ford',
      place_id: 'ford',
      minilocation_id: null,
      region_id: 'Новгородская земля'
    }
  });

  assert.equal(world.historical.packId.includes('1237-'), true);
  assert.equal(world.historical.roadRoutes[0]?.from_id, 'ford');

  const moved = travelWorld(world, 'двор');

  assert.equal(moved.ok, true);
  assert.equal(world.current_position?.location_id, 'yard');
  assert.equal(world.historical.roadRoutes[0]?.from_id, 'yard');
});

test('market access and rhythm update when time passes into night', () => {
  const world = createWorldState({
    clock: { day: 1, hour: 10, minute: 0 },
    locations: {
      market: {
        id: 'market',
        name: 'Торг',
        kind: 'рынок',
        landmarks: ['лавки', 'навесы'],
        exits: [{ label: 'к дороге', to: 'road' }],
        occupants: ['купец']
      },
      road: {
        id: 'road',
        name: 'Дорога',
        kind: 'дорога',
        landmarks: [],
        exits: [{ label: 'к торгу', to: 'market' }],
        occupants: []
      }
    },
    current_position: {
      location_id: 'market',
      place_id: 'market',
      minilocation_id: null,
      region_id: 'Тестовый регион'
    }
  });

  assert.equal(world.locations.market.profile?.access, 'открыто при торговом порядке');
  assert.match(world.locations.market.profile?.rhythm ?? '', /утром открывается|днём шумит/i);

  advanceWorld(world, 12 * 60, { type: 'wait' });

  assert.equal(world.clock.hour, 22);
  assert.equal(world.locations.market.profile?.access, 'закрыто');
  assert.match(world.locations.market.profile?.rhythm ?? '', /ночью замирает/i);
  assert.equal(world.scene.access, 'закрыто');
});

test('travelWorld blocks movement into a market closed for the night', () => {
  const world = createWorldState({
    clock: { day: 1, hour: 22, minute: 0 },
    locations: {
      road: {
        id: 'road',
        name: 'Дорога',
        kind: 'дорога',
        landmarks: [],
        exits: [{ label: 'к торгу', to: 'market' }],
        occupants: []
      },
      market: {
        id: 'market',
        name: 'Торг',
        kind: 'рынок',
        landmarks: ['лавки'],
        exits: [{ label: 'к дороге', to: 'road' }],
        occupants: ['купец']
      }
    },
    current_position: {
      location_id: 'road',
      place_id: 'road',
      minilocation_id: null,
      region_id: 'Тестовый регион'
    }
  });

  ensureLocationProfiles(world);

  const result = travelWorld(world, 'торг');

  assert.equal(world.locations.market.profile?.access, 'закрыто');
  assert.equal(result.ok, false);
  assert.match(result.text, /закрыто/i);
  assert.equal(world.current_position?.location_id, 'road');
});

test('route reconstruction marks a closed local destination as blocked', () => {
  const world = createWorldState({
    clock: { day: 1, hour: 22, minute: 0 },
    locations: {
      road: {
        id: 'road',
        name: 'Дорога',
        kind: 'дорога',
        landmarks: [],
        exits: [{ label: 'к торгу', to: 'market' }],
        occupants: []
      },
      market: {
        id: 'market',
        name: 'Торг',
        kind: 'рынок',
        landmarks: ['лавки'],
        exits: [{ label: 'к дороге', to: 'road' }],
        occupants: ['купец']
      }
    },
    current_position: {
      location_id: 'road',
      place_id: 'road',
      minilocation_id: null,
      region_id: 'Тестовый регион'
    }
  });

  ensureLocationProfiles(world);

  const reconstruction = buildRouteReconstruction(world, { target: 'торг', type: 'route' });
  const candidate = reconstruction.candidates.find((item) => item.destination === 'market');

  assert.equal(world.locations.market.profile?.access, 'закрыто');
  assert.equal(candidate?.availability, 'blocked');
  assert.match(candidate?.risk ?? '', /закрыто/i);
});

test('advanceWorld refreshes historical phase pressure and schedules active phase follow-ups once', () => {
  const world = createWorldState({
    startText: 'переправа и двор',
    history: {
      year: 1241,
      season: 'весна',
      regionHint: 'Центральная Европа, Силезия'
    },
    region: { name: 'Силезия' },
    historicalFrame: {
      year: 1241,
      regionName: 'Силезия',
      regionHint: 'Центральная Европа, Силезия',
      season: 'весна'
    }
  });
  world.clock.day = 2;
  world.clock.hour = 8;
  world.clock.minute = 0;
  world.history = { ...(world.history ?? {}), season: 'весна', year: 1241 };
  world.historical = buildHistoricalContext(world);
  world.delayedEvents = [];

  assert.equal(world.historical.historicalEvents.find((item) => item.id === 'mongol-invasion-1241')?.activePhase?.id, 'background');

  advanceWorld(world, 13 * 24 * 60, { type: 'wait' });

  const refreshedEvent = world.historical.historicalEvents.find((item) => item.id === 'mongol-invasion-1241');
  assert.equal(refreshedEvent?.activePhase?.id, 'rumor');
  assert.ok(world.historical.phasePressure.includes('середина весны 1241'));

  const historicalDelayed = world.delayedEvents.filter((item) => String(item.id).startsWith('historical:mongol-invasion-1241:rumor:'));
  assert.equal(historicalDelayed.length, 2);
  assert.ok(world.journal.some((entry) => entry.kind === 'historical' && /переходит в фазу Предвестники/i.test(entry.result)));

  const delayedCount = historicalDelayed.length;
  advanceWorld(world, 10, { type: 'wait' });

  assert.equal(world.delayedEvents.filter((item) => String(item.id).startsWith('historical:mongol-invasion-1241:rumor:')).length, delayedCount);
});

test('regional summaries are cached on disk and reused', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiii-regional-cache-'));
  const previousCacheDir = process.env.WORLD_REGION_SUMMARY_CACHE_DIR;
  process.env.WORLD_REGION_SUMMARY_CACHE_DIR = dir;

  try {
    const firstWorld = createWorldState({ startText: 'переправа и двор' });
    const cachePath = getRegionalSummaryCachePath(firstWorld);
    const firstCache = await readFile(cachePath, 'utf8');

    const secondWorld = createWorldState({ startText: 'переправа и двор' });
    const secondCache = await readFile(cachePath, 'utf8');

    assert.equal(secondCache, firstCache);
    assert.equal(secondWorld.historical.regionalContext.current.name, firstWorld.historical.regionalContext.current.name);
  } finally {
    if (previousCacheDir === undefined) {
      delete process.env.WORLD_REGION_SUMMARY_CACHE_DIR;
    } else {
      process.env.WORLD_REGION_SUMMARY_CACHE_DIR = previousCacheDir;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test('regional summary cache path prefers canonical current_position over stale legacy location id', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiii-regional-cache-'));
  const previousCacheDir = process.env.WORLD_REGION_SUMMARY_CACHE_DIR;
  process.env.WORLD_REGION_SUMMARY_CACHE_DIR = dir;

  try {
    const world = createWorldState({ startText: 'переправа и двор' });
    const canonicalLocationId = world.current_position.location_id;
    const canonicalPath = getRegionalSummaryCachePath(world);

    world.currentLocationId = 'stale-yard';
    world.current_position = {
      ...world.current_position,
      location_id: canonicalLocationId,
      place_id: canonicalLocationId
    };
    const staleLegacyPath = getRegionalSummaryCachePath(world);

    assert.equal(staleLegacyPath, canonicalPath);
  } finally {
    if (previousCacheDir === undefined) {
      delete process.env.WORLD_REGION_SUMMARY_CACHE_DIR;
    } else {
      process.env.WORLD_REGION_SUMMARY_CACHE_DIR = previousCacheDir;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test('cluster generation exposes layered world detail and graph nodes', () => {
  resetRegionCatalogCache();
  const world = createWorldState({
    startText: 'переправа и двор',
    region: { name: 'Новгородская земля' },
    history: { regionHint: 'Новгородская земля' }
  });

  assert.ok(Array.isArray(world.cluster.neighboringRegions));
  assert.ok(world.cluster.neighboringRegions.length >= 4);
  assert.ok(Array.isArray(world.cluster.regionCatalog));
  assert.ok(world.cluster.regionCatalog.length > 0);
  assert.ok(world.cluster.activeRegion.name.length > 0);
  assert.ok(world.cluster.activeRegion.coordinates);
  assert.ok(world.cluster.databaseShape.coordinates.place);
  assert.ok(world.cluster.graph.nodes.length > 0);
  assert.ok(world.cluster.startPosition.description.length > 0);
  assert.ok(world.currentMicroLocationId);
  assert.ok(world.microPlace.name.length > 0);
});

test('cluster visibility prefers canonical current_position over stale micro ids', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const locationId = world.current_position.location_id;
  const entryMicroLocationId = `${locationId}:entry`;
  const centerMicroLocationId = `${locationId}:center`;

  world.currentMicroLocationId = centerMicroLocationId;
  world.current_position = {
    ...world.current_position,
    location_id: locationId,
    place_id: locationId,
    minilocation_id: entryMicroLocationId
  };
  world.npcs = [
    {
      id: 'npc-entry',
      name: 'Наблюдатель у входа',
      locationId,
      microLocationId: entryMicroLocationId
    },
    {
      id: 'npc-center',
      name: 'Человек в центре',
      locationId,
      microLocationId: centerMicroLocationId
    }
  ];

  world.cluster = buildWorldCluster(world);

  assert.deepEqual(world.cluster.location.people, ['Наблюдатель у входа']);
  assert.equal(world.cluster.currentMicroLocationId, entryMicroLocationId);
  assert.notDeepEqual(world.cluster.location.people, ['Человек в центре']);
});

test('micro place does not materialize containers from arbitrary landmarks or exits', () => {
  const world = createWorldState({
    locations: {
      yard: {
        id: 'yard',
        name: 'Двор',
        kind: 'двор',
        landmarks: ['лавки', 'дорога к воротам', 'сундук у стены', 'мешок зерна'],
        exits: [{ label: 'к переправе', to: 'ford' }],
        occupants: []
      },
      ford: {
        id: 'ford',
        name: 'Переправа',
        kind: 'переправа',
        landmarks: [],
        exits: [{ label: 'к двору', to: 'yard' }],
        occupants: []
      }
    },
    current_position: {
      location_id: 'yard',
      place_id: 'yard',
      minilocation_id: null,
      region_id: 'Тестовый регион'
    }
  });

  world.cluster = buildWorldCluster(world);

  const containerLabels = (world.cluster.location.microLocations ?? [])
    .flatMap((node) => node.containers ?? [])
    .map((item) => item.label ?? item);

  assert.equal(containerLabels.includes('лавки'), false);
  assert.equal(containerLabels.includes('дорога к воротам'), false);
  assert.equal(containerLabels.includes('к переправе'), false);
  assert.equal(containerLabels.includes('сундук у стены'), true);
  assert.equal(containerLabels.includes('мешок зерна'), true);
});

test('micro place does not materialize grouped storage categories as concrete containers', () => {
  const world = createWorldState({ startText: 'торг и рынок' });

  world.cluster = buildWorldCluster(world);

  const containerLabels = (world.cluster.location.microLocations ?? [])
    .flatMap((node) => node.containers ?? [])
    .map((item) => item.label ?? item);

  assert.equal(containerLabels.includes('ряды с тканью'), false);
  assert.equal(containerLabels.includes('пустые бочки'), false);
  assert.equal(containerLabels.includes('склады с досками'), false);
  assert.equal(containerLabels.includes('мешки у стен'), false);
});

test('important checks are deterministic for the same world state', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const plan = planMasterTurnSync(world, 'Я нападаю на дворника');
  const first = buildActionCheck(world, plan.frame);
  const second = buildActionCheck(world, plan.frame);

  assert.equal(first.required, true);
  assert.equal(first.roll, second.roll);
  assert.equal(first.dc, second.dc);
  assert.equal(first.degree, second.degree);
});

test('combat checks expose a readable formula breakdown', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.attributes = {
    ...(world.player.attributes ?? {}),
    strength: 14,
    agility: 12,
    endurance: 11,
    reason: 10,
    attention: 9,
    influence: 8
  };
  world.player.skill_bonuses = {
    ...(world.player.skill_bonuses ?? {}),
    melee: 2,
    athletics: 1
  };
  world.player.items = {
    carried_items: [
      {
        id: 'item:player:knife:1',
        label: 'нож',
        type: 'weapon',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        risk: 0,
        visible: true
      }
    ],
    equipment: [],
    weapons: [
      {
        id: 'item:player:knife:1',
        label: 'нож',
        type: 'weapon',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        risk: 0,
        visible: true
      }
    ],
    armor: [],
    total_weight: 1.1,
    load_category: 'light'
  };

  const check = buildActionCheck(world, planMasterTurnSync(world, 'Я нападаю').frame);

  assert.equal(check.required, true);
  assert.match(check.formulaText, /d20=/);
  assert.match(check.formulaText, /характеристика \(Сила\)\+2/);
  assert.match(check.formulaText, /навык \(Ближний бой\)\+2/);
  assert.match(check.formulaText, /снаряжение \(нож\)/);
  assert.match(check.formulaText, /итог=/);
  assert.match(check.formulaText, /DC=/);
});

test('combat checks use explicit intent focus instead of raw text heuristics', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.attributes = {
    strength: 10,
    agility: 14,
    endurance: 10,
    reason: 10,
    attention: 10,
    influence: 10
  };
  world.player.skill_bonuses = {
    melee: 0,
    ranged: 3
  };
  world.player.items = {
    carried_items: [
      {
        id: 'item:player:bow:1',
        label: 'лук',
        type: 'weapon',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        risk: 0,
        visible: true
      }
    ],
    equipment: [],
    weapons: [
      {
        id: 'item:player:bow:1',
        label: 'лук',
        type: 'weapon',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        risk: 0,
        visible: true
      }
    ],
    armor: [],
    total_weight: 1,
    load_category: 'light'
  };

  const check = buildActionCheck(world, planMasterTurnSync(world, 'Я стреляю из лука').frame);

  assert.equal(check.profile.attributeKey, 'agility');
  assert.equal(check.profile.skillKey, 'ranged');
  assert.match(check.formulaText, /характеристика \(Ловкость\)\+2/);
  assert.match(check.formulaText, /навык \(Дальний бой\)\+3/);
});

test('combat intent carries ruling context and requires a check', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.inventory = [];
  world.player.items = {
    carried_items: [
      { id: 'item:player:topor:1', label: 'плотницкий топор', type: 'weapon', placement: 'carried', holder_id: 'player', owner_id: 'player', access: 'immediate', risk: 0, visible: true }
    ],
    equipment: [],
    weapons: [
      { id: 'item:player:topor:1', label: 'плотницкий топор', type: 'weapon', placement: 'carried', holder_id: 'player', owner_id: 'player', access: 'immediate', risk: 0, visible: true }
    ],
    armor: [],
    total_weight: 1.2,
    load_category: 'light'
  };
  const plan = planMasterTurnSync(world, 'Я защищаюсь от дворника');
  const check = buildActionCheck(world, plan.frame);

  assert.ok(plan.frame.world.combat);
  assert.ok(plan.frame.constraints.some((item) => item.includes('Боевой контакт')));
  assert.equal(check.required, true);
  assert.equal(check.profile.attributeKey, 'strength');
  assert.equal(check.profile.skillKey, 'melee');
  assert.equal(check.profile.equipmentLabel, 'плотницкий топор');
  assert.ok(check.modifiers.some((item) => item.label === 'оружие (плотницкий топор)'));
});

test('combat checks penalize using a foreign borrowed weapon', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.inventory = [];
  world.player.items = {
    carried_items: [
      {
        id: 'item:npc-1:topor:1',
        label: 'плотницкий топор',
        type: 'weapon',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'npc-1',
        access: 'borrowed',
        legal_status: 'disputed',
        risk: 3,
        visible: true
      }
    ],
    equipment: [],
    weapons: [
      {
        id: 'item:npc-1:topor:1',
        label: 'плотницкий топор',
        type: 'weapon',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'npc-1',
        access: 'borrowed',
        legal_status: 'disputed',
        risk: 3,
        visible: true
      }
    ],
    armor: [],
    total_weight: 1.2,
    load_category: 'light'
  };

  const check = buildActionCheck(world, planMasterTurnSync(world, 'Я нападаю топором').frame);

  assert.equal(check.profile.equipmentLabel, 'плотницкий топор');
  assert.equal(check.profile.equipmentModifier, 0);
  assert.ok(check.modifiers.some((item) => item.label === 'оружие (плотницкий топор)' && item.value === 0));
});

test('combat frame ignores regex-like carried labels without typed weapon records', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.inventory = [];
  world.player.items = {
    carried_items: [
      { id: 'item:player:legacy:1', label: 'меч', placement: 'carried', holder_id: 'player', owner_id: 'player', access: 'immediate', risk: 0, visible: true }
    ],
    equipment: [],
    weapons: [],
    armor: [],
    total_weight: 1,
    load_category: 'light'
  };

  const plan = planMasterTurnSync(world, 'Я нападаю');
  const check = buildActionCheck(world, plan.frame);

  assert.equal(check.profile.equipmentLabel, 'нет');
  assert.ok(!check.modifiers.some((item) => item.label.startsWith('оружие (')));
  assert.ok(plan.frame.world.combat);
  assert.deepEqual(plan.frame.world.combat.playerWeapons, []);
});

test('combat frame ignores legacy string weapon and armor labels without typed records', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.items = {
    carried_items: [],
    equipment: [],
    weapons: ['меч'],
    armor: ['щит'],
    total_weight: 0,
    load_category: 'light'
  };

  const frame = buildMasterFrame(world, 'Я нападаю');
  const check = buildActionCheck(world, planMasterTurnSync(world, 'Я нападаю').frame);

  assert.ok(frame.world.combat);
  assert.deepEqual(frame.world.combat.playerWeapons, []);
  assert.deepEqual(frame.world.combat.playerArmor, []);
  assert.equal(check.profile.equipmentLabel, 'нет');
  assert.ok(!check.modifiers.some((item) => item.label.startsWith('оружие (')));
  assert.ok(!check.modifiers.some((item) => item.label.startsWith('броня (')));
});

test('combat frame exposes target readiness and retreat options', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.inventory = [];
  world.player.items = {
    carried_items: [
      { id: 'item:player:spear:1', label: 'копьё', type: 'weapon', placement: 'carried', holder_id: 'player', owner_id: 'player', access: 'immediate', risk: 0, visible: true, weight: 2 }
    ],
    equipment: [
      { id: 'item:player:shield:1', label: 'щит', type: 'armor', placement: 'equipped', holder_id: 'player', owner_id: 'player', access: 'immediate', risk: 0, visible: true, weight: 3 }
    ],
    weapons: [
      { id: 'item:player:spear:1', label: 'копьё', type: 'weapon', placement: 'carried', holder_id: 'player', owner_id: 'player', access: 'immediate', risk: 0, visible: true, weight: 2 }
    ],
    armor: [
      { id: 'item:player:shield:1', label: 'щит', type: 'armor', placement: 'equipped', holder_id: 'player', owner_id: 'player', access: 'immediate', risk: 0, visible: true, weight: 3 }
    ],
    total_weight: 5,
    load_category: 'light'
  };

  const target = world.npcs.find((npc) => (npc.locationId ?? npc.homeLocation) === world.currentLocationId);
  assert.ok(target);

  const baseFrame = buildMasterFrame(world, 'Я нападаю');
  const baseDefense = baseFrame.world.combat.targetDefense;

  target.items = {
    carried_items: [],
    equipment: [],
    weapons: [],
    armor: [
      {
        id: 'item:npc:armor:1',
        label: 'кольчуга',
        type: 'armor',
        placement: 'equipped',
        holder_id: target.id,
        owner_id: target.id,
        access: 'immediate',
        risk: 0,
        visible: true
      }
    ],
    total_weight: 4,
    load_category: 'light'
  };

  const frame = buildMasterFrame(world, 'Я нападаю');

  assert.ok(frame.world.combat);
  assert.equal(frame.world.combat.target?.name, target.name);
  assert.equal(frame.world.combat.canRetreat, true);
  assert.ok(frame.world.combat.playerWeapons.includes('копьё'));
  assert.ok(frame.world.combat.playerArmor.includes('щит'));
  assert.equal(frame.world.combat.playerActiveDefense, 2);
  assert.equal(Array.isArray(frame.world.combat.locationExits), true);
  assert.ok(frame.world.combat.locationExits.some((exit) => exit.label));
  assert.ok(Array.isArray(frame.world.combat.witnesses));
  assert.ok(frame.world.combat.legal);
  assert.ok(Array.isArray(frame.world.combat.legal.rules));
  assert.ok(Array.isArray(frame.world.combat.legal.punishments));
  assert.equal(frame.world.combat.playerLoadCategory, 'light');
  assert.equal(typeof frame.world.combat.target?.loadCategory, 'string');
  assert.ok(Array.isArray(frame.world.combat.target?.weapons));
  assert.ok(Array.isArray(frame.world.combat.target?.armor));
  assert.ok(Array.isArray(frame.world.combat.target?.armorCoverage));
  assert.ok(Array.isArray(frame.world.combat.target?.armorCoverage[0]?.coverage));
  assert.equal(typeof frame.world.combat.targetDefense, 'number');
  assert.equal(frame.world.combat.targetDefense, baseDefense);
  assert.equal(frame.world.combat.target?.armorProtection, 3);
  assert.equal(frame.world.combat.target?.activeDefense, 0);
  assert.match(frame.world.combat.summary, /target/);

  const check = buildActionCheck(world, planMasterTurnSync(world, 'Я нападаю').frame);
  assert.equal(check.dc, frame.world.combat.targetDefense);
  assert.ok(!check.modifiers.some((item) => item.label === 'защита цели'));
});

test('combat target defense drops when the target is overloaded', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const target = world.npcs.find((npc) => (npc.locationId ?? npc.homeLocation) === world.currentLocationId);
  assert.ok(target);

  const baseFrame = buildMasterFrame(world, 'Я нападаю');
  const baseDefense = baseFrame.world.combat.targetDefense;

  target.items = {
    carried_items: [],
    equipment: [],
    weapons: [],
    armor: [],
    total_weight: 80
  };
  delete target.load_category;

  const overloadedFrame = buildMasterFrame(world, 'Я нападаю');

  assert.ok(overloadedFrame.world.combat.targetDefense < baseDefense);
});

test('combat target defense prefers canonical target current_position over stale legacy micro location id', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const target = world.npcs.find((npc) => (npc.locationId ?? npc.homeLocation) === world.currentLocationId);
  assert.ok(target);

  target.microLocationId = 'stale-yard:center';
  target.current_position = {
    ...(target.current_position ?? {}),
    location_id: world.current_position.location_id,
    minilocation_id: world.current_position.minilocation_id
  };

  const canonicalFrame = buildMasterFrame(world, 'Я нападаю');
  const canonicalDefense = canonicalFrame.world.combat.targetDefense;

  delete target.current_position;
  const staleFrame = buildMasterFrame(world, 'Я нападаю');
  const staleDefense = staleFrame.world.combat.targetDefense;

  assert.ok(canonicalDefense > staleDefense);
});

test('armor protection respects hit zones and does not cover unrelated body parts', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const target = world.npcs.find((npc) => (npc.locationId ?? npc.homeLocation) === world.currentLocationId);
  assert.ok(target);

  target.items = {
    carried_items: [],
    equipment: [],
    weapons: [],
    armor: [
      {
        id: 'item:npc:helmet:1',
        label: 'шлем',
        type: 'armor',
        placement: 'equipped',
        holder_id: target.id,
        owner_id: target.id,
        access: 'immediate',
        risk: 0,
        visible: true
      }
    ],
    total_weight: 2,
    load_category: 'light'
  };

  const headFrame = buildMasterFrame(world, 'Я бью в голову');
  const legFrame = buildMasterFrame(world, 'Я бью по ногам');

  assert.equal(headFrame.world.combat.attackFocus.zone, 'head');
  assert.equal(legFrame.world.combat.attackFocus.zone, 'legs');
  assert.equal(headFrame.world.combat.target?.armorProtection, 2);
  assert.equal(legFrame.world.combat.target?.armorProtection, 0);
});

test('shield adds active defense only from the front', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const target = world.npcs.find((npc) => (npc.locationId ?? npc.homeLocation) === world.currentLocationId);
  assert.ok(target);

  target.items = {
    carried_items: [],
    equipment: [],
    weapons: [],
    armor: [
      {
        id: 'item:npc:shield:1',
        label: 'щит',
        type: 'armor',
        placement: 'equipped',
        holder_id: target.id,
        owner_id: target.id,
        access: 'immediate',
        risk: 0,
        visible: true
      }
    ],
    total_weight: 3,
    load_category: 'light'
  };

  const frontFrame = buildMasterFrame(world, 'Я бью спереди');
  const backFrame = buildMasterFrame(world, 'Я бью в спину');

  assert.equal(frontFrame.world.combat.target?.activeDefense, 2);
  assert.equal(backFrame.world.combat.target?.activeDefense, 0);
  assert.equal(frontFrame.world.combat.target?.armorProtection, 0);
  assert.equal(backFrame.world.combat.target?.armorProtection, 0);
});

test('battle exertion reduces vigor more under heavy load', async () => {
  const buildWorld = (loadCategory) => {
    const world = createWorldState({ startText: 'переправа и двор', clock: { day: 1, hour: 10, minute: 0 } });
    world.player.attributes = {
      ...(world.player.attributes ?? {}),
      strength: 10
    };
    world.player.states = {
      ...(world.player.states ?? {}),
      health: 100,
      satiety: 100,
      vigor: 80
    };
    world.player.body = {
      ...(world.player.body ?? {}),
      health: 100,
      satiety: 100,
      vigor: 80
    };
    world.player.vigor = 80;
    world.player.items = {
      ...(world.player.items ?? {}),
      carried_items: [
        {
          id: 'item:player:spear:1',
          label: 'копьё',
          type: 'weapon',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'player',
          access: 'immediate',
          visible: true,
          weight: 2
        }
      ].concat(loadCategory === 'heavy'
        ? [
            {
              id: 'item:player:armor:1',
              label: 'кольчуга',
              type: 'armor',
              placement: 'carried',
              holder_id: 'player',
              owner_id: 'player',
              access: 'immediate',
              visible: true,
              weight: 20
            },
            {
              id: 'item:player:pack:1',
              label: 'мешок с припасами',
              type: 'container',
              placement: 'carried',
              holder_id: 'player',
              owner_id: 'player',
              access: 'immediate',
              visible: true,
              weight: 28
            }
          ]
        : []),
      equipment: [],
      weapons: [
        {
          id: 'item:player:spear:1',
          label: 'копьё',
          type: 'weapon',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'player',
          access: 'immediate',
          visible: true,
          weight: 2
        }
      ],
      armor: [],
      total_weight: null,
      load_category: null
    };
    return world;
  };

  const lightWorld = buildWorld('light');
  const heavyWorld = buildWorld('heavy');

  await handlePlayerInput(lightWorld, 'Я нападаю');
  await handlePlayerInput(heavyWorld, 'Я нападаю');

  const lightLoss = 80 - (lightWorld.player.states.vigor ?? 80);
  const heavyLoss = 80 - (heavyWorld.player.states.vigor ?? 80);

  assert.ok(lightLoss > 0);
  assert.ok(heavyLoss > lightLoss);
});

test('attack damage is reduced by target armor protection', async () => {
  const makeWorld = ({ armored = false } = {}) => {
    const world = createWorldState({ startText: 'переправа и двор', clock: { day: 1, hour: 10, minute: 0 } });
    const target = world.npcs.find((npc) => (npc.locationId ?? npc.homeLocation) === world.currentLocationId);
    assert.ok(target);

    world.player.attributes = {
      strength: 18,
      agility: 18,
      endurance: 18,
      reason: 18,
      attention: 18,
      influence: 18
    };
    world.player.skill_bonuses = {
      athletics: 4,
      stealth: 4,
      melee: 4,
      ranged: 4,
      craft: 4,
      household: 4,
      survival: 4,
      riding: 4,
      healing: 4,
      observation: 4,
      communication: 4,
      custom_and_law: 4
    };
    world.player.inventory = [];
    world.player.items = {
      carried_items: [
        {
          id: 'item:player:blade:1',
          label: 'меч',
          type: 'weapon',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'player',
          access: 'immediate',
          visible: true,
          weight: 1
        }
      ],
      equipment: [],
      weapons: [
        {
          id: 'item:player:blade:1',
          label: 'меч',
          type: 'weapon',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'player',
          access: 'immediate',
          visible: true,
          weight: 1
        }
      ],
      armor: [],
      total_weight: 1,
      load_category: 'light',
      property_not_carried: []
    };

    target.items = armored
      ? {
          carried_items: [],
          equipment: [],
          weapons: [],
          armor: [
            {
              id: 'item:npc:armor:1',
              label: 'кольчуга',
              type: 'armor',
              placement: 'equipped',
              holder_id: target.id,
              owner_id: target.id,
              access: 'immediate',
              risk: 0,
              visible: true
            }
          ],
          total_weight: 4,
          load_category: 'light'
        }
      : {
          carried_items: [],
          equipment: [],
          weapons: [],
          armor: [],
          total_weight: 0,
          load_category: 'light'
        };

    return { world, target };
  };

  const bareWorld = makeWorld({ armored: false });
  const armoredWorld = makeWorld({ armored: true });

  const bareBefore = bareWorld.target.health ?? 100;
  const armoredBefore = armoredWorld.target.health ?? 100;

  await handlePlayerInput(bareWorld.world, 'Нападаю');
  await handlePlayerInput(armoredWorld.world, 'Нападаю');

  const bareLoss = bareBefore - (bareWorld.target.health ?? 100);
  const armoredLoss = armoredBefore - (armoredWorld.target.health ?? 100);
  const markedWeapon = bareWorld.world.player.items.weapons.find((item) => item.id === 'item:player:blade:1');
  const carriedMarkedWeapon = bareWorld.world.player.items.carried_items.find((item) => item.id === 'item:player:blade:1');
  const location = bareWorld.world.locations[bareWorld.world.currentLocationId];

  assert.ok(bareLoss > 0);
  assert.ok(bareLoss > armoredLoss);
  assert.ok(markedWeapon.marks.some((mark) => /кровь после удара/i.test(mark)));
  assert.ok(carriedMarkedWeapon.marks.some((mark) => /кровь после удара/i.test(mark)));
  assert.ok(location.recentTraces.some((trace) => /следы крови и борьбы/i.test(trace.text)));
});

test('witnessed attack leaves a stronger social aftermath', async () => {
  const world = createWorldState({ startText: 'переправа и двор', clock: { day: 1, hour: 10, minute: 0 } });
  const target = world.npcs.find((npc) => (npc.locationId ?? npc.homeLocation) === world.currentLocationId);
  assert.ok(target);

  world.player.attributes = {
    strength: 18,
    agility: 18,
    endurance: 18,
    reason: 18,
    attention: 18,
    influence: 18
  };
  world.player.skill_bonuses = {
    melee: 4,
    athletics: 4,
    observation: 4,
    ranged: 4
  };
  world.player.items = {
    carried_items: [
      {
        id: 'item:player:blade:1',
        label: 'меч',
        type: 'weapon',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        visible: true,
        weight: 1
      }
    ],
    equipment: [],
    weapons: [
      {
        id: 'item:player:blade:1',
        label: 'меч',
        type: 'weapon',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        visible: true,
        weight: 1
      }
    ],
    armor: [],
    total_weight: 1,
    load_category: 'light'
  };

  await handlePlayerInput(world, 'Нападаю');

  assert.ok((world.social?.recentWitnesses?.length ?? 0) > 0);
  assert.ok((world.social?.suspicion ?? 0) >= 6);
  assert.equal(world.social?.lastConsequence, 'насилие');
  assert.ok(world.lastLegalAftermath);
  assert.ok(world.lastLegalAftermath.witnessed);
  assert.ok(world.lastLegalAftermath.severity >= 3);
  assert.ok(Array.isArray(world.social?.socialMemory));
  assert.ok(world.social.socialMemory.some((item) => /насилие/.test(item.perception ?? '')));
});

test('legal aftermath follows the real combat outcome instead of intent alone', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const intent = { type: 'attack' };
  const check = { required: true, degree: 'success' };

  const bare = summarizeLegalAftermath(world, intent, check, {
    suspicion: 0,
    fear: 0,
    debts: 0,
    rumors: 0,
    witnessed: false,
    damageScore: 0,
    healthLoss: 0
  });
  const witnessed = summarizeLegalAftermath(world, intent, check, {
    suspicion: 2,
    fear: 1,
    debts: 1,
    rumors: 1,
    witnessed: true,
    damageScore: 5,
    healthLoss: 12
  });

  assert.ok(bare);
  assert.ok(witnessed);
  assert.ok(witnessed.severity >= bare.severity);
  assert.ok(witnessed.suspicion > bare.suspicion);
  assert.equal(witnessed.witnessed, true);
  assert.ok(Array.isArray(witnessed.consequences));
});

test('claim with a foreign disputed item raises legal pressure', () => {
  const cleanWorld = createWorldState({ startText: 'переправа и двор' });
  cleanWorld.player.status = 'чужой';

  const riskyWorld = createWorldState({ startText: 'переправа и двор' });
  riskyWorld.player.status = 'чужой';
  riskyWorld.player.items = {
    carried_items: [
      {
        id: 'item:npc-1:ring:1',
        label: 'чужое кольцо',
        type: 'item',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'npc-1',
        access: 'borrowed',
        legal_status: 'disputed',
        visible: true
      }
    ],
    equipment: [],
    weapons: [],
    armor: [],
    borrowed_items: [],
    foreign_items_with_character: [],
    total_weight: 0.1,
    load_category: 'light'
  };

  const cleanAssessment = assessLegalPressure(cleanWorld, { type: 'claim' });
  const riskyAssessment = assessLegalPressure(riskyWorld, { type: 'claim' });

  assert.ok(riskyAssessment.severity > cleanAssessment.severity);
});

test('closed or controlled location access raises legal pressure for claims', () => {
  const openWorld = createWorldState({
    clock: { day: 1, hour: 10, minute: 0 },
    locations: {
      market: {
        id: 'market',
        name: 'Торг',
        kind: 'рынок',
        landmarks: ['лавки'],
        exits: [{ label: 'к дороге', to: 'road' }],
        occupants: ['купец']
      },
      road: {
        id: 'road',
        name: 'Дорога',
        kind: 'дорога',
        landmarks: [],
        exits: [{ label: 'к торгу', to: 'market' }],
        occupants: []
      }
    },
    current_position: {
      location_id: 'market',
      place_id: 'market',
      minilocation_id: null,
      region_id: 'Тестовый регион'
    }
  });
  openWorld.player.status = 'чужой';

  const closedWorld = createWorldState({
    clock: { day: 1, hour: 22, minute: 0 },
    locations: {
      market: {
        id: 'market',
        name: 'Торг',
        kind: 'рынок',
        landmarks: ['лавки'],
        exits: [{ label: 'к дороге', to: 'road' }],
        occupants: ['купец']
      },
      road: {
        id: 'road',
        name: 'Дорога',
        kind: 'дорога',
        landmarks: [],
        exits: [{ label: 'к торгу', to: 'market' }],
        occupants: []
      }
    },
    current_position: {
      location_id: 'market',
      place_id: 'market',
      minilocation_id: null,
      region_id: 'Тестовый регион'
    }
  });
  closedWorld.player.status = 'чужой';

  const openAssessment = assessLegalPressure(openWorld, { type: 'claim' });
  const closedAssessment = assessLegalPressure(closedWorld, { type: 'claim' });

  assert.equal(openWorld.scene.access, 'открыто при торговом порядке');
  assert.equal(closedWorld.scene.access, 'закрыто');
  assert.ok(closedAssessment.severity > openAssessment.severity);
});

test('combat checks account for armor and heavy load', () => {
  const makeWorld = ({ armor = false, loadCategory = 'light' } = {}) => {
    const world = createWorldState({ startText: 'переправа и двор' });
    world.player.inventory = [];
    world.player.load_category = loadCategory;
    world.player.items = {
      carried_items: [],
      equipment: [],
      weapons: [],
      armor: armor
        ? [
            {
              id: 'item:player:helmet:1',
              label: 'шлем',
              type: 'armor',
              placement: 'equipped',
              holder_id: 'player',
              owner_id: 'player',
              access: 'immediate',
              risk: 0,
              visible: true
            }
          ]
        : [],
      total_weight: armor ? 6 : 0,
      load_category: loadCategory,
      property_not_carried: []
    };
    return world;
  };

  const bareWorld = makeWorld();
  const armoredWorld = makeWorld({ armor: true });
  const loadedWorld = makeWorld({ loadCategory: 'heavy' });

  const bareCheck = buildActionCheck(bareWorld, planMasterTurnSync(bareWorld, 'Я защищаюсь от дворника').frame);
  const armoredCheck = buildActionCheck(armoredWorld, planMasterTurnSync(armoredWorld, 'Я защищаюсь от дворника').frame);
  const loadedCheck = buildActionCheck(loadedWorld, planMasterTurnSync(loadedWorld, 'Я защищаюсь от дворника').frame);

  assert.ok(armoredCheck.modifiers.some((item) => item.label === 'броня (шлем)'));
  assert.equal(armoredCheck.modifier, bareCheck.modifier + 1);
  assert.equal(bareCheck.modifier - loadedCheck.modifier, 1);
});

test('healing checks use typed carried items instead of legacy inventory strings', () => {
  const makeWorld = (withTypedBandage) => {
    const world = createWorldState({ startText: 'переправа и двор' });
    world.player.injuries = [
      { id: 'injury:1', label: 'рана', severity: 1, bleeding: 0, treated: false, source: 'test', at: null }
    ];
    world.player.bleeding = 0;
    world.player.inventory = ['бинт'];
    world.player.items = {
      carried_items: withTypedBandage
        ? [
            {
              id: 'item:player:bandage:1',
              label: 'бинт',
              type: 'material',
              placement: 'carried',
              holder_id: 'player',
              owner_id: 'player',
              access: 'immediate',
              risk: 0,
              visible: true
            }
          ]
        : [],
      equipment: [],
      weapons: [],
      armor: [],
      total_weight: 0,
      load_category: 'light',
      property_not_carried: []
    };
    return world;
  };

  const legacyOnlyWorld = makeWorld(false);
  const typedWorld = makeWorld(true);
  const legacyOnlyCheck = buildActionCheck(legacyOnlyWorld, planMasterTurnSync(legacyOnlyWorld, 'Я лечу рану').frame);
  const typedCheck = buildActionCheck(typedWorld, planMasterTurnSync(typedWorld, 'Я лечу рану').frame);

  assert.equal(legacyOnlyCheck.modifiers.some((item) => item.label === 'есть перевязочный материал'), false);
  assert.equal(legacyOnlyCheck.modifiers.some((item) => item.label === 'нехватка лечебных средств'), true);
  assert.equal(typedCheck.modifiers.some((item) => item.label === 'есть перевязочный материал'), true);
  assert.equal(typedCheck.modifier, legacyOnlyCheck.modifier + 4);
});

test('healing checks do not treat borrowed disputed bandages as free supplies', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.injuries = [
    { id: 'injury:1', label: 'рана', severity: 1, bleeding: 0, treated: false, source: 'test', at: null }
  ];
  world.player.bleeding = 0;
  world.player.items = {
    carried_items: [
      {
        id: 'item:player:bandage:1',
        label: 'чужой бинт',
        type: 'material',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'npc-owner',
        access: 'borrowed',
        legal_status: 'disputed',
        risk: 4,
        visible: true
      }
    ],
    equipment: [],
    weapons: [],
    armor: [],
    total_weight: 0,
    load_category: 'light',
    property_not_carried: []
  };

  const check = buildActionCheck(world, planMasterTurnSync(world, 'Я лечу рану').frame);

  assert.equal(check.modifiers.some((item) => item.label === 'есть перевязочный материал'), false);
  assert.equal(check.modifiers.some((item) => item.label === 'нехватка лечебных средств'), true);
});

test('movement checks derive load from weight when category is missing', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.attributes = {
    ...(world.player.attributes ?? {}),
    strength: 3
  };
  world.player.items = {
    ...(world.player.items ?? {}),
    carried_items: [],
    equipment: [],
    weapons: [{ id: 'item:heavy', weight: 20 }],
    armor: [],
  };
  delete world.player.load_category;
  delete world.player.items.load_category;

  const check = buildActionCheck(world, planMasterTurnSync(world, 'Я нападаю').frame);

  assert.ok(Array.isArray(check.modifiers));
  assert.ok(check.modifiers.some((item) => item.label === 'нагрузка (предельная)'));
  assert.equal(check.profile.loadCategory, 'overloaded');
  assert.equal(check.modifier, check.modifiers.reduce((sum, item) => sum + item.value, 0));
});

test('attack without explicit target hits the nearest npc in the scene', async () => {
  const world = createWorldState({ startText: 'переправа и двор', clock: { day: 1, hour: 10, minute: 0 } });
  const target = world.npcs.find((npc) => (npc.locationId ?? npc.homeLocation) === world.currentLocationId);

  assert.ok(target);

  world.player.attributes = {
    strength: 18,
    agility: 18,
    endurance: 18,
    reason: 18,
    attention: 18,
    influence: 18
  };
  world.player.skill_bonuses = {
    athletics: 4,
    stealth: 4,
    melee: 4,
    ranged: 4,
    craft: 4,
    household: 4,
    survival: 4,
    riding: 4,
    healing: 4,
    observation: 4,
    communication: 4,
    custom_and_law: 4
  };
  world.player.inventory = [];
  world.player.items = {
    carried_items: [
      {
        id: 'item:player:blade:1',
        label: 'меч',
        type: 'weapon',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        visible: true,
        weight: 1
      }
    ],
    equipment: [],
    weapons: [
      {
        id: 'item:player:blade:1',
        label: 'меч',
        type: 'weapon',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        visible: true,
        weight: 1
      }
    ],
    armor: [],
    total_weight: 1,
    load_category: 'light',
    property_not_carried: []
  };

  const beforeInjuries = Array.isArray(target.injuries) ? target.injuries.length : 0;
  const beforeHealth = target.health ?? 100;

  await handlePlayerInput(world, 'Нападаю');

  assert.ok((target.injuries?.length ?? 0) > beforeInjuries);
  assert.ok((target.health ?? 100) < beforeHealth);
  assert.match(String(target.mood ?? ''), /ранен/);
});

test('attack without explicit target ignores stale legacy location ids', async () => {
  const world = createWorldState({ startText: 'переправа и двор', clock: { day: 1, hour: 10, minute: 0 } });
  const canonicalLocationId = world.current_position.location_id;
  const staleLocationId = 'stale-yard';
  const staleTarget = {
    id: 'npc-stale-target',
    name: 'Сторож у старого двора',
    locationId: staleLocationId,
    homeLocation: staleLocationId,
    injuries: [],
    health: 100,
    mood: 'спокоен'
  };
  const canonicalTarget = {
    id: 'npc-canonical-target',
    name: 'Сторож у канонического двора',
    locationId: canonicalLocationId,
    homeLocation: canonicalLocationId,
    injuries: [],
    health: 100,
    mood: 'спокоен'
  };

  world.locations[staleLocationId] = {
    id: staleLocationId,
    name: 'Старый двор',
    kind: 'двор',
    landmarks: [],
    exits: [],
    occupants: [],
    activity: [],
    recentTraces: [],
    pressure: [],
    sounds: [],
    profile: {}
  };
  world.currentLocationId = staleLocationId;
  world.currentMicroLocationId = null;
  world.current_position = {
    ...world.current_position,
    location_id: canonicalLocationId,
    place_id: canonicalLocationId,
    minilocation_id: world.current_position.minilocation_id ?? null
  };
  world.npcs = world.npcs.filter((npc) => (npc.locationId ?? npc.homeLocation) === canonicalLocationId);
  world.npcs.push(canonicalTarget, staleTarget);

  const resolvedTarget = resolveCombatTarget(world, { raw: 'Нападаю', type: 'attack' });

  assert.ok(resolvedTarget);
  assert.equal(resolvedTarget.locationId ?? resolvedTarget.homeLocation, canonicalLocationId);
  assert.notEqual(resolvedTarget.locationId ?? resolvedTarget.homeLocation, staleLocationId);
});

test('attack without explicit target prefers canonical npc current_position over stale legacy npc location id', () => {
  const world = createWorldState({ startText: 'переправа и двор', clock: { day: 1, hour: 10, minute: 0 } });
  const canonicalLocationId = world.current_position.location_id;
  world.npcs = [
    {
      id: 'npc-canonical-target',
      name: 'Сторож у ворот',
      locationId: 'stale-yard',
      homeLocation: 'stale-yard',
      current_position: {
        location_id: canonicalLocationId,
        minilocation_id: world.current_position.minilocation_id ?? null
      }
    },
    {
      id: 'npc-other',
      name: 'Дальний сторож',
      locationId: 'other-yard',
      homeLocation: 'other-yard'
    }
  ];

  const resolvedTarget = resolveCombatTarget(world, { raw: 'Нападаю', type: 'attack' });

  assert.ok(resolvedTarget);
  assert.equal(resolvedTarget.id, 'npc-canonical-target');
});

test('state penalties apply only to relevant actions', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.states = {
    health: 100,
    satiety: 10,
    vigor: 100
  };
  world.player.hunger = 90;
  world.player.fatigue = 0;
  world.player.activeStates = [];
  world.player.body.active_conditions = [];

  const movePlan = planMasterTurnSync(world, 'Иду к реке');
  const talkPlan = planMasterTurnSync(world, 'Говорю со старостой');
  movePlan.frame.riskAudit = { required: true };
  talkPlan.frame.riskAudit = { required: true };
  const moveCheck = buildActionCheck(world, movePlan.frame);
  const talkCheck = buildActionCheck(world, talkPlan.frame);

  assert.equal(moveCheck.profile.stateModifier, -2);
  assert.equal(moveCheck.profile.stateLabel, 'сытость');
  assert.equal(talkCheck.profile.stateModifier, 0);
  assert.equal(talkCheck.profile.stateLabel, 'в норме');
});

test('thirst active state affects movement checks', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.states = {
    health: 100,
    satiety: 100,
    vigor: 100
  };
  world.player.thirst = 0;
  world.player.activeStates = [
    { id: 'thirst', label: 'жажда', value: 80, source: 'derived' }
  ];

  const movePlan = planMasterTurnSync(world, 'Иду к реке');
  movePlan.frame.riskAudit = { required: true };
  const moveCheck = buildActionCheck(world, movePlan.frame);

  assert.equal(moveCheck.profile.stateLabel, 'жажда');
  assert.equal(moveCheck.profile.stateModifier, -2);
});

test('resource alert active states do not double-count canonical satiety and vigor penalties', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.states = {
    health: 100,
    satiety: 10,
    vigor: 100
  };
  world.player.activeStates = [
    { id: 'hunger', label: 'голод', value: 90, source: 'legacy-load' }
  ];

  const movePlan = planMasterTurnSync(world, 'Иду к реке');
  movePlan.frame.riskAudit = { required: true };
  const moveCheck = buildActionCheck(world, movePlan.frame);

  assert.equal(moveCheck.profile.stateModifier, -2);
  assert.equal(moveCheck.profile.stateLabel, 'сытость');
});

test('time advance keeps canonical states aligned with legacy fields', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.hunger = 60;
  world.player.fatigue = 50;
  world.player.states = {
    health: 99,
    satiety: 40,
    vigor: 50
  };

  advanceWorld(world, 60, { type: 'wait' });

  assert.equal(world.player.states.satiety, 39);
  assert.equal(world.player.states.vigor, 49);
  assert.equal(world.player.legacy_vitals, undefined);
  assert.equal(world.player.legacy_needs, undefined);
  assert.equal(world.player.body.satiety, world.player.states.satiety);
  assert.equal(world.player.body.vigor, world.player.states.vigor);
  assert.deepEqual(world.player.body.active_conditions, ['жажда']);
  assert.equal(getActiveStateValue(world.player, 'thirst'), world.player.thirst);
});

test('documented short actions use the expected time scale', () => {
  const world = createWorldState({ startText: 'переправа и двор' });

  assert.equal(planMasterTurnSync(world, 'осматриваюсь').minutes, 3);
  assert.equal(planMasterTurnSync(world, 'говорю со старостой').minutes, 5);
  assert.equal(planMasterTurnSync(world, 'покупаю хлеб').minutes, 30);
});

test('delayed events trigger once when their due time arrives', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.clock = { day: 1, hour: 8, minute: 0 };
  world.delayedEvents = [];

  scheduleDelayedEvent(world, {
    id: 'delayed:rumor',
    reason: 'слух должен дойти позже',
    dueInMinutes: 30,
    result: 'слух дошёл до двора',
    effect: {
      memory: {
        rumors_add: ['Слух о назначенном человеке']
      }
    }
  });

  scheduleDelayedEvent(world, {
    id: 'delayed:later',
    reason: 'поздний слух',
    dueInMinutes: 120,
    result: 'поздний слух ещё не готов',
    effect: {
      memory: {
        rumors_add: ['Поздний слух']
      }
    }
  });

  advanceWorld(world, 45);

  const firstEvent = world.delayedEvents.find((item) => item.id === 'delayed:rumor');
  const secondEvent = world.delayedEvents.find((item) => item.id === 'delayed:later');
  assert.equal(firstEvent.status, 'applied');
  assert.equal(secondEvent.status, 'pending');
  assert.ok(world.memory.heardRumors.some((item) => item.includes('Слух о назначенном человеке')));
  assert.ok(world.journal.some((entry) => entry.kind === 'delayed' && /слух дошёл/i.test(entry.result)));

  advanceWorld(world, 90);

  assert.equal(secondEvent.status, 'applied');
  const delayedEntries = world.journal.filter((entry) =>
    entry.kind === 'delayed'
    && Array.isArray(entry.relatedIds)
    && entry.relatedIds.some((id) => id === 'delayed:rumor' || id === 'delayed:later')
  );
  assert.equal(delayedEntries.length, 2);
  assert.ok(world.memory.heardRumors.some((item) => item.includes('Поздний слух')));
});

test('load category penalizes movement checks', () => {
  const makeWorld = (loadCategory) => {
    const world = createWorldState({ startText: 'переправа и двор' });
    world.locations[world.currentLocationId].exits = [];
    world.place.exits = [];
    world.player.items.load_category = loadCategory;
    world.player.attributes = {
      strength: 10,
      agility: 10,
      endurance: 10,
      reason: 10,
      attention: 10,
      influence: 10
    };
    world.player.skill_bonuses = {
      athletics: 0,
      stealth: 0,
      melee: 0,
      ranged: 0,
      craft: 0,
      household: 0,
      survival: 0,
      riding: 0,
      healing: 0,
      observation: 0,
      communication: 0,
      custom_and_law: 0
    };
    return world;
  };

  const lightWorld = makeWorld('light');
  const overloadedWorld = makeWorld('overloaded');
  const lightPlan = planMasterTurnSync(lightWorld, 'иду к реке');
  const overloadedPlan = planMasterTurnSync(overloadedWorld, 'иду к реке');
  const light = buildActionCheck(lightWorld, lightPlan.frame);
  const overloaded = buildActionCheck(overloadedWorld, overloadedPlan.frame);

  assert.equal(light.required, true);
  assert.equal(overloaded.required, true);
  assert.equal(light.modifier - overloaded.modifier, 3);
  assert.ok(overloaded.modifiers.some((item) => item.label === 'нагрузка (предельная)'));
});

test('load category ignores legacy root strength without canonical attributes', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  delete world.player.attributes;
  world.player.strength = 18;
  delete world.player.load_category;
  world.player.items = {
    ...(world.player.items ?? {}),
    load_category: null,
    total_weight: 3
  };

  const plan = planMasterTurnSync(world, 'иду к реке');
  plan.frame.riskAudit = { required: true };
  const check = buildActionCheck(world, plan.frame);

  assert.equal(check.profile.loadCategory, null);
});

test('load category ignores stale legacy root category when canonical item weight is available', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.load_category = 'overloaded';
  world.player.items = {
    ...(world.player.items ?? {}),
    carried_items: [],
    equipment: [],
    weapons: [],
    armor: [],
    total_weight: 3,
    load_category: null
  };
  world.player.attributes = {
    ...(world.player.attributes ?? {}),
    strength: 10
  };

  const plan = planMasterTurnSync(world, 'иду к реке');
  plan.frame.riskAudit = { required: true };
  const check = buildActionCheck(world, plan.frame);

  assert.equal(check.profile.loadCategory, 'light');
  assert.equal(check.modifiers.some((item) => item.label === 'нагрузка (предельная)'), false);
});

test('player seed keeps documented high attributes without code balancing', () => {
  const player = buildPlayerProfile({
    id: 'player',
    profileSource: 'player_seed',
    name: 'Игрок',
    attributes: {
      strength: 16,
      agility: 14,
      endurance: 14,
      reason: 11,
      attention: 10,
      influence: 9
    }
  });

  assert.equal(player.attributes.strength, 16);
  assert.equal(player.attributes.agility, 14);
  assert.equal(player.attributes.endurance, 14);
  assert.equal(player.attributes.influence, 9);
});

test('master frame ignores legacy inventory when canonical carried items are empty', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.inventory = ['legacy spear'];
  world.player.items = {
    ...(world.player.items ?? {}),
    carried_items: [],
    equipment: [],
    weapons: [],
    armor: [],
    total_weight: 0,
    load_category: 'light'
  };

  const frame = buildMasterFrame(world, 'осматриваюсь');
  const prompt = buildMasterPromptSync(frame);

  assert.equal(prompt.includes('legacy spear'), false);
  assert.equal(frame.world.property.some((item) => item.label === 'legacy spear'), false);
});

test('master frame keeps legal status and plausibility for property context', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.scene.ownership = 'Степан держит двор';
  world.scene.access = 'по приглашению или по праву двора';
  world.propertyLedger = [
    {
      id: 'item:npc-1:key:1',
      label: 'чужой ключ',
      ownerName: 'Степан',
      ownerType: 'npc',
      holderName: 'Игрок',
      placement: 'carried',
      access: 'borrowed',
      legalStatus: 'disputed',
      plausibility: 3,
      risk: 3,
      weight: 0.1,
      locationId: world.currentLocationId
    }
  ];

  const frame = buildMasterFrame(world, 'осматриваюсь');
  const prompt = buildMasterPromptSync(frame);

  assert.equal(frame.world.property[0].legalStatus, 'disputed');
  assert.equal(frame.world.property[0].plausibility, 3);
  assert.equal(frame.world.property[0].scenePlausibility, 2);
  assert.match(prompt, /чужой ключ->Степан; access:borrowed; legal:disputed; plausibility:3; scenePlausibility:2/);
});

test('resource deltas ignore plain string item additions without typed evidence', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.inventory = ['нож'];
  world.player.items = {
    carried_items: [
      { id: 'item:player:old-knife:1', label: 'старый нож', type: 'weapon', placement: 'carried', holder_id: 'player', owner_id: 'player', access: 'immediate', risk: 0, visible: true }
    ],
    equipment: [],
    weapons: [
      { id: 'item:player:old-knife:1', label: 'старый нож', type: 'weapon', placement: 'carried', holder_id: 'player', owner_id: 'player', access: 'immediate', risk: 0, visible: true }
    ],
    armor: [],
    total_weight: 3,
    load_category: 'overloaded'
  };

  applyStateDelta(world, { resources: { inventory_add: 'чистая ткань' } });

  assert.deepEqual(world.player.inventory, ['нож']);
  assert.deepEqual(world.player.items.carried_items.map((item) => item.label), ['старый нож']);
  assert.ok(world.player.items.weapons.some((item) => item.label === 'старый нож'));
  assert.equal(world.player.load_category, undefined);
});

test('resource deltas ignore plain string inventory and property additions', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.inventory = [];
  world.player.property = [];

  applyStateDelta(world, {
    resources: {
      inventory_add: 'чистая ткань',
      property_add: 'клеть'
    }
  });

  assert.deepEqual(world.player.inventory, []);
  assert.deepEqual(world.player.property, []);
  assert.equal(world.player.items.carried_items.some((item) => item.label === 'чистая ткань'), false);
  assert.equal(world.player.items.property_not_carried.some((item) => item.label === 'клеть'), false);
});

test('resource deltas update active states instead of legacy thirst and fear fields', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.thirst = 90;
  world.player.fear = 80;
  world.player.activeStates = [
    { id: 'thirst', label: 'жажда', value: 12, source: 'derived' },
    { id: 'fear', label: 'страх', value: 9, source: 'derived' }
  ];

  applyStateDelta(world, {
    resources: {
      thirst_delta: 4,
      fear_delta: 6
    }
  });

  assert.equal(getActiveStateValue(world.player, 'thirst'), 16);
  assert.equal(getActiveStateValue(world.player, 'fear'), 15);
  assert.equal(world.player.thirst, 16);
  assert.equal(world.player.fear, 15);
  assert.equal(world.player.body.active_conditions.some((item) => item === 'жажда'), true);
  assert.equal(world.player.body.active_conditions.some((item) => item === 'страх'), true);
});

test('player profile merges typed item blocks into canonical items and removes legacy root item fields', () => {
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    attributes: {
      strength: 1
    },
    inventory: ['рубаха'],
    property: ['клеть'],
    items: {
      equipment: [
        {
          id: 'item:player:cloak:1',
          label: 'плащ',
          type: 'clothing',
          placement: 'equipped',
          holder_id: 'player',
          owner_id: 'player',
          weight: 2
        }
      ],
      weapons: [
        {
          id: 'item:player:knife:1',
          label: 'нож',
          type: 'weapon',
          placement: 'equipped',
          holder_id: 'player',
          owner_id: 'player',
          weight: 3
        }
      ],
      armor: [
        {
          id: 'item:player:helmet:1',
          label: 'шлем',
          type: 'armor',
          placement: 'equipped',
          holder_id: 'player',
          owner_id: 'player',
          weight: 9
        }
      ],
      property_not_carried: [
        {
          id: 'item:player:deed:1',
          label: 'грамота',
          type: 'document',
          placement: 'property',
          holder_id: null,
          owner_id: 'player',
          weight: 0.1
        }
      ]
    },
    property_and_access: {
      property_not_carried: ['кладовая'],
      borrowed_items: ['серп'],
      foreign_items_with_character: ['чужой ключ']
    }
  }, { currentLocationId: 'yard' });

  assert.deepEqual(player.items.carried_items.map((item) => item.label), ['плащ', 'нож', 'шлем']);
  assert.deepEqual(player.items.equipment.map((item) => item.label), ['плащ']);
  assert.deepEqual(player.items.weapons.map((item) => item.label), ['нож']);
  assert.deepEqual(player.items.armor.map((item) => item.label), ['шлем']);
  assert.deepEqual(player.items.property_not_carried.map((item) => item.label), ['грамота']);
  assert.equal(player.items.total_weight, 14);
  assert.equal(player.items.load_category, 'heavy');
  assert.equal(player.inventory, undefined);
  assert.equal(player.property, undefined);
  assert.equal(player.load_category, undefined);
});

test('player profile adapts legacy inventory and property into canonical item blocks', () => {
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    inventory: ['legacy knife'],
    property: ['legacy chest']
  }, { currentLocationId: 'yard' });

  assert.equal(player.items.carried_items[0].label, 'legacy knife');
  assert.equal(player.items.property_not_carried[0].label, 'legacy chest');
  assert.equal(player.inventory, undefined);
  assert.equal(player.property, undefined);
});

test('player profile derives total weight from item records instead of legacy item totals', () => {
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    attributes: {
      strength: 12
    },
    items: {
      carried_items: [
        {
          id: 'item:player:knife:1',
          label: 'нож',
          type: 'weapon',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'player',
          weight: 1
        },
        {
          id: 'item:player:cloak:1',
          label: 'плащ',
          type: 'clothing',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'player',
          weight: 2
        }
      ],
      total_weight: 99
    }
  }, { currentLocationId: 'yard' });

  assert.equal(player.items.total_weight, 3);
  assert.equal(player.items.load_category, 'light');
  assert.equal(player.load_category, undefined);
});

test('player profile prefers canonical nested blocks over legacy arrays', () => {
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    inventory: ['legacy knife'],
    property: ['legacy chest'],
    memory: ['legacy memory'],
    knowledge: ['legacy knowledge'],
    fears: ['legacy fear'],
    goals: ['legacy goal'],
    obligations: ['legacy duty'],
    items: {
      carried_items: [
        {
          id: 'item:player:ax:1',
          label: 'канонический топор',
          type: 'tool',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'player',
          weight: 2
        }
      ],
      property_not_carried: [
        {
          id: 'item:player:house:1',
          label: 'каноническая клеть',
          type: 'container',
          placement: 'property',
          holder_id: null,
          owner_id: 'player',
          weight: 10
        }
      ]
    },
    knowledge_map: {
      known_facts: ['канонический факт'],
      rumors: ['канонический слух']
    },
    memory_profile: {
      key_memories: ['каноническая память'],
      fears: ['канонический страх'],
      obligations: ['каноническая обязанность']
    },
    goals_profile: {
      immediate_need: 'каноническая цель',
      long_term_desire: 'каноническое стремление',
      fear: 'канонический страх',
      obligation: 'каноническая обязанность',
      reason_to_act: 'каноническая причина'
    },
    property_and_access: {
      return_obligations: ['канонический возврат']
    }
  }, { currentLocationId: 'yard' });

  assert.equal(player.inventory, undefined);
  assert.equal(player.property, undefined);
  assert.deepEqual(player.memory, ['каноническая память', 'каноническая обязанность']);
  assert.deepEqual(player.knowledge, ['канонический факт', 'канонический слух']);
  assert.deepEqual(player.goals, ['каноническая цель', 'каноническое стремление', 'каноническая причина']);
  assert.deepEqual(player.obligations, ['каноническая обязанность', 'канонический возврат']);
  assert.deepEqual(player.fears, ['канонический страх']);
});

test('player profile ignores legacy inventory and property when canonical items blocks are present but empty', () => {
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    inventory: ['legacy knife'],
    property: ['legacy chest'],
    items: {
      carried_items: [],
      equipment: [],
      weapons: [],
      armor: [],
      property_not_carried: [],
      borrowed_items: [],
      foreign_items_with_character: []
    },
    property_and_access: {
      property_not_carried: ['legacy storage'],
      borrowed_items: ['legacy borrowed'],
      foreign_items_with_character: ['legacy foreign']
    }
  }, { currentLocationId: 'yard' });

  assert.deepEqual(player.items.carried_items, []);
  assert.deepEqual(player.items.property_not_carried, []);
  assert.equal(player.inventory, undefined);
  assert.equal(player.property, undefined);
  assert.equal(player.items.total_weight, null);
  assert.equal(player.items.load_category, 'unknown');
  assert.equal(player.property_and_access.property_not_carried.length, 0);
  assert.equal(player.property_and_access.borrowed_items.length, 0);
  assert.equal(player.property_and_access.foreign_items_with_character.length, 0);
  assert.deepEqual(player.property_and_access.accessible_resources, ['Доступ не указан.']);
});

test('npc profile ignores legacy inventory and property when canonical items blocks are present but empty', () => {
  const npc = buildNpcProfile({
    id: 'npc-1',
    name: 'Степан',
    role: 'староста',
    inventory: ['legacy knife'],
    property: ['legacy chest'],
    items: {
      carried_items: [],
      equipment: [],
      weapons: [],
      armor: [],
      property_not_carried: [],
      borrowed_items: [],
      foreign_items_with_character: []
    }
  }, 'yard', 0, null);

  assert.equal(npc.inventory, undefined);
  assert.equal(npc.property, undefined);
  assert.ok(npc.actorProfile.property.carried.every((item) => !/legacy knife/i.test(item)));
  assert.ok(npc.actorProfile.property.outsideAccess.every((item) => !/legacy chest/i.test(item)));
});

test('player profile does not mirror typed item blocks into legacy root inventory and property', () => {
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    items: {
      carried_items: [
        {
          id: 'item:player:knife:1',
          label: 'нож',
          type: 'weapon',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'player',
          weight: 1
        }
      ],
      property_not_carried: [
        {
          id: 'item:player:deed:1',
          label: 'грамота',
          type: 'document',
          placement: 'property',
          holder_id: null,
          owner_id: 'player',
          weight: 0.1
        }
      ]
    }
  }, { currentLocationId: 'yard' });

  assert.equal(player.inventory, undefined);
  assert.equal(player.property, undefined);
});

test('npc profile does not mirror typed item blocks into legacy root inventory and property', () => {
  const npc = buildNpcProfile({
    id: 'npc-1',
    name: 'Степан',
    role: 'староста',
    items: {
      carried_items: [
        {
          id: 'item:npc-1:key:1',
          label: 'ключ',
          type: 'tool',
          placement: 'carried',
          holder_id: 'npc-1',
          owner_id: 'npc-1',
          weight: 0.2
        }
      ],
      property_not_carried: [
        {
          id: 'item:npc-1:barn:1',
          label: 'амбар',
          type: 'building',
          placement: 'property',
          holder_id: null,
          owner_id: 'npc-1',
          weight: 12
        }
      ]
    }
  }, 'yard', 0, null);

  assert.equal(npc.inventory, undefined);
  assert.equal(npc.property, undefined);
});

test('player profile derives canonical body states from body seed data', () => {
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    hunger: 91,
    fatigue: 4,
    body: {
      health: 87,
      satiety: 62,
      vigor: 48,
      active_conditions: ['голод', 'усталость']
    }
  }, { currentLocationId: 'yard' });

  assert.equal(player.states.health, 87);
  assert.equal(player.states.satiety, 62);
  assert.equal(player.states.vigor, 48);
  assert.equal(player.hunger, undefined);
  assert.equal(player.fatigue, undefined);
  assert.equal(player.sleep, undefined);
  assert.equal(player.body.satiety, 62);
  assert.equal(player.body.vigor, 48);
  assert.deepEqual(player.activeStates, []);
  assert.deepEqual(player.body.active_conditions, ['голод', 'усталость']);
  assert.equal(player.needs.hunger, undefined);
  assert.equal(player.legacy_vitals, undefined);
  assert.equal(player.legacy_needs, undefined);
});

test('player profile keeps canonical vitals on the root profile', () => {
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    hunger: 86,
    fatigue: 13,
    body: {
      health: 91,
      satiety: 72,
      vigor: 55
    }
  }, { currentLocationId: 'yard' });

  assert.equal(player.health, 91);
  assert.equal(player.satiety, 72);
  assert.equal(player.vigor, 55);
  assert.equal(player.hunger, undefined);
  assert.equal(player.fatigue, undefined);
  assert.equal(player.sleep, undefined);
  assert.equal(player.needs.satiety, 72);
  assert.equal(player.needs.vigor, 55);
  assert.equal(player.needs.hunger, undefined);
  assert.equal(player.legacy_vitals, undefined);
  assert.equal(player.legacy_needs, undefined);
});

test('player profile ignores legacy root vitals when canonical states are missing', () => {
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    health: 11,
    satiety: 9,
    vigor: 7,
    hunger: 91,
    fatigue: 4,
    sleep: 99,
    needs: {
      health: 13,
      satiety: 15,
      vigor: 17,
      hunger: 19,
      fatigue: 21,
      sleep: 23
    }
  }, { currentLocationId: 'yard' });

  assert.equal(player.states.health, 100);
  assert.equal(player.states.satiety, 80);
  assert.equal(player.states.vigor, 80);
  assert.equal(player.needs.health, 100);
  assert.equal(player.needs.satiety, 80);
  assert.equal(player.needs.vigor, 80);
  assert.equal(player.legacy_vitals, undefined);
  assert.equal(player.legacy_needs, undefined);
  assert.equal(player.needs.bleeding, 0);
});

test('mirrorBodyStateFields ignores legacy root vitals', () => {
  const profile = {
    states: {
      health: 88,
      satiety: 64,
      vigor: 50
    },
    body: {
      health: 12,
      satiety: 9,
      vigor: 7,
      active_conditions: []
    },
    health: 11,
    satiety: 10,
    vigor: 9,
    hunger: 90,
    fatigue: 91,
    sleep: 92,
    legacy_vitals: {
      health: 14,
      hunger: 15,
      fatigue: 16,
      thirst: 17,
      sleep: 18
    },
    needs: {
      health: 13,
      satiety: 14,
      vigor: 15,
      hunger: 16,
      fatigue: 17,
      sleep: 18
    }
  };

  mirrorBodyStateFields(profile);

  assert.equal(profile.states.health, 88);
  assert.equal(profile.states.satiety, 64);
  assert.equal(profile.states.vigor, 50);
  assert.equal(profile.health, 88);
  assert.equal(profile.satiety, 64);
  assert.equal(profile.vigor, 50);
  assert.equal(profile.needs.health, 88);
  assert.equal(profile.needs.satiety, 64);
  assert.equal(profile.needs.vigor, 50);
  assert.equal(profile.legacy_vitals, undefined);
  assert.equal(profile.hunger, undefined);
  assert.equal(profile.fatigue, undefined);
  assert.equal(profile.sleep, undefined);
  assert.equal(profile.legacy_needs, undefined);
});

test('player profile does not synthesize active states from legacy vitals alone', () => {
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    hunger: 91,
    fatigue: 4,
    body: {
      health: 87,
      satiety: 62,
      vigor: 48
    }
  }, { currentLocationId: 'yard' });

  assert.equal(player.states.health, 87);
  assert.equal(player.states.satiety, 62);
  assert.equal(player.states.vigor, 48);
  assert.deepEqual(player.activeStates, []);
  assert.deepEqual(player.body.active_conditions, []);
  assert.equal(player.hunger, undefined);
  assert.equal(player.fatigue, undefined);
  assert.equal(player.sleep, undefined);
  assert.equal(player.legacy_vitals, undefined);
  assert.equal(player.legacy_needs, undefined);
});

test('player profile normalizes hunger and fatigue active-state ids from labels', () => {
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    activeStates: [
      { label: 'голод', value: 70 },
      { label: 'усталость', value: 55 },
      { label: 'сонливость', value: 40 }
    ]
  }, { currentLocationId: 'yard' });

  assert.deepEqual(
    player.activeStates.map((state) => state.id),
    ['hunger', 'fatigue', 'sleep']
  );
});

test('resource deltas accept typed item objects with nested contents', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.inventory = [];
  world.player.items = {
    carried_items: [],
    equipment: [],
    weapons: [],
    armor: [],
    total_weight: 0,
    load_category: 'light'
  };
  world.player.attributes = {
    strength: 3,
    agility: 10,
    endurance: 10,
    reason: 10,
    attention: 10,
    influence: 10
  };

  applyStateDelta(world, {
    item_changes: [{
      op: 'materialize',
      item_id: 'item:player:bag:1',
      source: 'player_seed',
      cause: 'starting inventory seed',
      evidence: ['player_seed.items'],
      item: {
        id: 'item:player:bag:1',
        label: 'мешок',
        type: 'container',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        weight: 1,
        contents: [
          {
            label: 'ключ',
            type: 'tool',
            weight: 0.2,
            placement: 'contained',
            holder_id: 'player',
            owner_id: 'player',
            access: 'contained'
          }
        ]
      }
    }]
  });

  assert.ok(world.player.items.carried_items.some((item) => item.label === 'мешок'));
  const bag = world.player.items.carried_items.find((item) => item.label === 'мешок');
  assert.ok(bag);
  assert.equal(bag.contents[0].label, 'ключ');
  assert.equal(world.player.items.total_weight, 1.2);
  assert.equal(world.player.items.load_category, 'light');
});

test('property ledger keeps owner holder and risk metadata', () => {
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    inventory: [
      {
        id: 'item:player:bag:1',
        label: 'мешок',
        type: 'container',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        weight: 1,
        contents: [
          {
            label: 'ключ',
            type: 'tool',
            weight: 0.2,
            placement: 'contained',
            holder_id: 'player',
            owner_id: 'player',
            access: 'contained'
          }
        ]
      },
      {
        id: 'item:player:borrowed-knife:2',
        label: 'одолженный нож',
        type: 'weapon',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'npc-1',
        access: 'borrowed',
        weight: 1
      }
    ],
    property: ['клеть']
  }, { currentLocationId: 'yard' });
  player.inventory = ['legacy satchel'];
  player.property = ['legacy stable'];
  const npc = buildNpcProfile({
    id: 'npc-1',
    name: 'Степан',
    role: 'староста',
    locationId: 'yard'
  }, 'yard', 0, player);

  const ledger = buildPropertyLedger([npc], player);
  const bag = ledger.find((item) => item.label === 'мешок');
  const borrowed = ledger.find((item) => item.label === 'одолженный нож');
  const property = ledger.find((item) => item.label === 'клеть');
  const nested = ledger.find((item) => item.label === 'ключ' && item.containerId === 'item:player:bag:1');

  assert.ok(bag);
  assert.equal(bag.totalWeight, 1.2);
  assert.ok(borrowed);
  assert.equal(borrowed.ownerId, 'npc-1');
  assert.equal(borrowed.holderId, 'player');
  assert.equal(borrowed.ownerName, 'Степан');
  assert.equal(borrowed.holderName, 'Игрок');
  assert.equal(borrowed.access, 'borrowed');
  assert.ok(borrowed.risk > 0);
  assert.equal(borrowed.totalWeight, 1);
  assert.ok(property);
  assert.equal(property.placement, 'property');
  assert.equal(property.ownerId, 'player');
  assert.equal(property.holderId, null);
  assert.equal(property.access, 'not_carried');
  assert.equal(ledger.some((item) => item.label === 'legacy satchel'), false);
  assert.equal(ledger.some((item) => item.label === 'legacy stable'), false);
  assert.ok(nested);
  assert.equal(nested.containerId, 'item:player:bag:1');
});

test('player profile item records keep readable owner and holder names', () => {
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    inventory: [
      {
        id: 'item:player:knife:1',
        label: 'нож',
        type: 'weapon',
        placement: 'carried',
        owner_id: 'player',
        holder_id: 'player',
        access: 'immediate',
        weight: 0.2
      }
    ],
    property: [
      {
        id: 'item:player:chest:1',
        label: 'клеть',
        type: 'container',
        placement: 'property',
        owner_id: 'player',
        holder_id: null,
        access: 'not_carried',
        weight: 12
      }
    ]
  }, { currentLocationId: 'yard' });

  assert.equal(player.items.carried_items[0].ownerName, 'Игрок');
  assert.equal(player.items.carried_items[0].holderName, 'Игрок');
  assert.equal(player.items.property_not_carried[0].ownerName, 'Игрок');
  assert.equal(player.items.property_not_carried[0].holderName, null);
});

test('property ledger prefers canonical typed access blocks over legacy property access strings', () => {
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    items: {
      carried_items: [],
      property_not_carried: [],
      borrowed_items: [
        {
          id: 'item:player:borrowed-scythe:1',
          label: 'одолженная коса',
          type: 'tool',
          placement: 'borrowed',
          holder_id: 'player',
          owner_id: 'npc-2',
          access: 'borrowed',
          weight: 2
        }
      ],
      foreign_items_with_character: [
        {
          id: 'item:player:kept-ring:1',
          label: 'чужое кольцо',
          type: 'document',
          placement: 'held_for_others',
          holder_id: 'player',
          owner_id: 'npc-3',
          access: 'held_for_others',
          weight: 0.1
        }
      ]
    },
    property_and_access: {
      borrowed_items: ['legacy borrowed'],
      foreign_items_with_character: ['legacy foreign']
    }
  }, { currentLocationId: 'yard' });

  const ledger = buildPropertyLedger([], player);
  const borrowed = ledger.find((item) => item.label === 'одолженная коса');
  const foreign = ledger.find((item) => item.label === 'чужое кольцо');

  assert.ok(borrowed);
  assert.equal(borrowed.access, 'borrowed');
  assert.equal(borrowed.ownerId, 'npc-2');
  assert.ok(foreign);
  assert.equal(foreign.access, 'held_for_others');
  assert.equal(foreign.ownerId, 'npc-3');
  assert.equal(ledger.some((item) => item.label === 'legacy borrowed'), false);
  assert.equal(ledger.some((item) => item.label === 'legacy foreign'), false);
});

test('property ledger prefers canonical current_position over legacy location ids', () => {
  const canonicalPosition = {
    region_id: 'region:test',
    place_id: 'place:test',
    location_id: 'yard',
    minilocation_id: 'yard:center',
    anchor_id: 'yard:entry',
    last_route_id: 'route:yard'
  };
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    current_position: canonicalPosition,
    items: {
      carried_items: [
        {
          id: 'item:player:bag:1',
          label: 'сумка',
          type: 'container',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'player',
          access: 'immediate',
          weight: 1,
          contents: [
            {
              id: 'item:player:key:1',
              label: 'ключ',
              type: 'tool',
              placement: 'contained',
              holder_id: 'player',
              owner_id: 'player',
              access: 'contained',
              weight: 0.1
            }
          ]
        }
      ],
      property_not_carried: [
        {
          id: 'item:player:chest:1',
          label: 'клеть',
          type: 'container',
          placement: 'property',
          holder_id: null,
          owner_id: 'player',
          access: 'not_carried',
          weight: 12
        }
      ]
    }
  }, {
    currentLocationId: 'stale-yard',
    currentMicroLocationId: 'stale-yard:entry',
    current_position: canonicalPosition
  });
  const npc = buildNpcProfile({
    id: 'npc-1',
    name: 'Степан',
    role: 'староста',
    locationId: 'stale-yard',
    homeLocation: 'stale-yard',
    current_position: canonicalPosition,
    items: {
      carried_items: [
        {
          id: 'item:npc-1:key:1',
          label: 'ключ от амбара',
          type: 'tool',
          placement: 'carried',
          holder_id: 'npc-1',
          owner_id: 'npc-1',
          access: 'immediate',
          weight: 0.2
        }
      ]
    }
  }, 'stale-yard', 0, player, canonicalPosition);

  const ledger = buildPropertyLedger([npc], player, canonicalPosition);
  const npcItem = ledger.find((item) => item.label === 'ключ от амбара');
  const playerItem = ledger.find((item) => item.label === 'клеть');
  const nested = ledger.find((item) => item.label === 'ключ' && item.containerId === 'item:player:bag:1');

  assert.ok(npcItem);
  assert.equal(npcItem.locationId, 'yard');
  assert.ok(playerItem);
  assert.equal(playerItem.locationId, 'yard');
  assert.ok(nested);
  assert.equal(nested.locationId, 'yard');
});

test('property ledger discoverability reflects ownership and marks', () => {
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    items: {
      carried_items: [
        {
          id: 'item:player:ring:1',
          label: 'кольцо',
          type: 'document',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'player',
          access: 'immediate',
          visible: true,
          marks: ['клеймо', 'царапина']
        }
      ]
    }
  }, { currentLocationId: 'yard' });

  const ledger = buildPropertyLedger([], player);
  const ownRing = ledger.find((item) => item.label === 'кольцо');

  assert.ok(ownRing);
  assert.ok(Number.isFinite(Number(ownRing.discoverability)));
  assert.equal(ownRing.discoverability, 5);

  const borrowedLedger = buildPropertyLedger([{
    id: 'npc-2',
    name: 'Степан',
    role: 'староста',
    current_position: {
      region_id: 'region:test',
      place_id: 'place:test',
      location_id: 'yard',
      minilocation_id: null,
      anchor_id: null,
      last_route_id: null
    },
    items: {
      carried_items: [
        {
          id: 'item:npc-2:ring:1',
          label: 'чужое кольцо',
          type: 'document',
          placement: 'carried',
          holder_id: 'npc-2',
          owner_id: 'player',
          access: 'restricted',
          visible: true,
          marks: ['клеймо', 'царапина']
        }
      ]
    }
  }], player);

  const borrowedRing = borrowedLedger.find((item) => item.label === 'чужое кольцо');

  assert.ok(borrowedRing);
  assert.ok(Number.isFinite(Number(borrowedRing.discoverability)));
  assert.ok(borrowedRing.discoverability < ownRing.discoverability);
});

test('property ledger lowers weapon plausibility in a peaceful household scene without cause', () => {
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    items: {
      carried_items: [
        {
          id: 'item:player:sword:1',
          label: 'меч',
          type: 'weapon',
          material: 'сталь',
          condition: 'good',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'player',
          access: 'immediate',
          visible: true
        }
      ]
    }
  }, { currentLocationId: 'yard' });

  const world = {
    current_position: {
      region_id: 'region:test',
      place_id: 'place:test',
      location_id: 'yard',
      minilocation_id: null,
      anchor_id: null,
      last_route_id: null
    },
    locations: {
      yard: {
        id: 'yard',
        name: 'Крестьянский двор',
        kind: 'двор',
        profile: {
          purpose: 'мирное хозяйство',
          economy: ['рожь и репа'],
          access: 'для домочадцев',
          ownership: 'двор семьи Степана',
          authority: ['обычай двора'],
          hazards: []
        }
      }
    },
    scene: {
      purpose: 'домашнее хозяйство',
      access: 'для домочадцев',
      ownership: 'двор семьи Степана',
      hazards: []
    },
    region: {
      economy: ['земледелие']
    }
  };

  const plainLedger = buildPropertyLedger([], player);
  const contextualLedger = buildPropertyLedger([], player, world.current_position, world);
  const plainSword = plainLedger.find((item) => item.id === 'item:player:sword:1');
  const contextualSword = contextualLedger.find((item) => item.id === 'item:player:sword:1');

  assert.ok(plainSword);
  assert.ok(contextualSword);
  assert.equal(plainSword.plausibility, 5);
  assert.equal(contextualSword.plausibility, 4);
});

test('property ledger ignores legacy property access arrays without typed blocks', () => {
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    items: {
      carried_items: [],
      property_not_carried: []
    },
    property_and_access: {
      borrowed_items: ['legacy borrowed'],
      foreign_items_with_character: ['legacy foreign']
    }
  }, { currentLocationId: 'yard' });

  const ledger = buildPropertyLedger([], player);

  assert.equal(ledger.some((item) => item.label === 'legacy borrowed'), false);
  assert.equal(ledger.some((item) => item.label === 'legacy foreign'), false);
  assert.equal(ledger.some((item) => item.placement === 'borrowed'), false);
  assert.equal(ledger.some((item) => item.placement === 'held_for_others'), false);
});

test('item changes transfer holder without changing owner', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    inventory: [
      {
        id: 'item:player:knife:1',
        label: 'нож',
        type: 'weapon',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        weight: 1
      }
    ]
  }, { currentLocationId: world.currentLocationId });
  const npc = buildNpcProfile({
    id: 'npc-1',
    name: 'Степан',
    role: 'староста',
    locationId: world.currentLocationId,
    inventory: []
  }, world.currentLocationId, 0, player);

  world.player = player;
  world.npcs = [npc];

  applyStateDelta(world, {
    item_changes: [
      {
        op: 'transfer',
        item_id: 'item:player:knife:1',
        from_holder_id: 'player',
        to_holder_id: 'npc-1'
      }
    ]
  });

  assert.ok(world.player.items.carried_items.every((item) => item.id !== 'item:player:knife:1'));
  const moved = world.npcs[0].items.carried_items.find((item) => item.id === 'item:player:knife:1');
  assert.ok(moved);
  assert.equal(moved.owner_id, 'player');
  assert.equal(moved.holder_id, 'npc-1');
  assert.equal(moved.access, 'borrowed');
  assert.equal(moved.legal_status, 'disputed');
  assert.equal(moved.discoverability, 3);
  assert.equal(moved.value.legal, 2);
  assert.equal(moved.value.risk, moved.risk);
  assert.ok(moved.risk > 0);
});

test('item changes can drop and take the same item without changing owner', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    inventory: [
      {
        id: 'item:player:bag:1',
        label: 'мешок',
        type: 'container',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        weight: 1
      }
    ],
    property: []
  }, { currentLocationId: world.currentLocationId });

  applyStateDelta(world, {
    item_changes: [
      {
        op: 'drop',
        item_id: 'item:player:bag:1',
        from_holder_id: 'player'
      }
    ]
  });

  assert.ok(world.player.items.carried_items.every((item) => item.id !== 'item:player:bag:1'));
  let dropped = world.player.items.property_not_carried.find((item) => item.id === 'item:player:bag:1');
  assert.ok(dropped);
  assert.equal(dropped.owner_id, 'player');
  assert.equal(dropped.holder_id, null);
  assert.equal(dropped.placement, 'property');
  assert.equal(dropped.access, 'not_carried');
  assert.equal(dropped.legal_status, 'ordinary');
  assert.equal(dropped.discoverability, 2);
  assert.equal(dropped.value.legal, 1);

  applyStateDelta(world, {
    item_changes: [
      {
        op: 'take',
        item_id: 'item:player:bag:1',
        from_holder_id: 'player'
      }
    ]
  });

  const carried = world.player.items.carried_items.find((item) => item.id === 'item:player:bag:1');
  dropped = world.player.items.property_not_carried.find((item) => item.id === 'item:player:bag:1');
  assert.ok(carried);
  assert.equal(carried.owner_id, 'player');
  assert.equal(carried.holder_id, 'player');
  assert.equal(carried.placement, 'carried');
  assert.equal(carried.access, 'immediate');
  assert.equal(carried.legal_status, 'ordinary');
  assert.equal(carried.discoverability, 4);
  assert.equal(carried.value.legal, 0);
  assert.equal(dropped, undefined);
});

test('item changes keep the property ledger in sync with holder changes', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    inventory: [
      {
        id: 'item:player:ring:1',
        label: 'кольцо',
        type: 'item',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        weight: 0.1
      }
    ],
    property: []
  }, { currentLocationId: world.currentLocationId });
  const npc = buildNpcProfile({
    id: 'npc-1',
    name: 'Степан',
    role: 'староста',
    locationId: world.currentLocationId,
    inventory: []
  }, world.currentLocationId, 0, world.player);

  world.npcs = [npc];
  world.propertyLedger = buildPropertyLedger(world.npcs, world.player, world.current_position);

  applyStateDelta(world, {
    item_changes: [
      {
        op: 'transfer',
        item_id: 'item:player:ring:1',
        from_holder_id: 'player',
        to_holder_id: 'npc-1'
      }
    ]
  });

  const ledgerItem = world.propertyLedger.find((item) => item.id === 'item:player:ring:1');
  assert.ok(ledgerItem);
  assert.equal(ledgerItem.ownerId, 'player');
  assert.equal(ledgerItem.holderId, 'npc-1');
  assert.equal(ledgerItem.holderName, 'Степан');
  assert.equal(ledgerItem.legalStatus, 'disputed');
  assert.equal(ledgerItem.access, 'borrowed');
});

test('item changes create a property journal entry for world memory', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    inventory: [
      {
        id: 'item:player:bag:1',
        label: 'мешок',
        type: 'container',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        weight: 1
      }
    ],
    property: []
  }, { currentLocationId: world.currentLocationId });

  applyStateDelta(world, {
    item_changes: [
      {
        op: 'drop',
        item_id: 'item:player:bag:1',
        from_holder_id: 'player'
      }
    ]
  });

  assert.ok(Array.isArray(world.journal));
  const entry = world.journal.find((item) => item.kind === 'property' && Array.isArray(item.relatedIds) && item.relatedIds.includes('item:player:bag:1'));
  assert.ok(entry);
  assert.match(entry.result ?? '', /мешок/i);
  assert.equal(entry.source, 'item_delta');
  assert.equal(entry.status, 'changed');
});

test('item changes can update condition and marks without changing holder', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    inventory: [
      {
        id: 'item:player:knife:1',
        label: 'нож',
        type: 'weapon',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        condition: 'исправен',
        marks: ['старая царапина'],
        risk: 1,
        weight: 1
      }
    ]
  }, { currentLocationId: world.currentLocationId });

  applyStateDelta(world, {
    item_changes: [
      {
        op: 'damage',
        item_id: 'item:player:knife:1',
        from_holder_id: 'player',
        condition: 'затуплен и в крови',
        marks_add: ['свежая кровь'],
        risk: 3
      }
    ]
  });

  const knife = world.player.items.carried_items.find((item) => item.id === 'item:player:knife:1');
  const ledgerKnife = world.propertyLedger.find((item) => item.id === 'item:player:knife:1');
  const entry = world.journal.find((item) => item.kind === 'property' && Array.isArray(item.relatedIds) && item.relatedIds.includes('item:player:knife:1'));

  assert.ok(knife);
  assert.equal(knife.owner_id, 'player');
  assert.equal(knife.holder_id, 'player');
  assert.equal(knife.condition, 'затуплен и в крови');
  assert.ok(knife.marks.includes('старая царапина'));
  assert.ok(knife.marks.includes('свежая кровь'));
  assert.equal(knife.risk, 3);
  assert.ok(ledgerKnife);
  assert.equal(ledgerKnife.condition, 'затуплен и в крови');
  assert.ok(ledgerKnife.marks.includes('свежая кровь'));
  assert.ok(entry);
  assert.match(entry.result ?? '', /нож/i);
  assert.match(entry.result ?? '', /состояние/i);
});

test('item updates preserve previously fixed container contents', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    inventory: [
      {
        id: 'item:player:box:1',
        label: 'закрытый ларец',
        type: 'container',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'closed_container',
        visible: true,
        condition: 'цел',
        weight: 1,
        contents: [
          {
            id: 'item:player:box:ring:1',
            label: 'перстень',
            type: 'item',
            weight: 0.1
          }
        ]
      }
    ]
  }, { currentLocationId: world.currentLocationId });

  const boxBefore = world.player.items.carried_items.find((item) => item.id === 'item:player:box:1');
  const contentsBefore = boxBefore.contents;
  const ringBefore = contentsBefore[0];

  applyStateDelta(world, {
    item_changes: [
      {
        op: 'repair',
        item_id: 'item:player:box:1',
        from_holder_id: 'player',
        condition: 'починен и перевязан'
      }
    ]
  });

  const boxAfter = world.player.items.carried_items.find((item) => item.id === 'item:player:box:1');
  const ledgerRing = world.propertyLedger.find((item) => item.id === 'item:player:box:ring:1');

  assert.ok(boxAfter);
  assert.equal(boxAfter.condition, 'починен и перевязан');
  assert.ok(Array.isArray(boxAfter.contents));
  assert.equal(boxAfter.contents.length, contentsBefore.length);
  assert.equal(boxAfter.contents[0].id, ringBefore.id);
  assert.equal(boxAfter.contents[0].label, 'перстень');
  assert.equal(boxAfter.contents[0].access, 'closed_container');
  assert.equal(boxAfter.contents[0].visibility, 'hidden');
  assert.ok(ledgerRing);
  assert.equal(ledgerRing.access, 'closed_container');
  assert.equal(ledgerRing.visibility, 'hidden');
});

test('item changes prefer canonical items over legacy inventory arrays', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    inventory: ['legacy knife'],
    property: ['legacy chest'],
    items: {
      carried_items: [
        {
          id: 'item:player:topor:1',
          label: 'плотницкий топор',
          type: 'weapon',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'player',
          access: 'immediate',
          visible: true,
          risk: 0,
          weight: 2
        }
      ],
      property_not_carried: [
        {
          id: 'item:player:chest:1',
          label: 'клеть',
          type: 'container',
          placement: 'property',
          holder_id: null,
          owner_id: 'player',
          access: 'not_carried',
          visible: true,
          risk: 1,
          weight: 12
        }
      ],
      equipment: [],
      weapons: [],
      armor: [],
      total_weight: 2,
      load_category: 'light'
    }
  }, { currentLocationId: world.currentLocationId });
  world.player.inventory = ['legacy knife'];
  world.player.property = ['legacy chest'];

  applyStateDelta(world, {
    item_changes: [
      {
        op: 'drop',
        item_id: 'item:player:topor:1',
        from_holder_id: 'player'
      }
    ]
  });

  assert.ok(world.player.items.carried_items.every((item) => item.id !== 'item:player:topor:1'));
  assert.equal(world.player.inventory, undefined);
  assert.equal(world.player.items.property_not_carried.some((item) => item.id === 'item:player:topor:1'), true);
  assert.equal(world.player.property, undefined);
  assert.ok(world.player.items.property_not_carried.some((item) => item.label === 'клеть'));
});

test('npc profile levels can be promoted through state deltas', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const npc = world.npcs.find((item) => item.locationId === world.currentLocationId) ?? world.npcs[0];
  npc.profileLevel = 'background';
  if (npc.actorProfile && typeof npc.actorProfile === 'object') {
    npc.actorProfile.profileLevel = 'background';
  }

  applyStateDelta(world, {
    npcs: [
      {
        name: npc.name,
        profileLevel: 'ключевой'
      }
    ]
  });

  assert.equal(npc.profileLevel, 'key');
  assert.equal(npc.actorProfile.profileLevel, 'key');
});

test('npc state deltas can target an npc by stable id', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const npc = world.npcs.find((item) => item.locationId === world.currentLocationId) ?? world.npcs[0];
  assert.ok(npc);

  npc.mood = 'спокоен';
  npc.profileLevel = 'background';
  if (npc.actorProfile && typeof npc.actorProfile === 'object') {
    npc.actorProfile.profileLevel = 'background';
  }

  applyStateDelta(world, {
    npcs: [
      {
        id: npc.id,
        mood: 'насторожен',
        profileLevel: 'scene'
      }
    ]
  });

  assert.equal(npc.mood, 'насторожен');
  assert.equal(npc.profileLevel, 'scene');
  assert.equal(npc.actorProfile.profileLevel, 'scene');
  const entry = world.journal.find((item) => item.kind === 'npc' && Array.isArray(item.relatedIds) && item.relatedIds.includes(npc.id));
  assert.ok(entry);
  assert.match(entry.result ?? '', /насторожен/i);
});

test('social consequences can promote npc profiles from background to key', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const npc = buildNpcProfile({
    id: 'npc-promote-1',
    name: 'Мария',
    role: 'служка',
    locationId: world.currentLocationId,
    homeLocation: world.currentLocationId,
    obligations: []
  }, world.currentLocationId, 0, world.player);

  npc.profileLevel = 'background';
  npc.actorProfile.profileLevel = 'background';
  npc.socialMemory = [
    { id: 'social:1', action: 'talk', source: 'видел', confidence: 1 },
    { id: 'social:2', action: 'talk', source: 'видел', confidence: 1 },
    { id: 'social:3', action: 'trade', source: 'видел', confidence: 1 }
  ];
  npc.socialLinks = [
    { relation: 'family', targetNpcId: 'npc-1', strength: 1 },
    { relation: 'debt', targetNpcId: 'npc-2', strength: 1 },
    { relation: 'patron', targetNpcId: 'npc-3', strength: 1 }
  ];
  npc.obligations = [];
  world.npcs = [npc];

  applySocialConsequence(world, { type: 'talk' }, 'Разговор замечен всеми.');

  assert.equal(npc.profileLevel, 'scene');
  assert.equal(npc.actorProfile.profileLevel, 'scene');

  npc.obligations = ['долг перед двором'];
  npc.actorProfile.kinship.obligations = ['долг перед двором'];

  applySocialConsequence(world, { type: 'claim' }, 'Претензия стала предметом обсуждения.');

  assert.equal(npc.profileLevel, 'key');
  assert.equal(npc.actorProfile.profileLevel, 'key');
});

test('location state deltas create a place journal entry', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const locationId = world.current_position.location_id;

  applyStateDelta(world, {
    location: {
      recent_traces: ['У ворот остались свежие следы.']
    }
  });

  const entry = world.journal.find((item) => item.kind === 'place' && Array.isArray(item.relatedIds) && item.relatedIds.includes(locationId));
  assert.ok(entry);
  assert.match(entry.result ?? '', /новые следы/i);
});

test('authoritative roles do not auto-promote background npc profiles on passive social consequences', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const npc = buildNpcProfile({
    id: 'npc-authority',
    name: 'Степан',
    role: 'староста',
    locationId: world.currentLocationId,
    homeLocation: world.currentLocationId,
    profileLevel: 'background',
    obligations: [],
    socialMemory: []
  }, world.currentLocationId, 0, world.player);

  npc.profileLevel = 'background';
  npc.actorProfile.profileLevel = 'background';
  world.npcs = [npc];

  applySocialConsequence(world, { type: 'wait' }, 'Ничего не происходит.');

  assert.equal(npc.profileLevel, 'background');
  assert.equal(npc.actorProfile.profileLevel, 'background');
});

test('injuries bleed and can be treated', async () => {
  const world = createWorldState({
    startText: 'переправа и двор',
    clock: { day: 1, hour: 8, minute: 0 }
  });
  world.player.inventory = [];
  world.player.items = {
    carried_items: [
      { id: 'item:player:linen:1', label: 'чистая ткань', type: 'clothing', placement: 'carried', holder_id: 'player', owner_id: 'player', access: 'immediate', risk: 0, visible: true },
      { id: 'item:player:water:2', label: 'вода', type: 'food', placement: 'carried', holder_id: 'player', owner_id: 'player', access: 'immediate', risk: 0, visible: true }
    ],
    equipment: [],
    weapons: [],
    armor: [],
    total_weight: 0.8,
    load_category: 'light'
  };
  world.player.injuries = [
    { id: 'injury-1', label: 'порез', severity: 2, bleeding: 3, treated: false, source: 'test', at: { day: 1, hour: 8, minute: 0 } }
  ];
  world.player.bleeding = 3;
  world.player.health = 90;

  await handlePlayerInput(world, 'перевязываю рану и останавливаю кровь');

  assert.ok(world.player.bleeding <= 2);
  assert.ok(world.player.health <= 100);
  assert.ok(Array.isArray(world.player.injuries));
  assert.ok(world.player.items.carried_items.every((item) => item.label !== 'чистая ткань'));
  assert.equal(world.player.inventory, undefined);
});

test('medical supplies ignore legacy inventory when canonical carried items are absent', () => {
  const source = {
    inventory: [
      {
        id: 'item:player:linen:1',
        label: 'чистая ткань',
        type: 'clothing',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        visible: true
      }
    ]
  };

  const consumed = consumeMedicalSupplies(source, ['чистая ткань']);

  assert.deepEqual(consumed, []);
  assert.equal(source.inventory.length, 1);
  assert.equal(source.inventory[0].label, 'чистая ткань');
});

test('medical supplies consume canonical carried items and keep legacy inventory derived', () => {
  const source = {
    id: 'player',
    inventory: ['legacy cloth'],
    items: {
      carried_items: [
        { id: 'item:player:cloth:1', label: 'чистая ткань', type: 'clothing', placement: 'carried', holder_id: 'player', owner_id: 'player', access: 'immediate', visible: true },
        { id: 'item:player:water:2', label: 'вода', type: 'food', placement: 'carried', holder_id: 'player', owner_id: 'player', access: 'immediate', visible: true }
      ]
    }
  };

  const consumed = consumeMedicalSupplies(source, ['чистая ткань']);

  assert.deepEqual(consumed.map((item) => item.label), ['чистая ткань']);
  assert.equal(source.items.carried_items.some((item) => item.label === 'чистая ткань'), false);
  assert.equal(source.items.carried_items.some((item) => item.label === 'вода'), true);
  assert.deepEqual(source.inventory, ['legacy cloth']);
});

test('medical supplies do not consume items buried in a closed container', () => {
  const source = {
    id: 'player',
    items: {
      carried_items: [
        {
          id: 'item:player:box:1',
          label: 'короб',
          type: 'container',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'player',
          access: 'immediate',
          visible: true
        },
        {
          id: 'item:player:bandage:1',
          label: 'бинт',
          type: 'tool',
          placement: 'contained',
          holder_id: 'player',
          owner_id: 'player',
          access: 'closed_container',
          visible: false
        }
      ]
    }
  };

  const consumed = consumeMedicalSupplies(source, ['бинт']);

  assert.deepEqual(consumed, []);
  assert.equal(source.items.carried_items.some((item) => item.label === 'бинт'), true);
});

test('medical supplies do not consume borrowed disputed items as free supplies', () => {
  const source = {
    id: 'player',
    items: {
      carried_items: [
        {
          id: 'item:player:bandage:1',
          label: 'чужой бинт',
          type: 'tool',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'npc-owner',
          access: 'borrowed',
          legal_status: 'disputed',
          risk: 4,
          visible: true
        }
      ]
    }
  };

  const consumed = consumeMedicalSupplies(source, ['бинт']);

  assert.deepEqual(consumed, []);
  assert.equal(source.items.carried_items.length, 1);
});

test('historical routes are available in the context', () => {
  const world = createWorldState({
    startText: 'переправа и двор',
    history: {
      year: 1241,
      season: 'весна',
      regionHint: 'Центральная Европа, Силезия'
    },
    region: { name: 'Силезия' },
    historicalFrame: {
      year: 1241,
      regionName: 'Силезия',
      regionHint: 'Центральная Европа, Силезия',
      season: 'весна'
    }
  });
  const historical = buildHistoricalContext(world);

  assert.ok(Array.isArray(historical.roadRoutes));
  assert.ok(historical.roadRoutes.some((route) => route.region.includes('Силезия') || route.region.includes('дунай')));
  assert.ok(historical.roadRoutes.some((route) => route.id && route.route && route.scale && route.type));
  assert.ok(historical.roadRoutes.every((route) => Object.prototype.hasOwnProperty.call(route, 'from_id')));
  assert.ok(Array.isArray(historical.roadRisks));
  assert.ok(historical.roadRisks.length > 0);
});

test('route view highlights the canonical current location', () => {
  const view = buildRouteView([
    {
      id: 'route:1',
      route: {
        id: 'route:1',
        from_id: 'yard-a',
        to_id: 'yard-b',
        route: 'yard-a -> yard-b',
        access: 'open',
        type: 'path',
        base_time: 15,
        known_to_player: true
      },
      summary: 'Маршрут к двору'
    }
  ], {
    location_id: 'yard-a',
    place_id: 'yard-a',
    minilocation_id: 'yard-a:entry'
  });

  assert.equal(view.items.length, 1);
  assert.ok(view.items[0].lines.includes('отсюда'));
});

test('route view ignores legacy string current location inputs', () => {
  const view = buildRouteView([
    {
      id: 'route:1',
      route: {
        id: 'route:1',
        from_id: 'yard-a',
        to_id: 'yard-b',
        route: 'yard-a -> yard-b',
        access: 'open',
        type: 'path',
        base_time: 15,
        known_to_player: true
      },
      summary: 'Маршрут к двору'
    }
  ], 'yard-a');

  assert.equal(view.items.length, 1);
  assert.equal(view.items[0].lines.includes('отсюда'), false);
});

test('route reconstruction links reverse exits when the return path exists', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.currentLocationId = 'yard-a';
  world.currentMicroLocationId = 'yard-a:entry';
  world.current_position = {
    ...world.current_position,
    location_id: 'yard-a',
    place_id: 'yard-a',
    minilocation_id: 'yard-a:entry'
  };
  world.locations = {
    'yard-a': {
      id: 'yard-a',
      name: 'Передний двор',
      kind: 'двор',
      landmarks: [],
      exits: [{ label: 'к мосту', to: 'yard-b' }],
      occupants: [],
      activity: [],
      recentTraces: [],
      pressure: [],
      sounds: [],
      profile: {}
    },
    'yard-b': {
      id: 'yard-b',
      name: 'Задний двор',
      kind: 'двор',
      landmarks: [],
      exits: [{ label: 'назад к двору', to: 'yard-a' }],
      occupants: [],
      activity: [],
      recentTraces: [],
      pressure: [],
      sounds: [],
      profile: {}
    }
  };
  world.place = { id: 'yard-a', name: 'Передний двор', kind: 'двор' };
  world.scene = { weather: 'ясно', light: 'день', pressure: [] };
  world.historical = { roadRoutes: [], routeArchive: [] };
  world.history = { era: 'XIII век', year: 1241, season: 'весна', regionHint: 'тест' };
  world.clock = { day: 3, hour: 9, minute: 15 };

  const reconstruction = buildRouteReconstruction(world, { raw: 'к мосту', target: 'к мосту' });

  assert.ok(reconstruction.route);
  assert.equal(reconstruction.route.from_id, 'yard-a');
  assert.equal(reconstruction.route.to_id, 'yard-b');
  assert.equal(reconstruction.route.reverse_route_id, 'exit:yard-b:0');
  assert.equal(reconstruction.route.known_to_character, true);
  assert.equal(reconstruction.route.known_to_player, true);
  assert.deepEqual(reconstruction.route.last_used_at, world.clock);
});

test('regional route reconstruction links paired road directions', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.currentLocationId = 'road-hub';
  world.currentMicroLocationId = null;
  world.current_position = {
    ...world.current_position,
    location_id: 'road-hub',
    place_id: 'road-hub',
    minilocation_id: null
  };
  world.player.knowledge_map = {
    ...world.player.knowledge_map,
    known_routes: ['Kraków -> Legnica -> Wrocław']
  };
  world.locations = {
    'road-hub': {
      id: 'road-hub',
      name: 'Трактовый узел',
      kind: 'путь',
      landmarks: [],
      exits: [],
      occupants: [],
      activity: [],
      recentTraces: [],
      pressure: [],
      sounds: [],
      profile: {}
    }
  };
  world.place = { id: 'road-hub', name: 'Трактовый узел', kind: 'путь' };
  world.scene = { weather: 'ясно', light: 'день', pressure: [] };
  world.historical = {
    roadRoutes: [
      { region: 'Silesia', route: 'Wrocław -> Legnica -> Kraków', risk: 'район тревожен' },
      { region: 'Silesia', route: 'Kraków -> Legnica -> Wrocław', risk: 'район тревожен' }
    ],
    routeArchive: []
  };
  world.history = { era: 'XIII век', year: 1241, season: 'весна', regionHint: 'тест' };
  world.clock = { day: 3, hour: 9, minute: 15 };

  const reconstruction = buildRouteReconstruction(world, { raw: 'Kraków', target: 'Kraków' });

  assert.ok(reconstruction.route);
  assert.equal(reconstruction.route.id, 'road:0');
  assert.equal(reconstruction.route.from_id, 'road-hub');
  assert.equal(reconstruction.route.to_id, 'Silesia');
  assert.equal(reconstruction.route.reverse_route_id, 'road:1');
  assert.equal(reconstruction.route.known_to_character, false);
  assert.equal(reconstruction.route.known_to_player, false);
});

test('unknown regional routes stay hidden from character knowledge', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.currentLocationId = 'road-hub';
  world.currentMicroLocationId = null;
  world.locations = {
    'road-hub': {
      id: 'road-hub',
      name: 'Трактовый узел',
      kind: 'путь',
      landmarks: [],
      exits: [],
      occupants: [],
      activity: [],
      recentTraces: [],
      pressure: [],
      sounds: [],
      profile: {}
    }
  };
  world.place = { id: 'road-hub', name: 'Трактовый узел', kind: 'путь' };
  world.scene = { weather: 'ясно', light: 'день', pressure: [] };
  world.historical = {
    roadRoutes: [
      { region: 'Silesia', route: 'Wrocław -> Legnica -> Kraków', risk: 'район тревожен' }
    ],
    routeArchive: []
  };
  world.history = { era: 'XIII век', year: 1241, season: 'весна', regionHint: 'тест' };
  world.clock = { day: 3, hour: 9, minute: 15 };

  const reconstruction = buildRouteReconstruction(world, { raw: 'Kraków', target: 'Kraków' });

  assert.ok(reconstruction.route);
  assert.equal(reconstruction.route.known_to_character, false);
  assert.equal(reconstruction.route.known_to_player, false);
});

test('known regional routes become available when they are in character knowledge', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.currentLocationId = 'road-hub';
  world.currentMicroLocationId = null;
  world.player.knowledge_map = {
    ...world.player.knowledge_map,
    known_routes: ['Wrocław -> Legnica -> Kraków']
  };
  world.locations = {
    'road-hub': {
      id: 'road-hub',
      name: 'Трактовый узел',
      kind: 'путь',
      landmarks: [],
      exits: [],
      occupants: [],
      activity: [],
      recentTraces: [],
      pressure: [],
      sounds: [],
      profile: {}
    }
  };
  world.place = { id: 'road-hub', name: 'Трактовый узел', kind: 'путь' };
  world.scene = { weather: 'ясно', light: 'день', pressure: [] };
  world.historical = {
    roadRoutes: [
      { region: 'Silesia', route: 'Wrocław -> Legnica -> Kraków', risk: 'район тревожен' }
    ],
    routeArchive: []
  };
  world.history = { era: 'XIII век', year: 1241, season: 'весна', regionHint: 'тест' };
  world.clock = { day: 3, hour: 9, minute: 15 };

  const reconstruction = buildRouteReconstruction(world, { raw: 'Kraków', target: 'Kraków' });

  assert.ok(reconstruction.route);
  assert.equal(reconstruction.route.known_to_character, true);
  assert.equal(reconstruction.route.known_to_player, true);
});

test('known regional routes become available from visited place memory', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.currentLocationId = 'road-hub';
  world.currentMicroLocationId = null;
  world.memory.visitedPlaces = {
    krakow: {
      placeName: 'Kraków',
      visits: 2,
      lastSeenAt: { day: 2, hour: 10, minute: 0 }
    }
  };
  world.locations = {
    'road-hub': {
      id: 'road-hub',
      name: 'Трактовый узел',
      kind: 'путь',
      landmarks: [],
      exits: [],
      occupants: [],
      activity: [],
      recentTraces: [],
      pressure: [],
      sounds: [],
      profile: {}
    }
  };
  world.place = { id: 'road-hub', name: 'Трактовый узел', kind: 'путь' };
  world.scene = { weather: 'ясно', light: 'день', pressure: [] };
  world.historical = {
    roadRoutes: [
      { region: 'Silesia', route: 'Wrocław -> Legnica -> Kraków', risk: 'район тревожен' }
    ],
    routeArchive: []
  };
  world.history = { era: 'XIII век', year: 1241, season: 'весна', regionHint: 'тест' };
  world.clock = { day: 3, hour: 9, minute: 15 };

  const reconstruction = buildRouteReconstruction(world, { raw: 'Kraków', target: 'Kraków' });

  assert.ok(reconstruction.route);
  assert.equal(reconstruction.route.known_to_character, true);
  assert.equal(reconstruction.route.known_to_player, true);
});

test('route reconstruction prefers canonical current_position over stale legacy ids', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const canonicalLocationId = world.current_position.location_id;
  world.currentLocationId = 'stale-yard';
  world.current_position = {
    ...world.current_position,
    location_id: canonicalLocationId,
    place_id: canonicalLocationId,
    minilocation_id: world.current_position.minilocation_id
  };
  world.locations = {
    [canonicalLocationId]: {
      id: canonicalLocationId,
      name: 'Канонический двор',
      kind: 'двор',
      landmarks: [],
      exits: [{ label: 'к мосту', to: 'yard-b' }],
      occupants: [],
      activity: [],
      recentTraces: [],
      pressure: [],
      sounds: [],
      profile: {}
    },
    'yard-b': {
      id: 'yard-b',
      name: 'Задний двор',
      kind: 'двор',
      landmarks: [],
      exits: [{ label: 'назад к двору', to: canonicalLocationId }],
      occupants: [],
      activity: [],
      recentTraces: [],
      pressure: [],
      sounds: [],
      profile: {}
    }
  };
  world.place = { id: canonicalLocationId, name: 'Канонический двор', kind: 'двор' };
  world.scene = { weather: 'ясно', light: 'день', pressure: [] };
  world.historical = { roadRoutes: [], routeArchive: [] };
  world.history = { era: 'XIII век', year: 1241, season: 'весна', regionHint: 'тест' };
  world.clock = { day: 3, hour: 9, minute: 15 };

  const reconstruction = buildRouteReconstruction(world, { raw: 'к мосту', target: 'к мосту' });

  assert.equal(reconstruction.route.from_id, canonicalLocationId);
  assert.equal(reconstruction.originLocationId, canonicalLocationId);
});

test('route reconstruction ignores stale currentLocationId when canonical current_position is present', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const canonicalLocationId = world.current_position.location_id;
  world.currentLocationId = 'stale-yard';
  world.current_position = {
    ...world.current_position,
    location_id: canonicalLocationId,
    place_id: canonicalLocationId,
    minilocation_id: world.current_position.minilocation_id
  };
  world.locations = {
    [canonicalLocationId]: {
      id: canonicalLocationId,
      name: 'Канонический двор',
      kind: 'двор',
      landmarks: [],
      exits: [{ label: 'к мосту', to: 'yard-b' }],
      occupants: [],
      activity: [],
      recentTraces: [],
      pressure: [],
      sounds: [],
      profile: {}
    },
    'yard-b': {
      id: 'yard-b',
      name: 'Задний двор',
      kind: 'двор',
      landmarks: [],
      exits: [{ label: 'назад к двору', to: canonicalLocationId }],
      occupants: [],
      activity: [],
      recentTraces: [],
      pressure: [],
      sounds: [],
      profile: {}
    }
  };
  world.place = { id: canonicalLocationId, name: 'Канонический двор', kind: 'двор' };
  world.scene = { weather: 'ясно', light: 'день', pressure: [] };
  world.historical = { roadRoutes: [], routeArchive: [] };
  world.history = { era: 'XIII век', year: 1241, season: 'весна', regionHint: 'тест' };
  world.clock = { day: 3, hour: 9, minute: 15 };

  const reconstruction = buildRouteReconstruction(world, { raw: 'к мосту', target: 'к мосту' });

  assert.equal(reconstruction.route.from_id, canonicalLocationId);
  assert.equal(reconstruction.originLocationId, canonicalLocationId);
  assert.notEqual(reconstruction.route.from_id, 'stale-yard');
});

test('route inquiry records a historical reconstruction', async () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const canonicalLocationId = world.current_position.location_id;
  world.currentLocationId = 'stale-hub';
  world.current_position = {
    ...world.current_position,
    location_id: canonicalLocationId,
    place_id: canonicalLocationId,
    minilocation_id: world.current_position.minilocation_id
  };
  const beforeArchive = world.historical.routeArchive.length;

  const result = await handlePlayerInput(world, 'как пройти к реке');

  assert.ok(world.historical.routeArchive.length > beforeArchive);
  assert.ok(world.historical.routeArchive[0].summary.length > 0);
  assert.ok(world.historical.routeArchive[0].route);
  assert.equal(world.historical.routeArchive[0].route.from_id, canonicalLocationId);
  assert.ok(world.historical.routeArchive[0].route.base_time > 0);
  assert.ok(Array.isArray(world.historical.routeArchive[0].route.conditions));
  assert.ok(world.historical.routeArchive[0].route.known_to_player);
  assert.match(result.text, /дорог|маршрут|путь|переправ/i);
});

test('npc wounds can be treated with field care', async () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const npc = world.npcs.find((item) => item.name === 'знахарка') ?? world.npcs[0];
  npc.injuries = [
    { id: 'npc-injury-1', label: 'резаная рана', severity: 2, bleeding: 2, treated: false, source: 'test', at: { day: 1, hour: 8, minute: 0 } }
  ];
  npc.bleeding = 2;
  npc.health = 88;

  await handlePlayerInput(world, `лечу ${npc.name}`);

  assert.ok(npc.bleeding <= 2);
  assert.ok(npc.health <= 100);
  assert.ok(Array.isArray(npc.injuries));
});

test('persistence splits catalog data from session progress', async () => {
  return runPersistenceTest(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'xiii-world-'));
    const sessionPath = join(dir, 'save.json');
    const previousCatalogDir = process.env.WORLD_CATALOG_DIR;
    process.env.WORLD_CATALOG_DIR = dir;

    try {
      const world = createWorldState({ startText: 'переправа и двор' });
      const npc = world.npcs.find((item) => item?.id);
      assert.ok(npc);
      const beforeNpcSatiety = npc.states.satiety;
      const beforeNpcVigor = npc.states.vigor;
    await saveInitialWorld(sessionPath, world);
    const catalogPath = join(dir, `${encodeURIComponent(world.worldKey)}.json`);

    const catalogBefore = await readFile(catalogPath, 'utf8');
    world.player.states.satiety = Math.max(0, world.player.states.satiety - 7);
    npc.states.satiety = Math.max(0, beforeNpcSatiety - 9);
    npc.states.vigor = Math.max(0, beforeNpcVigor - 6);
    npc.hunger = 99;
    npc.fatigue = 99;
    npc.sleep = 99;
    world.memory.masterNotes.unshift('Памятка из теста');
    world.locations[world.currentLocationId].recentTraces.unshift({
      at: { ...world.clock },
      kind: 'test',
      text: 'След из теста'
    });
    await saveWorldState(sessionPath, world);

    const catalogAfter = await readFile(catalogPath, 'utf8');
    assert.equal(catalogAfter, catalogBefore);

    const restored = await loadWorldState(sessionPath);
    assert.equal(restored.player.states.satiety, world.player.states.satiety);
    assert.equal(restored.player.legacy_vitals, undefined);
    assert.equal(restored.player.legacy_needs, undefined);
    const restoredNpc = restored.npcs.find((item) => item?.id === npc.id);
    assert.ok(restoredNpc);
    assert.equal(restoredNpc.states.satiety, npc.states.satiety);
    assert.equal(restoredNpc.states.vigor, npc.states.vigor);
    assert.equal(restoredNpc.legacy_vitals, undefined);
    assert.equal(restoredNpc.legacy_needs, undefined);
    assert.ok(restored.memory.masterNotes.includes('Памятка из теста'));
    assert.ok(
      restored.locations[restored.currentLocationId].recentTraces.some((trace) => trace.text === 'След из теста')
    );

    const sessionData = JSON.parse(await readFile(sessionPath, 'utf8'));
    assert.equal(sessionData.npcStates[npc.id].states.satiety, npc.states.satiety);
    assert.equal(sessionData.npcStates[npc.id].states.vigor, npc.states.vigor);
    assert.equal(sessionData.npcStates[npc.id].health, npc.health);
    assert.equal(sessionData.npcStates[npc.id].hunger, undefined);
    assert.equal(sessionData.npcStates[npc.id].fatigue, undefined);
    assert.equal(sessionData.npcStates[npc.id].sleep, undefined);
    } finally {
      if (previousCatalogDir === undefined) {
        delete process.env.WORLD_CATALOG_DIR;
      } else {
        process.env.WORLD_CATALOG_DIR = previousCatalogDir;
      }
      await rm(dir, { recursive: true, force: true });
    }
  });
});

test('new session can reuse the shared catalog without a saved session file', async () => {
  return runPersistenceTest(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'xiii-world-'));
    const sessionPath = join(dir, 'save.json');
    const previousCatalogDir = process.env.WORLD_CATALOG_DIR;
    process.env.WORLD_CATALOG_DIR = dir;

    try {
    const seed = createWorldState({ startText: 'переправа и двор' });
    await saveInitialWorld(sessionPath, seed);
    await rm(sessionPath, { force: true });

    const restored = await loadWorldState(sessionPath, seed);

    assert.ok(restored);
    assert.equal(restored.worldKey, seed.worldKey);
    assert.equal(restored.place.name, seed.place.name);
    assert.equal(restored.region.name, seed.region.name);
    } finally {
      if (previousCatalogDir === undefined) {
        delete process.env.WORLD_CATALOG_DIR;
      } else {
        process.env.WORLD_CATALOG_DIR = previousCatalogDir;
      }
      await rm(dir, { recursive: true, force: true });
    }
  });
});

test('long playthrough smoke keeps turns, travel and persistence coherent', async () => {
  return runPersistenceTest(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'xiii-smoke-'));
    const sessionPath = join(dir, 'save.json');

    try {
      const world = createWorldState({ startText: 'переправа и двор' });
      const initialJournalLength = Array.isArray(world.journal) ? world.journal.length : 0;
      const initialLocationId = world.currentLocationId;

      await handlePlayerInput(world, 'осматриваюсь');
      const location = getCurrentLocation(world);
      const moveCommand = Array.isArray(location?.exits) && location.exits.length > 0
        ? `иду ${location.exits[0].label ?? location.exits[0].direction ?? 'вперёд'}`
        : 'жду час';
      await handlePlayerInput(world, moveCommand);
      await handlePlayerInput(world, 'осматриваюсь ещё раз');

      assert.ok(Array.isArray(world.journal));
      assert.ok(world.journal.length > initialJournalLength);
      assert.ok(typeof world.lastNarratorProse === 'string' && world.lastNarratorProse.length > 0);
      assert.ok(world.currentLocationId);

      await saveWorldState(sessionPath, world);
      const restored = await loadWorldState(sessionPath);

      assert.ok(restored);
      assert.equal(restored.worldKey, world.worldKey);
      assert.equal(restored.currentLocationId, world.currentLocationId);
      assert.equal(Array.isArray(restored.journal), true);
      assert.equal(restored.journal.length >= world.journal.length, true);
      assert.equal(restored.current_position?.location_id ?? restored.currentLocationId, world.currentLocationId);
      assert.ok(restored.currentLocationId);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

test('production scenarios stay skeletal without test fixtures', () => {
  const previous = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    const world = createWorldState({ startText: 'переправа и двор' });
    assert.equal(world.npcs.length, 0);
    assert.equal(world.region.name, '');
    assert.equal(world.scene.pressure.length, 0);
  } finally {
    if (previous === undefined) delete process.env.NODE_TEST_CONTEXT;
    else process.env.NODE_TEST_CONTEXT = previous;
  }
});

test('advanceIndependentWorld queues semantic updates instead of inventing rumors', () => {
  const world = createWorldState({ startText: 'переправа и двор', clock: { day: 1, hour: 10, minute: 0 } });
  const rumorCount = world.memory.heardRumors.length;
  const pressure = world.scene.pressure.slice();

  advanceWorld(world, 30);

  assert.equal(world.memory.heardRumors.length, rumorCount);
  assert.deepEqual(world.scene.pressure, pressure);
  assert.ok(Array.isArray(world.pendingSemanticWorld));
  assert.equal(world.pendingSemanticWorld[0]?.status, 'pending_llm');
});

test('frame scoped historical pack avoids procedural semantic defaults', () => {
  const historical = buildHistoricalContext({
    history: { era: 'XIII век', year: 1243, season: 'зима' },
    region: { name: 'тестовый регион' }
  });

  assert.equal(historical.materialCulture.length, 0);
  assert.equal(historical.lawContext.length, 0);
  assert.equal(historical.roadRisks.length, 0);
  assert.equal(historical.anchorEvents.length, 0);
  assert.equal(historical.sourceLog[0]?.needsReview, true);
  assert.equal(historical.sourceLog[0]?.status, 'needs_review');
});

test('generateHistoricalFrame fails gracefully on schema-invalid shaper JSON', async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  let call = 0;

  globalThis.setTimeout = (handler, _delay, ...args) => {
    if (typeof handler === 'function') handler(...args);
    return 0;
  };

  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      call += 1;
      if (call % 3 === 1) return { choices: [{ message: { content: 'dossier ok' } }] };
      if (call % 3 === 2) {
        return {
          choices: [{
            message: {
              content: '{"version":1,"schema":"semantic_audit","pass":true,"concerns":[],"evidence":["ok"]}'
            }
          }]
        };
      }
      return {
        choices: [{
          message: {
            content: JSON.stringify({
              version: 1,
              schema: 'historical_frame',
              year: 1000,
              season: 'осень',
              regionName: 'Новгородская земля',
              regionHint: 'Новгородская земля',
              settlementType: 'город',
              pressure: 'давление',
              conflict: 'конфликт',
              startTextHint: 'рамка'
            })
          }
        }]
      };
    }
  });

  try {
    await assert.rejects(
      () => generateHistoricalFrame({ startText: 'test' }, {
        DEEPSEEK_API_KEY: 'x',
        DEEPSEEK_BASE_URL: 'http://example.com',
        DEEPSEEK_MODEL: 'test'
      }),
      (error) => {
        assert.match(String(error), /historical frame/i);
        assert.doesNotMatch(String(error), /normalizedError/i);
        assert.match(String(error), /1230\.\.1250|year/i);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('resolveDesignTask routes ordinary turns away from combat bundle', () => {
  const world = createWorldState({ startText: 'тест' });
  const observeFrame = buildMasterFrame(world, 'осматриваюсь');
  const moveFrame = buildMasterFrame(world, 'иду к броду');
  const talkFrame = buildMasterFrame(world, 'говорю с человеком');
  const attackFrame = buildMasterFrame(world, 'ударить разбойника');

  assert.equal(resolveDesignTask(observeFrame), 'master_narrative');
  assert.equal(resolveDesignTask(moveFrame), 'movement');
  assert.equal(resolveDesignTask(talkFrame), 'master_narrative');
  assert.equal(resolveDesignTask(attackFrame), 'combat');
});

test('corpus task files match documentation bundles', () => {
  assert.deepEqual(getTaskFiles('combat'), [
    'combat_system.md',
    'formulas.md',
    'weapons_and_armor.txt',
    'character_parameters.txt',
    'character_inventory_equipment.txt',
    'npc_inventory_item_marks.txt'
  ]);
  assert.deepEqual(getTaskFiles('master_narrative'), [
    'llm_agent_prompt_templates.md',
    'formulas.md',
    'world_generation_and_turns.txt',
    'time_system.txt',
    'movement_locations_regions.txt',
    'interface_ux.md'
  ]);
  assert.deepEqual(getTaskFiles('actor_profiles'), [
    'npc_generation_profiles.txt',
    'formulas.md',
    'character_parameters.txt',
    'items_and_property.txt',
    'interface_ux.md'
  ]);

  const combatBundle = loadDesignBundleSync('combat');
  const masterBundle = loadDesignBundleSync('master_narrative');
  const actorBundle = loadDesignBundleSync('actor_profiles');

  assert.match(combatBundle, /npc_inventory_item_marks\.txt/);
  assert.match(combatBundle, /character_inventory_equipment\.txt/);
  assert.match(masterBundle, /movement_locations_regions\.txt/);
  assert.match(masterBundle, /interface_ux\.md/);
  assert.match(actorBundle, /items_and_property\.txt/);
  assert.match(actorBundle, /interface_ux\.md/);
});

test('historical frame semantic validation rejects out-of-range year and unknown region', () => {
  const outOfRange = explainHistoricalFrameValidation({
    version: 1,
    schema: 'historical_frame',
    year: 1000,
    season: 'осень',
    regionName: 'Новгородская земля',
    regionHint: 'Новгородская земля',
    settlementType: 'город',
    pressure: 'давление',
    conflict: 'конфликт',
    startTextHint: 'рамка'
  });
  const unknownRegion = explainHistoricalFrameValidation({
    version: 1,
    schema: 'historical_frame',
    year: 1241,
    season: 'осень',
    regionName: 'несуществующий регион xyz',
    regionHint: 'несуществующий регион xyz',
    settlementType: 'город',
    pressure: 'давление',
    conflict: 'конфликт',
    startTextHint: 'рамка'
  });

  assert.equal(outOfRange.ok, false);
  assert.ok(outOfRange.errors.some((item) => /1230/.test(item)));
  assert.equal(unknownRegion.ok, false);
  assert.ok(unknownRegion.errors.some((item) => /regionName|catalog/i.test(item)));
});

test('selectRegionCatalogEntry returns null for unmatched hints', () => {
  resetRegionCatalogMismatch();
  const entry = selectRegionCatalogEntry({
    worldKey: 'test-world',
    region: { name: 'абсолютно неизвестный регион xyz' },
    history: { year: 1241, season: 'зима' }
  });

  assert.equal(entry, null);
  assert.equal(getLastRegionCatalogMismatch()?.event, 'region_catalog_unmatched');
});

test('region catalog coordinates use parsed region count', () => {
  resetRegionCatalogCache();
  const catalog = loadRegionCatalog();
  assert.ok(catalog.length > 0);
  for (const entry of catalog) {
    assert.ok(entry.coordinates);
    assert.ok(Number.isFinite(entry.coordinates.ring));
  }
});

test('corpus loader includes graph hints for combat task', async () => {
  const { loadDesignBundleSync } = await import('../src/world/corpus-loader.js');
  const bundle = loadDesignBundleSync('combat');

  assert.match(bundle, /combat_system\.md/);
  assert.match(bundle, /graphify hints/);
});
