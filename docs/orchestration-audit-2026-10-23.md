# Audit orchestration — 23 Oktober 2026

## Kesimpulan

Integrasi dasar UI → Fastify → Hermes Kanban bekerja. Sistem belum dapat dinyatakan lancar untuk menyelesaikan tujuan multiagen sampai rangkuman akhir. Dua penghambat utama adalah tidak adanya tahap sintesis yang dijamin berjalan, serta board runtime yang belum terikat project repo.

Audit ini tidak mengubah kode aplikasi, konfigurasi Hermes, kebijakan, atau data board nyata. Pengujian tulis tambahan memakai PGlite di memori dan runner Hermes palsu. Pemeriksaan runtime hanya membaca kartu yang sudah ada.

## Acuan dan alur aktual

- [GitHub: What is AI agent orchestration?](https://github.com/resources/articles/what-is-ai-agent-orchestration): koordinasi, state persisten, governance, guardrail, observability, dan pengendalian biaya. Artikel ini panduan arsitektur, bukan standar sertifikasi yang wajib diterapkan seluruhnya.
- [Referensi Kanban Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban): dependency parents mengatur urutan dan meneruskan hasil; contoh fan-out membuat kartu sintesis terpisah yang bergantung pada kartu pekerja. Gateway menjalankan dispatcher.
- Graphify dipakai untuk pemetaan awal; hasil terbatas 55 dari 344 node terkait. Kesimpulan di bawah diverifikasi kembali pada kode dan runtime, bukan diasumsikan dari graph.

Alur aplikasi:

1. `/tasks` membuka `TaskBoardPage` dan `HermesKanbanCard`. Panel karyawan juga memakai komponen yang sama.
2. `POST /api/hermes-kanban/tasks` memvalidasi schema, Origin, karyawan, dan lampiran data.
3. Controller membuat snapshot opsional dan kunci deduplikasi.
4. `HermesKanban.create()` memanggil CLI menggunakan argument array, file body sementara, environment terbatas, timeout CLI 60 detik, dan runtime kartu 30 menit.
5. Gateway Hermes mengambil kartu. Chief of Staff membagi kerja berdasarkan SOUL yang dibuat `scripts/hermes-team.ts`.
6. GET board/detail mengembalikan hasil ke UI; polling 30 detik dan invalidasi SSE memperbarui tampilan.

## Temuan berdasarkan prioritas

### 1. P1 — Tujuan multiagen tidak mempunyai tahap sintesis yang dijamin berjalan

**Kode:** `scripts/hermes-team.ts:66`; `apps/server/src/services/hermes-kanban.ts:75`; `apps/web/src/components/HermesKanbanCard.tsx:8`.

SOUL meminta Chief menyelesaikan kartu setelah membagi pekerjaan, lalu menulis rangkuman saat dibangunkan lagi. Aplikasi tidak membuat kartu sintesis, dependency ke hasil pekerja, atau mekanisme penyelesaian tujuan keseluruhan. Detail API hanya membaca hasil yang ada.

**Bukti runtime:**

- Induk `t_69586be5`: selesai 23 Oktober 10:20:00 WIB, satu run.
- Anak `t_8db2dde0`: mulai 10:20:13, selesai 10:21:01 WIB.
- Anak berhasil dengan ringkasan `Delegasi orchestrator berhasil.`
- Induk tetap memiliki ringkasan `Menunggu hasil kartu anak untuk rangkuman akhir.` Tidak ada run sintesis tambahan saat audit.
- UI menempatkan induk di kolom Selesai. Ringkasan yang masih menunggu anak terlihat saat Lihat hasil dibuka.

Selesainya kartu dekomposisi memang sah; yang belum terpenuhi adalah penyelesaian tujuan pengguna secara keseluruhan.

**Perbaikan:** buat kartu sintesis/verifikasi yang bergantung pada seluruh kartu pekerja. Bedakan status kartu dekomposisi dan status tujuan keseluruhan. Jangan mengandalkan kebangkitan ulang sesi yang belum dibuktikan untuk kartu asal API.

### 2. P1 — Worktree repo belum terjamin untuk kartu kode

**Kode:** `scripts/hermes-team.ts:84`; `apps/server/src/services/hermes-kanban.ts:89`; `apps/web/src/views/AgentsPage.tsx:111`.

Skrip hanya membuat project bila belum ada; tidak memverifikasi atau memperbaiki ikatan board yang sudah ada. Pembuatan kartu tidak memberikan project/workspace eksplisit. Hermes dapat mewarisi project dari metadata board, tetapi metadata runtime `fvh-house` saat audit berisi `project_id: null` dan `default_workdir: null`.

Kartu E2E yang sudah ada melaporkan `workspace_kind: scratch`, `project_id: null`, dan tidak mempunyai branch. Itu konsisten dengan board tanpa ikatan repo. Kartu kode baru dengan jalur yang sama tidak dijamin mendapat worktree repo, meskipun UI/dokumentasi menjanjikannya.

**Perbaikan:** verifikasi binding project saat setup/startup; tolak atau tandai tidak siap pekerjaan kode jika binding tidak benar. Tambahkan pengujian kartu kode yang membuktikan workspace worktree, repo benar, dan branch terpisah. Jangan menganggap keberadaan nama project cukup.

### 3. P2 — Permintaan baru yang identik kembali ke kartu lama

**Kode:** `apps/server/src/controllers/hermes-kanban.ts:65`.

Kunci idempotensi adalah hash judul, goal, assignee, dan includeData. Tidak ada identitas permintaan baru. Snapshot terbaru juga tidak masuk kunci. Hermes mengembalikan kartu non-archived yang mempunyai kunci sama, termasuk kartu done.

**Reproduksi terisolasi:** dua POST terpisah dengan isi identik menghasilkan argumen idempotency-key yang sama. Perilaku deduplikasi kartu done juga dikonfirmasi dari implementasi `create_task` Hermes yang terpasang.

**Dampak:** mengirim lagi “Tinjau prioritas hari ini” setelah pekerjaan lama selesai dapat mengembalikan hasil lama tanpa menjalankan analisis terbaru. UI tetap mengatakan kartu dibuat dan dispatcher akan mengambilnya.

**Perbaikan:** gunakan request ID baru untuk satu niat pengiriman baru; pertahankan ID tersebut hanya selama retry atas pengiriman yang sama. Respons perlu membedakan kartu baru dan hasil deduplikasi.

### 4. P2 — Keterbacaan board dianggap sebagai kesiapan eksekusi

**Kode:** `apps/server/src/services/hermes-kanban.ts:58`; `apps/web/src/components/HermesKanbanCard.tsx:67`.

`available` hanya membuktikan `list` dan `assignees` berhasil dibaca. Tidak ada status gateway/dispatcher, pause Hermes, heartbeat dispatcher, atau usia antrean yang diekspos. CLI dipanggil dengan `--json`; pemeriksaan peringatan dispatcher pada CLI create tidak dijalankan dalam mode JSON.

Ini bukan bukti dispatcher sedang mati saat audit: kartu E2E membuktikan dispatcher pernah mengambil tugas. Masalahnya, aplikasi tidak dapat membedakan “board terbaca” dari “ada pekerja yang akan mengambil kartu” ketika gateway berhenti.

**Perbaikan:** tampilkan status dispatcher secara terpisah, atau nyatakan bahwa kartu baru hanya tercatat dan eksekusi bergantung pada gateway. Sediakan usia kartu ready dan alasan ketika eksekusi tertahan.

### 5. P2 — Pemulihan dan penelusuran dependency belum lengkap di UI/API

**Kode:** `apps/server/src/routes/hermes-kanban.ts:13`; `apps/server/src/models/hermes-kanban-types.ts:8`; `apps/web/src/components/HermesKanbanCard.tsx:31`.

Route hanya mendukung baca board, baca detail, dan buat kartu. Tidak tersedia komentar, unblock, retry/reassign, atau tindakan pemulihan lain. Detail tidak mengekspos parents, alasan blokir terstruktur, dan event timeline. Kartu anak ditampilkan sebagai ID teks tanpa navigasi langsung.

Saat audit, API dan UI sama-sama menampilkan 11 kartu: 7 done, 3 blocked, dan 1 scheduled. Kartu blocked dapat dibaca, tetapi pengguna tidak dapat memasok jawaban atau melanjutkannya dari aplikasi ini.

**Perbaikan:** mulai dari komentar/jawaban pemilik dan unblock yang tervalidasi; sediakan tautan induk/anak serta alasan menunggu. Gunakan semantik recovery Hermes yang sudah ada, termasuk membedakan dependency dan kebutuhan input manusia.

## Guardrail dan observability yang masih terbatas

- Maksimum enam kartu per tujuan berada dalam prompt SOUL. Controller aplikasi tidak memvalidasi fan-out yang dibuat langsung melalui tool Chief, dan tidak mengontrol budget total tujuan. Runtime cap 30 menit pada kartu induk tidak otomatis membatasi jumlah kartu, runtime seluruh anak, atau jumlah token.
- Penolakan snapshot untuk QA/Knowledge Curator berlaku pada POST langsung. Delegasi dari Chief berlangsung di Hermes; larangan meneruskan snapshot ke profil kode bergantung pada prompt. Ini belum merupakan batas keamanan deterministik di setiap handoff.
- Worktree memberi isolasi perubahan git, bukan sandbox OS. Dokumentasi proyek sudah mengakui akses terminal dapat mencapai path absolut di luar worktree. Audit ini tidak menguji pembacaan rahasia atau eksploitasi.
- Service sengaja mengembalikan snapshot lama selama refresh. `checkedAt` tersedia pada API, tetapi tidak ditampilkan oleh kartu kanban dan tidak dipakai untuk membatasi umur sinyal kerja agen. Polling 30 detik juga tidak menjamin aktivitas singkat selalu teramati.
- Riwayat run disimpan Hermes dan sebagian terlihat di UI. Aplikasi tidak menyediakan metrik token/biaya tujuan, batas retry total yang eksplisit, atau verifikasi kualitas hasil. Jangan menyamakan keberhasilan proses dengan tercapainya tujuan pengguna.

## Yang sudah terbukti bekerja

| Area | Bukti |
|---|---|
| Routing web | `/tasks` membuka papan dan kartu Hermes di aplikasi produksi lokal |
| Routing API | GET board, GET detail kartu induk/anak berhasil |
| Validasi | Tes membuktikan Origin wajib, Origin asing ditolak, ID tidak valid ditolak, assignee tidak dikenal ditolak |
| Lampiran data | Tes kanban membuktikan snapshot disertakan saat diminta dan ditolak untuk profil kode langsung |
| Proses CLI | Argument array tanpa shell; body file sementara; environment diwariskan dari allowlist |
| Delegasi dasar | Kartu E2E lama membuktikan Chief membuat anak, Market Scout mengambil dan menyelesaikannya |
| Tampilan hasil | Lihat hasil pada UI menampilkan ringkasan dan riwayat run dari API |
| Build/kualitas statis | ESLint, typecheck seluruh paket, dan build web lolos; peringatan ukuran chunk 3D tetap ada |

## Verifikasi yang dijalankan

- `pnpm --filter @fvh/server exec vitest run src/services/hermes-kanban.test.ts`: 5/5 lolos.
- `pnpm --filter @fvh/web test`: 83/83 lolos.
- `pnpm exec eslint .`: lolos.
- `pnpm -r typecheck`: lolos.
- `pnpm --filter @fvh/web build`: lolos, peringatan ukuran chunk yang telah dikenal.
- `.local/audit-orchestration.ts`: 5 pemeriksaan route/validasi lolos, serta reproduksi kunci deduplikasi dan argumen workspace. Memakai database memori dan runner palsu, bukan board atau database produksi. Runner hanya berhasil di luar sandbox setelah `uv_os_get_passwd/ENOMEM` di sandbox; error itu tidak cukup untuk menyimpulkan kekurangan RAM sebagai penyebabnya.
- Read-only runtime: API board/detail, CLI show kartu E2E, metadata binding board, dan UI Papan Tugas.

Tidak menjalankan ulang seluruh suite server, tidak membuat kartu nyata baru, dan tidak menguji crash/restart gateway atau provider outage. Tidak mengubah autopilot/kill switch dan tidak mengirim data ke marketplace.

## Urutan perbaikan

1. Pastikan DAG mempunyai tahap sintesis/verifikasi dan definisi selesai untuk tujuan keseluruhan.
2. Benarkan serta verifikasi binding project/worktree untuk tugas kode.
3. Pisahkan identitas pengiriman baru dari retry idempoten.
4. Tambahkan status dispatcher dan umur data/antrean.
5. Lengkapi pemulihan blocked dan navigasi dependency di UI.
6. Tetapkan budget/fan-out serta pemeriksaan handoff yang ditegakkan oleh runtime bila diperlukan untuk tingkat otonomi berikutnya.
