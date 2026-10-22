# Audit Projek

Tanggal audit: 22 Oktober 2026  
Commit dianalisis: `f2d4bc26154c1e5a73573923fdfc09b12c60e5d5`

## Ringkasan

Projek memiliki fondasi produk yang kuat dan sudah mendekati aplikasi operasional nyata:

- Monorepo pnpm TypeScript strict.
- Backend Fastify.
- Frontend React + React Three Fiber.
- Supabase Postgres melalui `WorkspaceRepository`.
- Domain layer terpisah untuk scoring, policy, pipeline, outcome, dan operasi.
- Integrasi Freelancer, GitHub, Hermes, WhatsApp, Google Calendar, LinkedIn, browser bidding, dan projects.co.id.
- Autopilot dengan policy, quota, deadline, active hours, kill switch, audit, dan idempotency claim.
- Data honesty rule pada UI.
- SSE realtime dengan polling fallback.
- Test coverage luas untuk domain, adapter, server, worker, persistence, dan UI.

Kesimpulan utama: arsitektur koheren, tetapi autopilot Freelancer belum siap dipercaya untuk live operation sebelum trust boundary antara policy, direct write API, dan persistence diperketat.

## Verifikasi

| Check | Hasil |
|---|---|
| ESLint | Lulus |
| TypeScript typecheck | Lulus |
| Web build | Lulus |
| Unit tests | Lulus |
| Adapter tests | Lulus |
| Server tests | Lulus: 27 file, 160 test |
| Git working tree | Bersih saat audit |

Catatan:

- Server test suite lambat, sekitar 277 detik.
- Web build menghasilkan warning chunk besar.
- `VisualOffice` sekitar 950 kB minified.
- Graph report stale: dibuat dari commit `bec77f69`, sedangkan commit saat audit `f2d4bc2`.

## Arsitektur

### Server

`apps/server/src/index.ts` merakit Fastify, database, credential store DPAPI, adapter Freelancer, Hermes, autopilot, BusinessSync, browser bidding, projects.co.id, WhatsApp, Google Calendar, operations, dan SSE.

`apps/server/src/app.ts` menangani security hooks, CSP, route registration, zod error response, SPA fallback, dan lifecycle shutdown.

Risiko arsitektur utama: `index.ts` menjadi composition root besar. Jangan pecah tanpa kebutuhan; lakukan hanya jika lifecycle atau startup failure mulai sulit diuji.

### Domain

`packages/domain/src/` berisi logic inti:

- `policy.ts`
- `policy-schedule.ts`
- `scoring.ts`
- `pipeline.ts`
- `bid-outcome.ts`
- `projects-co-id.ts`
- `operations.ts`

Layer ini paling sehat. Logic penting memiliki test langsung dan sebaiknya tetap bebas dari Fastify, database, dan provider.

### Persistence

`packages/persistence/src/repository.ts` menjadi pusat persistence untuk profile, policy, project, draft, bid, audit, knowledge, thread, client project, dan payment.

Kekuatan:

- Transaction wrapper.
- Atomic claim untuk sebagian operasi.
- Optimistic locking policy.
- PGlite untuk test.
- Schema `fvh`.
- Parameterized query.

Risiko: `WorkspaceRepository` menjadi abstraction dengan coupling tertinggi. Perubahan schema atau method repository dapat berdampak ke banyak worker dan controller.

### Frontend

`apps/web/src/office/OfficeShell.tsx` adalah shell kantor 3D, drawer route, React Query, SSE invalidation, agent state, board navigation, polling fallback, dan owner controls.

`apps/web/src/state/office-state.ts` menjadi sumber status agen visual.

Risiko utama frontend adalah ukuran bundle dan fallback WebGL, bukan correctness dasar.

## P0 — Wajib sebelum live marketplace

### P0-1. Capability verification belum mengunci aktivasi policy

Files:

- `apps/server/src/controllers/policy.ts`
- `apps/server/src/services/autopilot.ts`
- `packages/domain/src/policy.ts`

Policy activation saat ini dapat bergantung pada token yang tersedia, sementara autopilot mengirim capability hardcoded seperti `capability: 'supported'`.

Dampak:

- Token invalid dapat melewati aktivasi.
- Write scope yang tidak tersedia baru diketahui saat submit.
- Policy engine tidak konsisten menghasilkan `capability_unverified`.

Perbaikan:

- Simpan hasil capability verification dengan timestamp, account identity, scope, expiry, dan failure reason.
- Aktivasi live wajib membutuhkan capability yang masih fresh.
- Autopilot wajib memakai capability aktual, bukan nilai hardcoded.
- Capability invalid sebelum submit harus menghentikan write.

### P0-2. Generic production-write bypass policy

Files:

