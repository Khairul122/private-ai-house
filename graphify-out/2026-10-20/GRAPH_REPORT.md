# Graph Report - private-ai-house  (2026-10-20)

## Corpus Check
- 227 files · ~131,705 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .example 1, .css 1)

## Summary
- 1704 nodes · 4271 edges · 86 communities (77 shown, 9 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 145 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `96101603`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Freelancer Adapter & BusinessSync
- Workspace Repository (Postgres)
- OfficeShell.tsx
- Hermes Kanban & Team Scripts
- Web Shell & Shared UI
- Server Dependencies
- Knowledge, Policy & Work Controllers
- Domain Scoring & Policy Engine
- App Security & Freelancer Controller
- projects.co.id Types & Parsing
- Root Tooling & Lint
- 3D Office Scene
- Operations Service (Floor 2)
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
- Operations Routes & Ports
- Opportunities & Pipeline UI
- projects.co.id Page
- persistence/src/index.ts
- api
- E2E & Browser Verify Scripts
- Hermes CLI Adapter
- Card Remodel Verifier
- Invoices & Payment Reminders
- WorkPage.tsx
- GitHub Env & Schema Migration
- LinkedIn OAuth
- adapter-freelancer/src/index.ts
- Telegram Project Feed
- Card Data Status
- Product Principles (Docs)
- vitest
- Hermes Adapter Package
- services/browser-bidding.ts
- projects.co.id Page Driver
- Browser Bidding Service
- Calendar Page
- Application Package
- database.ts
- api.ts
- Browser Bid & Floor-2 Docs
- Bidding Modes & Chrome CDP (Docs)
- Live Client (Web)
- repository.ts
- Contracts Package
- office-state.ts
- App.tsx
- DpapiIntegrationVault
- Freelancer Adapter Package
- GitHub Adapter Package
- Knowledge File Eligibility
- Base TS Config
- Security & Hermes Consent (Docs)
- Server TS Config
- GitHub Read Adapter
- Autopilot Decisions (Docs)
- WhatsApp Status Check
- Web TS Config
- Audit & Bid Data Model (Docs)
- Agent Roster & Hermes Team (Docs)
- Capability Matrix (Docs)
- Domain Package
- Knowledge Package
- Data Platform Decisions (Docs)
- application/src/index.ts
- projects.co.id Page Budget
- Freelancer Adapter TS Config
- GitHub Adapter TS Config
- Hermes Adapter TS Config
- Application TS Config
- Contracts TS Config
- Domain TS Config
- Knowledge TS Config
- Persistence TS Config
- Public Portfolio Resolver
- Private Start Supervisor

## God Nodes (most connected - your core abstractions)
1. `WorkspaceRepository` - 88 edges
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

## Communities (86 total, 9 thin omitted)

### Community 0 - "Freelancer Adapter & BusinessSync"
Cohesion: 0.06
Nodes (36): BackoffJob, BusinessSync, BusinessSyncStatus, Dependencies, rateLimited(), RunStatus, safeError(), SyncStep (+28 more)

### Community 1 - "Workspace Repository (Postgres)"
Cohesion: 0.07
Nodes (8): AuditEvent, BidDraft, PipelineStatus, camel(), camelKey(), parseJson(), tsQuery(), WorkspaceRepository

### Community 2 - "OfficeShell.tsx"
Cohesion: 0.09
Nodes (32): activityTitle(), BOARD_ACCENTS, buildBoards(), initials(), moneyList(), OfficeIcon(), OfficeIconName, OfficeShell() (+24 more)

### Community 3 - "Hermes Kanban & Team Scripts"
Cohesion: 0.05
Nodes (50): applicationSnapshot(), hermesKanbanController(), idParams, Json, money(), HermesKanbanDetail, HermesKanbanStatus, HermesKanbanTask (+42 more)

### Community 4 - "Web Shell & Shared UI"
Cohesion: 0.19
Nodes (28): Autopilot, Capabilities, jsonRequest(), formatDate(), EmptyState(), ErrorNotice(), LoadingPanel(), Metric() (+20 more)

### Community 5 - "Server Dependencies"
Cohesion: 0.05
Nodes (41): dependencies, fastify, @fastify/static, @fvh/adapter-freelancer, @fvh/adapter-github, @fvh/adapter-hermes, @fvh/application, @fvh/contracts (+33 more)

### Community 6 - "Knowledge, Policy & Work Controllers"
Cohesion: 0.09
Nodes (28): policyController(), profileController(), paramsSchema, parseBody(), dayDiff(), workController(), registerPolicyRoutes(), registerProfileRoutes() (+20 more)

### Community 7 - "Domain Scoring & Policy Engine"
Cohesion: 0.13
Nodes (20): CODING_KEYWORD_GROUPS, CODING_KEYWORDS, matchesProjectKeyword(), normalizeKeywords(), selectSearchTerms(), transitionPipeline(), transitions, PolicyInput (+12 more)

### Community 8 - "App Security & Freelancer Controller"
Cohesion: 0.14
Nodes (19): createApp(), isSameOrigin(), activityController(), agendaCategory(), agendaSchema, freelancerController(), readProductionWriteChecks(), registerActivityRoutes() (+11 more)

### Community 9 - "projects.co.id Types & Parsing"
Cohesion: 0.16
Nodes (20): mentionedRupiahAmounts(), parseProjectsCoIdProject(), PROJECTS_CO_ID_AUTO_REASON, PROJECTS_CO_ID_ORIGIN, PROJECTS_CO_ID_PROPOSAL_LIMIT, ProjectsCoIdListing, projectsCoIdPath(), readRupiahBudget() (+12 more)

### Community 10 - "Root Tooling & Lint"
Cohesion: 0.06
Nodes (33): devDependencies, eslint, @eslint/js, globals, @types/node, typescript, typescript-eslint, vitest (+25 more)

### Community 11 - "3D Office Scene"
Cohesion: 0.17
Nodes (31): Agent(), B(), Beanbag(), Board(), boardTexture(), Building(), CameraRig(), Chair() (+23 more)

### Community 12 - "Operations Service (Floor 2)"
Cohesion: 0.18
Nodes (3): OperationsService, OutboxMessage, OperationsRepository

### Community 13 - "Web Dependencies"
Cohesion: 0.06
Nodes (30): dependencies, @fvh/domain, react, react-dom, react-router, @react-three/fiber, @tanstack/react-query, three (+22 more)

### Community 14 - "Owner Movement & Desks"
Cohesion: 0.12
Nodes (27): OwnerCharacter(), BROWSER_DESK, LEAD_DESK, LIFT, liftDoorReached(), MANAGER_DESK, OWNER_SPOT, P2 (+19 more)

### Community 15 - "projects.co.id Worker"
Cohesion: 0.19
Nodes (4): ProjectsCoIdStatus, ProjectsCoIdService, projectsCoIdSearchTerms(), scoreProject()

### Community 16 - "Live Events (SSE) Server"
Cohesion: 0.16
Nodes (12): announceWrites(), Listener, LiveEvents, READ_ONLY_POSTS, ROUTE_TOPICS, routeTopics(), sample(), TABLE_TOPICS (+4 more)

### Community 17 - "Health & Capabilities Controllers"
Cohesion: 0.17
Nodes (15): AppOptions, healthController(), inboxController(), linkedinController(), settingsController(), allowedDevOrigins, AppContext, FreelancerSandboxWriteCheck (+7 more)

### Community 18 - "Freelancer Autopilot"
Cohesion: 0.12
Nodes (14): AutopilotDependencies, AutopilotStatus, chooseBid(), FreelancerAutopilot, matchedProfileJobs(), mentionedAmounts(), proposalFor(), rateLimited() (+6 more)

### Community 19 - "DPAPI Integration Vault"
Cohesion: 0.17
Nodes (13): IntegrationVault, VaultKey, CalendarMap, Client, Event, MemoryVault, Token, fixture (+5 more)

### Community 20 - "Server Assembly (index.ts)"
Cohesion: 0.08
Nodes (35): LinkedInEnvironmentCredentials, parseLinkedInEnvironment(), readLinkedInEnvironment(), autopilot, browserBidding, businessSync, chrome, createFreelancerReader() (+27 more)

### Community 22 - "Office Floor Layout"
Cohesion: 0.11
Nodes (20): BACK_BOARDS, BOARD_SIZE, BoardId, BOARDS, BoardSlot, BREAK_SLOTS, corridorZ(), dayPhase() (+12 more)

### Community 23 - "Operations Routes & Ports"
Cohesion: 0.14
Nodes (18): Calendar, JobSignal, Messenger, setup(), Payment, OperationSignal, clientAutomationSchema, date (+10 more)

### Community 24 - "Opportunities & Pipeline UI"
Cohesion: 0.32
Nodes (17): BidDraft, Opportunity, formatMoney(), PIPELINE_STAGES, matchesSource(), opportunitySource(), projectLink(), SOURCE_OPTIONS (+9 more)

### Community 25 - "projects.co.id Page"
Cohesion: 0.13
Nodes (17): ProjectsCoIdEntry, date(), daysUntil(), fieldLabel, modeLabels, ProjectEntry(), ProjectsCoIdPage(), rupiah() (+9 more)

### Community 26 - "persistence/src/index.ts"
Cohesion: 0.23
Nodes (6): fixedNow, insertTestOpportunity(), testOpportunity, FreelancerSandboxWriteError, FreelancerWriteError, FixtureDraftingAdapter

### Community 27 - "api"
Cohesion: 0.11
Nodes (18): api(), ApiError, Profile, BrowserBiddingStatus, OperationsData, kanbanQuery, BrowserBiddingCard(), action() (+10 more)

### Community 28 - "E2E & Browser Verify Scripts"
Cohesion: 0.07
Nodes (23): projectsCoId, connectExistingChrome(), openWorkerTab(), { chromium }, ROUTES, address, { chromium }, identity (+15 more)

### Community 29 - "Hermes CLI Adapter"
Cohesion: 0.12
Nodes (16): allowedEnvironment(), extractFinalText(), HermesCliDraftingAdapter, HermesDraftingError, normalizeOutput(), ProcessOptions, ProcessResult, ProcessRunner (+8 more)

### Community 30 - "Card Remodel Verifier"
Cohesion: 0.14
Nodes (17): allRoutes, apiReads, assertFits(), assertFocusTrap(), base, blockedWrites, check(), checkOfficePanels() (+9 more)

### Community 31 - "Invoices & Payment Reminders"
Cohesion: 0.22
Nodes (14): paymentReminder(), dp, invoice, project, escape(), invoiceHtml(), invoicePrintCss, currencyDigits() (+6 more)

### Community 32 - "WorkPage.tsx"
Cohesion: 0.53
Nodes (5): deadlineLabel(), SOURCE_LABELS, validCurrency(), valueOrDash(), WorkPage()

### Community 33 - "GitHub Env & Schema Migration"
Cohesion: 0.10
Nodes (15): defaults, DraftingEnvironment, parseDraftingEnvironment(), readDraftingEnvironment(), FreelancerEnvironment, parseFreelancerEnvironment(), readFreelancerEnvironment(), GitHubEnvironment (+7 more)

### Community 34 - "LinkedIn OAuth"
Cohesion: 0.18
Nodes (12): LinkedInClientCredentials, buildLinkedInAuthorizationUrl(), completeLinkedInAuthorization(), isLoopback(), LinkedInCallbackResult, LinkedInOAuthOptions, LinkedInOAuthService, PendingFlow (+4 more)

### Community 35 - "adapter-freelancer/src/index.ts"
Cohesion: 0.11
Nodes (22): capabilitiesController(), lastFailureNote(), freelancerProductionWriteSchema, freelancerSandboxWriteSchema, freelancerSyncSchema, safeFreelancerIdSchema, FreelancerProductionWriteCheck, registerCapabilitiesRoutes() (+14 more)

### Community 36 - "Telegram Project Feed"
Cohesion: 0.13
Nodes (10): ENTITIES, parseTelegramChannel(), plain(), PROJECTS_CO_ID_TELEGRAM_URL, ProjectsCoIdTelegram, readCapped(), TelegramProjectPost, TelegramReadError (+2 more)

### Community 37 - "Card Data Status"
Cohesion: 0.30
Nodes (8): CARD_QUERIES, CardDataKind, CardDataSummary, DataState, isCardQuery(), summarizeCardData(), CardDataStatus(), render()

### Community 38 - "Product Principles (Docs)"
Cohesion: 0.16
Nodes (10): Freelancer Virtual House / Mission Control, fresh() helper (drop stale data on isError), OfficeShell, VisualOffice 3D scene, Web entry HTML (root div + main.tsx), antislop Delivery Gate, Camera-relative movement, Owner character movement and collisions (+2 more)

### Community 40 - "Hermes Adapter Package"
Cohesion: 0.13
Nodes (14): dependencies, @fvh/application, @fvh/contracts, zod, exports, @fvh/application, @fvh/contracts, zod (+6 more)

### Community 41 - "services/browser-bidding.ts"
Cohesion: 0.15
Nodes (18): FreelancerBrowserPage, BrowserBidInput, BrowserBidMode, BrowserIdentity, BrowserObservation, confirmedBrowserBid(), isBidEndpoint(), matchesBrowserBid() (+10 more)

### Community 42 - "projects.co.id Page Driver"
Cohesion: 0.32
Nodes (3): ProjectsCoIdPage, BrowserBidError, ProjectsCoIdObservation

### Community 44 - "Calendar Page"
Cohesion: 0.23
Nodes (15): useClock(), AGENDA_LABELS, AgendaSummary, calendarDateLabel(), CalendarEvent, calendarMonthCells(), CalendarPage(), CalendarView (+7 more)

### Community 45 - "Application Package"
Cohesion: 0.14
Nodes (13): dependencies, @fvh/contracts, @fvh/domain, @fvh/knowledge, exports, @fvh/contracts, @fvh/domain, @fvh/knowledge (+5 more)

### Community 46 - "database.ts"
Cohesion: 0.06
Nodes (32): dependencies, @fvh/domain, @fvh/knowledge, pg, devDependencies, @electric-sql/pglite, @types/pg, exports (+24 more)

### Community 47 - "api.ts"
Cohesion: 0.10
Nodes (24): AuditEvent, BusinessSyncStatus, ClientProject, DashboardResponse, FreelancerProductionWriteInput, FreelancerSandboxWriteInput, Inbox, Insights (+16 more)

### Community 48 - "Browser Bid & Floor-2 Docs"
Cohesion: 0.17
Nodes (9): browser-bid-page.ts DOM driver and request gate, verify-browser-bidding.ts fixture script, Google Calendar OAuth (PKCE, calendar.events.owned), integration-vault.ps1 (DPAPI vault), operation_outbox / operation_documents tables, OperationsService (60 s cycle), WhatsApp via Baileys 7.0.0-rc14, allowBuilds (Baileys / protobufjs scripts blocked) (+1 more)

### Community 49 - "Bidding Modes & Chrome CDP (Docs)"
Cohesion: 0.21
Nodes (10): Policy engine (evaluatePolicy), Bidding modes (API / fallback on 401-403-429 / browser), Browser bid worker (Operator Browser Bid), SharedChromeSession, Coding keyword catalog (182 terms), Policy versioning with HTTP 409 optimistic update, parseProjectsCoIdHref, projectsCoIdSettings (policy JSON) (+2 more)

### Community 50 - "Live Client (Web)"
Cohesion: 0.27
Nodes (6): connectLive(), LIVE_STATE_LABELS, LiveState, queryKeysFor(), TOPIC_QUERY_KEYS, useLiveUpdates()

### Community 51 - "repository.ts"
Cohesion: 0.08
Nodes (18): decideBid(), decision(), evaluatePolicy(), projectsCoIdDraftPolicy(), projectsCoIdSettings(), KnowledgeChunk, KnowledgeProvider, Database (+10 more)

### Community 52 - "Contracts Package"
Cohesion: 0.17
Nodes (11): dependencies, @fvh/domain, zod, exports, @fvh/domain, zod, name, private (+3 more)

### Community 53 - "office-state.ts"
Cohesion: 0.15
Nodes (16): activityFor(), AgentState, autopilotState(), clientRelationsState(), Derived, deriveOfficeAgents(), leadState(), OfficeAgent (+8 more)

### Community 54 - "App.tsx"
Cohesion: 0.30
Nodes (7): App(), ActivityRows(), queryClient, ActivityPage(), NotFoundPage(), react, react-router

### Community 56 - "Freelancer Adapter Package"
Cohesion: 0.18
Nodes (10): dependencies, @fvh/domain, exports, @fvh/domain, name, private, scripts, test (+2 more)

### Community 57 - "GitHub Adapter Package"
Cohesion: 0.18
Nodes (10): dependencies, @fvh/knowledge, exports, @fvh/knowledge, name, private, scripts, test (+2 more)

### Community 58 - "Knowledge File Eligibility"
Cohesion: 0.17
Nodes (11): LinkedInApiProfile, profileSchema, readLinkedInProfile(), syncLinkedInProfile(), blockedExtensions, blockedPathParts, KnowledgeFileInput, KnowledgeResult (+3 more)

### Community 59 - "Base TS Config"
Cohesion: 0.18
Nodes (10): compilerOptions, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, module, moduleResolution, noUncheckedIndexedAccess, resolveJsonModule, skipLibCheck (+2 more)

### Community 60 - "Security & Hermes Consent (Docs)"
Cohesion: 0.22
Nodes (7): Credential store (Windows DPAPI), HermesCliDraftingAdapter, FVH_AI_DATA_CONSENT, Hermes cron "FVH review", Untrusted brief/repo injection protection, Threat model, Optional sources configuration (Freelancer, GitHub, LinkedIn, Hermes)

### Community 61 - "Server TS Config"
Cohesion: 0.20
Nodes (9): compilerOptions, outDir, rootDir, sourceMap, types, exclude, extends, include (+1 more)

### Community 62 - "GitHub Read Adapter"
Cohesion: 0.26
Nodes (6): Fetcher, GitHubFile, GitHubReadAdapter, GitHubReadError, GitHubReadResult, isEligibleKnowledgePath()

### Community 64 - "Autopilot Decisions (Docs)"
Cohesion: 0.25
Nodes (4): FreelancerAutopilot, Kill switch (Jeda automasi), publicPortfolio resolver (public GitHub repos only), Policy-bounded autonomous bidding (README)

### Community 65 - "WhatsApp Status Check"
Cohesion: 0.36
Nodes (6): checkWhatsAppStatus(), states, WhatsAppCheck, WhatsAppSession, whatsappStateLabels, WhatsAppStatus()

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
Nodes (12): githubSyncSchema, knowledgeController(), SyncJob, draftUpdateSchema, projectsController(), registerKnowledgeRoutes(), registerProjectsRoutes(), assessProject() (+4 more)

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

## Ambiguous Edges - Review These
- `VisualOffice 3D scene` → `Design direction (chalk/ink, pine, copper)`  [AMBIGUOUS]
  DESIGN.md · relation: conceptually_related_to
- `Policy-bounded autonomous bidding (README)` → `Hermes proposal guard and template fallback`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Owner decision: fully automatic bidding` → `No marketplace write (MVP boundary)`  [AMBIGUOUS]
  docs/threat-model.md · relation: conceptually_related_to

## Knowledge Gaps
- **60 isolated node(s):** `eslint`, `@types/node`, `typescript`, `@fvh/domain`, `@types/react` (+55 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 609 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `Freelancer Adapter & BusinessSync`, `OfficeShell.tsx`, `Hermes Kanban & Team Scripts`, `Web Shell & Shared UI`, `Domain Scoring & Policy Engine`, `App Security & Freelancer Controller`, `projects.co.id Types & Parsing`, `Root Tooling & Lint`, `Owner Movement & Desks`, `Live Events (SSE) Server`, `Freelancer Autopilot`, `DPAPI Integration Vault`, `Server Assembly (index.ts)`, `Office Floor Layout`, `Operations Routes & Ports`, `projects.co.id Page`, `persistence/src/index.ts`, `Hermes CLI Adapter`, `Invoices & Payment Reminders`, `GitHub Env & Schema Migration`, `LinkedIn OAuth`, `Telegram Project Feed`, `Card Data Status`, `services/browser-bidding.ts`, `api.ts`, `Live Client (Web)`, `Knowledge File Eligibility`, `WhatsApp Status Check`, `Public Portfolio Resolver`?**
  _High betweenness centrality (0.136) - this node is a cross-community bridge._
- **What connects `eslint`, `@types/node`, `typescript` to the rest of the system?**
  _60 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Freelancer Adapter & BusinessSync` be split into smaller, more focused modules?**
  _Cohesion score 0.061828952239911146 - nodes in this community are weakly interconnected._
- **Why does `WorkspaceRepository` connect `Workspace Repository (Postgres)` to `Freelancer Adapter & BusinessSync`, `Hermes Kanban & Team Scripts`, `App Security & Freelancer Controller`, `projects.co.id Types & Parsing`, `Operations Service (Floor 2)`, `projects.co.id Worker`, `Health & Capabilities Controllers`, `Freelancer Autopilot`, `DPAPI Integration Vault`, `Server Assembly (index.ts)`, `Operations Routes & Ports`, `persistence/src/index.ts`, `E2E & Browser Verify Scripts`, `Hermes CLI Adapter`, `adapter-freelancer/src/index.ts`, `Telegram Project Feed`, `database.ts`, `repository.ts`, `Knowledge File Eligibility`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Should `Workspace Repository (Postgres)` be split into smaller, more focused modules?**
  _Cohesion score 0.07215541165587419 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `VisualOffice 3D scene` and `Design direction (chalk/ink, pine, copper)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Policy-bounded autonomous bidding (README)` and `Hermes proposal guard and template fallback`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._