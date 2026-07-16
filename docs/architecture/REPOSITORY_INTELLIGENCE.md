# Repository Intelligence Architecture

## Status

Proposed implementation architecture for PR #13.

## Purpose

Repository Intelligence is a development-only, read-only subsystem for discovering and tracing information across:

- canonical normative documents;
- ordinary project documentation;
- source code, tests, schemas and configuration;
- contracts and module registries.

It is not part of game runtime and must never be used as the world graph, party graph, G0–G5 graph or gameplay state.

## Source-of-truth boundary

The subsystem combines two independent evidence channels:

1. `@rus/knowledge-source`
   - owns normative authority, document status, SHA-256, source ranges, retrieval policy and conflict metadata;
   - remains the only valid route for selecting mandatory and profile normative documents;
   - remains fail-closed when the corpus, policy or generated RAG is stale or invalid.
2. Graphify
   - owns repository topology for code and documents;
   - extracts code structure locally through AST parsing;
   - provides `query`, `path` and `explain` traversal over a separate repository graph;
   - does not assign normative authority and cannot replace full reading of a mandatory document.

The combined subsystem does not merge the two graphs physically. It joins their query results in a typed response while preserving provenance and authority.

## Explicit isolation from the game graph

Repository Intelligence artifacts use only:

```text
graphify-out/
generated/repository-intelligence/
```

They must not read from or write to:

```text
world_base.graph_nodes
world_base.graph_edges
party_runtime
map layouts
G0-G5 materialization state
```

Identifiers from Repository Intelligence use the namespace `repo_intel:*`. Gameplay graph identifiers remain unchanged.

No Repository Intelligence edge may be interpreted as:

- physical adjacency;
- a valid route;
- historical truth;
- a permitted materialization candidate;
- an ownership, relationship or causal world fact.

## Public command contract

The repository exposes one mandatory CLI surface:

```text
npm run repo-intel:status
npm run repo-intel:query -- --query "information need"
npm run repo-intel:read -- --document-id <id>
npm run repo-intel:path -- --from <node> --to <node>
npm run repo-intel:explain -- --node <node>
npm run repo-intel:controls
```

### `status`

Checks:

- canonical knowledge-source readiness;
- presence of the Graphify executable;
- Graphify version against the pinned requirement;
- presence of project-scoped Graphify skills for Codex and Cursor;
- presence and parseability of `graphify-out/graph.json`;
- source commit recorded in the repository-intelligence manifest;
- graph staleness against the current Git commit.

Any missing required component produces a typed non-zero failure.

### `query`

Execution order:

```text
knowledge-source ranked query
+ Graphify scoped graph query
+ deterministic result normalizer
→ combined response
```

The response keeps channels separate:

```json
{
  "schema_version": "rus.repository_intelligence_query.v1",
  "query": "...",
  "normative": {},
  "repository_graph": {},
  "warnings": []
}
```

Normative results always retain document status, SHA-256, canonical path and source line range. Graph results retain node IDs, source paths, source ranges, relation confidence and relation type.

No answer may silently promote an inferred Graphify edge into a normative requirement.

### `read`

Delegates to `@rus/knowledge-source`. Mandatory and profile normative documents are still read in full after discovery.

### `path` and `explain`

Delegate to Graphify against `graphify-out/graph.json`. They are used only for code/document topology and impact analysis.

### `controls`

Runs knowledge-source control queries plus repository-intelligence control queries covering:

- mandatory normative discovery;
- code-to-contract tracing;
- module ownership discovery;
- test and call-site discovery;
- absence of gameplay graph artifacts in the repository graph output contract.

## Agent workflow

Before direct file search, grep, GitHub code search or broad repository reading, Codex, Cursor and development agents must run:

```text
repo-intel:status
→ repo-intel:query
→ repo-intel:read for mandatory/profile normative documents
→ repo-intel:path or repo-intel:explain when relationships matter
→ direct code search only for exact implementation inspection
```

Direct search is allowed only after the hybrid query, or after a typed Repository Intelligence failure has been recorded. A stale or blocked normative channel remains a hard block for actions depending on normative documents.

## Required Graphify installation

Pinned package:

```text
graphifyy==0.9.17
```

Required installation:

```bash
uv tool install "graphifyy==0.9.17"
graphify install --project --platform codex
graphify cursor install --project
graphify install --project --platform agents
```

Codex additionally requires:

```toml
[features]
multi_agent = true
```

in `~/.codex/config.toml` when parallel extraction is used.

Project-scoped skill installation is required so the repository contains the persistent query-first instructions for supported agents. User-global installation alone is not sufficient for project readiness.

## Build and update workflow

```text
approved repository revision
→ verify knowledge-source
→ run Graphify over repository with .graphifyignore
→ validate graph namespace and source paths
→ write graphify-out artifacts
→ write generated/repository-intelligence/manifest.json
→ run controls
```

Graphify outputs may be committed, but are generated artifacts and never sources of normative truth.

## Fail-closed rules

The combined CLI must fail when:

- knowledge-source is stale or blocked;
- the pinned Graphify executable is unavailable;
- required project skills are absent;
- `graphify-out/graph.json` is missing or invalid;
- the graph manifest points to another repository revision;
- source paths escape the repository;
- repository graph artifacts overlap gameplay graph storage;
- a command tries to use Graphify output as a materialization candidate or world fact.

No fallback to grep, a legacy graph, an unpinned Graphify version or an old generated graph is automatic.

## Security and privacy

Graphify code extraction must remain local. Semantic processing of documents is optional and must use an explicitly configured provider. Secrets, `.env` files, credentials, database dumps, party saves, generated browser artifacts and dependency directories must be excluded through `.graphifyignore`.

## Integration decision

The current RAG is not removed. It becomes the normative channel inside the combined system. Replacing it with Graphify would lose status isolation, normative priority, exact source provenance, conflict reporting and fail-closed corpus validation. Graphify adds code topology and multi-hop traversal that the current RAG does not provide.
