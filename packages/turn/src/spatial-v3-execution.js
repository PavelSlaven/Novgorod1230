import { createSpatialV3ActivityExecution } from './spatial-v3-execution-activity.js';
import { deepFreeze } from './spatial-v3-execution-support.js';
import { createSpatialV3TraversalExecution } from './spatial-v3-execution-traversal.js';

export function createSpatialV3ExecutionEngine() {
  const replays = new Map();
  const traversal = createSpatialV3TraversalExecution(replays);
  const activity = createSpatialV3ActivityExecution(replays);
  return deepFreeze({
    executeImmediateAction: traversal.executeImmediateAction,
    startTraversal: traversal.startTraversal,
    resolveTraversalInterval: traversal.resolveTraversalInterval,
    resolveSynchronizedSlice: traversal.resolveSynchronizedSlice,
    planTimedActivity: activity.planTimedActivity,
    activateTimedActivity: activity.activateTimedActivity,
    planActivitySlice: activity.planActivitySlice,
    applyActivityElapsed: activity.applyActivityElapsed,
    resolveActivityBoundary: activity.resolveActivityBoundary,
    resolveActivityInterruption: activity.resolveActivityInterruption,
    resumeActivity: activity.resumeActivity,
    abortActivity: activity.abortActivity,
    resolveParticipantChange: activity.resolveParticipantChange,
    resolveResourceChange: activity.resolveResourceChange
  });
}
