# Prioritas harian Chief of Staff

`OperationsService` menyusun satu cuplikan per tanggal `Asia/Jakarta` pada siklus 60 detik yang sudah ada. `POST /api/operations/daily-priority/refresh` membuat revisi baru atas permintaan pemilik; `GET /api/operations/daily-priority` membaca revisi tersimpan untuk hari WIB saat ini. Route hanya memakai data lokal dan status worker yang tersedia melalui route internal. Tidak ada pesan, bid, atau kartu Hermes baru yang dikirim.

Cuplikan tersimpan di `fvh.daily_priorities` dengan kunci tanggal dan revisi. Setiap penyusunan memakai mission `client_operations` beridentitas `daily-priority:v1:<tanggal>:<revisi>`. Lease mencegah klaim bersamaan. Penulisan cuplikan dan penyelesaian mission terjadi dalam satu pernyataan SQL yang mengunci mission serta memeriksa token dan masa berlaku lease. Worker dengan token lama tidak dapat menimpa hasil baru. Kegagalan penyusunan meninggalkan mission untuk dicoba ulang oleh siklus berikutnya.

Urutan tindakan deterministik, lalu dipecahkan dengan `dueAt` dan ID sumber:

| Urutan | Kondisi |
|---|---|
| 1 | Tenggat proyek aktif terlewat |
| 2 | Jadwal tugas pemilik terlewat |
| 3 | Invoice atau pembayaran diharapkan terlewat |
| 4 | Pesan terakhir yang teramati dari pihak lain, hanya jika sinkronisasi berhasil dan identitas akun diketahui |
| 5 | Kartu Hermes berstatus blocked/triage atau tujuan blocked |
| 6 | Tenggat proyek atau tugas hari ini |
| 7 | Invoice atau pembayaran diharapkan hari ini |
| 8 | Item di atas yang jatuh tempo dalam dua hari |

Invoice memakai sisa dari pembayaran diterima pada proyek dan mata uang yang sama. Pembayaran diharapkan ditampilkan hanya untuk proyek tanpa invoice terbaru agar tagihan tidak terduplikasi. Tidak ada total lintas mata uang. Konten pesan tidak masuk cuplikan; identitas thread dan waktu terakhir teramati tetap dicatat. Status sumber `available`, `stale`, `failed`, atau `unknown` disimpan bersama waktu pemeriksaan. Sumber pesan dan papan yang gagal/lama tidak menghasilkan tindakan baru. Tinjauan Hermes pada laporan manajer hanya dilabeli saran AI; aturan urutan tidak memakai teks AI.

Kartu Overview menampilkan waktu pengambilan, revisi, sumber bermasalah, alasan setiap tindakan, keputusan pemilik, dan tautan ke sumber. Cuplikan lebih dari 30 menit diberi label lama. Kesalahan GET menyembunyikan cache react-query agar data lama tidak tampil sebagai status terkini.
