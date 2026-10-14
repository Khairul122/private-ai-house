# PRD — Freelancer Virtual House

**Status:** Draft siap implementasi MVP  
**Versi:** 1.0  
**Tanggal:** 14 Oktober 2026  
**Pemilik produk:** Freelancer pemilik akun

Dokumen pendamping: [AGENT.md](AGENT.md), [TECH_STACK.md](TECH_STACK.md), dan [TASKS.md](TASKS.md).

## 1. Ringkasan

Freelancer Virtual House adalah kantor virtual 3D ringan yang menjalankan operasi freelancer secara mandiri setelah setup dan aktivasi kebijakan. Aplikasi menghubungkan akun Freelancer.com milik pengguna melalui API resmi yang sah, menemukan dan menilai proyek, menyiapkan serta mengirim bid, merawat profil/portofolio, dan mengorganisasi komunikasi. Model AI diakses melalui OpenCode CLI. Pengguna memantau dashboard; tidak perlu menyetujui tiap tindakan rutin. Sistem hanya bertindak di dalam batas otomatisasi, budget, fakta, frekuensi, dan izin yang sudah ditetapkan. Jika kondisi di luar kebijakan atau kemampuan API tidak pasti, sistem melewati tindakan dan mencatat alasannya.

Pengalaman 3D adalah cara menjelajahi dashboard, bukan prasyarat untuk menjalankan bisnis. Jika WebGL tidak tersedia atau pengguna memilih mode ringan, semua fungsi tetap tersedia melalui tampilan 2D.

## 2. Masalah dan tujuan

Freelancer solo harus berulang kali mencari peluang, menilai kecocokan, menyusun proposal, menjaga profil konsisten, dan menindaklanjuti percakapan. Alat terpisah membuat konteks mudah hilang dan otomasi tanpa kontrol berisiko mengirim klaim, harga, atau komitmen yang keliru.

### Tujuan MVP

1. Menjalankan siklus peluang-ke-bid serta pemeliharaan profil secara otomatis setelah kebijakan aktivasi dikonfigurasi.
2. Memusatkan ringkasan peluang, pipeline bid, profil, portofolio, dan aktivitas dalam satu ruang kerja pemantauan.
3. Menjaga setiap aksi dalam batas yang dapat diprediksi, diaudit, dihentikan, dan dibatalkan bila API mendukungnya.
4. Menggunakan integrasi resmi berbasis API, menghormati izin, kebijakan, kuota, dan batas data platform.
5. Menyediakan fondasi modular agar adapter marketplace lain dapat ditambahkan tanpa mengubah domain inti.

### Bukan tujuan MVP

- Mengelola agensi multi-akun atau pekerja manusia.
- Mengambil komitmen pembayaran, menerima kontrak, atau mengelola milestone/uang secara otomatis.
- Mengambil data melalui scraping, browser automation, atau endpoint tak terdokumentasi.
- Menjamin hasil, pendapatan, ranking, atau kepatuhan hukum secara otomatis.
- Membuat simulasi kantor 3D yang kompleks atau memerlukan aset 3D besar.

## 3. Pengguna dan bidang layanan

Pengguna utama adalah freelancer yang memiliki atau mengendalikan akun Freelancer.com dan mengizinkan aplikasi menggunakan API sesuai syarat platform. Pada setup, pengguna memilih satu bidang utama dan dapat mengaktifkan satu atau lebih spesialisasi/skill dari katalog, misalnya Fullstack Engineer, Backend Engineer, Android Engineer, iOS Engineer, Frontend Engineer, DevOps Engineer, QA Engineer, UI/UX Designer, Data Engineer, Technical Writer, atau bidang lain. Katalog dapat dikonfigurasi dan tidak mengunci aplikasi ke satu profesi. Pengguna memasukkan fakta profil, layanan, batas harga, bahasa, zona waktu, tautan, dan bukti portofolio sebagai sumber kebenaran.

MVP mendukung satu pemilik, satu workspace, dan satu profil freelancer. Model data memisahkan workspace dari akun platform untuk ekspansi kelak.

## 4. Prinsip produk