- `apps/server/src/routes/freelancer.ts`
- `apps/server/src/controllers/freelancer.ts`

`POST /api/freelancer/production-write` menerima operasi setelah `confirmLive: true`, tetapi tidak selalu menjalankan:

- policy evaluation;
- expiry dan active hours;
- daily/weekly quota;
- capability verification;
- project ownership/status check;
- idempotency claim;
- bid amount/duration validation.

Risiko terbesar: jalur ini dapat mengirim operasi yang tidak melewati guard autopilot. `send_message` juga bertentangan dengan invariant aplikasi yang tidak mengirim pesan klien secara bebas.

Perbaikan:

1. Hapus `send_message` dari production path.
2. Hapus generic production-write, atau ubah menjadi route operation-specific.
3. Untuk bid, reuse policy guard, deterministic price/duration, `claimAudit`, capability check, audit, dan reconciliation.
4. Untuk profile write, gunakan route terpisah dengan scope dan payload terbatas.
5. Jangan jadikan `confirmLive` satu-satunya authorization.

### P0-3. HTTP 200 tanpa `resultId` dianggap sukses

File:

- `apps/server/src/services/autopilot.ts`

Saat provider memberi HTTP 200 tanpa ID bid yang valid:

- audit dapat tercatat sukses;
- counter `submitted` bertambah;
- quota lokal bertambah;
- pipeline tidak menjadi `submitted`;
- `bid_results` tidak dibuat;
- BusinessSync tidak memiliki ID untuk reconciliation.

Perilaku yang benar:

```text
HTTP 200 + valid resultId
→ pipeline submitted
→ bid_results dibuat
→ quota confirmed bertambah

HTTP 200 tanpa resultId
→ pipeline reconciliation_required
→ audit uncertain
→ quota confirmed tidak bertambah
→ retry otomatis dilarang
```

Tambahkan regression test yang memeriksa pipeline, audit, bid result, dan usage secara bersamaan.

### P0-4. PostgreSQL TLS certificate verification dimatikan

File:

- `packages/persistence/src/database.ts`

Saat ini remote Postgres memakai:

```ts
ssl: { rejectUnauthorized: false }
```

Traffic terenkripsi, tetapi certificate tidak diverifikasi. Karena connection string berisi credential database, ini membuka risiko MITM/database impersonation.

Perbaikan:

- Pin CA Supabase melalui `ssl.ca`, atau gunakan trusted system CA.
- Remote DB harus gagal start bila certificate tidak dapat diverifikasi.
- Local database boleh memakai konfigurasi lokal tanpa TLS.
- Jangan mempertahankan `rejectUnauthorized: false` untuk production.

## P1 — Data consistency dan reliability

### P1-1. Claim bid dapat terkunci permanen setelah crash

Files:

- `packages/persistence/src/repository.ts`
- `apps/server/src/services/autopilot.ts`

Jika proses crash setelah `claimAudit()` tetapi sebelum provider submit, proyek dapat dianggap sudah diclaim selamanya.

Perbaikan:

- Tambah lease dengan expiry.
- Bedakan status `in_flight`, `submitted`, `failed`, dan `reconciliation_required`.
- Recovery hanya setelah provider reconciliation.
- Jangan melepas claim secara buta karena dapat menyebabkan duplicate bid.

### P1-2. Pipeline transition tidak ditegakkan di repository

Files:

- `packages/persistence/src/repository.ts`
- `packages/domain/src/pipeline.ts`

`setPipelineStatus()` dapat menulis status langsung tanpa memanggil `transitionPipeline()`.

Dampak: transisi ilegal seperti `won` ke `submitted` dapat terjadi melalui repository.

Perbaikan:

- Enforce transition rule di repository.
- Sediakan method khusus untuk owner exception.
- Tambah test illegal transition melalui repository, bukan hanya domain helper.

### P1-3. Manual draft dapat mengubah harga/durasi keluar policy

Files:

- `apps/server/src/controllers/projects.ts`
- `packages/persistence/src/repository.ts`

`proposedPrice` dan duration draft harus selalu berasal dari policy deterministik. Proposal text boleh dibuat atau diedit, tetapi protected bid fields tidak boleh bebas diubah.

Perbaikan:

- Hitung price/duration server-side berdasarkan project dan policy aktif.
- Validasi currency, budget, deadline, range, dan current policy version.
- Tolak edit protected fields dengan `400` atau `409`.

### P1-4. Bid submission tidak atomic sebagai logical operation

Flow saat ini mencakup claim, draft, pipeline update, external HTTP write, audit, pipeline finalization, dan bid result.

External HTTP call tidak boleh dimasukkan ke DB transaction. Gunakan durable state machine:

