# Karyawan baru lantai 1: Scout projects.co.id — rencana E2E (draf saja)

Dibuat 19 Oktober 2026, direvisi hari yang sama untuk agen AI pelaksana. Baca `AGENTS.md`, `docs/browser-bidding.md` dan `tasks/browser-bidding-plan.md` dulu.

**Perubahan keputusan pemilik (19 Okt 2026):** demi keamanan akun, karyawan ini **hanya menyiapkan draf**. Pemilik sendiri yang membuka projects.co.id dan mengirim penawaran. Aplikasi **tidak pernah** mengisi atau mengirim form penawaran. Projects.co.id mendapat **kartu khusus** sendiri di kantor 3D.

## Tujuan

Agen baru di lantai 1 yang, memakai Chrome pemilik berprofil **Khairul** lewat Playwright (read-only):

1. Memastikan sesi projects.co.id login dengan akun yang benar (`KhairulHuda06`).
2. Memindai daftar proyek terbuka, menyimpannya sebagai peluang dan menilai skornya.
3. Untuk proyek yang lolos kebijakan, meminta Hermes menulis proposal Bahasa Indonesia dengan harga dan durasi dari kebijakan.
4. Menampilkan draf di kartu **projects.co.id**: pemilik menyunting, menyalin, membuka proyek di tab baru, mengirim sendiri, lalu menandai "Sudah saya kirim" atau "Lewati".

## Batas yang tidak boleh dilanggar

- **Tidak ada request tulis ke projects.co.id dari worker.** Di tab worker, `page.route('**/*')` membatalkan semua request selain `GET/HEAD/OPTIONS` sepanjang sesi (bukan hanya saat submit). Worker tidak membuka form penawaran, tidak mengetik di input situs, tidak mengklik tombol selain navigasi/paginasi.
- Login dilakukan pemilik di Chrome. Worker hanya mendeteksi status login; password/OTP/CAPTCHA tidak pernah lewat aplikasi, chat atau `.env`.
- Sambung ke Chrome yang berjalan lewat `connectExistingChrome` (`connectOverCDP('chrome', { noDefaults: true })`). Tidak ada launch profil kosong, salinan profil, ekspor cookie/localStorage/token, atau trace/screenshot berisi data akun di repo.
- Worker memakai tab sendiri; disconnect tidak menutup Chrome atau tab pemilik.
- Pemindaian sopan: maks 3 halaman daftar per siklus, jeda ≥ 3 dtk antarhalaman, siklus tiap 30 menit, berhenti saat CAPTCHA/challenge.
- Tidak ada route HTTP yang menerima URL, selector atau skrip bebas. Link "Buka di projects.co.id" dibangun dari ID proyek tersimpan dan origin tetap.
- Kill switch "Jeda automasi" menghentikan pemindaian dan pembuatan draf.

## Keputusan

- Pembaruan implementasi 19 Oktober 2026: recon menemukan ID publik enam digit heksadesimal dan slug wajib; parser/fixture mengikuti bentuk situs nyata. Pemilik meminta **kedua lantai diperlebar** untuk papan tambahan, tanpa memindahkan papan lama.

- Username: `KhairulHuda06`.
- Harga awal IDR: minimum Rp100.000, maksimum Rp10.000.000. Bisa diubah lewat kartu Kebijakan dan disimpan di database.
- Aturan harga: `max(minPrice, budgetMin)`, tidak melebihi `min(maxPrice, budgetMax)`. Durasi: `min(tenggat, 14)` atau 14.
- Batas **draf otomatis**: 4/hari, 12/minggu (angka kuota bid sebelumnya, dipakai sebagai batas draf karena aplikasi tidak lagi mengirim bid). Hitung di zona waktu kebijakan, terpisah dari kuota Freelancer.
- Mode awal: `scan-only`. Mode yang ada: `off | scan-only | drafts`. **Tidak ada mode kirim.**
- Pemilik menyatakan sudah membaca S&K dan menerima risiko pemindaian otomatis.
- Kill switch "Jeda automasi" juga menghentikan worker projects.co.id.
- Pemilik mengizinkan recon read-only melalui debugging Chrome profil Khairul; login dilakukan pemilik. **Tidak ada submit bid oleh aplikasi, kapan pun.**
- Antislop diterapkan selama implementasi UI.
- Tandai terkirim: tombol "Sudah saya kirim" mencatat audit `projects_co_id.owner_marked_sent` (status `recorded`, alasan "Ditandai terkirim oleh pemilik; tidak diverifikasi aplikasi") dan pipeline `submitted` dengan konfirmasi pemilik. Ini pengecualian tertulis dari aturan "submitted hanya setelah HTTP 200"; tulis di `AGENTS.md` §6. UI selalu menampilkan "Ditandai terkirim oleh Anda", bukan "Terkirim".

