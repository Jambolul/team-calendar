const keyFor = entry => `${entry.date}/${entry.role}`;
export const CACHE_MS = 60000;
export const SAVE_DELAY_MS = 500;

export function createCalendarClient({ fetcher = fetch, now = Date.now, delay = SAVE_DELAY_MS } = {}) {
  const cache = new Map();
  const reads = new Map();
  const revisions = new Map();
  const unsent = new Map();
  const edits = new Map();
  const listeners = new Set();
  let activeMonth = '';
  let sequence = 0;
  let timer;
  let holding = false;
  let saving = false;
  let error = '';
  function snapshot() {
    return { entries: cache.get(activeMonth)?.entries || {}, edits: Object.fromEntries(edits), ready: cache.has(activeMonth), pending: edits.size > 0, error };
  }
  function notify() { for (const listener of listeners) listener(snapshot()); }
  function schedule() {
    clearTimeout(timer);
    if (!holding) timer = setTimeout(() => { void flush(); }, delay);
  }
  async function load(month, force = false) {
    activeMonth = month;
    notify();
    if (reads.has(month)) return reads.get(month);
    if (!force && cache.has(month) && now() - cache.get(month).at < CACHE_MS) return;
    const revision = revisions.get(month) || 0;
    const task = (async () => {
      try {
        const response = await fetcher(`/api/availability?month=${month}`, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Load failed');
        const data = await response.json();
        // A read started before a save must not overwrite the saved response.
        if ((revisions.get(month) || 0) === revision) cache.set(month, { entries: data.entries, at: now() });
        if (!unsent.size) error = '';
      } catch { error = 'Could not refresh the calendar. Try Refresh again.'; }
      finally { reads.delete(month); notify(); }
    })();
    reads.set(month, task);
    return task;
  }
  function paint(date, role, status) {
    if (!cache.has(date.slice(0, 7))) return;
    const key = keyFor({ date, role });
    const current = edits.has(key) ? edits.get(key).status : cache.get(date.slice(0, 7)).entries[date]?.[role] || null;
    if (current === status) return; // Already painted: no save request.
    const entry = { date, role, status, id: ++sequence };
    edits.set(key, entry);
    unsent.set(key, entry);
    notify();
    schedule();
  }
  async function flush() {
    clearTimeout(timer);
    if (saving || holding || !unsent.size) return;
    saving = true;
    error = '';
    try {
      while (unsent.size && !holding) {
        const month = unsent.values().next().value.date.slice(0, 7);
        const batch = [...unsent.values()].filter(entry => entry.date.startsWith(month));
        for (const entry of batch) unsent.delete(keyFor(entry));
        try {
          const response = await fetcher('/api/availability', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month, changes: batch.map(({ date, role, status }) => ({ date, role, status })) }),
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok) throw new Error('Save failed');
          const data = await response.json();
          revisions.set(month, (revisions.get(month) || 0) + 1);
          cache.set(month, { entries: data.entries, at: now() });
          for (const entry of batch) if (edits.get(keyFor(entry))?.id === entry.id) edits.delete(keyFor(entry));
        } catch {
          for (const entry of batch) if (!unsent.has(keyFor(entry))) unsent.set(keyFor(entry), entry);
          error = 'Changes are not saved yet. Retry when your connection is back.';
          break; // No automatic retry loop burning credits.
        }
        notify();
      }
    } finally { saving = false; notify(); }
  }
  return {
    load, paint, flush, snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    beginStroke() { holding = true; clearTimeout(timer); },
    endStroke() { holding = false; if (unsent.size) schedule(); },
    hasPending() { return edits.size > 0; },
  };
}
