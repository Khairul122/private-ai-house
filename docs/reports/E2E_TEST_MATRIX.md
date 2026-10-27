# E2E TEST MATRIX — FREELANCER VIRTUAL HOUSE (MISSION CONTROL)

Dokumen ini adalah matriks pengujian end-to-end (E2E), integrasi, dan fungsional komprehensif untuk aplikasi **Freelancer Virtual House / Mission Control**. Disusun oleh Lead QA (**Srikandi**) berdasarkan analisis arsitektur, kode sumber, spesifikasi bisnis (`AGENTS.md`), serta hasil verifikasi sistem.

---

## 1. Profil Aplikasi & Arsitektur Sistem

- **Tipe Aplikasi:** Local Single-User Web & 3D Interactive Mission Control untuk solo developer freelance.
- **Frontend Stack:** React 19, React Router, TanStack Query (`@tanstack/react-query`), Three.js, React Three Fiber (`@react-three/fiber`), OrbitControls.
- **Backend Stack:** Fastify (Node.js ≥ 24, TypeScript strict), Zod (`@fvh/contracts`), Fastify Static, Server-Sent Events (`/api/events`).
- **Database & Persistence:** Supabase Postgres (`search_path = fvh`, migrasi 0001–0003), PGlite in-memory untuk tes terisolasi, `WorkspaceRepository`.
- **Integrasi Eksternal:** Freelancer.com API, Hermes AI CLI (adapter draf bid), GitHub API (Contents & Repositories), LinkedIn API/OIDC-lite, Baileys (WhatsApp Web QR), Google Calendar API (OAuth 2.0 PKCE), projects.co.id (HTTP GET scraping read-only).
- **Keamanan:** Host header loopback whitelist (`127.0.0.1`, `localhost`, `[::1]`), Origin validation untuk mutasi data (DNS rebinding protection), DPAPI Windows encryption untuk kredensial marketplace (`.local/credentials.dpapi.json`), CSP ketat (`frame-ancestors 'none'`).

---

## 2. Matriks Pengguna & Peran (User Roles & AI Personas)

Aplikasi beroperasi dalam model **satu pengguna manusia (Owner/Pemilik)** didukung oleh **Tim Agen AI Virtual (Hermes & Rules-based)**:

| Identitas / Peran | Tipe | Tanggung Jawab & Hak Akses | Batasan Keamanan & Otorisasi |
|---|---|---|---|
| **Owner (Pemilik)** | Human Operator | Kendali penuh, aktivasi kebijakan, otorisasi proposal, persetujuan penandaan bid terkirim/menang, pengiriman pesan manual. | Memerlukan konfirmasi eksplisit (`confirmLive: true`, `confirm: true`) untuk aksi marketplace atau perubahan status permanen. |
| **Lead Agent (Hermes)** | AI CLI Persona | Menyusun draf proposal otomatis berbasis konteks profil dan potongan bukti Knowledge Hub. | Berjalan tanpa tools (`toolset` kosong), tidak memegang token/kredensial marketplace, proposal divalidasi deterministik. |
| **Market Scout** | Automation Worker | Memindai proyek terbuka di Freelancer.com berdasarkan spesifikasi profil. | Hanya membaca (GET). Menghormati jeda kebijakan, backoff HTTP 429, dan rotasi kata kunci. |
| **Bid Strategist** | Business Logic Worker | Menilai skor kecocokan proyek (`scoreProject`) dan mengevaluasi batasan kebijakan (`evaluatePolicy`). | Keputusan deterministik di domain layer; tidak dapat mengubah batasan harga/kuota di luar kebijakan. |
| **Compliance Auditor** | Security Watchdog | Memeriksa kill switch, batas harian/mingguan, jam aktif, dan istilah terlarang (*no-negotiation terms*). | Dapat memblokir bid secara otomatis (`status: blocked`, audit trail dicatat). |
| **Client Relations** | BusinessSync Worker | Membaca thread pesan klien dan hasil bid yang diputuskan secara read-only. | **Tidak pernah mengirim pesan otomatis** ke Freelancer.com; hanya memantau. |
| **Operations Analyst** | Operations Service | Melacak progres proyek aktif, tenggat pembayaran, dan pengingat invoice di Lantai 2. | Pesan WhatsApp otomatis hanya terkirim jika opsi proyek/klien diaktifkan oleh pemilik. |
| **Chief of Staff** | Virtual Orchestrator | Mengkoordinasikan kanban board `fvh-house` dan ritme kerja agen. | Hanya mengusulkan kartu tugas kanban; tidak mengeksekusi mutasi eksternal. |
| **QA Engineer (Srikandi)** | Quality Assurance | Melakukan verifikasi otomatis, regresi, dan audit konsistensi data. | Akses audit, verifikasi integritas kontrak zod, dan validasi skenario E2E. |

