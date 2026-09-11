export function reviewedNarration(segments, coverage = {}) {
  return {
    reviewed_segments: segments.map(({ segment_id }) => segment_id),
    source_reviews: Object.entries(coverage).map(([ref, segment_choices]) => ({ ref, segment_choices })),
    unsupported: [], literary_failures: [], evidence: ['Grounded current beat.']
  };
}
