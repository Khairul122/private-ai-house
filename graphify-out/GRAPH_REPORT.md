# Graph Report - private-ai-house  (2026-10-22)

## Corpus Check
- 245 files · ~143,283 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .example 1, .css 1)

## Summary
- 1884 nodes · 4605 edges · 106 communities (97 shown, 9 thin omitted)
- Extraction: 96% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 159 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fb54ab14`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- adapter-freelancer/src/index.ts
- WorkspaceRepository
- OfficeShell.tsx
- adapter-hermes/src/index.ts
- App.tsx
- server/package.json
- contracts/src/index.ts
- Domain Scoring & Policy Engine
- OfficeAgent.tsx
- services/projects-co-id.ts
- Root Tooling & Lint
- 3D Office Scene
- dependencies
- Web Dependencies
- Owner Movement & Desks
- projects.co.id Worker
- Live Events (SSE) Server
- controllers/freelancer.ts
- Freelancer Autopilot
- DPAPI Integration Vault
- Server Assembly (index.ts)
- Google Calendar & WhatsApp
- Office Floor Layout
- private.mjs
- Opportunities & Pipeline UI
- projects.co.id Page
- persistence/src/index.ts
- ui.tsx
- verify-projects-co-id.ts
- app.ts
- Card Remodel Verifier
- routes/operations.ts
- services/hermes-kanban.ts
- services/browser-bidding.ts
- Audit Projek
- knowledge/src/index.ts
- Telegram Project Feed
- CardDataStatus.tsx
- Product Principles (Docs)
- GitHubReadAdapter
- Hermes Adapter Package
- services/browser-bidding.ts
- verify-office-learning.mjs
- services/browser-bidding.ts
- Calendar Page
- Application Package
- persistence/package.json
- api
- Browser Bid & Floor-2 Docs
- Bidding Modes & Chrome CDP (Docs)
- owner-input.ts
- shared.ts
- Contracts Package
- database.ts
- api.ts
- P1 — Data consistency dan reliability
- Freelancer Adapter Package
- GitHub Adapter Package
- linkedin-oauth.ts
- Base TS Config
- Security & Hermes Consent (Docs)
- Server TS Config
- repository.ts
- ref_node_path
- Autopilot Decisions (Docs)
- credential-store.ts
- Web TS Config
- Audit & Bid Data Model (Docs)
- Agent Roster & Hermes Team (Docs)
- Capability Matrix (Docs)
- Domain Package
- Knowledge Package
- Data Platform Decisions (Docs)
- controllers/knowledge.ts
- types.ts
- projects.co.id Page Budget
- Freelancer Adapter TS Config
- GitHub Adapter TS Config
- Hermes Adapter TS Config
- Application TS Config
- Contracts TS Config
- Domain TS Config
- Knowledge TS Config
- Persistence TS Config
- BrowserBidError
- WhatsAppService
- scripts
- parseJson
- OfficeEnvironment.tsx
- OfficeObjects.tsx
- Private Start Supervisor
- drafting.ts
- verify-browser-bidding.ts
- AppContext
- domain/src/index.ts
- ai-env.ts
- freelancer-env.ts
- linkedin-env.ts
- google-calendar.ts
- portfolio.ts
- live.ts
- P2 — Performance, UX, dan operasional
- whatsapp-status.ts
- vitest

## God Nodes (most connected - your core abstractions)
1. `WorkspaceRepository` - 86 edges
2. `vitest` - 57 edges
3. `api()` - 49 edges
4. `ProjectsCoIdService` - 36 edges
5. `createApp()` - 35 edges
6. `fastify` - 34 edges
7. `ErrorNotice()` - 33 edges
8. `LoadingPanel()` - 32 edges
9. `jsonRequest()` - 31 edges
10. `PageIntro()` - 31 edges

## Surprising Connections (you probably didn't know these)
- `Ringkasan` --references--> `WorkspaceRepository`  [INFERRED]
  docs/project-audit.md → packages/persistence/src/repository.ts
- `Verifikasi` --references--> `VisualOffice()`  [INFERRED]
  docs/project-audit.md → apps/web/src/office/VisualOffice.tsx
- `Persistence` --references--> `WorkspaceRepository`  [INFERRED]
  docs/project-audit.md → packages/persistence/src/repository.ts
- `Capability matrix` --semantically_similar_to--> `Data honesty rule (no simulated data in UI)`  [INFERRED] [semantically similar]
  docs/capability-matrix.md → AGENTS.md
- `integration-vault.ps1 (DPAPI vault)` --semantically_similar_to--> `Credential store (Windows DPAPI)`  [INFERRED] [semantically similar]
  docs/floor-two-operations.md → AGENTS.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Autopilot bid submission flow** — agents_freelancerautopilot, agents_policy_engine, agents_hermescliddraftingadapter, agents_proposal_fallback_guard, agents_audit_events, agents_bid_results, docs_browser_bidding_submit_success_proof [EXTRACTED 1.00]
- **Realtime change propagation (DB write to card refresh)** — docs_realtime_announcewrites, docs_realtime_live_topics, docs_realtime_sse_events, agents_officeshell, docs_realtime_carddatastatus [EXTRACTED 1.00]
- **Workers sharing owner Chrome via CDP** — docs_browser_bidding_sharedchromesession, docs_browser_bidding_connect_over_cdp, docs_browser_bidding_browser_bid_worker, docs_projects_co_id_scout_worker [EXTRACTED 1.00]

## Communities (106 total, 9 thin omitted)

### Community 0 - "adapter-freelancer/src/index.ts"
Cohesion: 0.06
Nodes (46): BackoffJob, BusinessSync, BusinessSyncStatus, Dependencies, rateLimited(), RunStatus, safeError(), SyncStep (+38 more)

### Community 1 - "WorkspaceRepository"
Cohesion: 0.08
Nodes (5): KnowledgeChunk, KnowledgeProvider, camel(), camelKey(), WorkspaceRepository

### Community 2 - "OfficeShell.tsx"
Cohesion: 0.07
Nodes (44): BusinessSyncStatus, Capabilities, Payment, BrowserBiddingStatus, OperationsData, OperationSignal, kanbanQuery, officeLearningQuery (+36 more)

### Community 3 - "adapter-hermes/src/index.ts"
Cohesion: 0.06
Nodes (30): OfficeLearningMemory, OfficeLearningSession, OfficeLearningStatus, day(), Employee, nextDay(), OfficeLearningService, sessionSchema (+22 more)

### Community 4 - "App.tsx"
Cohesion: 0.18
Nodes (13): App(), Metric(), queryClient, AgentsPage(), emptyReply(), InboxPage(), syncLine(), SyncState (+5 more)

### Community 5 - "server/package.json"
Cohesion: 0.09
Nodes (21): devDependencies, tsx, @types/qrcode, @fvh/application, @fvh/contracts, @fvh/domain, @fvh/knowledge, zod (+13 more)

### Community 6 - "contracts/src/index.ts"
Cohesion: 0.10
Nodes (20): dayDiff(), workController(), projectParams, registerProjectsCoIdRoutes(), registerWorkRoutes(), localDateKey(), createClientProjectSchema, createPaymentSchema (+12 more)

### Community 7 - "Domain Scoring & Policy Engine"
Cohesion: 0.21
Nodes (13): decideBid(), CODING_KEYWORD_GROUPS, CODING_KEYWORDS, matchesProjectKeyword(), normalizeKeywords(), selectSearchTerms(), decision(), evaluatePolicy() (+5 more)

### Community 8 - "OfficeAgent.tsx"
Cohesion: 0.15
Nodes (23): Box(), HAIR, Label(), nearbyIdlePeer(), OfficeAgent(), Props, shortestAngle(), SKIN (+15 more)

### Community 9 - "services/projects-co-id.ts"
Cohesion: 0.13
Nodes (16): mentionedRupiahAmounts(), parseProjectsCoIdProject(), PROJECTS_CO_ID_AUTO_REASON, PROJECTS_CO_ID_ORIGIN, PROJECTS_CO_ID_PROPOSAL_LIMIT, ProjectsCoIdListing, projectsCoIdPath(), readRupiahBudget() (+8 more)

### Community 10 - "Root Tooling & Lint"
Cohesion: 0.06
Nodes (33): devDependencies, eslint, @eslint/js, globals, @types/node, typescript, typescript-eslint, vitest (+25 more)

### Community 11 - "3D Office Scene"
Cohesion: 0.16
Nodes (31): spokenOfficeTurn(), B(), Beanbag(), Board(), BoardContent, boardTexture(), Building(), CameraCommand (+23 more)

### Community 12 - "dependencies"
Cohesion: 0.12
Nodes (16): dependencies, fastify, @fastify/static, @fvh/adapter-freelancer, @fvh/adapter-github, @fvh/adapter-hermes, @fvh/application, @fvh/contracts (+8 more)

### Community 13 - "Web Dependencies"
Cohesion: 0.07
Nodes (29): dependencies, @fvh/domain, react, react-dom, react-router, @react-three/fiber, @tanstack/react-query, three (+21 more)

### Community 14 - "Owner Movement & Desks"
Cohesion: 0.13
Nodes (23): OwnerCharacter(), BROWSER_DESK, LEAD_DESK, LIFT, liftDoorReached(), MANAGER_DESK, OWNER_SPOT, PODS (+15 more)

### Community 15 - "projects.co.id Worker"
Cohesion: 0.20
Nodes (3): ProjectsCoIdStatus, ProjectsCoIdService, projectsCoIdSearchTerms()

### Community 16 - "Live Events (SSE) Server"
Cohesion: 0.13
Nodes (13): announceWrites(), Listener, LiveEvents, READ_ONLY_POSTS, ROUTE_TOPICS, routeTopics(), sample(), TABLE_TOPICS (+5 more)

### Community 17 - "controllers/freelancer.ts"
Cohesion: 0.28
Nodes (7): freelancerController(), freelancerSandboxWriteSchema, freelancerSyncSchema, readProductionWriteChecks(), safeFreelancerIdSchema, registerFreelancerRoutes(), FreelancerSandboxWriteInput

### Community 18 - "Freelancer Autopilot"
Cohesion: 0.09
Nodes (14): AutopilotDependencies, AutopilotStatus, chooseBid(), FreelancerAutopilot, matchedProfileJobs(), mentionedAmounts(), proposalFor(), rateLimited() (+6 more)

### Community 19 - "DPAPI Integration Vault"
Cohesion: 0.33
Nodes (5): IntegrationVault, VaultKey, MemoryVault, fixture, MemoryVault

### Community 20 - "Server Assembly (index.ts)"
Cohesion: 0.07
Nodes (23): autopilot, browserBidding, businessSync, chrome, createFreelancerReader(), credentialScriptPath, credentialStorePath, databaseUrl (+15 more)

### Community 22 - "Office Floor Layout"
Cohesion: 0.10
Nodes (23): BACK_BOARDS, BOARD_SIZE, BOARDS, BoardSlot, BREAK_SLOTS, corridorZ(), FLOOR, LEAD_ID (+15 more)

### Community 23 - "private.mjs"
Cohesion: 0.20
Nodes (14): hermesLine(), killTree(), logFile, pidFile, pidsOnPorts(), pnpm(), portOpen(), ports (+6 more)

### Community 24 - "Opportunities & Pipeline UI"
Cohesion: 0.22
Nodes (26): BidDraft, Opportunity, deadlineLabel(), formatMoney(), PIPELINE_STAGES, matchesSource(), opportunitySource(), projectLink() (+18 more)

### Community 25 - "projects.co.id Page"
Cohesion: 0.13
Nodes (17): ProjectsCoIdEntry, date(), daysUntil(), fieldLabel, modeLabels, ProjectEntry(), ProjectsCoIdPage(), rupiah() (+9 more)

### Community 26 - "persistence/src/index.ts"
Cohesion: 0.23
Nodes (6): fixedNow, hermesKanbanRunner, assignees, list, insertTestOpportunity(), testOpportunity

### Community 27 - "ui.tsx"
Cohesion: 0.31
Nodes (17): AuditEvent, Autopilot, formatDate(), ActivityRows(), EmptyState(), ErrorNotice(), OperationStatus(), StateLabel() (+9 more)

### Community 28 - "verify-projects-co-id.ts"
Cohesion: 0.16
Nodes (14): connectExistingChrome(), openWorkerTab(), account(), address, { chromium }, content(), description, ids (+6 more)

### Community 29 - "app.ts"
Cohesion: 0.17
Nodes (14): createApp(), isSameOrigin(), linkedinController(), officeLearningController(), allowedDevOrigins, registerAutopilotRoutes(), modeSchema, registerBrowserBiddingRoutes() (+6 more)

### Community 30 - "Card Remodel Verifier"
Cohesion: 0.12
Nodes (23): allRoutes, apiReads, assertFits(), assertFocusTrap(), base, blockedWrites, check(), checkHermesMemory() (+15 more)

### Community 31 - "routes/operations.ts"
Cohesion: 0.07
Nodes (33): Calendar, JobSignal, Messenger, OperationsService, paymentReminder(), dp, invoice, project (+25 more)

### Community 32 - "services/hermes-kanban.ts"
Cohesion: 0.08
Nodes (33): applicationSnapshot(), hermesKanbanController(), idParams, Json, money(), HermesKanbanDetail, HermesKanbanStatus, HermesKanbanTask (+25 more)

### Community 33 - "services/browser-bidding.ts"
Cohesion: 0.17
Nodes (7): directories, BrowserBidConnection, SharedChromeSession, fixture, input, FreelancerWriteError, playwright-core

### Community 34 - "Audit Projek"
Cohesion: 0.10
Nodes (17): Arsitektur, Audit Projek, Domain, Final assessment, Frontend, P3 — Maintainability, Persistence, Ringkasan (+9 more)

### Community 35 - "knowledge/src/index.ts"
Cohesion: 0.17
Nodes (11): LinkedInApiProfile, profileSchema, readLinkedInProfile(), syncLinkedInProfile(), blockedExtensions, blockedPathParts, KnowledgeFileInput, KnowledgeResult (+3 more)

### Community 36 - "Telegram Project Feed"
Cohesion: 0.18
Nodes (9): ENTITIES, parseTelegramChannel(), plain(), PROJECTS_CO_ID_TELEGRAM_URL, ProjectsCoIdTelegram, readCapped(), TelegramProjectPost, TelegramReadError (+1 more)

### Community 37 - "CardDataStatus.tsx"
Cohesion: 0.30
Nodes (8): CARD_QUERIES, CardDataKind, CardDataSummary, DataState, isCardQuery(), summarizeCardData(), CardDataStatus(), render()

### Community 38 - "Product Principles (Docs)"
Cohesion: 0.16
Nodes (10): Freelancer Virtual House / Mission Control, fresh() helper (drop stale data on isError), OfficeShell, VisualOffice 3D scene, Web entry HTML (root div + main.tsx), antislop Delivery Gate, Camera-relative movement, Owner character movement and collisions (+2 more)

### Community 39 - "GitHubReadAdapter"
Cohesion: 0.22
Nodes (6): Fetcher, GitHubFile, GitHubReadAdapter, GitHubReadError, GitHubReadResult, isEligibleKnowledgePath()

### Community 40 - "Hermes Adapter Package"
Cohesion: 0.13
Nodes (14): dependencies, @fvh/application, @fvh/contracts, zod, exports, @fvh/application, @fvh/contracts, zod (+6 more)

### Community 41 - "services/browser-bidding.ts"
Cohesion: 0.21
Nodes (12): FreelancerBrowserPage, BrowserBidError, BrowserBidInput, BrowserObservation, confirmedBrowserBid(), isBidEndpoint(), matchesBrowserBid(), readRemainingBids() (+4 more)

### Community 42 - "verify-office-learning.mjs"
Cohesion: 0.15
Nodes (10): base, { chromium }, close(), deadline, interceptedWrites, output, pageErrors, results (+2 more)

### Community 43 - "services/browser-bidding.ts"
Cohesion: 0.21
Nodes (6): BrowserBidMode, BrowserBidStatus, BrowserIdentity, BrowserBiddingService, canFallbackToBrowser(), FreelancerWriteResult

### Community 44 - "Calendar Page"
Cohesion: 0.23
Nodes (15): useClock(), AGENDA_LABELS, AgendaSummary, calendarDateLabel(), CalendarEvent, calendarMonthCells(), CalendarPage(), CalendarView (+7 more)

### Community 45 - "Application Package"
Cohesion: 0.14
Nodes (13): dependencies, @fvh/contracts, @fvh/domain, @fvh/knowledge, exports, @fvh/contracts, @fvh/domain, @fvh/knowledge (+5 more)

### Community 46 - "persistence/package.json"
Cohesion: 0.11
Nodes (17): dependencies, @fvh/domain, @fvh/knowledge, pg, devDependencies, @electric-sql/pglite, @types/pg, exports (+9 more)

### Community 47 - "api"
Cohesion: 0.17
Nodes (16): api(), jsonRequest(), BrowserBiddingCard(), action(), date(), labels, employeeName(), OfficeLearningCard() (+8 more)

### Community 48 - "Browser Bid & Floor-2 Docs"
Cohesion: 0.17
Nodes (9): browser-bid-page.ts DOM driver and request gate, verify-browser-bidding.ts fixture script, Google Calendar OAuth (PKCE, calendar.events.owned), integration-vault.ps1 (DPAPI vault), operation_outbox / operation_documents tables, OperationsService (60 s cycle), WhatsApp via Baileys 7.0.0-rc14, allowBuilds (Baileys / protobufjs scripts blocked) (+1 more)

### Community 49 - "Bidding Modes & Chrome CDP (Docs)"
Cohesion: 0.21
Nodes (10): Policy engine (evaluatePolicy), Bidding modes (API / fallback on 401-403-429 / browser), Browser bid worker (Operator Browser Bid), SharedChromeSession, Coding keyword catalog (182 terms), Policy versioning with HTTP 409 optimistic update, parseProjectsCoIdHref, projectsCoIdSettings (policy JSON) (+2 more)

### Community 50 - "owner-input.ts"
Cohesion: 0.27
Nodes (8): bindOwnerKeyboard(), createOwnerInput(), DIRECTIONS, OwnerDirection, OwnerInput, OwnerMoveInput, ownsKeyboard(), setup()

### Community 51 - "shared.ts"
Cohesion: 0.20
Nodes (13): AppOptions, capabilitiesController(), lastFailureNote(), settingsController(), FreelancerProductionWriteCheck, FreelancerSandboxWriteCheck, linkedinVerification(), CredentialStatus (+5 more)

### Community 52 - "Contracts Package"
Cohesion: 0.17
Nodes (11): dependencies, @fvh/domain, zod, exports, @fvh/domain, zod, name, private (+3 more)

### Community 53 - "database.ts"
Cohesion: 0.10
Nodes (18): repositoryWithBid(), setup(), createDatabase(), Database, memory(), migrate(), postgres(), Row (+10 more)

### Community 54 - "api.ts"
Cohesion: 0.10
Nodes (23): ApiError, ClientProject, DashboardResponse, FreelancerProductionWriteInput, FreelancerSandboxWriteInput, Inbox, Insights, PipelineItem (+15 more)

### Community 55 - "P1 — Data consistency dan reliability"
Cohesion: 0.12
Nodes (15): P0-1. Capability verification belum mengunci aktivasi policy, P0-2. Generic production-write bypass policy, P0-3. HTTP 200 tanpa `resultId` dianggap sukses, P0-4. PostgreSQL TLS certificate verification dimatikan, P0 — Wajib sebelum live marketplace, P1-1. Claim bid dapat terkunci permanen setelah crash, P1-2. Pipeline transition tidak ditegakkan di repository, P1-3. Manual draft dapat mengubah harga/durasi keluar policy (+7 more)

### Community 56 - "Freelancer Adapter Package"
Cohesion: 0.18
Nodes (10): dependencies, @fvh/domain, exports, @fvh/domain, name, private, scripts, test (+2 more)

### Community 57 - "GitHub Adapter Package"
Cohesion: 0.18
Nodes (10): dependencies, @fvh/knowledge, exports, @fvh/knowledge, name, private, scripts, test (+2 more)

### Community 58 - "linkedin-oauth.ts"
Cohesion: 0.22
Nodes (10): buildLinkedInAuthorizationUrl(), completeLinkedInAuthorization(), isLoopback(), LinkedInCallbackResult, LinkedInOAuthOptions, LinkedInOAuthService, PendingFlow, safeEqual() (+2 more)

### Community 59 - "Base TS Config"
Cohesion: 0.18
Nodes (10): compilerOptions, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, module, moduleResolution, noUncheckedIndexedAccess, resolveJsonModule, skipLibCheck (+2 more)

### Community 60 - "Security & Hermes Consent (Docs)"
Cohesion: 0.22
Nodes (7): Credential store (Windows DPAPI), HermesCliDraftingAdapter, FVH_AI_DATA_CONSENT, Hermes cron "FVH review", Untrusted brief/repo injection protection, Threat model, Optional sources configuration (Freelancer, GitHub, LinkedIn, Hermes)

### Community 61 - "Server TS Config"
Cohesion: 0.20
Nodes (9): compilerOptions, outDir, rootDir, sourceMap, types, exclude, extends, include (+1 more)

### Community 62 - "repository.ts"
Cohesion: 0.11
Nodes (10): BidOutcome, ClientProjectSource, ClientProjectStatus, ClientThread, initialPolicy(), initialProfile(), ServiceProfile, SkipReasonSummary (+2 more)

### Community 63 - "ref_node_path"
Cohesion: 0.18
Nodes (5): DpapiIntegrationVault, client, MARKERS, root, url

### Community 64 - "Autopilot Decisions (Docs)"
Cohesion: 0.25
Nodes (4): FreelancerAutopilot, Kill switch (Jeda automasi), publicPortfolio resolver (public GitHub repos only), Policy-bounded autonomous bidding (README)

### Community 65 - "credential-store.ts"
Cohesion: 0.33
Nodes (10): linkedinOAuth, deleteLinkedInAccessToken(), getFreelancerAccessToken(), getLinkedInAccessToken(), getLinkedInClientCredentials(), isDpapiCiphertext(), readCredentialStatus(), runCredentialAction() (+2 more)

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

### Community 73 - "controllers/knowledge.ts"
Cohesion: 0.14
Nodes (16): githubSyncSchema, knowledgeController(), SyncJob, policyController(), profileController(), paramsSchema, parseBody(), registerKnowledgeRoutes() (+8 more)

### Community 74 - "types.ts"
Cohesion: 0.16
Nodes (14): transitions, context, policy, project, containsTerm(), projectsCoIdDraftPolicy(), projectsCoIdFieldsOf(), projectsCoIdSettings() (+6 more)

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

### Community 86 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, start, test, test:smoke, typecheck

### Community 88 - "OfficeEnvironment.tsx"
Cohesion: 0.33
Nodes (10): Bookcase(), CeilingStructure(), OakFloor(), OfficeEnvironment(), OfficeEnvironmentProps, Phase, Slab(), V3 (+2 more)

### Community 89 - "OfficeObjects.tsx"
Cohesion: 0.43
Nodes (6): InteractiveObject(), labelTexture(), ObjectLabel(), OfficeObjects(), OfficeObjectsProps, BoardId

### Community 93 - "drafting.ts"
Cohesion: 0.24
Nodes (6): AiDraftingPort, DraftingInput, DraftingOutput, FixtureDraftingAdapter, ProfileFact, UnavailableDraftingAdapter

### Community 94 - "verify-browser-bidding.ts"
Cohesion: 0.11
Nodes (8): { chromium }, ROUTES, address, { chromium }, identity, input, require, server

### Community 95 - "AppContext"
Cohesion: 0.23
Nodes (9): activityController(), agendaCategory(), agendaSchema, healthController(), inboxController(), AppContext, registerActivityRoutes(), registerHealthRoutes() (+1 more)

### Community 96 - "domain/src/index.ts"
Cohesion: 0.28
Nodes (8): draftUpdateSchema, projectsController(), assessProject(), createId(), ScoreFactor, scoreProject(), project, ProjectOpportunity

### Community 97 - "ai-env.ts"
Cohesion: 0.47
Nodes (4): defaults, DraftingEnvironment, parseDraftingEnvironment(), readDraftingEnvironment()

### Community 98 - "freelancer-env.ts"
Cohesion: 0.27
Nodes (6): FreelancerEnvironment, parseFreelancerEnvironment(), readFreelancerEnvironment(), GitHubEnvironment, parseGitHubEnvironment(), readGitHubEnvironment()

### Community 99 - "linkedin-env.ts"
Cohesion: 0.47
Nodes (4): LinkedInEnvironmentCredentials, parseLinkedInEnvironment(), readLinkedInEnvironment(), LinkedInClientCredentials

### Community 100 - "google-calendar.ts"
Cohesion: 0.33
Nodes (6): CalendarMap, Client, Event, Token, P1-9. Google token/client JSON tidak divalidasi schema, OwnerTask

### Community 102 - "live.ts"
Cohesion: 0.24
Nodes (7): connectLive(), LIVE_STATE_LABELS, LiveState, queryKeysFor(), TOPIC_QUERY_KEYS, useLiveUpdates(), LIVE_TOPICS

### Community 103 - "P2 — Performance, UX, dan operasional"
Cohesion: 0.20
Nodes (10): P2-1. Origin checks mutating route belum seragam, P2-2. GitHub sync-all unbounded, P2-3. Repository list belum bounded dan ordering belum stabil, P2-4. Knowledge Hub query perlu batas, P2-5. Live event stream perlu reconnect protocol, P2-6. 3D fallback dan performance, P2-7. Polling fallback dapat membebani server, P2-8. WhatsApp uncertain delivery (+2 more)

### Community 104 - "whatsapp-status.ts"
Cohesion: 0.36
Nodes (6): checkWhatsAppStatus(), states, WhatsAppCheck, WhatsAppSession, whatsappStateLabels, WhatsAppStatus()

### Community 105 - "vitest"
Cohesion: 0.33
Nodes (3): isTabletShortcut(), tab, vitest

## Ambiguous Edges - Review These
- `VisualOffice 3D scene` → `Design direction (chalk/ink, pine, copper)`  [AMBIGUOUS]
  DESIGN.md · relation: conceptually_related_to
- `Policy-bounded autonomous bidding (README)` → `Hermes proposal guard and template fallback`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Owner decision: fully automatic bidding` → `No marketplace write (MVP boundary)`  [AMBIGUOUS]
  docs/threat-model.md · relation: conceptually_related_to

