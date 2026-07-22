export const stateMachineDefinitions = Object.freeze({
  executionTransitions: Object.freeze([
    ['absent','planned','immutable plan, steps and required preparation claim committed'], ['planned','active','first step dispatch succeeds'], ['planned','aborted','explicit abort before first step'], ['active','active','step start/progress/pause or nonterminal step completion with immediate next-step activation'], ['active','waiting_at_anchor','current attempt blocks or a completed step leaves the owner at an exact endpoint before next dispatch'], ['active','suspended_at_scene','interruption commits an approved route-anchor scene'], ['active','stranded_in_transit','exact in-transit state is preserved because an approved interruption anchor cannot be materialized'], ['active','completed','final plan step completes at a valid scene or transit endpoint'], ['active','aborted','current step is action/activity at an exact endpoint and the pinned failure/abort contract preserves that endpoint; active traversal must first interrupt or strand'], ['active','superseded','replan starts from an exact location-bearing endpoint; raw non-stranded in-transit supersession is forbidden'], ['waiting_at_anchor','active','same immutable plan dispatches its current step from the stored endpoint'], ['waiting_at_anchor','aborted','explicit abort at the stored endpoint'], ['waiting_at_anchor','superseded','successor plan source equals the stored endpoint snapshot'], ['suspended_at_scene','aborted','explicit abort at the suspension scene'], ['suspended_at_scene','superseded','successor recovery/replan source equals the suspension endpoint snapshot'], ['stranded_in_transit','superseded','approved rescue, repair or migration successor source equals the exact stranded snapshot']
  ].map(([from, to, gate]) => Object.freeze({ from, to, gate }))),
  executionEvents: Object.freeze([
    ['planned','absent → planned; event ordinal 0'], ['activated','planned → active only'], ['step_progressed','active → active; positive nonterminal timed-activity or traversal progress without pause or step completion'], ['step_paused','active → active; current activity or travel state becomes paused'], ['step_completed','active → active; a non-final step completes and the next step is activated in the same change set'], ['wait_started','active → waiting_at_anchor; no other event kind represents this transition'], ['suspended','active → suspended_at_scene'], ['stranded','active → stranded_in_transit'], ['resumed','waiting_at_anchor → active only'], ['completed','active → completed; final plan step completed'], ['aborted','planned, endpoint-bearing active, waiting_at_anchor or suspended_at_scene → aborted, subject to A.4.1'], ['superseded','active, waiting_at_anchor, suspended_at_scene or stranded_in_transit → superseded, subject to A.4.1']
  ].map(([eventKind, rule]) => Object.freeze({ eventKind, rule }))),
  travelStatuses: Object.freeze(['active', 'paused_in_transit', 'stranded_in_transit', 'closed']),
  activityStatuses: Object.freeze(['active', 'paused', 'completed', 'failed', 'aborted']),
  readinessStatuses: Object.freeze(['ready', 'requires_frontier_resolution', 'requires_preparation', 'temporarily_blocked', 'data_gap']),
  frontierStatuses: Object.freeze(['open', 'consumed', 'closed']),
  claimStatuses: Object.freeze(['reserved', 'consumed', 'released', 'failed']),
  validateStateMachine
});

function validateStateMachine({ machine, from, to, event_kind = null }) {
  if (machine === 'execution') {
    const transition = stateMachineDefinitions.executionTransitions.find((entry) => entry.from === from && entry.to === to);
    const eventTransitions = {
      planned: [['absent', 'planned']], activated: [['planned', 'active']], step_progressed: [['active', 'active']], step_paused: [['active', 'active']], step_completed: [['active', 'active']], wait_started: [['active', 'waiting_at_anchor']], suspended: [['active', 'suspended_at_scene']], stranded: [['active', 'stranded_in_transit']], resumed: [['waiting_at_anchor', 'active']], completed: [['active', 'completed']], aborted: [['planned', 'aborted'], ['active', 'aborted'], ['waiting_at_anchor', 'aborted'], ['suspended_at_scene', 'aborted']], superseded: [['active', 'superseded'], ['waiting_at_anchor', 'superseded'], ['suspended_at_scene', 'superseded'], ['stranded_in_transit', 'superseded']]
    };
    const eventValid = event_kind == null || Boolean(eventTransitions[event_kind]?.some(([eventFrom, eventTo]) => eventFrom === from && eventTo === to));
    return { ok: Boolean(transition && eventValid), gate: transition?.gate ?? null };
  }
  const transitions = {
    travel: [['active', 'paused_in_transit'], ['active', 'stranded_in_transit'], ['active', 'closed'], ['paused_in_transit', 'active'], ['paused_in_transit', 'stranded_in_transit'], ['paused_in_transit', 'closed'], ['stranded_in_transit', 'closed']],
    activity: [['active', 'paused'], ['active', 'completed'], ['active', 'failed'], ['active', 'aborted'], ['paused', 'active'], ['paused', 'aborted']],
    frontier: [['open', 'consumed'], ['open', 'closed']],
    claim: [['reserved', 'consumed'], ['reserved', 'released'], ['reserved', 'failed']]
  };
  return { ok: Boolean(transitions[machine]?.some(([allowedFrom, allowedTo]) => allowedFrom === from && allowedTo === to)) };
}
