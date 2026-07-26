export function evaluateFirstPlayableProductionPreflight({
  world,
  party,
  expectedWorldDatabase,
  expectedPartyDatabase
}) {
  const identityMatches =
    world.database === expectedWorldDatabase
    && party.database === expectedPartyDatabase;
  const fresh =
    world.user_table_count === 0
    && party.user_table_count === 0;
  return {
    ready: identityMatches && fresh,
    fresh,
    identity_matches: identityMatches,
    world,
    party
  };
}