- **Autonomy-with-oversight:** setelah pengguna mengaktifkan kebijakan, sistem menjalankan tindakan rutin sendiri dan pengguna memantau, menghentikan, atau mengubah batasnya.
- **Evidence-first:** fakta profil dan proposal bersumber dari data terverifikasi pengguna atau data proyek yang diizinkan API. AI tidak mengarang pengalaman, hasil, harga, ketersediaan, atau kredensial.
- **API-first, adapter-based:** integrasi hanya melalui API resmi dengan autentikasi dan scope yang sah.
- **Fail closed:** jika izin, token, kuota, validitas data, atau kemampuan endpoint tidak jelas, tindakan tulis dinonaktifkan.
- **Progressive enhancement:** inti tetap dapat dipakai tanpa 3D atau OpenCode.
- **Spesialisasi terpilih:** rekomendasi dan template memprioritaskan bidang utama serta spesialisasi yang diaktifkan pengguna.

## 5. Kebutuhan fungsional

### 5.1 Onboarding dan organisasi

- Pengguna memilih bidang utama dan spesialisasi aktif, lalu mengatur bahasa, mata uang, zona waktu, jam kerja, kisaran harga, dan aturan tidak-negosiasi.
- Pengguna menghubungkan GitHub dan LinkedIn serta memilih cakupan repositori/sumber yang boleh diindeks. Sinkronisasi awal memproses semua sumber yang dicakup; sinkronisasi berikutnya memperbarui perubahan.
- Aktivasi hands-off memerlukan persetujuan satu kali atas kebijakan operasi: jenis aksi otomatis, batas bid harian/mingguan, budget/harga minimum-maksimum, daftar bidang/keyword, confidence minimum, batas pesan, aturan profil, jam aktif, serta tombol jeda darurat.
- Pengguna menyambungkan Freelancer.com melalui alur resmi yang didukung dokumentasi; pengembangan dan verifikasi dimulai dari sandbox bila tersedia.
- Aplikasi memeriksa koneksi, izin, masa berlaku, dan status sinkronisasi tanpa mengekspos token ke browser.
- Kantor virtual menunjukkan departemen dan karyawan AI sebagai peran/agen; mereka bekerja untuk satu pemilik dan tidak memiliki identitas akun platform sendiri.

### 5.2 Pencarian dan penilaian proyek

- Mengambil proyek hanya dari resource dan filter yang didukung API resmi, mengikuti pagination dan kuota.
- Menyimpan snapshot minimum yang dibutuhkan, waktu pengambilan, sumber, dan ID eksternal; deduplikasi berdasarkan platform + ID.
- Menyediakan pencarian/filter serta skor rekomendasi yang dapat dijelaskan.
- Skor kecocokan mempertimbangkan bidang/skill, anggaran dan bentuk kerja, tenggat/kapasitas, reputasi klien bila tersedia secara sah, kualitas brief, dan risiko. Bobot dapat dikonfigurasi; skor tidak menjamin hasil.
- Item kedaluwarsa atau tidak dapat ditindaklanjuti diberi label dan tidak masuk antrean bid aktif.

### 5.3 Pipeline bid

Status internal: `new`, `scored`, `draft_ready`, `policy_check`, `submitted`, `in_conversation`, `won`, `lost`, `skipped`, `expired`, `reconciliation_required`, `error`.

- AI membuat draf proposal, jawaban pertanyaan, rekomendasi harga/durasi, dan daftar klarifikasi.
- Draf menampilkan sumber fakta/profil yang dipakai, poin proyek yang ditanggapi, asumsi, dan hal yang belum diketahui.
- Sistem dapat mengirim bid tanpa persetujuan per proyek bila capability API sudah diverifikasi dan payload lolos kebijakan aktif, confidence minimum, pemeriksaan fakta, batas harian, dan budget.
- Pengguna menyetujui sekali kebijakan operasi sebelum automasi diaktifkan. Setiap aksi mencatat versi kebijakan dan hash payload agar dapat diaudit.
- Jika confidence rendah, brief ambigu, harga di luar batas, proyek berisiko, data fakta kurang, atau kebijakan/API tidak jelas, sistem melewati proyek dan mencatat alasan; sistem tidak mengirim untuk meminta persetujuan manual.
- Setelah timeout ambigu, sistem memeriksa status sebelum mencoba ulang agar tidak membuat bid duplikat.
- Batas frekuensi, cooldown, dan deduplikasi mencegah spam atau bid ganda; mode otomatis dapat dijeda kapan saja.

### 5.4 Profil dan portofolio

