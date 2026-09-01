import { randomUUID } from 'node:crypto';
import {
  errorEnvelope,
  successEnvelope,
  validateLlmSettingsProbeRequest,
  validateLlmSettingsRequest,
  validateNewGameRequest,
  validateOpeningAckRequest,
  validatePresentationRecoveryRequest,
  validateTurnRequest
} from './contracts.js';
import { readJsonBody, sendJson, sendText } from './json.js';
import { validatePortraitSpecRequest } from '../portrait-lab/request.js';

export function createHttpHandler({
  root,
  staticAssets,
  portraitNormalizer = null,
  maxBodyBytes,
  developerMode = false
} = {}) {
  if (!root) throw new TypeError('composition root is required.');
  return async function handle(request, response) {
    const requestId = String(request.headers['x-request-id'] ?? randomUUID());
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
      const route = matchApiRoute(request.method, url.pathname);
      if (route) {
        const data = await executeRoute(route, {
          request, root, portraitNormalizer, maxBodyBytes, developerMode
        });
        return sendJson(response, route.status ?? 200, successEnvelope(data, { requestId }));
      }
      if (request.method === 'GET') {
        const asset = await staticAssets?.read(url.pathname);
        if (asset) return sendText(response, 200, asset.body, asset.contentType);
      }
      return sendJson(response, 404, errorEnvelope({ code: 'ROUTE_NOT_FOUND', message: 'Route not found.', status: 404 }, { requestId }).body);
    } catch (error) {
      const failure = errorEnvelope(error, { requestId, developerMode });
      return sendJson(response, failure.status, failure.body);
    }
  };
}

export function matchApiRoute(method, pathname) {
  if (method === 'GET' && pathname === '/api/v1/health') return { id: 'health', status: 200 };
  if (method === 'GET' && pathname === '/api/v1/scenarios') return { id: 'scenarios', status: 200 };
  if (method === 'GET' && pathname === '/api/v1/llm-settings') return { id: 'llm_settings', status: 200 };
  if (method === 'PUT' && pathname === '/api/v1/llm-settings') return { id: 'llm_settings_apply', status: 200 };
  if (method === 'POST' && pathname === '/api/v1/llm-settings/test') return { id: 'llm_settings_probe', status: 200 };
  if (method === 'POST' && pathname === '/api/v1/portrait-spec') return { id: 'portrait_spec', status: 200 };
  const report = pathname.match(/^\/api\/v1\/developer\/llm-turn-reports\/([^/]+)(?:\/([^/]+))?$/u);
  if (method === 'GET' && report) return { id: 'llm_turn_report', partyId: decodeURIComponent(report[1]), requestId: report[2] == null ? null : decodeURIComponent(report[2]), status: 200 };
  if (method === 'POST' && pathname === '/api/v1/new-games') return { id: 'new_game', status: 201 };
  const screen = pathname.match(/^\/api\/v1\/parties\/([^/]+)\/screen$/u);
  if (method === 'GET' && screen) return { id: 'party_screen', partyId: decodeURIComponent(screen[1]), status: 200 };
  const ack = pathname.match(/^\/api\/v1\/parties\/([^/]+)\/opening-ack$/u);
  if (method === 'POST' && ack) return { id: 'opening_ack', partyId: decodeURIComponent(ack[1]), status: 200 };
  const turn = pathname.match(/^\/api\/v1\/parties\/([^/]+)\/turns$/u);
  if (method === 'POST' && turn) return { id: 'turn', partyId: decodeURIComponent(turn[1]), status: 200 };
  const recovery = pathname.match(/^\/api\/v1\/parties\/([^/]+)\/presentation-recovery$/u);
  if (method === 'POST' && recovery) return { id: 'presentation_recovery', partyId: decodeURIComponent(recovery[1]), status: 200 };
  return null;
}

async function executeRoute(route, context) {
  if (route.id === 'health') return context.root.health();
  if (route.id === 'scenarios') return context.root.listScenarios();
  if (route.id === 'llm_settings') return context.root.getLlmSettings();
  if (route.id === 'llm_turn_report') {
    if (context.developerMode !== true || typeof context.root.getLlmTurnReport !== 'function') {
      throw Object.assign(new Error('Route not found.'), { code: 'ROUTE_NOT_FOUND', status: 404 });
    }
    const report = context.root.getLlmTurnReport({ party_id: route.partyId, request_id: route.requestId });
    if (report == null) throw Object.assign(new Error('LLM turn report not found.'), { code: 'LLM_TURN_REPORT_NOT_FOUND', status: 404 });
    return report;
  }
  if (route.id === 'party_screen') return context.root.getPartyScreen(route.partyId);
  const body = await readJsonBody(context.request, { maxBytes: context.maxBodyBytes });
  if (route.id === 'llm_settings_apply') return context.root.applyLlmSettings(validateLlmSettingsRequest(body));
  if (route.id === 'llm_settings_probe') return context.root.probeLlmSettings(validateLlmSettingsProbeRequest(body));
  if (route.id === 'portrait_spec') {
    if (typeof context.portraitNormalizer?.normalize !== 'function') {
      throw Object.assign(new Error('Portrait normalizer is unavailable.'), {
        code: 'PORTRAIT_NORMALIZER_UNAVAILABLE', status: 503
      });
    }
    const input = validatePortraitSpecRequest(body);
    return { spec: await context.portraitNormalizer.normalize(input.text) };
  }
  if (route.id === 'new_game') return context.root.startNewGame(validateNewGameRequest(body));
  if (route.id === 'opening_ack') return context.root.acknowledgeOpening(route.partyId, validateOpeningAckRequest(body));
  if (route.id === 'presentation_recovery') return context.root.recoverPendingPresentation(route.partyId, validatePresentationRecoveryRequest(body));
  if (route.id === 'turn') return context.root.submitTurn(route.partyId, validateTurnRequest(body));
  throw new Error(`Unsupported route: ${route.id}`);
}
