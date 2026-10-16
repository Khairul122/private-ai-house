# Audit dan pembaruan Mission Control

16 Oktober 2026. Bahasa UI Indonesia, kantor 3D dan kartu tetap menjadi navigasi utama.

## Mengapa karyawan terlihat berhenti

Ada dua keadaan yang berbeda dalam data runtime:

1. Autopilot tetap `running`, membaca proyek dalam siklus berkala. Agen Idle saat siklus selesai. Hermes bekerja hanya ketika proposal benar-benar sedang ditulis; persona lain mengikuti sinyal runtime yang tersedia.
2. Freelancer menolak pengiriman terakhir pada **16 Oktober 2026, 16.37 WIB**, dengan HTTP 400 dan kode **`BID_LIMIT_EXCEEDED`**, disertai keterangan bahwa jatah bid akun habis. Mengubah kuota lokal tidak menambah jatah dari Freelancer.

Penolakan ini sekarang terlihat pada Ringkasan, Tim AI, Kebijakan, dan status utama kantor. Setelah penolakan kuota, pemindaian tetap berlangsung tetapi kandidat baru tidak dikirim atau dibuatkan proposal selama satu jam. Sesudah jeda, kandidat yang memenuhi kebijakan dapat dicoba pada siklus berikutnya. Jeda tersebut bukan perkiraan waktu kuota Freelancer pulih. Riwayat percobaan yang sudah terkunci tetap dilindungi dari pengiriman ulang.

Pada pengamatan 16.41 WIB, siklus terakhir membaca 133 proyek; ada 220 proyek terbuka tersimpan. Alasan besar yang membatasi bid: 90 menggunakan mata uang selain USD, 50 bukan harga tetap, dan 31 tidak cocok dengan spesialisasi. Hitungan ini adalah snapshot API, bukan jumlah tetap atau perkiraan hasil bisnis.

### Perbaikan penjadwal dan keputusan

- Penolakan karena jam, kuota, atau kondisi proyek diperiksa ulang pada siklus berikutnya; audit lama tidak lagi menjadi larangan permanen untuk versi kebijakan yang sama.
- Pencarian bergilir melalui spesialisasi dan kata kunci tersimpan, maksimal delapan istilah per siklus.
- Waktu siklus berikutnya dihitung setelah pekerjaan selesai, mengikuti interval kebijakan.
- Gangguan baca penyimpanan pada pemicu timer ditangani; timer tetap mencoba kembali.
- Pemanggilan start bersamaan dicegah. Penghentian server diperiksa kembali sebelum klaim pengiriman setelah Hermes selesai.
- Kebijakan dan pemakaian kuota dibaca ulang setelah penulisan proposal. Perubahan versi, jeda, harga, atau batas keputusan menggagalkan pengiriman yang sudah tidak sesuai.
- Pemakaian bid dihitung langsung dari audit berhasil menurut hari dan minggu zona waktu kebijakan; tidak bergantung pada 5.000 log terbaru.
- Riwayat bid pada Status Integrasi memakai filter jenis audit di database, sehingga sinkronisasi GitHub tidak menyingkirkan hasil bid dari tampilan.

## Kebijakan yang dapat diatur

Kartu Kebijakan menyediakan:

| Pengaturan | Batas atau arti |
|---|---|
| Kata kunci | Maksimal 300, koma atau baris baru, tanpa duplikat huruf besar/kecil |
| Katalog coding | 182 istilah, kelompok web, mobile/desktop, data/AI, cloud/DevOps, commerce/CMS, otomasi/pengujian |
| Kecocokan | Skor minimum 0–100%, risiko maksimum 0–100%, pilihan wajib cocok spesialisasi |
| Harga | Rentang USD; pelaksanaan otomatis masih hanya harga tetap dalam USD |
| Frekuensi | Maksimal 50 bid/hari dan 200/minggu; batas akun Freelancer tetap berlaku |
| Jadwal | Zona waktu IANA, hari aktif, jam operasi dan rentang melewati tengah malam |
| Operasi 24 jam | Tombol memilih semua hari dan jam 00–24 |
| Pemindaian | Interval 5–60 menit selama server berjalan |
| Tenggat | Pilihan mengizinkan listing tanpa tenggat diketahui; durasi bid bawaan 14 hari |
| Masa berlaku | Perbarui 1–365 hari dari waktu penyimpanan |
| Aktivasi | Pilihan simulasi atau aktivasi live secara eksplisit; kebijakan dijeda tidak diaktifkan oleh penyimpanan |

