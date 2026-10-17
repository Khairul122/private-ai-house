# Form kontak dan status WhatsApp — 16 Oktober 2026

## Perubahan

- Form nomor klien tampil pada Klien & progres dan WhatsApp, termasuk saat daftar proyek kosong. Pendaftaran memakai API proyek dan konfigurasi komunikasi yang sudah ada.
- Form memuat nama klien, proyek, sumber, mata uang, nomor dan izin pesan. Nomor tersimpan dapat diubah. Nomor `08…` dinormalisasi ke `628…`; otomasi baru tetap dinonaktifkan sampai dipilih pemilik.
- Proyek baru yang sudah berhasil dibuat dipertahankan pada kegagalan simpan nomor agar percobaan berikutnya tidak membuat proyek kedua.
- Badge menyampaikan dua fakta terpisah: kode HTTP respons endpoint lokal dan status sesi yang dilaporkan server. Tidak ada respons jaringan berarti tidak ada kode HTTP; data sesi gagal/invalid/lama tidak menjadi klaim terhubung.

## Arah tampilan

Mengikuti DESIGN.md dan pilihan antislop selama pengerjaan: ENERGY 2 / RHYTHM 2 / MOTION 1. Panel status memakai batas untuk memisahkan bukti koneksi dari tindakan pengiriman. Label warna membantu pemindaian status dan selalu disertai teks. Tidak ada aset atau animasi baru.

## Verifikasi

- ESLint, typecheck seluruh paket, dan build web lulus; peringatan chunk 3D yang sudah diketahui tetap ada.
- `pnpm test`: 195 eksekusi lulus, termasuk 10 tes baru (satu smoke test dijalankan kembali oleh skrip).
- Database sementara di memori: buat klien/proyek dan nomor, ubah nomor, hasil satu proyek/satu kontak, otomasi false, pesan nol. Proses dan tab sementara ditutup sesudah pemeriksaan.
- Database nyata: tidak menambahkan klien uji atau mengirim pesan. Pemeriksaan langsung membaca HTTP 200 dan sesi connected.
- Desktop, lebar CSS 818 px dan 320 px diperiksa tanpa overflow horizontal. Fokus input terlihat; kontrol tetap memakai target minimum 44 px.
- Kontras badge normal 7,64:1 / gagal 8:1 / netral 10,84:1; batas status normal 4,72:1.