- Membaca ringkasan profil/portofolio dari endpoint yang diizinkan.
- Menyimpan versi lokal dan mengusulkan revisi headline, ringkasan, skill, tarif, dan deskripsi karya berdasarkan fakta yang dikonfirmasi.
- Memperlihatkan diff sebelum/sesudah, sumber klaim, dampak, serta field yang berubah pada log pemantauan.
- Sistem dapat menerapkan pembaruan rutin yang berada di dalam kebijakan satu kali yang telah diaktifkan. Perubahan tidak boleh membuat klaim baru tanpa bukti; perubahan berisiko tinggi atau di luar batas kebijakan dilewati dan ditandai.
- Bila API tidak menyediakan operasi tertentu, aplikasi hanya memberi panduan/manual checklist; tidak beralih ke scraping.

### 5.5 Komunikasi

- Membaca thread/pesan yang tersedia melalui API dan izin resmi; menampilkan ringkasan, pertanyaan terbuka, dan draf balasan.
- Mengirim pesan hanya bila endpoint mendukungnya dan aturan kebijakan mengizinkan jenis balasan tersebut.
- Sistem boleh mengirim balasan rutin yang faktual (misalnya konfirmasi penerimaan atau klarifikasi standar) sesuai template dan batas kebijakan. Sistem tidak menyepakati kontrak, menerima pekerjaan, menawar di luar batas, atau menjanjikan tenggat yang tidak dikonfigurasi.
- Jika API tidak mendukung akses pesan atau ada batas kebijakan, fitur menjadi pencatatan/link/manual checklist.

### 5.6 AI/OpenCode

- Backend menjalankan OpenCode CLI melalui integrasi terbatas. Panggilan AI memakai input terpilih, schema output, batas waktu/ukuran, dan pencatatan metadata.
- Gunakan agen terpisah untuk riset, penilaian, proposal, profil, komunikasi, dan audit; agen tidak menjalankan tindakan marketplace.
- AI hanya mengusulkan operasi domain internal. Agent tidak diberi kredensial Freelancer, akses jaringan bebas, atau hak menulis ke API marketplace.
- Jika CLI/model tidak tersedia atau output gagal divalidasi, sistem tidak mengirim tindakan AI yang bersangkutan, mencatat kegagalan, dan melanjutkan tindakan independen yang aman.

### 5.7 Kantor virtual 3D/2D

- Zona: Lobby, Sales & Bids, Profile Studio, Client Relations, dan Operations.
- Setiap zona menunjukkan antrean, status, serta peran yang bertanggung jawab; representasi agen bukan bukti aktivitas real-time kecuali tercatat.
- 3D memakai aset low-poly sederhana, pemuatan malas, batas kualitas/perangkat, kontrol keyboard/mouse, dan tombol kembali ke 2D.
- Mode 2D menyediakan navigasi, daftar kerja, status, dan seluruh aksi tanpa WebGL.
- Aksesibilitas: kontras, fokus keyboard, label pembaca layar, reduced motion, dan warna bukan satu-satunya penanda.

### 5.8 Audit dan notifikasi

- Audit log append-only untuk koneksi, sinkronisasi, versi kebijakan, keputusan otomatis (termasuk skip), pengiriman, perubahan profil, kegagalan, jeda, dan pemicu aksi.
- Simpan metadata minimum; jangan masukkan token, secret, atau isi privat berlebih ke log.
- Notifikasi lokal untuk ringkasan aktivitas, token bermasalah, policy pause, batas tercapai, keputusan skip penting, dan kegagalan integrasi.

### 5.9 Knowledge Hub: GitHub dan LinkedIn

- Karyawan AI mempelajari portofolio kerja pemilik melalui knowledge hub yang membangun indeks privat dari repositori GitHub yang diizinkan serta profil/konten LinkedIn milik pengguna yang memang tersedia melalui izin resmi atau file ekspor yang diberikan pengguna.
- GitHub: koneksi OAuth/GitHub App dengan least privilege; pilih semua repositori yang diizinkan atau subset eksplisit. Sinkronkan README, dokumentasi, source code, konfigurasi non-secret, release, dan metadata/issues/PR bila scope resmi tersedia. Berikan cakupan awal menyeluruh untuk sumber yang dipilih, lalu incremental sync/webhook bila tersedia.
- LinkedIn: gunakan API resmi hanya untuk data yang benar-benar diizinkan oleh produk/scope aplikasi. Karena Profile API dibatasi untuk developer yang disetujui LinkedIn, sediakan fallback impor file ekspor profil/konten milik pengguna atau input manual; jangan scraping halaman atau mengambil data anggota lain.
- Index menyimpan sumber, repository/URL, path, commit/version, waktu sinkronisasi, dan tautan referensi agar jawaban AI dapat menunjukkan asal fakta.
- Knowledge Hub menggunakan retrieval on demand: AI mengambil potongan yang relevan untuk tugas tertentu, bukan mengirim semua repositori/profil ke setiap prompt. Indeks internal bukan model training dan tidak mengubah bobot model.
- Pengguna melihat status koneksi, cakupan, jumlah sumber yang diproses, perubahan terbaru, error, dan waktu pembaruan. Sediakan resync, pengecualian repository/file, disconnect, dan delete index.
- Lewati token/secret, `.env`, credential, binary, dependency/vendor/generated files, file berukuran besar, serta data yang tidak relevan; lakukan secret scanning sebelum indexing. Kebijakan pengecualian dapat dikonfigurasi.
- Gunakan knowledge hub untuk menyusun proposal berdasarkan contoh kerja nyata, mencocokkan proyek dengan keahlian, menjawab pertanyaan teknis, menyarankan profil/portofolio, serta memberi bukti/sumber untuk setiap klaim.
- Jika sinkronisasi gagal atau sumber stale, tampilkan freshness dan jangan membuat klaim seolah-olah data terkini.

