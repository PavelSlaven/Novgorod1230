export const NEW_GAME_STAGE_CATALOG = Object.freeze([
  [2, 'normalization'], [3, 'historical-frame'], [4, 'regional-context'], [5, 'start-candidates'],
  [6, 'candidate-place-templates'], [7, 'npc-candidates'], [8, 'item-profile-candidates'],
  [9, 'start-node-selection'], [10, 'start-place-audit'], [11, 'player-character'],
  [12, 'player-character-audit'], [13, 'g5-materialization'], [14, 'g5-audit'],
  [15, 'npc-placement'], [16, 'item-placement'], [17, 'time-light-gate'],
  [18, 'character-knowledge-map'], [19, 'hidden-state'], [20, 'visible-context'],
  [21, 'visible-context-audit'], [22, 'narrator-prose'], [23, 'narrator-prose-audit'],
  [24, 'party-db-write-plan'], [25, 'party-commit'], [26, 'first-game-screen']
].map(([id, name]) => Object.freeze({ id, name })));
