# Threat model ringkas

## Batas sistem

MVP berjalan sebagai aplikasi satu pengguna di loopback, menyimpan data kerja di SQLite lokal, dan mulai dengan antrean peluang kosong. Peluang Freelancer hanya ditambahkan setelah pemilik memulai sinkronisasi baca-saja. Tidak ada operasi tulis marketplace. GitHub hanya dibaca untuk repositori yang dipilih; LinkedIn dibatasi pada alur OIDC ringan atau fakta manual/ekspor milik pengguna. Drafting Hermes bersifat opsional dan memerlukan persetujuan pengiriman data yang eksplisit.

## Ancaman dan perlindungan

| Ancaman | Perlindungan yang diterapkan | Batas yang tersisa |
|---|---|---|
| Token provider bocor ke browser, database, atau draf AI | Token Freelancer/LinkedIn disimpan terenkripsi oleh DPAPI Windows; token GitHub berasal dari environment server. Token tidak dikirim ke klien, SQLite, atau allowlist Hermes. | File environment dan host lokal tetap harus dijaga pemilik. Belum ada secret manager atau rotasi otomatis. |
| Pemalsuan callback OAuth / CSRF | OAuth memakai state acak sekali pakai, callback harus sama dengan URI terdaftar, origin aplikasi dibatasi, dan header keamanan dikirim. | App LinkedIn harus memperoleh produk OIDC dan redirect URI terdaftar sebelum alur dapat menyelesaikan consent. |
| Brief, repo, atau dokumen menyisipkan instruksi berbahaya | Teks eksternal dianggap tidak tepercaya; pemindaian mengecualikan secret; draf Hermes hanya menerima konteks yang dibatasi dan profile CLI dikonfigurasi tanpa toolset. | Model/provider Hermes dapat menerima konteks terpilih jika pemilik mengaktifkan mode Hermes dan menyetujui pengiriman data. Profile Hermes tidak membatasi akses filesystem dengan sendirinya. |
| Submit ganda atau aksi marketplace tanpa izin | Tidak ada endpoint marketplace write. Simulasi hanya mencatat keputusan lokal dan hash; state `submitted` membutuhkan konfirmasi eksternal yang tidak tersedia. | Write adapter, rekonsiliasi, dan idempotensi belum dapat dibuat sebelum kontrak resmi terverifikasi. |
| Kebocoran data melalui log atau respons | Logger Fastify dimatikan; kegagalan Hermes tidak menyimpan stderr; secret tidak dikembalikan oleh capability API. | Data lokal tetap merupakan data sensitif dan database belum dienkripsi. |
| Penghapusan knowledge tidak lengkap | Penghapusan sumber berjalan dalam transaksi bersama seluruh chunk dan entry FTS terkait. | Belum ada ekspor, penghapusan seluruh workspace, backup, atau kebijakan retensi terjadwal. |

## Keputusan operasional

- Jangan memasukkan kredensial marketplace ke aplikasi atau CLI.
- Jangan mengirim bid, pesan, atau perubahan profil dari aplikasi sampai endpoint, scope, terms, sandbox, dan rekonsiliasinya terverifikasi.
- Simpan database dan environment di lokasi privat. Mode Hermes mengirim konteks proyek terpilih dan bukti terbatas ke provider di profile yang dikonfigurasi.
- Gunakan aktivitas lokal sebagai jejak keputusan, bukan bukti bahwa aksi eksternal terjadi.
