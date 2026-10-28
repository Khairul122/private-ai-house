# Kontrak Desain Responsive, Safe Area, Target Sentuh, dan Token Stacking (TASK-016)

## 1. Tujuan & Latar Belakang
Menjadikan perilaku tata letak responsive deterministik, konsisten, dan mudah diprediksi di seluruh ukuran viewport target aplikasi Mission Control (desktop, tablet, mobile portrait, compact mobile, ultra-compact, dan compact landscape). Kontrak ini memastikan seluruh token terstandarisasi, dapat digunakan langsung oleh komponen web tanpa token tumpang tindih, dan memenuhi kriteria aksesibilitas sentuh serta safe area perangkat modern.

---

## 2. Kontrak Breakpoint Lebar (Width Modes)

Resolver viewport mengklasifikasikan lebar layar ke dalam 5 mode deterministik:

| Mode | Rentang Lebar (px) | Token CSS | Query Media CSS | Perilaku Antarmuka |
|---|---|---|---|---|
| **`desktop`** | `> 1100px` | `--bp-desktop: 1101px;` | `@media (min-width: 1101px)` | Stage 3D penuh, sidebar/topbar/HUD lengkap, minimap aktif, dock melayang di tengah bawah. |
| **`tablet`** | `761px – 1100px` | `--bp-tablet: 1100px;` | `@media (max-width: 1100px)` | Minimap disembunyikan otomatis, bilah pencarian menyusut (200px), dock menyesuaikan lebar viewport. |
| **`mobile`** | `421px – 760px` | `--bp-mobile: 760px;` | `@media (max-width: 760px)` | HUD/rail beralih ke tata letak vertikal, drawer menjadi layar penuh (`width: 100%`, `height: 100dvh`), dock membentang di bawah. |
| **`compact-mobile`** | `361px – 420px` | `--bp-compact: 420px;` | `@media (max-width: 420px)` | Header kartu membungkus aksi (wrap), padding kompak, tombol mempertahankan target sentuh 44px. |
| **`ultra-compact`** | `≤ 360px` | `--bp-ultra-compact: 360px;` | `@media (max-width: 360px)` | Grid metrik satu kolom, padding tepi 8–10px, elemen non-esensial diringkas. |

---

## 3. Kontrak Tinggi & Orientasi Viewport

Selain lebar, tinggi viewport dipantau untuk mencegah pemotongan vertikal pada perangkat pendek atau saat keyboard virtual aktif:

| Mode Tinggi | Rentang Tinggi (px) | Token CSS | Query Media CSS | Perilaku Antarmuka |
|---|---|---|---|---|
| **`tall`** | `> 720px` | — | `@media (min-height: 721px)` | Tata letak vertikal standar. |
| **`short`** | `601px – 720px` | `--bp-height-short: 720px;` | `@media (max-height: 720px)` | Roster rail membatasi tinggi maksimum (150px) dengan scrolling mandiri, minimap disembunyikan. |
| **`compact-height`** | `≤ 600px` | `--bp-height-compact: 600px;` | `@media (max-height: 600px)` | Panel drawer menyesuaikan tinggi maksimum ke `calc(100dvh - 120px)`, padding kartu diringkas. |
| **`compact-landscape`** | Orientasi landscape & `height ≤ 450px` | `--bp-landscape-height: 450px;` | `@media (orientation: landscape) and (max-height: 450px)` | Tools header dan dock dibuat ramping di tepi atas/bawah, search wrap disembunyikan, drawer memakai `100dvh` dengan scroll penuh. |

---

## 4. Kontrak Unit Viewport (`100dvh`)

Untuk mengatasi masalah address bar browser mobile yang dinamis (seperti Safari iOS dan Chrome Android yang memicu overflow bila memakai `100vh`), ditetapkan:
- Token: `--app-height: 100dvh;`
- Fallback CSS:
  ```css
  body {
    min-height: 100vh;
    min-height: var(--app-height, 100dvh);
  }
  .vo3d-app {
    height: 100vh;
    height: var(--app-height, 100dvh);
  }
  ```

---

## 5. Kontrak Safe Area (Notch & Home Indicator)

Perangkat dengan notch, pulau dinamis, atau home bar layar sentuh memerlukan padding safe-area otomatis:

```css
--safe-area-top: env(safe-area-inset-top, 0px);
--safe-area-right: env(safe-area-inset-right, 0px);
--safe-area-bottom: env(safe-area-inset-bottom, 0px);
--safe-area-left: env(safe-area-inset-left, 0px);
```

Penggunaan pada elemen mengambang:
- **Tools / Header:** `top: max(16px, var(--safe-area-top)); right: max(16px, var(--safe-area-right));`
- **Dock Bawah:** `bottom: max(16px, calc(var(--safe-area-bottom) + 8px));`
- **Left Rail / HUD:** `left: max(16px, var(--safe-area-left)); top: max(16px, var(--safe-area-top));`
- **Drawer / Sheet Body:** `padding-bottom: max(32px, var(--safe-area-bottom));`

