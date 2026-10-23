# Orchestration Hermes

Perbaikan 23 Oktober 2026 menempatkan koordinasi graph di backend. Hermes merencanakan pekerjaan dan menulis hasil; dependency, batas delegasi, workspace, dan identitas permintaan diperiksa aplikasi.

## Alur tujuan

1. Pemilik membuat kartu untuk Chief of Staff. Backend menandainya `mission-control-plan` atau `mission-control-plan-data` dan menyisipkan kontrak `[FVH_PLAN_V1]`.
2. Chief menyelesaikan kartu rencana dengan summary JSON berisi 1–6 tugas spesialis. Setiap tugas mempunyai judul, instruksi, profil, dan indeks dependency sebelumnya.
3. Koordinator memvalidasi seluruh rencana sebelum membuat pekerja. Profil harus ada di roster dan instalasi Hermes; Chief tidak boleh menjadi pekerja rencana. Dependency maju/siklus ditolak. Tujuan dengan snapshot aplikasi tidak boleh membuat tugas untuk profil kode.
4. Backend membuat kartu pekerja dengan parent rencana dan dependency yang sudah diterjemahkan ke ID Hermes. Konteks pemilik diteruskan sebagai data.
5. Backend membuat kartu `[FVH_SYNTHESIS_V1]` untuk Chief dengan parent rencana dan seluruh pekerja. Dispatcher Hermes baru dapat menjalankannya setelah semua parent selesai.
6. `goalStatus` mencapai `done` hanya jika kartu sintesis selesai. Selesainya kartu rencana sendiri belum berarti tujuan selesai. `resultId` menunjuk hasil akhir.

Koordinator dimulai saat Fastify ready, memeriksa satu rencana yang selesai per putaran 30 detik, dan dihentikan saat aplikasi ditutup. Pembacaan board memakai cache bersama dengan polling UI, tidak membuat pembacaan CLI baru ketika pembacaan sebelumnya masih berjalan. Snapshot berusia satu menit atau lebih tidak dikembalikan sebagai data live lama.

Kunci pekerja diturunkan dari ID rencana dan indeks pekerjaan; kunci sintesis diturunkan dari ID rencana. Kegagalan di tengah pembuatan graph dapat dilanjutkan setelah restart. Percobaan bersamaan atas kunci sama digabung dalam satu proses aplikasi. Jalankan satu instance server untuk board ini; native CLI tidak memberi jaminan unique-key lintas beberapa koordinator aplikasi.

Kartu Chief lama dari API dengan author `mission-control` mendapat kartu sintesis yang bergantung pada anak yang sudah ada. Pekerja lama tidak dijalankan ulang. Kartu buatan pengguna di CLI tidak dimigrasikan otomatis.

## Batas eksekusi

- Maksimal enam pekerja, ditambah satu rencana dan satu sintesis: delapan kartu per tujuan baru melalui jalur backend.
- Setiap kartu yang dibuat backend memakai runtime cap 30 menit dan `--max-retries 1` (blokir pada kegagalan pertama; tidak retry otomatis tanpa keputusan pemulihan).
- Chief tidak lagi mempunyai toolset delegasi bebas. Lifecycle kanban yang disediakan dispatcher tetap tersedia untuk menyelesaikan atau memblokir kartunya.
- Hanya QA Engineer dan Knowledge Curator memakai akses kode. Pembuatan kartunya wajib memakai `--project fvh --workspace worktree`; respons yang tidak menyatakan worktree dengan project ditolak sebagai belum terverifikasi.
- Profil tanpa tool file/terminal menggunakan workspace scratch eksplisit, sekalipun board terikat ke repo.
- Ini batas graph dan percobaan, bukan batas biaya uang atau token provider. Worktree juga bukan sandbox sistem operasi; larangan membuka rahasia dan melakukan aksi produksi tetap berlaku untuk profil kode.

## Setup profil dan repo

```powershell
pnpm --filter @fvh/server exec tsx ../../scripts/hermes-team.ts --orchestrator-only
```

Mode tersebut memperbarui Chief saja, memastikan primary folder project `fvh` adalah repo ini, dan memperbaiki binding board. Setup penuh tanpa flag tetap memperbarui seluruh karyawan. Versi Hermes terpasang memperbarui binding di database project tetapi tidak menulis `board.project_id`; skrip melengkapi metadata board dari ID project yang diverifikasi CLI.

