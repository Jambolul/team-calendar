import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from './app.js';
import { validEntry } from '../shared/calendar.js';
import { createBlobStorage } from './blob-storage.js';
import { createHandler } from './api.js';

const entry = (date, role = 'Top', status = 'available') => ({ date, role, status });
test('reject invalid dates, roles, and statuses', () => {
  for (const value of [null, {}, entry('2026-02-30'), entry('2026-10-15', 'Coach'), entry('2026-10-15', 'Mid', 'maybe')]) assert.equal(validEntry(value), false);
  assert.equal(validEntry(entry('2028-02-29', 'Jungle', null)), true);
  assert.equal(validEntry(entry('2026-10-15', 'Mid', 'unsure')), true);
});
test('batch saves persist and preserve concurrent players and other months', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'team-calendar-'));
  const file = path.join(dir, 'availability.json');
  const server = (await createApp(file)).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/availability`;
  try {
    const save = (month, changes) => fetch(base, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, changes }) });
    const read = async month => (await (await fetch(`${base}?month=${month}`)).json()).entries;
    const results = await Promise.all([
      save('2026-10', [entry('2026-10-15'), entry('2026-10-16'), entry('2026-10-16', 'Supp', 'unsure')]),
      save('2026-10', [entry('2026-10-15', 'Mid', 'unavailable')]),
      save('2026-11', [entry('2026-11-01', 'Supp')]),
    ]);
    assert.ok(results.every(result => result.ok));
    const expected = { '2026-10-15': { Top: 'available', Mid: 'unavailable' }, '2026-10-16': { Top: 'available', Supp: 'unsure' } };
    assert.deepEqual(await read('2026-10'), expected);
    const restored = (await createApp(file)).listen(0, '127.0.0.1');
    await new Promise(resolve => restored.once('listening', resolve));
    try { assert.deepEqual((await (await fetch(`http://127.0.0.1:${restored.address().port}/api/availability?month=2026-10`)).json()).entries, expected); }
    finally { restored.closeAllConnections(); await new Promise(resolve => restored.close(resolve)); }
    assert.equal((await save('2026-10', [entry('2026-11-01')])).status, 400);
    assert.equal((await save('2026-10', [])).status, 400);
    assert.equal((await fetch(base)).status, 400);
    await save('2026-10', [entry('2026-10-15', 'Top', null)]);
    assert.deepEqual(await read('2026-11'), { '2026-11-01': { Supp: 'available' } });
    assert.deepEqual(await read('2026-10'), { '2026-10-15': { Mid: 'unavailable' }, '2026-10-16': { Top: 'available', Supp: 'unsure' } });
    const crossOrigin = await fetch(base, { method: 'PUT', headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(crossOrigin.status, 403);
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
test('Netlify storage retries conflicting writes without losing either player', async () => {
  let record = null;
  let version = 0;
  let conflicts = 0;
  const store = {
    async get() { return record?.data || null; },
    async getWithMetadata() { return structuredClone(record); },
    async setJSON(_key, data, options) {
      if ((options.onlyIfNew && record) || (options.onlyIfMatch && options.onlyIfMatch !== record?.etag)) { conflicts++; return { modified: false }; }
      record = { data, etag: String(++version) };
      return { modified: true, etag: record.etag };
    },
  };
  const storage = createBlobStorage(store);
  await Promise.all([
    storage.update('2026-10', [entry('2026-10-15')]),
    storage.update('2026-10', [entry('2026-10-15', 'Mid', 'unavailable')]),
  ]);
  assert.ok(conflicts > 0);
  assert.deepEqual(await storage.read('2026-10'), { '2026-10-15': { Top: 'available', Mid: 'unavailable' } });
  const handler = createHandler(storage);
  assert.equal((await handler(new Request('https://calendar.test/api/availability?month=bad'))).status, 400);
  assert.equal((await handler(new Request('https://calendar.test/api/availability', { method: 'PUT', body: 'null' }))).status, 400);
});
