# TECH_STACK — Freelancer Virtual House

Dokumen pendamping: [PRD.md](PRD.md), [AGENT.md](AGENT.md), dan [TASKS.md](TASKS.md). Stack ini ditujukan untuk MVP single-user yang ringan dan dapat dikembangkan, bukan klaim bahwa semua fitur API platform tersedia.

## 1. Keputusan utama

| Area | Pilihan MVP | Alasan |
|---|---|---|
| Bahasa | TypeScript strict | Satu bahasa untuk UI dan server, tipe lintas modul |
| Monorepo | pnpm workspaces | Dependency terpusat, paket domain/adapter bersama |
| Web UI | React + Vite | SPA ringan, build cepat, progressive enhancement |
| UI routing/data | React Router + TanStack Query | Routing dan cache/request state terpisah |
| 3D | Three.js via React Three Fiber, dynamic import | Ekosistem matang; hanya dimuat di mode 3D |
| Backend | Node.js LTS + Fastify | Server ringan dengan batas plugin/schema |
| Validasi | Zod | Validasi DTO dan output AI pada boundary |
| Database lokal MVP | SQLite + Drizzle ORM | Setup single-user sederhana, migrasi SQL jelas |
| Knowledge search | SQLite FTS5 full-text index | Index lokal ringan; retrieval berbasis kata kunci/relevance pada MVP |
| Database deployment | PostgreSQL bila multi-instance/hosted | Dipilih saat kebutuhan operasional memerlukannya |
| AI | Hermes Agent CLI melalui process adapter backend | `--query-file` + JSONL; model/provider dari profile Hermes lokal |
| Test | Vitest + Fastify API tests + Playwright smoke | Unit, boundary, jalur pengguna utama |
| Styling | CSS Modules atau vanilla CSS + token | Menghindari runtime UI berat |

Gunakan versi LTS/stabil yang kompatibel saat implementasi dan lockfile wajib. Jangan mengunci versi library di dokumen ini karena ekosistem berubah; catat keputusan aktual pada manifest/lockfile dan CI.

## 2. Arsitektur

**Modular monolith** dengan satu web server/API dan satu database. UI dan backend berada dalam workspace bersama, tetapi batas domain jelas.

```text
Browser
  ├─ 2D Dashboard (default, complete)
  └─ 3D Office (optional, lazy-loaded)
          │ HTTPS / same-origin API
          ▼
Fastify Application
  ├─ Auth & Workspace
  ├─ Projects & Scoring
  ├─ Bids & Approval
  ├─ Profile & Portfolio
  ├─ Communication
  ├─ Audit & Notifications
  ├─ Knowledge Hub (GitHub + LinkedIn)
  └─ AI Orchestration
       ├─ Hermes Agent CLI adapter
       └─ Provider-independent prompt/schema boundary
          │ ports
          ▼
  Freelancer.com Adapter ── Official API only
  GitHub Adapter ── user-authorized repositories
  LinkedIn Adapter ── approved official API or user-provided export
  SQLite/Drizzle Repository
  FTS5 Knowledge Index
  Secret Store Adapter
```

### Aturan dependency

`domain` tidak mengimpor lapisan lain. `application/use-cases` bergantung pada domain dan port. `adapters` mengimplementasikan port dengan vendor SDK/HTTP. `web/server composition root` memasang dependency. UI hanya berkomunikasi dengan API server.

## 3. Struktur repositori yang disarankan

```text
apps/
  web/                   # React SPA, 2D shell, lazy 3D scene
  server/                # Fastify routes, auth, composition root
packages/
  domain/                # Entitas dan aturan bisnis murni
  application/           # Use cases dan port
  contracts/             # Schema API, DTO, schema keluaran AI
  adapter-freelancer/     # OAuth/API, mapping, rate-limit, capabilities
  adapter-hermes/         # CLI process, prompt templates, schema parsing
  adapter-github/         # OAuth/App, repository contents, sync cursor
  adapter-linkedin/       # Only approved official endpoints and user exports
  knowledge/              # source registry, chunking, exclusions, retrieval
  persistence/           # Drizzle schema, migrations, repositories
  ui/                     # Shared components/tokens bila diperlukan
docs/
  PRD.md
  AGENT.md
  TECH_STACK.md
  TASKS.md
```

## 4. Domain inti

