import { useEffect, useRef, useState } from 'react';
import { createCalendarClient } from './calendar-client.js';

const ROLES = ['Top', 'Jungle', 'Mid', 'ADC', 'Supp'];
const LABEL = { available: 'Available', unavailable: 'Not available', unsure: 'Unsure', unset: 'Not set' };
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function initialRole() { try { return ROLES.includes(localStorage.role) ? localStorage.role : 'Top'; } catch { return 'Top'; } }

export default function App() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [role, setRole] = useState(initialRole);
  const [client] = useState(createCalendarClient);
  const [calendar, setCalendar] = useState(client.snapshot);
  const { entries, edits, ready: connected, error, pending } = calendar;
  const [paintStatus, setPaintStatus] = useState('available');
  const stroke = useRef(null);
  const monthKey = dateKey(month).slice(0, 7);
  useEffect(() => {
    return client.subscribe(setCalendar);
  }, [client]);
  useEffect(() => {
    void client.load(monthKey);
    const refresh = () => { if (document.visibilityState === 'visible') void client.load(monthKey); };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [client, monthKey]);
  useEffect(() => {
    const warn = event => {
      if (client.hasPending()) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [client]);
  const today = dateKey(new Date());
  const offset = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= count ? new Date(month.getFullYear(), month.getMonth(), day) : null;
  });
  function paint(date, paintedRole = role, status = paintStatus) {
    client.paint(date, paintedRole, status);
  }
  function startStroke(event, date) {
    if (event.button !== 0 || !connected) return;
    event.preventDefault();
    const grid = event.currentTarget.closest('.days');
    grid.setPointerCapture(event.pointerId);
    client.beginStroke();
    stroke.current = { pointerId: event.pointerId, role, status: paintStatus, visited: new Set([date]), x: event.clientX, y: event.clientY };
    paint(date);
  }
  function moveStroke(event) {
    const current = stroke.current;
    if (!current || current.pointerId !== event.pointerId) return;
    // Sample the path too: a quick pointer movement can cross a day between events.
    const steps = Math.max(1, Math.ceil(Math.hypot(event.clientX - current.x, event.clientY - current.y) / 8));
    for (let step = 1; step <= steps; step++) {
      const x = current.x + (event.clientX - current.x) * step / steps;
      const y = current.y + (event.clientY - current.y) * step / steps;
      const day = document.elementFromPoint(x, y)?.closest('[data-date]');
      if (!day || !event.currentTarget.contains(day) || current.visited.has(day.dataset.date)) continue;
      current.visited.add(day.dataset.date);
      paint(day.dataset.date, current.role, current.status);
    }
    current.x = event.clientX;
    current.y = event.clientY;
  }
  function availability(date, member) {
    const edit = edits[`${date}/${member}`];
    return edit ? edit.status || 'unset' : entries[date]?.[member] || 'unset';
  }
  function endStroke(event) {
    if (event?.type === 'pointerup') moveStroke(event);
    stroke.current = null;
    client.endStroke();
  }
  function selectRole(value) {
    setRole(value);
    try { localStorage.role = value; } catch { /* Preferences are optional. */ }
  }
  return <main>
    <header className="page-header">
      <h1>Team calendar</h1>
    </header>
    <section className="role-picker" aria-label="Choose your role">
      <div className="roles">{ROLES.map(value => <button key={value} aria-pressed={role === value} className={role === value ? 'selected' : ''} onClick={() => selectRole(value)}>{value}</button>)}</div>
      <div className="paint-options" aria-label="Choose availability to paint">
        {[['available', 'Available', '✓'], ['unavailable', 'Unavailable', '×'], ['unsure', 'Unsure', '?'], [null, 'Clear', '−']].map(([value, label, icon]) =>
          <button key={label} aria-pressed={paintStatus === value} className={`paint-option ${value || 'clear'} ${paintStatus === value ? 'selected' : ''}`} onClick={() => setPaintStatus(value)}><span aria-hidden="true">{icon}</span>{label}</button>
        )}
      </div>
    </section>
    <section className="calendar" aria-label="Availability calendar">
      <div className="calendar-toolbar">
        <div className="month-navigation"><button className="arrow" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><h2>{month.toLocaleDateString('en', { month: 'long', year: 'numeric' })}</h2><button className="arrow" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button></div>
        <div className="calendar-actions"><button className="today-button" aria-label="Refresh calendar" title="Refresh calendar" onClick={() => void client.load(monthKey, true)}>↻</button><button className="today-button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button></div>
      </div>
      <div className="weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="days" onPointerMove={moveStroke} onPointerUp={endStroke} onPointerCancel={endStroke} onLostPointerCapture={endStroke}>{cells.map((date, index) => {
        if (!date) return <div className="empty-day" key={`empty-${index}`} />;
        const key = dateKey(date);
        const status = availability(key, role);
        const allAvailable = ROLES.every(value => availability(key, value) === 'available');
        return <button key={key} data-date={key} className={`day ${status} ${key === today ? 'is-today' : ''} ${allAvailable ? 'all-available' : ''}`} disabled={!connected}
          aria-label={`${date.toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })}, ${role}: ${LABEL[status]}.${allAvailable ? ' All five players available.' : ''} Set ${paintStatus ? LABEL[paintStatus].toLowerCase() : 'not set'}.`}
          onPointerDown={event => startStroke(event, key)}
          onClick={event => { if (event.detail === 0) paint(key); }}>
          <span className="day-top"><span className="day-number">{date.getDate()}</span>{allAvailable && <span className="all-in" title="All five players available"><span aria-hidden="true">✓ </span>5/5</span>}</span>
          <span className="day-status"><span aria-hidden="true">{status === 'available' ? '✓' : status === 'unavailable' ? '×' : status === 'unsure' ? '?' : '–'}</span><span className="status-text">{LABEL[status]}</span></span>
          <span className="team-dots" aria-label={ROLES.map(value => `${value}: ${LABEL[availability(key, value)]}`).join(', ')}>{ROLES.map(value => <span key={value} title={`${value}: ${LABEL[availability(key, value)]}`} className={`team-dot ${availability(key, value)} ${value === role ? 'active-dot' : ''}`} />)}</span>
        </button>;
      })}</div>
    </section>
    {error && <p className="error" role="alert">{error} <button className="today-button" onClick={() => pending ? void client.flush() : void client.load(monthKey, true)}>Retry</button></p>}
  </main>;
}
