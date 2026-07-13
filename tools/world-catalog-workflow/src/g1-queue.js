import { digestValue } from './digest.js';
import { cellBlockingReasons } from './g1-mask.js';

export function buildG1WorkQueue(cells = [], revision = {}, options = {}) {
  const allowIncomplete = Boolean(options.allowIncomplete);
  for (const cell of cells) {
    if (cell?.global_grid_x == null || cell?.global_grid_x === '' || !Number.isInteger(Number(cell.global_grid_x))) throw new TypeError(`${cell?.id ?? '?'}: global_grid_x must be an integer before queue construction`);
    if (cell?.global_grid_y == null || cell?.global_grid_y === '' || !Number.isInteger(Number(cell.global_grid_y))) throw new TypeError(`${cell?.id ?? '?'}: global_grid_y must be an integer before queue construction`);
  }
  const selected = cells
    .filter((cell) => cell?.cell_active !== false)
    .filter((cell) => cell?.region_cell_status !== 'outside_region')
    .filter((cell) => cell?.control_status !== 'external')
    .sort((left, right) => Number(right.global_grid_y) - Number(left.global_grid_y) || Number(left.global_grid_x) - Number(right.global_grid_x) || String(left.id).localeCompare(String(right.id)));
  const entries = selected.map((cell, index) => {
    const blockingReasons = cellBlockingReasons(cell);
    if (!allowIncomplete && blockingReasons.length > 0) throw new TypeError(`${cell.id}: incomplete G1 mask record: ${blockingReasons.join(', ')}`);
    return {
      sequence_number: index + 1,
      g1_id: cell.id,
      global_grid_x: Number(cell.global_grid_x),
      global_grid_y: Number(cell.global_grid_y),
      cell_class: cell.g1_type ?? cell.legacy_g1_type ?? null,
      work_status: blockingReasons.length ? 'blocked' : 'unprocessed',
      research_status: 'not_started',
      local_approval_status: 'not_started',
      integration_status: 'not_started',
      import_status: 'not_started',
      blocking_reasons: blockingReasons,
      package_digest: null
    };
  });
  const core = { map_revision_id: revision.map_revision_id, order: 'global_grid_y DESC, global_grid_x ASC', entries };
  return { schema_version: 'rus.g1_work_queue.v1', ...core, queue_digest: digestValue(core) };
}