## 6. Alur utama

1. Pemilik memilih bidang utama/spesialisasi, mengisi sumber fakta, menetapkan batas automasi, menghubungkan akun, dan mengaktifkan kebijakan.
2. Sinkronisasi membaca proyek yang diizinkan dan memperlihatkan sumber serta waktu pembaruan.
3. Sistem memberi skor, menyusun proposal, memeriksa fakta/risk/budget dan kebijakan, lalu mengirim bid secara otomatis jika lolos.
4. Sistem merawat profil dan komunikasi rutin sesuai kebijakan. Semua aksi dan skip ditampilkan di feed pemantauan.
5. Jika ada kondisi tak aman/tak dikenal, sistem tidak melakukan tindakan itu, mencatat alasan, dan memberi notifikasi.
6. Pengguna dapat mengubah batas atau menjeda semua automasi dari dashboard kapan saja.
7. Secara berkala, connector memperbarui knowledge hub dari GitHub dan LinkedIn; karyawan AI menggunakan potongan bukti relevan dan menampilkan sumbernya di monitor.

## 7. Keamanan, privasi, dan compliance

- Gunakan akun milik/pengguna yang berwenang, izin API resmi, serta patuhi API Terms, User Agreement, Privacy Policy, dan kebijakan platform.
- Jangan mengakali rate limit, pembatasan akses, kontrol keamanan, atau larangan penggunaan. Tidak ada scraping, impersonasi, spam, atau automasi tersembunyi.
- Kuota numerik tidak diasumsikan. Adapter membaca header/metadata limit bila tersedia, memakai konfigurasi konservatif, backoff untuk `429`/`5xx`, dan circuit breaker. Limit produksi dikonfirmasi dari dokumentasi/approval aplikasi.
- Simpan secret di backend melalui OS credential store atau secret manager; enkripsi token saat tersimpan, batasi akses, rotasi/revoke, dan redaksi log. Jangan simpan di localStorage, source control, prompt AI, atau bundle klien.
- Validasi state OAuth, redirect URI, origin, CSRF, dan sesi; gunakan HTTPS saat deployment.
- Simpan data marketplace seperlunya, dengan retensi/penghapusan yang dapat diatur dan sesuai syarat platform. Persetujuan API Terms adalah prasyarat penggunaan.
- Indeks GitHub/LinkedIn bersifat privat untuk workspace pengguna, bukan training corpus; patuhi hak akses, ketentuan developer/API, lisensi repositori, dan permintaan delete. Jangan memasukkan secret atau data pihak ketiga tanpa hak.
- Aksi yang tidak didukung API atau belum pasti menjadi manual-only; jangan dibuat lewat endpoint tak resmi.
- MVP tidak membagikan akses API; ekspansi multi-user memerlukan otorisasi setiap pengguna sesuai perjanjian.

## 8. Non-fungsional

- **Kinerja:** navigasi 2D responsif; data panjang dipaginasi; 3D dan aset dimuat setelah diperlukan.
- **Ketahanan:** sinkronisasi aman diulang; timeout, pagination, retry terbatas, dan status error terlihat.
- **Kualitas:** batas modul jelas, schema domain tervalidasi, lint/typecheck, targeted tests, dan smoke flow MVP otomatis.
- **Observabilitas:** korelasi request, metrik kegagalan/latensi/kuota tanpa rahasia.
- **Portabilitas:** adapter marketplace dan provider AI terisolasi dari use case.
- **Aksesibilitas:** navigasi inti melalui keyboard dan mode 2D.

