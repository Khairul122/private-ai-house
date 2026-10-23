# Operasional dua lantai

## Cakupan dan keputusan pemilik

Permintaan 16 Oktober 2026 menambahkan operasional klien langsung di lantai 2 dan manajer di setiap lantai. Pemilik memilih **otomatis untuk klien/proyek yang diaktifkan**. Izin ini tidak mengaktifkan proyek, mengisi nomor klien, mencatat progres/pembayaran, atau menyambungkan akun secara otomatis.

Lantai 1: sepuluh peran sebelumnya dan Manajer Akuisisi. Lantai 2: Manajer Operasional, Koordinator Progres, Petugas Pembayaran, Pengingat Tagihan, Petugas Invoice, Perencana Jadwal, Operator WhatsApp, Operator Kalender. Pilih lantai pada kartu Mission Control; papan Operasional Klien membuka `/operations`.

## Menyiapkan penggunaan

1. Daftarkan proyek nyata di Proyek & Pendapatan. Catat nilai dan mata uang, pembayaran yang diharapkan beserta jatuh tempo, serta pembayaran yang benar-benar diterima.
2. Di Operasional Klien → Klien & progres atau WhatsApp, isi formulir **Nomor WhatsApp klien**. Pilih proyek yang sudah ada atau daftarkan nama klien, proyek, sumber dan mata uang langsung di formulir. Nomor Indonesia `08…` diubah ke `628…`; nomor internasional dapat diawali `+`. Simpan nomor, lalu aktifkan izin dan pilih jenis pesan bila diperlukan. Pesan otomatis dinonaktifkan pada pendaftaran baru sampai dipilih pemilik. Nomor tersimpan dapat diubah melalui **Ubah nomor / izin**.
3. Hubungkan WhatsApp dan pindai QR dari Setelan → Perangkat tertaut di telepon. Koneksi baru belum boleh disebut terhubung sebelum socket melaporkan `open`.
4. Catat progres faktual melalui formulir. Pembayaran baru/yang ditandai diterima dikonfirmasi dari transaksi tersimpan. Perubahan konfigurasi komunikasi memulai waktu izin baru agar kejadian lama tidak dikirim sebagai kabar baru.
5. Isi identitas penerbit, petunjuk pembayaran, dan nama penanggung jawab sebelum membuat invoice. Invoice merupakan ringkasan tagihan proyek, bukan tagihan tambahan untuk setiap DP. Seluruh pembayaran diterima pada proyek dan mata uang yang sama diperhitungkan terhadap total invoice. Buka dokumen, gunakan Ctrl+P → Simpan sebagai PDF. Tanda tangan contoh tidak disalin; nama penanggung jawab ditampilkan sebagai penerbit dokumen digital.
6. Tambahkan jadwal pemilik dengan jam perangkat. Kalender utama aplikasi menampilkan tugas tersebut pada tampilan hari/bulan/tahun. Tandai tugas yang perlu disinkronkan ke Google.
7. Google Cloud: aktifkan Calendar API, siapkan consent screen/test user, buat OAuth client **Web application**, dan daftarkan `http://localhost:3001/api/operations/google/callback`. Masukkan ID/secret atau impor JSON client lewat kartu, lalu hubungkan akun dan berikan persetujuan.

## Runtime dan penyimpanan

- `OperationsService`: siklus setiap 60 detik, satu siklus aktif per proses. Progres, transaksi, jatuh tempo, jadwal dan izin dibaca dari state tersimpan. Tidak membaca riwayat chat pribadi.
- Dokumen bertipe disimpan di `fvh.operation_documents` (JSONB); antrean di `fvh.operation_outbox`. Migrasi `0002_operations.sql` aditif, RLS aktif, peran Data API tidak memperoleh akses. Akun database server tetap memakai proteksi workspace lokal yang ada.
- `event_key` unik mencegah duplikasi setelah restart. `claim` mengubah pending → sending secara atomik. Hanya ID hasil penyedia yang membuat status sent; itu bukan bukti pesan dibaca atau sampai ke telepon penerima.
- Gangguan saat kirim menjadi **uncertain**, termasuk sending yang ditemukan saat startup. Tidak ada retry otomatis untuk pesan tersebut. Pemilik memeriksa WhatsApp, lalu menandai sudah terkirim atau membatalkan. Antrean lebih dari 48 jam, izin/nomor berubah, proyek ditutup atau pengingat tidak lagi cocok dibatalkan.
- Pengingat maksimal sekali per hari WIB per proyek. Jika invoice terakhir jatuh tempo, gunakan sisanya setelah pembayaran; jika belum, periksa pembayaran expected yang jatuh tempo. Invoice lunas tidak menghasilkan pengingat. Riwayat expected harus diperbarui ketika uang diterima.
- Manajer menyimpan laporan sekali per jam per lantai. Lead meninjau hitungan tersebut melalui Hermes tanpa tool dan tanpa data kontak/kredensial. Tinjauan adalah saran AI, bukan aksi atau fakta tambahan. Tinjauan terputus ditandai tidak tersedia; tombol tinjauan ulang tersedia. `runtime.jobs` memberi sinyal busy/lastRunAt/error nyata.

