# Bid melalui browser — 17 Oktober 2026

## Tujuan dan batas

Pemilik meminta melanjutkan implementasi pengiriman bid otomatis melalui Playwright/Chrome. Pada 17 Oktober pemilik menegaskan agar memakai Chrome berprofil yang sudah login. Worker tersambung ke Chrome aktif dengan izin debugging, membuat tab sendiri, memakai proposal Hermes dan harga/durasi deterministik dari autopilot. Tidak ada launch profil kosong atau salinan profil. Login, OTP, CAPTCHA dan izin Chrome tetap dilakukan pemilik.

## Jalur dan bukti

- Mode API, browser, atau fallback API → browser disimpan sebagai pengaturan transport, terpisah dari kebijakan.
- Fallback hanya sesudah penolakan API yang pasti (401/403/429). Kuota akun `BID_LIMIT_EXCEEDED`, timeout, HTTP 5xx, dan hasil tidak diketahui tidak dicoba ulang lewat browser.
- Browser memverifikasi akun yang sama dengan pembacaan API, proyek numerik, mata uang USD, jumlah, durasi, proposal, tanpa upgrade berbayar. Periksa kebijakan dan kuota lokal tepat sebelum klik terakhir.
- Tombol submit hanya diklik sekali. Hasil sukses memerlukan respons penempatan bid HTTP 200 dengan ID bid dan project/bidder yang sesuai; data tidak cocok/timeout ditahan untuk rekonsiliasi. Pipeline dan hitungan bid memakai audit bersama.
- Status melaporkan mode, proses browser, login yang benar-benar teramati, aktivitas, hasil terakhir dan waktu pemeriksaan. Tidak ada klaim siap dari cookie tersimpan saja.

## Keamanan

Server route hanya menerima kontrol tetap (sambungkan, periksa, lepas, ganti mode), bukan URL, selector, skrip, kredensial atau payload bid bebas. Hook loopback/Host/Origin dan no-store tetap berlaku. Worker mengunjungi URL Freelancer yang dibangun dari ID proyek tersimpan; prompt/proyek bukan instruksi controller. Tidak ada dump cookie, token, localStorage, trace, atau isi profil. Izin debugging Chrome harus diberikan pemilik; tidak diaktifkan otomatis oleh aplikasi.

## Urutan kerja

- [x] Kontrak transport dan hasil, dependency Playwright, driver halaman dan tes
- [x] Service sambungan sesi Chrome/status, integrasi transport autopilot dengan guard sebelum klik
- [x] Kontrol UI, operator kantor dengan sinyal nyata dan tempat kerja
- [x] Uji browser pada fixture lokal tanpa kirim bid nyata; lint, typecheck, seluruh tes, build
- [x] Pemilik mengizinkan debugging Chrome berprofilnya; verifikasi akun dan kuota tanpa submit uji nyata

Sambungan nyata berhasil 17 Oktober 2026 pukul 10.02 WIB: akun browser `khairulhuda01` cocok dengan API, dashboard HTTP 200, sisa bid 0. Mode tersimpan `api-fallback`; Chrome pemilik tetap terbuka. Bukti UI: `.local/browser-bid-profile-connected.png`. Submit production belum dilakukan karena kuota nol.

## Verifikasi

`pnpm exec eslint .`, `pnpm -r typecheck`, `pnpm test`, `pnpm --filter @fvh/web build` berhasil. Suite penuh: 215 eksekusi tes (214 unik; smoke diulang). Delapan pemeriksaan Chrome localhost berhasil, termasuk disconnect yang mempertahankan tab lama dan pembatalan otorisasi terlambat. UI desktop serta mobile tanpa overflow; tombol mobile 44 px. Build sempat gagal karena memori saat dijalankan bersamaan dengan Chrome dan seluruh tes; pengulangan berhasil. Form bid production belum terverifikasi karena kuota akun nol. UI mengikuti DESIGN.md dan pilihan antislop selama pengerjaan; status memakai teks dan waktu bukti, tidak ada aset baru.

## Sumber

- https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context
- https://playwright.dev/docs/api/class-page#page-wait-for-response
- https://playwright.dev/docs/api/class-locator#locator-get-by-label
- https://playwright.dev/docs/auth
- https://www.freelancer.com/faq/topic.php?id=5
