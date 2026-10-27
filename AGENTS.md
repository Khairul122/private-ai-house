# AGENTS.md — Konteks Kerja untuk Agen AI

Dokumen ini adalah **sumber konteks utama** untuk agen AI (Claude Code, Codex, OpenCode, Hermes, dll.) yang bekerja di repositori ini. Baca seluruhnya sebelum mengubah kode. Dokumen lama (`AGENT-gpt.md`, `PRD-gpt.md`, `TECH_STACK-gpt.md`, `TASKS-gpt.md`) adalah rancangan awal; jika bertentangan dengan dokumen ini, **ikuti dokumen ini dan kode yang berjalan**.

Terakhir diperbarui: 19 Oktober 2026.

---

## 1. Ringkasan produk

**Freelancer Virtual House / Mission Control** adalah aplikasi lokal satu pengguna untuk menjalankan bisnis freelance pemiliknya:

- **Pemilik:** full-stack developer solo dari Indonesia (GitHub `Khairul122`, Freelancer `khairulhuda01`). Klien datang dari **Freelancer.com (utama), klien langsung, dan LinkedIn**.
- **Fungsi inti:** memindai proyek Freelancer.com, menilai kecocokan, **mengirim bid otomatis penuh** dalam batas kebijakan, melacak hasil bid, membaca pesan klien, mencatat proyek aktif & pendapatan, dan menyimpan bukti portofolio (Knowledge Hub).
- **Antarmuka:** satu **kantor 3D layar penuh** (React Three Fiber). Setiap modul adalah **papan di dinding kantor**; klik papan membuka **kartu** berisi halaman lengkap. Agen AI tampil sebagai karakter voxel yang posisinya mengikuti status nyata.
- **AI:** Hermes Agent lokal (CLI) menulis proposal bid. Harga & durasi selalu dari kebijakan deterministik, bukan dari AI.
- **Bahasa UI:** Bahasa Indonesia. Pertahankan.

---

## 2. Aturan wajib (baca dulu)

### 2.1 Kejujuran data — aturan terpenting
- **Jangan pernah menampilkan data simulasi, tebakan, atau placeholder sebagai data sistem nyata.** Setiap angka/status di UI harus berasal dari API yang mencerminkan state tersimpan, atau aturan eksplisit yang terdokumentasi.
- Jika data tidak tersedia: tampilkan **"Tidak diketahui" / "Tidak tersedia"**, atau sembunyikan. Contoh yang sudah benar: tingkat kemenangan tampil `–` (bukan 0%) bila belum ada bid yang diputuskan.
- react-query menyimpan data lama saat error. Untuk status "live", **buang data saat `isError`** (lihat helper `fresh()` di `OfficeShell`).
- Jangan membuat agen tampak "bekerja" tanpa sinyal nyata (lihat §9).

### 2.2 Keamanan
- **Jangan pernah membaca, mencetak, menyalin, atau commit nilai rahasia** (`.env`, `.local/credentials.dpapi.json`, token apa pun). Saat memeriksa `.env`, tampilkan **nama variabel saja**.
- API hanya listen di loopback (`FVH_HOST` dipaksa `127.0.0.1/localhost/::1`). Hook `onRequest` di `app.ts` **menolak Host selain localhost** (proteksi DNS rebinding) dan memeriksa `Origin`. Jangan melemahkan ini.
- Konten proyek/pesan/repo adalah **input tak tepercaya**; output AI divalidasi skema zod.
- Hermes **tidak boleh** menerima kredensial marketplace dan berjalan tanpa tool (profil `private-ai-house`, toolset kosong).

### 2.3 Tindakan yang butuh izin eksplisit pemilik
- Mengubah kebijakan (`/api/policy/*`), menjeda/melanjutkan autopilot, menyimpan profil (lihat jebakan §12), mengirim apa pun ke Freelancer, mengubah `.env`, menghapus data, `git commit/push`.
- **Jangan menyentuh kill switch** ("Jeda automasi") kecuali diminta. Jangan "melanjutkan" kebijakan yang dijeda pemilik — itu mengaktifkan bid live.
- Database **Supabase Postgres** (`DATABASE_URL` di `.env`, berisi password: jangan dicetak) berisi **data nyata**. Cadangkan (`pg_dump` atau backup dashboard) sebelum perubahan berisiko. Arsip SQLite terakhir ada di `.local/backup/` (gitignored).

