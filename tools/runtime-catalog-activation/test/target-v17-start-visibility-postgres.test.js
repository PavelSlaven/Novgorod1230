import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import test from 'node:test';

import {
  bootstrapV17PresenceE2e, createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
} from '../../../test/spatial-v3/presence-rules-production-e2e-fixture.js';
import {
  collectPlayerVisibility, visibilityViolations, sanitizeVisibility,
} from '../../../test/spatial-v3/target-start-player-visibility-acceptance.js';
import { readPinnedArtifact } from
  '../../../apps/game-server/src/internal/live-world-authored-starts.js';

const ROOT = resolve(import.meta.dirname, '../../..');
const MANIFEST = 'data/world-catalogs/novgorod/live-world-runtime-v17/target-starts-manifest.v1.json';
const CLOSURE = 'data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/dependency-closure/v1';
const json = async (path) => JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));
const OBSERVE = 'Осмотреться';

// D106 oracle is independent of the screen/public_metadata titles under test.
async function startToponyms(worldPool, start) {
  const binding = await json(`${CLOSURE}/subject-commit-binding.json`);
  assert.equal(binding.status, 'APPROVED_FOR_P12_DEPENDENCY_CLOSURE');
  const pinned = async (path) => {
    const pin = binding.required_subject_tree_paths.find((entry) => entry.path === path);
    assert.ok(pin, `Approved dependency-closure pin required: ${path}`);
    return JSON.parse(await readPinnedArtifact(ROOT, pin));
  };
  // A-start-visibility-test-02: the decision hash binds a historical subject.
  // Preserve the exact names-data pin; this test does not audit closure approval.
  const approval = await json(`${CLOSURE}/APPROVAL_DECISION.json`);
  assert.equal(approval.status, 'APPROVED_FOR_P12_DEPENDENCY_CLOSURE');
  const anchors = (await pinned(`${CLOSURE}/data/spatial-nodes.json`)).records;
  const ancestry = await worldPool.query(`SELECT child.id,child.version,child.spatial_level,
      parent.id AS parent_id,parent.version AS parent_version,parent.spatial_level AS parent_level
    FROM world_base.spatial_v3_nodes child
    JOIN world_base.spatial_v3_node_parents link
      ON link.child_id=child.id AND link.child_version=child.version
      AND link.world_revision_id=child.world_revision_id
    JOIN world_base.spatial_v3_nodes parent
      ON parent.id=link.parent_id AND parent.version=link.parent_version
      AND parent.world_revision_id=link.world_revision_id
    WHERE child.world_revision_id=$1 AND child.status='approved' AND parent.status='approved'
      AND child.spatial_level IN ('G4','G5')`, [start.world_pin.world_revision_id]);
  let ref = start.initial_placement.canonical_g5_ref;
  for (const level of ['G5', 'G4']) {
    const rows = ancestry.rows.filter((row) => row.id === ref.id && row.version === ref.version);
    assert.equal(rows.length, 1, 'One exact approved parent per start level');
    assert.equal(rows[0].spatial_level, level);
    ref = { id: rows[0].parent_id, version: rows[0].parent_version };
  }
  const anchor = anchors.find((row) => row.id === ref.id && row.version === ref.version);
  assert.equal(anchor?.scale, 'G3');
  assert.ok(anchor.source_refs.length > 0, 'Source-backed G3 title required');
  const roots = new Set();
  for (const match of anchor.title.matchAll(/[А-ЯЁ][а-яё]+/gu)) {
    const word = match[0];
    // Named locality before a colon, or capitalized locative adjective. Common
    // descriptors (лесная, ресурсная, камышовый) supply no proper-name root.
    const adjective = word.match(/^(.+?)ск(?:ий|ая|ое|ие|ой|ого|ому|им|ую|их|ими|ом)$/u);
    if (!adjective && anchor.title[match.index + word.length] !== ':') continue;
    const stem = (adjective?.[1] ?? word).replace(/(?:ье|ия|й|ь)$/u, '')
      .toLocaleLowerCase('ru');
    if (!stem.startsWith('новгород')) roots.add(stem);
  }
  return { anchor_title: anchor.title, roots: [...roots],
    source: `${CLOSURE}/data/spatial-nodes.json`,
    approval: `${CLOSURE}/APPROVAL_DECISION.json` };
}