Pengeditan memakai versi yang diharapkan dan pembaruan atomik. Penyimpanan yang bersaing dengan perubahan lain ditolak HTTP 409. Tombol jeda dan lanjut juga menaikkan versi. Draf yang sudah diedit pemilik tidak lagi otomatis diaktifkan sebagai live pada restart.

### Data nyata yang disimpan

Katalog berhasil disimpan lalu dibaca ulang melalui API dari penyimpanan Supabase pada **kebijakan versi 14**:

- 182 kata kunci.
- Kebijakan aktif, jam 00–24.
- Harga USD 100–10.000, 30 bid/hari, 200/minggu sesuai nilai pemilik yang sudah tersimpan.
- Kecocokan spesialisasi tetap menjadi pengaturan pemilik; katalog tidak membuat klaim keahlian baru.

Salinan kebijakan sebelum perubahan tersedia di `.local/backup/policy-before-coding-catalog-20261016-162014.json`.

## Knowledge Hub dan API

### GitHub

Sinkronisasi nyata menyelesaikan **50 repositori**: **49 terindeks, satu dilewati karena kosong**, tanpa kesalahan pada penyelesaian terakhir. Ada **21.171 potongan GitHub**. `Khairul122/backend-portal` dikonfirmasi API sebagai repositori kosong (`size: 0`, respons tree `Git Repository is empty.`).

- Pekerjaan sinkronisasi berlangsung di server; kartu menampilkan progres, sumber saat ini, hasil, waktu, dan alasan per repositori.
- Snapshot yang sama diperiksa lewat ref dan tidak diunduh ulang.
- Berkas yang memiliki blob hash dibaca dari blob tersebut, sehingga isi mengikuti snapshot tree. Respons blob base64 didekodekan sebelum pemeriksaan konten.
- Maksimal tiga unduhan berkas bersamaan; timeout dan pembatasan API tetap ditangani.
- Satu berkas terlalu besar tidak membatalkan pembacaan berkas lain.
- Sumber diganti dalam transaksi; kegagalan penggantian mempertahankan sumber lama. Tidak ada duplikasi sumber saat sinkron ulang.
- Batas tetap **50 repo terbaru**, tanpa fork/arsip, **100 berkas teks per repo**, masing-masing maksimal 100 KB. Banyak repo memiliki cakupan parsial; keterangannya terlihat pada hasil per sumber.