## Integrasi

WhatsApp memakai Baileys `7.0.0-rc14`, bukan API resmi Meta. Library tanpa browser mengurangi kebutuhan RAM. Koneksi/session bisa berubah mengikuti WhatsApp Web; penggunaan akun tunduk pada aturan WhatsApp. QR hanya dikirim pada route lokal khusus, respons no-store, tanpa log. Auth credentials dan signal keys diserialisasi dengan BufferJSON dan disimpan terenkripsi Windows DPAPI, bukan `useMultiFileAuthState` plaintext. `integration-vault.ps1` menulis ciphertext sementara lalu menggantinya secara atomik.

Badge di kartu operasional membedakan **HTTP endpoint lokal** dengan **sesi WhatsApp**. Kode HTTP diambil dari `Response.status` GET `/api/operations/whatsapp`, bukan angka tetap. Tanpa respons jaringan tidak ada kode HTTP. Body gagal/tidak valid tidak menghasilkan status sesi terhubung. Pemeriksaan diulang setiap 2 detik pada tab WhatsApp dan 5 detik pada bagian lain; hasil lebih dari 15 detik dilabeli lama dan sesi tidak diketahui. Badge menampilkan waktu observasi dan tombol pemeriksaan ulang. Warna hanya membantu membedakan hasil; teks tetap menyebut kode dan status nyata. Form tetap tersedia saat daftar proyek kosong agar pemilik dapat mengisi kontak tanpa berpindah kartu.

Google memakai native fetch, OAuth state sekali pakai (10 menit), PKCE S256, offline token, scope `calendar.events.owned`. Akses Calendar diverifikasi sebelum status connected. Token dan client secret disimpan lewat vault DPAPI. Refresh token tersimpan untuk sesi berikutnya; aplikasi OAuth eksternal berstatus Testing dapat mempunyai batas umur refresh token Google.

Acara hanya di kalender primary, dengan ID deterministik serta `extendedProperties.private.fvhTask`. Tidak ada attendees; `sendUpdates=none`. Judul, catatan dan jam acara yang dikelola aplikasi ditarik kembali bila tugas lokal belum diubah. Jika keduanya berubah, lokal didahulukan. Penarikan memakai compare-and-set agar tidak menimpa perubahan pemilik yang masuk saat request berlangsung. Acara yang dihapus di Google menghentikan sinkronisasi tugas lokal yang belum diubah, tanpa menandai tugas selesai. Acara pribadi lainnya tidak dibaca. Tugas sepanjang hari hasil edit Google memerlukan penyesuaian ke jam tertentu.

Putuskan akun menghapus token lokal dan mencoba mencabut grant Google; acara yang sudah dibuat dipertahankan. Pembatalan koneksi menghentikan request/refresh yang masih berjalan agar token lama tidak tersimpan kembali.

## Nominal dan proposal

Invoice memakai bilangan bulat minor unit ISO 4217. `currencyDigits()` deterministik: IDR/USD 2, JPY 0, KWD 3. Jangan memakai default `Intl` untuk skala penyimpanan: Node dan Chrome dapat memberi default tampilan IDR berbeda. Uji DP, sisa, kelebihan bayar, expected/received, serta mata uang berbeda.

Proposal Hermes mengutamakan solusi, langkah, hasil serah terima, dan pertanyaan relevan. Resolver memeriksa metadata repo GitHub **tanpa token**, dengan cache dan timeout. Hanya repo yang terverifikasi public masuk `publicPortfolio`; tautan lain di teks proposal ditolak. Harga/durasi dan pengecekan kill switch tetap di jalur autopilot. Fallback tetap memberi rencana dan tautan publik yang tersedia, tanpa mengarang pengalaman.

Kuota `BID_LIMIT_EXCEEDED` milik akun Freelancer. Semua pengiriman bid memakai Freelancer API dan melewati policy engine, kuota, idempotensi, serta audit.

## Sumber API

- [Baileys](https://github.com/WhiskeySockets/Baileys) dan [auth state](https://github.com/WhiskeySockets/Baileys/blob/master/src/Utils/use-multi-file-auth-state.ts)
- [Google OAuth web server](https://developers.google.com/identity/protocols/oauth2/web-server), [Calendar events](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [private properties](https://developers.google.com/workspace/calendar/api/guides/extended-properties)
- [Freelancer bidding FAQ](https://www.freelancer.com/faq/topic.php?id=5)
- [SIX ISO currency maintenance](https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html)
