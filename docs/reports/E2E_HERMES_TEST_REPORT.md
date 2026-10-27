# Laporan Pengujian Hermes Agent

Tanggal: 2026-10-26
Scope: Hermes CLI, gateway, cron, Kanban `fvh-house`, orchestrator, dan integrasi service aplikasi.

## Ringkasan

| Area | Hasil | Bukti |
|---|---|---|
| Hermes CLI | Lulus | `hermes --version` → `v0.21.7+158.g7cc3fb8` |
| Hermes doctor | Lulus dengan peringatan opsional | Tidak ada security advisory; runtime, SQLite, config, profile, gateway path sehat |
| Gateway | Lulus | Gateway host aktif, PID 18552, heartbeat 49 detik saat pemeriksaan |
| Cron scheduler | Lulus | Scheduler host aktif; `cron doctor` tidak menemukan masalah |
| Cron execution | Lulus | Job sementara `6eff0da1aa7a` dijalankan langsung, execution `e3366af2858f445c85c57f073eb347ce` berstatus `completed`; tidak ada incident |
| Kanban integrity | Lulus | `kanban repair` → `integrity_check ok` |
| Kanban dispatch | Lulus tanpa spawn | Tidak ada kartu `ready`; hasil `Spawned: 0`, `Crashed: 0`, `Timed out: 0` |
| Kanban orchestration historis | Lulus | Tes E2E sebelumnya selesai: plan → worker → synthesis |
| Service unit tests | Lulus | 3 file, 14 test passed |

## Tes yang Dijalankan

### 1. Service aplikasi

Command:

```text
pnpm exec vitest run apps/server/src/services/hermes-kanban.test.ts apps/server/src/services/hermes-orchestration.test.ts apps/server/src/services/hermes-workflow.test.ts
```

Hasil: **14 passed, 0 failed**.

Cakupan:

- Filter profile hanya `fvh-*`.
- Cache status dan invalidasi setelah kartu dibuat.
- Fail-closed saat Hermes tidak tersedia.
- Penolakan assignee di luar team.
- Origin protection API.
- Snapshot data aplikasi.
- Idempotency request.
- Worktree wajib untuk profile kode.
- Dependency graph worker.
- Synthesis menunggu semua worker.
- Resume setelah partial graph creation.
- Concurrent create coalescing.
- Penolakan plan invalid, oversized, cyclic, dan data-to-code.
- Recovery kartu blocked.

### 2. Hermes runtime

Command:

```text
hermes --version
hermes doctor
hermes gateway status
hermes -p private-ai-house cron list
hermes -p private-ai-house cron status
hermes -p private-ai-house cron doctor
hermes -p private-ai-house cron create "1m" "Reply with exactly: FVH_CRON_TEST_OK. Do not access files, browse, send messages, modify settings, or change application data." --name "FVH temporary cron test" --deliver local --failure-deliver local --repeat 1
hermes -p private-ai-house cron run 6eff0da1aa7a
hermes -p private-ai-house cron runs
hermes -p private-ai-house cron incidents
hermes -p private-ai-house cron remove 6eff0da1aa7a
```

Hasil:

- Hermes terpasang dan executable.
- Doctor tidak menemukan security advisory atau masalah konfigurasi fatal.
- Gateway memakai host multiplexer dan aktif.
- Profile `private-ai-house` tidak punya job cron.
- Scheduler aktif dan melayani profile.
- Tidak ada execution attempt atau incident cron.

Catatan: `hermes -p private-ai-house tools` membuka UI interaktif. Perintah dihentikan tanpa perubahan; tidak ada konfigurasi yang diubah.

### 3. Kanban runtime

Command:

```text
hermes kanban --board fvh-house stats
hermes kanban --board fvh-house diagnostics
hermes kanban --board fvh-house dispatch
hermes kanban --board fvh-house repair
```

Hasil saat pemeriksaan:

- 15 kartu: 11 done, 3 blocked, 1 scheduled, 0 ready/running.
- Dispatch tidak spawn worker karena tidak ada kartu ready.
- Tidak ada crashed, timed out, stale, atau auto-blocked worker.
- Database Kanban utuh.

## Temuan

### HERMES-01 — Cron execution berhasil diverifikasi

Severity: Informational.

Expected: Satu job lokal non-destruktif membuktikan scheduler, execution record, dan failure handling.

Actual: Job sementara `6eff0da1aa7a` memakai `--deliver local` dan `--failure-deliver local`, dipicu langsung, lalu berstatus `succeeded`. Execution `e3366af2858f445c85c57f073eb347ce` berstatus `completed`; `cron incidents` kosong.

Cleanup: Job dihapus setelah verifikasi. `cron list` kembali kosong. Tidak ada konfigurasi Hermes permanen tersisa.

### HERMES-02 — Tiga kartu Kanban blocked lama

Severity: Low / operational hygiene.

Kartu:

- `t_fcd1467c` — blocked sekitar 161 jam.
- `t_e2320293` — blocked sekitar 161 jam.
- `t_305f918c` — blocked sekitar 161 jam.

Diagnostics menyarankan komentar atau unblock. Tidak ada perubahan otomatis dilakukan karena unblock adalah tindakan operasional pemilik.

### HERMES-03 — Satu kartu scheduled belum menjadi execution

Severity: Informational.

Kartu `t_2088c99e` status `scheduled`; tidak ada kartu ready/running saat dispatch. Perilaku sesuai status, bukan defect.

## Orchestrator Evidence

Board menyimpan pengujian historis yang membuktikan:

- Chief of Staff menghasilkan plan JSON valid.
- Backend membuat satu worker `fvh-market-scout`.
- Worker selesai.
- Backend membuat synthesis card.
- Synthesis selesai.
- Tidak ada duplikasi pada graph.

Kartu utama: `t_172ea81b`.
Worker: `t_0ecc4238`.
Synthesis: `t_27d4aa60`.

## Batasan

- Tidak menjalankan `hermes-team.ts`; skrip mengubah profile/board dan butuh izin pemilik.
- Cron job uji dibuat sementara dengan persetujuan pemilik, dijalankan sekali, diverifikasi, lalu dihapus.
- Tidak mengirim bid, pesan, invoice, atau request marketplace.
- Tidak mengubah kartu blocked/scheduled.
- Tidak membaca atau menampilkan secret dari Hermes profile atau `.env`.

## Verdict

**Hermes runtime sehat untuk Kanban dan gateway. Orchestrator sudah terbukti melalui tes unit/integrasi dan execution historis. Cron scheduler aktif tetapi belum mendapat bukti execution karena profile tidak memiliki job.**
