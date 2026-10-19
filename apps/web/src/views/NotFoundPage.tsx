import { Link } from 'react-router';

export default function NotFoundPage() {
  return <div className="not-found empty-state"><p className="eyebrow">Halaman tidak ditemukan</p><h1>Kartu ini tidak tersedia</h1><p>Tautan mungkin sudah berubah. Kembali ke kantor untuk memilih papan atau buka ringkasan bisnis.</p><div className="card-toolbar"><Link className="button button-primary" to="/">Kembali ke kantor</Link><Link className="button button-secondary" to="/overview">Buka ringkasan</Link></div></div>;
}
