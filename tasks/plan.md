# Implementation plan

The supplied PRD, TECH_STACK, AGENT, and TASKS documents are the accepted specification. This plan follows their roadmap while keeping unverified external writes fail-closed.

1. **Foundation:** strict pnpm workspace, typed domain rules, fixtures, SQLite migrations, deterministic policy/scoring and pipeline state.
2. **Vertical slice:** Fastify routes for dashboard, projects, drafts, policy, simulated send, activity, settings, and knowledge; React 2D console consumes same-origin APIs.
3. **Knowledge Hub:** local user-provided text import, secret/file screening, provenance, FTS search, delete; remote provider status remains explicit.
4. **Optional integrations:** Hermes adapter behind explicit data consent and schema validation; marketplace/GitHub/LinkedIn calls remain disabled unless official capability and authorization are configured.
5. **Resilience and finish:** responsive/keyboard UI, optional lazy 3D, unit/API/smoke checks, browser click-through, build and security review.

## Perluasan Mission Control, 16 Oktober 2026

Permintaan pemilik: jelaskan dan perbaiki operasi karyawan, kebijakan fleksibel, perbaiki seluruh kartu, kata kunci pemrograman tersimpan di Supabase, audit semua fitur, sinkronisasi LinkedIn API, dan pengambilan bukti GitHub/LinkedIn di Knowledge Hub.

Implementasi mengikuti kondisi yang berjalan: Supabase Postgres schema fvh, kantor 3D, bid otomatis sesuai kebijakan tersimpan. Perubahan lama dalam working tree dipertahankan. Tidak ada commit/push yang diotorisasi.

Urutan implementasi:

1. **Diagnosis runtime:** ringkasan siklus dan alasan tidak ada bid berasal dari keputusan nyata. Status menunggu jadwal dibedakan dari gagal, dijeda, dan tidak mempunyai runtime.
2. **Kebijakan:** validasi zona waktu dan jadwal, jam lintas tengah malam, pilihan deadline tidak diketahui, masa berlaku, interval pemindaian. Nilai harga/kuota yang sudah disimpan pemilik dipertahankan saat menambah kata kunci. Kebijakan dijeda tidak boleh aktif karena disimpan.
3. **Kata kunci:** katalog luas bahasa, framework, dan jenis proyek coding, pencocokan yang tidak menghasilkan kecocokan semu untuk istilah pendek, serta rotasi kueri pencarian. Pemilik bisa memilih kelompok atau mengedit sendiri. Simpan preset yang diminta ke kebijakan Supabase lalu baca ulang.
4. **LinkedIn:** verifikasi kontrak OIDC resmi; validasi respons, sinkronisasi ke sumber Knowledge Hub yang sama, dan UI untuk refresh nyata. Keahlian/riwayat kerja yang tidak diberikan OIDC tetap memakai impor ekspor pemilik.
5. **GitHub:** sinkronisasi lewat API dengan status/progres dan batas cakupan yang jujur; ganti sumber secara atomik. Jalankan sinkronisasi repositori milik pemilik yang sudah diotorisasi.
6. **Seluruh kartu:** inventaris semua rute, benahi keterbacaan, form, layout mobile, data error/loading/kosong, pencarian/filter, dan aksi yang tidak memberikan umpan balik. Kantor tetap menjadi shell utama.
7. **Verifikasi:** tes regresi per bagian, seluruh lint/typecheck/test/build, baca ulang penyimpanan nyata, dan pemeriksaan browser seluruh kartu. Catat temuan, hasil, batas API, serta Delivery Gate antislop.

Ketergantungan: kontrak dan domain kebijakan mendahului API/engine/UI. Adapter LinkedIn/GitHub mendahului Knowledge Hub. Pembaruan nilai kebijakan nyata dilakukan setelah validasi dan tes. Pengujian tidak mengirim pesan atau bid uji ke marketplace.

Sumber awal runtime: autopilot running, siklus terakhir mengimpor 134 proyek dan mengirim 0 bid; BusinessSync outcomes/messages berhasil. Kebijakan aktif versi 13, 00–24 Asia/Jakarta, confidence 50%, USD 100–10000, 30/hari dan 200/minggu, deadline tidak diketahui diizinkan, keywords kosong. LinkedIn OIDC sudah authorized; GitHub tokenConfigured true. Nilai ini adalah observasi awal, bukan hardcode baru.

Selesai: kebijakan versi 14 memuat 182 kata coding di Supabase. Sinkronisasi menghasilkan 49 repo GitHub terindeks, satu repo kosong dilewati, dan satu profil LinkedIn API. Penyebab penolakan live terkonfirmasi `BID_LIMIT_EXCEEDED`; pemindaian tetap aktif dan penulisan/pengiriman kandidat mendapat jeda satu jam setelah penolakan tersebut. Seluruh 13 kartu diperiksa pada desktop dan dua lebar ponsel. Lint, typecheck, build, serta 162 eksekusi tes lulus. Rincian dan Delivery Gate: `docs/mission-control-upgrade.md`.
