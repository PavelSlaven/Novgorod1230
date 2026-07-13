import { runModularNewGamePipeline } from '@rus/new-game';
import { runTurnWorkflow } from '@rus/turn';

export function createNewGameWorkflowAdapter({ runner = runModularNewGamePipeline, optionsFactory, onResult = null } = {}) {
  if (typeof runner !== 'function') throw new TypeError('new-game runner must be a function.');
  if (typeof optionsFactory !== 'function') throw new TypeError('new-game optionsFactory is required.');
  if (onResult != null && typeof onResult !== 'function') throw new TypeError('new-game onResult must be a function when provided.');
  return Object.freeze({
    async run(input) {
      const options = await optionsFactory(structuredClone(input));
      const result = await runner({
        ...options,
        enableNewGamePipeline: true,
        requestId: input.request_id,
        startText: input.start_text,
        playerName: input.player_name,
        uiFields: input.ui_fields ?? null,
        clientDefaults: input.client_defaults ?? null
      });
      await onResult?.(result, structuredClone(input));
      return result;
    }
  });
}

export function createTurnWorkflowAdapter({ runner = runTurnWorkflow, servicesFactory, optionsFactory = null } = {}) {
  if (typeof runner !== 'function') throw new TypeError('turn runner must be a function.');
  if (typeof servicesFactory !== 'function') throw new TypeError('turn servicesFactory is required.');
  if (optionsFactory != null && typeof optionsFactory !== 'function') throw new TypeError('turn optionsFactory must be a function.');
  return Object.freeze({
    async run(input) {
      const services = await servicesFactory(structuredClone(input));
      const options = optionsFactory ? await optionsFactory(structuredClone(input)) : {};
      return runner(input, services, options);
    }
  });
}