Referensi implementasi: [GitHub Git blobs](https://docs.github.com/en/rest/git/blobs), [Git trees](https://docs.github.com/en/rest/git/trees).

### LinkedIn

Sinkronisasi nyata `/userinfo` berhasil dan tersimpan sebagai **satu sumber API**, tanpa duplikat saat diperbarui. Nama, foto, bahasa dan email hanya diambil apabila tersedia dalam respons yang diizinkan. Respons divalidasi, dan field yang tidak didukung tidak diindeks.

Izin OIDC yang tersedia tidak memberikan riwayat pekerjaan dan skill lengkap. Impor CSV ekspor LinkedIn tetap disediakan untuk data tersebut. Lihat [dokumentasi LinkedIn OIDC](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2).

Jumlah gabungan setelah sinkronisasi: **50 sumber, 21.172 potongan** pada Supabase. Pencarian teks diuji dari kartu dengan kata `Laravel`, menghasilkan enam potongan beserta provenance.

Progres pekerjaan berada di memori proses; restart server mengosongkan panel progres. Sumber, potongan, waktu pemeriksaan, dan audit tetap tersimpan. Hasil pemeriksaan lokal direkam di `.local/backup/mission-control-verification-20261016.json` dan `.local/backup/github-sync-result-20261016.json`.

## Audit semua kartu

Semua kartu mendapat navigasi antarkartu, tombol perbarui data, ukuran kontrol, fokus yang terlihat, teks yang lebih terbaca, pembungkusan isi panjang, dan penanganan layar sempit. Fokus Tab tetap di dalam dialog; Ctrl+K dari dialog tidak lagi memindahkan fokus ke kantor di belakangnya. Escape menutup kartu.

| Kartu | Pemeriksaan dan perbaikan |
|---|---|
| Ringkasan | Diagnosis siklus, alasan proyek dilewati, penolakan kuota akun, sumber data gagal disembunyikan |
| Peluang | Filter lokal tidak kehilangan fokus saat mengetik, filter status, 20 baris per tahap, detail dapat dibuka dari judul |
| Pipeline | Filter tahap dan pencarian, pemuatan bertahap, tautan draf menuju proyek yang benar |
| Papan Tugas | Empat kolom dengan gulir internal, hitungan nyata, ekspansi daftar dan tautan detail |
| Kalender | Hari/bulan/tahun, navigasi periode, lompat tanggal, log harian, status jadwal dari server termasuk masa berlaku |
| Kotak Masuk | Status sinkronisasi, keadaan kosong, pesan menunggu balasan dan tautan Freelancer terbaca |
| Proyek & Pendapatan | Formulir dan tenggat terbaca, keadaan kosong, mata uang dipisahkan, nominal tidak dibulatkan ke bilangan bulat |
| Aktivitas | Filter, pencarian, tambahan catatan hingga 500, batas cakupan pencarian dijelaskan |
| Tim AI | Diagnosis operasi, keterangan Idle/on-demand/runtime, tautan ke ruang kerja tiap peran |
| Profil | Gagal muat tidak tertutup panel loading, spesialisasi teknis dapat ditambah, batas 12 tetap berlaku |
| Kebijakan | Pengaturan lengkap, katalog yang bisa diedit, pembatalan perubahan, versi dan hasil penyimpanan jelas |
| Knowledge Hub | Progres API, LinkedIn API, filter/cari sumber, sinkron ulang per repo, validasi berkas sebelum dibaca, hasil pencarian lama dibersihkan saat gagal |
| Status Integrasi | Pemeriksaan nyata, riwayat bid tidak tertutup log jenis lain, error tidak menampilkan status live lama |

Panel proposal sekarang benar-benar menampilkan draf, harga, durasi, bukti, dan asumsi. Draf untuk bid yang sudah diproses ditampilkan hanya-baca. Membuat draf manual diberi keterangan bahwa autopilot akan melewati proyek tersebut.

Panel Owner dan Agen diperiksa kembali: WASD memindahkan karakter, kamera mengikuti Owner, memilih Market Scout membuka alasan status dan kinerja, serta Escape menghentikan perjalanan. Tes gerak, input, dan status agen tetap dijalankan. Knowledge Curator bekerja hanya saat pekerjaan sinkronisasi API benar-benar aktif.

## Bukti verifikasi

- Browser Chrome, viewport CSS **1396 px, 355 px, dan 320 px**: seluruh 13 kartu diperiksa. Luapan horizontal halaman dan badan kartu masing-masing **0 px** pada ketiga ukuran.
- Pemeriksaan warna teks DOM terhadap latar pada semua kartu di 320 px tidak menemukan rasio di bawah ambang AA. Kontrol nonaktif dikecualikan; label 3D berada di canvas dan tidak masuk pemeriksaan DOM ini.
- Klik langsung: navigasi 13 kartu, kalender tahun/bulan/hari, pembatalan edit kebijakan, katalog, filter peluang kosong/berisi, filter pipeline terkirim, draf bid hanya-baca, filter sumber, pencarian knowledge, pemeriksaan integrasi, fokus keyboard, Owner dan kamera.
- Supabase dan akses baca Freelancer/GitHub mengembalikan HTTP 200 pada pemeriksaan integrasi. LinkedIn `/userinfo` disinkronkan melalui API nyata.
- Logika pengiriman, mutasi kebijakan, penggantian sumber, kuota dan pemulihan diuji dengan PGlite dan adapter fixture. Pengujian UI berfokus pada alur baca dan pengeditan yang dibatalkan; perubahan bisnis nyata tidak dibuat sebagai data uji.

### Pemeriksaan akhir

- `pnpm exec eslint .`: exit 0, tanpa error.
- `pnpm -r typecheck`: semua paket exit 0.
- `pnpm test`: 161 tes unik lulus; skrip juga mengulang satu smoke test, sehingga 162 eksekusi tes lulus.
- `pnpm --filter @fvh/web build`: exit 0; peringatan ukuran chunk 3D yang sudah diketahui tetap ada.
- Tes regresi baru mencakup penolakan jadwal yang bisa dievaluasi ulang, perubahan kebijakan saat Hermes menulis, kuota akun dan jeda satu jam, pemulihan timer setelah kegagalan penyimpanan, penghentian sebelum bid, sumber atomik, klaim LinkedIn, blob GitHub, rotasi kata kunci, dan sinyal kerja Knowledge Curator.

## Batas operasional yang perlu dipahami

- Bid membutuhkan jatah akun Freelancer, proyek yang cocok, kebijakan belum kedaluwarsa, serta server dan koneksi aktif. Katalog tidak menjamin memperoleh proyek atau memenangkan bid.
- Persona tanpa proses runtime tetap on-demand; QA Engineer tetap tidak memiliki pekerjaan latar. Tidak ditambahkan loop otomatis baru untuk persona tersebut.
- Riwayat kerja LinkedIn membutuhkan ekspor pengguna pada izin API yang tersedia.
- GitHub mengindeks cakupan terbatas, bukan seluruh isi semua repositori. Progres sesi bukan riwayat pekerjaan yang dipersistenkan.
- Build 3D tetap di-lazy-load; peringatan ukuran chunk sekitar 931 KB masih muncul.
- Temuan konfigurasi yang sudah ada: koneksi Postgres server memakai `ssl.rejectUnauthorized: false`. Verifikasi CA TLS merupakan pekerjaan konfigurasi tersendiri; pengaturan itu tidak diubah oleh pembaruan ini.

## Delivery Gate antislop

Design Read: panel operasi kantor dengan data nyata, teks yang mudah dipindai, dan formulir yang dapat dipakai di ponsel. **ENERGY 1 / RHYTHM 1 / MOTION 1**. Biru menandai tindakan, garis dan judul memisahkan informasi; animasi kantor menunjukkan pergerakan yang bermakna.

### Hard Gate

- R-02 PASS: teks baru tidak memakai em dash; judul proyek asli dipertahankan sebagai data provider.
- R-03 PASS: 13 kartu pada tiga lebar yang diperiksa memiliki luapan horizontal 0 px; kanban bergulir di kontainernya.
- R-17 PASS: hitungan berasal dari API tersimpan; katalog merupakan daftar aturan eksplisit, bukan statistik keberhasilan.
- R-18 PASS: tidak ada testimonial.
- R-23 PASS: navigasi mengikuti kartu yang sudah ada; tidak dibuat identitas atau aset pengguna baru.
- R-24 PASS: pilihan navigasi membuka 13 rute kartu yang tersedia dan diperiksa di browser.
- R-25 PASS: pemeriksaan kontras DOM seluruh kartu memenuhi ambang AA pada keadaan yang diperiksa.
- R-26 PASS: kontrol memiliki handler/rute; mutasi diverifikasi dengan fixture, kontrol baca dicoba langsung.
- R-27 PASS: loading, gagal, kosong dan terisi tersedia; filter tanpa kecocokan dicoba langsung.
- R-28 PASS: tidak ada FAQ.
- R-32 PASS: fokus terlihat; Tab/Shift+Tab tetap di kartu, Ctrl+K dan Escape diperiksa.
- R-33 PASS: fitur ditulis di source dengan patch, tanpa injeksi kode browser atau skrip penyisipan fitur.
- R-34 PASS: kartu mempertahankan tema terang yang sudah digunakan; tidak ditambahkan toggle tema.
- R-35 PASS: aplikasi dijalankan, alur baca diklik, mutasi diuji dengan fixture, build dieksekusi.
- R-36 PASS: tidak dibuat klaim keamanan atau performa tanpa bukti.
- R-37 PASS: arah desain dan dials dicatat; gaya kantor sebelumnya dipertahankan.
- R-38 PASS: tidak ada data bisnis buatan pada UI runtime; peran virtual diberi status sesuai proses nyata.

### Purpose Gate

- R-01 PASS: tidak ditambahkan gradien atau glow.
- R-04 PASS: kontrol mempertahankan ikon kantor sesuai fungsi yang sudah ada.
- R-06 PASS: font sistem mengikuti aplikasi; label operasi tidak memakai monospace besar.
- R-07 PASS: grid kalender dan kanban dipakai untuk tanggal dan tahap proyek.
- R-08 PASS: panah kalender memindahkan periode; tidak ditambahkan panah dekoratif pada CTA.
- R-09 PASS: badge menyampaikan keadaan tersimpan atau status proses.
- R-10 PASS: kartu data memakai latar solid agar isi terbaca di atas kantor.
- R-12 PASS: elevasi dialog memisahkan kartu dari scene; bayangan ringan bagian isi mengikuti gaya yang sudah ada.
- R-13 PASS: tidak ada glow baru.
- R-14 PASS: bentuk mengikuti isi: agenda tanggal, daftar sumber, alasan keputusan dan formulir.
- R-19 PASS: motion kantor menjelaskan gerak/status; kartu mendukung preferensi kurangi gerakan yang sudah ada.
- R-22 PASS: tidak ditambahkan ilustrasi generik.

### Liveliness dan craftsmanship

- Dials PASS: ENERGY/RHYTHM/MOTION 1 konsisten dengan panel operasi yang tenang.
- Focal point PASS: judul kartu dan status atau formulir utama menjadi fokus tiap layar.
- Whitespace PASS: section, fieldset dan daftar memakai jarak yang memisahkan kelompok informasi.
- Accent PASS: biru untuk tindakan dan fokus; warna status mengikuti arti operasional.
- Identity PASS: kantor 3D, papan, peran virtual dan kartu menjadi pola produk yang dipertahankan.
- C-1 PASS: keputusan warna, ukuran dan jarak mendukung keterbacaan data operasi.
- C-2 PASS: handler dan rute tersedia; kontrol nonaktif memiliki keadaan yang sesuai.
- C-3 PASS: semua bagian menjawab status, sumber, keputusan, jadwal atau tindakan pemilik.
- C-4 PASS: keadaan normal/kosong/error dan tiga lebar diperiksa; tombol berbahaya diuji dengan fixture.
- C-5 PASS: angka hasil sinkronisasi dan diagnosis dibaca dari API nyata.
- R-05 PASS: komposisi mengikuti modul aplikasi, tanpa struktur landing page.
- R-11 PASS: radius dialog, kartu, input dan badge tetap berbeda sesuai tingkatnya.
- R-15 PASS: CTA menyebut tindakan, seperti simpan kebijakan, sinkronkan profil, atau cari bukti.
- R-16 PASS: tidak ditambahkan slogan pemasaran AI.
- R-20 PASS: hierarki tetap spesifik pada kantor freelancer dan proses bisnisnya.
- R-21 PASS: tema kartu terang mengikuti produk yang sedang berjalan.
- R-29 PASS: tinta, permukaan netral dan biru memakai warna status semantik yang sudah ada.
- R-30 PASS: tidak digunakan replika tampilan produk lain.
- R-31 PASS: keputusan visual didasarkan pada baca data, pengelompokan formulir, dan akses ponsel.
