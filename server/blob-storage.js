import { applyChanges } from '../shared/calendar.js';

export function createBlobStorage(store) {
  return {
    async read(month) { return (await store.get(month, { type: 'json', consistency: 'strong' })) || {}; },
    async update(month, changes) {
      // Compare-and-swap preserves other players' edits across independent function instances.
      for (let attempt = 0; attempt < 5; attempt++) {
        const existing = await store.getWithMetadata(month, { type: 'json', consistency: 'strong' });
        const updated = applyChanges(existing?.data || {}, changes);
        if (existing && JSON.stringify(updated) === JSON.stringify(existing.data)) return updated;
        const condition = existing ? { onlyIfMatch: existing.etag } : { onlyIfNew: true };
        const { modified } = await store.setJSON(month, updated, condition);
        if (modified) return updated;
      }
      throw new Error('Calendar changed repeatedly. Please retry.');
    },
  };
}
