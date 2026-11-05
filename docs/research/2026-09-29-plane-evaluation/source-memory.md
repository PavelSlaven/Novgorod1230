---
name: plane-evaluation
description: "Plane (makeplane/plane) CE evaluated 2026-09-29 as replacement for file bridges: cannot enforce «agents write, not delete»; proposed as owner showcase fed by a sync bot"
metadata:
  node_type: memory
  type: project
  originSessionId: ff9acd1f-6ccd-44a9-bc42-216c6bc662b8
  modified: 2026-09-29T07:11:20.536Z
---

On 2026-09-29 the owner proposed Plane (github.com/makeplane/plane) instead of the text-file bridges. Deploy self-hosted on servak only, no cloud (owner's words). I checked it with a research workflow, an Opus verifier, and my own look at the source.

**Facts about Community Edition (AGPL, free), checked in code on master:**
- **Roles.** The code has only three roles: Admin, Member and Guest. Contributor, Commenter, custom roles, Workspace Admin, audit logs (Enterprise Grid), OAuth apps and Plane AI are paid features. docs.plane.so describes the paid editions and runs ahead of CE, so check CE claims against `makeplane/plane` source.
- **Comments can be deleted by anyone.** The public API endpoint `IssueCommentDetailAPIEndpoint` (`apps/api/plane/api/views/issue.py`) uses `ProjectLitePermission`, which only checks project membership. Any member, even a Guest, can edit or delete anyone's comment.
- **No restricted keys.** An API key carries the full rights of its user; a read-only key cannot be minted.
- **MCP cannot hide delete.** The MCP server is `makeplane/plane-mcp-server`; on CE it runs over stdio with an API key. It exposes 30 tools, and delete is an `action` inside a tool, so a client-side allow-list cannot cut it.
- **Deleting.** Delete is a soft delete, wiped after `HARD_DELETE_AFTER_DAYS` (default 60, set by env). The activity log keeps the old text of an edited comment, but not the text of a deleted one.
- **Webhooks.** Events are at workspace level. After 5 retries the webhook is disabled and missed events are lost. Localhost and private-network receivers are blocked unless listed in `WEBHOOK_ALLOWED_IPS`/`WEBHOOK_ALLOWED_HOSTS`.
- **API rate limit.** 60 requests per minute per key (env `API_KEY_RATE_LIMIT`).
- **Running it.** The stack is 13 containers. The Celery worker's concurrency defaults to the core count (issue #6671); on servak's 64 cores it must be capped by hand. Upgrades in 2026 have known breakages.

**Our current bridge:** agents run as root. `fleet/tasks` is not under git. «Append-only» is a rule, not enforced.

**My recommendation:**
- Use Plane as a window for the owner: a board plus the owner's own channel.
- A deterministic sync bot mirrors the fleet files into Plane. Agents get no Plane keys, and the files stay the source of truth.
- Enforce protection of the files themselves: git auto-commit of `fleet/tasks` and `chattr +a`.
- Full replacement only through a proxy that has no delete.

The owner's decision on the pilot is pending.

Related: [[servak-fleet]], [[codex-bridge-and-handoff]].
