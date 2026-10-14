# TASKS — Roadmap Freelancer Virtual House

Dokumen pendamping: [PRD.md](PRD.md), [AGENT.md](AGENT.md), dan [TECH_STACK.md](TECH_STACK.md). Urutan dibuat agar MVP cepat dapat digunakan: UI/data lokal dan simulasi aman lebih dahulu, adapter resmi setelah capability diverifikasi.

## Cara kerja

- Kerjakan dalam irisan kecil dan tutup acceptance criteria tiap fase.
- Gunakan data fiktif/fixture pada test. Jangan jalankan live write.
- Gunakan sandbox resmi jika API credential dan akses tersedia; bila kemampuan endpoint belum terverifikasi, tandai manual-only dan lanjutkan bagian independen.
- Jalankan targeted checks dan smoke flow sesuai perubahan.

## Phase 0 — Validasi akses dan bentuk produk

- [x] **0.1 Verifikasi dokumentasi Freelancer API**: autentikasi, OAuth callback, scopes, resource proyek, profil, portofolio, komunikasi, bid; pagination, limit headers, sandbox, error, retensi data, dan API terms. Kontrak endpoint belum dapat diverifikasi; capability tetap `unknown` dan adapter tidak mengirim request.
- [x] **0.2 Verifikasi akses GitHub dan LinkedIn**: GitHub App permissions/repo selection; LinkedIn OAuth/API product approval, profile fields, data storage policy, serta opsi ekspor data pengguna. Hasil dan batas akses dicatat di capability matrix.
- [x] **0.3 Catat capability matrix**: endpoint/version, tautan docs resmi, scope, sandbox test, dan status `supported`/`unsupported`/`unknown`.
- [x] **0.4 Tentukan katalog bidang/spesialisasi** dan pilihan pengguna (contoh Fullstack Engineer, Backend Engineer, Android Engineer), bidang utama, mata uang, bahasa, jam kerja, batas harga, deployment target, dan model/provider OpenCode.
- [x] **0.5 Definisikan kebijakan hands-off**: aksi otomatis, ambang confidence, filter peluang, budget, batas bid dan pesan, aturan pembaruan profil, jam aktif, masa berlaku, feed audit, dan kill switch.
- [x] **0.6 Buat threat model ringkas**: pencurian token, OAuth CSRF, prompt injection dari repo/LinkedIn, duplicate submit, log leakage, dan penyalahgunaan akun. Lihat [docs/threat-model.md](docs/threat-model.md).

**Acceptance:** semua kemampuan tulis yang belum dibuktikan bernilai `unknown` atau `unsupported`, sehingga dinonaktifkan; katalog mencakup contoh spesialisasi; aktivasi policy dan kill switch didefinisikan.

## Phase 1 — Foundation dan vertical slice lokal

- [x] **1.1 Scaffold pnpm workspace TypeScript strict** dengan lint, typecheck, Vitest, build, dan ignore untuk secrets/data lokal.
- [x] **1.2 Buat paket domain/application/contracts** dan dependency rule.
- [x] **1.3 Buat Fastify server serta React/Vite shell**; API same-origin dan health status.
- [x] **1.4 Buat SQLite/Drizzle schema dan migration awal** untuk workspace, bidang/spesialisasi, policy, proyek, pipeline, draf, audit, dan status automasi.
- [x] **1.5 Buat dashboard 2D fixture-first**: ringkasan, inbox proyek, pipeline, dan konfigurasi.
- [x] **1.6 Tambahkan UI smoke test** dari daftar fixture → buat draf fixture → policy decision → simulated send → activity feed → pause.

**Acceptance:** aplikasi dapat dijalankan lokal dengan data contoh; flow 2D bekerja tanpa API key/AI; lint/typecheck dan smoke target lulus.

**Status:** selesai. UI juga diperiksa di browser produksi pada desktop dan lebar ponsel.

## Phase 2 — OAuth dan Freelancer read adapter

- [ ] **2.1 Implementasikan secret-store port** dengan credential store lokal aman dan interface secret manager untuk hosted.
- [ ] **2.2 Implementasikan OAuth berdasarkan alur resmi terverifikasi**: state, callback allowlist, scope minimum, token encryption, refresh/revoke hanya sesuai dukungan resmi.
- [ ] **2.3 Implementasikan Freelancer adapter baca** untuk resource yang benar-benar didukung: proyek, profil, atau lainnya hanya setelah verified.
- [ ] **2.4 Tambahkan pagination guard, timeout, rate limiter, `429`/`Retry-After`, retry terbatas, schema validation, redaction, dan incremental sync bila API mendukung.
- [ ] **2.5 Implementasikan dedup dan source metadata** di penyimpanan.
- [ ] **2.6 Tambahkan contract tests** dengan fixture tersanitasi dan sandbox bila tersedia.