## Fase 0 — Recon read-only (wajib sebelum kode)

Di Chrome pemilik, **hanya membaca**. Hasilnya ditulis ke `docs/projects-co-id.md`, tanpa data pribadi:

- Ada API resmi untuk daftar proyek? Jika ada, pakai untuk membaca.
- URL: login, dashboard, daftar proyek terbuka (+ paginasi/filter kategori), detail proyek.
- Apakah daftar/detail proyek bisa dibaca tanpa login. Jika ya, worker tetap memakai tab Chrome Khairul tetapi tidak membutuhkan halaman berlogin untuk memindai.
- Cara membaca username dari DOM (elemen tetap, tepat satu).
- Struktur detail proyek: ID numerik/slug, judul, deskripsi, anggaran (rentang Rp), tenggat, status terbuka, kategori/skill, nama owner.
- Batas panjang pesan penawaran dan field yang diminta form (dibaca dari halaman bantuan atau dari form yang **pemilik** buka; worker tidak membuka form). Ini untuk membatasi panjang draf.
- CAPTCHA/Cloudflare, rate limit, `robots.txt`.
- Pastikan tab dari `browser.contexts()[0]` berada di profil Khairul (username cocok).
- Apakah dua koneksi CDP bersamaan (worker Freelancer + worker baru) memunculkan dua dialog izin. Jika ya, ekstrak satu koneksi bersama di Fase 2.

## Fase 1 — Domain & data (TDD)

- `packages/domain/src/types.ts`: `ProjectOpportunity.source` tambah `'projects_co_id'`; ID `projects_co_id:<id>`. Kolom `projects.platform` + `UNIQUE(platform, external_id)` sudah ada, jadi **tanpa migrasi**. Draf memakai tabel `bid_drafts` yang ada.
- Konfigurasi projects.co.id (harga IDR, batas draf harian/mingguan, mode) disimpan di JSON kebijakan yang ada, divalidasi skema zod di `@fvh/contracts`. Ingat jebakan §12: menyimpan kebijakan/profil bisa mengembalikan kebijakan Freelancer ke draf. Pastikan menyimpan pengaturan projects.co.id **tidak** menonaktifkan kebijakan Freelancer, atau beri tahu pemilik di UI.
- Hitung draf otomatis dari audit `projects_co_id.draft_created` di zona waktu kebijakan. Jangan pakai `marketplace.production.submit_bid` (dipakai kuota/hasil bid Freelancer dan BusinessSync).
- `evaluatePolicy` dipakai ulang untuk harga/batas/jam aktif/jeda; `chooseBid` versi IDR (fungsi kecil baru, jangan ubah yang USD).
- Tes: skor proyek IDR, pilihan harga IDR, hitungan draf terpisah, ditolak saat dijeda/di luar rentang.

## Fase 2 — Worker read-only & pembuat draf (TDD)

- `apps/server/src/projects-co-id-types.ts`: tipe status/observasi, parser murni (listing, detail, anggaran "Rp 1.500.000 - Rp 3.000.000" → angka, tenggat).
- `apps/server/src/projects-co-id-page.ts`: driver dengan `origin` di konstruktor (untuk fixture):
  - Pasang gate GET-only saat tab dibuat; request tulis apa pun dibatalkan dan dicatat sebagai pelanggaran (tes wajib).
  - `assertOrigin()`, `inspect()` (username, challenge, HTTP navigasi), `listOpenProjects(maxPages)`, `readProject(id)`.
- `apps/server/src/projects-co-id.ts`: service lifecycle meniru `BrowserBiddingService` (open/check/close, status, persist mode di data directory tanpa rahasia) plus `scan()` dan siklus 30 menit:
  cek kill switch → `inspect` (login & akun cocok) → listing → upsert proyek → skor → per kandidat tanpa draf: harga IDR → `evaluatePolicy` → batas draf → Hermes `draftProposal` (Bahasa Indonesia, `fixedBid` IDR) → guard → simpan `bid_drafts` + pipeline `draft_ready` + audit `projects_co_id.draft_created`.
  Mode `scan-only` berhenti setelah skor.
