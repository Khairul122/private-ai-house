# Lantai 2: delivery, penagihan, dan jadwal pemilik

Permintaan 16 Oktober 2026. Pesan otomatis hanya untuk klien/proyek yang diaktifkan pemilik. PDF contoh dipakai sebagai referensi tata letak, bukan sumber transaksi atau tanda tangan.

## Kontrak

- Kuota Freelancer berlaku pada akun. Jalur browser tidak melewati kuota; profil Chrome utama tidak diduplikasi atau dibuka paksa. Bid tetap melalui jalur terverifikasi dengan kebijakan dan idempotensi yang ada.
- Proposal mengutamakan kebutuhan, rencana penyelesaian, keluaran, dan bukti portofolio yang tersedia. Harga/durasi tetap deterministik.
- Lantai 1 menangani akuisisi; lantai 2 menangani progres, tagihan, invoice, dan jadwal. Manajer mengirim ringkasan faktual ke Lead melalui catatan kolaborasi tersimpan.
- Progres hanya berasal dari catatan pemilik. Konfirmasi pembayaran hanya dari transaksi berstatus diterima. Satu kejadian menghasilkan paling banyak satu pesan; pengiriman yang hasilnya tidak diketahui memerlukan rekonsiliasi.
- WhatsApp QR memakai Baileys; sesi disimpan terenkripsi DPAPI. Tidak membaca riwayat chat pribadi. Nomor tujuan disimpan per proyek dan divalidasi.
- Google Calendar memakai OAuth dengan token terenkripsi DPAPI. Sinkronisasi hanya mengelola acara milik aplikasi, tanpa undangan peserta. Kredensial OAuth dan persetujuan akun diisi pemilik melalui UI.
- Invoice mengikuti susunan contoh: identitas, nomor, penerima, detail proyek, riwayat pembayaran, total/sisa, catatan. Tidak menyalin tanda tangan atau data klien contoh. Nilai memakai minor unit bilangan bulat.
- Semua fitur tersedia dalam kartu kantor, responsif dan bisa dipakai dengan keyboard. Status agen berasal dari pekerjaan nyata.

## Urutan

1. Data aditif, validasi, invoice, catatan progres, tugas pemilik, pengaturan klien.
2. Outbox idempoten dan worker pembayaran/progres; integrasi QR dan OAuth.
3. Kartu lantai 2, kalender tugas, cetak invoice, pengaturan integrasi.
4. Dua lantai kantor, pegawai khusus, laporan manajer dan Lead.
5. Peningkatan proposal, tes, lint/typecheck/build, pemeriksaan UI.

## Batas verifikasi

Tidak mengirim pesan atau bid percobaan ke pihak nyata. QR/consent Google diselesaikan pemilik setelah fitur siap. Integrasi belum boleh disebut terhubung sebelum server menerima bukti koneksi.
