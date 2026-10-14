import { createHash } from 'node:crypto';

const MAX_FILE_BYTES = 100_000;
const MAX_CHUNK_CHARS = 1_200;
const blockedPathParts = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', 'coverage', '.next', '.turbo']);
const blockedNames = /^(?:\.env(?:\..*)?|id_rsa|id_ed25519|credentials(?:\..*)?|secrets?(?:\..*)?)$/i;
const blockedExtensions = new Set(['.pem', '.key', '.p12', '.pfx', '.der', '.exe', '.dll', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.zip', '.sqlite', '.db', '.wasm']);
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bgh[pousr]_[A-Za-z0-9_]{25,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?[A-Za-z0-9/_+=.-]{16,}/i,
];

export type KnowledgeProvider = 'github' | 'linkedin' | 'manual';
export type KnowledgeChunk = {
  id: string;
  sourceId: string;
  provider: KnowledgeProvider;
  label: string;
  path: string;
  sourceRef: string;
  url: string;
  updatedAt: string;
  contentHash: string;
  content: string;
};
export type KnowledgeFileInput = {
  sourceId: string;
  provider: KnowledgeProvider;
  label: string;
  referenceUrl: string;
  sourceRef: string;
  updatedAt: string;
  path: string;
  content: string;
};
export type KnowledgeResult = { ok: true; chunks: KnowledgeChunk[] } | { ok: false; code: string; reason: string };

export function isEligibleKnowledgePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '');
  const pieces = normalized.split('/');
  const fileName = pieces.at(-1) ?? '';
  const extension = /\.[^.]+$/.exec(fileName)?.[0]?.toLowerCase() ?? '';
  return !(normalized.startsWith('/') || pieces.some((piece) => piece === '..' || blockedPathParts.has(piece.toLowerCase())) || blockedNames.test(fileName) || blockedExtensions.has(extension));
}

function splitContent(content: string): string[] {
  const blocks = content.replace(/\r\n/g, '\n').split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (current && current.length + trimmed.length + 2 > MAX_CHUNK_CHARS) {
      chunks.push(current);
      current = '';
    }
    if (trimmed.length > MAX_CHUNK_CHARS) {
      for (let offset = 0; offset < trimmed.length; offset += MAX_CHUNK_CHARS) chunks.push(trimmed.slice(offset, offset + MAX_CHUNK_CHARS));
    } else {
      current = current ? `${current}\n\n${trimmed}` : trimmed;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function prepareKnowledgeFile(input: KnowledgeFileInput): KnowledgeResult {
  if (!isEligibleKnowledgePath(input.path)) return { ok: false, code: 'excluded_path', reason: 'File berada di luar cakupan indeks teks yang diizinkan.' };
  const bytes = Buffer.byteLength(input.content, 'utf8');
  if (bytes > MAX_FILE_BYTES) return { ok: false, code: 'file_too_large', reason: 'File melebihi batas ukuran indeks.' };
  if (input.content.includes('\u0000')) return { ok: false, code: 'binary_content', reason: 'Konten biner tidak diindeks.' };
  if (secretPatterns.some((pattern) => pattern.test(input.content))) return { ok: false, code: 'secret_detected', reason: 'Konten dikecualikan karena pola kredensial terdeteksi.' };

  const normalizedPath = input.path.replaceAll('\\', '/').replace(/^\.\//, '');
  const baseUrl = input.referenceUrl ? input.referenceUrl.replace(/\/$/, '') : `local://knowledge/${encodeURIComponent(input.sourceId)}`;
  const contentParts = splitContent(input.content);
  const chunks = contentParts.map((content, index): KnowledgeChunk => {
    const contentHash = createHash('sha256').update(content).digest('hex');
    const identity = `${input.sourceId}\u0000${normalizedPath}\u0000${input.sourceRef}\u0000${index}\u0000${contentHash}`;
    return {
      id: createHash('sha256').update(identity).digest('hex'),
      sourceId: input.sourceId,
      provider: input.provider,
      label: input.label,
      path: normalizedPath,
      sourceRef: input.sourceRef,
      url: `${baseUrl}#${encodeURI(normalizedPath)}`,
      updatedAt: input.updatedAt,
      contentHash,
      content,
    };
  });
  return { ok: true, chunks };
}

export function safeFtsQuery(query: string): string {
  return [...new Set(query.toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) ?? [])]
    .slice(0, 12)
    .map((term) => `"${term.replaceAll('"', '""')}"*`)
    .join(' OR ');
}