async function knowledgeReadback(pool, partyId) {
  const players = await pool.query(`SELECT character_id,profile
    FROM party_runtime.party_player_characters WHERE party_id=$1`, [partyId]);
  assert.equal(players.rows.length, 1);
  const { character_id: actorId, profile } = players.rows[0];
  const [knowledge, navigation, snapshot, session, items] = await Promise.all([
    pool.query(`SELECT fact_id,knowledge_state,evidence FROM party_runtime.party_character_knowledge
      WHERE party_id=$1 AND character_id=$2 ORDER BY fact_id`, [partyId, actorId]),
    pool.query(`SELECT perceived_area_ref,perceived_direction_id,confidence
      FROM party_runtime.navigation_beliefs WHERE party_id=$1 AND character_id=$2`, [partyId, actorId]),
    pool.query(`SELECT snapshot.state_payload FROM party_runtime.party_state_snapshots snapshot
      JOIN party_runtime.parties party ON party.party_id=snapshot.party_id
        AND party.state_version=snapshot.state_version WHERE party.party_id=$1`, [partyId]),
    pool.query(`SELECT turn_number FROM party_runtime.party_server_sessions WHERE party_id=$1`, [partyId]),
    pool.query(`SELECT item.state FROM party_runtime.party_items item
      JOIN party_runtime.party_item_placements placement
        ON placement.party_id=item.party_id AND placement.item_id=item.item_id
      WHERE item.party_id=$1 AND placement.holder_character_id=$2
        AND placement.container_id IS NULL ORDER BY item.item_id`, [partyId, actorId]),
  ]);
  assert.equal(snapshot.rows.length, 1);
  assert.equal(session.rows.length, 1);
  return { dossier: profile.knowledge, facts: knowledge.rows, navigation: navigation.rows,
    runtime_facts: snapshot.rows[0].state_payload.knowledge ?? [],
    turn_number: Number(session.rows[0].turn_number),
    carried_names: items.rows.map(({ state }) => state.display_name) };
}

function emptyStartKnowledge(knowledge) {
  assert.ok(knowledge && typeof knowledge === 'object', 'Committed start knowledge required');
  for (const field of ['known_facts', 'known_places', 'known_routes', 'known_people']) {
    assert.deepEqual(knowledge[field], [], `Closed empty start knowledge: ${field}`);
  }
}

test('visibility oracle rejects leaks and placeholders without accepting synthetic prose as evidence', () => {
  const view = collectPlayerVisibility({
    visible_context: { place: 'У берега озера' },
    main_prose: 'synthetic fixture text is deliberately outside the oracle',
    panels: { inventory: { visible: true, data: { items: [{ name: 'Мешок для вещей' }] } } },
  });
  assert.deepEqual(visibilityViolations(view, { toponymRoots: ['приозер'] }), []);
  view.places[0].label = 'Приозерская пристань';
  assert.ok(visibilityViolations(view, { toponymRoots: ['приозер'] }).some(({ rule }) => rule === 'D106'));
  view.places[0].label = 'Окрестности.';
  assert.ok(visibilityViolations(view).some(({ reason }) => reason === 'родовое название места'));
  view.carried_items[0].label = null;
  assert.ok(visibilityViolations(view).some(({ reason }) => reason === 'пустая подпись'));
  view.carried_items[0].label = 'item_template_123';
  assert.ok(visibilityViolations(view).some(({ rule }) => rule === 'D72'));
  assert.equal(sanitizeVisibility(view).carried_items[0].label, '[служебный текст скрыт]');
});

