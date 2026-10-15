import express from 'express';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { applyChanges, monthEntries } from '../shared/calendar.js';
import { createHandler } from './api.js';
export { validEntry } from '../shared/calendar.js';

export async function createApp(dataFile) {
  await mkdir(path.dirname(dataFile), { recursive: true });
  let entries = {};
  try { entries = JSON.parse(await readFile(dataFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let queue = Promise.resolve();
  const handler = createHandler({
    async read(month) { return monthEntries(entries, month); },
    update(month, changes) {
      const task = queue.then(async () => {
        const updated = applyChanges(entries, changes);
        await writeFile(`${dataFile}.tmp`, JSON.stringify(updated, null, 2), 'utf8');
        await rename(`${dataFile}.tmp`, dataFile);
        entries = updated;
        return monthEntries(entries, month);
      });
      queue = task.catch(() => {});
      return task;
    },
  });
  const app = express();
  app.disable('x-powered-by');
  app.all('/api/availability', express.raw({ type: () => true, limit: '24kb' }), async (req, res, next) => {
    try {
      const request = new Request(`${req.protocol}://${req.get('host')}${req.originalUrl}`, {
        method: req.method, headers: req.headers,
        ...(!['GET', 'HEAD'].includes(req.method) ? { body: req.body } : {}),
      });
      const response = await handler(request);
      res.status(response.status);
      response.headers.forEach((value, name) => res.setHeader(name, value));
      res.send(Buffer.from(await response.arrayBuffer()));
    } catch (error) { next(error); }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(error.status || 500).json({ error: 'Could not save. Please retry.' });
  });
  return app;
}
