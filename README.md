# Freelancer Virtual House

Local-first operations workspace for a solo freelancer. The app reads the connected Freelancer profile, derives the supported skill set, scans matching opportunities every 15 minutes, creates a factual proposal, and sends a live bid only when the stored policy passes its price, deadline, risk, confidence, quota, currency, and active-hour checks. Activity and status are visible in the dashboard; project-by-project forms are not part of the workflow.

The server verifies Freelancer read access at startup and bootstraps its local profile and bid policy from the public account profile. It stores no project message or portfolio content. Only fixed-price USD projects with matching skills are eligible for autonomous bidding. The `submit_bid` capability becomes supported after Freelancer returns HTTP 200. At startup, `edit_profile` re-sends the exact current job ID list only when a second read confirms it has not changed. The agent sends no client messages without a contextual response rule. LinkedIn content can be added as a user-provided export or manual fact; optional OIDC access is limited to the approved lightweight profile scope.

## Run locally

Requirements: Node.js 24 or newer and pnpm 12.

```powershell
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5174`. SQLite data is kept in the ignored `.local` directory. Set `FVH_DATA_DIR` to a private local path to move it.

## Configure optional sources

- Freelancer.com access accepts `FVH_FREELANCER_ACCESS_TOKEN` in the ignored server `.env`; the Windows DPAPI secure store remains the fallback when the environment key is absent. The server uses this token for reads and policy-bounded autonomous bids. It is never returned to the browser or written to logs.
- Public GitHub repositories can be read by owner/name. For a private repository, set `GITHUB_TOKEN` in the root `.env` file or server environment with access only to the selected repository and `Contents: read` permission. The token is never returned to the browser or written to the database.
- LinkedIn OIDC is optional and requires the app product and exact redirect URL to be approved. Import a text or CSV export that belongs to you, or enter profile facts manually.
- Hermes drafting is disabled until the CLI/profile are configured and `FVH_AI_DATA_CONSENT=true` is explicitly set. Automatic bid proposals use a local factual template and do not require sending project data to an AI provider. Hermes is optional; see [the local profile and cron setup](docs/hermes-agent-setup.md).

## Checks

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The test suite uses fixtures and mocked provider responses. It does not send a live marketplace write.