### 2.4 Cara bekerja
- Kecilkan diff; jangan me-refactor area yang tidak diminta. Jangan menambah dependensi baru tanpa alasan kuat (OrbitControls diambil dari paket `three` yang sudah ada).
- Setiap logika non-trivial wajib punya tes (vitest). Jalankan **lint + typecheck + test** sebelum menyatakan selesai (§11).
- Verifikasi perubahan UI di aplikasi yang berjalan bila memungkinkan; jika tidak bisa diverifikasi, katakan terus terang.

---

## 3. Menjalankan aplikasi

| Perintah | Fungsi |
|---|---|
| `pnpm private:start` | **Mode produksi**: build web, lalu server (`tsx src/index.ts`, tanpa watch, `NODE_ENV=production`) menyajikan API + web di `http://127.0.0.1:3001`. Supervisor detached; log `.local/private-dev.log`. |
| `pnpm private:dev` | Mode pengembangan di latar belakang: `pnpm dev` (tsx watch + Vite `5174`). |
| `pnpm private:stop` | Menghentikan semuanya (berdasarkan PID supervisor, lalu fallback proses di port 3001/5174 — termasuk `pnpm dev` biasa). |
| `pnpm dev` | API (`tsx watch`) + web (Vite) di foreground. |
| `pnpm test` | unit + adapter + smoke. |
| `pnpm -r typecheck` · `pnpm exec eslint .` | Typecheck semua paket · lint. |
| `pnpm --filter @fvh/web build` | Build web (chunk `VisualOffice` ~920 kB di-lazy-load; peringatan ukuran chunk itu wajar). |

- **Perintah memakai spasi**: `pnpm private:start` (bukan `pnpm-private:start`).
- Port: produksi **`127.0.0.1:3001`** (API + web build); pengembangan web **`127.0.0.1:5174`** (Vite mem-proxy `/api` ke 3001).
- `.env` hanya dibaca saat server start → setelah mengubah `.env`, jalankan `pnpm private:stop; pnpm private:start` (PowerShell 5.1 tidak mengenal `&&`).
- Node ≥ 24, pnpm 12. Platform utama pemilik: **Windows 11** (PowerShell + Git Bash).

---

## 4. Struktur monorepo