test('D72/D92/D99/D106: all seven pinned v17 starts and their first look expose named player-safe facts',
  { timeout: 1_800_000 }, async (t) => {
    const manifest = await json(MANIFEST);
    assert.equal(manifest.status, 'approved');
    assert.equal(manifest.activation_authorized, true);
    assert.equal(manifest.starts.length, 7);
    const out = process.env.RUS_START_VISIBILITY_OUT_DIR
      ?? (ROOT.startsWith('/srv/novgorod-work/worktrees/')
        ? resolve(ROOT, '../../fleet/tasks', basename(ROOT), 'out')
        : await mkdtemp(join(tmpdir(), 'novgorod-start-visibility-')));
    await mkdir(join(out, 'visible'), { recursive: true });
    const records = [];
    const env = await bootstrapV17PresenceE2e(t, { postgresProfile: 'canonical-acceptance' });
    const requests = [];
    const restore = installPresenceProductionE2eFetch({ observeText: OBSERVE, requestLog: requests });
    t.after(restore);
    const { runtime } = await createPresenceProductionRoot(env);
    t.after(() => runtime.close());
    for (const [index, entry] of manifest.starts.entries()) {
      const number = index + 1;
      const record = { start_number: number, input: OBSERVE, observations: [], violations: [] };
      records.push(record);
      await t.test(`start ${number}: opening and first committed look`, async (startTest) => {
        try {
          const start = JSON.parse(await readPinnedArtifact(ROOT, entry.start));
          const basis = JSON.parse(await readPinnedArtifact(ROOT, entry.basis));
          emptyStartKnowledge(basis.knowledge);
          const dictionary = await startToponyms(env.worldPool, start);
          record.toponym_oracle = dictionary;
          requests.length = 0;
          const opening = await runtime.startNewGame({ scenario_id: entry.scenario_id,
            request_id: `start-visibility-opening-${number}` });
          assert.equal(opening.screen.schema, 'first_game_screen');
          const openingInputs = requests.filter(({ user }) => user.сцена
            && !Object.hasOwn(user, 'проверяемая_проза')
            && !Object.hasOwn(user, 'отклонённая_проза'));
          assert.ok(openingInputs.length > 0, 'Actual production opening provider input required');
          const before = await knowledgeReadback(env.partyPool, opening.party_id);
          const openingView = collectPlayerVisibility(opening.screen,
            { openingInput: openingInputs[0].user });
          record.observations.push({ phase: 'opening', visible: sanitizeVisibility(openingView) });
          record.violations.push(...visibilityViolations(openingView, { toponymRoots: dictionary.roots })
            .map((violation) => ({ phase: 'opening', ...violation })));
          await runtime.acknowledgeOpening(opening.party_id,
            { client_ack_id: `start-visibility-ack-${number}` });
          requests.length = 0;
          await runtime.submitTurn(opening.party_id,
            { raw_text: OBSERVE, request_id: `start-visibility-look-${number}` });
          const observed = await runtime.getPartyScreen(opening.party_id);
          const after = await knowledgeReadback(env.partyPool, opening.party_id);
          const turnView = collectPlayerVisibility(observed.screen);
          record.observations.push({ phase: 'first_look', visible: sanitizeVisibility(turnView) });
          record.violations.push(...visibilityViolations(turnView, { toponymRoots: dictionary.roots })
            .map((violation) => ({ phase: 'first_look', ...violation })));
          record.readback = { opening_turn: before.turn_number, first_look_turn: after.turn_number,
            initial_known_facts: before.facts.length, after_known_facts: after.facts.length,
            initial_navigation_beliefs: before.navigation.length, after_navigation_beliefs: after.navigation.length,
            carried_item_count: before.carried_names.length };
          await startTest.test('both public screens and the literal first turn are committed', () => {
            assert.equal(before.turn_number, 0);
            assert.equal(after.turn_number, 1);
            assert.equal(Number(observed.turn_number), 1);
            assert.ok(openingView.places.length > 0 && turnView.places.length > 0);
            assert.ok(requests.some(({ user }) => (user.request ?? user).root_player_action === OBSERVE));
          });
          await startTest.test('closed start knowledge stays closed: look supplied no legitimate place-name source', () => {
            emptyStartKnowledge(before.dossier);
            emptyStartKnowledge(after.dossier);
            assert.deepEqual(before.facts, []);
            assert.deepEqual(before.navigation, []);
            assert.deepEqual(after.facts, before.facts);
            assert.deepEqual(after.navigation, before.navigation);
            assert.deepEqual(after.runtime_facts, []);
          });
          await startTest.test('every directly carried item reaches the opening player-safe projection with a name', () => {
            assert.ok(before.carried_names.length > 0, 'Pinned starts supply carried equipment');
            for (const name of before.carried_names) {
              assert.ok(typeof name === 'string' && name.trim(), 'D92: carried item has no name in committed data');
              assert.ok(openingView.carried_items.some(({ label }) => label === name),
                'D92: committed carried item missing from the delivered opening facts');
            }
          });
          for (const phase of ['opening', 'first_look']) {
            await startTest.test(`${phase}: D72/D92/D106 owner labels and facts`, () => {
              assert.deepEqual(record.violations.filter((violation) => violation.phase === phase), [],
                'Player-visible labels/facts violate the acceptance contract; synthetic narrator prose excluded');
            });
          }
        } catch (error) {
          record.failure = { code: error.code ?? error.name, message: 'Execution/readback failed; this is not a naming verdict.' };
          throw error;
        } finally {
          await writeFile(join(out, 'visible', `start-${String(number).padStart(2, '0')}.json`),
            `${JSON.stringify(record, null, 2)}\n`);
        }
      });
    }
    const lines = [
      '# Приёмка видимости семи стартов v17', '',
      `Manifest: ${MANIFEST}. Release: ${runtime.health().release_id}.`, '',
      'Настоящий bootstrap и production composition; штатные тестовые attestations разрешены PLAN-OK. Статусы источников не подменялись.',
      'A-start-visibility-test-02: approval hash в binding исторический; проверяется binding.status и точный pin spatial-nodes.json, не хэш APPROVAL_DECISION. Предмет приёмки — экраны, не цепочка утверждения closure.',
      'Provider boundary детерминированный. Проза в снимках синтетическая и НЕ проверяется, живой Qwen/Giga не запускались.',
      'D106: закрытое пустое начальное знание; отдельный readback до/после хода. Положение, заголовок экрана и сам наблюдаемый факт не дают права знать имя места.',
      'Словарь: approved G5 → G4 → G3 из PostgreSQL; G3.title из pinned P12 dependency closure, не metadata.title. Именованное слово перед двоеточием либо прописное прилагательное на -ский/-ской; снимается -ск + окончание, затем финальные -й/-ье/-ия/-ь. Общие описательные слова не входят. Корень Новгород исключён. Проверяется префикс русского слова с падежным/прилагательным продолжением.',
      'Литературная понятность D99 и реальные ответы модели остаются для независимого чтения/будущего живого стенда. Пустые коллекции не доказывают отсутствия людей/природы в мире.', '',
    ];
    for (const record of records) {
      lines.push(`## Старт ${record.start_number}`, '',
        `G3: ${record.toponym_oracle?.anchor_title ?? 'не получен'}. Корни: ${(record.toponym_oracle?.roots ?? []).join(', ') || 'нет'}.`,
        `Экраны: ${record.observations.length}/2. Нарушения: ${record.violations.length}.`,
        `Readback: ${JSON.stringify(record.readback ?? 'не проверено')}.`,
        ...record.violations.map(({ phase, rule, path, reason }) => `- ${phase}: ${rule}, ${path}: ${reason}`),
        ...(record.failure ? [`- ${record.failure.code}: ${record.failure.message}`] : []), '');
    }
    await writeFile(join(out, 'start-visibility-report.md'), `${lines.join('\n')}\n`);
    console.log(`Start visibility artifacts: ${out}; ${records.reduce((sum, record) => sum + record.observations.length, 0)}/14 observations`);
  });
