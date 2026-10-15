import test from 'node:test';
import assert from 'node:assert/strict';
import { createCalendarClient, CACHE_MS } from './calendar-client.js';
import { applyChanges } from '../shared/calendar.js';

function fixture() {
  const requests = [];
  let time = 0;
  let entries = {};
  let fail = false;
  const client = createCalendarClient({
    now: () => time,
    fetcher: async (url, options) => {
      requests.push({ url, ...options });
      if (fail) throw new Error('Offline');
      if (options.method === 'PUT') entries = applyChanges(entries, JSON.parse(options.body).changes);
      return Response.json({ entries });
    },
  });
  return { client, requests, advance: () => { time += CACHE_MS; }, fail: value => { fail = value; } };
}
test('31 painted days make one save, already-painted dates make none', async () => {
  const { client, requests } = fixture();
  await client.load('2026-10');
  client.beginStroke();
  for (let day = 1; day <= 31; day++) client.paint(`2026-10-${String(day).padStart(2, '0')}`, 'Top', 'available');
  await client.flush();
  assert.equal(requests.length, 1, 'no saves during a held stroke');
  client.endStroke();
  await client.flush();
  assert.equal(requests.length, 2);
  assert.equal(JSON.parse(requests[1].body).changes.length, 31);
  client.paint('2026-10-01', 'Top', 'available');
  await client.flush();
  assert.equal(requests.length, 2);
  assert.equal(client.hasPending(), false);
});
test('nearby clicks are debounced into one request after 500 ms of inactivity', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { client, requests } = fixture();
  await client.load('2026-10');
  client.paint('2026-10-01', 'Top', 'available');
  t.mock.timers.tick(300);
  client.paint('2026-10-02', 'Top', 'unavailable');
  t.mock.timers.tick(499);
  assert.equal(requests.length, 1);
  t.mock.timers.tick(1);
  assert.equal(requests.length, 2);
  assert.equal(JSON.parse(requests[1].body).changes.length, 2);
});
test('fresh month cache and focus checks avoid reads; forced refresh bypasses cache', async () => {
  const { client, requests, advance } = fixture();
  await client.load('2026-10');
  await client.load('2026-10');
  await client.load('2026-11');
  await client.load('2026-10');
  assert.equal(requests.length, 2);
  advance();
  await client.load('2026-10');
  assert.equal(requests.length, 3);
  await client.load('2026-10', true);
  assert.equal(requests.length, 4);
});
test('failed saves retain drafts for explicit retry without a retry loop', async () => {
  const { client, requests, fail } = fixture();
  await client.load('2026-10');
  fail(true);
  client.paint('2026-10-02', 'ADC', 'unavailable');
  await client.flush();
  assert.equal(client.hasPending(), true);
  assert.match(client.snapshot().error, /not saved/);
  assert.equal(requests.length, 2);
  fail(false);
  await client.flush();
  assert.equal(client.hasPending(), false);
  assert.equal(client.snapshot().error, '');
  assert.equal(client.snapshot().entries['2026-10-02'].ADC, 'unavailable');
});
test('edits made during a save are sent afterwards and never cleared by the older response', async () => {
  let release;
  let first = true;
  let entries = {};
  const requests = [];
  const client = createCalendarClient({ fetcher: async (_url, options) => {
    if (options.method === 'PUT') {
      requests.push(JSON.parse(options.body));
      if (first) { first = false; await new Promise(resolve => { release = resolve; }); }
      entries = applyChanges(entries, JSON.parse(options.body).changes);
    }
    return Response.json({ entries });
  } });
  await client.load('2026-10');
  client.paint('2026-10-03', 'Top', 'available');
  const saving = client.flush();
  client.paint('2026-10-03', 'Top', 'unavailable');
  release();
  await saving;
  await client.flush();
  assert.equal(requests.length, 2);
  assert.equal(client.snapshot().entries['2026-10-03'].Top, 'unavailable');
  assert.equal(client.hasPending(), false);
});
test('an older in-flight read cannot overwrite a completed save', async () => {
  let finishRead;
  let count = 0;
  const client = createCalendarClient({ fetcher: async (_url, options) => {
    if (options.method === 'PUT') return Response.json({ entries: { '2026-10-04': { Top: 'available' } } });
    if (count++ === 0) return Response.json({ entries: {} });
    return new Promise(resolve => { finishRead = () => resolve(Response.json({ entries: {} })); });
  } });
  await client.load('2026-10');
  const loading = client.load('2026-10', true);
  client.paint('2026-10-04', 'Top', 'available');
  await client.flush();
  finishRead();
  await loading;
  assert.equal(client.snapshot().entries['2026-10-04'].Top, 'available');
});
