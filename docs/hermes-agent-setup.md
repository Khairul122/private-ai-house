# Konfigurasi Hermes Agent untuk Freelancer Virtual House

Panduan ini menghubungkan aplikasi lokal ke profile Hermes khusus proyek. Integrasi hanya membuat draf; aplikasi tidak mengirim bid, pesan, atau perubahan profil ke marketplace.

## 1. Pastikan CLI Hermes bisa dijalankan

Buka PowerShell baru, lalu jalankan:

```powershell
Get-Command hermes
hermes --version
hermes doctor
```

Jika Hermes menampilkan pesan bahwa install lock tidak bisa ditulis, bereskan dulu instalasi/akses untuk akun Windows yang menjalankan aplikasi. Jangan menghapus folder data `%LOCALAPPDATA%\hermes`; folder itu dapat berisi profile, sesi, kredensial, dan cron. Panduan Windows Hermes menjelaskan jalur data dan perbaikan install [di sini](https://hermes-agent.nousresearch.com/docs/user-guide/windows-native).

## 2. Buat atau siapkan profile khusus proyek

Jika profile belum ada:

```powershell
hermes profile create fvh
```

Jika output mengatakan profile sudah dibuat dan dilayani oleh multiplexed gateway, lewati perintah pembuatan. Gunakan `hermes -p fvh ...` di bawah ini; wrapper `fvh` opsional dan tidak perlu ditambahkan ke PATH. Atur provider dan model di profile tersebut. Kredensial provider disimpan oleh Hermes, bukan di `.env` proyek:

```powershell
hermes -p fvh setup
hermes -p fvh status
```

Uji satu chat biasa sampai Hermes bisa menjawab sebelum melanjutkan. Jika Anda sudah punya profile khusus, gunakan nama profile itu di semua perintah berikut dan isi `FVH_HERMES_PROFILE` dengan nama yang sama.

## 3. Matikan semua tool untuk sesi CLI dan cron

Profile Hermes memisahkan konfigurasi dan cron, tetapi profile sendiri bukan sandbox. Aplikasi karena itu perlu profile yang tidak memiliki tool akses file, terminal, browser, web, MCP, delegation, atau tool lainnya.

Buka konfigurasi profile:

```powershell
hermes -p fvh config edit
```

Edit file konfigurasi profile (`%LOCALAPPDATA%\hermes\profiles\fvh\config.yaml` pada instalasi Windows standar). Pastikan sesi CLI dan cron tidak mendapat tool. Gunakan pengaturan berikut:

```yaml
platform_toolsets:
  cli: []
  cron: []
agent:
  disabled_toolsets:
    - hermes-cli
    - hermes-cron
```

Simpan file. Jalankan `hermes -p fvh tools`, pilih platform CLI lalu cron, dan pastikan tidak ada tool yang aktif pada keduanya. Jangan aktifkan plugin atau server MCP pada profile ini. Toolset `safe` masih mencakup akses web, jadi jangan gunakan `safe`. Pembatasan toolset membatasi kemampuan Hermes, tetapi profile Hermes sendiri bukan sandbox sistem operasi.

## 4. Periksa cron proyek

Jangan membuat duplikat jika jadwal Anda sudah ada. Periksa job dan scheduler:

```powershell
hermes -p fvh cron list
hermes -p fvh cron status
hermes -p fvh cron doctor
```

Jika belum ada, contoh job pengingat lokal. Dengan tool cron dinonaktifkan, job ini hanya menghasilkan teks pengingat dan tidak membaca antrean aplikasi:

```powershell
hermes -p fvh cron create "weekdays at 9am" "Buat pengingat untuk membuka Freelancer Virtual House dan meninjau antrean proyek serta draf. Jangan mengakses file, browsing, mengirim bid atau pesan, atau mengubah profil." --name "FVH review" --deliver local
```

Output pembuatan profile dapat menyebut bahwa profile sudah dilayani oleh multiplexed gateway yang berjalan. Dalam kondisi itu, jangan pasang gateway kedua untuk `fvh`; cek status gateway host dan scheduler profile:

```powershell
hermes gateway status
hermes -p fvh gateway status
hermes -p fvh cron status
```

Jika profile tidak dilayani gateway dan cron status menunjukkan scheduler tidak berjalan, pasang gateway yang sesuai satu kali. Di Windows Hermes memakai Task Scheduler. Job dengan `--deliver local` tidak memerlukan token bot Telegram/Discord. Cron tersimpan di profile Hermes, terpisah dari server Freelancer Virtual House.

## 5. Aktifkan Hermes untuk aplikasi

Tambahkan empat baris berikut ke file `.env` di folder utama proyek. Jangan hapus key LinkedIn atau pengaturan lokal lain yang sudah ada:

```dotenv
FVH_AI_MODE=hermes
FVH_AI_DATA_CONSENT=true
FVH_HERMES_BIN=hermes
FVH_HERMES_PROFILE=fvh
```

`FVH_AI_DATA_CONSENT=true` menyetujui pengiriman detail proyek terpilih, fakta profil yang dimasukkan, dan maksimal empat potongan bukti relevan ke provider yang dikonfigurasi di profile Hermes. Token Freelancer, GitHub, dan LinkedIn tidak diteruskan ke proses Hermes. Jika belum menyetujui pengiriman data, biarkan nilainya `false`; aplikasi akan tetap memakai drafting fixture. Cron Hermes adalah fitur terpisah; job cron tidak membaca atau membuat draf di antrean aplikasi.

Bila Windows tidak menemukan `hermes`, ganti `FVH_HERMES_BIN` dengan path penuh hasil `Get-Command hermes`, misalnya `C:\Users\<nama-user>\AppData\Local\hermes\bin\hermes.exe`.

## 6. Jalankan dan verifikasi aplikasi

Mulai ulang aplikasi dari folder proyek:

```powershell
pnpm dev
```

Buka `http://127.0.0.1:5173`, lalu halaman **Status integrasi**. Hermes Agent harus berstatus aktif. Endpoint lokal berikut juga dapat diperiksa:

- `http://127.0.0.1:3001/api/health` — `ai` bernilai `hermes`.
- `http://127.0.0.1:3001/api/capabilities` — `hermes.active` bernilai `true`.

Di **Antrean peluang**, tekan **Buat draf lokal** pada proyek. Draf harus tersimpan lokal dan lolos validasi schema. Mengubah jadwal Hermes cron tidak mengubah atau mengirim draf aplikasi.

## Referensi resmi

- [CLI Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/cli) — query file dan output `stream-json`.
- [Profiles Hermes](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/profiles.md) — membuat dan memilih profile.
- [Toolsets Hermes](https://hermes-agent.nousresearch.com/docs/reference/toolsets-reference) — membatasi toolset per sesi/platform.
- [Konfigurasi Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/configuration/) — mengedit `config.yaml` dan mengatur `agent.disabled_toolsets`.
- [Cron Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron) — job, status scheduler, target penyimpanan lokal.
