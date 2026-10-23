# projects.co.id: data lokal dan aksi pemilik

Pemindaian listing projects.co.id aktif melalui HTTP GET read-only. Aplikasi tidak login lewat Chrome, tidak memakai CDP/Playwright, dan tidak mengirim penawaran.

Yang tetap tersedia:

- proyek projects.co.id yang sudah tersimpan;
- pembuatan draf lokal dari data tersimpan, dengan harga IDR deterministik dan fallback template;
- edit, salin, buka tautan, lewati, tandai terkirim, dan tandai menang oleh pemilik;
- proyek aktif dari aksi “Saya menang”.

Route `/scan` membaca listing lewat GET dan menyimpan proyek valid. Route `/open`, `/check`, dan `/close` tetap HTTP `410`; `PUT /mode` hanya mengubah `off` atau `scan-only`. Mode draf otomatis tidak tersedia. Status worker tetap `autoAvailable: false`; tidak ada submit otomatis.

Aksi pemilik tetap memerlukan konfirmasi `confirm: true`. “Ditandai terkirim oleh Anda” bukan bukti pengiriman yang diverifikasi aplikasi dan tidak masuk `bid_results` atau hitungan bid Freelancer.
