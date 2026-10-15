# Freelancer Virtual House

Local-first operations workspace for a solo freelancer. The current MVP includes an API-backed 2D dashboard, opportunity scoring, evidence-based proposal drafts, deterministic policy checks, simulated bid records, an append-only activity feed, local SQLite storage, a private text knowledge index, read-only selected-repository GitHub sync, and an optional 3D room.

All starter opportunities are fixtures. The Freelancer.com connector is intentionally disabled because its endpoint, permission, and sandbox contract was not verifiable during implementation. No route sends marketplace writes. LinkedIn content is accepted only as a user-provided text export or manual fact.

## Run locally

Requirements: Node.js 24 or newer and pnpm 12.

```powershell
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173`. SQLite data is kept in the ignored `.local` directory. Set `FVH_DATA_DIR` to a private local path to move it.

## Configure optional sources

- Public GitHub repositories can be read by owner/name. For a private repository, set `GITHUB_TOKEN` in the server environment with access only to the selected repository and `Contents: read` permission. The token is never returned to the browser or written to the database.
- LinkedIn API access is not configured. Import a text or CSV export that belongs to you, or enter profile facts manually.
- Fixture drafting is the default. To use Hermes Agent, follow [the local profile and cron setup](docs/hermes-agent-setup.md), then set `FVH_AI_MODE=hermes`, `FVH_AI_DATA_CONSENT=true`, and the Hermes profile name in the project `.env`. Only the selected project, supplied profile facts, and up to four relevant local evidence chunks are passed to the CLI. Marketplace credentials are excluded. The dedicated Hermes profile must have an empty `cli` toolset; drafting never submits marketplace actions.

## Checks

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The test suite uses fixtures and mocked provider responses. It does not send a live marketplace write.