1. Simpan `in_flight`.
2. Panggil provider.
3. Simpan response yang dapat diverifikasi.
4. Reconcile hasil ambiguous.
5. Baru tandai `submitted` jika ID valid.

### P1-5. Profile dan policy update tidak atomic

File:

- `apps/server/src/controllers/profile.ts`

Profile disimpan sebelum policy disimpan. Failure setelah langkah pertama dapat meninggalkan profile baru dengan policy lama.

Perbaikan: buat repository transaction method yang menyimpan profile, policy draft state, dan audit state secara koheren.

### P1-6. Google Calendar callback hardcode port

Files:

- `apps/server/src/services/google-calendar.ts`
- `apps/server/src/index.ts`

Google callback menggunakan port `3001`, sementara server mendukung `FVH_PORT`.

Perbaikan: inject redirect URI runtime dari host dan port aktual.

### P1-7. `OperationsService.start()` dapat membuat interval ganda

File:

- `apps/server/src/services/operations.ts`

Panggilan `start()` berulang dapat membuat beberapa interval 60 detik.

Perbaikan: tambahkan start guard idempotent dan test `start()` dua kali.

### P1-8. Timezone Operations hardcode

File:

- `apps/server/src/services/operations.ts`

Operations menggunakan `Asia/Jakarta` hardcoded, sementara policy timezone configurable.

Perbaikan: gunakan timezone owner/policy secara konsisten untuk reminder, month boundary, dan due-date logic.

### P1-9. Google token/client JSON tidak divalidasi schema

File:

- `apps/server/src/services/google-calendar.ts`

Vault JSON langsung di-cast menjadi `Client` atau `Token`.

Perbaikan: gunakan strict zod schema untuk token, expiry, client ID, refresh token, panjang string, dan corrupt state. Invalid state harus dibersihkan dengan aman.

## P2 — Performance, UX, dan operasional

### P2-1. Origin checks mutating route belum seragam

Host protection membantu, tetapi bukan pengganti CSRF defense.

Perbaikan: setiap mutating API wajib memiliki approved Origin, kecuali internal call yang didokumentasikan secara eksplisit.

### P2-2. GitHub sync-all unbounded

File:

- `apps/server/src/controllers/knowledge.ts`

Sync banyak repository secara sinkron dapat membuat request lama, memory pressure, dan rate limit amplification.

Perbaikan: gunakan background job, global request/file budget, dan return `202`.

### P2-3. Repository list belum bounded dan ordering belum stabil

Files:

- `packages/persistence/src/repository.ts`

Tambahkan pagination/cursor dan stable ordering, misalnya:

```sql
ORDER BY created_at DESC, id DESC
```

Tambahkan index yang sesuai.

### P2-4. Knowledge Hub query perlu batas

Dataset knowledge sudah besar. Tambahkan:

- pagination;
- capped search result;
- query timeout;
- latency metrics;
- bounded sync.

### P2-5. Live event stream perlu reconnect protocol

Files:

- `apps/server/src/lib/live-events.ts`
- `apps/server/src/routes/events.ts`
- `apps/web/src/api/card-data.ts`

Tambahkan event ID, reconnect handling, explicit stream error cleanup, last success timestamp, last error timestamp, dan stale marker.

Database/API tetap source of truth; SSE hanya invalidation signal.

### P2-6. 3D fallback dan performance

Files:

- `apps/web/src/office/VisualOffice.tsx`
- `apps/web/src/office/OfficeShell.tsx`

Tambahkan fallback denah 2D untuk:

- WebGL failure;
- low-memory device;
- keyboard-only use;
- screen reader;
- reduced motion.

Ukur FPS, memory, scene-load time, dan mobile GPU cost sebelum optimasi. Kurangi pixel ratio, shadow, texture, dan geometry hanya berdasarkan pengukuran.

### P2-7. Polling fallback dapat membebani server

File:

- `apps/web/src/office/OfficeShell.tsx`

Saat SSE gagal, beberapa query melakukan polling tiap 1–3 detik. Tambahkan backoff dan aggregate status endpoint bila diperlukan.

### P2-8. WhatsApp uncertain delivery

Timeout setelah provider menerima pesan dapat menyebabkan retry duplicate.

Perbaikan: gunakan idempotency key/provider message ID, status uncertain, dan reconciliation sebelum resend.

### P2-9. Migration belum memiliki ledger/checksum

File:

- `packages/persistence/src/database.ts`

Semua migration dijalankan setiap startup tanpa migration ledger. Ini berisiko saat migration non-idempotent atau partial failure ditambahkan.

Perbaikan: migration table dengan filename, checksum, dan transactional application per migration. Pertahankan aturan migration additive.

## P3 — Maintainability