Entitas/aggregate: `Workspace`, `FreelancerAccount`, `MarketplaceConnection`, `KnowledgeConnection`, `KnowledgeSource`, `KnowledgeDocument`, `KnowledgeChunk`, `AutonomyPolicy`, `ServiceProfile`, `PortfolioItem`, `ProjectOpportunity`, `ProjectAssessment`, `BidDraft`, `ConversationThread`, `MessageDraft`, `SyncRun`, dan `AuditEvent`.

- `MarketplaceConnection` menyimpan referensi secret, status koneksi, scope, expiry, dan waktu verifikasi; bukan secret polos.
- `Approval` mencatat aksi, resource, hash payload final, pemilik yang menyetujui, dan expiry.
- `BidDraft` berbeda dari `SubmittedBid`; hanya hasil adapter yang mengonfirmasi aksi eksternal dapat membuat status submitted.
- ID eksternal selalu dipasangkan dengan `platformId`; entity juga memiliki ID internal stabil.
- Konten eksternal diperlakukan sebagai untrusted text.
- `KnowledgeSource` menyimpan provider, external ID, permissions, coverage, cursor, freshness, dan consent; `KnowledgeChunk` menyimpan pointer dan hash sumber, bukan credential.

## 5. Port aplikasi

- `MarketplacePort`: `getCapabilities`, `listProjects`, `getProject`, `getProfile`, dan operasi tulis opsional yang default-nya unsupported sampai terverifikasi.
- `KnowledgeSourcePort`: menginventarisasi sumber yang diizinkan dan mengambil perubahan dengan cursor.
- `KnowledgeIndexPort`: upsert/delete chunk, full-text search, dan source coverage/freshness.
- `KnowledgeRetrievalPort`: mengambil sejumlah kecil chunk paling relevan plus provenance untuk satu use case AI.
- `SecretStorePort`: `put`, `get`, `delete`, `rotate` dengan key reference.
- `AiDraftingPort`: method untuk assessment, proposal, profile diff, dan reply draft; output berupa schema tervalidasi.
- `AutonomyPolicyPort`: menyimpan versi policy yang diaktifkan, batas, scope tindakan, status pause, dan keputusan policy.
- `ExecutionPort`: mengeksekusi aksi yang dinyatakan `allowed` oleh policy engine dan menyimpan payload hash serta hasil.
- Repository untuk project, bid, profile, conversation, dan audit.
- `ClockPort` agar waktu/expiry deterministic di test.

`MarketplaceCapabilities` menyatakan dukungan per operasi (read projects/profile/portfolio/messages, submit bid, edit profile, send message): `supported`, `unsupported`, atau `unknown`, beserta sumber/versi verifikasi. `unknown` berarti fungsi tulis mati. `AutonomyPolicy` harus mencakup tindakan yang diizinkan, bidang/keyword, confidence threshold, budget dan harga, batas frekuensi, jam aktif, aturan profil/pesan, masa berlaku, versi, serta kill switch. Kegagalan satu rule berarti skip dan audit, bukan meminta approval per aksi.

## 6. GitHub dan LinkedIn Knowledge Hub

- **GitHub:** prefer GitHub App/fine-grained authorization dengan repository selection dan read-only `Contents` permission untuk source/docs. Tambah metadata issues/PR/releases hanya bila dibutuhkan dan minta permission spesifik minimum. Backfill semua repositori terpilih lalu incremental sync menggunakan cursor/updated timestamps; webhook hanya jika dapat diverifikasi dan aman. Jangan minta write/admin permission.
- **LinkedIn:** Profile API memerlukan developer approval serta tunduk pada field/privacy/data restrictions; OIDC Sign In umumnya hanya menyediakan lite profile. Jangan mengasumsikan akses komprehensif ke seluruh profile/posts/messages. Adapter hanya memakai product/scope yang tersedia dan approved. Jika data yang dibutuhkan tidak tersedia, terima file export/profile content yang pengguna miliki atau input manual; tidak scraping.
- **Indexing:** baca konten yang dicakup, normalisasi markdown/source text, chunk per file/section, simpan pointer `provider/repo/path/ref/url/updated_at`, dan indeks dengan SQLite FTS5. Gunakan pagination/cursor dan resumable job untuk backfill.
- **Exclusion sebelum index:** scan secret/credential, abaikan `.env`, key files, binary, vendor/dependency, generated/build output, files oversized, dan patterns yang dikonfigurasi. Simpan hash agar unchanged files tidak diulang.
- **Retrieval:** cari hanya untuk konteks pekerjaan tertentu, batasi top-k dan token budget, sertakan provenance di prompt/output. Jangan mengirim full repo atau seluruh LinkedIn export ke Hermes setiap kali.
- **Refresh dan penghapusan:** monitor mencatat coverage, cursor, last sync, error; dukung full resync, repo/file exclude, disconnect, source deletion, dan purge index.
- **MVP search:** FTS5 untuk simplicity/offline operation. Tambahkan embeddings/vector search hanya setelah kualitas pencarian diuji dan biaya/provider/privacy diputuskan; jangan membuat external embedding call default.
- **Meaning of learning:** knowledge base retrieval (RAG) yang dapat diperbarui/dihapus; bukan fine-tuning atau training model pada data pengguna.

