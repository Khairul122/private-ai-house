# Graph Report - private-ai-house  (2026-10-20)

## Corpus Check
- 226 files · ~130,892 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 2, .example 1, .css 1)

## Summary
- 1685 nodes · 4252 edges · 93 communities (85 shown, 8 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 145 edges (avg confidence: 0.85)
- Token cost: 140,866 input · 0 output

## Community Hubs (Navigation)
- Freelancer Adapter & BusinessSync
- Workspace Repository (Postgres)
- Office Agent Status Rules
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
- Drafting & App Tests
- Kanban & Browser Bid Cards
- E2E & Browser Verify Scripts
- Hermes CLI Adapter
- Card Remodel Verifier
- Invoices & Payment Reminders
- Web API Client
- GitHub Env & Schema Migration
- LinkedIn OAuth
- Browser Bidding Wiring
- Telegram Project Feed
- Card Data Status
- Product Principles (Docs)
- AI & Freelancer Env Config
- Hermes Adapter Package
- Browser Bid Types
- projects.co.id Page Driver
- Browser Bidding Service
- Calendar Page
- Application Package
- Persistence Package
- Client WhatsApp Communication
- Browser Bid & Floor-2 Docs
- Bidding Modes & Chrome CDP (Docs)
- Live Client (Web)
- Database Bootstrap (PGlite/pg)
- Contracts Package
- projects.co.id Verify Script
- Credential Store
- Owner Keyboard Input
- Freelancer Adapter Package
- GitHub Adapter Package
- Knowledge File Eligibility
- Base TS Config
- Security & Hermes Consent (Docs)
- Server TS Config
- GitHub Read Adapter
- SQLite to Supabase Migration
- Autopilot Decisions (Docs)
- WhatsApp Status Check
- Web TS Config
- Audit & Bid Data Model (Docs)
- Agent Roster & Hermes Team (Docs)
- Capability Matrix (Docs)
- Domain Package
- Knowledge Package
- Data Platform Decisions (Docs)
- Projects Controller
- Freelancer Browser Page
- projects.co.id Page Budget
- Freelancer Adapter TS Config
- GitHub Adapter TS Config
- Hermes Adapter TS Config
- Application TS Config
- Contracts TS Config
- Domain TS Config
- Knowledge TS Config
- Persistence TS Config
- Activity Controller
- LinkedIn Profile Sync
- Public Portfolio Resolver
- GitHub Adapter Types
- LinkedIn Env Config
- Persistence Deps
- Private Start Supervisor

## God Nodes (most connected - your core abstractions)
1. `WorkspaceRepository` - 88 edges
2. `vitest` - 51 edges
3. `api()` - 47 edges
4. `createApp()` - 36 edges
5. `ProjectsCoIdService` - 36 edges
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
- **Workers sharing owner Chrome via CDP** — docs_browser_bidding_sharedchromesession, docs_browser_bidding_connect_over_cdp, docs_browser_bidding_browser_bid_worker, docs_projects_co_id_scout_worker [EXTRACTED 1.00]
- **Realtime change propagation (DB write to card refresh)** — docs_realtime_announcewrites, docs_realtime_live_topics, docs_realtime_sse_events, agents_officeshell, docs_realtime_carddatastatus [EXTRACTED 1.00]

## Communities (93 total, 8 thin omitted)

### Community 0 - "Freelancer Adapter & BusinessSync"
Cohesion: 0.06
Nodes (46): BackoffJob, BusinessSync, BusinessSyncStatus, Dependencies, rateLimited(), RunStatus, safeError(), SyncStep (+38 more)

### Community 1 - "Workspace Repository (Postgres)"
Cohesion: 0.05
Nodes (20): projectsCoIdDraftPolicy(), projectsCoIdSettings(), AuditEvent, BidDraft, PipelineStatus, KnowledgeChunk, KnowledgeProvider, BidOutcome (+12 more)

### Community 2 - "Office Agent Status Rules"
Cohesion: 0.07
Nodes (46): AuditEvent, Autopilot, BusinessSyncStatus, BrowserBiddingStatus, OperationsData, kanbanQuery, labels, activityTitle() (+38 more)

### Community 3 - "Hermes Kanban & Team Scripts"
Cohesion: 0.06
Nodes (40): applicationSnapshot(), hermesKanbanController(), idParams, Json, money(), HermesKanbanDetail, HermesKanbanStatus, HermesKanbanTask (+32 more)

### Community 4 - "Web Shell & Shared UI"
Cohesion: 0.19
Nodes (32): api(), Capabilities, App(), formatDate(), ActivityRows(), EmptyState(), ErrorNotice(), LoadingPanel() (+24 more)

### Community 5 - "Server Dependencies"
Cohesion: 0.05
Nodes (41): dependencies, fastify, @fastify/static, @fvh/adapter-freelancer, @fvh/adapter-github, @fvh/adapter-hermes, @fvh/application, @fvh/contracts (+33 more)

### Community 6 - "Knowledge, Policy & Work Controllers"
Cohesion: 0.09
Nodes (30): githubSyncSchema, knowledgeController(), SyncJob, policyController(), profileController(), parseBody(), dayDiff(), workController() (+22 more)

### Community 7 - "Domain Scoring & Policy Engine"
Cohesion: 0.11
Nodes (24): decideBid(), CODING_KEYWORD_GROUPS, CODING_KEYWORDS, matchesProjectKeyword(), normalizeKeywords(), selectSearchTerms(), transitionPipeline(), transitions (+16 more)

### Community 8 - "App Security & Freelancer Controller"
Cohesion: 0.12
Nodes (24): createApp(), isSameOrigin(), freelancerController(), freelancerProductionWriteSchema, freelancerSandboxWriteSchema, freelancerSyncSchema, readProductionWriteChecks(), safeFreelancerIdSchema (+16 more)

### Community 9 - "projects.co.id Types & Parsing"
Cohesion: 0.11
Nodes (25): mentionedRupiahAmounts(), parseProjectsCoIdProject(), PROJECTS_CO_ID_AUTO_REASON, PROJECTS_CO_ID_ORIGIN, PROJECTS_CO_ID_PROPOSAL_LIMIT, ProjectsCoIdListing, projectsCoIdPath(), ProjectsCoIdStatus (+17 more)

### Community 10 - "Root Tooling & Lint"
Cohesion: 0.06
Nodes (33): devDependencies, eslint, @eslint/js, globals, @types/node, typescript, typescript-eslint, vitest (+25 more)

### Community 11 - "3D Office Scene"
Cohesion: 0.15
Nodes (33): Agent(), B(), Beanbag(), Board(), BoardContent, boardTexture(), Building(), CameraCommand (+25 more)

### Community 12 - "Operations Service (Floor 2)"
Cohesion: 0.14
Nodes (5): OperationsService, OutboxMessage, Queryable, DocumentKind, OperationsRepository

### Community 13 - "Web Dependencies"
Cohesion: 0.06
Nodes (30): dependencies, @fvh/domain, react, react-dom, react-router, @react-three/fiber, @tanstack/react-query, three (+22 more)

### Community 14 - "Owner Movement & Desks"
Cohesion: 0.12
Nodes (27): OwnerCharacter(), BROWSER_DESK, LEAD_DESK, LIFT, liftDoorReached(), MANAGER_DESK, OWNER_SPOT, P2 (+19 more)

### Community 16 - "Live Events (SSE) Server"
Cohesion: 0.13
Nodes (14): announceWrites(), Listener, LiveEvents, READ_ONLY_POSTS, ROUTE_TOPICS, routeTopics(), sample(), TABLE_TOPICS (+6 more)

### Community 17 - "Health & Capabilities Controllers"
Cohesion: 0.15
Nodes (18): AppOptions, capabilitiesController(), lastFailureNote(), healthController(), inboxController(), settingsController(), AppContext, FreelancerProductionWriteCheck (+10 more)

### Community 18 - "Freelancer Autopilot"
Cohesion: 0.11
Nodes (16): AutopilotDependencies, AutopilotStatus, chooseBid(), FreelancerAutopilot, matchedProfileJobs(), mentionedAmounts(), proposalFor(), rateLimited() (+8 more)

### Community 19 - "DPAPI Integration Vault"
Cohesion: 0.14
Nodes (13): DpapiIntegrationVault, IntegrationVault, VaultKey, CalendarMap, Client, Event, MemoryVault, Token (+5 more)

### Community 20 - "Server Assembly (index.ts)"
Cohesion: 0.10
Nodes (22): autopilot, browserBidding, businessSync, chrome, createFreelancerReader(), credentialScriptPath, credentialStorePath, databaseUrl (+14 more)

### Community 21 - "Google Calendar & WhatsApp"
Cohesion: 0.15
Nodes (3): GoogleCalendarService, WhatsAppService, OwnerTask

### Community 22 - "Office Floor Layout"
Cohesion: 0.11
Nodes (19): BACK_BOARDS, BOARD_SIZE, BoardId, BOARDS, BoardSlot, BREAK_SLOTS, corridorZ(), FLOOR (+11 more)

### Community 23 - "Operations Routes & Ports"
Cohesion: 0.14
Nodes (18): Calendar, JobSignal, Messenger, setup(), Payment, OperationSignal, clientAutomationSchema, date (+10 more)

### Community 24 - "Opportunities & Pipeline UI"
Cohesion: 0.31
Nodes (18): BidDraft, Opportunity, formatMoney(), PIPELINE_STAGES, matchesSource(), opportunitySource(), projectLink(), SOURCE_OPTIONS (+10 more)

### Community 25 - "projects.co.id Page"
Cohesion: 0.13
Nodes (19): Policy, ProjectsCoIdEntry, date(), daysUntil(), fieldLabel, modeLabels, ProjectEntry(), ProjectsCoIdPage() (+11 more)

### Community 26 - "Drafting & App Tests"
Cohesion: 0.16
Nodes (9): fixedNow, assignees, list, insertTestOpportunity(), testOpportunity, AiDraftingPort, FixtureDraftingAdapter, ProfileFact (+1 more)

### Community 27 - "Kanban & Browser Bid Cards"
Cohesion: 0.19
Nodes (19): jsonRequest(), BrowserBiddingCard(), action(), date(), COLUMNS, employee(), HermesKanbanCard(), submit() (+11 more)

### Community 28 - "E2E & Browser Verify Scripts"
Cohesion: 0.11
Nodes (8): { chromium }, ROUTES, address, { chromium }, identity, input, require, server

### Community 29 - "Hermes CLI Adapter"
Cohesion: 0.14
Nodes (13): hermesKanbanRunner, allowedEnvironment(), extractFinalText(), HermesCliDraftingAdapter, HermesDraftingError, normalizeOutput(), ProcessOptions, ProcessResult (+5 more)

### Community 30 - "Card Remodel Verifier"
Cohesion: 0.14
Nodes (17): allRoutes, apiReads, assertFits(), assertFocusTrap(), base, blockedWrites, check(), checkOfficePanels() (+9 more)

### Community 31 - "Invoices & Payment Reminders"
Cohesion: 0.23
Nodes (13): paymentReminder(), dp, invoice, project, escape(), invoiceHtml(), invoicePrintCss, currencyDigits() (+5 more)

### Community 32 - "Web API Client"
Cohesion: 0.13
Nodes (15): ApiError, DashboardResponse, FreelancerProductionWriteInput, FreelancerSandboxWriteInput, Inbox, Insights, PipelineItem, Profile (+7 more)

### Community 33 - "GitHub Env & Schema Migration"
Cohesion: 0.15
Nodes (8): GitHubEnvironment, parseGitHubEnvironment(), readGitHubEnvironment(), directories, client, MARKERS, root, url

### Community 34 - "LinkedIn OAuth"
Cohesion: 0.22
Nodes (11): LinkedInClientCredentials, buildLinkedInAuthorizationUrl(), completeLinkedInAuthorization(), isLoopback(), LinkedInCallbackResult, LinkedInOAuthOptions, LinkedInOAuthService, PendingFlow (+3 more)

### Community 35 - "Browser Bidding Wiring"
Cohesion: 0.17
Nodes (10): projectsCoId, BrowserBidMode, connectExistingChrome(), openWorkerTab(), SharedChromeSession, fixture, input, FreelancerWriteError (+2 more)

### Community 36 - "Telegram Project Feed"
Cohesion: 0.18
Nodes (9): ENTITIES, parseTelegramChannel(), plain(), PROJECTS_CO_ID_TELEGRAM_URL, ProjectsCoIdTelegram, readCapped(), TelegramProjectPost, TelegramReadError (+1 more)

### Community 37 - "Card Data Status"
Cohesion: 0.21
Nodes (11): CARD_QUERIES, CardDataKind, CardDataSummary, DataState, isCardQuery(), summarizeCardData(), CardDataStatus(), render() (+3 more)

### Community 38 - "Product Principles (Docs)"
Cohesion: 0.16
Nodes (10): Freelancer Virtual House / Mission Control, fresh() helper (drop stale data on isError), OfficeShell, VisualOffice 3D scene, Web entry HTML (root div + main.tsx), antislop Delivery Gate, Camera-relative movement, Owner character movement and collisions (+2 more)

### Community 39 - "AI & Freelancer Env Config"
Cohesion: 0.18
Nodes (8): defaults, DraftingEnvironment, parseDraftingEnvironment(), readDraftingEnvironment(), FreelancerEnvironment, parseFreelancerEnvironment(), readFreelancerEnvironment(), vitest

### Community 40 - "Hermes Adapter Package"
Cohesion: 0.13
Nodes (14): dependencies, @fvh/application, @fvh/contracts, zod, exports, @fvh/application, @fvh/contracts, zod (+6 more)

### Community 41 - "Browser Bid Types"
Cohesion: 0.27
Nodes (11): BrowserBidInput, BrowserObservation, confirmedBrowserBid(), isBidEndpoint(), matchesBrowserBid(), readRemainingBids(), record(), body (+3 more)

### Community 42 - "projects.co.id Page Driver"
Cohesion: 0.32
Nodes (3): ProjectsCoIdPage, BrowserBidError, ProjectsCoIdObservation

### Community 43 - "Browser Bidding Service"
Cohesion: 0.29
Nodes (3): BrowserBidStatus, BrowserIdentity, BrowserBiddingService

### Community 44 - "Calendar Page"
Cohesion: 0.26
Nodes (13): AGENDA_LABELS, AgendaSummary, calendarDateLabel(), CalendarEvent, calendarMonthCells(), CalendarView, calendarWeekdays, dateKeyInTimezone() (+5 more)

### Community 45 - "Application Package"
Cohesion: 0.14
Nodes (13): dependencies, @fvh/contracts, @fvh/domain, @fvh/knowledge, exports, @fvh/contracts, @fvh/domain, @fvh/knowledge (+5 more)

### Community 46 - "Persistence Package"
Cohesion: 0.14
Nodes (13): devDependencies, @electric-sql/pglite, @types/pg, exports, @fvh/domain, @fvh/knowledge, name, private (+5 more)

### Community 47 - "Client WhatsApp Communication"
Cohesion: 0.33
Nodes (9): ClientProject, CommunicationInput, NewClientProject, normalizeWhatsAppPhone(), saveClientCommunication(), input, project, ClientWhatsAppCard() (+1 more)

### Community 48 - "Browser Bid & Floor-2 Docs"
Cohesion: 0.17
Nodes (9): browser-bid-page.ts DOM driver and request gate, verify-browser-bidding.ts fixture script, Google Calendar OAuth (PKCE, calendar.events.owned), integration-vault.ps1 (DPAPI vault), operation_outbox / operation_documents tables, OperationsService (60 s cycle), WhatsApp via Baileys 7.0.0-rc14, allowBuilds (Baileys / protobufjs scripts blocked) (+1 more)

### Community 49 - "Bidding Modes & Chrome CDP (Docs)"
Cohesion: 0.21
Nodes (10): Policy engine (evaluatePolicy), Bidding modes (API / fallback on 401-403-429 / browser), Browser bid worker (Operator Browser Bid), SharedChromeSession, Coding keyword catalog (182 terms), Policy versioning with HTTP 409 optimistic update, parseProjectsCoIdHref, projectsCoIdSettings (policy JSON) (+2 more)

### Community 50 - "Live Client (Web)"
Cohesion: 0.24
Nodes (7): connectLive(), LIVE_STATE_LABELS, LiveState, queryKeysFor(), TOPIC_QUERY_KEYS, useLiveUpdates(), LIVE_TOPICS

### Community 51 - "Database Bootstrap (PGlite/pg)"
Cohesion: 0.24
Nodes (7): createDatabase(), memory(), migrate(), postgres(), Row, @electric-sql/pglite, pg

### Community 52 - "Contracts Package"
Cohesion: 0.17
Nodes (11): dependencies, @fvh/domain, zod, exports, @fvh/domain, zod, name, private (+3 more)

### Community 53 - "projects.co.id Verify Script"
Cohesion: 0.20
Nodes (11): account(), address, { chromium }, content(), description, ids, port, require (+3 more)

### Community 54 - "Credential Store"
Cohesion: 0.33
Nodes (10): linkedinOAuth, deleteLinkedInAccessToken(), getFreelancerAccessToken(), getLinkedInAccessToken(), getLinkedInClientCredentials(), isDpapiCiphertext(), readCredentialStatus(), runCredentialAction() (+2 more)

### Community 55 - "Owner Keyboard Input"
Cohesion: 0.27
Nodes (8): bindOwnerKeyboard(), createOwnerInput(), DIRECTIONS, OwnerDirection, OwnerInput, OwnerMoveInput, ownsKeyboard(), setup()

### Community 56 - "Freelancer Adapter Package"
Cohesion: 0.18
Nodes (10): dependencies, @fvh/domain, exports, @fvh/domain, name, private, scripts, test (+2 more)

### Community 57 - "GitHub Adapter Package"
Cohesion: 0.18
Nodes (10): dependencies, @fvh/knowledge, exports, @fvh/knowledge, name, private, scripts, test (+2 more)

### Community 58 - "Knowledge File Eligibility"
Cohesion: 0.24
Nodes (8): blockedExtensions, blockedPathParts, isEligibleKnowledgePath(), KnowledgeFileInput, KnowledgeResult, prepareKnowledgeFile(), secretPatterns, splitContent()

### Community 59 - "Base TS Config"
Cohesion: 0.18
Nodes (10): compilerOptions, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, module, moduleResolution, noUncheckedIndexedAccess, resolveJsonModule, skipLibCheck (+2 more)

### Community 60 - "Security & Hermes Consent (Docs)"
Cohesion: 0.22
Nodes (7): Credential store (Windows DPAPI), HermesCliDraftingAdapter, FVH_AI_DATA_CONSENT, Hermes cron "FVH review", Untrusted brief/repo injection protection, Threat model, Optional sources configuration (Freelancer, GitHub, LinkedIn, Hermes)

### Community 61 - "Server TS Config"
Cohesion: 0.20
Nodes (9): compilerOptions, outDir, rootDir, sourceMap, types, exclude, extends, include (+1 more)

### Community 63 - "SQLite to Supabase Migration"
Cohesion: 0.20
Nodes (8): backup, backupDir, envPath, root, source, sqlitePath, TABLES, url

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

### Community 73 - "Projects Controller"
Cohesion: 0.43
Nodes (5): draftUpdateSchema, projectsController(), paramsSchema, registerProjectsRoutes(), assessProject()

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

### Community 84 - "Activity Controller"
Cohesion: 0.53
Nodes (4): activityController(), agendaCategory(), agendaSchema, registerActivityRoutes()

### Community 85 - "LinkedIn Profile Sync"
Cohesion: 0.47
Nodes (4): LinkedInApiProfile, profileSchema, readLinkedInProfile(), syncLinkedInProfile()

### Community 87 - "GitHub Adapter Types"
Cohesion: 0.33
Nodes (3): Fetcher, GitHubFile, GitHubReadResult

### Community 88 - "LinkedIn Env Config"
Cohesion: 0.60
Nodes (3): LinkedInEnvironmentCredentials, parseLinkedInEnvironment(), readLinkedInEnvironment()

### Community 89 - "Persistence Deps"
Cohesion: 0.50
Nodes (4): dependencies, @fvh/domain, @fvh/knowledge, pg

## Ambiguous Edges - Review These
- `Hermes proposal guard and template fallback` → `Policy-bounded autonomous bidding (README)`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `VisualOffice 3D scene` → `Design direction (chalk/ink, pine, copper)`  [AMBIGUOUS]
  DESIGN.md · relation: conceptually_related_to
- `Owner decision: fully automatic bidding` → `No marketplace write (MVP boundary)`  [AMBIGUOUS]
  docs/threat-model.md · relation: conceptually_related_to

## Knowledge Gaps
- **60 isolated node(s):** `@fvh/adapter-freelancer`, `@fvh/adapter-github`, `@fvh/adapter-hermes`, `@fvh/application`, `@fvh/contracts` (+55 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 599 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `AI & Freelancer Env Config` to `Freelancer Adapter & BusinessSync`, `Office Agent Status Rules`, `Web Shell & Shared UI`, `Domain Scoring & Policy Engine`, `App Security & Freelancer Controller`, `projects.co.id Types & Parsing`, `Root Tooling & Lint`, `Owner Movement & Desks`, `Live Events (SSE) Server`, `Freelancer Autopilot`, `DPAPI Integration Vault`, `Office Floor Layout`, `Operations Routes & Ports`, `projects.co.id Page`, `Drafting & App Tests`, `Hermes CLI Adapter`, `Invoices & Payment Reminders`, `GitHub Env & Schema Migration`, `LinkedIn OAuth`, `Browser Bidding Wiring`, `Telegram Project Feed`, `Card Data Status`, `Browser Bid Types`, `Client WhatsApp Communication`, `Live Client (Web)`, `Database Bootstrap (PGlite/pg)`, `Owner Keyboard Input`, `Knowledge File Eligibility`, `WhatsApp Status Check`, `LinkedIn Profile Sync`, `Public Portfolio Resolver`, `GitHub Adapter Types`, `LinkedIn Env Config`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **What connects `@fvh/adapter-freelancer`, `@fvh/adapter-github`, `@fvh/adapter-hermes` to the rest of the system?**
  _60 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Freelancer Adapter & BusinessSync` be split into smaller, more focused modules?**
  _Cohesion score 0.05690834473324213 - nodes in this community are weakly interconnected._
- **Why does `WorkspaceRepository` connect `Workspace Repository (Postgres)` to `Freelancer Adapter & BusinessSync`, `App Security & Freelancer Controller`, `projects.co.id Types & Parsing`, `Operations Service (Floor 2)`, `projects.co.id Worker`, `Live Events (SSE) Server`, `Health & Capabilities Controllers`, `Freelancer Autopilot`, `DPAPI Integration Vault`, `Server Assembly (index.ts)`, `LinkedIn Profile Sync`, `Database Bootstrap (PGlite/pg)`, `Operations Routes & Ports`, `projects.co.id Verify Script`, `Drafting & App Tests`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Should `Workspace Repository (Postgres)` be split into smaller, more focused modules?**
  _Cohesion score 0.051643192488262914 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Hermes proposal guard and template fallback` and `Policy-bounded autonomous bidding (README)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `VisualOffice 3D scene` and `Design direction (chalk/ink, pine, copper)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._