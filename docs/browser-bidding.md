# Pengiriman bid melalui Chrome

## Menggunakan worker

Buka **Status Integrasi → Bid melalui Chrome / Playwright** atau **Operasional Klien → Bid browser**. Operator Browser Bid berada di lantai 1; statusnya berasal dari proses browser nyata.

1. Pilih jalur pengiriman dan simpan. `API saja` memakai jalur lama. `API utama, browser untuk penolakan akses / batas request API` mencoba browser hanya setelah API benar-benar menolak dengan HTTP 401/403/429. `Browser sebagai pengirim` memakai browser untuk proposal autopilot yang lolos kebijakan.
2. Gunakan Chrome berprofil Anda yang sudah login Freelancer. Buka `chrome://inspect/#remote-debugging` dan aktifkan **Allow remote debugging for this browser instance**. Klik **Hubungkan Chrome saya** di aplikasi, lalu setujui dialog Chrome bila Anda mengizinkan aplikasi mengontrol sesi browser. Worker membuat tab kerja pada profil yang sama. Password, OTP dan CAPTCHA tidak diterima melalui aplikasi/chat. Worker tidak menandatangani perjanjian proyek.
3. Status akun dan jatah bid dibaca dari dashboard. `HTTP halaman 200` hanya kode respons navigasi, bukan bukti login. Username harus cocok dengan pembacaan API; jatah bid harus diketahui dan lebih dari nol. Jatah tidak dihitung dari tebakan lokal.
4. Autopilot mengirim pada siklus berikutnya bila kebijakan mengizinkan. Semua jalur memakai claim audit, draf, kuota lokal dan hasil bid yang sama. Tidak ada route HTTP untuk mengirim payload bid bebas atau menjalankan skrip/selector browser.

Mode awal instalasi adalah API. Untuk setup pemilik pada 17 Oktober, mode fallback dipilih melalui UI. Pemilik kemudian meminta Chrome yang sudah berprofil; profil kosong ditutup dan pembukaan otomatisnya dimatikan. Pemilik mengaktifkan serta menyetujui izin debugging. Pada 17 Oktober pukul 10.02 WIB, sambungan ke Chrome aktif berhasil: username `khairulhuda01` cocok dengan API, navigasi dashboard HTTP 200, kuota teramati 0. Tidak ada bid uji production yang dikirim.

## Sesi dan restart

`playwright-core` 1.64.1 memakai `chromium.connectOverCDP('chrome', { noDefaults: true })` untuk tersambung ke Chrome yang sedang berjalan. Tidak ada launch browser, salinan profil, ekspor cookie/localStorage/token, atau perubahan preferensi konteks harian. Implementasi koneksi channel diverifikasi terhadap sumber versi terpasang; Playwright menemukan endpoint lokal yang diaktifkan Chrome 144+ melalui izin pemilik. Worker membuat tab sendiri pada default context; tidak mengambil alih tab pemilik yang sudah terbuka. Service worker dilewati hanya pada tab worker agar request bid tetap melewati gate.

Mode dan pilihan menyambung kembali disimpan pada `browser-bid-settings.json` di data directory, tanpa rahasia. Startup dapat meminta sambungan kembali setelah koneksi berhasil, tetapi tidak menjalankan Chrome dan tidak mengaktifkan debugging sendiri. Chrome meminta izin setiap sambungan baru; restart tidak menjamin akses otomatis. Sejak 19 Oktober 2026 worker Freelancer dan Scout projects.co.id berbagi satu sambungan CDP (`SharedChromeSession`), sehingga izin Chrome cukup sekali untuk keduanya; tiap worker tetap memakai tab sendiri dan sambungan ditutup saat worker terakhir dilepas. Sambungan otomatis hanya dicoba sekali per peluncuran server: `autoStartedFor` menyimpan PID peluncur (proses `tsx watch` saat dev), jadi restart karena perubahan file tidak memunculkan dialog lagi. Bila dialog dibatalkan, gunakan tombol Hubungkan. Pengaturan lama tanpa penanda `connection: existing-chrome` tidak memicu auto-start. Tombol **Lepas sambungan worker** menutup tab worker, memutus CDP, dan mematikan sambungan otomatis; jendela/tab pemilik tetap terbuka. Putus saat submit dapat menghasilkan status tidak pasti yang wajib direkonsiliasi.

Izin debugging memberi aplikasi akses kontrol pada sesi Chrome, sehingga pemilik harus mengaktifkan dan menyetujui izin tersebut di browser. Ini diperlukan oleh mekanisme resmi Chrome, tidak dapat dilewati oleh aplikasi. Bila tidak ingin memberi izin, mode API tetap tersedia.

