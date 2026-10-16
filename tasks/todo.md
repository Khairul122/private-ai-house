# Work checklist

## Selesai

- [x] Baca PRD, arsitektur, panduan agen, dan roadmap yang disediakan.
- [x] Verifikasi batas capability dari dokumentasi resmi; catat yang belum diketahui.
- [x] Bangun workspace ketat TypeScript, paket domain/API, SQLite, dan shell React/Fastify.
- [x] Selesaikan alur dashboard 2D dari fixture → draf → keputusan policy → simulasi lokal → audit → pause/resume.
- [x] Bangun import knowledge lokal, pemindaian secret, chunking, pencarian FTS5, provenance, serta penghapusan sumber.
- [x] Tambahkan GitHub read-only terbatas, status provider, dan adapter Hermes Agent opsional yang diuji dengan process runner fixture.
- [x] Tambahkan ruang 3D lazy-loaded dan navigasi kembali ke daftar kerja 2D.
- [x] Uji API, domain, adapter, persistence, smoke, lint, typecheck, build, dan UI browser.

## Belum selesai karena kontrak atau integrasi belum tersedia

- OAuth/credential store dan adapter Freelancer: endpoint, scope, sandbox, dan kontrak tulis belum terverifikasi. Capability tetap `unknown`; semua marketplace write nonaktif.
- GitHub App authorization, cursor pagination, full/incremental sync, dan pola pengecualian khusus pengguna belum tersedia. Connector saat ini membaca repositori terpilih secara read-only dengan batas file/ukuran.
- Hermes CLI/provider nyata belum dapat dijalankan karena install lock menolak akses akun Windows ini. Adapter diuji terhadap runner palsu; tidak ada konteks yang dikirim ke provider selama verifikasi ini.
- Fallback WebGL/reduced-motion, pengukuran performa perangkat target, dan pengurangan chunk 3D belum selesai. Chunk 3D lazy sebesar 887 KB minified / 237 KB gzip memberi peringatan build yang tidak memblokir.
- Ekspor dan penghapusan seluruh workspace, retensi terjadwal, backup/restore, inbox marketplace, dan publikasi profil/portofolio belum tersedia.

## Hasil pemeriksaan terakhir

- 29 tes lulus; lint, typecheck, dan build lulus.
- Build menampilkan satu peringatan ukuran chunk 3D (887 KB), tetapi scene hanya dimuat ketika pengguna memilih mode 3D.
- Browser produksi: alur desktop, skip risiko tinggi, 3D, navigasi ponsel 390 px tanpa overflow halaman, serta same-origin HTML/aset/API diperiksa.
- Tidak ada token provider atau akun marketplace yang dipakai; tidak ada live write.

## Permintaan pemilik: perluasan Mission Control, 16 Oktober 2026

- [x] Diagnosis operasi: API mengekspos ringkasan siklus nyata dan alasan belum ada bid; tes scheduler/status/penolakan. Freelancer mengonfirmasi jatah bid akun habis.
- [x] Kontrak kebijakan: timezone, jadwal, deadline, masa berlaku, dan interval bisa diatur; paused tidak berubah aktif saat disimpan; tes domain/API.
- [x] Katalog coding: kelompok istilah dapat dipilih/diedit, pencocokan dan rotasi pencarian diuji; 182 kata tersimpan dan dibaca kembali dari Supabase, versi 14.
- [x] LinkedIn API: respons divalidasi, sumber Knowledge Hub diperbarui tanpa duplikat, refresh dari UI; sinkronisasi nyata dan tes adapter/API.
- [x] GitHub API: pergantian sumber atomik, progres dan batas sinkronisasi jelas; 49 repo diindeks dan satu repo kosong dilewati; tes penggantian/partial/failure.
- [x] Kartu Ringkasan dan Tim AI: status/penyebab kerja, informasi terbaca, data gagal tidak terlihat live; verifikasi browser.
- [x] Kartu Papan Tugas, Peluang, Pipeline: filter/detail/draf, daftar panjang, loading/error/kosong, layout; verifikasi browser.
- [x] Kartu Kalender, Kotak Masuk, Proyek & Pendapatan: jadwal konsisten, formulir/tenggat/income jelas; verifikasi browser.
- [x] Kartu Profil, Kebijakan, Knowledge Hub: validasi/form panjang, daftar sumber, sinkronisasi dan pencarian; verifikasi browser.
- [x] Kartu Aktivitas, Status Integrasi, dan panel Owner/Agen: log/status/aksi dan error yang jelas; verifikasi browser.
- [x] Audit akhir 13 kartu di 1396/355/320 px; lint + typecheck + 162 eksekusi tes + build lulus; laporan dan Delivery Gate di docs/mission-control-upgrade.md.