---

## 3. Matriks Fitur & Skenario Pengujian (Feature Test Matrix)

### 3.1 Rute Navigasi & Tampilan Antarmuka (Navigation & 3D Shell)

| ID | Fitur / Rute | Skenario Uji | Metode Verifikasi | Ekspektasi Hasil | Status |
|---|---|---|---|---|---|
| **NAV-01** | `GET /` (VisualOffice) | Membuka antarmuka 3D kantor virtual saat server aktif. | Sokudo E2E / Unit Web (`OfficeAgent.test.ts`, `office-layout.test.ts`) | Kontainer `.vo3d-root` dan canvas WebGL dimuat; OrbitControls dan status agen terinisialisasi. | **PASS** |
| **NAV-02** | Drawer Kartu Papan (`/overview`, `/tasks`, dll.) | Mengklik papan di dinding kantor atau membuka URL drawer langsung. | Sokudo E2E (`office-navigation.yaml`) & `tablet-shortcut.test.ts` | Kartu overlay terbuka di sisi kanan (`.vo3d-sheet`), kamera 3D mengarah ke papan terkait. | **PASS** |
| **NAV-03** | Rute `/office` | Mengakses rute alias `/office`. | React Router test (`App.tsx`) | Melakukan `Navigate to="/" replace` tanpa error loop. | **PASS** |
| **NAV-04** | Rute Tak Dikenal (`*`) | Mengakses path yang tidak terdaftar (contoh `/unknown-path`). | React Router & NotFoundPage test | Menampilkan `NotFoundPage` dengan link kembali ke kantor. | **PASS** |
| **NAV-05** | Pergerakan & Jalur Agen | Perubahan status agen memicu perpindahan kursi/ruangan. | Unit Test (`owner-motion.test.ts`, `office-life.test.ts`) | Agen berjalan melalui koridor yang valid (`planPath`), tidak menembus furnitur atau dinding. | **PASS** |

### 3.2 Keamanan & Pembatasan Akses (Security & Network Perimeter)

