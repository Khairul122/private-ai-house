# Graph Report - private-ai-house  (2026-10-23)

## Corpus Check
- 239 files · ~131,883 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .example 1, .css 1)

## Summary
- 1775 nodes · 4215 edges · 102 communities (93 shown, 9 thin omitted)
- Extraction: 97% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 105 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fc631914`
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
- domain/src/index.ts
- OfficeAgent.tsx
- services/autopilot.ts
- Root Tooling & Lint
- 3D Office Scene
- App.tsx
- Web Dependencies
- Owner Movement & Desks
- discord-kanban.ts
- Live Events (SSE) Server
- OperationsService
- owner-input.ts
- DpapiIntegrationVault
- Server Assembly (index.ts)
- Google Calendar & WhatsApp
- Office Floor Layout
- HermesKanban
- Opportunities & Pipeline UI
- projects.co.id Page
- vitest
- WorkPage.tsx
- services/hermes-kanban.ts
- createApp
- .transaction
- HermesKanbanCard.tsx
- ref_node_fs
- migrate-sqlite-to-supabase.mjs
- Audit Projek
- knowledge/src/index.ts
- shared.ts
- live.ts
- Product Principles (Docs)
- GitHubReadAdapter
- Hermes Adapter Package
- controllers/policy.ts
- dependencies
- routes/operations.ts
- Calendar Page
- Application Package
- persistence/package.json
- jsonRequest
- Browser Bid & Floor-2 Docs
- google-calendar.ts
- hermes-team.ts
- app.ts
- Contracts Package
- database.ts
- api.ts
- Audit orchestration — 23 Oktober 2026
- Freelancer Adapter Package
- GitHub Adapter Package
- linkedin-oauth.ts
- Base TS Config
- Security & Hermes Consent (Docs)
- Server TS Config
- repository.ts
- ai-env.ts
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
- Queryable
- .seed
- OfficeEnvironment.tsx
- OfficeObjects.tsx
- Private Start Supervisor
- .detail
- IntegrationVault
- Orchestration Hermes
- scripts
- WhatsAppService
- move-to-fvh-schema.mjs
- linkedin-env.ts
- freelancer-env.ts
- whatsapp-status.ts

## God Nodes (most connected - your core abstractions)
1. `WorkspaceRepository` - 75 edges
2. `vitest` - 58 edges
3. `api()` - 47 edges
4. `ErrorNotice()` - 33 edges
5. `createApp()` - 33 edges
6. `LoadingPanel()` - 32 edges
7. `fastify` - 32 edges
8. `PageIntro()` - 31 edges
9. `jsonRequest()` - 30 edges
10. `OfficeShell()` - 28 edges

## Surprising Connections (you probably didn't know these)
- `Persistence` --references--> `WorkspaceRepository`  [INFERRED]
  docs/project-audit.md → packages/persistence/src/repository.ts
- `Ringkasan` --references--> `WorkspaceRepository`  [INFERRED]
  docs/project-audit.md → packages/persistence/src/repository.ts
- `Verifikasi` --references--> `VisualOffice()`  [INFERRED]
  docs/project-audit.md → apps/web/src/office/VisualOffice.tsx
- `Acuan dan alur aktual` --references--> `HermesKanbanCard()`  [INFERRED]
  docs/orchestration-audit-2026-10-23.md → apps/web/src/components/HermesKanbanCard.tsx
- `Acuan dan alur aktual` --references--> `TaskBoardPage()`  [INFERRED]
  docs/orchestration-audit-2026-10-23.md → apps/web/src/views/TaskBoardPage.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Realtime change propagation (DB write to card refresh)** — docs_realtime_announcewrites, docs_realtime_live_topics, docs_realtime_sse_events, agents_officeshell, docs_realtime_carddatastatus [EXTRACTED 1.00]

## Communities (102 total, 9 thin omitted)

### Community 0 - "adapter-freelancer/src/index.ts"
Cohesion: 0.06
Nodes (47): BackoffJob, BusinessSync, BusinessSyncStatus, Dependencies, rateLimited(), RunStatus, safeError(), SyncStep (+39 more)

### Community 1 - "WorkspaceRepository"
Cohesion: 0.08
Nodes (4): camel(), camelKey(), parseJson(), WorkspaceRepository

### Community 2 - "OfficeShell.tsx"
Cohesion: 0.07
Nodes (38): BusinessSyncStatus, OperationsData, activityTitle(), BOARD_ACCENTS, buildBoards(), initials(), moneyList(), OfficeIcon() (+30 more)

### Community 3 - "adapter-hermes/src/index.ts"
Cohesion: 0.06
Nodes (31): OfficeLearningMemory, OfficeLearningSession, OfficeLearningStatus, hermesKanbanRunner, day(), discussionBlocked(), Employee, nextDay() (+23 more)

### Community 4 - "ui.tsx"
Cohesion: 0.31
Nodes (17): AuditEvent, Autopilot, formatDate(), ActivityRows(), EmptyState(), ErrorNotice(), OperationStatus(), StateLabel() (+9 more)

### Community 5 - "server/package.json"
Cohesion: 0.10
Nodes (20): devDependencies, tsx, @types/qrcode, name, private, type, @fastify/static, @fvh/adapter-freelancer (+12 more)

### Community 6 - "contracts/src/index.ts"
Cohesion: 0.13
Nodes (16): dayDiff(), workController(), registerWorkRoutes(), localDateKey(), createClientProjectSchema, createPaymentSchema, currencyCode, isoDate (+8 more)

### Community 7 - "domain/src/index.ts"
Cohesion: 0.17
Nodes (17): registerOperationsRoutes(), paymentReminder(), dp, invoice, project, escape(), invoiceHtml(), invoicePrintCss (+9 more)

### Community 8 - "OfficeAgent.tsx"
Cohesion: 0.13
Nodes (24): Box(), HAIR, Label(), nearbyIdlePeer(), OfficeAgent(), Props, shortestAngle(), SKIN (+16 more)

### Community 9 - "services/autopilot.ts"
Cohesion: 0.05
Nodes (29): mentionedRupiahAmounts(), parseProjectsCoIdHref(), parseProjectsCoIdProject(), PROJECTS_CO_ID_AUTO_REASON, PROJECTS_CO_ID_ORIGIN, PROJECTS_CO_ID_PROPOSAL_LIMIT, ProjectsCoIdListing, ProjectsCoIdObservation (+21 more)

### Community 10 - "Root Tooling & Lint"
Cohesion: 0.06
Nodes (32): devDependencies, eslint, @eslint/js, globals, @types/node, typescript, typescript-eslint, vitest (+24 more)

### Community 11 - "3D Office Scene"
Cohesion: 0.18
Nodes (28): B(), Beanbag(), Board(), boardTexture(), Building(), CameraRig(), Chair(), Label() (+20 more)

### Community 12 - "App.tsx"
Cohesion: 0.23
Nodes (12): App(), Metric(), queryClient, emptyReply(), InboxPage(), syncLine(), SyncState, waitingLabel() (+4 more)

### Community 13 - "Web Dependencies"
Cohesion: 0.07
Nodes (28): dependencies, @fvh/domain, react, react-dom, react-router, @react-three/fiber, @tanstack/react-query, three (+20 more)

### Community 14 - "Owner Movement & Desks"
Cohesion: 0.14
Nodes (21): OwnerCharacter(), LEAD_DESK, LIFT, liftDoorReached(), MANAGER_DESK, PODS, PROJECTS_CO_ID_DESK, createOwnerMotion() (+13 more)

### Community 15 - "discord-kanban.ts"
Cohesion: 0.21
Nodes (5): DiscordConfig, DiscordKanbanMonitor, DiscordMessage, discordTaskEmbed(), footer()

### Community 16 - "Live Events (SSE) Server"
Cohesion: 0.13
Nodes (12): announceWrites(), Listener, LiveEvents, READ_ONLY_POSTS, ROUTE_TOPICS, routeTopics(), sample(), TABLE_TOPICS (+4 more)

### Community 17 - "OperationsService"
Cohesion: 0.17
Nodes (4): OperationsService, OutboxMessage, DocumentKind, OperationsRepository

### Community 18 - "owner-input.ts"
Cohesion: 0.27
Nodes (8): bindOwnerKeyboard(), createOwnerInput(), DIRECTIONS, OwnerDirection, OwnerInput, OwnerMoveInput, ownsKeyboard(), setup()

### Community 20 - "Server Assembly (index.ts)"
Cohesion: 0.08
Nodes (21): autopilot, businessSync, createFreelancerReader(), credentialScriptPath, credentialStorePath, databaseUrl, draftingConfig, envFile (+13 more)

### Community 22 - "Office Floor Layout"
Cohesion: 0.09
Nodes (28): invitationSpot(), OfficeInvitation, team, BACK_BOARDS, BOARD_SIZE, BOARDS, BoardSlot, BREAK_SLOTS (+20 more)

### Community 23 - "HermesKanban"
Cohesion: 0.23
Nodes (5): HermesKanbanStatus, HermesKanbanTask, HermesKanban, isLegacyPlan(), isPlan()

### Community 24 - "Opportunities & Pipeline UI"
Cohesion: 0.26
Nodes (20): BidDraft, Opportunity, formatMoney(), matchesSource(), opportunitySource(), projectLink(), SOURCE_OPTIONS, SourceKey (+12 more)

### Community 25 - "projects.co.id Page"
Cohesion: 0.13
Nodes (16): ProjectsCoIdEntry, date(), daysUntil(), fieldLabel, ProjectEntry(), ProjectsCoIdPage(), rupiah(), Sort (+8 more)

### Community 26 - "vitest"
Cohesion: 0.15
Nodes (10): fixedNow, now, profile, project, assignees, list, insertTestOpportunity(), testOpportunity (+2 more)

### Community 27 - "WorkPage.tsx"
Cohesion: 0.39
Nodes (6): deadlineLabel(), PIPELINE_STAGES, SOURCE_LABELS, validCurrency(), valueOrDash(), WorkPage()

### Community 28 - "services/hermes-kanban.ts"
Cohesion: 0.21
Nodes (13): HERMES_BOARD, taskRow, CODE_PROFILES, DATA_PLAN_AUTHOR, FINAL_AUTHOR, ORCHESTRATOR, parsePlan(), PLAN_AUTHOR (+5 more)

### Community 29 - "createApp"
Cohesion: 0.31
Nodes (7): activityController(), agendaCategory(), agendaSchema, officeLearningController(), registerActivityRoutes(), registerOfficeLearningRoutes(), fastify

### Community 31 - "HermesKanbanCard.tsx"
Cohesion: 0.31
Nodes (11): HermesKanbanDetail, COLUMNS, employee(), HermesKanbanCard(), submit(), STATUS, TaskCard(), TaskResult() (+3 more)

### Community 32 - "ref_node_fs"
Cohesion: 0.18
Nodes (14): hermesLine(), killTree(), logFile, pidFile, pidsOnPorts(), pnpm(), portOpen(), ports (+6 more)

### Community 33 - "migrate-sqlite-to-supabase.mjs"
Cohesion: 0.20
Nodes (8): backup, backupDir, envPath, root, source, sqlitePath, TABLES, url

### Community 34 - "Audit Projek"
Cohesion: 0.05
Nodes (39): Arsitektur, Audit Projek, Domain, Final assessment, Frontend, P0-1. Capability verification belum mengunci aktivasi policy, P0-2. Generic production-write bypass policy, P0-3. HTTP 200 tanpa `resultId` dianggap sukses (+31 more)

### Community 35 - "knowledge/src/index.ts"
Cohesion: 0.16
Nodes (11): LinkedInApiProfile, profileSchema, readLinkedInProfile(), syncLinkedInProfile(), blockedExtensions, blockedPathParts, KnowledgeFileInput, KnowledgeResult (+3 more)

### Community 36 - "shared.ts"
Cohesion: 0.15
Nodes (18): capabilitiesController(), lastFailureNote(), healthController(), inboxController(), linkedinController(), settingsController(), allowedDevOrigins, AppContext (+10 more)

### Community 37 - "live.ts"
Cohesion: 0.22
Nodes (8): connectLive(), LIVE_STATE_LABELS, LiveState, queryKeysFor(), TOPIC_QUERY_KEYS, useLiveUpdates(), LIVE_TOPICS, LiveTopic

### Community 38 - "Product Principles (Docs)"
Cohesion: 0.16
Nodes (10): Freelancer Virtual House / Mission Control, fresh() helper (drop stale data on isError), OfficeShell, VisualOffice 3D scene, Web entry HTML (root div + main.tsx), antislop Delivery Gate, Camera-relative movement, Owner character movement and collisions (+2 more)

### Community 39 - "GitHubReadAdapter"
Cohesion: 0.22
Nodes (6): Fetcher, GitHubFile, GitHubReadAdapter, GitHubReadError, GitHubReadResult, isEligibleKnowledgePath()

### Community 40 - "Hermes Adapter Package"
Cohesion: 0.13
Nodes (14): dependencies, @fvh/application, @fvh/contracts, zod, exports, @fvh/application, @fvh/contracts, zod (+6 more)

### Community 41 - "controllers/policy.ts"
Cohesion: 0.21
Nodes (8): policyController(), profileController(), parseBody(), registerPolicyRoutes(), registerProfileRoutes(), activatePolicySchema, updatePolicySchema, updateProfileSchema

### Community 42 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, fastify, @fastify/static, @fvh/adapter-freelancer, @fvh/adapter-github, @fvh/adapter-hermes, @fvh/application, @fvh/contracts (+7 more)

### Community 43 - "routes/operations.ts"
Cohesion: 0.15
Nodes (18): Calendar, JobSignal, Messenger, Payment, OperationSignal, clientAutomationSchema, date, googleClientSchema (+10 more)

### Community 44 - "Calendar Page"
Cohesion: 0.23
Nodes (15): useClock(), AGENDA_LABELS, AgendaSummary, calendarDateLabel(), CalendarEvent, calendarMonthCells(), CalendarPage(), CalendarView (+7 more)

### Community 45 - "Application Package"
Cohesion: 0.14
Nodes (13): dependencies, @fvh/contracts, @fvh/domain, @fvh/knowledge, exports, @fvh/contracts, @fvh/domain, @fvh/knowledge (+5 more)

### Community 46 - "persistence/package.json"
Cohesion: 0.10
Nodes (19): dependencies, @fvh/domain, @fvh/knowledge, pg, devDependencies, @electric-sql/pglite, @types/pg, exports (+11 more)

### Community 47 - "jsonRequest"
Cohesion: 0.14
Nodes (18): ClientProject, jsonRequest(), CommunicationInput, NewClientProject, normalizeWhatsAppPhone(), saveClientCommunication(), input, project (+10 more)

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
Cohesion: 0.13
Nodes (19): AppOptions, createApp(), isSameOrigin(), freelancerController(), freelancerSandboxWriteSchema, freelancerSyncSchema, readProductionWriteChecks(), safeFreelancerIdSchema (+11 more)

### Community 52 - "Contracts Package"
Cohesion: 0.17
Nodes (11): dependencies, @fvh/domain, zod, exports, @fvh/domain, zod, name, private (+3 more)

### Community 53 - "database.ts"
Cohesion: 0.17
Nodes (9): repositoryWithBid(), setup(), createDatabase(), Database, memory(), migrate(), postgres(), Row (+1 more)

### Community 54 - "api.ts"
Cohesion: 0.12
Nodes (23): api(), ApiError, Capabilities, DashboardResponse, FreelancerProductionWriteInput, FreelancerSandboxWriteInput, Inbox, Insights (+15 more)

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
Cohesion: 0.13
Nodes (8): BidOutcome, ClientProjectSource, ClientProjectStatus, ClientThread, ServiceProfile, SkipReasonSummary, StoredKnowledgeSource, tsQuery()

### Community 63 - "ai-env.ts"
Cohesion: 0.47
Nodes (4): defaults, DraftingEnvironment, parseDraftingEnvironment(), readDraftingEnvironment()

### Community 64 - "FreelancerAutopilot"
Cohesion: 0.14
Nodes (11): FreelancerAutopilot, Kill switch (Jeda automasi), Policy engine (evaluatePolicy), publicPortfolio resolver (public GitHub repos only), Coding keyword catalog (182 terms), Policy versioning with HTTP 409 optimistic update, parseProjectsCoIdHref, projectsCoIdSettings (policy JSON) (+3 more)

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
Cohesion: 0.06
Nodes (40): P1-2. Pipeline transition tidak ditegakkan di repository, AiDraftingPort, DraftingInput, DraftingOutput, FixtureDraftingAdapter, ProfileFact, UnavailableDraftingAdapter, decideBid() (+32 more)

### Community 75 - "CardDataStatus.tsx"
Cohesion: 0.30
Nodes (8): CARD_QUERIES, CardDataKind, CardDataSummary, DataState, isCardQuery(), summarizeCardData(), CardDataStatus(), render()

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

### Community 87 - ".seed"
Cohesion: 0.20
Nodes (3): P3 — Maintainability, initialPolicy(), initialProfile()

### Community 88 - "OfficeEnvironment.tsx"
Cohesion: 0.33
Nodes (10): Bookcase(), CeilingStructure(), OakFloor(), OfficeEnvironment(), OfficeEnvironmentProps, Phase, Slab(), V3 (+2 more)

### Community 89 - "OfficeObjects.tsx"
Cohesion: 0.36
Nodes (7): InteractiveObject(), labelTexture(), ObjectLabel(), OfficeObjects(), OfficeObjectsProps, BoardId, @react-three/fiber

### Community 93 - ".detail"
Cohesion: 0.83
Nodes (3): epoch(), text(), toTask()

### Community 94 - "IntegrationVault"
Cohesion: 0.38
Nodes (5): IntegrationVault, VaultKey, MemoryVault, fixture, MemoryVault

### Community 95 - "Orchestration Hermes"
Cohesion: 0.20
Nodes (9): DiscordChannel, Alur tujuan, Batas eksekusi, Bukti verifikasi, Kondisi workspace pada pemeriksaan terakhir, Orchestration Hermes, Pengiriman baru dan retry, Setup profil dan repo (+1 more)

### Community 96 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, start, test, test:smoke, typecheck

### Community 98 - "move-to-fvh-schema.mjs"
Cohesion: 0.18
Nodes (5): directories, client, MARKERS, root, url

### Community 99 - "linkedin-env.ts"
Cohesion: 0.47
Nodes (4): LinkedInEnvironmentCredentials, parseLinkedInEnvironment(), readLinkedInEnvironment(), LinkedInClientCredentials

### Community 100 - "freelancer-env.ts"
Cohesion: 0.27
Nodes (6): FreelancerEnvironment, parseFreelancerEnvironment(), readFreelancerEnvironment(), GitHubEnvironment, parseGitHubEnvironment(), readGitHubEnvironment()

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
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 664 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `adapter-freelancer/src/index.ts`, `OfficeShell.tsx`, `adapter-hermes/src/index.ts`, `ui.tsx`, `domain/src/index.ts`, `OfficeAgent.tsx`, `services/autopilot.ts`, `Root Tooling & Lint`, `Owner Movement & Desks`, `Live Events (SSE) Server`, `owner-input.ts`, `Office Floor Layout`, `projects.co.id Page`, `services/hermes-kanban.ts`, `HermesKanbanCard.tsx`, `knowledge/src/index.ts`, `live.ts`, `GitHubReadAdapter`, `routes/operations.ts`, `jsonRequest`, `app.ts`, `database.ts`, `api.ts`, `linkedin-oauth.ts`, `ai-env.ts`, `types.ts`, `CardDataStatus.tsx`, `portfolio.ts`, `IntegrationVault`, `move-to-fvh-schema.mjs`, `linkedin-env.ts`, `freelancer-env.ts`, `whatsapp-status.ts`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `WorkspaceRepository` (e.g. with `Persistence` and `Ringkasan`) actually correct?**
  _`WorkspaceRepository` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `eslint`, `@types/node`, `typescript` to the rest of the system?**
  _57 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `adapter-freelancer/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.055381400208986416 - nodes in this community are weakly interconnected._
- **Why does `WorkspaceRepository` connect `WorkspaceRepository` to `adapter-freelancer/src/index.ts`, `Audit Projek`, `knowledge/src/index.ts`, `shared.ts`, `routes/operations.ts`, `Live Events (SSE) Server`, `OperationsService`, `app.ts`, `.transaction`, `database.ts`, `Queryable`, `.seed`, `repository.ts`, `vitest`, `IntegrationVault`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `VisualOffice 3D scene` and `Design direction (chalk/ink, pine, copper)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Policy-bounded autonomous bidding (README)` and `Hermes proposal guard and template fallback`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._