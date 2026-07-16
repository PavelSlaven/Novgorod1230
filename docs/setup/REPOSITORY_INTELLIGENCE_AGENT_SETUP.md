# Mandatory Repository Intelligence setup

Repository Intelligence is required for Codex, Cursor and other development agents working in this repository.

## Prerequisites

- Python 3.10 or newer;
- `uv` tool manager;
- Node.js version required by the repository;
- Graphify package pinned to `0.9.17`.

## Install Graphify

```bash
uv tool install "graphifyy==0.9.17"
graphify --version
```

Do not install similarly named PyPI packages. The approved package name is `graphifyy`; the executable is `graphify`.

## Install project-scoped skills

Run from the repository root:

```bash
graphify install --project --platform codex
graphify cursor install --project
graphify install --project --platform agents
```

Expected project files include Graphify instructions under the platform-specific project directories, including Codex/Agent Skills and Cursor rules. User-global installation does not satisfy project readiness by itself.

For Codex parallel extraction, add to `~/.codex/config.toml`:

```toml
[features]
multi_agent = true
```

## Build the repository graph

```bash
graphify . --no-viz
```

For an incremental refresh:

```bash
graphify . --update --no-viz
```

The repository `.graphifyignore` excludes secrets, runtime state, dependencies, legacy rollback material and generated knowledge outputs.

## Mandatory workflow

Before direct grep, file search or broad repository reads:

```bash
npm run repo-intel:status
npm run repo-intel:query -- --query "specific information need"
```

Then:

```bash
npm run repo-intel:read -- --document-id <document_id>
npm run repo-intel:path -- --from <node> --to <node>
npm run repo-intel:explain -- --node <node>
```

Mandatory and profile normative documents must still be read fully through the knowledge-source channel. Graphify relationships do not create normative authority.

## Isolation rule

`graphify-out/graph.json` is the repository-intelligence graph. It must not be copied into, merged with or queried as the gameplay G0–G5 graph. It cannot provide routes, world facts, materialization candidates or party state.

## Readiness failures

Work depending on repository intelligence must stop when:

- the pinned Graphify executable is missing;
- project-scoped skills are absent;
- the repository graph is missing or stale;
- knowledge-source reports stale, blocked or invalid state;
- the graph contains paths outside the repository;
- repository and gameplay graph namespaces overlap.
