export const roles = ['Top', 'Jungle', 'Mid', 'ADC', 'Supp'];
export const validMonth = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export function validEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const { date, role, status } = entry;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !roles.includes(role) || !['available', 'unavailable', null].includes(status)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function validBatch(body) {
  return body && validMonth(body.month) && Array.isArray(body.changes) && body.changes.length > 0 && body.changes.length <= 155 &&
    body.changes.every(entry => validEntry(entry) && entry.date.startsWith(`${body.month}-`));
}

export function monthEntries(entries, month) {
  return Object.fromEntries(Object.entries(entries).filter(([date]) => date.startsWith(`${month}-`)));
}

export function applyChanges(entries, changes) {
  const result = structuredClone(entries);
  for (const { date, role, status } of changes) {
    result[date] ||= {};
    if (status === null) delete result[date][role];
    else result[date][role] = status;
    if (!Object.keys(result[date]).length) delete result[date];
  }
  return result;
}
