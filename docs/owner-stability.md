# Analisis dan stabilisasi Owner

Tanggal: 16 Oktober 2026. Cakupan: karakter Owner, gerak manual dan kunjungan karyawan, kamera, kontrol panel, serta informasi kinerja di panel tersebut.

## Temuan dan perbaikan

| Temuan | Perbaikan | Bukti |
| --- | --- | --- |
| Kaki Owner statis; hanya satu lengan bergerak, termasuk saat berjalan otomatis. | Kedua kaki dan lengan memakai fase langkah dari jarak perpindahan. Ayunan mereda saat berhenti atau tertahan objek. | Tes animasi, berhenti di dinding, dan gerak di browser. |
| Gerak bisa melewati partisi, meja, dan bangku lobi; posisi awal berada terlalu dekat bangku. | Jejak furnitur dan partisi menjadi penghalang. Posisi awal dipindah ke lantai kosong. Gerak manual meluncur sepanjang penghalang. | Tes tabrakan meja/partisi, batas lantai, dan posisi awal. |
| Kunjungan memakai tujuan sebelumnya sebagai asal rute saat target diganti di tengah jalan. | Rute dihitung dari posisi Owner saat itu melalui area yang bisa dilalui. Tujuan dipilih di sisi karyawan yang bebas furnitur. | Tes rute ke seluruh slot workspace, rapat, lounge, pantry, dan lobi; tes ganti tujuan. |
| Polling dapat mengubah rute setelah kontrol manual; memilih karyawan yang sama tidak selalu memulai kunjungan lagi. | Identitas permintaan kunjungan dibedakan dari pembaruan data. Input manual membatalkan rute; polling tujuan yang sama tidak memulainya lagi. Klik baru dapat memulai kunjungan ulang. | Tes interupsi manual, Stop, polling, dan permintaan kunjungan baru. |
| Tombol Stop hanya mereset D-pad, sementara WASD dan rute otomatis tetap bisa aktif. | Keyboard, pointer, dan tombol keyboard D-pad memakai satu pengendali input. Stop dan Esc membersihkan input serta membatalkan rute. | Tes input campuran, Escape, dan Stop perjalanan melalui panel agen. |
| Keyup/pointerup yang hilang bisa membuat Owner terus berjalan; Ctrl+W ikut ditangkap. | Input dibersihkan saat blur, tab disembunyikan, atau kartu halaman dibuka. Repeat dari tombol yang masih ditahan tidak memulai gerak kembali. Shortcut dan kolom teks tetap menerima keyboard. | Tes kehilangan fokus, visibilitas, shortcut, kontrol dinonaktifkan; pencarian diuji di browser. |
| D-pad tidak membedakan sumber input; pelepasan satu jari dapat menghentikan arah lain. | Setiap pointer dan tombol memiliki sumber sendiri, dengan pointer capture dan pembersihan saat capture hilang. | Tes pelepasan beberapa sumber input dan pemeriksaan semua tombol di browser. |
| WASD tetap memakai sumbu dunia setelah kamera diputar. | WASD dan D-pad memakai arah horizontal kamera; kecepatan diagonal dinormalisasi. | Tes orientasi kamera dan jarak diagonal. |
| Membuka Owner memusatkan kamera pada lobi dan dapat memulangkan karakter ke sana. | Kamera mengambil posisi karakter yang sedang dirender. Membuka panel Owner menghentikan kunjungan di tempat. | Tes pembukaan Owner di tempat dan kunjungan nyata Market Scout di browser. |
| Mode ikuti, tur, navigasi zona, dan gestur kamera saling berebut kendali. | Navigasi kamera eksplisit dan gestur manual melepas follow/tur. Fly menuju target yang diikuti menyesuaikan posisi target yang bergerak. OrbitControls tersambung kembali dengan benar setelah cleanup React. | Follow, overview, denah, dan gestur kamera diperiksa di browser. |
| Panel mempertahankan scroll dari panel sebelumnya; tab belum punya navigasi panah. | Scroll direset saat panel/karyawan berubah. Tab memakai ArrowLeft/Right, Home/End, relasi ARIA, dan fokus yang terlihat. Esc menutup panel. | Browser: pergantian tab dengan panah, kembali ke Owner, tutup/buka panel. |
| Error sumber data dapat tampil sebagai "Belum tercatat" atau "Tidak ada tugas". | Sumber gagal tampil "Tidak tersedia". Status berjalan/diam Owner berasal dari perpindahan aktual. | Pemeriksaan alur `fresh()`, fallback panel, dan status gerak di browser. |

