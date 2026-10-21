# Graph Report - private-ai-house  (2026-10-21)

## Corpus Check
- 227 files · ~132,275 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .example 1, .css 1)

## Summary
- 1717 nodes · 4265 edges · 93 communities (84 shown, 9 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 145 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7a612176`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Freelancer Adapter & BusinessSync
- Workspace Repository (Postgres)
- OfficeShell.tsx
- adapter-hermes/src/index.ts
- App.tsx
- server/package.json
- contracts/src/index.ts
- Domain Scoring & Policy Engine
- app.ts
- projects-co-id.test.ts
- Root Tooling & Lint
- 3D Office Scene
- dependencies
- Web Dependencies
- Owner Movement & Desks
- projects.co.id Worker
- Live Events (SSE) Server
- Health & Capabilities Controllers
- Freelancer Autopilot
- DPAPI Integration Vault
- Server Assembly (index.ts)
- Google Calendar & WhatsApp
- Office Floor Layout
- private.mjs
- Opportunities & Pipeline UI
- projects.co.id Page
- persistence/src/index.ts
- vitest
- E2E & Browser Verify Scripts
- controllers/freelancer.ts
- Card Remodel Verifier
- domain/src/index.ts
- services/hermes-kanban.ts
- GitHub Env & Schema Migration
- LinkedIn OAuth
- hermes-team.ts
- Telegram Project Feed
- vitest
- Product Principles (Docs)
- controllers/hermes-kanban.ts
- Hermes Adapter Package
- services/browser-bidding.ts
- HermesKanbanCard.tsx
- services/browser-bidding.ts
- Calendar Page
- Application Package
- persistence/package.json
- api.ts
- Browser Bid & Floor-2 Docs
- Bidding Modes & Chrome CDP (Docs)
- owner-input.ts
- AppContext
- Contracts Package
- database.ts
- api
- DpapiIntegrationVault
- Freelancer Adapter Package
- GitHub Adapter Package
- knowledge/src/index.ts
- Base TS Config
- Security & Hermes Consent (Docs)
- Server TS Config
- controllers/work.ts
- migrate-sqlite-to-supabase.mjs
- Autopilot Decisions (Docs)
- controllers/activity.ts
- Web TS Config
- Audit & Bid Data Model (Docs)
- Agent Roster & Hermes Team (Docs)
- Capability Matrix (Docs)
- Domain Package
- Knowledge Package
- Data Platform Decisions (Docs)
- application/src/index.ts
- whatsapp-status.ts
- projects.co.id Page Budget
- Freelancer Adapter TS Config
- GitHub Adapter TS Config
- Hermes Adapter TS Config
- Application TS Config
- Contracts TS Config
- Domain TS Config
- Knowledge TS Config
- Persistence TS Config
- src/projects-co-id.ts
- WhatsAppService
- scripts
- parseBody
- portfolio.ts
- live-topics.ts
- Private Start Supervisor

## God Nodes (most connected - your core abstractions)
1. `WorkspaceRepository` - 87 edges
2. `vitest` - 53 edges
3. `api()` - 47 edges
4. `ProjectsCoIdService` - 36 edges
5. `createApp()` - 36 edges
6. `fastify` - 32 edges
7. `ErrorNotice()` - 31 edges
8. `PageIntro()` - 31 edges
9. `LoadingPanel()` - 30 edges
10. `jsonRequest()` - 29 edges

## Surprising Connections (you probably didn't know these)
- `Capability matrix` --semantically_similar_to--> `Data honesty rule (no simulated data in UI)`  [INFERRED] [semantically similar]
  docs/capability-matrix.md → AGENTS.md
- `integration-vault.ps1 (DPAPI vault)` --semantically_similar_to--> `Credential store (Windows DPAPI)`  [INFERRED] [semantically similar]
  docs/floor-two-operations.md → AGENTS.md
- `Explicit approval before external actions` --semantically_similar_to--> `Actions requiring explicit owner permission`  [INFERRED] [semantically similar]
  docs/hermes/SOUL.md → AGENTS.md
- `CardDataStatus` --implements--> `Data honesty rule (no simulated data in UI)`  [INFERRED]
  docs/realtime.md → AGENTS.md
- `SSE GET /api/events` --references--> `Loopback-only API with Host/Origin checks`  [EXTRACTED]
  docs/realtime.md → AGENTS.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Autopilot bid submission flow** — agents_freelancerautopilot, agents_policy_engine, agents_hermescliddraftingadapter, agents_proposal_fallback_guard, agents_audit_events, agents_bid_results, docs_browser_bidding_submit_success_proof [EXTRACTED 1.00]
- **Realtime change propagation (DB write to card refresh)** — docs_realtime_announcewrites, docs_realtime_live_topics, docs_realtime_sse_events, agents_officeshell, docs_realtime_carddatastatus [EXTRACTED 1.00]
- **Workers sharing owner Chrome via CDP** — docs_browser_bidding_sharedchromesession, docs_browser_bidding_connect_over_cdp, docs_browser_bidding_browser_bid_worker, docs_projects_co_id_scout_worker [EXTRACTED 1.00]

## Communities (93 total, 9 thin omitted)

### Community 0 - "Freelancer Adapter & BusinessSync"
Cohesion: 0.06
Nodes (44): BackoffJob, BusinessSync, BusinessSyncStatus, Dependencies, rateLimited(), RunStatus, safeError(), SyncStep (+36 more)

### Community 1 - "Workspace Repository (Postgres)"
Cohesion: 0.06
Nodes (18): AuditEvent, BidDraft, PipelineStatus, KnowledgeChunk, KnowledgeProvider, BidOutcome, camel(), camelKey() (+10 more)

### Community 2 - "OfficeShell.tsx"
Cohesion: 0.07
Nodes (44): AuditEvent, Autopilot, BusinessSyncStatus, BrowserBiddingStatus, OperationsData, kanbanQuery, activityTitle(), BOARD_ACCENTS (+36 more)

### Community 3 - "adapter-hermes/src/index.ts"
Cohesion: 0.13
Nodes (14): hermesKanbanRunner, allowedEnvironment(), detectProposalLanguage(), extractFinalText(), HermesCliDraftingAdapter, HermesDraftingError, normalizeOutput(), ProcessOptions (+6 more)

### Community 4 - "App.tsx"
Cohesion: 0.16
Nodes (27): ClientProject, Inbox, Work, deadlineLabel(), formatDate(), PIPELINE_STAGES, ActivityRows(), EmptyState() (+19 more)

### Community 5 - "server/package.json"
Cohesion: 0.09
Nodes (21): devDependencies, tsx, @types/qrcode, @fvh/application, @fvh/contracts, @fvh/domain, @fvh/knowledge, zod (+13 more)

### Community 6 - "contracts/src/index.ts"
Cohesion: 0.11
Nodes (20): policyController(), PROJECTS_CO_ID_AUTO_REASON, registerPolicyRoutes(), projectParams, registerProjectsCoIdRoutes(), activatePolicySchema, currencyCode, hermesKanbanTaskSchema (+12 more)

### Community 7 - "Domain Scoring & Policy Engine"
Cohesion: 0.14
Nodes (19): decideBid(), CODING_KEYWORDS, matchesProjectKeyword(), normalizeKeywords(), selectSearchTerms(), decision(), evaluatePolicy(), PolicyInput (+11 more)

### Community 8 - "app.ts"
Cohesion: 0.14
Nodes (17): AppOptions, createApp(), isSameOrigin(), linkedinController(), allowedDevOrigins, registerAutopilotRoutes(), modeSchema, registerBrowserBiddingRoutes() (+9 more)

### Community 9 - "projects-co-id.test.ts"
Cohesion: 0.16
Nodes (14): ProjectsCoIdPage, BrowserBidError, mentionedRupiahAmounts(), parseProjectsCoIdProject(), PROJECTS_CO_ID_PROPOSAL_LIMIT, ProjectsCoIdListing, ProjectsCoIdObservation, projectsCoIdPath() (+6 more)

### Community 10 - "Root Tooling & Lint"
Cohesion: 0.06
Nodes (33): devDependencies, eslint, @eslint/js, globals, @types/node, typescript, typescript-eslint, vitest (+25 more)

### Community 11 - "3D Office Scene"
Cohesion: 0.15
Nodes (33): Agent(), B(), Beanbag(), Board(), BoardContent, boardTexture(), Building(), CameraCommand (+25 more)

### Community 12 - "dependencies"
Cohesion: 0.12
Nodes (16): dependencies, fastify, @fastify/static, @fvh/adapter-freelancer, @fvh/adapter-github, @fvh/adapter-hermes, @fvh/application, @fvh/contracts (+8 more)

### Community 13 - "Web Dependencies"
Cohesion: 0.06
Nodes (30): dependencies, @fvh/domain, react, react-dom, react-router, @react-three/fiber, @tanstack/react-query, three (+22 more)

### Community 14 - "Owner Movement & Desks"
Cohesion: 0.12
Nodes (27): OwnerCharacter(), BROWSER_DESK, LEAD_DESK, LIFT, liftDoorReached(), MANAGER_DESK, OWNER_SPOT, P2 (+19 more)

### Community 15 - "projects.co.id Worker"
Cohesion: 0.16
Nodes (5): ProjectsCoIdStatus, ProjectsCoIdService, projectsCoIdSearchTerms(), ProjectsCoIdSettings, parseJson()

### Community 16 - "Live Events (SSE) Server"
Cohesion: 0.18
Nodes (11): announceWrites(), Listener, LiveEvents, READ_ONLY_POSTS, ROUTE_TOPICS, routeTopics(), sample(), TABLE_TOPICS (+3 more)

### Community 17 - "Health & Capabilities Controllers"
Cohesion: 0.27
Nodes (10): capabilitiesController(), lastFailureNote(), settingsController(), FreelancerProductionWriteCheck, FreelancerSandboxWriteCheck, linkedinVerification(), registerCapabilitiesRoutes(), registerSettingsRoutes() (+2 more)

### Community 18 - "Freelancer Autopilot"
Cohesion: 0.08
Nodes (14): AutopilotDependencies, AutopilotStatus, chooseBid(), FreelancerAutopilot, matchedProfileJobs(), mentionedAmounts(), proposalFor(), rateLimited() (+6 more)

### Community 19 - "DPAPI Integration Vault"
Cohesion: 0.38
Nodes (5): IntegrationVault, VaultKey, MemoryVault, fixture, MemoryVault

### Community 20 - "Server Assembly (index.ts)"
Cohesion: 0.08
Nodes (37): LinkedInEnvironmentCredentials, parseLinkedInEnvironment(), readLinkedInEnvironment(), autopilot, browserBidding, businessSync, chrome, createFreelancerReader() (+29 more)

### Community 22 - "Office Floor Layout"
Cohesion: 0.11
Nodes (20): BACK_BOARDS, BOARD_SIZE, BoardId, BOARDS, BoardSlot, BREAK_SLOTS, corridorZ(), FLOOR (+12 more)

### Community 23 - "private.mjs"
Cohesion: 0.20
Nodes (14): hermesLine(), killTree(), logFile, pidFile, pidsOnPorts(), pnpm(), portOpen(), ports (+6 more)

### Community 24 - "Opportunities & Pipeline UI"
Cohesion: 0.20
Nodes (27): BidDraft, Opportunity, App(), formatMoney(), matchesSource(), opportunitySource(), projectLink(), SOURCE_OPTIONS (+19 more)

### Community 25 - "projects.co.id Page"
Cohesion: 0.13
Nodes (17): ProjectsCoIdEntry, date(), daysUntil(), fieldLabel, modeLabels, ProjectEntry(), ProjectsCoIdPage(), rupiah() (+9 more)

### Community 26 - "persistence/src/index.ts"
Cohesion: 0.23
Nodes (6): fixedNow, assignees, list, insertTestOpportunity(), testOpportunity, FixtureDraftingAdapter

### Community 27 - "vitest"
Cohesion: 0.22
Nodes (5): isTabletShortcut(), tab, transitionPipeline(), transitions, vitest

### Community 28 - "E2E & Browser Verify Scripts"
Cohesion: 0.08
Nodes (19): { chromium }, ROUTES, address, { chromium }, identity, input, require, server (+11 more)

### Community 29 - "controllers/freelancer.ts"
Cohesion: 0.20
Nodes (9): freelancerController(), freelancerProductionWriteSchema, freelancerSandboxWriteSchema, freelancerSyncSchema, readProductionWriteChecks(), safeFreelancerIdSchema, registerFreelancerRoutes(), FreelancerSandboxWriteInput (+1 more)

### Community 30 - "Card Remodel Verifier"
Cohesion: 0.14
Nodes (17): allRoutes, apiReads, assertFits(), assertFocusTrap(), base, blockedWrites, check(), checkOfficePanels() (+9 more)

### Community 31 - "domain/src/index.ts"
Cohesion: 0.06
Nodes (40): registerOperationsRoutes(), CalendarMap, Client, Event, Token, Calendar, JobSignal, Messenger (+32 more)

### Community 32 - "services/hermes-kanban.ts"
Cohesion: 0.24
Nodes (9): HermesKanbanDetail, HermesKanbanStatus, HermesKanbanTask, epoch(), HERMES_BOARD, HermesKanban, taskRow, text() (+1 more)

### Community 33 - "GitHub Env & Schema Migration"
Cohesion: 0.10
Nodes (15): defaults, DraftingEnvironment, parseDraftingEnvironment(), readDraftingEnvironment(), FreelancerEnvironment, parseFreelancerEnvironment(), readFreelancerEnvironment(), GitHubEnvironment (+7 more)

### Community 34 - "LinkedIn OAuth"
Cohesion: 0.22
Nodes (11): LinkedInClientCredentials, buildLinkedInAuthorizationUrl(), completeLinkedInAuthorization(), isLoopback(), LinkedInCallbackResult, LinkedInOAuthOptions, LinkedInOAuthService, PendingFlow (+3 more)

### Community 35 - "hermes-team.ts"
Cohesion: 0.22
Nodes (8): description(), employees, FOCUS, missing, profileName(), REPO, soul(), TECH

### Community 36 - "Telegram Project Feed"
Cohesion: 0.10
Nodes (17): ENTITIES, parseTelegramChannel(), plain(), PROJECTS_CO_ID_TELEGRAM_URL, ProjectsCoIdTelegram, readCapped(), TelegramProjectPost, TelegramReadError (+9 more)

### Community 37 - "vitest"
Cohesion: 0.15
Nodes (14): CARD_QUERIES, CardDataKind, CardDataSummary, DataState, isCardQuery(), summarizeCardData(), connectLive(), LIVE_STATE_LABELS (+6 more)

### Community 38 - "Product Principles (Docs)"
Cohesion: 0.16
Nodes (10): Freelancer Virtual House / Mission Control, fresh() helper (drop stale data on isError), OfficeShell, VisualOffice 3D scene, Web entry HTML (root div + main.tsx), antislop Delivery Gate, Camera-relative movement, Owner character movement and collisions (+2 more)

### Community 39 - "controllers/hermes-kanban.ts"
Cohesion: 0.29
Nodes (7): applicationSnapshot(), hermesKanbanController(), idParams, Json, money(), registerHermesKanbanRoutes(), CODE_PROFILES

### Community 40 - "Hermes Adapter Package"
Cohesion: 0.13
Nodes (14): dependencies, @fvh/application, @fvh/contracts, zod, exports, @fvh/application, @fvh/contracts, zod (+6 more)

### Community 41 - "services/browser-bidding.ts"
Cohesion: 0.23
Nodes (11): FreelancerBrowserPage, BrowserBidInput, BrowserObservation, confirmedBrowserBid(), isBidEndpoint(), matchesBrowserBid(), readRemainingBids(), record() (+3 more)

### Community 42 - "HermesKanbanCard.tsx"
Cohesion: 0.38
Nodes (9): COLUMNS, employee(), HermesKanbanCard(), submit(), STATUS, TaskCard(), TaskResult(), time() (+1 more)

### Community 43 - "services/browser-bidding.ts"
Cohesion: 0.11
Nodes (15): projectsCoId, BrowserBidMode, BrowserBidStatus, BrowserIdentity, BrowserBiddingService, canFallbackToBrowser(), connectExistingChrome(), openWorkerTab() (+7 more)

### Community 44 - "Calendar Page"
Cohesion: 0.23
Nodes (15): useClock(), AGENDA_LABELS, AgendaSummary, calendarDateLabel(), CalendarEvent, calendarMonthCells(), CalendarPage(), CalendarView (+7 more)

### Community 45 - "Application Package"
Cohesion: 0.14
Nodes (13): dependencies, @fvh/contracts, @fvh/domain, @fvh/knowledge, exports, @fvh/contracts, @fvh/domain, @fvh/knowledge (+5 more)

### Community 46 - "persistence/package.json"
Cohesion: 0.10
Nodes (19): dependencies, @fvh/domain, @fvh/knowledge, pg, devDependencies, @electric-sql/pglite, @types/pg, exports (+11 more)

### Community 47 - "api.ts"
Cohesion: 0.14
Nodes (15): CommunicationInput, NewClientProject, normalizeWhatsAppPhone(), saveClientCommunication(), input, project, ClientWhatsAppCard(), save() (+7 more)

### Community 48 - "Browser Bid & Floor-2 Docs"
Cohesion: 0.17
Nodes (9): browser-bid-page.ts DOM driver and request gate, verify-browser-bidding.ts fixture script, Google Calendar OAuth (PKCE, calendar.events.owned), integration-vault.ps1 (DPAPI vault), operation_outbox / operation_documents tables, OperationsService (60 s cycle), WhatsApp via Baileys 7.0.0-rc14, allowBuilds (Baileys / protobufjs scripts blocked) (+1 more)

### Community 49 - "Bidding Modes & Chrome CDP (Docs)"
Cohesion: 0.21
Nodes (10): Policy engine (evaluatePolicy), Bidding modes (API / fallback on 401-403-429 / browser), Browser bid worker (Operator Browser Bid), SharedChromeSession, Coding keyword catalog (182 terms), Policy versioning with HTTP 409 optimistic update, parseProjectsCoIdHref, projectsCoIdSettings (policy JSON) (+2 more)

### Community 50 - "owner-input.ts"
Cohesion: 0.27
Nodes (8): bindOwnerKeyboard(), createOwnerInput(), DIRECTIONS, OwnerDirection, OwnerInput, OwnerMoveInput, ownsKeyboard(), setup()

### Community 51 - "AppContext"
Cohesion: 0.39
Nodes (5): healthController(), inboxController(), AppContext, registerHealthRoutes(), registerInboxRoutes()

### Community 52 - "Contracts Package"
Cohesion: 0.17
Nodes (11): dependencies, @fvh/domain, zod, exports, @fvh/domain, zod, name, private (+3 more)

### Community 53 - "database.ts"
Cohesion: 0.16
Nodes (9): repositoryWithBid(), setup(), createDatabase(), Database, memory(), migrate(), postgres(), Queryable (+1 more)

### Community 54 - "api"
Cohesion: 0.12
Nodes (23): api(), ApiError, Capabilities, DashboardResponse, FreelancerProductionWriteInput, FreelancerSandboxWriteInput, Insights, jsonRequest() (+15 more)

### Community 56 - "Freelancer Adapter Package"
Cohesion: 0.18
Nodes (10): dependencies, @fvh/domain, exports, @fvh/domain, name, private, scripts, test (+2 more)

### Community 57 - "GitHub Adapter Package"
Cohesion: 0.18
Nodes (10): dependencies, @fvh/knowledge, exports, @fvh/knowledge, name, private, scripts, test (+2 more)

### Community 58 - "knowledge/src/index.ts"
Cohesion: 0.10
Nodes (18): knowledgeController(), LinkedInApiProfile, profileSchema, readLinkedInProfile(), syncLinkedInProfile(), Fetcher, GitHubFile, GitHubReadAdapter (+10 more)

### Community 59 - "Base TS Config"
Cohesion: 0.18
Nodes (10): compilerOptions, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, module, moduleResolution, noUncheckedIndexedAccess, resolveJsonModule, skipLibCheck (+2 more)

### Community 60 - "Security & Hermes Consent (Docs)"
Cohesion: 0.22
Nodes (7): Credential store (Windows DPAPI), HermesCliDraftingAdapter, FVH_AI_DATA_CONSENT, Hermes cron "FVH review", Untrusted brief/repo injection protection, Threat model, Optional sources configuration (Freelancer, GitHub, LinkedIn, Hermes)

### Community 61 - "Server TS Config"
Cohesion: 0.20
Nodes (9): compilerOptions, outDir, rootDir, sourceMap, types, exclude, extends, include (+1 more)

### Community 62 - "controllers/work.ts"
Cohesion: 0.33
Nodes (7): dayDiff(), workController(), registerWorkRoutes(), localDateKey(), createClientProjectSchema, createPaymentSchema, updateClientProjectSchema

### Community 63 - "migrate-sqlite-to-supabase.mjs"
Cohesion: 0.20
Nodes (8): backup, backupDir, envPath, root, source, sqlitePath, TABLES, url

### Community 64 - "Autopilot Decisions (Docs)"
Cohesion: 0.25
Nodes (4): FreelancerAutopilot, Kill switch (Jeda automasi), publicPortfolio resolver (public GitHub repos only), Policy-bounded autonomous bidding (README)

### Community 65 - "controllers/activity.ts"
Cohesion: 0.53
Nodes (4): activityController(), agendaCategory(), agendaSchema, registerActivityRoutes()

### Community 66 - "Web TS Config"
Cohesion: 0.22
Nodes (8): compilerOptions, jsx, lib, noEmit, types, extends, include, ../../tsconfig.base.json

### Community 67 - "Audit & Bid Data Model (Docs)"
Cohesion: 0.25
Nodes (7): audit_events table (Live Activity source), bid_results table, BusinessSync (read-only outcomes and messages), legacy_bid_outcomes table, Pipeline status lifecycle, ProjectsCoIdService, Owner-marked sent / won flow

### Community 68 - "Agent Roster & Hermes Team (Docs)"
Cohesion: 0.29
Nodes (7): deriveOfficeAgents (agent status rules), Hermes kanban board fvh-house, Lead Agent (Hermes), Floor managers reporting to Lead, scripts/hermes-team.ts (fvh-* employee profiles), Kanban card app-data snapshot (includeData), Universal Lead Agent persona

### Community 69 - "Capability Matrix (Docs)"
Cohesion: 0.32
Nodes (7): BID_LIMIT_EXCEEDED account quota, Capability matrix, Freelancer edit_profile capability, freelancer-sdk-python (official SDK), Freelancer sandbox write checks, Freelancer send_message capability (unknown), Freelancer submit_bid capability

### Community 70 - "Domain Package"
Cohesion: 0.25
Nodes (7): exports, name, private, scripts, test, typecheck, type

### Community 71 - "Knowledge Package"
Cohesion: 0.25
Nodes (7): exports, name, private, scripts, test, typecheck, type

### Community 72 - "Data Platform Decisions (Docs)"
Cohesion: 0.29
Nodes (6): Supabase Postgres schema fvh, GitHub Knowledge Hub sync (blobs, atomic replace), LinkedIn /userinfo OIDC sync, Postgres ssl.rejectUnauthorized=false finding, announceWrites (table to topic), LIVE_TOPICS / TOPIC_QUERY_KEYS

### Community 73 - "application/src/index.ts"
Cohesion: 0.22
Nodes (11): githubSyncSchema, SyncJob, draftUpdateSchema, projectsController(), paramsSchema, registerProjectsRoutes(), assessProject(), createId() (+3 more)

### Community 74 - "whatsapp-status.ts"
Cohesion: 0.36
Nodes (6): checkWhatsAppStatus(), states, WhatsAppCheck, WhatsAppSession, whatsappStateLabels, WhatsAppStatus()

### Community 76 - "Freelancer Adapter TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, types, extends, include, ../../tsconfig.base.json

### Community 77 - "GitHub Adapter TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, types, extends, include, ../../tsconfig.base.json

### Community 78 - "Hermes Adapter TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, types, extends, include, ../../tsconfig.base.json

### Community 79 - "Application TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, types, extends, include, ../../tsconfig.base.json

### Community 80 - "Contracts TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, types, extends, include, ../../tsconfig.base.json

### Community 81 - "Domain TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, types, extends, include, ../../tsconfig.base.json

### Community 82 - "Knowledge TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, types, extends, include, ../../tsconfig.base.json

### Community 83 - "Persistence TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, types, extends, include, ../../tsconfig.base.json

### Community 84 - "src/projects-co-id.ts"
Cohesion: 0.33
Nodes (6): chooseProjectsCoIdBid(), containsTerm(), PROJECTS_CO_ID_FIELDS, projectsCoIdDraftPolicy(), projectsCoIdFieldsOf(), projectsCoIdSettings()

### Community 86 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, start, test, test:smoke, typecheck

### Community 87 - "parseBody"
Cohesion: 0.53
Nodes (4): profileController(), parseBody(), registerProfileRoutes(), updateProfileSchema

## Ambiguous Edges - Review These
- `VisualOffice 3D scene` → `Design direction (chalk/ink, pine, copper)`  [AMBIGUOUS]
  DESIGN.md · relation: conceptually_related_to
- `Policy-bounded autonomous bidding (README)` → `Hermes proposal guard and template fallback`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Owner decision: fully automatic bidding` → `No marketplace write (MVP boundary)`  [AMBIGUOUS]
  docs/threat-model.md · relation: conceptually_related_to

## Knowledge Gaps
- **60 isolated node(s):** `eslint`, `@types/node`, `typescript`, `@fvh/domain`, `@types/react` (+55 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 621 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `Freelancer Adapter & BusinessSync`, `OfficeShell.tsx`, `adapter-hermes/src/index.ts`, `App.tsx`, `Domain Scoring & Policy Engine`, `app.ts`, `projects-co-id.test.ts`, `Root Tooling & Lint`, `Owner Movement & Desks`, `Live Events (SSE) Server`, `Freelancer Autopilot`, `DPAPI Integration Vault`, `Server Assembly (index.ts)`, `Office Floor Layout`, `projects.co.id Page`, `persistence/src/index.ts`, `domain/src/index.ts`, `GitHub Env & Schema Migration`, `LinkedIn OAuth`, `Telegram Project Feed`, `vitest`, `services/browser-bidding.ts`, `services/browser-bidding.ts`, `api.ts`, `owner-input.ts`, `database.ts`, `knowledge/src/index.ts`, `whatsapp-status.ts`, `portfolio.ts`?**
  _High betweenness centrality (0.094) - this node is a cross-community bridge._
- **What connects `eslint`, `@types/node`, `typescript` to the rest of the system?**
  _60 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Freelancer Adapter & BusinessSync` be split into smaller, more focused modules?**
  _Cohesion score 0.05909351692484223 - nodes in this community are weakly interconnected._
- **Why does `WorkspaceRepository` connect `Workspace Repository (Postgres)` to `Freelancer Adapter & BusinessSync`, `knowledge/src/index.ts`, `Telegram Project Feed`, `Domain Scoring & Policy Engine`, `app.ts`, `projects-co-id.test.ts`, `services/browser-bidding.ts`, `projects.co.id Worker`, `Health & Capabilities Controllers`, `Freelancer Autopilot`, `DPAPI Integration Vault`, `Server Assembly (index.ts)`, `database.ts`, `src/projects-co-id.ts`, `persistence/src/index.ts`, `E2E & Browser Verify Scripts`, `controllers/freelancer.ts`, `domain/src/index.ts`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Should `Workspace Repository (Postgres)` be split into smaller, more focused modules?**
  _Cohesion score 0.055299539170506916 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `VisualOffice 3D scene` and `Design direction (chalk/ink, pine, copper)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Policy-bounded autonomous bidding (README)` and `Hermes proposal guard and template fallback`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._