**Acceptance:** token tidak ada di browser/log/plaintext DB; OAuth invalid-state ditolak; hasil read dipetakan dan dipaginasi; limit/error berhenti secara wajar; capability yang belum ada dijelaskan manual-only tanpa scraping.

## Phase 2.5 — Knowledge Hub GitHub dan LinkedIn

- [ ] **2.5.1 Buat GitHub connector read-only** dengan GitHub App/fine-grained access, repository selection, minimum contents permission, dan pagination/cursor.
- [x] **2.5.2 Implementasikan LinkedIn connector** hanya untuk official API scopes/products yang approved; jika cakupan profil luas tidak tersedia, sediakan import file export/fakta manual. Jalur API nonaktif; fakta manual dan ekspor milik pengguna didukung.
- [ ] **2.5.3 Buat full backfill + incremental sync** yang dapat dilanjutkan, dengan source coverage, sync cursor/freshness, retries terbatas, dan idempotent upsert.
- [x] **2.5.4 Bangun normalizer/chunker dan SQLite FTS5 index** untuk dokumentasi/source code; simpan repo/path/ref/URL/timestamp provenance.
- [ ] **2.5.5 Terapkan secret scanning dan exclusions** untuk credential, `.env`, key files, binary, vendor/dependency, generated output, large files, dan user-defined patterns.
- [x] **2.5.6 Buat Knowledge Hub monitor**: daftar repositori/sumber, coverage, last sync, error, exclusions, resync, disconnect, dan purge.
- [x] **2.5.7 Buat retrieval port** yang hanya mengirim top-k chunk relevan dan bukti URL/path ke OpenCode, dengan token budget; knowledge base bukan model training.
- [ ] **2.5.8 Uji fixture** untuk permissions, incremental changes, secret exclusion, prompt injection, stale results, provenance, disconnect/delete. Fixture menguji secret, provenance, pencarian, dan penghapusan; incremental cursor belum tersedia.

**Acceptance:** semua repo terpilih terindeks setelah full sync; sync incremental tidak menggandakan data; LinkedIn berfungsi hanya sesuai approved API atau user-provided export; secret dikecualikan; jawaban AI menyertakan sumber yang dapat ditelusuri; disconnect/delete menghapus index terkait.

**Status:** GitHub read-only sync dibatasi repositori dan ukuran file. GitHub App auth, pagination/cursor, full/incremental sync, dan pola pengecualian khusus pengguna belum selesai.

## Phase 3 — Scoring, pipeline, dan policy engine

- [x] **3.1 Implementasikan pemilihan bidang utama/multi-spesialisasi dan scoring explainable** (skills, budget, scope, deadline, brief quality, risk).
- [x] **3.2 Implementasikan state machine pipeline** dengan transisi tervalidasi dan idempotent.
- [x] **3.3 Implementasikan proposal/pertanyaan melalui AI mock** terlebih dahulu.
- [x] **3.4 Implementasikan autonomy policy** dengan scope tindakan, bidang/keyword, confidence threshold, budget/harga, batas frekuensi, jam aktif, expiry, versi, status pause, serta aturan skip.
- [x] **3.5 Buat monitor** yang menunjukkan bid terkirim, skip/error dan alasannya, pemakaian budget/batas, perubahan profil, serta tombol pause/resume. Monitor menampilkan aktivitas simulasi dan status lokal; belum ada bid eksternal.
- [x] **3.6 Buat jalur simulasi send** yang memvalidasi policy dan merekam audit tanpa mengirim ke platform.

**Acceptance:** keputusan policy deterministic dan dapat diuji; aksi di luar batas selalu skip; policy expired/paused memblokir write; simulasi membuat audit event; pengguna dapat pause kapan saja tanpa kehilangan riwayat.

**Status:** selesai untuk pipeline lokal dan simulasi. Tidak ada submit marketplace.

## Phase 4 — OpenCode CLI dan agen virtual

- [x] **4.1 Buat AiDraftingPort dan adapter OpenCode CLI** dengan process spawn aman, `shell:false`, timeout, output limit, validasi exit code, dan redaksi.
- [ ] **4.2 Buat prompt dan schema output berversi** untuk assessment, proposal, profile diff, dan reply draft; gunakan knowledge retrieval dengan source citations.
- [ ] **4.3 Konfigurasikan agen virtual** sesuai AGENT.md dengan permission minimum; drafting/read-only, tanpa API credentials/tools tulis.
- [x] **4.4 Tambahkan sanitasi input/untrusted project text**, sumber fakta, dan guard klaim tanpa dukungan.
- [ ] **4.5 Buat health/status UX** untuk CLI/model tidak tersedia, timeout, malformed output, dan fallback manual.
- [ ] **4.6 Tambahkan targeted tests** untuk process failure, truncation, konten injection-like, schema mismatch, dan secret redaction.