## 9. Keberhasilan MVP

- Pemilik dapat menghubungkan sandbox/akun resmi, memutus koneksi, dan melihat status token tanpa rahasia tampil.
- Proyek yang diizinkan dapat diimpor/dideduplikasi/difilter; proyek dapat menjadi draf proposal yang dapat diedit.
- Setelah kebijakan hands-off diaktifkan, sistem dapat melakukan bid, komunikasi rutin, dan perubahan profil yang tercakup tanpa persetujuan per aksi; seluruhnya dibatasi aturan, dicatat, dan dapat dijeda.
- Kegagalan/kuota habis tidak menghasilkan pengiriman ganda dan memberi status yang jelas.
- Dashboard 2D berfungsi penuh; ruang 3D ringan menjadi peningkatan progresif.
- Knowledge Hub mengindeks semua sumber GitHub yang dipilih dan sumber LinkedIn resmi/ekspor yang tersedia, menampilkan status/freshness, dan AI dapat menyebutkan path/URL sumber untuk klaim pengalaman.
- Smoke flow menjalankan sandbox/mock dari koneksi dan aktivasi policy hingga simulasi keputusan/send, activity feed, dan pause; live test hanya dengan konfigurasi dan otorisasi yang tersedia.

## 10. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Endpoint/izin tidak menyediakan operasi yang dibutuhkan | Capability discovery; manual-only; tanpa endpoint tak terdokumentasi |
| Perubahan API/kuota | Adapter berversi, metadata limit, contract fixture, cek dokumentasi sebelum rilis |
| AI membuat klaim salah | Fakta bersumber, validasi deterministik, ambang confidence, fail closed |
| Bid ganda setelah timeout | Idempotensi bila didukung, rekonsiliasi status, dedupe, retry terbatas |
| Secret bocor | Server-side only, encrypted storage, redaction, secret scan |
| 3D lambat/perangkat tak mendukung | Dynamic import, low-poly, budget, fallback 2D |
| CLI/model tidak tersedia | Adapter AI, health check, manual workflow, fail closed |
| LinkedIn tidak memberi izin data profil yang luas | API resmi bila disetujui; jika tidak, impor ekspor/data milik pengguna dan input manual; tidak scraping |
| Repositori berisi credential atau kode yang tak semestinya dikirim ke AI | Secret scanning, exclude patterns, local private index, retrieval potongan relevan dan kontrol koneksi provider |

## 11. Asumsi implementasi

- Pemilik menyediakan kredensial client/API secara sah; aplikasi belum diasumsikan telah disetujui platform.
- Akses endpoint, OAuth scopes, kuota, dan kondisi khusus diverifikasi ulang dari dokumentasi interaktif/dashboard developer saat implementasi.
- Bidang utama/spesialisasi, bahasa, mata uang, kebijakan operasi, dan hosting ditentukan pemilik saat onboarding.
- MVP satu pengguna untuk penggunaan pribadi; multi-tenant dan billing tidak termasuk.

## 12. Dokumentasi rujukan

Tautan diperiksa pada 14 Oktober 2026. Detail endpoint dan batas numerik perlu diverifikasi pada dokumentasi interaktif saat implementasi.

- [OpenCode CLI](https://dev.opencode.ai/docs/cli/) — `opencode run`, `opencode serve`, flags, dan perintah.
- [OpenCode Agents](https://docs.opencode.ai/docs/agents/) — agen, model, mode, dan permission `allow`/`ask`/`deny`.
- [Freelancer API for Developers](https://developer.freelancer.com/) — dokumentasi API, versi, dan sandbox yang dipublikasikan.
- [Freelancer API Terms & Conditions](https://www.freelancer.com/about/apiterms) — lisensi, batas penggunaan, akses, dan kewajiban data.
- [Freelancer OAuth Sandbox Demo](https://github.com/freelancer/freelancer-oauth-demo-app) — contoh OAuth sandbox; contoh lama, bukan kontrak endpoint terbaru.
- [LinkedIn Profile API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api) — akses dibatasi pada developer yang disetujui dan data anggota terautentikasi.
- [LinkedIn OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2) — cakupan lite profile untuk autentikasi.
- [LinkedIn Download your data](https://www.linkedin.com/help/linkedin/answer/a1339364/auf-ihre-kontodaten-zugreifen) — pengguna dapat meminta arsip data akunnya sendiri; kategori yang tersedia bergantung pada akun.
- [GitHub App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app) — minta permission minimum yang sesuai sumber yang dibaca.