## Knowledge Gaps
- **60 isolated node(s):** `eslint`, `@types/node`, `typescript`, `@fvh/domain`, `@types/react` (+55 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 694 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `adapter-freelancer/src/index.ts`, `OfficeShell.tsx`, `adapter-hermes/src/index.ts`, `Domain Scoring & Policy Engine`, `OfficeAgent.tsx`, `services/projects-co-id.ts`, `Root Tooling & Lint`, `Owner Movement & Desks`, `Live Events (SSE) Server`, `Freelancer Autopilot`, `DPAPI Integration Vault`, `Office Floor Layout`, `projects.co.id Page`, `persistence/src/index.ts`, `ui.tsx`, `app.ts`, `routes/operations.ts`, `services/browser-bidding.ts`, `knowledge/src/index.ts`, `Telegram Project Feed`, `CardDataStatus.tsx`, `GitHubReadAdapter`, `services/browser-bidding.ts`, `owner-input.ts`, `api.ts`, `P1 — Data consistency dan reliability`, `linkedin-oauth.ts`, `ref_node_path`, `types.ts`, `projects.co.id Page Budget`, `domain/src/index.ts`, `ai-env.ts`, `freelancer-env.ts`, `linkedin-env.ts`, `live.ts`, `whatsapp-status.ts`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `WorkspaceRepository` (e.g. with `Persistence` and `Ringkasan`) actually correct?**
  _`WorkspaceRepository` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `eslint`, `@types/node`, `typescript` to the rest of the system?**
  _60 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `adapter-freelancer/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05690834473324213 - nodes in this community are weakly interconnected._
- **Why does `WorkspaceRepository` connect `WorkspaceRepository` to `adapter-freelancer/src/index.ts`, `adapter-hermes/src/index.ts`, `services/projects-co-id.ts`, `projects.co.id Worker`, `Live Events (SSE) Server`, `Freelancer Autopilot`, `DPAPI Integration Vault`, `persistence/src/index.ts`, `verify-projects-co-id.ts`, `app.ts`, `routes/operations.ts`, `Audit Projek`, `knowledge/src/index.ts`, `shared.ts`, `database.ts`, `P1 — Data consistency dan reliability`, `repository.ts`, `projects.co.id Page Budget`, `parseJson`, `drafting.ts`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `VisualOffice 3D scene` and `Design direction (chalk/ink, pine, copper)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Policy-bounded autonomous bidding (README)` and `Hermes proposal guard and template fallback`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._