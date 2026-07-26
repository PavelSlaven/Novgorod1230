import { finalizeLocalTraversal } from './traversal-terminal.js';
import { persistLocalTraversalInterval } from './traversal-interval.js';
import { prepareLocalTraversal } from './traversal-setup.js';

export async function persistLocalTraversal(tx, input) {
  const prepared = await prepareLocalTraversal(tx, input);
  const interval = await persistLocalTraversalInterval(tx, prepared);
  await finalizeLocalTraversal(tx, interval);
}
