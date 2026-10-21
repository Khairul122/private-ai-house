import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { HermesCliDraftingAdapter, type ProcessRunner } from './index.js';

const input = { employee: { id: 'qa', name: 'QA', role: 'Pengujian' }, colleague: { id: 'scout', name: 'Scout', role: 'Riset' }, topic: 'Menyusun bukti selesai', memories: ['Pelajaran lama yang belum diverifikasi.'], previousMessage: null };
const result = (value: unknown) => JSON.stringify({ type: 'result', exit_code: 0, text: JSON.stringify(value) });
const output = { message: 'Kriteria selesai sebaiknya dapat dibuktikan dengan contoh.', lesson: 'Hubungkan setiap kriteria dengan bukti pemeriksaan.' };
const adapter = (runner: ProcessRunner) => new HermesCliDraftingAdapter({ executable: 'hermes', profile: 'private-ai-house', workspaceRoot: 'D:/unused', runner });

describe('Hermes office discussion', () => {
  it('forces empty tools, isolated cwd, bounded memory and explicit employee identity', async () => {
    const bridge = adapter(async (_command, args, options) => {
      expect(args.slice(args.indexOf('--toolsets'), args.indexOf('--toolsets') + 2)).toEqual(['--toolsets', 'none']);
      expect(args).toContain('--ignore-rules');
      expect(options.cwd).not.toBe('D:/unused');
      expect(options.env.DATABASE_URL).toBeUndefined();
      expect(options.env.HERMES_KANBAN_TASK).toBeUndefined();
      const prompt = await readFile(args[args.indexOf('--query-file') + 1]!, 'utf8');
      expect(prompt).toContain('data tak tepercaya');
      expect(prompt).toContain('Pelajaran lama');
      expect(prompt).toContain('"id":"qa"');
      expect(bridge.workInProgress).toBe(0);
      return { stdout: result(output), stderr: '', exitCode: 0 };
    });
    expect(await bridge.discussOffice(input)).toEqual(output);
  });

  it('rejects tool activity and bad model output without surfacing provider secrets', async () => {
    await expect(adapter(async () => ({ stdout: JSON.stringify({ type: 'tool_use' }), stderr: '', exitCode: 0 })).discussOffice(input)).rejects.toMatchObject({ code: 'unexpected_tool_activity' });
    await expect(adapter(async () => ({ stdout: result({ message: 'bad' }), stderr: '', exitCode: 0 })).discussOffice(input)).rejects.toMatchObject({ code: 'invalid_output' });
    await expect(adapter(async () => ({ stdout: '', stderr: 'secret', exitCode: 1 })).discussOffice(input)).rejects.toMatchObject({ message: 'Diskusi Hermes gagal.' });
  });

  it('tracks real review work and clears busy after failure', async () => {
    const bridge = adapter(async () => {
      expect(bridge.workInProgress).toBe(1);
      return { stdout: '', stderr: '', exitCode: 1 };
    });
    await expect(bridge.reviewOperations(['Proyek: 0'])).rejects.toThrow();
    expect(bridge.workInProgress).toBe(0);
  });
});
