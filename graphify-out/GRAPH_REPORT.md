# Graph Report - private-ai-house  (2026-10-23)

## Corpus Check
- 226 files · ~121,730 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .example 1, .css 1)

## Summary
- 1685 nodes · 3996 edges · 98 communities (89 shown, 9 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 101 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6da3be74`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- adapter-freelancer/src/index.ts
- WorkspaceRepository
- OfficeShell.tsx
- adapter-hermes/src/index.ts
- ui.tsx
- server/package.json
- contracts/src/index.ts
- office-state.ts
- OfficeAgent.tsx
- services/projects-co-id.ts
- Root Tooling & Lint
- 3D Office Scene
- dependencies
- Web Dependencies
- Owner Movement & Desks
- ProjectsCoIdService
- Live Events (SSE) Server
- controllers/hermes-kanban.ts
- Freelancer Autopilot
- DPAPI Integration Vault
- Server Assembly (index.ts)
- Google Calendar & WhatsApp
- Office Floor Layout
- private.mjs
- Opportunities & Pipeline UI
- projects.co.id Page
- hermes-kanban.test.ts
- api
- hermes-team.ts
- app.ts
- .transaction
- routes/operations.ts
- services/hermes-kanban.ts
- migrate-sqlite-to-supabase.mjs
- Audit Projek
- knowledge/src/index.ts
- projects-co-id-types.ts
- live.ts
- Product Principles (Docs)
- GitHubReadAdapter
- Hermes Adapter Package
- HermesKanbanCard.tsx
- autopilot.test.ts
- DpapiIntegrationVault
- Calendar Page
- Application Package
- persistence/package.json
- App.tsx
- Browser Bid & Floor-2 Docs
- owner-input.ts
- shared.ts
- Contracts Package
- database.ts
- api.ts
- Freelancer Adapter Package
- GitHub Adapter Package
- linkedin-oauth.ts
- Base TS Config
- Security & Hermes Consent (Docs)
- Server TS Config
- repository.ts
- ref_node_path
- FreelancerAutopilot
- credential-store.ts
- Web TS Config
- Audit & Bid Data Model (Docs)
- Agent Roster & Hermes Team (Docs)
- Capability Matrix (Docs)
- Domain Package
- Knowledge Package
- Data Platform Decisions (Docs)
- controllers/knowledge.ts
- domain/src/index.ts
- Freelancer Adapter TS Config
- GitHub Adapter TS Config
- Hermes Adapter TS Config
- Application TS Config
- Contracts TS Config
- Domain TS Config
- Knowledge TS Config
- Persistence TS Config
- WhatsAppService
- scripts
- parseJson
- OfficeEnvironment.tsx
- OfficeObjects.tsx
- Private Start Supervisor
- AppContext
- application/src/index.ts
- ai-env.ts
- freelancer-env.ts
- linkedin-env.ts
- google-calendar.ts
- portfolio.ts
- whatsapp-status.ts
- vitest

## God Nodes (most connected - your core abstractions)
1. `WorkspaceRepository` - 79 edges
2. `vitest` - 52 edges
3. `api()` - 46 edges
4. `ErrorNotice()` - 33 edges
5. `fastify` - 32 edges
6. `createApp()` - 32 edges
7. `LoadingPanel()` - 32 edges
8. `PageIntro()` - 31 edges
9. `@tanstack/react-query` - 28 edges
10. `AppContext` - 27 edges

## Surprising Connections (you probably didn't know these)
- `Verifikasi` --references--> `VisualOffice()`  [INFERRED]
  docs/project-audit.md → apps/web/src/office/VisualOffice.tsx
- `Persistence` --references--> `WorkspaceRepository`  [INFERRED]
  docs/project-audit.md → packages/persistence/src/repository.ts
- `Ringkasan` --references--> `WorkspaceRepository`  [INFERRED]
  docs/project-audit.md → packages/persistence/src/repository.ts
- `Capability matrix` --semantically_similar_to--> `Data honesty rule (no simulated data in UI)`  [INFERRED] [semantically similar]
  docs/capability-matrix.md → AGENTS.md
- `integration-vault.ps1 (DPAPI vault)` --semantically_similar_to--> `Credential store (Windows DPAPI)`  [INFERRED] [semantically similar]
  docs/floor-two-operations.md → AGENTS.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Realtime change propagation (DB write to card refresh)** — docs_realtime_announcewrites, docs_realtime_live_topics, docs_realtime_sse_events, agents_officeshell, docs_realtime_carddatastatus [EXTRACTED 1.00]

## Communities (98 total, 9 thin omitted)

### Community 0 - "adapter-freelancer/src/index.ts"
Cohesion: 0.06
Nodes (47): BackoffJob, BusinessSync, BusinessSyncStatus, Dependencies, rateLimited(), RunStatus, safeError(), SyncStep (+39 more)

### Community 1 - "WorkspaceRepository"
Cohesion: 0.09
Nodes (3): P3 — Maintainability, camel(), WorkspaceRepository

### Community 2 - "OfficeShell.tsx"
Cohesion: 0.08
Nodes (30): AuditEvent, BusinessSyncStatus, Payment, OperationsData, OperationSignal, kanbanQuery, officeLearningQuery, PIPELINE_STAGES (+22 more)

### Community 3 - "adapter-hermes/src/index.ts"
Cohesion: 0.06
Nodes (30): OfficeLearningMemory, OfficeLearningSession, OfficeLearningStatus, day(), Employee, nextDay(), OfficeLearningService, sessionSchema (+22 more)

### Community 4 - "ui.tsx"
Cohesion: 0.17
Nodes (22): Autopilot, Inbox, Work, activityTitle(), deadlineLabel(), ActivityRows(), EmptyState(), Metric() (+14 more)

### Community 5 - "server/package.json"
Cohesion: 0.10
Nodes (20): devDependencies, tsx, @types/qrcode, name, private, type, @fastify/static, @fvh/adapter-freelancer (+12 more)

### Community 6 - "contracts/src/index.ts"
Cohesion: 0.09
Nodes (22): dayDiff(), workController(), disabled, projectParams, registerProjectsCoIdRoutes(), registerWorkRoutes(), localDateKey(), createClientProjectSchema (+14 more)

### Community 7 - "office-state.ts"
Cohesion: 0.17
Nodes (14): activityFor(), AgentState, autopilotState(), clientRelationsState(), Derived, deriveOfficeAgents(), leadState(), OfficeContext (+6 more)

### Community 8 - "OfficeAgent.tsx"
Cohesion: 0.15
Nodes (23): Box(), HAIR, Label(), nearbyIdlePeer(), OfficeAgent(), Props, shortestAngle(), SKIN (+15 more)

### Community 9 - "services/projects-co-id.ts"
Cohesion: 0.16
Nodes (4): projectsCoIdPath(), listing, now, projectsCoIdSettingsSchema

### Community 10 - "Root Tooling & Lint"
Cohesion: 0.06
Nodes (32): devDependencies, eslint, @eslint/js, globals, @types/node, typescript, typescript-eslint, vitest (+24 more)

### Community 11 - "3D Office Scene"
Cohesion: 0.18
Nodes (29): spokenOfficeTurn(), B(), Beanbag(), Board(), boardTexture(), Building(), CameraRig(), Chair() (+21 more)

### Community 12 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, fastify, @fastify/static, @fvh/adapter-freelancer, @fvh/adapter-github, @fvh/adapter-hermes, @fvh/application, @fvh/contracts (+7 more)

### Community 13 - "Web Dependencies"
Cohesion: 0.07
Nodes (28): dependencies, @fvh/domain, react, react-dom, react-router, @react-three/fiber, @tanstack/react-query, three (+20 more)

### Community 14 - "Owner Movement & Desks"
Cohesion: 0.14
Nodes (22): OwnerCharacter(), LEAD_DESK, LIFT, liftDoorReached(), MANAGER_DESK, OWNER_SPOT, PODS, PROJECTS_CO_ID_DESK (+14 more)

### Community 16 - "Live Events (SSE) Server"
Cohesion: 0.13
Nodes (12): announceWrites(), Listener, LiveEvents, READ_ONLY_POSTS, ROUTE_TOPICS, routeTopics(), sample(), TABLE_TOPICS (+4 more)

### Community 17 - "controllers/hermes-kanban.ts"
Cohesion: 0.25
Nodes (8): applicationSnapshot(), hermesKanbanController(), idParams, Json, money(), registerHermesKanbanRoutes(), CODE_PROFILES, hermesKanbanTaskSchema

### Community 18 - "Freelancer Autopilot"
Cohesion: 0.11
Nodes (11): AutopilotDependencies, AutopilotStatus, chooseBid(), FreelancerAutopilot, matchedProfileJobs(), mentionedAmounts(), proposalFor(), rateLimited() (+3 more)

### Community 19 - "DPAPI Integration Vault"
Cohesion: 0.38
Nodes (5): IntegrationVault, VaultKey, MemoryVault, fixture, MemoryVault

### Community 20 - "Server Assembly (index.ts)"
Cohesion: 0.08
Nodes (21): businessSync, createFreelancerReader(), credentialScriptPath, credentialStorePath, databaseUrl, draftingConfig, envFile, freelancerEnvironment (+13 more)

### Community 22 - "Office Floor Layout"
Cohesion: 0.10
Nodes (23): BACK_BOARDS, BOARD_SIZE, BOARDS, BoardSlot, BREAK_SLOTS, corridorZ(), dayPhase(), FLOOR (+15 more)

### Community 23 - "private.mjs"
Cohesion: 0.20
Nodes (14): hermesLine(), killTree(), logFile, pidFile, pidsOnPorts(), pnpm(), portOpen(), ports (+6 more)

### Community 24 - "Opportunities & Pipeline UI"
Cohesion: 0.31
Nodes (19): BidDraft, Opportunity, formatMoney(), matchesSource(), opportunitySource(), projectLink(), SOURCE_OPTIONS, SourceKey (+11 more)

### Community 25 - "projects.co.id Page"
Cohesion: 0.16
Nodes (16): ProjectsCoIdStatus, ProjectsCoIdEntry, date(), daysUntil(), fieldLabel, ProjectEntry(), ProjectsCoIdPage(), rupiah() (+8 more)

### Community 26 - "hermes-kanban.test.ts"
Cohesion: 0.40
Nodes (3): hermesKanbanRunner, assignees, list

### Community 27 - "api"
Cohesion: 0.26
Nodes (20): api(), Capabilities, jsonRequest(), formatDate(), OfficeLearningCard(), ErrorNotice(), LoadingPanel(), OperationStatus() (+12 more)

### Community 28 - "hermes-team.ts"
Cohesion: 0.22
Nodes (8): description(), employees, FOCUS, missing, profileName(), REPO, soul(), TECH

### Community 29 - "app.ts"
Cohesion: 0.15
Nodes (18): createApp(), isSameOrigin(), freelancerController(), freelancerSandboxWriteSchema, freelancerSyncSchema, readProductionWriteChecks(), safeFreelancerIdSchema, linkedinController() (+10 more)

### Community 31 - "routes/operations.ts"
Cohesion: 0.05
Nodes (39): fixedNow, Calendar, JobSignal, Messenger, OperationsService, paymentReminder(), dp, invoice (+31 more)

### Community 32 - "services/hermes-kanban.ts"
Cohesion: 0.22
Nodes (9): HermesKanbanDetail, HermesKanbanStatus, HermesKanbanTask, epoch(), HERMES_BOARD, HermesKanban, taskRow, text() (+1 more)

### Community 33 - "migrate-sqlite-to-supabase.mjs"
Cohesion: 0.20
Nodes (8): backup, backupDir, envPath, root, source, sqlitePath, TABLES, url

### Community 34 - "Audit Projek"
Cohesion: 0.05
Nodes (39): Arsitektur, Audit Projek, Domain, Final assessment, Frontend, P0-1. Capability verification belum mengunci aktivasi policy, P0-2. Generic production-write bypass policy, P0-3. HTTP 200 tanpa `resultId` dianggap sukses (+31 more)

### Community 35 - "knowledge/src/index.ts"
Cohesion: 0.13
Nodes (13): LinkedInApiProfile, profileSchema, readLinkedInProfile(), syncLinkedInProfile(), blockedExtensions, blockedPathParts, isEligibleKnowledgePath(), KnowledgeFileInput (+5 more)

### Community 36 - "projects-co-id-types.ts"
Cohesion: 0.19
Nodes (11): mentionedRupiahAmounts(), parseProjectsCoIdHref(), parseProjectsCoIdProject(), PROJECTS_CO_ID_AUTO_REASON, PROJECTS_CO_ID_ORIGIN, PROJECTS_CO_ID_PROPOSAL_LIMIT, ProjectsCoIdListing, ProjectsCoIdObservation (+3 more)

### Community 37 - "live.ts"
Cohesion: 0.13
Nodes (16): CARD_QUERIES, CardDataKind, CardDataSummary, DataState, isCardQuery(), summarizeCardData(), connectLive(), LIVE_STATE_LABELS (+8 more)

### Community 38 - "Product Principles (Docs)"
Cohesion: 0.16
Nodes (10): Freelancer Virtual House / Mission Control, fresh() helper (drop stale data on isError), OfficeShell, VisualOffice 3D scene, Web entry HTML (root div + main.tsx), antislop Delivery Gate, Camera-relative movement, Owner character movement and collisions (+2 more)

### Community 39 - "GitHubReadAdapter"
Cohesion: 0.23
Nodes (5): Fetcher, GitHubFile, GitHubReadAdapter, GitHubReadError, GitHubReadResult

### Community 40 - "Hermes Adapter Package"
Cohesion: 0.13
Nodes (14): dependencies, @fvh/application, @fvh/contracts, zod, exports, @fvh/application, @fvh/contracts, zod (+6 more)

### Community 41 - "HermesKanbanCard.tsx"
Cohesion: 0.44
Nodes (8): COLUMNS, employee(), HermesKanbanCard(), submit(), STATUS, TaskCard(), TaskResult(), time()

### Community 42 - "autopilot.test.ts"
Cohesion: 0.33
Nodes (4): now, profile, project, FreelancerProfile

### Community 44 - "Calendar Page"
Cohesion: 0.26
Nodes (13): AGENDA_LABELS, AgendaSummary, calendarDateLabel(), CalendarEvent, calendarMonthCells(), CalendarView, calendarWeekdays, dateKeyInTimezone() (+5 more)

### Community 45 - "Application Package"
Cohesion: 0.14
Nodes (13): dependencies, @fvh/contracts, @fvh/domain, @fvh/knowledge, exports, @fvh/contracts, @fvh/domain, @fvh/knowledge (+5 more)

### Community 46 - "persistence/package.json"
Cohesion: 0.11
Nodes (17): dependencies, @fvh/domain, @fvh/knowledge, pg, devDependencies, @electric-sql/pglite, @types/pg, exports (+9 more)

### Community 47 - "App.tsx"
Cohesion: 0.16
Nodes (12): App(), queryClient, NotFoundPage(), date(), Field(), localTime(), money(), OperationsPage() (+4 more)

### Community 48 - "Browser Bid & Floor-2 Docs"
Cohesion: 0.25
Nodes (7): Google Calendar OAuth (PKCE, calendar.events.owned), integration-vault.ps1 (DPAPI vault), operation_outbox / operation_documents tables, OperationsService (60 s cycle), WhatsApp via Baileys 7.0.0-rc14, allowBuilds (Baileys / protobufjs scripts blocked), pnpm workspace (apps/*, packages/*)

### Community 50 - "owner-input.ts"
Cohesion: 0.27
Nodes (8): bindOwnerKeyboard(), createOwnerInput(), DIRECTIONS, OwnerDirection, OwnerInput, OwnerMoveInput, ownsKeyboard(), setup()

### Community 51 - "shared.ts"
Cohesion: 0.15
Nodes (16): AppOptions, capabilitiesController(), lastFailureNote(), settingsController(), FreelancerProductionWriteCheck, FreelancerSandboxWriteCheck, linkedinVerification(), CredentialStatus (+8 more)

### Community 52 - "Contracts Package"
Cohesion: 0.17
Nodes (11): dependencies, @fvh/domain, zod, exports, @fvh/domain, zod, name, private (+3 more)

### Community 53 - "database.ts"
Cohesion: 0.18
Nodes (10): repositoryWithBid(), setup(), createDatabase(), Database, memory(), migrate(), postgres(), Row (+2 more)

### Community 54 - "api.ts"
Cohesion: 0.12
Nodes (19): ApiError, ClientProject, DashboardResponse, FreelancerProductionWriteInput, FreelancerSandboxWriteInput, Insights, PipelineItem, Policy (+11 more)

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
Cohesion: 0.14
Nodes (9): BidOutcome, camelKey(), ClientProjectSource, ClientProjectStatus, ClientThread, ServiceProfile, SkipReasonSummary, StoredKnowledgeSource (+1 more)

### Community 63 - "ref_node_path"
Cohesion: 0.17
Nodes (7): GitHubEnvironment, parseGitHubEnvironment(), readGitHubEnvironment(), client, MARKERS, root, url

### Community 64 - "FreelancerAutopilot"
Cohesion: 0.14
Nodes (11): FreelancerAutopilot, Kill switch (Jeda automasi), Policy engine (evaluatePolicy), publicPortfolio resolver (public GitHub repos only), Coding keyword catalog (182 terms), Policy versioning with HTTP 409 optimistic update, parseProjectsCoIdHref, projectsCoIdSettings (policy JSON) (+3 more)

### Community 65 - "credential-store.ts"
Cohesion: 0.33
Nodes (7): linkedinOAuth, deleteLinkedInAccessToken(), getLinkedInAccessToken(), getLinkedInClientCredentials(), runCredentialAction(), storeLinkedInAccessToken(), verifyFreelancerCredential()

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
Cohesion: 0.28
Nodes (8): BID_LIMIT_EXCEEDED account quota, Capability matrix, Freelancer edit_profile capability, freelancer-sdk-python (official SDK), Freelancer sandbox write checks, Freelancer send_message capability (unknown), Freelancer submit_bid capability, GitHub Knowledge Hub sync (blobs, atomic replace)

### Community 70 - "Domain Package"
Cohesion: 0.25
Nodes (7): exports, name, private, scripts, test, typecheck, type

### Community 71 - "Knowledge Package"
Cohesion: 0.25
Nodes (7): exports, name, private, scripts, test, typecheck, type

### Community 72 - "Data Platform Decisions (Docs)"
Cohesion: 0.33
Nodes (5): Supabase Postgres schema fvh, LinkedIn /userinfo OIDC sync, Postgres ssl.rejectUnauthorized=false finding, announceWrites (table to topic), LIVE_TOPICS / TOPIC_QUERY_KEYS

### Community 73 - "controllers/knowledge.ts"
Cohesion: 0.21
Nodes (8): policyController(), profileController(), parseBody(), registerPolicyRoutes(), registerProfileRoutes(), activatePolicySchema, updatePolicySchema, updateProfileSchema

### Community 74 - "domain/src/index.ts"
Cohesion: 0.06
Nodes (39): P1-2. Pipeline transition tidak ditegakkan di repository, AiDraftingPort, DraftingInput, DraftingOutput, FixtureDraftingAdapter, ProfileFact, UnavailableDraftingAdapter, decideBid() (+31 more)

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

### Community 87 - "parseJson"
Cohesion: 0.13
Nodes (3): initialPolicy(), initialProfile(), parseJson()

### Community 88 - "OfficeEnvironment.tsx"
Cohesion: 0.33
Nodes (10): Bookcase(), CeilingStructure(), OakFloor(), OfficeEnvironment(), OfficeEnvironmentProps, Phase, Slab(), V3 (+2 more)

### Community 89 - "OfficeObjects.tsx"
Cohesion: 0.36
Nodes (7): InteractiveObject(), labelTexture(), ObjectLabel(), OfficeObjects(), OfficeObjectsProps, BoardId, @react-three/fiber

### Community 95 - "AppContext"
Cohesion: 0.23
Nodes (9): activityController(), agendaCategory(), agendaSchema, healthController(), inboxController(), AppContext, registerActivityRoutes(), registerHealthRoutes() (+1 more)

### Community 96 - "application/src/index.ts"
Cohesion: 0.19
Nodes (14): githubSyncSchema, knowledgeController(), SyncJob, draftUpdateSchema, projectsController(), paramsSchema, validProjectsCoIdProposal(), registerKnowledgeRoutes() (+6 more)

### Community 97 - "ai-env.ts"
Cohesion: 0.47
Nodes (4): defaults, DraftingEnvironment, parseDraftingEnvironment(), readDraftingEnvironment()

### Community 98 - "freelancer-env.ts"
Cohesion: 0.60
Nodes (3): FreelancerEnvironment, parseFreelancerEnvironment(), readFreelancerEnvironment()

### Community 99 - "linkedin-env.ts"
Cohesion: 0.47
Nodes (4): LinkedInEnvironmentCredentials, parseLinkedInEnvironment(), readLinkedInEnvironment(), LinkedInClientCredentials

### Community 100 - "google-calendar.ts"
Cohesion: 0.33
Nodes (6): CalendarMap, Client, Event, Token, P1-9. Google token/client JSON tidak divalidasi schema, OwnerTask

### Community 101 - "portfolio.ts"
Cohesion: 0.38
Nodes (3): autopilot, PublicPortfolioResolver, DraftingEvidence

### Community 104 - "whatsapp-status.ts"
Cohesion: 0.36
Nodes (6): checkWhatsAppStatus(), states, WhatsAppCheck, WhatsAppSession, whatsappStateLabels, WhatsAppStatus()

## Ambiguous Edges - Review These
- `VisualOffice 3D scene` → `Design direction (chalk/ink, pine, copper)`  [AMBIGUOUS]
  DESIGN.md · relation: conceptually_related_to
- `Policy-bounded autonomous bidding (README)` → `Hermes proposal guard and template fallback`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Owner decision: fully automatic bidding` → `No marketplace write (MVP boundary)`  [AMBIGUOUS]
  docs/threat-model.md · relation: conceptually_related_to

## Knowledge Gaps
- **57 isolated node(s):** `@fvh/adapter-freelancer`, `@fvh/adapter-github`, `@fvh/adapter-hermes`, `@fvh/application`, `@fvh/contracts` (+52 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 633 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `knowledge/src/index.ts` to `adapter-freelancer/src/index.ts`, `OfficeShell.tsx`, `adapter-hermes/src/index.ts`, `ui.tsx`, `OfficeAgent.tsx`, `services/projects-co-id.ts`, `Root Tooling & Lint`, `Owner Movement & Desks`, `Live Events (SSE) Server`, `DPAPI Integration Vault`, `Office Floor Layout`, `projects.co.id Page`, `hermes-kanban.test.ts`, `app.ts`, `routes/operations.ts`, `live.ts`, `GitHubReadAdapter`, `autopilot.test.ts`, `owner-input.ts`, `shared.ts`, `api.ts`, `linkedin-oauth.ts`, `ref_node_path`, `domain/src/index.ts`, `ai-env.ts`, `freelancer-env.ts`, `linkedin-env.ts`, `portfolio.ts`, `whatsapp-status.ts`, `vitest`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `WorkspaceRepository` (e.g. with `Persistence` and `Ringkasan`) actually correct?**
  _`WorkspaceRepository` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@fvh/adapter-freelancer`, `@fvh/adapter-github`, `@fvh/adapter-hermes` to the rest of the system?**
  _57 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `adapter-freelancer/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.055381400208986416 - nodes in this community are weakly interconnected._
- **Why does `WorkspaceRepository` connect `WorkspaceRepository` to `adapter-freelancer/src/index.ts`, `Audit Projek`, `knowledge/src/index.ts`, `adapter-hermes/src/index.ts`, `Live Events (SSE) Server`, `shared.ts`, `DPAPI Integration Vault`, `database.ts`, `.transaction`, `parseJson`, `hermes-kanban.test.ts`, `app.ts`, `repository.ts`, `routes/operations.ts`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `VisualOffice 3D scene` and `Design direction (chalk/ink, pine, copper)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Policy-bounded autonomous bidding (README)` and `Hermes proposal guard and template fallback`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._