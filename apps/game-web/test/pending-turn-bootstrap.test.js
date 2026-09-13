import assert from 'node:assert/strict';
import test from 'node:test';
import { bootstrapGameWeb } from '../src/app/bootstrap.js';
import { createUiStore } from '../src/app/store.js';

function harness(saved, api, ready = true) {
  class Form {
    constructor(raw) { this.raw = raw; }
    matches(selector) { return selector === '[data-turn-form]'; }
  }
  const handlers = {};
  const root = { innerHTML: '', querySelector() { return null; },
    addEventListener(name, fn) { handlers[name] = fn; },
    ownerDocument: { documentElement: { dataset: {} }, defaultView: {
      HTMLFormElement: Form,
      FormData: class { constructor(form) { this.form = form; }
        get() { return this.form.raw; } }
    } } };
  const store = createUiStore();
  if (ready) store.setScreen(screen());
  bootstrapGameWeb({ root, store, storage: saved, api: {
    async listScenarios() { return { scenarios: [] }; },
    async getLlmSettings() { return { mode: 'custom' }; }, ...api
  } });
  return { root, store, submit: (raw) => handlers.submit({ target: new Form(raw),
    preventDefault() {} }), continue: () => handlers.click({ target: {
    closest: (selector) => selector === '[data-continue-party]' ? {} : null
  } }) };
}

function screen() { return { version: 1, schema: 'first_game_screen',
  party_id: 'party', screen_status: 'ready', main_prose: 'Берег.' }; }

function storage() {
  const values = new Map([['rus.party_id', 'party']]);
  return { getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key) };
}

test('bootstrap recovers the pending request while preserving a different new draft', async () => {
  const saved = storage(); const requests = [];
  const ui = harness(saved, { async submitTurn(_party, request) {
    requests.push(request);
    if (requests.length === 1) throw new TypeError('lost response');
    return { screen: screen() };
  } });
  await ui.submit('Жду.');
  assert.match(ui.root.innerHTML, /Восстановить прежний ход/u);
  await ui.submit('Иду дальше.');
  assert.deepEqual(requests[1], requests[0]);
  assert.equal(ui.store.getState().turnDraft, 'Иду дальше.');
  assert.match(ui.root.innerHTML, /Иду дальше\./u);
  await ui.submit('Иду дальше.');
  assert.notEqual(requests[2].request_id, requests[1].request_id);
  assert.equal(requests[2].raw_text, 'Иду дальше.');
});

test('ordinary in-flight turn shows progress without claiming recovery', async () => {
  const saved = storage();
  let finishTurn;
  const ui = harness(saved, {
    submitTurn: async () => new Promise((resolve) => { finishTurn = resolve; }),
    async getTurnProgress() {
      return { phase: 'understanding_action', commit_state: 'unconfirmed',
        elapsed_seconds: 1 };
    }
  });
  const pending = ui.submit('Оглядываюсь.');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(ui.root.innerHTML, /Разбираем действие/u);
  assert.doesNotMatch(ui.root.innerHTML, /Восстановить прежний ход/u);
  finishTurn({ screen: screen() });
  await pending;
});

test('Continue after reload resolves the exact saved request before loading any newer screen', async () => {
  const saved = storage(); let original;
  await harness(saved, { async submitTurn(_party, request) {
    original = request; throw new TypeError('lost response');
  } }).submit('Жду.');
  const replayed = [];
  const reloaded = harness(saved, {
    async submitTurn(party, request) { replayed.push({ party, request });
      return { screen: screen() }; },
    async getPartyScreen() { assert.fail('pending request must be resolved first'); }
  }, false);
  await reloaded.continue();
  assert.deepEqual(replayed, [{ party: 'party', request: original }]);
  assert.equal(reloaded.store.getState().status, 'ready');
});
