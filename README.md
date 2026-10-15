# Freelancer Virtual House

Local-first operations workspace for a solo freelancer. The current MVP includes an API-backed 2D dashboard, opportunity scoring, evidence-based proposal drafts, deterministic policy checks, simulated bid records, an append-only activity feed, local SQLite storage, a private text knowledge index, read-only selected-repository GitHub sync, and an optional 3D room.

The application starts with an empty opportunities list. Freelancer.com reads are available through an explicit, read-only verification and sync action; account access remains unverified until a request succeeds. No route sends marketplace writes. LinkedIn content can be added as a user-provided export or manual fact; optional OIDC access is limited to the approved lightweight profile scope.

## Run locally

Requirements: Node.js 24 or newer and pnpm 12.

```powershell
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5174`. SQLite data is kept in the ignored `.local` directory. Set `FVH_DATA_DIR` to a private local path to move it.

## Configure optional sources

- Public GitHub repositories can be read by owner/name. For a private repository, set `GITHUB_TOKEN` in the server environment with access only to the selected repository and `Contents: read` permission. The token is never returned to the browser or written to the database.
- LinkedIn OIDC is optional and requires the app product and exact redirect URL to be approved. Import a text or CSV export that belongs to you, or enter profile facts manually.
- Hermes drafting is disabled until the CLI/profile are configured and `FVH_AI_DATA_CONSENT=true` is explicitly set. The current profile is `private-ai-house`; see [the local profile and cron setup](docs/hermes-agent-setup.md). If enabled, only the selected project, supplied profile facts, and up to four relevant local evidence chunks are passed to the CLI. Marketplace credentials are excluded, and drafting never submits marketplace actions.

## Checks

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The test suite uses fixtures and mocked provider responses. It does not send a live marketplace write.
