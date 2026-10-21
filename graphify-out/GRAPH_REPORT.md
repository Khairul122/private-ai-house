# Graph Report - private-ai-house  (2026-10-21)

## Corpus Check
- 232 files · ~135,472 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .example 1, .css 1)

## Summary
- 1753 nodes · 4349 edges · 94 communities (84 shown, 10 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 144 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `12a2cc2c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Freelancer Adapter & BusinessSync
- Workspace Repository (Postgres)
- OfficeShell.tsx
- adapter-hermes/src/index.ts
- ui.tsx
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
- isTabletShortcut
- E2E & Browser Verify Scripts
- controllers/freelancer.ts
- Card Remodel Verifier
- routes/operations.ts
- services/hermes-kanban.ts
- GitHub Env & Schema Migration
- App.tsx
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
- api
- Browser Bid & Floor-2 Docs
- Bidding Modes & Chrome CDP (Docs)
- owner-input.ts
- fastify
- Contracts Package
- database.ts
- api.ts
- DpapiIntegrationVault
- Freelancer Adapter Package
- GitHub Adapter Package
- knowledge/src/index.ts
- Base TS Config
- Security & Hermes Consent (Docs)
- Server TS Config
- OperationsRepository
- domain/src/index.ts
- Autopilot Decisions (Docs)
- services/browser-bidding.test.ts
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
- BrowserBidError
- WhatsAppService
- scripts
- OperationsService
- OfficeEnvironment.tsx
- OfficeObjects.tsx
- Private Start Supervisor
- drafting.ts

## God Nodes (most connected - your core abstractions)
1. `WorkspaceRepository` - 87 edges
2. `vitest` - 54 edges
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

## Communities (94 total, 10 thin omitted)

### Community 0 - "Freelancer Adapter & BusinessSync"
Cohesion: 0.06
Nodes (46): BackoffJob, BusinessSync, BusinessSyncStatus, Dependencies, rateLimited(), RunStatus, safeError(), SyncStep (+38 more)

### Community 1 - "Workspace Repository (Postgres)"
Cohesion: 0.06
Nodes (19): AuditEvent, BidDraft, PipelineStatus, KnowledgeChunk, KnowledgeProvider, BidOutcome, camel(), camelKey() (+11 more)

### Community 2 - "OfficeShell.tsx"
Cohesion: 0.08
Nodes (38): AuditEvent, BusinessSyncStatus, Payment, BrowserBiddingStatus, OperationsData, OperationSignal, kanbanQuery, BOARD_ACCENTS (+30 more)

### Community 3 - "adapter-hermes/src/index.ts"
Cohesion: 0.13
Nodes (14): hermesKanbanRunner, allowedEnvironment(), detectProposalLanguage(), extractFinalText(), HermesCliDraftingAdapter, HermesDraftingError, normalizeOutput(), ProcessOptions (+6 more)

### Community 4 - "ui.tsx"
Cohesion: 0.22
Nodes (23): Autopilot, activityTitle(), formatDate(), PIPELINE_STAGES, ActivityRows(), EmptyState(), ErrorNotice(), OperationStatus() (+15 more)

### Community 5 - "server/package.json"
Cohesion: 0.09
Nodes (21): devDependencies, tsx, @types/qrcode, @fvh/application, @fvh/contracts, @fvh/domain, @fvh/knowledge, zod (+13 more)

### Community 6 - "contracts/src/index.ts"
Cohesion: 0.09
Nodes (27): policyController(), profileController(), parseBody(), dayDiff(), workController(), registerPolicyRoutes(), registerProfileRoutes(), projectParams (+19 more)

### Community 7 - "Domain Scoring & Policy Engine"
Cohesion: 0.11
Nodes (20): decideBid(), CODING_KEYWORD_GROUPS, CODING_KEYWORDS, matchesProjectKeyword(), normalizeKeywords(), selectSearchTerms(), decision(), evaluatePolicy() (+12 more)

### Community 8 - "OfficeAgent.tsx"
Cohesion: 0.14
Nodes (18): Box(), HAIR, Label(), nearbyIdlePeer(), OfficeAgent(), Props, shortestAngle(), SKIN (+10 more)

### Community 9 - "services/projects-co-id.ts"
Cohesion: 0.14
Nodes (25): mentionedRupiahAmounts(), parseProjectsCoIdProject(), PROJECTS_CO_ID_AUTO_REASON, PROJECTS_CO_ID_ORIGIN, PROJECTS_CO_ID_PROPOSAL_LIMIT, ProjectsCoIdListing, projectsCoIdPath(), ProjectsCoIdStatus (+17 more)

### Community 10 - "Root Tooling & Lint"
Cohesion: 0.06
Nodes (33): devDependencies, eslint, @eslint/js, globals, @types/node, typescript, typescript-eslint, vitest (+25 more)

### Community 11 - "3D Office Scene"
Cohesion: 0.13
Nodes (33): VisualOffice, B(), Beanbag(), Board(), BoardContent, boardTexture(), Building(), CameraCommand (+25 more)

### Community 12 - "dependencies"
Cohesion: 0.12
Nodes (16): dependencies, fastify, @fastify/static, @fvh/adapter-freelancer, @fvh/adapter-github, @fvh/adapter-hermes, @fvh/application, @fvh/contracts (+8 more)

### Community 13 - "Web Dependencies"
Cohesion: 0.07
Nodes (29): dependencies, @fvh/domain, react, react-dom, react-router, @react-three/fiber, @tanstack/react-query, three (+21 more)

### Community 14 - "Owner Movement & Desks"
Cohesion: 0.16
Nodes (21): OwnerCharacter(), LIFT, liftDoorReached(), OWNER_SPOT, planOfficeRoute(), updateOfficeLife(), createOwnerMotion(), gridAnchor() (+13 more)

### Community 16 - "Live Events (SSE) Server"
Cohesion: 0.13
Nodes (14): announceWrites(), Listener, LiveEvents, READ_ONLY_POSTS, ROUTE_TOPICS, routeTopics(), sample(), TABLE_TOPICS (+6 more)

### Community 17 - "Health & Capabilities Controllers"
Cohesion: 0.20
Nodes (13): AppOptions, capabilitiesController(), lastFailureNote(), settingsController(), FreelancerProductionWriteCheck, FreelancerSandboxWriteCheck, linkedinVerification(), CredentialStatus (+5 more)

### Community 18 - "Freelancer Autopilot"
Cohesion: 0.07
Nodes (16): AutopilotDependencies, AutopilotStatus, chooseBid(), FreelancerAutopilot, matchedProfileJobs(), mentionedAmounts(), proposalFor(), rateLimited() (+8 more)

### Community 19 - "DPAPI Integration Vault"
Cohesion: 0.20
Nodes (9): IntegrationVault, VaultKey, CalendarMap, Client, Event, MemoryVault, Token, fixture (+1 more)

### Community 20 - "Server Assembly (index.ts)"
Cohesion: 0.08
Nodes (35): LinkedInEnvironmentCredentials, parseLinkedInEnvironment(), readLinkedInEnvironment(), autopilot, browserBidding, businessSync, chrome, createFreelancerReader() (+27 more)

### Community 22 - "Office Floor Layout"
Cohesion: 0.10
Nodes (23): BACK_BOARDS, BOARD_SIZE, BOARDS, BREAK_SLOTS, BROWSER_DESK, corridorZ(), dayPhase(), LEAD_DESK (+15 more)

### Community 23 - "private.mjs"
Cohesion: 0.20
Nodes (14): hermesLine(), killTree(), logFile, pidFile, pidsOnPorts(), pnpm(), portOpen(), ports (+6 more)

### Community 24 - "Opportunities & Pipeline UI"
Cohesion: 0.30
Nodes (20): BidDraft, Opportunity, formatMoney(), matchesSource(), opportunitySource(), projectLink(), SOURCE_OPTIONS, SourceKey (+12 more)

### Community 25 - "projects.co.id Page"
Cohesion: 0.13
Nodes (17): ProjectsCoIdEntry, date(), daysUntil(), fieldLabel, modeLabels, ProjectEntry(), ProjectsCoIdPage(), rupiah() (+9 more)

### Community 26 - "persistence/src/index.ts"
Cohesion: 0.15
Nodes (11): createApp(), isSameOrigin(), fixedNow, setup(), assignees, list, insertTestOpportunity(), testOpportunity (+3 more)

### Community 28 - "E2E & Browser Verify Scripts"
Cohesion: 0.08
Nodes (19): { chromium }, ROUTES, address, { chromium }, identity, input, require, server (+11 more)

### Community 29 - "controllers/freelancer.ts"
Cohesion: 0.18
Nodes (12): freelancerController(), freelancerProductionWriteSchema, freelancerSandboxWriteSchema, freelancerSyncSchema, readProductionWriteChecks(), safeFreelancerIdSchema, registerAutopilotRoutes(), modeSchema (+4 more)

### Community 30 - "Card Remodel Verifier"
Cohesion: 0.11
Nodes (21): allRoutes, apiReads, assertFits(), assertFocusTrap(), base, blockedWrites, check(), checkOfficePanels() (+13 more)

### Community 31 - "routes/operations.ts"
Cohesion: 0.13
Nodes (20): registerOperationsRoutes(), Calendar, JobSignal, Messenger, setup(), invoicePrintCss, clientAutomationSchema, date (+12 more)

### Community 32 - "services/hermes-kanban.ts"
Cohesion: 0.24
Nodes (9): HermesKanbanDetail, HermesKanbanStatus, HermesKanbanTask, epoch(), HERMES_BOARD, HermesKanban, taskRow, text() (+1 more)

### Community 33 - "GitHub Env & Schema Migration"
Cohesion: 0.07
Nodes (23): defaults, DraftingEnvironment, parseDraftingEnvironment(), readDraftingEnvironment(), FreelancerEnvironment, parseFreelancerEnvironment(), readFreelancerEnvironment(), GitHubEnvironment (+15 more)

### Community 34 - "App.tsx"
Cohesion: 0.19
Nodes (13): App(), deadlineLabel(), Metric(), queryClient, AgentsPage(), KnowledgePage(), NotFoundPage(), ProfilePage() (+5 more)

### Community 35 - "hermes-team.ts"
Cohesion: 0.22
Nodes (8): description(), employees, FOCUS, missing, profileName(), REPO, soul(), TECH

### Community 36 - "Telegram Project Feed"
Cohesion: 0.13
Nodes (10): ENTITIES, parseTelegramChannel(), plain(), PROJECTS_CO_ID_TELEGRAM_URL, ProjectsCoIdTelegram, readCapped(), TelegramProjectPost, TelegramReadError (+2 more)

### Community 37 - "vitest"
Cohesion: 0.15
Nodes (14): CARD_QUERIES, CardDataKind, CardDataSummary, DataState, isCardQuery(), summarizeCardData(), connectLive(), LIVE_STATE_LABELS (+6 more)

### Community 38 - "Product Principles (Docs)"
Cohesion: 0.16
Nodes (10): Freelancer Virtual House / Mission Control, fresh() helper (drop stale data on isError), OfficeShell, VisualOffice 3D scene, Web entry HTML (root div + main.tsx), antislop Delivery Gate, Camera-relative movement, Owner character movement and collisions (+2 more)

### Community 39 - "controllers/hermes-kanban.ts"
Cohesion: 0.25
Nodes (8): applicationSnapshot(), hermesKanbanController(), idParams, Json, money(), registerHermesKanbanRoutes(), CODE_PROFILES, hermesKanbanTaskSchema

### Community 40 - "Hermes Adapter Package"
Cohesion: 0.13
Nodes (14): dependencies, @fvh/application, @fvh/contracts, zod, exports, @fvh/application, @fvh/contracts, zod (+6 more)

### Community 41 - "services/browser-bidding.ts"
Cohesion: 0.24
Nodes (10): FreelancerBrowserPage, BrowserObservation, confirmedBrowserBid(), isBidEndpoint(), matchesBrowserBid(), readRemainingBids(), record(), body (+2 more)

### Community 42 - "HermesKanbanCard.tsx"
Cohesion: 0.38
Nodes (9): COLUMNS, employee(), HermesKanbanCard(), submit(), STATUS, TaskCard(), TaskResult(), time() (+1 more)

### Community 43 - "services/browser-bidding.ts"
Cohesion: 0.20
Nodes (7): BrowserBidInput, BrowserBidMode, BrowserBidStatus, BrowserIdentity, BrowserBiddingService, canFallbackToBrowser(), FreelancerWriteResult

### Community 44 - "Calendar Page"
Cohesion: 0.23
Nodes (15): useClock(), AGENDA_LABELS, AgendaSummary, calendarDateLabel(), CalendarEvent, calendarMonthCells(), CalendarPage(), CalendarView (+7 more)

### Community 45 - "Application Package"
Cohesion: 0.14
Nodes (13): dependencies, @fvh/contracts, @fvh/domain, @fvh/knowledge, exports, @fvh/contracts, @fvh/domain, @fvh/knowledge (+5 more)

### Community 46 - "persistence/package.json"
Cohesion: 0.10
Nodes (19): dependencies, @fvh/domain, @fvh/knowledge, pg, devDependencies, @electric-sql/pglite, @types/pg, exports (+11 more)

### Community 47 - "api"
Cohesion: 0.19
Nodes (13): api(), jsonRequest(), BrowserBiddingCard(), action(), date(), labels, date(), Field() (+5 more)

### Community 48 - "Browser Bid & Floor-2 Docs"
Cohesion: 0.17
Nodes (9): browser-bid-page.ts DOM driver and request gate, verify-browser-bidding.ts fixture script, Google Calendar OAuth (PKCE, calendar.events.owned), integration-vault.ps1 (DPAPI vault), operation_outbox / operation_documents tables, OperationsService (60 s cycle), WhatsApp via Baileys 7.0.0-rc14, allowBuilds (Baileys / protobufjs scripts blocked) (+1 more)

### Community 49 - "Bidding Modes & Chrome CDP (Docs)"
Cohesion: 0.21
Nodes (10): Policy engine (evaluatePolicy), Bidding modes (API / fallback on 401-403-429 / browser), Browser bid worker (Operator Browser Bid), SharedChromeSession, Coding keyword catalog (182 terms), Policy versioning with HTTP 409 optimistic update, parseProjectsCoIdHref, projectsCoIdSettings (policy JSON) (+2 more)

### Community 50 - "owner-input.ts"
Cohesion: 0.27
Nodes (8): bindOwnerKeyboard(), createOwnerInput(), DIRECTIONS, OwnerDirection, OwnerInput, OwnerMoveInput, ownsKeyboard(), setup()

### Community 51 - "fastify"
Cohesion: 0.18
Nodes (13): activityController(), agendaCategory(), agendaSchema, healthController(), inboxController(), linkedinController(), allowedDevOrigins, AppContext (+5 more)

### Community 52 - "Contracts Package"
Cohesion: 0.17
Nodes (11): dependencies, @fvh/domain, zod, exports, @fvh/domain, zod, name, private (+3 more)

### Community 53 - "database.ts"
Cohesion: 0.24
Nodes (6): createDatabase(), Database, memory(), migrate(), postgres(), Row

### Community 54 - "api.ts"
Cohesion: 0.10
Nodes (25): ApiError, Capabilities, ClientProject, DashboardResponse, FreelancerProductionWriteInput, FreelancerSandboxWriteInput, Inbox, Insights (+17 more)

### Community 56 - "Freelancer Adapter Package"
Cohesion: 0.18
Nodes (10): dependencies, @fvh/domain, exports, @fvh/domain, name, private, scripts, test (+2 more)

### Community 57 - "GitHub Adapter Package"
Cohesion: 0.18
Nodes (10): dependencies, @fvh/knowledge, exports, @fvh/knowledge, name, private, scripts, test (+2 more)

### Community 58 - "knowledge/src/index.ts"
Cohesion: 0.07
Nodes (28): LinkedInClientCredentials, LinkedInApiProfile, profileSchema, readLinkedInProfile(), syncLinkedInProfile(), buildLinkedInAuthorizationUrl(), completeLinkedInAuthorization(), isLoopback() (+20 more)

### Community 59 - "Base TS Config"
Cohesion: 0.18
Nodes (10): compilerOptions, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, module, moduleResolution, noUncheckedIndexedAccess, resolveJsonModule, skipLibCheck (+2 more)

### Community 60 - "Security & Hermes Consent (Docs)"
Cohesion: 0.22
Nodes (7): Credential store (Windows DPAPI), HermesCliDraftingAdapter, FVH_AI_DATA_CONSENT, Hermes cron "FVH review", Untrusted brief/repo injection protection, Threat model, Optional sources configuration (Freelancer, GitHub, LinkedIn, Hermes)

### Community 61 - "Server TS Config"
Cohesion: 0.20
Nodes (9): compilerOptions, outDir, rootDir, sourceMap, types, exclude, extends, include (+1 more)

### Community 62 - "OperationsRepository"
Cohesion: 0.19
Nodes (4): OutboxMessage, Queryable, DocumentKind, OperationsRepository

### Community 63 - "domain/src/index.ts"
Cohesion: 0.24
Nodes (12): paymentReminder(), dp, invoice, project, escape(), invoiceHtml(), currencyDigits(), Invoice (+4 more)

### Community 64 - "Autopilot Decisions (Docs)"
Cohesion: 0.25
Nodes (4): FreelancerAutopilot, Kill switch (Jeda automasi), publicPortfolio resolver (public GitHub repos only), Policy-bounded autonomous bidding (README)

### Community 65 - "services/browser-bidding.test.ts"
Cohesion: 0.16
Nodes (9): projectsCoId, connectExistingChrome(), openWorkerTab(), SharedChromeSession, fixture, input, FreelancerWriteError, playwright-core (+1 more)

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
Cohesion: 0.21
Nodes (13): githubSyncSchema, knowledgeController(), SyncJob, draftUpdateSchema, projectsController(), paramsSchema, registerKnowledgeRoutes(), registerProjectsRoutes() (+5 more)

### Community 74 - "whatsapp-status.ts"
Cohesion: 0.17
Nodes (9): checkWhatsAppStatus(), states, WhatsAppCheck, WhatsAppSession, whatsappStateLabels, WhatsAppStatus(), transitionPipeline(), transitions (+1 more)

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

### Community 84 - "BrowserBidError"
Cohesion: 0.32
Nodes (3): ProjectsCoIdPage, BrowserBidError, ProjectsCoIdObservation

### Community 86 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, start, test, test:smoke, typecheck

### Community 88 - "OfficeEnvironment.tsx"
Cohesion: 0.24
Nodes (9): CourtyardPlant(), OfficeEnvironment(), OfficeEnvironmentProps, Phase, Slab(), V3, FLOOR, FLOOR_TWO_PODS (+1 more)

### Community 89 - "OfficeObjects.tsx"
Cohesion: 0.36
Nodes (7): InteractiveObject(), labelTexture(), ObjectLabel(), OfficeObjects(), OfficeObjectsProps, BoardId, three

### Community 93 - "drafting.ts"
Cohesion: 0.50
Nodes (3): DraftingInput, DraftingOutput, ProfileFact

## Ambiguous Edges - Review These
- `VisualOffice 3D scene` → `Design direction (chalk/ink, pine, copper)`  [AMBIGUOUS]
  DESIGN.md · relation: conceptually_related_to
- `Policy-bounded autonomous bidding (README)` → `Hermes proposal guard and template fallback`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Owner decision: fully automatic bidding` → `No marketplace write (MVP boundary)`  [AMBIGUOUS]
  docs/threat-model.md · relation: conceptually_related_to

## Knowledge Gaps
- **60 isolated node(s):** `eslint`, `@types/node`, `typescript`, `@fvh/domain`, `@types/react` (+55 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 636 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `whatsapp-status.ts` to `Freelancer Adapter & BusinessSync`, `OfficeShell.tsx`, `adapter-hermes/src/index.ts`, `ui.tsx`, `Domain Scoring & Policy Engine`, `OfficeAgent.tsx`, `services/projects-co-id.ts`, `Root Tooling & Lint`, `Owner Movement & Desks`, `Live Events (SSE) Server`, `Freelancer Autopilot`, `DPAPI Integration Vault`, `Server Assembly (index.ts)`, `Office Floor Layout`, `projects.co.id Page`, `persistence/src/index.ts`, `isTabletShortcut`, `routes/operations.ts`, `GitHub Env & Schema Migration`, `Telegram Project Feed`, `vitest`, `services/browser-bidding.ts`, `owner-input.ts`, `database.ts`, `api.ts`, `knowledge/src/index.ts`, `domain/src/index.ts`, `services/browser-bidding.test.ts`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **What connects `eslint`, `@types/node`, `typescript` to the rest of the system?**
  _60 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Freelancer Adapter & BusinessSync` be split into smaller, more focused modules?**
  _Cohesion score 0.05690834473324213 - nodes in this community are weakly interconnected._
- **Why does `WorkspaceRepository` connect `Workspace Repository (Postgres)` to `Freelancer Adapter & BusinessSync`, `knowledge/src/index.ts`, `Telegram Project Feed`, `Domain Scoring & Policy Engine`, `services/projects-co-id.ts`, `projects.co.id Worker`, `Live Events (SSE) Server`, `Health & Capabilities Controllers`, `Freelancer Autopilot`, `DPAPI Integration Vault`, `Server Assembly (index.ts)`, `drafting.ts`, `database.ts`, `persistence/src/index.ts`, `E2E & Browser Verify Scripts`, `controllers/freelancer.ts`, `OperationsRepository`, `routes/operations.ts`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **Should `Workspace Repository (Postgres)` be split into smaller, more focused modules?**
  _Cohesion score 0.055944055944055944 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `VisualOffice 3D scene` and `Design direction (chalk/ink, pine, copper)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Policy-bounded autonomous bidding (README)` and `Hermes proposal guard and template fallback`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._