---

## 6. Target Sentuh & Spacing Interaksi

Mengikuti standar aksesibilitas WCAG 2.2 Level AA dan aturan antislop:
- **Target Sentuh Minimum:** `44px` (`--touch-target-min: 44px;`)
  - Berlaku pada seluruh tombol interaktif (`button`), ikon kontrol (`.vo3d-icon`, `.vo3d-seg button`), navigasi dock (`.vo3d-dock button`), kill switch (`.vo3d-kill`), dan tautan navigasi.
- **Jarak Antar Target (Gap Minimum):** `8px` (`--touch-target-gap: 8px;`)
  - Mencegah salah sentuh thumb/jari pada layar sentuh.

---

## 7. Kontrak Stacking Order (Z-Index Tokens)

Seluruh lapisan visual disusun secara deterministik dan terpusat dalam token stacking CSS:

| Token CSS | Nilai | Lapisan / Komponen | Keterangan |
|---|---|---|---|
| `--z-canvas` | `0` | `.vo3d-canvas` | Kanvas 3D WebGL Three.js di lantai dasar. |
| `--z-underlay` | `1` | `.vo3d-app` | Wadah aplikasi kantor 3D. |
| `--z-hud` | `10` | `.vo3d-float`, `.vo3d-left-rail`, status kartu | Elemen HUD status tim, jam, dan kartu informasi. |
| `--z-dock` | `20` | `.vo3d-dock` | Bilah navigasi ruangan di bagian bawah layar. |
| `--z-controls` | `30` | `.vo3d-tools`, `.vo3d-seg` | Kontrol tampilan kamera, pencarian, dan tombol alat. |
| `--z-backdrop` | `40` | `.vo3d-sheet-backdrop`, `.vo3d-tablet-backdrop` | Lapisan peredup latar saat modal/kartu terbuka. |
| `--z-sheet` | `50` | `.vo3d-panel`, `.vo3d-sheet`, `.vo3d-tablet` | Panel geser samping dan kartu tablet modul. |
| `--z-modal` | `60` | Dialog konfirmasi modal | Dialog modal interaktif. |
| `--z-kill-switch` | `70` | `.vo3d-kill` | Tombol darurat "Jeda automasi" (selalu di atas drawer). |
| `--z-toast` / `--z-popover` | `80` | `.vo3d-toast`, `.sheet-navigation nav`, `.vo3d-search-results` | Notifikasi toast dan dropdown navigasi/pencarian. |
| `--z-tooltip` | `90` | Tooltip petunjuk konteks | Petunjuk hover/focus paling atas. |

---

## 8. TypeScript Resolver Helper

Tersedia di `apps/web/src/state/responsive.ts`:
```ts
import { resolveViewport, useResolvedViewport } from '../state/responsive.js';

// Penggunaan deterministik:
const viewport = resolveViewport(window.innerWidth, window.innerHeight);
console.log(viewport.widthMode); // 'desktop' | 'tablet' | 'mobile' | 'compact-mobile' | 'ultra-compact'
console.log(viewport.isCompactLandscape); // boolean
console.log(viewport.isTouchFirst); // boolean
```

---

## 9. Matriks Pengujian QA (QA Viewport Matrix)

| Skenario Uji | Dimensi Target (L x T px) | Kategori Viewport | Fitur Kritis yang Diverifikasi |
|---|---|---|---|
| Desktop 1080p | `1920 x 1080` | Desktop Tall | Tampilan 3D penuh, HUD kiri, minimap aktif, dock melayang tengah. |
| Desktop Standar | `1440 x 900` | Desktop Tall | Skala standar, jarak kontrol normal, kartu drawer maksimum 520px. |
| Tablet Landscape | `1100 x 800` | Tablet Tall Boundary | Batas atas mode tablet, minimap tersembunyi, search mengecil. |
| Tablet Portrait | `834 x 1112` | Tablet Tall | Bilah tools wrap bila perlu, drawer adaptif. |
| Mobile Boundary | `760 x 800` | Mobile Tall Boundary | Drawer `100%` lebar, HUD terkonversi, dock membentang di bawah. |
| Mobile Standar | `390 x 844` | Compact-Mobile Tall | Safe-area inset aktif, notch terlindungi, target sentuh 44px. |
| Ultra-Compact | `360 x 640` | Ultra-Compact Short | Roster scrolling mandiri, metrik 1 kolom, tidak ada horizontal scroll leak. |
| Compact Landscape | `844 x 390` | Tablet Compact-Height Landscape | Flag `isCompactLandscape: true`, drawer memakai `100dvh` tanpa terpotong vertikal. |
| Compact Height | `1024 x 500` | Tablet Compact-Height | Panel tidak melebihi `calc(100dvh - 120px)`. |
