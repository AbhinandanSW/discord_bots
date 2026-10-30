import http from 'node:http';
import { createLogger } from './logger.js';

/**
 * Minimal health endpoint so Railway/Render/Fly can check the process is up
 * and keeps it warm. Returns null when no port is configured.
 */
export function startHealthServer(port, name) {
  if (!port) return null;
  const log = createLogger(`health:${name}`);

  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/health' || req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          bot: name,
          uptimeSeconds: Math.round(process.uptime()),
          time: new Date().toISOString(),
        }),
      );
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false }));
  });

  server.listen(port, () => log.info(`listening on :${port}`));
  server.on('error', (error) => log.error('server error:', error.message));
  return server;
}
