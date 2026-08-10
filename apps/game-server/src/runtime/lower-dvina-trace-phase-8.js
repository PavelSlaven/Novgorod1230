import { createTracePhase8AccusationCommand } from
  './lower-dvina-trace-phase-8-accusation-command.js';
import { createTracePhase8RouteCommand } from
  './lower-dvina-trace-phase-8-route-command.js';

export function createTracePhase8Commands(input) {
  return [createTracePhase8RouteCommand(input),
    createTracePhase8AccusationCommand(input)];
}