- Guard Hermes: `mentionedAmounts` mengenali Rupiah (`Rp 1.500.000`, `Rp1,5 juta`, `1.5jt`). Nominal/durasi berbeda dari kebijakan, error atau timeout → template Bahasa Indonesia + audit `autopilot.draft_fallback`. Potong sesuai batas panjang dari Fase 0.
- Tes unit: parser dari fixture HTML (ID numerik seperti asli), gate memblokir POST, lifecycle (`login_required`, `challenge`, `account_mismatch`, `ready`), siklus saat dijeda / batas draf penuh / proyek sudah punya draf / Hermes gagal.

## Fase 3 — API

`apps/server/src/projects-co-id-routes.ts`, pola `browser-bidding-routes.ts` (Host/Origin + `no-store` tetap):

- `GET /api/projects-co-id` status: mode, state, username, waktu scan terakhir, jumlah proyek, batas draf hari ini/minggu ini.
- `PUT /api/projects-co-id/mode` (`off | scan-only | drafts`).
- `POST /api/projects-co-id/open | check | close | scan`.
- `GET /api/projects-co-id/drafts` daftar proyek + draf (judul, owner, anggaran Rp, skor, harga, durasi, proposal, URL proyek, status).
- `POST /api/projects-co-id/projects/:id/draft` buat draf manual untuk satu proyek (tetap lewat guard harga).
- `PUT /api/drafts/:id` (route yang ada) untuk menyunting proposal; harga/durasi tetap dari kebijakan.
- `POST /api/projects-co-id/projects/:id/mark-sent` dan `/skip` (aksi pemilik).
- Rakit di `index.ts` (restore saat start, close di `onClose`) dan tambahkan ke `GET /api/capabilities`.

## Fase 4 — Kartu khusus projects.co.id & karyawan kantor

Antislop berlaku selama pengerjaan UI (sudah diputuskan).

**Kartu `/projects-co-id`:**
- Papan baru di dinding (`BOARDS` di `office-layout.ts` + `buildBoards()` di `App.tsx`): judul "projects.co.id", nilai utama = jumlah draf siap, keterangan = status worker atau waktu scan terakhir. Sumber gagal → "Tidak tersedia". Cek slot papan yang masih kosong; jika dinding penuh, tanyakan pemilik papan mana yang digeser.
- Rute `/projects-co-id` membuka kartu (drawer) seperti rute lain; kamera terbang ke papan; masuk ke menu Papan dan pencarian Ctrl+K.
- Isi kartu:
  1. **Status worker**: login/akun, mode (pilih `off/scan-only/drafts`), scan terakhir, batas draf terpakai, tombol Hubungkan/Periksa/Pindai sekarang/Lepas, petunjuk login manual.
  2. **Draf siap dikirim**: per proyek, judul + owner + anggaran Rp + skor + harga & durasi dari kebijakan + proposal yang bisa disunting. Tombol: **Salin proposal**, **Buka di projects.co.id** (tab baru, `rel="noopener noreferrer"`), **Sudah saya kirim**, **Lewati**.
  3. **Proyek terpindai tanpa draf**: tombol **Buat draf** (Hermes, tampilkan sedang menulis 40–95 dtk).
  4. **Riwayat**: ditandai terkirim/dilewati beserta waktunya.
- Format Rupiah `Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' })`. Jangan menjumlah IDR dengan USD di papan mana pun.
- Proyek projects.co.id juga tampil di Peluang/Pipeline dengan label sumber.

**Karyawan:**
- `office-state.ts`: `ROSTER` `{ id: 'projects-co-id-scout', name: 'Scout projects.co.id', role: 'Cari proyek & siapkan draf projects.co.id', floor: 1 }`. Aturan `deriveOfficeAgents`: scanning → Meninjau; Hermes menulis draf → Bekerja; ready/scan-only diam → Idle (+ tugas "N draf menunggu Anda kirim"); `login_required`/challenge/akun beda/ditutup/error/mode off → Offline dengan alasan spesifik; sumber gagal → Tidak diketahui. Filter aktivitas `projects_co_id.*`.
- `office-layout.ts`: meja baru dekat `BROWSER_DESK`, rute `via` lewat koridor.
- Tes: `office-state.test.ts` (tiap aturan), `office-layout.test.ts` (kursi unik, rute, papan baru).

