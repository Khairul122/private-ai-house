import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscordKanbanMonitor, type DiscordConfig } from './discord-kanban.js';

const config: DiscordConfig = { token: 'token', guildId: '1', applicationId: '9' };
const guildChannels = [
  { id: 'cat', name: 'mission-control', type: 4 },
  { id: 'cal', name: 'kalender', type: 0, parent_id: 'cat' },
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function pathOf(input: string | URL | Request): string {
  if (typeof input === 'string') return new URL(input).pathname;
  if (input instanceof URL) return input.pathname;
  return new URL(input.url).pathname;
}

// Siklus yang berhasil menyentuh Discord tiga kali: daftar kanal (kategori + kanal kalender) dan pesan.
function healthyFetcher() {
  return vi.fn((input: string | URL | Request) => {
    const path = pathOf(input);
    if (path.endsWith('/guilds/1/channels')) return Promise.resolve(json(guildChannels));
    if (path.endsWith('/channels/cal/messages')) return Promise.resolve(json([]));
    return Promise.resolve(json({ message: 'rute tidak dikenal' }, 404));
  });
}

function monitorWith(fetcher: unknown): DiscordKanbanMonitor {
  return new DiscordKanbanMonitor(config, undefined, async () => [], fetcher as typeof fetch);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DiscordKanbanMonitor', () => {
  it('backs off after a failed cycle and logs one line per distinct failure', async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetcher = vi.fn((input: string | URL | Request) => {
      void input;
      return Promise.reject(new Error('jaringan putus'));
    });
    const monitor = monitorWith(fetcher);

    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]![0])).toContain('jaringan putus');

    // Kegagalan kedua masih memakai jeda normal 30 detik dan tidak menulis baris log baru.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(1);

    // Kegagalan kedua memperpanjang jeda berikutnya menjadi 2 menit.
    await vi.advanceTimersByTimeAsync(119_999);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(3);

    // Kegagalan ketiga memperpanjang jeda menjadi 5 menit.
    await vi.advanceTimersByTimeAsync(299_999);
    expect(fetcher).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(error).toHaveBeenCalledTimes(1);

    // stop() mematikan penjadwalan: tidak ada permintaan baru setelahnya.
    monitor.stop();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('returns to the 30-second cadence and logs recovery once after a success', async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    let healthy = false;
    const healthyCycle = healthyFetcher();
    const fetcher = vi.fn((input: string | URL | Request) => (healthy ? healthyCycle(input) : Promise.reject(new Error('jaringan putus'))));
    const monitor = monitorWith(fetcher);

    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(error).toHaveBeenCalledTimes(1);

    healthy = true;
    const before = fetcher.mock.calls.length;
    await vi.advanceTimersByTimeAsync(299_999);
    expect(fetcher).toHaveBeenCalledTimes(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(before + 3);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]![0])).toContain('pulih');

    // Setelah pulih, cadence kembali 30 detik dan tidak ada baris log tambahan.
    const afterRecovery = fetcher.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetcher).toHaveBeenCalledTimes(afterRecovery + 3);
    expect(log).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    monitor.stop();
  });

  it('retries a 429 twice and then reports the rate limit once', async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetcher = vi.fn((input: string | URL | Request) => {
      void input;
      return Promise.resolve(new Response('{}', { status: 429, headers: { 'retry-after': '1' } }));
    });
    const monitor = monitorWith(fetcher);

    const done = monitor.sync();
    await vi.runAllTimersAsync();
    await done;

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]![0])).toContain('Discord API 429');
  });
});
