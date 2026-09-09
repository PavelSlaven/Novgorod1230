import { checkProductionWorldKnowledgeReadiness } from
  '../apps/game-server/src/internal/world-knowledge-production.js';

const result = await checkProductionWorldKnowledgeReadiness({
  python: process.env.RUS_WORLD_KNOWLEDGE_PYTHON ?? 'python'
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