Pemeriksaan dashboard dijalankan tiap 10 menit selama browser tersedia, dan selalu sekali lagi tepat sebelum setiap pengiriman (di dalam `submit`). Hasil API identitas di-cache selama 10 menit yang sama. Saat menunggu login/CAPTCHA, navigasi berkala dihentikan agar tidak menghapus input pemilik; gunakan tombol pemeriksaan setelah selesai. Status siap berumur lebih dari 11 menit dianggap lama. Putusnya API identitas, akun berbeda, kuota tidak terbaca, CAPTCHA, atau layout berubah menghentikan jalur browser. Sesi dapat kedaluwarsa menurut Freelancer dan memerlukan login ulang.

## Pengiriman dan bukti

- ID proyek berasal dari proyek API tersimpan; hanya fixed price USD yang dipilih autopilot.
- Harga/durasi berasal dari kebijakan deterministik; proposal dari jalur Hermes/fallback yang ada.
- Driver membuka dashboard dan proyek, memeriksa identitas, kuota, ID proyek, penanda mata uang dan bentuk formulir. Masing-masing field harus ditemukan tepat sekali.
- Tidak ada opsi upgrade berbayar/perjanjian yang dicentang oleh worker. Opsi tambahan yang sudah terpilih menyebabkan penghentian.
- Kebijakan diperiksa sesudah drafting, sebelum klik, dan sekali lagi tepat sebelum melepas request POST. Semua request tulis lain dari halaman selama proses ditahan. Request bid harus cocok dengan project, bidder, harga, durasi, milestone dan proposal yang diotorisasi; request kedua diblokir.
- Sukses memerlukan HTTP 200, status success, ID bid numerik, project/bidder, harga dan durasi yang cocok. HTTP 200 tanpa bukti tersebut adalah hasil tidak pasti, bukan bid terkirim.
- Timeout, putus koneksi atau respons yang tidak dapat dipastikan tidak dicoba ulang otomatis. Claim/draf tetap mengunci proyek dengan pipeline `reconciliation_required`.
- `BID_LIMIT_EXCEEDED` tidak mengaktifkan fallback. Pemeriksaan website pada 17 Oktober juga menunjukkan 0 penawaran tersisa dari 100 pada profil harian pemilik. Worker menunggu jatah tersedia; tidak membeli paket atau mengubah keanggotaan.

Form live belum dapat diisi/diuji submit saat jatah akun nol. Driver mempunyai pemeriksaan ketat dan berhenti bila bentuk form tidak cocok. Verifikasi submit dilakukan pada fixture lokal yang meniru kontrak bid; ini bukan bukti bahwa bid production sudah dikirim.

## File dan pemeriksaan

- `browser-bid-page.ts`: driver DOM dan gate request; tidak menerima URL dari API pengguna.
- `browser-bidding.ts`: lifecycle, mode, status dan fallback.
- `browser-bidding-routes.ts`: GET status, PUT mode, POST open/check/close; Host/Origin/no-store tetap berlaku.
- `scripts/verify-browser-bidding.ts`: Chrome headless dengan context kosong, fixture localhost saja. Jalankan `pnpm --filter @fvh/server exec tsx ../../scripts/verify-browser-bidding.ts`.
- Tests: model/request/result matching, lifecycle, fallback, kontrol route dan guard autopilot. Delapan pemeriksaan Chrome fixture mencakup ID valid, pause, kuota nol, upgrade, request berubah, pembatalan pemeriksaan kebijakan yang terlambat, respons tanpa ID, serta disconnect CDP yang mempertahankan tab yang sudah ada.

Penambahan dependency tidak memperbarui versi Vitest. pnpm workspace secara eksplisit menolak install script Baileys rc14 dan protobufjs 7.6.6 yang sebelumnya dipasang dengan scripts diabaikan; paket rilis sudah menyertakan runtime. Tidak ada persetujuan massal skrip dependency. Frozen install dan audit produksi diperiksa kembali.

## Rujukan

- [Koneksi CDP dan noDefaults](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp)
- [Sambungan Chrome ke sesi aktif](https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session?hl=en)
- [Browser.close pada koneksi](https://playwright.dev/docs/api/class-browser#browser-close)
- [Peringatan penyimpanan sesi](https://playwright.dev/docs/auth)
- [Menunggu respons halaman](https://playwright.dev/docs/api/class-page#page-wait-for-response)
- [Bid dan kuota Freelancer](https://www.freelancer.com/faq/topic.php?id=5)
- [Kontrol install script pnpm](https://pnpm.io/settings/build#allowbuilds)
