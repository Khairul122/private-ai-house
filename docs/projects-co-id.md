# projects.co.id: pindai dan draf lokal

## Cara memakai

Buka papan **projects.co.id** lantai 1 atau `/projects-co-id`. Login sebagai `KhairulHuda06` pada tab Chrome biasa, aktifkan izin debugging dan Hubungkan Chrome saya. Periksa akun, lalu Pindai sekarang. Tab worker sendiri memblokir semua request tulis; jangan gunakan tab worker untuk login.

Mode awal `scan-only`; `drafts` memindai dan membuat draf otomatis, `off` menghentikan worker. Harga awal Rp100.000–Rp10.000.000, batas draf otomatis 4/hari dan 12/minggu. Harga/batas disimpan di JSON kebijakan, bisa disunting di Kebijakan tanpa menonaktifkan Freelancer atau melanjutkan kebijakan yang dijeda. Mode tersimpan di JSON yang sama agar tidak ada dua sumber pengaturan. Sambungan Chrome tidak dibuka otomatis saat restart; Hubungkan kembali.

Sunting lalu Simpan proposal, Salin proposal, Buka di projects.co.id dan kirim sendiri. “Sudah saya kirim” memerlukan konfirmasi dan tampil sebagai **Ditandai terkirim oleh Anda**, tidak diverifikasi aplikasi. “Lewati” menghentikan pembuatan draf untuk proyek tersebut. Tidak ada mode kirim, pengisian form, pembelian upgrade atau otomatisasi pesan.

## Pencarian, kartu dan integrasi (19 Oktober 2026, revisi)