## Keputusan interaksi

- Arah visual tetap mengikuti kantor voxel layar penuh yang ditetapkan pemilik. ENERGY 1 / RHYTHM 1 / MOTION 2: panel tenang, dengan animasi yang menjelaskan perpindahan karakter.
- Ayunan kaki dan lengan berasal dari jarak, supaya kaki tidak terus melangkah ketika tertahan dinding. Preferensi kurangi gerakan menghapus ayunan dan bob tanpa menghilangkan kontrol posisi.
- Batas langkah per frame Owner adalah 0,1 detik untuk memotong jeda tab dan mencegah lompatan besar. Pergerakan manual dipecah menjadi langkah kecil sebelum pemeriksaan penghalang. Animasi agen karyawan tetap memakai aturan waktunya sendiri.
- D-pad memakai tombol 44×44 px dengan jarak 4 px agar bisa ditahan lewat pointer atau Enter/Space. Kontrol menampilkan status gerak dengan teks.
- Warna dan tipografi mengikuti panel yang sudah ada. Batas D-pad diperjelas untuk keterbacaan; tidak ada aset gambar atau dependensi baru.

## Verifikasi

- `pnpm test`: seluruh rangkaian unit, adapter, server, persistence, dan smoke berhasil.
- Frontend: 23 tes berhasil, termasuk 12 regresi Owner dalam `owner-input.test.ts` dan `owner-motion.test.ts`.
- `pnpm exec eslint .`: berhasil.
- `pnpm -r typecheck`: berhasil untuk seluruh paket.
- `pnpm --filter @fvh/web build`: berhasil. Peringatan chunk VisualOffice sekitar 931 kB adalah peringatan ukuran yang sudah dikenal proyek.
- Browser lokal: WASD, semua tombol D-pad, Stop, kunjungan karyawan, kembali ke Owner, follow, overview, denah, pencarian, pergantian tab, dan pembukaan/penutupan kartu diperiksa.
- Viewport ponsel diuji dengan override 390×844 dan 320×740. Lebar CSS yang dilaporkan browser adalah 355 dan 291 px. Keduanya tanpa overflow horizontal; kelima tombol D-pad berukuran 44×44 px. Isi panel yang panjang tetap bisa digulir. Override viewport dikembalikan setelah pemeriksaan.
- Log lama memuat error HMR karena pergantian bentuk prop/import saat pengeditan bertahap. Versi akhir dimuat ulang pada 15.08 WIB, lalu WASD, follow, overview, dan pembukaan Owner diulang. Tidak ada error aplikasi baru setelah reload tersebut; dua error baru berasal dari `chrome-extension://.../inpage.js` milik MetaMask. Log ekstensi dan riwayat HMR tidak dijadikan klaim bahwa seluruh console kosong.

## Batas perilaku

- Posisi Owner adalah state sesi halaman. Memuat ulang halaman mengembalikan Owner ke lobi.
- Penghalang berupa jejak statis furnitur dan partisi saat ini. Agen yang berjalan tidak menjadi penghalang fisik. Jika denah/furnitur diubah, sesuaikan jejak di `owner-motion.ts`.
- Data kinerja tetap mengikuti runtime dan audit yang tersedia; peran tanpa runtime tidak diberi aktivitas buatan.

## Delivery Gate antislop

Status diperiksa untuk perubahan Owner dalam tugas ini.

