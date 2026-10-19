import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ClientWhatsAppCard from './ClientWhatsAppCard.js';
import { normalizeWhatsAppPhone, saveClientCommunication, type CommunicationInput } from './client-communication.js';
import type { ClientProject } from './api.js';

const input: CommunicationInput = { projectId: '', newProject: { title: 'Proyek uji', client: 'Klien uji', source: 'direct', currency: 'IDR' }, phone: '081234567890', enabled: false, progress: true, payments: true, reminders: true };
const project: ClientProject = { id: 'project-test', ...input.newProject, externalProjectId: null, status: 'active', deadline: null, value: null, createdAt: '2026-10-16T00:00:00Z', daysToDeadline: null };
afterEach(() => vi.unstubAllGlobals());
describe('Client WhatsApp form', () => {
  it('shows a phone and registration fields before there are any projects', () => {
    const html = renderToStaticMarkup(<ClientWhatsAppCard projects={[]} clients={[]} refresh={async () => undefined}/>);
    expect(html).toContain('Nomor WhatsApp klien'); expect(html).toContain('type="tel"'); expect(html).toContain('Nama klien'); expect(html).toContain('Nama proyek');
    expect(html).not.toContain('disabled');
  });
  it('normalizes Indonesian and international input and rejects invalid numbers', () => {
    expect(normalizeWhatsAppPhone('0812-3456-7890')).toBe('6281234567890');
    expect(normalizeWhatsAppPhone('+1 (202) 555-0123')).toBe('12025550123');
    expect(() => normalizeWhatsAppPhone('abc123')).toThrow();
  });
  it('validates the number before creating any project', async () => {
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    await expect(saveClientCommunication({ ...input, phone: 'bad' }, () => undefined)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it('creates a project then saves its phone with automation disabled by default', async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(project), { status: 201 })).mockResolvedValueOnce(new Response('{}'));
    vi.stubGlobal('fetch', request); const created = vi.fn();
    expect(await saveClientCommunication(input, created)).toBe(project.id); expect(created).toHaveBeenCalledWith(project);
    expect(request.mock.calls[1]?.[0]).toBe('/api/operations/clients');
    expect(JSON.parse(request.mock.calls[1]?.[1].body)).toMatchObject({ projectId: project.id, phone: '6281234567890', enabled: false });
  });
  it('retains the created ID on partial failure so retry only saves the phone', async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(project), { status: 201 })).mockResolvedValueOnce(new Response('{"error":"Storage unavailable"}', { status: 503 })).mockResolvedValueOnce(new Response('{}'));
    vi.stubGlobal('fetch', request); let selected = '';
    await expect(saveClientCommunication(input, p => { selected = p.id; })).rejects.toThrow('Storage unavailable');
    expect(selected).toBe(project.id);
    await saveClientCommunication({ ...input, projectId: selected }, () => { throw new Error('Must not create duplicate'); });
    expect(request.mock.calls.map(call => call[0])).toEqual(['/api/work/projects', '/api/operations/clients', '/api/operations/clients']);
  });
});