- Kebijakan → projects.co.id: bidang (AI & Machine Learning, Website, Mobile, Backend & API, Data, Bot & Otomasi, UI/UX), kata kunci tambahan (maks 20, huruf/angka/spasi/. + # / -), pakai spesialisasi Profil, skor minimum draf (menggantikan skor minimum Freelancer untuk sumber ini). Kebijakan lama tanpa kunci ini dibaca dengan nilai bawaan (`projectsCoIdSettings`).
- Istilah = bidang → kata kunci → skill profil, tanpa duplikat. Scan membuka `listing?search=<istilah>` halaman 1 untuk tiga istilah, lalu tiga berikutnya pada scan berikutnya; tanpa istilah tetap membaca tiga halaman daftar terbaru. Audit `scan_completed` menyebut istilah yang dipakai.
- Draf baru mencatat `author`: `hermes` atau `template` (fallback). Draf lama tampil "Penulis tidak tercatat".
- Kartu: status worker, pencarian aktif (istilah scan terakhir ditandai), ringkasan per tahap yang juga menjadi filter, filter bidang/penulis/urutan/cari, detail anggaran, harga draf, penutupan listing, brief, alasan skor, dan tautan ke Pipeline/Papan tugas/Aktivitas. `/projects-co-id?project=<id>` menyorot satu proyek (dipakai Kalender dan Pipeline).
- “Saya menang” hanya setelah ditandai terkirim; membuat proyek aktif IDR di Proyek & Pendapatan. Tidak diverifikasi aplikasi.

## Deteksi lewat kanal Telegram resmi (20 Oktober 2026, disetujui pemilik)

- Sumber: pratinjau publik `https://t.me/s/lowongankerjafreelance` (kanal "Lowongan kerja freelance by Projects.co.id"), HTML biasa, bukan Telegram API, tanpa akun/token. `lib/projects-co-id-telegram.ts`: URL tetap, `fetch` server dengan timeout 10 dtk, `redirect: 'error'`, batas 1 MB, User-Agent jujur, maksimum satu request per menit, backoff 2/4/8/16/30 menit pada non-200 (termasuk 429), timeout, non-HTML atau struktur tak dikenal; sukses mengembalikan jeda ke 1 menit.
- HTML tak tepercaya: hanya tautan yang lolos `parseProjectsCoIdHref` (origin persis `https://projects.co.id`, tanpa kredensial/query, `/public/browse_projects/view/<6 hex>/<slug aman>`) yang dipakai; tautan lain (`/user/my_projects/...`, profil owner, hashtag, domain lain) diabaikan. Judul/teks/waktu post hanya dipakai untuk pencocokan istilah dan tidak disimpan.
- Struktur teramati: tiap post `div.tgme_widget_message_wrap` → `data-post="lowongankerjafreelance/<nomor>"`, teks di `div.tgme_widget_message_text` (tautan judul ke halaman detail, Budget, Project Owner, Bid Deadline, Estimated Duration, deskripsi, hashtag), waktu di `<time datetime>`. Halaman memuat 20 post terbaru, terlama di atas. Kanal juga memposting ulang proyek lama (tanggal publikasi berminggu-minggu sebelumnya).
- ID baru yang belum tersimpan dan cocok dengan istilah pencarian (bidang → kata kunci → skill profil; tanpa istilah = semua, seperti daftar terbaru) masuk antrean memori (maks 30, post terbaru dulu). Polling berjalan dari timer worker sejak server start, kecuali mode off atau kill switch.
- **Anggaran halaman bersama** (`PageBudget`): halaman daftar + halaman detail di tab worker maksimum **3 per 30 menit bergulir**. Scan daftar dibebankan sebelum memuat (daftar tanpa istilah selalu dihitung 3). Pembacaan ulang detail sebelum draf juga dihitung; bila habis, draf otomatis ditunda ke antrean, sedangkan draf manual/Pindai sekarang ditolak dengan waktu tersedia berikutnya. Halaman pemeriksaan akun (`/`) tidak termasuk anggaran ini.
- Setiap menit, bila worker tersambung, akun cocok, mode bukan off, tidak dijeda dan anggaran tersisa: antrean dibaca lebih dulu lewat `readProject` (halaman detail), lalu disimpan, diskor dan didrafkan persis seperti scan (guard harga/kuota/Hermes sama, tanpa membaca detail dua kali). Scan daftar hanya berjalan saat antrean kosong. Detail 404/struktur tak dikenali melewati item itu (audit `projects_co_id.detail_unreadable`); challenge/akun beda/jeda menghentikan siklus.
- Status `GET /api/projects-co-id`: `telegram { lastCheckedAt, ok, error, nextCheckAt, queued }` dan `pageBudget { used, limit, nextFreeAt }` (keduanya opsional di tipe).

## Recon 19 Oktober 2026

Recon read-only berhasil melalui `connectOverCDP('chrome', { noDefaults: true })` pada Chrome pemilik. Tepat satu tautan berteks `Logged in as KhairulHuda06` dengan pathname `/user/home` teramati. HTTP `127.0.0.1:9222/json/version` mengembalikan 404; mekanisme Chrome aplikasi berhasil. Tidak ada form bid dibuka atau request tulis dilepas.

- Login `/public/home/login`, dashboard `/user/home`.
- Daftar `/public/browse_projects/listing`, paginasi GET `?page=2` terbukti menghasilkan proyek berbeda. DOM `#ds h2 a`, metadata pada parent judul, owner pada parent baris; `.pagination a` menyebut `dsLoadPage('page', '2')`.
- Detail `/public/browse_projects/view/<id>/<slug>`. ID teramati enam digit **heksadesimal**, bukan numerik seperti dugaan rencana. Tanpa slug detail tidak dikenali. Slug publik tervalidasi disimpan; origin selalu tetap dan URL tidak diterima melalui API.
- Detail memakai `h1.title`, `.blog-content`, skill `listing?search=`, metadata `Published Budget`, `Published Date`, `Select Deadline`, `Project Status`, owner `/browse_users/view/`. Rupiah memakai koma ribuan; tanggal `DD/MM/YYYY HH:mm:ss WIB`; status terbuka `Published`.
- Daftar/detail terbaca sebelum login. Worker tetap mensyaratkan akun cocok, berhenti saat sesi berubah atau challenge muncul.
- FAQ worker tidak menyebut batas karakter. Batas **lokal** proposal 1.200 karakter mengikuti prompt Hermes; bukan klaim batas resmi situs. Field form tidak diperiksa karena worker dilarang membuka form bid.
- Tidak ditemukan API resmi pada navigasi/FAQ yang diperiksa; gunakan DOM. Ini bukan bukti bahwa API resmi sama sekali tidak ada.
- Pemeriksaan publik sebelumnya: robots.txt HTTP 200, `User-agent: *`, `Allow: /`, sitemap `/meta/sitemap.xml`. GET tanpa Chrome pernah mendapat challenge HTTP 403. Tidak ada upaya melewati challenge.
- Dua koneksi CDP bersamaan belum diuji; tidak ada refactor koneksi bersama tanpa bukti kebutuhan.

## Invarian implementasi

- Siklus 30 menit; maksimum tiga halaman daftar+detail per 30 menit bergulir (lihat bagian Telegram), jeda navigasi minimal tiga detik. Mode off dan kill switch menghentikan scan/drafting, termasuk pemeriksaan ulang setelah Hermes selesai. CAPTCHA, akun berubah atau struktur tidak dikenal menghentikan siklus.
- `page.route('**/*')` membatalkan metode selain GET/HEAD/OPTIONS sepanjang sesi; pelanggaran dihitung dan diaudit tanpa menyimpan payload/URL. WebSocket ditutup; service worker dilewati hanya pada tab worker. Disconnect menutup tab worker dan melepaskan CDP, mempertahankan Chrome serta tab pemilik.
- Harga `max(minPrice, budgetMin)` tidak melebihi batas kebijakan/budget. Durasi `min(deadlineDays,14)` atau 14. Hermes mendapat fixedBid IDR, fakta profil dan hingga empat potongan Knowledge Hub; tanpa kredensial. Harga/durasi salah, nominal lain (termasuk juta/jt/ribu/rb), mata uang lain, output invalid/error atau terlalu panjang memakai template Bahasa Indonesia dan audit `autopilot.draft_fallback`.
- Skor brief/risiko adalah heuristik eksplisit dari panjang deskripsi, jumlah skill dan istilah risiko; bukan verifikasi reputasi owner. Detail lengkap dibaca ulang sebelum drafting. Tenggat adalah penutupan listing saat sinkronisasi, bukan durasi pengerjaan.
- `dailyBidLimit`/`weeklyBidLimit` pada `projectsCoId` berarti batas **draf otomatis**. Kuota memakai audit `projects_co_id.draft_created`, zona waktu kebijakan; draf manual memakai `projects_co_id.manual_draft_created` dan tetap melewati kebijakan/guard. Harga Freelancer dan USD tetap terpisah.
- Penyimpanan draf, pipeline dan audit dilakukan satu transaksi dengan lock kebijakan/proyek; kebijakan diperiksa ulang, draf ganda dan kuota penuh ditolak. Hermes/browser berjalan di luar transaksi. Tanpa migrasi skema; proyek/draf memakai tabel yang ada.
- Penandaan pemilik memakai `projects_co_id.owner_marked_sent`/`owner_skipped`, idempoten dan transaksional. Tidak masuk `bid_results`, kuota submit Freelancer atau BusinessSync. Origin/Host/no-store tetap aktif.
- Scout hanya bekerja dari sinyal worker. Mode off/login/challenge/akun beda/ditutup/error/jeda berarti Offline; sumber gagal berarti Tidak diketahui. Lead Hermes juga menghitung drafting worker ini.

## Verifikasi

`pnpm --filter @fvh/server exec tsx ../../scripts/verify-projects-co-id.ts` memakai Chrome headless dengan profil kosong milik tes, fixture situs localhost, PGlite dan Hermes palsu. Tidak memakai profil atau database pemilik. Skrip menghitung request tulis situs (wajib nol), memeriksa lifecycle, dua halaman, harga/kuota/fallback/jeda/disconnect, lalu menjalankan web Vite dengan API fixture untuk menguji kartu. Screenshot fixture ada di `.local/projects-co-id-fixture-*.png` (gitignored).

Verifikasi 19 Oktober 2026: lint dan typecheck bersih; `pnpm test` lulus 233 eksekusi tes. Sesudah perbaikan status/kontrol, 17 tes terarah lulus; sesudah guard template diperketat, 8 tes worker lulus. Build web berhasil (peringatan ukuran chunk VisualOffice yang sudah dikenal). Skrip fixture penuh lulus: 10 skenario worker dengan request tulis situs nol, kemudian navigasi papan/Ctrl+K, kontrol worker, draf manual, lewati, edit/simpan, clipboard, tautan, penandaan/riwayat, Esc dan mobile tanpa overflow. Review diff dan screenshot fixture dilakukan.

Recon live akun/daftar/detail berhasil. Percobaan menghubungkan worker aplikasi sesudahnya gagal pada sambungan Chrome; worker dilepas kembali dan mode tetap scan-only. Setelah pemilik mengecek debugging kembali, koneksi channel masih gagal; percobaan endpoint WebSocket Chrome `ws://127.0.0.1:9222/devtools/browser` juga timeout 60 detik sebelum handshake selesai. Tidak ada fallback endpoint baru yang dipasang tanpa sambungan terverifikasi. Scan live tersimpan, draf Hermes live dan pengiriman manual oleh pemilik belum terverifikasi. Tidak ada perubahan kebijakan/kill switch atau penawaran yang dikirim dalam pengujian ini.