## Fase 5 — E2E fixture otomatis

`scripts/verify-projects-co-id.ts`, pola `scripts/verify-browser-bidding.ts`: Chrome headless, context kosong, server fixture **localhost** yang meniru struktur dari Fase 0, Hermes palsu. Skenario minimum:

1. Belum login → `login_required`, tidak ada scan.
2. Akun lain → `account_mismatch`.
3. CAPTCHA → `challenge`, scan berhenti.
4. Listing 2 halaman → proyek terparse benar (ID, anggaran IDR, tenggat).
5. **Fixture menghitung request tulis: harus 0** untuk seluruh skrip, termasuk saat halaman fixture sengaja mencoba `fetch` POST otomatis (gate memblokirnya).
6. Mode `drafts` → draf dibuat dengan harga sesuai kebijakan, audit `draft_created`, pipeline `draft_ready`.
7. Hermes menyebut nominal lain → fallback template, audit `draft_fallback`.
8. Batas draf harian penuh → tidak ada draf baru.
9. Kebijakan dijeda → tidak ada scan/draf.
10. Disconnect CDP → tab lain yang sudah ada tetap terbuka.

Plus **E2E kartu** (Playwright terhadap web dev server dengan API memakai PGlite + data fixture): buka `/projects-co-id` lewat papan, sunting proposal, Salin proposal (isi clipboard sama), link Buka mengarah ke URL proyek yang benar, Sudah saya kirim → pindah ke Riwayat dengan label "Ditandai terkirim oleh Anda", Esc menutup kartu. Bila Playwright UI terlalu berat untuk RAM pemilik, jalankan sekali dan laporkan; jangan dipaksa.

Jalankan: `pnpm --filter @fvh/server exec tsx ../../scripts/verify-projects-co-id.ts`. Jangan bersamaan dengan build/test penuh.

## Fase 6 — E2E live read-only pada Chrome Khairul

1. `pnpm private:start`, mode `scan-only`.
2. Hubungkan → bila belum login, pemilik login manual → Periksa → username `KhairulHuda06` cocok.
3. Pindai sekarang → proyek muncul di kartu; cocokkan 3 proyek acak dengan situs secara manual.
4. Ganti ke `drafts` dengan izin pemilik → satu draf Hermes jadi; harga dalam rentang; proposal Bahasa Indonesia.
5. Pemilik mencoba alur: Salin → Buka → kirim sendiri di situs → Sudah saya kirim. (Agen tidak mengirim.)
6. Status karyawan berubah sesuai (Meninjau saat pindai, Bekerja saat draf, Idle sesudahnya, Offline saat dilepas).
7. Lepas sambungan → Chrome & tab pemilik tetap terbuka.

## Verifikasi sebelum selesai

```bash
pnpm exec eslint .
pnpm -r typecheck
pnpm test
pnpm --filter @fvh/web build
pnpm --filter @fvh/server exec tsx ../../scripts/verify-projects-co-id.ts
```

Lalu `curl http://127.0.0.1:3001/api/projects-co-id` dan cek kartu di `http://127.0.0.1:5174/projects-co-id`. Perbarui `AGENTS.md` (§5, §6 pengecualian tandai-terkirim, §7 route, §8.1 papan/rute, §9 agen) dan `docs/projects-co-id.md`. Review diff sendiri; jangan commit tanpa izin pemilik.

## Urutan kerja

- [x] Fase 0 recon + `docs/projects-co-id.md` (batas resmi proposal dan dua koneksi CDP belum teramati; batas lokal terdokumentasi)
- [x] Fase 1 domain/kebijakan IDR/batas draf + tes
- [x] Fase 2 worker GET-only, siklus draf, guard Rupiah + tes
- [x] Fase 3 route + wiring + tes
- [x] Fase 4 kartu khusus, papan, karyawan + tes; kedua lantai diperlebar
- [x] Fase 5 E2E fixture (10 skenario) + E2E kartu
- [ ] Fase 6 E2E live read-only
- [x] Lint, typecheck, tes, build, dokumentasi (233 eksekusi suite penuh; fixture worker dan kartu lulus)
