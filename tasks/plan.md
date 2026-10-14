# Implementation plan

The supplied PRD, TECH_STACK, AGENT, and TASKS documents are the accepted specification. This plan follows their roadmap while keeping unverified external writes fail-closed.

1. **Foundation:** strict pnpm workspace, typed domain rules, fixtures, SQLite migrations, deterministic policy/scoring and pipeline state.
2. **Vertical slice:** Fastify routes for dashboard, projects, drafts, policy, simulated send, activity, settings, and knowledge; React 2D console consumes same-origin APIs.
3. **Knowledge Hub:** local user-provided text import, secret/file screening, provenance, FTS search, delete; remote provider status remains explicit.
4. **Optional integrations:** OpenCode adapter behind configuration and schema validation; marketplace/GitHub/LinkedIn calls remain disabled unless official capability and authorization are configured.
5. **Resilience and finish:** responsive/keyboard UI, optional lazy 3D, unit/API/smoke checks, browser click-through, build and security review.
