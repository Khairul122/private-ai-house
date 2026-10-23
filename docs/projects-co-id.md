# projects.co.id: data lokal dan aksi pemilik

Pemindaian Chrome, Telegram, CDP, dan Playwright sudah dihapus. Aplikasi tidak lagi membaca listing atau akun projects.co.id.

Yang tetap tersedia:

- proyek projects.co.id yang sudah tersimpan;
- pembuatan draf lokal dari data tersimpan, dengan harga IDR deterministik dan fallback template;
- edit, salin, buka tautan, lewati, tandai terkirim, dan tandai menang oleh pemilik;
- proyek aktif dari aksi “Saya menang”.

Route kontrol pemindaian (`/open`, `/check`, `/close`, `/scan`, dan `PUT /mode`) mengembalikan HTTP `410` dengan alasan eksplisit. Status worker selalu `autoAvailable: false`; tidak ada status siap palsu.

Aksi pemilik tetap memerlukan konfirmasi `confirm: true`. “Ditandai terkirim oleh Anda” bukan bukti pengiriman yang diverifikasi aplikasi dan tidak masuk `bid_results` atau hitungan bid Freelancer.
