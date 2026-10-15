import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import express from 'express';
import { createApp } from './app.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const app = await createApp(process.env.DATA_FILE || path.join(root, 'data', 'availability.json'));
const server = createServer(app);
const production = process.argv.includes('--production');
if (production) {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 5173);
server.listen(port, '0.0.0.0', () => {
  console.log(`Team Calendar: http://localhost:${port}`);
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const entry of interfaces || []) if (entry.family === 'IPv4' && !entry.internal) console.log(`Same-network team link: http://${entry.address}:${port}`);
  }
});