| ID | Fitur / Komponen | Skenario Uji | Metode Verifikasi | Ekspektasi Hasil | Status |
|---|---|---|---|---|---|
| **SEC-01** | Host Header Whitelist | Request dengan `Host: evil.example:3001` ke API backend. | API Test (`app.test.ts`) | Fastify mengembalikan HTTP 403 `{ error: "Host tidak diizinkan." }`. | **PASS** |
| **SEC-02** | Loopback Host Validation | Request dengan `Host: 127.0.0.1:3001` atau `localhost:3001`. | API Test (`app.test.ts`) | Request lolos pemeriksaan Host (HTTP 200). | **PASS** |
| **SEC-03** | Origin Verification | Mutasi POST/PUT dengan Origin di luar daftar izin (DNS rebinding). | Fastify hook (`app.ts`, `routes/operations.test.ts`) | HTTP 403 `{ error: "Origin tidak diizinkan." }`. | **PASS** |
| **SEC-04** | Security Headers & CSP | Memeriksa header respons keamanan pada semua endpoint. | API Test (`app.ts`) | Terdapat `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `CSP frame-ancestors 'none'`. | **PASS** |
| **SEC-05** | Credential DPAPI Vault | Membaca & menyimpan kredensial sensitif di `.local/credentials.dpapi.json`. | Vault Test (`integration-vault.test.ts`, `credential-store.test.ts`) | Kredensial terenkripsi dengan Windows DPAPI; tidak pernah bocor dalam plaintext. | **PASS** |

### 3.3 Ringkasan Bisnis & Dashboard (`/overview`, `/api/dashboard`)

| ID | Fitur / Komponen | Skenario Uji | Metode Verifikasi | Ekspektasi Hasil | Status |
|---|---|---|---|---|---|
| **DSH-01** | Kuota Bid Harian & Mingguan | Menghitung kuota bid dari audit log terkonfirmasi di zona waktu kebijakan. | Domain & API Test (`app.test.ts`, `repository.test.ts`) | Hanya bid berstatus `recorded` yang dihitung; kegagalan (`failed`) tidak mengurangi kuota. | **PASS** |
| **DSH-02** | Perhatian Pemilik (*Attention Items*) | Memeriksa pesan butuh balasan, proyek mepet tenggat (<= 2 hari), dan follow-up bid >= 3 hari. | Web & API Test (`OverviewPage.test.tsx`, `inbox.test.ts`) | Menampilkan daftar perhatian jika sinkronisasi aktif; menampilkan notice jika sync belum berjalan. | **PASS** |
| **DSH-03** | Penanganan Error & Kejujuran Data | Simulasi error API pada `/api/dashboard` atau `/api/autopilot`. | UI Component Test (`CardDataStatus.test.tsx`, `fresh()`) | Menampilkan pesan error/tidak tersedia; tidak menampilkan data basi/simulasi sebagai live. | **PASS** |

### 3.4 Antrean Peluang & Evaluasi Proyek (`/opportunities`, `/api/projects`)

| ID | Fitur / Komponen | Skenario Uji | Metode Verifikasi | Ekspektasi Hasil | Status |
|---|---|---|---|---|---|
| **OPP-01** | Penilaian Kecocokan (`scoring`) | Menghitung skor kecocokan berdasarkan keterampilan, anggaran, dan durasi. | Domain Test (`scoring.test.ts`) | Skor deterministik 0–100 berdasarkan bobot keahlian dan kepatuhan anggaran. | **PASS** |
| **OPP-02** | Filter Pencarian Lokal | Pencarian teks bebas pada judul, deskripsi, nama klien, dan tag keahlian. | Sokudo E2E (`opportunities-search.yaml`) & Web Test | Daftar peluang tersaring instan sesuai teks input tanpa request backend berlebih. | **PASS** |
| **OPP-03** | Filter Status & Sumber | Memfilter peluang berdasarkan status (`open`, `closed`) dan sumber (`freelancer`, `projects_co_id`). | Web View Test (`source-filter.tsx`) | Tampilan menampilkan item yang sesuai; penanda sumber akurat. | **PASS** |
| **OPP-04** | Pembuatan Draf Proposal Manual | Mengirim request `POST /api/projects/:id/draft` untuk proyek tersimpan. | API Test (`app.test.ts`, `smoke.test.ts`) | Draf proposal dibuat dengan status `draft_ready`, tersimpan di database dan dicatat di audit. | **PASS** |
| **OPP-05** | Penyuntingan Draf Manual | Mengubah teks dan harga draf proposal via `PUT /api/drafts/:id`. | API Test (`app.test.ts`) | Validasi zod diterapkan; perubahan disimpan tanpa mengubah status asli sebelum pengiriman. | **PASS** |

### 3.5 Kebijakan Automasi & Mesin Kebijakan (`/policy`, `/api/policy`)

| ID | Fitur / Komponen | Skenario Uji | Metode Verifikasi | Ekspektasi Hasil | Status |
|---|---|---|---|---|---|
| **POL-01** | Pembaruan Batas Kebijakan | Menyimpan batas harga (USD), kuota bid, jam aktif, dan kata kunci. | API Test (`app.test.ts`, `policy.test.ts`) | Versi kebijakan bertambah secara atomik (`expectedVersion`), jadwal tervalidasi. | **PASS** |
| **POL-02** | Pencegahan Konflik Versi (Optimistic Lock) | Menyimpan kebijakan dengan `expectedVersion` yang usang. | API Test (`app.test.ts`) | HTTP 409 Conflict dikembalikan; data tidak tertimpa diam-diam. | **PASS** |
| **POL-03** | Validasi Zona Waktu & Jam Kerja | Input timezone tidak valid (misal `Bad/Zone`) atau jam terbalik. | Kontrak Zod (`policy.ts`, `contracts`) | HTTP 400 Bad Request dengan rincian issue zod yang jelas. | **PASS** |
| **POL-04** | Kill Switch ("Jeda Automasi") | Mengirim `POST /api/policy/pause` saat automasi aktif. | API & Integration (`app.test.ts`, `smoke.test.ts`) | Status kebijakan langsung berubah ke `paused`, dicatat di audit log, autopilot berhenti mengirim bid. | **PASS** |
| **POL-05** | Aktivasi Bid Live | Mengaktifkan kebijakan tanpa konfirmasi eksplisit (`confirmLive: false`). | API Test (`app.test.ts`) | Aktivasi ditolak jika belum ada konfirmasi atau kredensial marketplace belum lengkap. | **PASS** |
| **POL-06** | Reset Kebijakan saat Profil Berubah | Melakukan `PUT /api/profile` saat kebijakan sedang aktif. | Persistence Test (`repository.test.ts`, `AGENTS.md §12`) | Kebijakan secara otomatis kembali ke status `draft` untuk mencegah bid tidak sah. | **PASS** |

### 3.6 Pipeline Penawaran & Pelacakan Status (`/pipeline`, `/api/pipeline`)

| ID | Fitur / Komponen | Skenario Uji | Metode Verifikasi | Ekspektasi Hasil | Status |
|---|---|---|---|---|---|
| **PIP-01** | Transisi Siklus Hidup Bid | Transisi status dari `new` → `scored` → `draft_ready` → `submitted` → `won`/`lost`. | Domain Test (`pipeline.test.ts`, `bid-outcome.test.ts`) | State machine memvalidasi transisi yang sah dan menolak lompatan status ilegal. | **PASS** |
| **PIP-02** | Penentuan Hasil Bid Deterministiik | Pemetaan status Freelancer (`awarded`, `rejected`, `revoked`, `null`). | Domain Test (`bid-outcome.test.ts`) | Status dipetakan ke `won`, `lost`, atau tetap `pending` (tidak pernah ditebak). | **PASS** |
| **PIP-03** | Otomasi Pembuatan Proyek Menang | Bid berubah menjadi `won` dalam siklus BusinessSync. | Service Test (`business-sync.test.ts`, `repository.test.ts`) | Proyek klien aktif baru (`client_projects`) dibuat otomatis tanpa duplikasi. | **PASS** |

### 3.7 Integrasi projects.co.id (`/projects-co-id`, `/api/projects-co-id`)

| ID | Fitur / Komponen | Skenario Uji | Metode Verifikasi | Ekspektasi Hasil | Status |
|---|---|---|---|---|---|
| **PCI-01** | Pemindaian Listing Read-Only | Mengirim request `POST /api/projects-co-id/scan`. | E2E & Service (`projects-co-id.e2e.test.ts`, `projects-co-id.test.ts`) | Scraping dilakukan murni via HTTP GET; listing diparse ke tabel proyek lokal IDR. | **PASS** |
| **PCI-02** | Proteksi Jalur Penulisan Browser | Mengakses rute usang `/api/projects-co-id/open` atau `/submit`. | E2E API Test (`projects-co-id.e2e.test.ts`) | `/open` mengembalikan HTTP 410 Gone; `/submit` mengembalikan HTTP 404 Not Found. | **PASS** |
| **PCI-03** | Penandaan Manual oleh Pemilik | Pemilik menandai proyek sebagai "Sudah Terkirim" (`/mark-sent`) dengan konfirmasi. | API Test (`projects-co-id.test.ts`) | Pipeline berubah ke `submitted`; audit log mencatat `projects_co_id.owner_marked_sent`. | **PASS** |
| **PCI-04** | Penandaan Menang (`/won`) | Pemilik menandai menang pada proyek yang sudah `submitted`. | API Test (`projects-co-id.test.ts`) | Pipeline menjadi `won`, dibuatkan `client_projects` bernilai IDR dalam satu transaksi. | **PASS** |

### 3.8 Knowledge Hub & Repositori Bukti (`/knowledge`, `/api/knowledge`)

| ID | Fitur / Komponen | Skenario Uji | Metode Verifikasi | Ekspektasi Hasil | Status |
|---|---|---|---|---|---|
| **KNW-01** | Impor Berkas Bukti Lokal | Unggah berkas teks/markdown (< 100 KB, format .md, .txt, .csv, .json). | Knowledge & API Test (`index.test.ts`, `app.test.ts`) | Berkas di-chunking secara aman, dibersihkan dari kredensial/token rahasia, diindeks ke Postgres GIN. | **PASS** |
| **KNW-02** | Pencarian Bukti Full-Text | Menjalankan pencarian query pada potongan bukti Knowledge Hub. | Persistence Test (`repository.test.ts`) | Hasil pencarian mengembalikan potongan paling relevan dengan provenance yang valid. | **PASS** |
| **KNW-03** | Sinkronisasi Repositori GitHub | Menjalankan sinkronisasi repositori GitHub pemilik. | Adapter & Service (`adapter-github`, `app.test.ts`) | Sumber lama digantikan atomik (tidak menduplikasi dokumen) dengan token aman. | **PASS** |

### 3.9 Operasional Lantai 2: Invoice, WhatsApp, Kalender (`/operations`, `/api/operations`)

| ID | Fitur / Komponen | Skenario Uji | Metode Verifikasi | Ekspektasi Hasil | Status |
|---|---|---|---|---|---|
| **OPS-01** | Penerbitan Invoice Klien | Membuat invoice baru dengan snapshot identitas bisnis pemilik. | Routes Test (`routes/operations.test.ts`) | Nomor invoice unik diterbitkan, template HTML terlindungi dari XSS injection. | **PASS** |
| **OPS-02** | Pelacakan Pembayaran Multi-Mata Uang | Mencatat pembayaran termin dan status penerimaan (`received`). | Work & API Test (`work.test.ts`, `repository.test.ts`) | Pembayaran tercatat per mata uang tanpa penjumlahan silang kurs fiktif. | **PASS** |
| **OPS-03** | Status Sesi WhatsApp Baileys | Memeriksa ketersediaan koneksi dan QR code WhatsApp Web. | Web & Service Test (`whatsapp-status.test.tsx`, `whatsapp.test.ts`) | Status `disconnected`, `connecting`, atau `connected` ditampilkan jujur tanpa mock palsu. | **PASS** |
| **OPS-04** | Integrasi Google Calendar PKCE | Sinkronisasi jadwal pemilik dengan otentikasi PKCE tanpa ekspos token. | Service Test (`google-calendar.test.ts`) | Token tersimpan aman di backend; event diperbarui tanpa mengirim undangan tak diinginkan. | **PASS** |

---

## 4. Keterbatasan Cakupan & Dependensi Lingkungan

Sesuai aturan kejujuran data dan batasan arsitektur (`AGENTS.md` §2 & §8.2), pengujian berikut memiliki batasan lingkungan terisolasi:

1. **Pengiriman Bid Live ke Marketplace Freelancer.com:**
   - *Batasan:* Tidak dijalankan secara destruktif ke API publik Freelancer.com selama sesi testing untuk mencegah biaya tidak terduga dan pelanggaran kebijakan akun pemilik.
   - *Mitigasi Pengujian:* Diverifikasi secara penuh menggunakan `FixtureDraftingAdapter`, in-memory `WorkspaceRepository` (PGlite), dan tes unit adapter HTTP numerik (`packages/adapter-freelancer/src/index.test.ts`).
2. **Kredensial Live Eksternal (Token Freelancer, OAuth LinkedIn, WhatsApp QR, Google Token):**
   - *Batasan:* Token live tidak boleh dicetak atau dijalankan tanpa persetujuan pemilik.
   - *Mitigasi Pengujian:* Menggunakan pengujian terisolasi dengan DPAPI vault mock dan rejection handler pada state `unknown`/`unverified`.
3. **Alat Otomasi Browser Berat (Playwright/Puppeteer) vs Sokudo E2E Engine:**
   - *Batasan Sistem:* Sesuai instruksi Sokudo IDE Workspace dan catatan RAM sistem pemilik (`AGENTS.md` §8.2: sisa RAM sistem terbatas ~0.5–1.4 GB), Playwright dan browser-automation eksternal dilarang di-install karena memicu memory exhaustion dan crash pada scene 3D WebGL.
   - *Mitigasi Pengujian:* Sokudo E2E Flow Engine native (`e2e_*` tools dengan runner internal berdedikasi) digunakan untuk E2E berbasis YAML yang valid dan terisolasi.
