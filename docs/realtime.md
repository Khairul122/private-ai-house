# Pembaruan realtime (`GET /api/events`)

Server mengirim pemberitahuan perubahan lewat Server-Sent Events agar kartu diperbarui segera, tanpa menunggu polling react-query.

- **Isi event:** hanya nama topik, `event: change` + `data: {"topics":[...]}`. Data tetap diambil ulang lewat route biasa, jadi aturan kejujuran data dan validasi tidak berubah. Daftar topik ada di `packages/domain/src/live-topics.ts`.
- **Sumber perubahan** (`apps/server/src/lib/live-events.ts`):
  - Semua tulisan database: `index.ts` membungkus `Database` sekali (`announceWrites`); nama tabel dari `INSERT/UPDATE/DELETE` dipetakan ke topik (`TABLE_TOPICS`). Transaksi diumumkan setelah commit; rollback tidak diumumkan.
  - Request non-GET yang berhasil: hook `onResponse` di `app.ts`, berdasarkan prefix URL (`routeTopics`).
  - State di memori (siklus autopilot, langkah BusinessSync, worker browser/projects.co.id, job operasional, WhatsApp/Google, job sinkronisasi Knowledge, draf manual, snapshot Kanban Hermes): disampel tiap 500 ms **hanya selama ada browser tersambung**, diumumkan bila JSON-nya berubah (`live.watch`).
- **Penggabungan:** emit pertama membuka jendela 250 ms; semua topik di jendela itu dikirim sebagai satu event. Ratusan audit dalam satu siklus autopilot menjadi paling banyak 4 event per detik.
- **Stream:** `text/event-stream`, `Cache-Control: no-store`, heartbeat `: ping` tiap 25 dtk, maksimum 20 klien (selebihnya 503). Hook Host/Origin tetap berlaku. `preClose` menutup semua stream agar `app.close()` dan `pnpm private:stop` tidak menggantung. Proxy Vite (`/api`) meneruskan SSE tanpa konfigurasi tambahan.
- **Web** (`apps/web/src/api/live.ts`, dipasang di `OfficeShell`): satu `EventSource`; topik dipetakan ke query key (`TOPIC_QUERY_KEYS`) lalu `invalidateQueries`. Saat terputus: backoff 1–30 dtk, dan setelah tersambung lagi semua query di-refetch karena perubahan selama putus tidak diumumkan. Polling cepat di `OfficeShell` diperlambat ke 30 dtk hanya selama stream aktif dan kembali ke interval asal saat terputus. Status tampil di kartu Mission Control.

Menambah topik: tambahkan di `LIVE_TOPICS`, petakan di `TOPIC_QUERY_KEYS` (typecheck memaksa), lalu di `TABLE_TOPICS`/`ROUTE_TOPICS`/`live.watch` pada sumbernya.

Setiap kartu menampilkan status sumbernya melalui `CardDataStatus`. “Data dibaca” menggunakan waktu respons paling awal dari query aktif yang relevan dengan kartu; ini bukan waktu sinkronisasi marketplace. Sumber yang gagal didahulukan daripada timestamp data tersimpan. Tombol **Perbarui** membaca ulang sumber kartu itu saja. Status koneksi pembaruan ditampilkan terpisah dari status API lokal, akun marketplace, dan hasil pengiriman.

Event beruntun digabung per akar query. Pembacaan yang sedang berjalan ditunggu (`cancelRefetch: false`), lalu perubahan yang datang selama pembacaan memicu satu pembacaan lanjutan. Ini mencegah antrean GET bertambah saat server lambat tanpa kehilangan perubahan terakhir. Disconnect menghentikan pembacaan lanjutan; kesalahan tetap dilaporkan oleh query masing-masing.

Uji E2E: `pnpm test:e2e` setelah build, dengan aplikasi lokal di port 3001. `FVH_E2E_URL` dapat menunjuk server pengembangan di loopback. Skrip memakai Chrome headless terisolasi tanpa WebGL untuk membatasi RAM, memblokir request tulis, memeriksa seluruh kartu desktop/ponsel dan memakai respons fixture untuk pembaruan SSE, sumber gagal, pemulihan, serta edit yang belum disimpan. Rendering 3D diperiksa terpisah. Screenshot dan laporan berada di `.local/card-remodel-e2e/`.
