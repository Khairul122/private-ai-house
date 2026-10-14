# Threat model ringkas

## Batas sistem

MVP berjalan sebagai aplikasi satu pengguna di loopback, menyimpan data kerja di SQLite lokal, dan memakai fixture sebagai sumber peluang. Tidak ada OAuth atau operasi tulis marketplace. GitHub hanya dibaca untuk repositori yang dipilih; LinkedIn dibatasi pada fakta manual atau ekspor milik pengguna. Draf OpenCode bersifat opsional dan memerlukan persetujuan pengiriman data yang eksplisit.

## Ancaman dan perlindungan

| Ancaman | Perlindungan yang diterapkan | Batas yang tersisa |
|---|---|---|
| Token GitHub bocor ke browser, database, atau draf AI | Token dibaca dari environment server; tidak dikirim ke klien, tidak disimpan di SQLite, dan tidak masuk ke allowlist environment OpenCode. | File environment dan host lokal tetap harus dijaga pemilik. Belum ada secret manager atau token vault. |
| Pemalsuan callback OAuth / CSRF | OAuth dan callback belum ada. Permintaan same-origin dibatasi dan header keamanan dikirim. | Perlindungan callback harus dirancang sebelum OAuth ditambahkan. |
| Brief, repo, atau dokumen menyisipkan instruksi berbahaya | Teks eksternal dianggap tidak tepercaya; pemindaian mengecualikan secret; draf OpenCode hanya menerima konteks yang dibatasi dan tidak diberi tool tulis. | Model eksternal dapat menerima konteks terpilih jika pemilik mengaktifkan mode OpenCode dan menyetujui pengiriman data. |
| Submit ganda atau aksi marketplace tanpa izin | Tidak ada endpoint marketplace write. Simulasi hanya mencatat keputusan lokal dan hash; state `submitted` membutuhkan konfirmasi eksternal yang tidak tersedia. | Write adapter, rekonsiliasi, dan idempotensi belum dapat dibuat sebelum kontrak resmi terverifikasi. |
| Kebocoran data melalui log atau respons | Logger Fastify dimatikan; kegagalan OpenCode tidak menyimpan stderr; secret tidak dikembalikan oleh capability API. | Data lokal tetap merupakan data sensitif dan database belum dienkripsi. |
| Penghapusan knowledge tidak lengkap | Penghapusan sumber berjalan dalam transaksi bersama seluruh chunk dan entry FTS terkait. | Belum ada ekspor, penghapusan seluruh workspace, backup, atau kebijakan retensi terjadwal. |

## Keputusan operasional

- Jangan memasukkan kredensial marketplace ke aplikasi atau CLI.
- Jangan mengirim bid, pesan, atau perubahan profil dari aplikasi sampai endpoint, scope, terms, sandbox, dan rekonsiliasinya terverifikasi.
- Simpan database dan environment di lokasi privat. Mode OpenCode mengirim konteks proyek terpilih dan bukti terbatas ke provider yang dikonfigurasi.
- Gunakan aktivitas lokal sebagai jejak keputusan, bukan bukti bahwa aksi eksternal terjadi.