**Acceptance:** bila OpenCode gagal, tindakan berbasis AI yang terkait tidak dieksekusi dan tercatat; output divalidasi; prompt tanpa secret; klaim pengalaman tertaut ke sumber GitHub/LinkedIn; tidak ada jalur langsung AI→marketplace.

**Status:** adapter dan skema diuji memakai process runner fixture. CLI/model nyata belum dikonfigurasi, sehingga belum diuji dengan provider eksternal.

## Phase 5 — Write operations terverifikasi (opsional per capability)

Kerjakan tiap subtask hanya bila Phase 0 mengonfirmasi endpoint, scope, API terms, sandbox behavior, policy enforcement, dan kill switch.

- [ ] **5.1 Bid submit otomatis** memakai policy aktif, hash payload, status terkini, timeout reconciliation, dedupe, per-bid cap, dan audit.
- [ ] **5.2 Profile/portfolio update otomatis** memakai fakta terverifikasi, diff versioned, aturan field yang diizinkan, rollback lokal, dan audit.
- [ ] **5.3 Message send otomatis** hanya untuk tipe komunikasi rutin yang diizinkan policy; blokir kontrak, award, harga di luar batas, dan janji tenggat.
- [ ] **5.4 Uji sandbox terkontrol** untuk capability yang tersedia; verifikasi pause/stop bekerja selama antrean maupun sebelum request.

**Acceptance:** capability tak terverifikasi dan policy tidak aktif selalu memblokir write; operasi dalam policy dapat berjalan tanpa approval per item; tiap aksi/skip tercatat; hasil ambigu tidak di-retry sebelum rekonsiliasi; kill switch menghentikan write baru.

## Phase 6 — Ruang 3D ringan dan aksesibilitas

- [x] **6.1 Selesaikan navigasi 2D** dan status tiap departemen terlebih dahulu.
- [x] **6.2 Tambah scene low-poly Three.js/React Three Fiber dengan dynamic import** dan tombol mode 2D/3D.
- [ ] **6.3 Tambah fallback** saat WebGL tidak ada/gagal atau reduced motion aktif.
- [x] **6.4 Hubungkan zona 3D ke deep link daftar kerja; aksi tetap melalui form/review 2D.**
- [ ] **6.5 Ukur bundle/performance** pada perangkat target dan kurangi geometri/tekstur bila perlu.

**Acceptance:** seluruh dashboard monitoring dan kontrol automasi tersedia di 2D; scene tidak dimuat sebelum dipilih; fallback tidak perlu reload; keyboard, reduced motion, dan label dasar bekerja.

**Status:** render 3D diuji pada browser produksi. Fallback saat WebGL gagal/reduced-motion dan optimasi ukuran chunk masih perlu dikerjakan.

## Phase 7 — Profil, portofolio, komunikasi, dan kesiapan penggunaan

- [ ] **7.1 Tambahkan profile studio** dengan fakta terverifikasi dan draft/diff per field.
- [ ] **7.2 Tambahkan portofolio lokal dan integrasi API** hanya bila API mendukung.
- [ ] **7.3 Tambahkan inbox/ringkasan thread/draf balasan** hanya untuk data yang diizinkan.
- [ ] **7.4 Tambahkan audit viewer, disconnect/revoke, export/delete/retention** sesuai capability dan terms.
- [ ] **7.5 Buat backup/restore dan panduan setup lokal** tanpa secret.
- [ ] **7.6 Jalankan targeted security review, adapter contract tests, UI smoke, build, dan verifikasi dokumentasi.**

**Acceptance:** monitor menampilkan setiap perubahan eksternal dengan sumber dan policy yang memicunya; delete/disconnect bekerja sesuai capability; docs, implementasi, dan capability matrix konsisten.

## MVP cut line

MVP hands-off siap diuji di sandbox bila fase 1–5 selesai, read/write adapter yang dipakai sudah dikonfirmasi, Knowledge Hub menunjukkan coverage/freshness dan provenance, policy engine serta kill switch teruji, dan activity monitor menunjukkan setiap aksi dan skip. Fase 6 dapat menyusul tanpa memblokir operasi 2D.

## Global definition of done

- Acceptance criteria fase terpenuhi dan dapat didemokan, termasuk policy pause/resume.
- Lint/typecheck serta targeted tests/smoke yang relevan lulus; laporan menyebut hasil pemeriksaan yang benar-benar dijalankan.
- Tidak ada secret, data akun nyata, atau artefak lokal di source control.
- Kegagalan AI/API terlihat dan aman; tidak ada duplicate send atau blind retry.
- Dokumen diperbarui jika endpoint, scope, permission, model data, keputusan stack, atau task berubah.
- Tidak ada live write akun produksi dalam tes otomatis. Aksi live hanya berjalan setelah aktivasi satu kali policy oleh pemilik, dan setiap aksi dibatasi policy serta dapat dihentikan.