Rujukan: [GitHub App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app), [LinkedIn Profile API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api), [LinkedIn OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2), [LinkedIn Download your data](https://www.linkedin.com/help/linkedin/answer/a1339364/auf-ihre-kontodaten-zugreifen).

## 7. Freelancer.com API

- Portal resmi: [developer.freelancer.com](https://developer.freelancer.com/).
- Gunakan API resmi, versi terdokumentasi, aplikasi developer, dan izin akun yang disetujui.
- Mulai dari sandbox OAuth bila tersedia: [contoh resmi sandbox](https://github.com/freelancer/freelancer-oauth-demo-app). Contoh memberi pola demo, bukan jaminan kontrak endpoint atau best practice produksi terbaru.
- [API Terms](https://www.freelancer.com/about/apiterms) mengikat penggunaan, melarang bypass batas/akses dan membatasi distribusi API/data.
- Saat implementasi, verifikasi authorization/token flow, scopes, endpoint tiap fungsi, cursor/pagination, idempotency, limit/reset headers, error codes, retensi data, dan sandbox parity.
- Jangan menyimpulkan numeric rate limit atau endpoint bid dari contoh pihak ketiga. Simpan konfigurasi limit terpisah dan gunakan header/metadata resmi bila tersedia.
- Semua request memakai timeout, correlation ID, pagination guard, response schema validation, retry terbatas, dan redaction.
- Adapter memetakan `429` dan limit ke rate limiter per akun/endpoint; berikan cooldown dan jangan retry ketat.
- Tidak ada scraping, private endpoint, login cookie injection, atau browser automation.

## 8. Integrasi Hermes Agent

CLI Hermes menyediakan query non-interaktif `hermes -p <profile> chat --query-file <path> --oneshot --quiet --format stream-json`. Profile memisahkan konfigurasi model/provider, secret, state, dan cron; pemilihan profile tidak membatasi akses file atau tool dengan sendirinya.

Rancangan adapter:

1. Server-side only. Nama profile dan executable berasal dari konfigurasi lokal yang tervalidasi; default drafting tetap fixture sampai mode Hermes dan consent data diaktifkan.
2. Jalankan `spawn` memakai executable dan argument array dengan `shell: false`; kirim semua teks melalui file temporer yang dibatasi dan hapus setelah proses selesai.
3. Kirim hanya proyek terpilih, fakta profil yang diberikan, dan maksimal empat bukti retrieval. Kredensial marketplace tidak masuk ke environment proses Hermes.
4. Profile `fvh` wajib memakai `platform_toolsets.cli: []`, tanpa tool file, terminal, browser, web, MCP, atau delegation. Cron dijalankan dengan `platform_toolsets.cron: []` dan hanya menghasilkan ringkasan/pengingat lokal. Profile bukan sandbox.
5. Parse JSONL final, tolak aktivitas tool, validasi schema domain, dan tangani exit code, timeout, stderr, batas output, dan CLI yang tak ditemukan.
6. Hermes hanya membuat usulan. Backend tidak memanggil marketplace write; kebijakan dan capability API tetap diperiksa secara deterministik.
7. Kredensial provider berada di profile Hermes. Project `.env` hanya memilih binary/profile dan consent, bukan menyalin API key provider atau kredensial marketplace ke agent.

Langkah konfigurasi Windows ada di [docs/hermes-agent-setup.md](docs/hermes-agent-setup.md). Referensi resmi: [CLI](https://hermes-agent.nousresearch.com/docs/user-guide/cli), [profiles](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/profiles.md), [toolsets](https://hermes-agent.nousresearch.com/docs/reference/toolsets-reference), dan [cron](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron).

## 9. Penyimpanan dan secret

- SQLite untuk mode single-user lokal; WAL, foreign keys, migration versioning, backup terenkripsi, dan lokasi data privat.
- Jika deployed online, pilih PostgreSQL terkelola dan secret manager; file SQLite tidak diasumsikan persisten pada hosting ephemeral.
- Refresh/access token disimpan terenkripsi via OS credential store/secret manager atau envelope encryption key di luar database. Kunci master tidak berada di database/backup yang sama.
- Browser menerima status koneksi, bukan token. Cookie sesi `HttpOnly`, `Secure`, `SameSite`, CSRF protections sesuai auth mode.
- Audit event menyimpan siapa/apa/kapan/status/payload hash; isi sensitif dibatasi.
- Knowledge index disimpan per-user/workspace, tidak dibagikan ke workspace lain, dan dapat dihapus saat disconnect/source revoke.
- `.env.example` hanya nama variabel dan placeholder. Abaikan `.env`, database lokal, log, build output, dan secret files dari Git.

## 10. 3D dan fallback 2D

- Default adalah 2D yang aksesibel; 3D dipilih pengguna.
- React Three Fiber/Three.js dimuat hanya saat tab 3D dibuka dan WebGL tersedia.
- Gunakan satu scene low-poly, geometri/material sederhana, tekstur minimal, tanpa avatar eksternal berat untuk MVP.
- Indikator ruang mewakili antrean dan deep link ke daftar 2D; tidak ada aksi eksternal langsung dari scene.
- Terapkan reduced motion, kontrol keyboard, batas pixel ratio, dan ukur bundle saat build.

## 11. Keamanan, compliance, dan kegagalan

- TLS, secure headers, rate limit aplikasi, input validation, CSRF, content escaping, dan CSP yang sesuai integrasi.
- Least privilege untuk OAuth, Hermes profiles/toolsets, filesystem, dan process permissions.
- Adapter API tidak dipanggil langsung dari browser.
- AI prompt hanya memuat data terpilih. Sanitize lampiran/teks dan cegah konten tak tepercaya mengambil alih system prompt.
- GitHub/LinkedIn content dianggap milik pengguna hanya dalam cakupan grant/export; hormati lisensi dan data pihak ketiga, jangan scrape, dan jangan masukkan ke training model. Secret scan/exclusion harus lulus sebelum chunk menjadi retrievable.
- Pengiriman eksternal membutuhkan policy aktif, capability `supported`, akun/kondisi terkini valid, payload hash tercatat, batas belum terlampaui, serta dedupe/reconciliation.
- Setelah hasil pengiriman ambigu, status menjadi `reconciliation_required`; sinkronkan status sebelum retry.
- Sediakan disconnect/revoke, retensi, ekspor/penghapusan data sesuai kontrak API.

## 12. CI dan pemeriksaan cepat

Script root minimum: `lint`, `typecheck`, `test:unit`, `test:adapter`, `test:smoke`, `build`.

- Unit: domain scoring, status, policy limits/expiry, payload hash, retry/reconciliation policy, redaction.
- Adapter: request/response mapping, pagination, rate-limit, capability absence, OAuth state dengan mock atau sandbox.
- AI: prompt tidak memasukkan secret; parser menangani invalid/truncated output; agent policy review.
- UI smoke: dashboard 2D → pilih fixture → buat draft fixture → edit/reject/approve preview → audit status.
- Knowledge connector: full/incremental sync fixture, permission denial, secret/file exclusions, source provenance, stale index, disconnect/delete, prompt injection.
- Tidak ada live write akun produksi dalam CI.

## 13. Keputusan yang ditunda

- Hosting, multi-user auth, PostgreSQL, queue terpisah, dan object storage diputuskan setelah kebutuhan operasional diketahui.
- Dukungan live write bid/profil/pesan menunggu konfirmasi endpoint, scope, sandbox parity, limit API resmi, dan pengujian policy/kill switch.
- LinkedIn API coverage yang lebih luas bergantung pada product access approval; tentukan format dan field data export setelah memeriksa opsi ekspor LinkedIn yang tersedia pada saat implementasi.
- Versi Node/package dikunci pada awal implementasi sesuai LTS/stabil saat itu.
