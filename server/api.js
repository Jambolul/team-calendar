import { validBatch, validMonth } from '../shared/calendar.js';

export function createHandler(storage) {
  return async request => {
    const headers = { 'Cache-Control': 'no-store' };
    const json = (data, status = 200) => Response.json(data, { status, headers });
    const url = new URL(request.url);
    if (request.headers.has('origin') && request.headers.get('origin') !== url.origin) return json({ error: 'Use this calendar’s own address.' }, 403);
    try {
      if (request.method === 'GET') {
        const month = url.searchParams.get('month');
        if (!validMonth(month)) return json({ error: 'Choose a valid month.' }, 400);
        return json({ month, entries: await storage.read(month) });
      }
      if (request.method === 'PUT') {
        const text = await request.text();
        if (text.length > 24000) return json({ error: 'Too many changes.' }, 413);
        let body;
        try { body = JSON.parse(text); } catch { return json({ error: 'Invalid JSON.' }, 400); }
        if (!validBatch(body)) return json({ error: 'Invalid availability changes.' }, 400);
        return json({ month: body.month, entries: await storage.update(body.month, body.changes) });
      }
      return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, PUT' } });
    } catch (error) {
      console.error(error);
      return json({ error: 'Calendar could not be saved or loaded. Please retry.' }, 503);
    }
  };
}
