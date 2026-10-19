import type { FastifyReply, FastifyRequest } from 'fastify';
import { allowedDevOrigins, type AppContext } from './shared.js';

export function linkedinController({ options }: AppContext) {
  return {
    connect: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!options.linkedinOAuth) return reply.code(503).send({ error: 'Alur OAuth LinkedIn belum tersedia di server ini.' });
      const origin = request.headers.origin;
      const returnOrigin = origin && allowedDevOrigins.has(origin) ? origin : `http://127.0.0.1:${Number.parseInt(process.env.FVH_PORT ?? '3001', 10)}`;
      try {
        return await options.linkedinOAuth.start(`${returnOrigin}/capabilities`);
      } catch {
        return reply.code(409).send({ error: 'OAuth LinkedIn tidak dapat dimulai. Periksa kredensial aplikasi dan pastikan tidak ada alur otorisasi lain yang sedang berjalan.' });
      }
    },

    callback: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!options.linkedinOAuth) return reply.code(503).send({ error: 'Alur OAuth LinkedIn belum tersedia di server ini.' });
      const query = request.query as Record<string, unknown>;
      const result = await options.linkedinOAuth.handleCallback({
        ...(typeof query.state === 'string' ? { state: query.state } : {}),
        ...(typeof query.code === 'string' ? { code: query.code } : {}),
        ...(typeof query.error === 'string' ? { error: query.error } : {}),
      });
      const destination = new URL(result.returnUrl);
      destination.searchParams.set('linkedin', result.statusCode === 200 ? 'connected' : 'error');
      return reply
        .code(303)
        .header('Cache-Control', 'no-store')
        .header('Referrer-Policy', 'no-referrer')
        .redirect(destination.toString());
    },

    sync: async (_request: FastifyRequest, reply: FastifyReply) => {
      if (!options.syncLinkedIn) return reply.code(503).send({ error: 'Sinkronisasi LinkedIn API belum tersedia.' });
      try {
        return { synced: true, ...(await options.syncLinkedIn()) };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'LinkedIn API tidak dapat dibaca.';
        return reply.code(502).send({ error: message });
      }
    },

    disconnect: async (_request: FastifyRequest, reply: FastifyReply) => {
      if (!options.disconnectLinkedIn) return reply.code(503).send({ error: 'Pemutusan LinkedIn belum tersedia di server ini.' });
      try {
        await options.disconnectLinkedIn();
        return { disconnected: true };
      } catch {
        return reply.code(500).send({ error: 'Token LinkedIn tidak dapat dihapus dari secure store.' });
      }
    },
  };
}
