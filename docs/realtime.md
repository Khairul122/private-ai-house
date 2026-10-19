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
