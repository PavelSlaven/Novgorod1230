export function reviewedNarration(segments) {
  return {
    reviewed_segments: segments.map(({ segment_id }) => segment_id),
    failure_checks: {
      current_beat_buried: [], elapsed_as_service_report: [], static_context_dump: [],
      weak_literary_composition: [], unsupported_response_or_continuation: []
    }
  };
}
