# Graph Report - private-ai-house  (2026-10-28)

## Corpus Check
- 276 files · ~156,885 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .example 1, .css 1)

## Summary
- 1945 nodes · 4635 edges · 104 communities (96 shown, 8 thin omitted)
- Extraction: 97% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 113 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4a3e0f33`
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
- candidate-tasks.ts
- OfficeAgent.tsx
- services/autopilot.ts
- Root Tooling & Lint
- 3D Office Scene
- App.tsx
- Web Dependencies
- Owner Movement & Desks
- DiscordKanbanMonitor
- Live Events (SSE) Server
- domain/src/index.ts
- owner-input.ts
- DpapiIntegrationVault
- Server Assembly (index.ts)
- Google Calendar & WhatsApp
- Office Floor Layout
- HermesKanban
- Opportunities & Pipeline UI
- projects.co.id Page
- app.test.ts
- services/projects-co-id.ts
- services/hermes-kanban.ts
- InboxPage.tsx
- parseJson
- HermesKanbanCard.tsx
- ref_node_fs
- ProjectsCoIdService
- Audit Projek
- knowledge/src/index.ts
- shared.ts
- live.ts
- Product Principles (Docs)
- GitHubReadAdapter
- Hermes Adapter Package
- office-state.ts
- dependencies
- controllers/candidates.ts
- Calendar Page
- Application Package
- persistence/package.json
- api.ts
- Browser Bid & Floor-2 Docs
- google-calendar.ts
- hermes-team.ts
- app.ts
- Contracts Package
- database.ts
- api
- Audit orchestration — 23 Oktober 2026
- Freelancer Adapter Package
- GitHub Adapter Package
- linkedin-oauth.ts
- Base TS Config
- Security & Hermes Consent (Docs)
- Server TS Config
- repository.ts
- controllers/inbox.ts
- FreelancerAutopilot
- credential-store.ts
- Web TS Config
- Audit & Bid Data Model (Docs)
- Agent Roster & Hermes Team (Docs)
- Capability Matrix (Docs)
- Domain Package
- Knowledge Package
- Data Platform Decisions (Docs)
- application/src/index.ts
- types.ts
- CardDataStatus.tsx
- Freelancer Adapter TS Config
- GitHub Adapter TS Config
- Hermes Adapter TS Config
- Application TS Config
- Contracts TS Config
- Domain TS Config
- Knowledge TS Config
- Persistence TS Config
- portfolio.ts
- controllers/hermes-kanban.ts
- bid-analytics.ts
- .transaction
- OfficeEnvironment.tsx
- OfficeObjects.tsx
- Private Start Supervisor
- .detail
- IntegrationVault
- P1 — Data consistency dan reliability
- scripts
- WhatsAppService
- ref_node_path
- linkedin-env.ts
- freelancer-env.ts
- drafting.ts
- vitest
- whatsapp-status.ts

## God Nodes (most connected - your core abstractions)
1. `WorkspaceRepository` - 106 edges
2. `vitest` - 62 edges
3. `api()` - 47 edges
4. `createApp()` - 35 edges
5. `fastify` - 35 edges
6. `ErrorNotice()` - 34 edges
7. `jsonRequest()` - 32 edges
8. `LoadingPanel()` - 32 edges
9. `PageIntro()` - 31 edges
10. `formatDate()` - 31 edges

## Surprising Connections (you probably didn't know these)
- `Persistence` --references--> `WorkspaceRepository`  [INFERRED]
  docs/project-audit.md → packages/persistence/src/repository.ts
- `Ringkasan` --references--> `WorkspaceRepository`  [INFERRED]
  docs/project-audit.md → packages/persistence/src/repository.ts
- `Verifikasi` --references--> `VisualOffice()`  [INFERRED]
  docs/project-audit.md → apps/web/src/office/VisualOffice.tsx
- `Acuan dan alur aktual` --references--> `TaskBoardPage()`  [INFERRED]
  docs/orchestration-audit-2026-10-23.md → apps/web/src/views/TaskBoardPage.tsx
- `Acuan dan alur aktual` --references--> `HermesKanbanCard()`  [INFERRED]
  docs/orchestration-audit-2026-10-23.md → apps/web/src/components/HermesKanbanCard.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Realtime change propagation (DB write to card refresh)** — docs_realtime_announcewrites, docs_realtime_live_topics, docs_realtime_sse_events, agents_officeshell, docs_realtime_carddatastatus [EXTRACTED 1.00]

## Communities (104 total, 8 thin omitted)

### Community 0 - "adapter-freelancer/src/index.ts"
Cohesion: 0.06
Nodes (47): BackoffJob, BusinessSync, BusinessSyncStatus, Dependencies, rateLimited(), RunStatus, safeError(), SyncStep (+39 more)

### Community 1 - "WorkspaceRepository"
Cohesion: 0.06
Nodes (10): AuditEvent, seedReferences(), camel(), camelKey(), jsonArray(), messageAnalysisRow(), mission(), missionLease() (+2 more)

### Community 2 - "OfficeShell.tsx"
Cohesion: 0.10
Nodes (30): activityTitle(), BOARD_ACCENTS, buildBoards(), initials(), moneyList(), OfficeIcon(), OfficeIconName, OfficeShell() (+22 more)

### Community 3 - "adapter-hermes/src/index.ts"
Cohesion: 0.06
Nodes (30): OfficeLearningMemory, OfficeLearningSession, OfficeLearningStatus, day(), discussionBlocked(), Employee, nextDay(), OfficeLearningService (+22 more)

### Community 4 - "ui.tsx"
Cohesion: 0.20
Nodes (24): AuditEvent, Autopilot, jsonRequest(), deadlineLabel(), PIPELINE_STAGES, recover(), ActivityRows(), EmptyState() (+16 more)

### Community 5 - "server/package.json"
Cohesion: 0.10
Nodes (20): devDependencies, tsx, @types/qrcode, name, private, type, @fastify/static, @fvh/adapter-freelancer (+12 more)

### Community 6 - "contracts/src/index.ts"
Cohesion: 0.09
Nodes (22): profileController(), parseBody(), dayDiff(), workController(), registerProfileRoutes(), registerWorkRoutes(), localDateKey(), activatePolicySchema (+14 more)

### Community 7 - "candidate-tasks.ts"
Cohesion: 0.07
Nodes (27): CandidateTaskError, CandidateTaskErrorCode, CandidateTaskService, Dependencies, PRIORITY, analysedFixture(), GOOD, linkedFixture() (+19 more)

### Community 8 - "OfficeAgent.tsx"
Cohesion: 0.13
Nodes (24): Box(), HAIR, Label(), nearbyIdlePeer(), OfficeAgent(), Props, shortestAngle(), SKIN (+16 more)

### Community 9 - "services/autopilot.ts"
Cohesion: 0.09
Nodes (15): AutopilotDependencies, AutopilotStatus, chooseBid(), FreelancerAutopilot, matchedProfileJobs(), mentionedAmounts(), proposalFor(), rateLimited() (+7 more)

### Community 10 - "Root Tooling & Lint"
Cohesion: 0.06
Nodes (32): devDependencies, eslint, @eslint/js, globals, @types/node, typescript, typescript-eslint, vitest (+24 more)

### Community 11 - "3D Office Scene"
Cohesion: 0.18
Nodes (28): B(), Beanbag(), Board(), boardTexture(), Building(), CameraRig(), Chair(), Label() (+20 more)

### Community 12 - "App.tsx"
Cohesion: 0.12
Nodes (22): Capabilities, Policy, Profile, App(), Metric(), queryClient, KnowledgePage(), NotFoundPage() (+14 more)

### Community 13 - "Web Dependencies"
Cohesion: 0.07
Nodes (28): dependencies, @fvh/domain, react, react-dom, react-router, @react-three/fiber, @tanstack/react-query, three (+20 more)

### Community 14 - "Owner Movement & Desks"
Cohesion: 0.14
Nodes (21): OwnerCharacter(), LEAD_DESK, LIFT, liftDoorReached(), MANAGER_DESK, PODS, PROJECTS_CO_ID_DESK, createOwnerMotion() (+13 more)

### Community 15 - "DiscordKanbanMonitor"
Cohesion: 0.07
Nodes (25): DiscordApiError, discordCalendarEmbed(), DiscordCalendarMessage, DiscordCalendarTask, DiscordChannel, DiscordConfig, DiscordKanbanMonitor, DiscordMessage (+17 more)

### Community 16 - "Live Events (SSE) Server"
Cohesion: 0.13
Nodes (12): announceWrites(), Listener, LiveEvents, READ_ONLY_POSTS, ROUTE_TOPICS, routeTopics(), sample(), TABLE_TOPICS (+4 more)

### Community 17 - "domain/src/index.ts"
Cohesion: 0.05
Nodes (41): registerOperationsRoutes(), Calendar, JobSignal, Messenger, OperationsService, paymentReminder(), dp, invoice (+33 more)

### Community 18 - "owner-input.ts"
Cohesion: 0.27
Nodes (8): bindOwnerKeyboard(), createOwnerInput(), DIRECTIONS, OwnerDirection, OwnerInput, OwnerMoveInput, ownsKeyboard(), setup()

### Community 20 - "Server Assembly (index.ts)"
Cohesion: 0.07
Nodes (23): autopilot, businessSync, candidateTasks, createFreelancerReader(), credentialScriptPath, credentialStorePath, databaseUrl, draftingConfig (+15 more)

### Community 22 - "Office Floor Layout"
Cohesion: 0.11
Nodes (19): BACK_BOARDS, BOARD_SIZE, BOARDS, BoardSlot, BREAK_SLOTS, corridorZ(), dayPhase(), FLOOR (+11 more)

### Community 23 - "HermesKanban"
Cohesion: 0.23
Nodes (5): HermesKanbanStatus, HermesKanbanTask, HermesKanban, isLegacyPlan(), isPlan()

### Community 24 - "Opportunities & Pipeline UI"
Cohesion: 0.33
Nodes (18): BidDraft, Opportunity, formatMoney(), matchesSource(), opportunitySource(), projectLink(), SOURCE_OPTIONS, SourceKey (+10 more)

### Community 25 - "projects.co.id Page"
Cohesion: 0.11
Nodes (16): BusinessSyncStatus, ProjectsCoIdEntry, date(), daysUntil(), fieldLabel, ProjectEntry(), ProjectsCoIdPage(), rupiah() (+8 more)

### Community 26 - "app.test.ts"
Cohesion: 0.24
Nodes (3): fixedNow, insertTestOpportunity(), testOpportunity

### Community 27 - "services/projects-co-id.ts"
Cohesion: 0.13
Nodes (15): mentionedRupiahAmounts(), parseProjectsCoIdHref(), parseProjectsCoIdProject(), PROJECTS_CO_ID_AUTO_REASON, PROJECTS_CO_ID_ORIGIN, PROJECTS_CO_ID_PROPOSAL_LIMIT, ProjectsCoIdObservation, projectsCoIdPath() (+7 more)

### Community 28 - "services/hermes-kanban.ts"
Cohesion: 0.15
Nodes (16): HERMES_BOARD, hermesKanbanRunner, taskRow, assignees, list, CODE_PROFILES, DATA_PLAN_AUTHOR, FINAL_AUTHOR (+8 more)

### Community 29 - "InboxPage.tsx"
Cohesion: 0.18
Nodes (17): CandidateTask, MessageAnalysis, MessageSnapshotView, formatDate(), CandidateSection(), CandidateSectionProps, CLASSIFICATION_LABEL, emptyReply() (+9 more)

### Community 30 - "parseJson"
Cohesion: 0.16
Nodes (6): P1-2. Pipeline transition tidak ditegakkan di repository, transitionPipeline(), transitions, BidDraft, PipelineStatus, parseJson()

### Community 31 - "HermesKanbanCard.tsx"
Cohesion: 0.31
Nodes (11): HermesKanbanDetail, COLUMNS, employee(), HermesKanbanCard(), submit(), STATUS, TaskCard(), TaskResult() (+3 more)

### Community 32 - "ref_node_fs"
Cohesion: 0.18
Nodes (14): hermesLine(), killTree(), logFile, pidFile, pidsOnPorts(), pnpm(), portOpen(), ports (+6 more)

### Community 33 - "ProjectsCoIdService"
Cohesion: 0.19
Nodes (3): ProjectsCoIdListing, ProjectsCoIdStatus, ProjectsCoIdService

### Community 34 - "Audit Projek"
Cohesion: 0.06
Nodes (30): Arsitektur, Audit Projek, Domain, Final assessment, Frontend, P0-1. Capability verification belum mengunci aktivasi policy, P0-3. HTTP 200 tanpa `resultId` dianggap sukses, P0-4. PostgreSQL TLS certificate verification dimatikan (+22 more)

### Community 35 - "knowledge/src/index.ts"
Cohesion: 0.17
Nodes (11): LinkedInApiProfile, profileSchema, readLinkedInProfile(), blockedExtensions, blockedPathParts, isEligibleKnowledgePath(), KnowledgeFileInput, KnowledgeResult (+3 more)

### Community 36 - "shared.ts"
Cohesion: 0.15
Nodes (19): AppOptions, capabilitiesController(), lastFailureNote(), healthController(), linkedinController(), settingsController(), allowedDevOrigins, AppContext (+11 more)

### Community 37 - "live.ts"
Cohesion: 0.27
Nodes (6): connectLive(), queryKeysFor(), TOPIC_QUERY_KEYS, useLiveUpdates(), LIVE_TOPICS, LiveTopic

### Community 38 - "Product Principles (Docs)"
Cohesion: 0.16
Nodes (10): Freelancer Virtual House / Mission Control, fresh() helper (drop stale data on isError), OfficeShell, VisualOffice 3D scene, Web entry HTML (root div + main.tsx), antislop Delivery Gate, Camera-relative movement, Owner character movement and collisions (+2 more)

### Community 39 - "GitHubReadAdapter"
Cohesion: 0.23
Nodes (5): Fetcher, GitHubFile, GitHubReadAdapter, GitHubReadError, GitHubReadResult

### Community 40 - "Hermes Adapter Package"
Cohesion: 0.13
Nodes (14): dependencies, @fvh/application, @fvh/contracts, zod, exports, @fvh/application, @fvh/contracts, zod (+6 more)

### Community 41 - "office-state.ts"
Cohesion: 0.15
Nodes (15): OperationsData, activityFor(), AgentState, autopilotState(), clientRelationsState(), Derived, deriveOfficeAgents(), leadState() (+7 more)

### Community 42 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, fastify, @fastify/static, @fvh/adapter-freelancer, @fvh/adapter-github, @fvh/adapter-hermes, @fvh/application, @fvh/contracts (+7 more)

### Community 43 - "controllers/candidates.ts"
Cohesion: 0.19
Nodes (13): candidateFailure(), candidateId(), candidatesController(), candidateView(), registerCandidateRoutes(), ConfirmCandidateTaskInput, confirmCandidateTaskSchema, convertCandidateTaskSchema (+5 more)

### Community 44 - "Calendar Page"
Cohesion: 0.23
Nodes (15): useClock(), AGENDA_LABELS, AgendaSummary, calendarDateLabel(), CalendarEvent, calendarMonthCells(), CalendarPage(), CalendarView (+7 more)

### Community 45 - "Application Package"
Cohesion: 0.14
Nodes (13): dependencies, @fvh/contracts, @fvh/domain, @fvh/knowledge, exports, @fvh/contracts, @fvh/domain, @fvh/knowledge (+5 more)

### Community 46 - "persistence/package.json"
Cohesion: 0.11
Nodes (18): dependencies, @fvh/domain, @fvh/knowledge, pg, devDependencies, @electric-sql/pglite, @types/pg, exports (+10 more)

### Community 47 - "api.ts"
Cohesion: 0.10
Nodes (25): BidOutcomeBucket, ClientProject, DailyPriority, DashboardResponse, FreelancerProductionWriteInput, FreelancerSandboxWriteInput, Inbox, Insights (+17 more)

### Community 48 - "Browser Bid & Floor-2 Docs"
Cohesion: 0.25
Nodes (7): Google Calendar OAuth (PKCE, calendar.events.owned), integration-vault.ps1 (DPAPI vault), operation_outbox / operation_documents tables, OperationsService (60 s cycle), WhatsApp via Baileys 7.0.0-rc14, allowBuilds (Baileys / protobufjs scripts blocked), pnpm workspace (apps/*, packages/*)

### Community 49 - "google-calendar.ts"
Cohesion: 0.40
Nodes (5): CalendarMap, Client, Event, Token, P1-9. Google token/client JSON tidak divalidasi schema

### Community 50 - "hermes-team.ts"
Cohesion: 0.18
Nodes (11): boardPath, description(), employees, FOCUS, metadata, missing, profileName(), project (+3 more)

### Community 51 - "app.ts"
Cohesion: 0.11
Nodes (25): createApp(), isSameOrigin(), activityController(), agendaCategory(), agendaSchema, freelancerController(), freelancerSandboxWriteSchema, freelancerSyncSchema (+17 more)

### Community 52 - "Contracts Package"
Cohesion: 0.17
Nodes (11): dependencies, @fvh/domain, zod, exports, @fvh/domain, zod, name, private (+3 more)

### Community 53 - "database.ts"
Cohesion: 0.17
Nodes (9): repositoryWithBid(), setup(), createDatabase(), Database, memory(), migrate(), postgres(), Row (+1 more)

### Community 54 - "api"
Cohesion: 0.33
Nodes (8): api(), ApiError, kanbanQuery, officeLearningQuery, employeeName(), OfficeLearningCard(), AgentCopy, AgentsPage()

### Community 55 - "Audit orchestration — 23 Oktober 2026"
Cohesion: 0.14
Nodes (13): 1. P1 — Tujuan multiagen tidak mempunyai tahap sintesis yang dijamin berjalan, 2. P1 — Worktree repo belum terjamin untuk kartu kode, 3. P2 — Permintaan baru yang identik kembali ke kartu lama, 4. P2 — Keterbacaan board dianggap sebagai kesiapan eksekusi, 5. P2 — Pemulihan dan penelusuran dependency belum lengkap di UI/API, Acuan dan alur aktual, Audit orchestration — 23 Oktober 2026, Guardrail dan observability yang masih terbatas (+5 more)

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
Cohesion: 0.07
Nodes (10): chooseProjectsCoIdBid(), projectsCoIdDraftPolicy(), projectsCoIdSettings(), BidOutcome, ClientProjectSource, ClientProjectStatus, ClientThread, ServiceProfile (+2 more)

### Community 63 - "controllers/inbox.ts"
Cohesion: 0.23
Nodes (7): analysisView(), analyzeFailure(), inboxController(), MessageAnalysisView, MessageSnapshotView, snapshotView(), registerInboxRoutes()

### Community 64 - "FreelancerAutopilot"
Cohesion: 0.14
Nodes (11): FreelancerAutopilot, Kill switch (Jeda automasi), Policy engine (evaluatePolicy), publicPortfolio resolver (public GitHub repos only), Coding keyword catalog (182 terms), Policy versioning with HTTP 409 optimistic update, parseProjectsCoIdHref, projectsCoIdSettings (policy JSON) (+3 more)

### Community 65 - "credential-store.ts"
Cohesion: 0.22
Nodes (11): linkedinOAuth, deleteLinkedInAccessToken(), getFreelancerAccessToken(), getLinkedInAccessToken(), getLinkedInClientCredentials(), isDpapiCiphertext(), readCredentialStatus(), runCredentialAction() (+3 more)

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

### Community 73 - "application/src/index.ts"
Cohesion: 0.21
Nodes (13): githubSyncSchema, knowledgeController(), SyncJob, draftUpdateSchema, projectsController(), paramsSchema, registerKnowledgeRoutes(), registerProjectsRoutes() (+5 more)

### Community 74 - "types.ts"
Cohesion: 0.09
Nodes (26): decideBid(), CODING_KEYWORD_GROUPS, CODING_KEYWORDS, matchesProjectKeyword(), normalizeKeywords(), selectSearchTerms(), decision(), evaluatePolicy() (+18 more)

### Community 75 - "CardDataStatus.tsx"
Cohesion: 0.24
Nodes (10): CARD_QUERIES, CardDataKind, CardDataSummary, DataState, isCardQuery(), summarizeCardData(), LIVE_STATE_LABELS, LiveState (+2 more)

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

### Community 85 - "controllers/hermes-kanban.ts"
Cohesion: 0.25
Nodes (8): applicationSnapshot(), hermesKanbanController(), idParams, Json, money(), registerHermesKanbanRoutes(), hermesKanbanRecoverySchema, hermesKanbanTaskSchema

### Community 86 - "bid-analytics.ts"
Cohesion: 0.27
Nodes (9): add(), bidAnalytics, BidAnalyticsRow, BidOutcomeBucket, bucket(), MIN_DECIDED_SAMPLE, monthKey(), PRICE_BANDS (+1 more)

### Community 87 - ".transaction"
Cohesion: 0.14
Nodes (6): syncLinkedInProfile(), P3 — Maintainability, KnowledgeChunk, KnowledgeProvider, initialPolicy(), initialProfile()

### Community 88 - "OfficeEnvironment.tsx"
Cohesion: 0.33
Nodes (10): Bookcase(), CeilingStructure(), OakFloor(), OfficeEnvironment(), OfficeEnvironmentProps, Phase, Slab(), V3 (+2 more)

### Community 89 - "OfficeObjects.tsx"
Cohesion: 0.31
Nodes (8): InteractiveObject(), labelTexture(), ObjectLabel(), OfficeObjects(), OfficeObjectsProps, BoardId, @react-three/fiber, three

### Community 93 - ".detail"
Cohesion: 0.83
Nodes (3): epoch(), text(), toTask()

### Community 94 - "IntegrationVault"
Cohesion: 0.38
Nodes (5): IntegrationVault, VaultKey, MemoryVault, fixture, MemoryVault

### Community 95 - "P1 — Data consistency dan reliability"
Cohesion: 0.20
Nodes (9): P0-2. Generic production-write bypass policy, P1-1. Claim bid dapat terkunci permanen setelah crash, P1-3. Manual draft dapat mengubah harga/durasi keluar policy, P1-4. Bid submission tidak atomic sebagai logical operation, P1-5. Profile dan policy update tidak atomic, P1-6. Google Calendar callback hardcode port, P1-7. `OperationsService.start()` dapat membuat interval ganda, P1-8. Timezone Operations hardcode (+1 more)

### Community 96 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, start, test, test:smoke, typecheck

### Community 98 - "ref_node_path"
Cohesion: 0.13
Nodes (11): defaults, DraftingEnvironment, parseDraftingEnvironment(), readDraftingEnvironment(), GitHubEnvironment, parseGitHubEnvironment(), readGitHubEnvironment(), client (+3 more)

### Community 99 - "linkedin-env.ts"
Cohesion: 0.47
Nodes (4): LinkedInEnvironmentCredentials, parseLinkedInEnvironment(), readLinkedInEnvironment(), LinkedInClientCredentials

### Community 100 - "freelancer-env.ts"
Cohesion: 0.60
Nodes (3): FreelancerEnvironment, parseFreelancerEnvironment(), readFreelancerEnvironment()

### Community 101 - "drafting.ts"
Cohesion: 0.24
Nodes (6): AiDraftingPort, DraftingInput, DraftingOutput, FixtureDraftingAdapter, ProfileFact, UnavailableDraftingAdapter

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
- **57 isolated node(s):** `eslint`, `@types/node`, `typescript`, `@fvh/domain`, `@types/react` (+52 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 721 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `adapter-freelancer/src/index.ts`, `OfficeShell.tsx`, `adapter-hermes/src/index.ts`, `ui.tsx`, `candidate-tasks.ts`, `OfficeAgent.tsx`, `services/autopilot.ts`, `Root Tooling & Lint`, `Owner Movement & Desks`, `DiscordKanbanMonitor`, `Live Events (SSE) Server`, `domain/src/index.ts`, `owner-input.ts`, `Office Floor Layout`, `projects.co.id Page`, `app.test.ts`, `services/projects-co-id.ts`, `services/hermes-kanban.ts`, `parseJson`, `HermesKanbanCard.tsx`, `knowledge/src/index.ts`, `live.ts`, `GitHubReadAdapter`, `api.ts`, `app.ts`, `database.ts`, `linkedin-oauth.ts`, `credential-store.ts`, `types.ts`, `CardDataStatus.tsx`, `portfolio.ts`, `bid-analytics.ts`, `IntegrationVault`, `ref_node_path`, `linkedin-env.ts`, `freelancer-env.ts`, `whatsapp-status.ts`?**
  _High betweenness centrality (0.111) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `WorkspaceRepository` (e.g. with `Persistence` and `Ringkasan`) actually correct?**
  _`WorkspaceRepository` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `eslint`, `@types/node`, `typescript` to the rest of the system?**
  _57 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `adapter-freelancer/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.055381400208986416 - nodes in this community are weakly interconnected._
- **Why does `WorkspaceRepository` connect `WorkspaceRepository` to `adapter-freelancer/src/index.ts`, `Audit Projek`, `knowledge/src/index.ts`, `shared.ts`, `candidate-tasks.ts`, `types.ts`, `Live Events (SSE) Server`, `domain/src/index.ts`, `app.ts`, `Server Assembly (index.ts)`, `database.ts`, `parseJson`, `.transaction`, `repository.ts`, `app.test.ts`, `IntegrationVault`, `P1 — Data consistency dan reliability`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `VisualOffice 3D scene` and `Design direction (chalk/ink, pine, copper)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Policy-bounded autonomous bidding (README)` and `Hermes proposal guard and template fallback`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._