```
apps/
  server/src/   Fastify API (lapisan, refactor 20 Okt 2026):
    index.ts      perakitan service + start
    app.ts        createApp: Fastify, hook keamanan Host/Origin, header/CSP, konteks bersama, register routes
    routes/       satu register<Domain>Routes per domain: method+path → controller
    controllers/  handler HTTP (validasi zod, panggil repository/service, balasan); shared.ts = AppContext
    services/     logika bisnis & worker: autopilot, business-sync, operations, projects-co-id,
                  whatsapp, google-calendar, linkedin-oauth, portfolio, payment-reminders, hermes-kanban
    models/       tipe & parser server (*-types.ts), juga diimpor web
    config/       pembaca .env (ai-env, freelancer-env, linkedin-env, github-env)
    lib/          infrastruktur: credential-store(.ps1), integration-vault(.ps1), linkedin-api
    views/        template HTML server (invoice-html)
  web/src/      React 19 + react-router + @tanstack/react-query + three/@react-three/fiber
    App.tsx       tabel route saja; main.tsx = provider + QueryClient
    views/        satu file per halaman/kartu
    components/   UI bersama (ui.tsx, format.ts, source-filter.tsx) + kartu (HermesKanban, WhatsApp)
    api/          klien fetch + tipe respons (api.ts, *-api.ts, queries.ts)
    state/        logika kantor: office-state, office-layout, owner-motion, owner-input
    office/       OfficeShell (layout + overlay) dan VisualOffice (3D, lazy)
  Tes berada di samping file yang diuji. `packages/*` adalah lapisan model inti (domain), data (persistence) dan adapter.
packages/
  domain/              Tipe inti, scoring proyek, policy engine, transisi pipeline, bidOutcome
  application/         Port drafting (AiDraftingPort, DraftingInput), createId, hashPayload
  contracts/           Skema zod untuk body API
  persistence/         Postgres (`pg`; PGlite di memori untuk tes), migrasi SQL, WorkspaceRepository (semua method `async`; buka dengan `WorkspaceRepository.open()`)
  knowledge/           Pemeriksaan & pemotongan file untuk Knowledge Hub
  adapter-freelancer/  API Freelancer.com: baca (proyek, profil, pesan, bid) & tulis (bid, profil, pesan)
  adapter-github/      Baca repo GitHub (Contents) + daftar repo milik sendiri
  adapter-hermes/      Menjalankan Hermes CLI untuk menulis draf proposal
scripts/private.mjs    private:start (produksi) / private:dev / private:stop
scripts/hermes-team.ts profile Hermes per karyawan + board kanban fvh-house
docs/                  hermes-agent-setup.md, capability-matrix.md, threat-model.md
.local/                (gitignored) arsip SQLite lama, credential store DPAPI, log, pid
```

Nama paket npm: `@fvh/<nama>`. Semua paket diekspor langsung dari `src/index.ts` (tanpa build).

---

## 5. Arsitektur runtime (server)

`apps/server/src/index.ts` merakit semuanya:

1. **Kredensial:** token Freelancer & LinkedIn disimpan di `.local/credentials.dpapi.json` (Windows DPAPI via `credential-store.ps1`). `GITHUB_TOKEN` dibaca dari `.env` lewat `github-env.ts`. Pemilik sengaja **menghapus fallback `process.env.GITHUB_TOKEN`** di `app.ts` — jangan kembalikan.
2. **Hermes:** `ai-env.ts` membaca `FVH_AI_MODE`, `FVH_AI_DATA_CONSENT`, `FVH_HERMES_BIN`, `FVH_HERMES_PROFILE`. Aktif hanya bila mode `hermes` **dan** consent `true` (pemilik sudah memberi consent pada 16 Okt 2026). Adapter: `HermesCliDraftingAdapter` dengan `timeoutMs: 180_000` (model `ComboHermes` lewat 9router butuh 40–95 detik).
3. **`FreelancerAutopilot`** (`services/autopilot.ts`): siklus tiap `scanIntervalMinutes` kebijakan (5 menit sejak 20 Okt 2026). Per siklus: 1 pencarian `jobs[]` (skill profil yang cocok, `from_time`) + maks. 2 kata kunci bergilir. HTTP 429 → interval ×2 (maks ×8), kembali normal setelah sukses.
4. **`BusinessSync`** (`services/business-sync.ts`): **read-only**, terlepas dari status kebijakan. Pesan klien tiap 1 menit (satu panggilan threads `last_message` + `from_updated_time`), sapuan penuh 30 thread tiap 30 menit; hasil bid tiap 5 menit. 429 → backoff per job; hasil parsial tetap disimpan; header `RateLimit-*` tampil di status.
5. **`createApp`** (`app.ts`): hook keamanan, header CSP, lalu route per domain dari `routes/` (handler di `controllers/`).
6. **`ProjectsCoIdService`** (`projects-co-id.ts`): membaca listing projects.co.id melalui HTTP GET read-only. Tidak login lewat Chrome, tidak memakai CDP/Playwright, dan tidak mengirim penawaran. Data proyek tersimpan, draf Hermes/template, dan aksi pemilik tetap tersedia.

### 5.1 Siklus autopilot
1. `start()`: baca profil Freelancer; **isi profil lokal dari Freelancer hanya sekali** (saat `specializations` lokal kosong). Bootstrap kebijakan bila belum aktif (kecuali dijeda).
2. `runCycle()`: untuk tiap spesialisasi (maks 8) cari proyek → sinkronkan → skor (`scoreProject`) → urut skor.
3. Per proyek: `chooseBid` (hanya **fixed price, USD**, harga = max(minPrice, budgetMin) dan ≤ maxPrice & budgetMax; durasi = min(deadline, 14) atau 14) → `evaluatePolicy` → bila lolos: **Hermes menulis proposal** (§5.2) → cek ulang kill switch → `claimAudit` (idempotensi) → `submitBid` → catat audit & `recordSubmittedBid`.
4. Status ekspos: `cycleInProgress` (siklus sedang berjalan, ~4 dtk tanpa bid) dan `draftsInProgress`.

Alasan penolakan policy engine (`packages/domain/src/policy.ts`): `policy_paused, policy_inactive, policy_expired, action_not_allowed, capability_unverified, project_not_open, deadline_unknown, deadline_too_close, confidence_too_low, price_out_of_range, risk_too_high, specialization_mismatch, keyword_mismatch, non_negotiable_match, daily_limit_reached, weekly_limit_reached, invalid_policy_timezone, outside_active_hours`. Semua penolakan dicatat sebagai audit `autopilot.bid_skipped` (status `blocked`).

### 5.2 Penulisan proposal oleh Hermes (bid otomatis)
- `FreelancerAutopilot.writeProposal()` memanggil `draftProposal` dengan `fixedBid: { amount, currency, durationDays }` dari kebijakan + fakta profil + ≤4 potongan Knowledge Hub.
- **Penjaga:** jika `proposedPrice`/`durationDays` Hermes ≠ kebijakan, atau teks menyebut nominal lain (`mentionedAmounts`), atau Hermes error/timeout → **pakai template bawaan** (`proposalFor`) dan catat audit `autopilot.draft_fallback`. Bid tidak pernah gagal hanya karena Hermes.
- Prompt Hermes menyebut format persis setiap kunci. `normalizeOutput()` menerima `evidence` berupa string (diberi sumber "Disebut Hermes tanpa sumber spesifik") — jangan mengarang sumber.

### 5.3 BusinessSync
- **Hasil bid:** baca `GET /projects/0.1/bids/?bids[]=…` untuk bid `pending`; petakan dengan `bidOutcome()` (`awarded/accepted`→won, `rejected/revoked/canceled/cancelled`/retracted→lost, nilai lain/null→**pending, tidak ditebak**). Bid menang → pipeline `won` + **proyek aktif dibuat otomatis** (`client_projects`).
- **Pesan:** `readLatestThreadMessages(selfId, 30)` → tabel `client_threads` (preview 200 karakter, `project_id` dari `thread.context`). Aplikasi **tidak pernah mengirim pesan**.
- Status: `step` (`outcomes`/`messages`/null) + `ok/error/lastRunAt` per bagian. Error disensor dari kata token/bearer.

---

## 6. Data (Supabase Postgres)

Koneksi: `DATABASE_URL` (Session pooler Supabase, port 5432) dibaca dari `.env` oleh `index.ts`; server menolak start tanpanya. Migrasi: **semua** `packages/persistence/migrations/*.sql` dijalankan berurutan **setiap start**. Semua tabel ada di schema **`fvh`** (bukan `public`; database yang sama dipakai proyek lain, jangan dicampur) lewat `search_path` koneksi. RLS aktif di semua tabel tanpa policy: akses hanya lewat koneksi Postgres server, bukan Data API. Tes memakai PGlite di memori (±4 dtk per database).

**Aturan migrasi: hanya aditif** (`CREATE TABLE/INDEX IF NOT EXISTS`). Tidak ada DROP/ALTER pada tabel berisi data. Karena `IF NOT EXISTS`, nama tabel yang bentrok **tidak** diganti diam-diam — periksa dulu tabel yang sudah ada di database nyata.

| Tabel | Isi |
|---|---|
| `workspaces`, `service_profiles`, `autonomy_policies` | Satu workspace; profil & kebijakan disimpan sebagai JSON |
| `projects` | Proyek Freelancer + `pipeline_status`, skor, faktor |
| `bid_drafts` | Draf proposal (manual & autopilot) |
| `audit_events` | Log audit semua keputusan & aksi (sumber Live Activity) |
| `knowledge_sources`, `knowledge_chunks` (kolom `content_tsv` + indeks GIN untuk pencarian) | Knowledge Hub |
| `bid_results` | Bid terkirim: `bid_id`, jumlah, `award_status` mentah, `outcome` |
| `client_threads` | Thread pesan Freelancer terbaru |
| `candidate_tasks` | Calon tugas dari satu analisis pesan (`needs_confirmation → confirmed → converted`, atau `rejected`); satu baris per `source_version`, tanpa eksekusi otomatis |
| `client_projects`, `payments` | Proyek aktif multi-sumber & pembayaran |

⚠️ **Tabel lama `bid_outcomes`** (di Postgres diarsipkan sebagai `legacy_bid_outcomes`; 255 baris keputusan skipped/submitted, dari versi kode sebelum git) ada di database nyata, **bukan** bagian skema saat ini. **Jangan dihapus, jangan dipakai ulang namanya.** Tabel baru sengaja bernama `bid_results`.

Pipeline status: `new, scored, draft_ready, policy_check, submitted, in_conversation, won, lost, skipped, expired, reconciliation_required, error`. `submitted` **hanya** diset setelah HTTP 200 dari Freelancer.

Pengecualian pemilik 19 Oktober 2026: proyek `projects_co_id` boleh `submitted` setelah pemilik mengonfirmasi “Sudah saya kirim”. Audit `projects_co_id.owner_marked_sent`: “Ditandai terkirim oleh pemilik; tidak diverifikasi aplikasi”. UI selalu “Ditandai terkirim oleh Anda”. Tidak masuk `bid_results`, BusinessSync atau hitungan bid terkonfirmasi Freelancer. “Saya menang” (hanya dari `submitted`) memindah pipeline ke `won` dan membuat `client_projects` sumber `projects_co_id` bernilai draf IDR, audit `projects_co_id.owner_marked_won`, satu transaksi. ID publik enam digit heksadesimal dan slug tervalidasi disimpan di JSON proyek; tidak perlu migrasi. Batas draf otomatis dihitung dari `projects_co_id.draft_created` dalam zona waktu kebijakan.

---

## 7. API (`apps/server/src/routes/`)

| Route | Fungsi |
|---|---|
| `GET /api/health` | Mode, status AI (`ai: hermes/disabled`), autopilot |
| `GET /api/autopilot` | `state, lastRunAt, nextRunAt, lastMessage, cycleInProgress, draftsInProgress, …` |

| `GET /api/hermes-kanban` · `GET /api/hermes-kanban/tasks/:id` · `POST /api/hermes-kanban/tasks` | Board Hermes `fvh-house` lewat CLI `hermes kanban`. Kartu baru hanya untuk profil `fvh-*`; body memuat snapshot data aplikasi (dibaca dari route GET aplikasi sendiri) bila `includeData`. Aktif hanya bila Hermes + consent aktif. |
| `GET /api/projects-co-id` · `/drafts` · `POST /scan` · `PUT /mode` · `POST /projects/:id/draft`, `/mark-sent`, `/skip`, `/won` | Prefix route `/api/projects-co-id`. `/scan` hanya GET read-only; `/open`, `/check`, `/close` tetap dinonaktifkan. Tidak ada submit otomatis. Aksi penandaan memerlukan `confirm: true`. |
| `GET /api/business-sync` | Status BusinessSync (null jika tidak tersedia) |
| `GET /api/dashboard` | Hitungan, kebijakan, `bidUsage {today, week}` (zona waktu kebijakan), `externalWrites` |
| `GET /api/insights/bids` | Hasil bid (`winRate` null bila belum ada keputusan), alasan skip, waktu cek terakhir |
| `GET /api/inbox` | `needsReply`, `followUps` (bid pending ≥ 3 hari tanpa percakapan), `candidates` (calon tugas tersimpan) |
| `GET /api/candidates` · `POST /api/candidates` · `POST /api/candidates/:id/confirm` · `/reject` · `/convert` | Calon tugas dari analisis pesan yang selesai dan tertaut; `convert` wajib `{ confirm: true }` dan hanya membuat mission lokal |
| `GET /api/work` · `POST /api/work/projects` · `PUT /api/work/projects/:id` · `POST /api/work/payments` · `POST /api/work/payments/:id/received` | Proyek aktif & pendapatan (per mata uang, tidak dijumlah lintas kurs) |
| `GET /api/capabilities` | Status integrasi; `hermes.draftsInProgress` = draf manual + autopilot |
| `POST /api/freelancer/verify` · `/sandbox-write-test` · `/production-write` · `/projects/sync` | Freelancer; production-write butuh `confirmLive: true` |
| `POST /api/linkedin/connect` · `GET /api/linkedin/callback` · `POST /api/linkedin/disconnect` | LinkedIn OIDC-lite |
| `GET/PUT /api/profile` | Profil (PUT pada kebijakan aktif **mengembalikan kebijakan ke draf**) |
| `GET/PUT /api/policy` · `POST /api/policy/activate` · `/pause` · `/resume` | Kebijakan & kill switch |
| `GET /api/projects` · `GET /api/projects/:id` · `POST /api/projects/:id/draft` · `PUT /api/drafts/:id` · `GET /api/pipeline` | Peluang & draf |
| `GET /api/activity?limit=` | Log audit |
| `GET /api/knowledge` · `POST /api/knowledge/import` · `POST /api/knowledge/github/sync` · `POST /api/knowledge/github/sync-all` · `POST /api/knowledge/search` · `DELETE /api/knowledge/sources/:id` | Knowledge Hub; sinkron ulang repo **mengganti** sumber lama (tanpa duplikat) |
| `GET /api/settings` | Pengaturan |

Error validasi mengembalikan `{ error, issues[] }`; klien web (`api.ts`) menempelkan `issues` ke pesan error agar pengguna tahu field mana yang salah.

---

## 8. Frontend (`apps/web/src`)

| File | Peran |
|---|---|
| `App.tsx` | Tabel route; setiap halaman di `views/` |
| `office/OfficeShell.tsx` | Layout tunggal, overlay, `buildBoards()` |
| `office/VisualOffice.tsx` | Scene 3D (lazy): ruangan, pod, agen beranimasi, papan dinding, kamera (OrbitControls), siang/malam |
| `state/office-state.ts` | **Aturan status agen** (`deriveOfficeAgents`), label & warna status, `ROSTER` |
| `state/office-layout.ts` | Denah: pod, zona, kursi/slot, `planPath` (rute koridor), `BOARDS`, `dayPhase` |
| `api/api.ts` | Klien fetch + tipe respons |
| `components/HermesKanbanCard.tsx` | Panel kanban Hermes di Papan Tugas: buat kartu untuk orchestrator/karyawan, kolom Antre/Dikerjakan/Butuh Anda/Selesai, hasil per kartu. |
| `views/ProjectsCoIdPage.tsx`, `api/projects-co-id-api.ts` | Kartu khusus: status, pencarian aktif, ringkasan per tahap, filter tahap/bidang/penulis/urutan, detail proyek, draf, penandaan terkirim/menang/lewati. Peluang, Pipeline, Papan Tugas dan Aktivitas punya filter `?source=projects_co_id`; Kalender menampilkan penutupan listing (`closesAt`). |
| `styles.css` | Gaya lama halaman + blok `.vo3d*` (overlay 3D, kartu). Gaya sidebar/topbar lama masih ada tapi tak terpakai |

### 8.1 Navigasi
- `/` = kantor 3D. Rute lain (`/overview, /agents, /tasks, /calendar, /opportunities, /pipeline, /inbox, /work, /profile, /policy, /knowledge, /activity, /capabilities`) membuka **kartu** (drawer kanan) di atas kantor via `<Outlet/>`; kamera terbang ke papannya. `/office` dialihkan ke `/`. Tutup: ✕, Esc, klik backdrop, tombol Back.
- 13 papan di lantai 1: belakang (Peluang, Pipeline, Papan Tugas, Kalender, Kotak Masuk, Proyek & Pendapatan, Aktivitas, projects.co.id) dan kiri (Tim AI, Profil, Kebijakan, Knowledge Hub, Status Integrasi). Lantai 2 memiliki papan Operasional Klien. `/projects-co-id` dan `/operations` membuka kartu seperti rute lain. Isi papan dari data nyata (`buildBoards`); sumber gagal → "Tidak tersedia". Kedua lantai diperlebar 4,7 unit ke kanan atas permintaan pemilik; batas gerak dan minimap mengikuti `FLOOR`.
- Overlay: kartu status (Mission Control, jam, ringkasan kru, status bid live), daftar agen, menu Papan, pencarian (Ctrl+K), **kill switch**, layar penuh, dock zona, minimap, kontrol tampilan (3D/denah/Tur/Pusatkan).
- Kartu memakai tema 3D lewat override token CSS di `.vo3d-sheet` dan menyembunyikan judul besar halaman (`.page-intro h1`).

### 8.2 Scene 3D — catatan teknis
- Papan: tekstur canvas; bingkai harus **di belakang** permukaan (koplanar = z-fighting/bintik). Papan di `y = 3.4` di atas label pod; dinding belakang/kiri setinggi 4.3.
- Label pod/zona adalah sprite `depthTest=false`, ukurannya diskalakan rasio layar.
- `dt` animasi dibatasi `0.5` (bukan 0.05) agar agen tetap tepat waktu saat FPS rendah.
- Uji browser otomatis sering membeku karena RAM sistem pemilik terbatas (~0.5 GB bebas). Jangan memaksa; laporkan.

---

## 9. Aturan status agen (Kantor Visual & halaman Tim AI)

Satu sumber kebenaran: `deriveOfficeAgents(autopilot, activity, { sync, hermes, inboxWaiting, dueSoon })`.

| Agen | Sinyal nyata | Aturan |
|---|---|---|
| **Lead Agent (Hermes)** | `capabilities.hermes` | nonaktif → Offline (alasan dari server); `draftsInProgress > 0` → Bekerja; aktif → Idle; data gagal → Tidak diketahui |
| Scout projects.co.id (lantai 1) | `/api/projects-co-id` | `mode=off`/paused/error → Offline; GET read-only berjalan → Meninjau; draf aktif → Bekerja; idle → siap membaca listing tersimpan. |
| Market Scout | autopilot | running + `cycleInProgress` → Bekerja; running → Idle; paused/blocked/error → Offline (alasan spesifik); starting/undefined → Tidak diketahui |
| Bid Strategist | autopilot + sync | `sync.step === 'outcomes'` → Meninjau; selain itu seperti Market Scout tapi siklus → Berkolaborasi |
| Compliance Auditor | autopilot | seperti Market Scout, siklus → Berkolaborasi |
| Client Relations | BusinessSync pesan | `step==='messages'` → Bekerja; gagal → Offline; belum pernah → Tidak diketahui; selain itu Idle (+ tugas "N pesan menunggu balasan") |
| Operations Analyst | `/api/work` | `dueSoon > 0` → Meninjau; selain itu on-demand |
| Chief of Staff, Profile Editor, Knowledge Curator (+ Ops Analyst) | — | Idle ("hanya bekerja saat dipanggil"); tanpa data server → Tidak diketahui |
| QA Engineer | kanban Hermes | profil `fvh-qa-engineer` ada → Idle; tanpa tim → Offline |
| Semua karyawan `fvh-<id>` | `/api/hermes-kanban` | kartu `running` untuk profilnya → Bekerja (Chief of Staff → Berkolaborasi) dengan judul kartu sebagai tugas; aturan ini didahulukan |

Penempatan ruangan: Bekerja/Meninjau → **Workspace** (pod sendiri; Lead di meja Lead antara Lobby & Pantry); Berkolaborasi → **Ruang Rapat**; Idle → **Lounge/Pantry**; Tidak diketahui → **Lobby** (penanda "?"); Offline → **tidak di lantai** (redup di daftar). Agen berjalan lewat koridor saat status berubah (`planPath`).

Tambah agen baru: entri `ROSTER` + aturan di `deriveOfficeAgents` + tempat duduk di `office-layout.ts` (grid pod 3×3 sudah penuh) + tes di `office-state.test.ts`.

---

## 10. Konvensi kode

- TypeScript strict dengan **`exactOptionalPropertyTypes`** dan **`noUncheckedIndexedAccess`**. Optional prop yang bisa `undefined` harus ditulis `?: T | undefined`, atau gunakan spread kondisional `...(x ? { key: x } : {})`.
- ESLint `@typescript-eslint/no-unused-vars` aktif; **tidak ada plugin `react-hooks`** — jangan tambahkan komentar `eslint-disable react-hooks/...` (aturan tak dikenal = error).
- Gaya: kode ringkas, komentar hanya untuk "mengapa" yang tidak jelas, nama Inggris di kode, teks UI Bahasa Indonesia.
- Validasi body API dengan skema di `@fvh/contracts`; tanggal `YYYY-MM-DD`; mata uang 3 huruf.
- **Line ending campuran:** sebagian file CRLF, sebagian besar LF. Saat mengedit lewat skrip, deteksi `\r\n` lalu tulis kembali dengan line ending yang sama.
- **Encoding:** file harus UTF-8 valid. Pernah ada byte Windows-1252 (`0x96`) yang membuat file "tidak valid UTF-8".
- Saat menulis kode lewat shell heredoc, **backslash bisa hilang** (regex `\d` menjadi `d`) dan kutip bisa memecah heredoc. Lebih aman tulis ke file lalu jalankan `node script.cjs`, atau gunakan tool edit.

---

## 11. Verifikasi sebelum selesai

```bash
pnpm exec eslint .        # harus bersih
pnpm -r typecheck         # 0 error
pnpm test                 # semua lolos (±125 tes per 16 Okt 2026)
pnpm --filter @fvh/web build
```

Lalu cek perilaku di aplikasi berjalan (`pnpm private:start`, buka `http://127.0.0.1:3001`) atau lewat `curl http://127.0.0.1:3001/api/...`. Request tulis dari curl memerlukan header `Origin: http://127.0.0.1:5174`.

Tes penting: `office-state.test.ts` (aturan status), `office-layout.test.ts` (kursi unik, rute, papan), `business-sync.test.ts`, `autopilot.test.ts` (profil tidak ditimpa, Hermes + fallback), `app.test.ts` (Host ditolak, insights, inbox, work, GitHub sync-all), adapter tests (ID bid/thread **numerik** seperti API asli).

---

## 12. Jebakan yang sudah pernah terjadi (jangan ulangi)

1. **Menyimpan profil menonaktifkan autopilot:** `PUT /api/profile` pada kebijakan aktif → kebijakan kembali ke `draft`. Pemilik harus mengaktifkan ulang di kartu Kebijakan.
2. **Spesialisasi maksimal 12** dan dipakai autopilot sebagai **kata kunci pencarian Freelancer** — skill teknis (Python, Laravel) lebih efektif daripada nama peran.
3. **ID dari Freelancer berupa angka.** Gunakan `identifier()` (bukan `text()`) di adapter; tes harus memakai ID numerik.
4. **Kuota bid** dihitung dari audit `marketplace.production.submit_bid` berstatus `recorded` di zona waktu kebijakan — bukan dari jumlah draf.
5. **Hitungan "Keputusan dilewati"** memakai `countAuditByStatus('blocked')` (semua), bukan 200 event terakhir.
6. **Jam operasi** diperiksa dalam **zona waktu kebijakan** (`Asia/Jakarta`, 00–24), bukan zona waktu browser.
7. **"Tenggat" proyek Freelancer** sebenarnya waktu penutupan listing saat sinkronisasi terakhir (`deadlineDays` statis).
8. **Proses detached di Windows** tidak menulis output node ke file handle warisan → `private:start` memakai supervisor node yang mem-pipe output `pnpm dev`. `shell: true` + argumen menimbulkan peringatan deprecation → panggil `cmd.exe /d /s /c` eksplisit.
9. **OpenCode** pernah membatalkan perubahan pemilik di `app.ts` (baris `GITHUB_TOKEN`) dan meninggalkan kode setengah jadi. Selalu review diff setelah alat otomatis.
10. Membuat draf lokal untuk sebuah proyek membuat autopilot **melewati proyek itu**.

---

## 13. Keputusan pemilik (jangan diubah tanpa bertanya)

- Bid dikirim **otomatis penuh** (tanpa antrean persetujuan) dalam batas kebijakan: harga 100–800 USD, 4 bid/hari, 12/minggu, jam 00–24 WIB.
- Proposal bid otomatis **ditulis Hermes**; consent pengiriman data ke Hermes **sudah diberikan**.
- **Lead Agent (Hermes)** ditampilkan di kantor dengan status nyata.
- LinkedIn: API tidak memberi riwayat kerja/skill → gunakan **impor file ekspor LinkedIn** (CSV) di Knowledge Hub.
- **Keputusan 16 Oktober 2026:** lantai 2 menangani progres klien, invoice, pembayaran dan jadwal pemilik; setiap lantai memiliki manajer yang melapor ke Lead. Pesan WhatsApp otomatis hanya untuk klien/proyek serta jenis pesan yang diaktifkan pemilik. Modul marketing dan antrean persetujuan bid tetap tidak digunakan.
- Tampilan **full 3D**: tanpa sidebar; halaman hanya sebagai kartu yang dibuka dari papan.

---

## 14. Batasan yang diketahui & ide berikutnya

- Sinyal kerja: autopilot, BusinessSync, Hermes, sinkronisasi Knowledge Hub dan worker operasional. Untuk perubahan invoice, WhatsApp QR, Google OAuth/Calendar, antrean pesan atau manajer lantai, baca `docs/floor-two-operations.md` sebelum mengedit. Persona yang tidak mempunyai job aktif tetap idle/on-demand.
- Deteksi menang/kalah belum pernah teramati pada data nyata (belum ada bid diputuskan).
- Kanal/sesi Hermes (mis. Telegram) tidak dilaporkan → ditampilkan "Tidak tersedia".
- **Realtime layar:** `GET /api/events` (SSE). Setiap tulis database dan perubahan status worker diumumkan per topik (digabung 250 ms); web memuat ulang query terkait. Polling tetap sebagai cadangan; overlay menampilkan "Realtime aktif/terputus". Lihat `docs/realtime.md`.
- Tidak ada mode simulasi: aktivasi kebijakan hanya `{ mode: 'live', confirmLive: true }` (gagal tertutup tanpa autopilot/kredensial); route `simulate-submit` dihapus 20 Okt 2026. `simulationOnly` tetap di tipe untuk kebijakan lama.
- Tim Hermes: profile `fvh-<id>` per karyawan + board kanban `fvh-house`, orchestrator `fvh-chief-of-staff`, project Hermes `fvh` terikat ke board (worktree per kartu); hanya `fvh-qa-engineer` dan `fvh-knowledge-curator` punya tool file/terminal; dibuat oleh `scripts/hermes-team.ts` (lihat `docs/hermes-agent-setup.md` §7). Board tampil di Papan Tugas dan menjadi sinyal status agen (§9).
- API lokal tanpa autentikasi (dilindungi loopback + Host + Origin) — cukup untuk lokal satu pengguna.
- Ide: sinyal kerja nyata untuk Knowledge Curator (saat sinkronisasi GitHub), kamera mengikuti agen yang berjalan, menghapus CSS sidebar lama, membaca milestone Freelancer untuk pendapatan otomatis.

<!-- antislop:start -->
## antislop
For UI work, read the core and relevant skill files from the owner's global antislop installation:
- Core: `C:/Users/khair/.agents/skills/antislop/SKILL.md`
- UI / visual: `C:/Users/khair/.agents/skills/antislop-ui/SKILL.md`
- People and accessibility: `C:/Users/khair/.agents/skills/antislop-human/SKILL.md`
- Mobile / responsive: `C:/Users/khair/.agents/skills/antislop-layoutmobile/SKILL.md`
- The human skill's contrast checker is in the same `antislop-human` folder.
Before UI work in a new session, ask whether antislop applies during the work or afterward.
These paths use the owner's global installation; keep the skill files from the same release and do not copy or download them through an agent.
<!-- antislop:end -->
