# Pekerjaan lantai 2

- [x] Data, kontrak, invoice, progres, tugas
- [x] Outbox dan worker dengan idempotensi
- [x] WhatsApp QR dan penyimpanan sesi DPAPI
- [x] OAuth dan sinkronisasi Google Calendar
- [x] Kartu operasional dan cetak invoice
- [x] Dua lantai, staf, manajer dan kolaborasi Lead
- [x] Proposal berbasis solusi dan bukti
- [x] Tes, lint, typecheck, build dan UI

Aktivasi akun yang menunggu pemilik: pemindaian QR WhatsApp; konfigurasi OAuth dan persetujuan Google. Tidak ada nomor klien/proyek nyata yang diaktifkan oleh agen. Jalur browser untuk melewati kuota akun Freelancer tidak dibuat karena akun tetap terkena batas yang sama.

Verifikasi: 185 eksekusi tes lulus (smoke dijalankan dua kali), ESLint, typecheck dan build web lulus. Enam bagian operasional diperiksa pada desktop dan lebar CSS 320 px tanpa overflow horizontal. Invoice DP/sisa dan buat/edit tugas diperiksa memakai server sementara dalam memori; data uji tidak disimpan pada database nyata.

Setup Google Cloud: proyek Private AI House Calendar (`prismatic-pad-511813-d8`), Calendar API aktif, OAuth Web application dengan callback `http://localhost:3001/api/operations/google/callback`, satu test user pemilik dan scope `calendar.events.owned`. Impor JSON dan persetujuan akses akun masih menunggu pemilik; status terhubung belum diklaim.