Pada verifikasi runtime, project adalah `p_41fb9d35`, primary repo `D:\portofolio\private-ai-house`, board `fvh-house`.

## Pengiriman baru dan retry

Web mengirim UUID `requestId`. UUID dipertahankan jika pengiriman belum pasti dan isi belum berubah. Setelah respons sukses, atau setelah isi diubah, pengiriman berikut memakai UUID baru. Backend menggabungkan request ID dan payload ke kunci idempotensi. Klien lama yang tidak mengirim UUID tetap diterima, tetapi setiap POST dianggap permintaan baru.

Jangan memakai ulang UUID sukses untuk meminta analisis baru. Pengiriman identik dengan UUID baru tetap membuat pekerjaan baru, sedangkan retry pengiriman yang sama mengembalikan kartu sebelumnya.

## Status dan pemulihan

- `GET /api/hermes-kanban`: board, umur data, status tujuan, ID hasil akhir, status gateway, waktu kartu ready tertua, dan error koordinator.
- `GET /api/hermes-kanban/tasks/:id`: hasil, parent/child, komentar, event, status kartu, dan riwayat run.
- `POST /api/hermes-kanban/tasks/:id/recover`: `{ message, resume }`. Origin wajib. Pesan maksimal 4.000 karakter. Hanya assignee tim yang diterima. `resume: true` hanya untuk kartu blocked/scheduled; Hermes tetap memeriksa dependency saat unblock.

UI menyediakan navigasi parent/child, komentar, dan tombol lanjut pada kartu yang memenuhi syarat. Kartu running/done tidak direclaim atau dijalankan ulang oleh tombol pemulihan. Jika komentar berhasil tetapi unblock gagal, muat ulang dahulu agar komentar tidak dikirim berulang tanpa perlu.

Probe gateway berjalan terpisah maksimal sekali per dua menit agar pemindaian banyak profil tidak menahan pembacaan board. Nilai running hanya menyatakan gateway dilaporkan hidup; bukan jaminan dispatcher aktif, tidak dijeda, atau provider sehat. UI menyebut batas ini dan menampilkan waktu kartu ready tertua. Aplikasi tidak menyalakan gateway atau melepas pause secara otomatis.

## Bukti verifikasi

E2E nyata tanpa snapshot atau aksi marketplace:

- Rencana: `t_172ea81b`.
- Pekerja Market Scout: `t_0ecc4238`.
- Sintesis: `t_27d4aa60`, selesai 23 Oktober 2026 17:14:55 WIB.
- Hasil akhir mengutip `Orchestration E2E berhasil.` Status tujuan berubah menjadi done setelah sintesis selesai.
- Tujuan E2E lama `t_69586be5` mendapat sintesis `t_ad3f80b7` dan selesai, tanpa menjalankan ulang anaknya.
- Endpoint pemulihan menerima komentar uji pada kartu rencana dengan `resume: false`.

Tes otomatis mencakup dependency sintesis, batas rencana, penolakan data ke profil kode, pemulihan graph setelah kegagalan parsial/restart, retry bersamaan, request ID baru vs retry, serta syarat unblock. Tes web, lint, typecheck dan build lolos. Suite server lolos setelah satu tes DPAPI yang gagal di sandbox dijalankan ulang di luar sandbox.

Perubahan pada file kode oleh agen, crash gateway nyata, pembatasan biaya provider, dan isolasi OS bukan bagian dari E2E ini.

### Kondisi workspace pada pemeriksaan terakhir

Tes fokus orchestration terbaru 14/14 dan tes web 85/85 lolos. UI produksi lokal memperlihatkan hasil akhir dan tombol lanjut hanya pada kartu blocked/scheduled; komentar API nyata berhasil. Setelah gate lint/typecheck sebelumnya lolos, pekerjaan Discord paralel menambahkan dua error global: `discord-kanban.ts:73` meneruskan string ke parameter `DiscordChannel`, dan `index.ts:131` mendeklarasikan `discordMonitor` yang belum digunakan. Kedua gate global tersebut belum bersih pada akhir verifikasi ini. File pekerjaan paralel itu tidak diubah untuk menyembunyikan atau mengabaikan error.
