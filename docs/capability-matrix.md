# Capability matrix

| Kapabilitas | Status | Batas |
|---|---|---|
| Freelancer API read | Didukung | Kredensial tetap di server; data hanya dari API resmi. |
| Freelancer API bid | Didukung | Policy engine, kill switch, kuota, idempotensi, dan audit wajib. |
| projects.co.id HTTP GET read-only | Didukung | Membaca listing dan menyimpan peluang; tidak login lewat browser, tidak memakai CDP/Playwright, tidak mengirim penawaran. |
| projects.co.id stored data and owner actions | Didukung | Draf lokal dan penandaan pemilik tetap tersedia; penawaran tetap dikirim manual oleh pemilik. |
| Hermes drafting | Konfigurasi tersimpan | Draf tervalidasi; fallback template bila Hermes gagal. |
| Knowledge Hub | Didukung | Sumber dibaca dan divalidasi sebelum indeks. |
