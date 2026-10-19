import { describe, expect, it, vi } from 'vitest';
import { parseTelegramChannel, ProjectsCoIdTelegram, PROJECTS_CO_ID_TELEGRAM_URL } from './projects-co-id-telegram.js';

const confirm = `onclick="return confirm('Open this link?\\n\\n'+this.href);"`;
const post = (n: number, body: string, channel = 'lowongankerjafreelance') => `<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="${channel}/${n}" data-view="eyJjIjo">
  <div class="tgme_widget_message_bubble"><div class="tgme_widget_message_author accent_color"><a class="tgme_widget_message_owner_name" href="https://t.me/lowongankerjafreelance"><span dir="auto">Lowongan kerja freelance by Projects.co.id</span></a></div>
<div class="tgme_widget_message_text js-message_text" dir="auto">${body}</div>
<div class="tgme_widget_message_footer compact js-message_footer"><div class="tgme_widget_message_info short js-message_info"><span class="tgme_widget_message_meta"><a class="tgme_widget_message_date" href="https://t.me/lowongankerjafreelance/${n}"><time datetime="2026-10-19T15:39:11+00:00" class="time">15:39</time></a></span></div></div></div></div></div>`;
const project = (path: string, title: string) => `<a href="${path}" target="_blank" rel="noopener" ${confirm}><b>${title}</b></a><br/><br/><b>Budget:</b> Rp 1,000,000 - 2,000,000<br/><b>Project Owner:</b> <a href="https://projects.co.id/public/browse_users/view/8fc663/owner" target="_blank">owner</a><br/><br/>Butuh chatbot AI &amp; integrasi API.<br/><br/><a href="?q=%23ai">#ai</a>`;
const CHANNEL_HTML = `<!DOCTYPE html><html><body><main><section class="tgme_channel_history js-message_history">
${post(65608, project('https://projects.co.id/public/browse_projects/view/94601d/mencari-iot-developer', 'MENCARI IOT DEVELOPER'))}
${post(65609, project('https://projects.co.id/public/browse_projects/view/a1601d/chatbot-ai', 'CHATBOT AI &amp; API') + ' <a href="https://projects.co.id/user/my_projects/view/69551d/chatbot-ai#">x</a>')}
${post(65610, [
  'https://evil.test/public/browse_projects/view/b1601d/x', 'http://projects.co.id/public/browse_projects/view/b2601d/x', 'https://projects.co.id.evil.test/public/browse_projects/view/b3601d/x',
  'https://projects.co.id@evil.test/public/browse_projects/view/b4601d/x', 'https://user:pw@projects.co.id/public/browse_projects/view/b5601d/x', 'https://projects.co.id/public/browse_projects/view/b6601d/x?ref=1',
  'https://projects.co.id/public/browse_projects/view/B7601D/x', 'https://projects.co.id/public/browse_projects/view/b8601d0/x', 'https://projects.co.id/public/browse_projects/view/b9601d/..%2F..%2Fuser',
  'https://projects.co.id/public/browse_projects/view/ba601d/', 'javascript:alert(1)', 'https://projects.co.id/public/browse_projects/view/bb601d/a/b', 'https://projects.co.id/public/browse_projects/listing?search=x',
].map(href => `<a href="${href}">bad</a>`).join(' '))}
${post(65611, project('https://projects.co.id/public/browse_projects/view/c1601d/other-channel', 'X'), 'someone_else')}
</section></main></body></html>`;

const html = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, ...init });

describe('projects.co.id Telegram channel preview', () => {
  it('keeps only strict projects.co.id project links, newest post first, and ignores every other link', () => {
    const posts = parseTelegramChannel(CHANNEL_HTML);
    expect(posts.map(p => [p.id, p.slug, p.post])).toEqual([['projects_co_id:a1601d', 'chatbot-ai', 65609], ['projects_co_id:94601d', 'mencari-iot-developer', 65608]]);
    expect(posts[0]).toMatchObject({ title: 'CHATBOT AI & API', postedAt: '2026-10-19T15:39:11.000Z' });
    expect(posts[0]!.text).toContain('Butuh chatbot AI & integrasi API.');
    expect(parseTelegramChannel('<html>no posts</html>')).toEqual([]);
  });

  it('requests the fixed URL at most once per minute with an honest user agent', async () => {
    let clock = 0;
    const fetcher = vi.fn(async () => html(CHANNEL_HTML));
    const telegram = new ProjectsCoIdTelegram(fetcher as unknown as typeof fetch, () => clock);
    expect(await telegram.poll()).toHaveLength(2);
    clock = 59_999; expect(await telegram.poll()).toBeNull();
    clock = 60_000; expect(await telegram.poll()).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(PROJECTS_CO_ID_TELEGRAM_URL);
    expect(init).toMatchObject({ redirect: 'error', headers: { 'user-agent': expect.stringMatching(/^private-ai-house\//) } });
    expect(telegram).toMatchObject({ ok: true, error: null });
  });

  it('backs off 2, 4, 8, 16 then 30 minutes on 429/non-200 and resets after success', async () => {
    let clock = 0;
    let status = 429;
    const fetcher = vi.fn(async () => status === 200 ? html(CHANNEL_HTML) : new Response('slow down', { status }));
    const telegram = new ProjectsCoIdTelegram(fetcher as unknown as typeof fetch, () => clock);
    const waits: number[] = [];
    for (let i = 0; i < 6; i++) {
      expect(await telegram.poll()).toBeNull();
      const next = Date.parse(telegram.nextCheckAt!);
      waits.push((next - clock) / 60_000);
      clock = next - 1; expect(await telegram.poll()).toBeNull();
      clock = next;
      if (i === 2) status = 503;
    }
    expect(waits).toEqual([2, 4, 8, 16, 30, 30]);
    expect(telegram).toMatchObject({ ok: false, error: 'Kanal Telegram menjawab HTTP 503.' });
    expect(fetcher).toHaveBeenCalledTimes(6);
    status = 200; expect(await telegram.poll()).toHaveLength(2);
    status = 429; await telegram.poll(); expect(await telegram.poll()).toBeNull();
    clock += 60_000; await telegram.poll();
    expect((Date.parse(telegram.nextCheckAt!) - clock) / 60_000).toBe(2);
  });

  it('rejects oversized, non-HTML, unrecognised and timed-out responses without exposing details', async () => {
    let clock = 0;
    const cases: [() => Promise<Response>, RegExp][] = [
      [async () => html('x', { headers: { 'content-type': 'text/html', 'content-length': '5000000' } }), /batas ukuran/],
      [async () => html('<div class="tgme_widget_message_wrap">' + 'a'.repeat(1_100_000)), /batas ukuran/],
      [async () => html('{}', { headers: { 'content-type': 'application/json' } }), /tidak mengembalikan HTML/],
      [async () => html('<html>login</html>'), /Struktur/],
      [async () => { throw new DOMException('aborted', 'TimeoutError'); }, /10 detik/],
      [async () => { throw new TypeError('fetch failed: secret-looking detail'); }, /^Kanal Telegram tidak dapat dibaca\.$/],
    ];
    for (const [respond, message] of cases) {
      const telegram = new ProjectsCoIdTelegram(respond as unknown as typeof fetch, () => clock);
      expect(await telegram.poll()).toBeNull();
      expect(telegram.ok).toBe(false); expect(telegram.error).toMatch(message);
      clock += 1;
    }
  });
});