| Aturan | Status dan bukti |
| --- | --- |
| R-01 | PASS: memakai permukaan panel yang sudah ada; tidak menambah gradien. |
| R-02 | PASS: teks UI baru tidak memakai em dash. |
| R-03 | PASS: dua viewport sempit tanpa overflow; D-pad 44×44 px. |
| R-04 | PASS: tombol arah memakai huruf kontrol; tidak menambah ikon dekoratif. |
| R-05 | PASS: urutan panel menempatkan kontrol gerak sebelum informasi tim. |
| R-06 | PASS: font panel diwarisi dari aplikasi; deklarasi font D-pad diperbaiki menjadi CSS valid. |
| R-07 | PASS: tidak menambah tekstur atau latar pola. |
| R-08 | PASS: tidak menambah panah dekoratif pada tombol. |
| R-09 | PASS: status gerak berupa teks dari perpindahan aktual. |
| R-10 | PASS: perubahan kontrol tidak menambah lapisan blur. |
| R-11 | PASS: radius tombol dan blok kontrol mengikuti panel yang sudah ada. |
| R-12 | PASS: tidak menambah bayangan pada blok kontrol. |
| R-13 | PASS: tidak menambah glow. |
| R-14 | PASS: informasi tim tetap memakai daftar; tidak menambah kartu fitur. |
| R-15 | PASS: tombol menyebut aksi: Ikuti Owner, Hentikan perjalanan Owner, dan Kamera overview. |
| R-16 | PASS: instruksi menerangkan tombol dan hasil gerak secara langsung. |
| R-17 | PASS: metrik memakai API dan audit, dengan fallback sumber gagal. |
| R-18 | PASS: tidak menambah testimoni atau orang fiktif. |
| R-19 | PASS: fase langkah dari jarak aktual; unit test reduced motion berhasil. |
| R-20 | PASS: identitas kantor voxel dan panel Indonesia dipertahankan. |
| R-21 | PASS: kontrol memakai tema overlay kantor yang sudah ada, termasuk fase siang/malam. |
| R-22 | PASS: karakter Owner yang diminta pemilik diperbaiki tanpa ilustrasi tambahan. |
| R-23 | PASS: perubahan memakai karakter dan struktur navigasi yang telah diotorisasi. |
| R-24 | PASS: tombol navigasi tetap menuju panel atau rute yang tersedia. |
| R-25 | PASS: teks bantuan #5f6b76 pada #f7f8f6 = 5,12:1; teks utama = 13,85:1; batas tombol pada putih = 3,86:1 untuk komponen nonteks. |
| R-26 | PASS: kontrol gerak, stop, kunjungan, dan kamera diperiksa sebagaimana daftar browser di atas. |
| R-27 | PASS: data gagal memakai fresh()/Tidak tersedia; tab agen kosong meminta pengguna memilih agen. |
| R-28 | PASS: tidak ada FAQ dalam perubahan ini. |
| R-29 | PASS: kontrol menggunakan netral dan aksen panel yang sama. |
| R-30 | PASS: mempertahankan produk kantor pemilik. |
| R-31 | PASS: alasan animasi, ukuran tombol, warna, dan urutan panel dicatat di bagian keputusan interaksi. |
| R-32 | PASS: fokus terlihat, D-pad mendukung Enter/Space, tab mendukung panah dan Esc. |
| R-33 | PASS: perubahan ditulis langsung pada source melalui patch. |
| R-34 | PASS: warna kontrol memakai permukaan solid overlay yang sama pada fase kantor. |
| R-35 | PASS: build dan pemeriksaan browser selesai; hasil tes dan tindakan dicatat di atas. |
| R-36 | PASS: laporan hanya menyatakan hasil pemeriksaan yang dijalankan. |
| R-37 | PASS: arah berasal dari kantor voxel layar penuh pemilik; dials dicatat. |
| R-38 | PASS: status gerak dari simulasi posisi karakter, metrik bisnis dari API/audit. |
| Liveliness | PASS: fokus visual pada Owner dan kontrolnya; jarak memisahkan kontrol, kamera, dan informasi tim; motion hanya saat perpindahan. |
| C-1–C-5 | PASS: alasan desain tercatat, kontrol bekerja, isi berasal dari fitur Owner, viewport/keyboard diperiksa, dan klaim didukung tes serta observasi. |
