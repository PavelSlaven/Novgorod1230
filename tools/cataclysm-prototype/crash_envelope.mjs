import { createP3OperationEnvelope } from './p3-boundary.js';

let text = '';
for await (const chunk of process.stdin) text += chunk;
const { observation, actor_id, operation_id, utterance } = JSON.parse(text);
const actor = observation.actors.find(row => row.actor_id === actor_id);
if (!actor) throw new Error('CRASH_NPC_ACTOR_MISSING');
const envelope = createP3OperationEnvelope({ observation,
  operationId: operation_id, actorRef: actor.actor_ref, primitive: 'speak',
  args: { utterance }, references: { actors: ['avatar'] },
  registeredPrimitives: ['speak'] });
process.stdout.write(JSON.stringify(envelope));