- Frontend mengimpor server model source langsung; pindahkan shared response types ke package bersama.
- Browser selectors rapuh terhadap perubahan UI provider; pertahankan fail-closed behavior.
- Freelancer search hanya offset pertama; tampilkan keterbatasan coverage pada UI.
- Skill matching exact-string dapat melewatkan variasi seperti `React.js`/`React`, `Node.js`/`NodeJS`, dan `Postgres`/`PostgreSQL`.
- Timestamp core table banyak berupa `TEXT`; pertimbangkan `TIMESTAMPTZ` pada migration baru.
- Provider error sanitization belum seragam di autopilot dan production-write.
- BusinessSync cursor/backoff masih memory-only dan hilang saat restart.
- `syncFreelancerProjects()` dan `backfillBidOutcomes()` memiliki counter yang dapat tidak mencerminkan row unik/inserted sebenarnya.
- `recordSubmittedBid()` perlu mengembalikan status inserted vs conflict.
- Tambahkan unique constraint untuk external `bid_id` bila provider menjamin uniqueness.
- Client project uniqueness sebaiknya memakai `(source, external_project_id)`.
- Secret detector Knowledge Hub berbasis pattern dan bukan jaminan penghapusan semua secret.
- Evidence Hermes sebaiknya dibatasi ke source yang benar-benar diberikan input.

## Security strengths

- Loopback-only binding.
- Host/Origin protection.
- `trustProxy: false`.
- Credential server-side dengan Windows DPAPI.
- Hermes environment allowlist.
- Hermes toolset `none`.
- Browser bid fail-closed dengan account, project, currency, policy, quota, endpoint, HTTP 200, dan bid ID checks.
- projects.co.id read-only guard.
- Parameterized SQL.
- Schema isolation `fvh`.
- CSP, `X-Frame-Options`, dan `X-Content-Type-Options`.
- React rendering tanpa raw HTML injection.
- Invoice HTML escaping.
- OAuth state validation dan fixed redirect checks.
- Error response API tidak mengembalikan raw exception.
- AI output divalidasi schema dan dibatasi panjangnya.
- External project content diperlakukan sebagai untrusted input.

## Test gaps prioritas

Tambahkan test untuk:

1. Token tersedia tetapi capability verification unknown.
2. Capability stale atau account mismatch.
3. Policy berubah sebelum submit.
4. HTTP 200 tanpa `resultId`.
5. Duplicate worker setelah crash.
6. Direct production-write pada policy paused, expired, outside hours, quota penuh, amount invalid, project unknown, dan missing Origin.
7. `send_message` ditolak.
8. Illegal pipeline transition melalui repository.
9. Profile update gagal setelah profile write.
10. Operations `start()` dipanggil dua kali.
11. Google callback dengan custom port.
12. Corrupt Google vault payload.
13. Migration terhadap workspace lama.
14. SSE stream error dan reconnect.
15. Browser stale tab, wrong account, disconnect, popup, dan timeout.

## Roadmap

### Tahap 1 — sebelum live

```text
1. Capability verification sebelum policy activation
2. Hapus atau sempitkan generic production-write
3. Fix HTTP 200 tanpa resultId
4. Aktifkan PostgreSQL TLS verification
5. Tambah claim lease dan reconciliation
6. Enforce pipeline transition di repository
7. Kunci manual draft price/duration
8. Tambah regression tests untuk semua P0
```

### Tahap 2 — reliability

```text
1. Atomic profile-policy update
2. Dynamic Google callback URI
3. Idempotent OperationsService.start()
4. Consistent policy timezone
5. Strict Google token schemas
6. Origin enforcement semua mutating route
7. Backup/export/restore tanpa credential
8. Capability freshness dan durable status
```

### Tahap 3 — UX dan performance

```text
1. SSE event ID dan reconnect
2. Stale/live state visibility
3. Accessible 2D office fallback
4. Measure and reduce 3D cost
5. Polling backoff
6. Knowledge pagination dan bounded sync
7. Faster test feedback loop
```

### Tahap 4 — secondary integrations

Kerjakan setelah core bidding stabil:

- operations floor dua;
- WhatsApp reconciliation;
- Google Calendar polish;
- LinkedIn;
- Office learning;
- Hermes team expansion;
- marketing features.

## Final assessment

Projek sudah kuat pada domain logic, policy engine, AI isolation, browser guard, data honesty, dan test coverage.

Namun, empat isu harus dianggap blocking untuk live Freelancer automation:

1. capability activation belum memakai verification nyata;
2. generic production-write dapat melewati policy;
3. HTTP 200 tanpa bid ID membuat state quota/audit/pipeline tidak konsisten;
4. Postgres TLS tidak memverifikasi certificate.

Jangan aktifkan live Freelancer automation sebelum empat isu tersebut diperbaiki dan memiliki regression test.
