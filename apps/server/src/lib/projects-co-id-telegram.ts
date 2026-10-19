import { parseProjectsCoIdHref, PROJECTS_CO_ID_ORIGIN } from '../models/projects-co-id-types.js';

/** projects.co.id's own public channel; the preview page needs no Telegram account or API token. */
export const PROJECTS_CO_ID_TELEGRAM_URL = 'https://t.me/s/lowongankerjafreelance';
const MIN_INTERVAL_MS = 60_000;
const MAX_BACKOFF_MS = 30 * 60_000;
const MAX_BYTES = 1_000_000;
const USER_AGENT = 'private-ai-house/1.0 (single-user local tool; reads this public channel preview at most once per minute)';

export type TelegramProjectPost = { id: string; slug: string; post: number; title: string; text: string; postedAt: string | null };
class TelegramReadError extends Error {}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function plain(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&(?:#(\d{1,7})|([a-z]{2,4}));/gi, (raw, code: string | undefined, name: string | undefined) => {
      const point = Number(code);
      return code ? (point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '') : ENTITIES[name!.toLowerCase()] ?? raw;
    }).trim();
}

/** Untrusted HTML: only links that pass the strict projects.co.id project-path check survive; everything else is ignored. */
export function parseTelegramChannel(html: string, origin = PROJECTS_CO_ID_ORIGIN): TelegramProjectPost[] {
  const found = new Map<string, TelegramProjectPost>();
  for (const part of html.split(/<div class="tgme_widget_message_wrap\b/).slice(1)) {
    const post = Number(part.match(/\bdata-post="lowongankerjafreelance\/(\d{1,12})"/)?.[1]);
    const body = part.match(/<div class="tgme_widget_message_text\b[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    if (!post || !body) continue;
    const time = new Date(part.match(/<time datetime="([^"]{1,40})"/)?.[1] ?? '');
    const text = plain(body).slice(0, 4000);
    for (const [, href, label] of body.matchAll(/<a\s[^>]*?\bhref="([^"]{1,2000})"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const link = parseProjectsCoIdHref(plain(href!), origin);
      if (link && !found.has(link.id)) found.set(link.id, { ...link, post, title: plain(label!).slice(0, 300), text, postedAt: Number.isFinite(time.getTime()) ? time.toISOString() : null });
    }
  }
  return [...found.values()].sort((a, b) => b.post - a.post);
}

async function readCapped(response: Response): Promise<string> {
  if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) throw new TelegramReadError('Halaman kanal melebihi batas ukuran.');
  const reader = response.body?.getReader();
  if (!reader) throw new TelegramReadError('Halaman kanal kosong.');
  const chunks: Uint8Array[] = []; let size = 0;
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    size += next.value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel().catch(() => undefined); throw new TelegramReadError('Halaman kanal melebihi batas ukuran.'); }
    chunks.push(next.value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Fixed URL, one request per minute at most; failures back off 2, 4, 8, 16 then 30 minutes. */
export class ProjectsCoIdTelegram {
  lastCheckedAt: string | null = null;
  ok: boolean | null = null;
  error: string | null = null;
  private nextAt = 0;
  private backoff = 0;
  constructor(private fetcher: typeof fetch = fetch, private now: () => number = Date.now) {}
  get nextCheckAt() { return this.nextAt ? new Date(this.nextAt).toISOString() : null; }
  /** Returns null when the rate limit or backoff window has not passed, or the read failed (see `error`). */
  async poll(origin = PROJECTS_CO_ID_ORIGIN): Promise<TelegramProjectPost[] | null> {
    const now = this.now();
    if (now < this.nextAt) return null;
    this.nextAt = now + MIN_INTERVAL_MS;
    this.lastCheckedAt = new Date(now).toISOString();
    try {
      const response = await this.fetcher(PROJECTS_CO_ID_TELEGRAM_URL, { redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { 'user-agent': USER_AGENT, accept: 'text/html' } });
      if (response.status !== 200) { await response.body?.cancel().catch(() => undefined); throw new TelegramReadError(`Kanal Telegram menjawab HTTP ${response.status}.`); }
      if (!/^text\/html\b/i.test(response.headers.get('content-type') ?? '')) throw new TelegramReadError('Kanal Telegram tidak mengembalikan HTML.');
      const html = await readCapped(response);
      if (!/\bdata-post="lowongankerjafreelance\/\d+"/.test(html)) throw new TelegramReadError('Struktur halaman kanal Telegram tidak dikenali.');
      this.ok = true; this.error = null; this.backoff = 0;
      return parseTelegramChannel(html, origin);
    } catch (error) {
      this.backoff = Math.min(this.backoff ? this.backoff * 2 : 2 * MIN_INTERVAL_MS, MAX_BACKOFF_MS);
      this.nextAt = now + this.backoff;
      this.ok = false;
      this.error = error instanceof TelegramReadError ? error.message : error instanceof Error && error.name === 'TimeoutError' ? 'Kanal Telegram tidak menjawab dalam 10 detik.' : 'Kanal Telegram tidak dapat dibaca.';
      return null;
    }
  }
}
