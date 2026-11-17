// Calendar tab: your shared Google Calendar, embedded.
// The embed link is saved in the private site_settings table, so it never sits in the public repo.
(() => {
  'use strict';

  const KEY = 'calendar_url';
  const MODE_KEY = 'us.calendar.mode';       // remembered per device
  const MODES = ['MONTH', 'WEEK', 'AGENDA'];

  let ctx = null;
  let root = null;
  let baseUrl = null;

  const q = (sel) => root.querySelector(sel);

  // ---------- turning what you paste into a safe embed link ----------
  function parseInput(text) {
    const t = (text || '').trim();
    if (!t) throw new Error("Paste your calendar's embed code, its embed link, or its Calendar ID.");

    const fromTag = t.match(/src\s*=\s*["']([^"']+)["']/i);
    const candidate = (fromTag ? fromTag[1] : t).replace(/&amp;/g, '&');

    if (!/^https?:\/\//i.test(candidate)) {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        return `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(candidate)}${tz ? `&ctz=${encodeURIComponent(tz)}` : ''}`;
      }
      throw new Error("That doesn't look like an embed code or a Calendar ID.");
    }

    let u;
    try { u = new URL(candidate); } catch (e) { throw new Error("That link isn't valid."); }
    if (u.protocol !== 'https:' || u.hostname !== 'calendar.google.com' || !u.pathname.startsWith('/calendar/embed')) {
      throw new Error('That needs to be a Google Calendar embed link (it starts with calendar.google.com/calendar/embed).');
    }
    return u.toString();
  }

  // ---------- view mode ----------
  function currentMode() {
    let saved = null;
    try { saved = localStorage.getItem(MODE_KEY); } catch (e) { /* ignore */ }
    if (MODES.includes(saved)) return saved;
    const own = (new URL(baseUrl).searchParams.get('mode') || '').toUpperCase();
    if (MODES.includes(own)) return own;
    return window.innerWidth < 700 ? 'AGENDA' : 'MONTH';
  }

  function frameUrl(mode) {
    const u = new URL(baseUrl);
    u.searchParams.set('mode', mode);
    return u.toString();
  }

  function showCalendar() {
    const mode = currentMode();
    const frame = q('.cal-frame');
    const next = frameUrl(mode);
    if (frame.getAttribute('src') !== next) frame.setAttribute('src', next);
    root.querySelectorAll('.seg button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    });
    q('.cal-view').hidden = false;
    q('.cal-tools').hidden = false;
    q('.cal-setup').hidden = true;
    setStatus('');
  }

  function showSetup(canCancel) {
    q('.cal-view').hidden = true;
    q('.cal-tools').hidden = true;
    q('.cal-setup').hidden = false;
    q('.cal-cancel').hidden = !canCancel;
    q('.cal-input').value = '';
    q('.cal-msg').textContent = '';
    setStatus('');
  }

  function setStatus(text, isErr) {
    const s = q('.cal-status');
    s.textContent = text;
    s.classList.toggle('err', !!isErr);
  }

  // ---------- data ----------
  async function init() {
    setStatus('Loading...');
    const { data, error } = await ctx.sb.from('site_settings').select('value').eq('key', KEY).maybeSingle();
    if (error) {
      const missing = error.code === '42P01' || /site_settings/.test(error.message || '');
      setStatus(missing
        ? 'One more setup step: run supabase-3-calendar.sql in the Supabase SQL Editor, then reload.'
        : `Couldn't load the calendar: ${error.message}`, true);
      return;
    }
    if (data && data.value) { baseUrl = data.value; showCalendar(); }
    else showSetup(false);
  }

  async function saveCalendar(e) {
    e.preventDefault();
    const msg = q('.cal-msg');
    msg.textContent = '';
    msg.classList.remove('err');
    const btn = q('.cal-save');
    try {
      const url = parseInput(q('.cal-input').value);
      btn.disabled = true;
      const { error } = await ctx.sb.from('site_settings')
        .upsert({ key: KEY, value: url, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      baseUrl = url;
      showCalendar();
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.add('err');
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- tab ----------
  function mount(panel, context) {
    root = panel;
    ctx = context;

    root.innerHTML = `
      <section class="cal-top">
        <h1 class="page-title">Calendar</h1>
        <div class="cal-tools" hidden>
          <div class="seg" role="group" aria-label="Calendar view">
            <button type="button" data-mode="MONTH" aria-pressed="false">Month</button>
            <button type="button" data-mode="WEEK" aria-pressed="false">Week</button>
            <button type="button" data-mode="AGENDA" aria-pressed="false">List</button>
          </div>
        </div>
      </section>
      <p class="note cal-status" role="status" aria-live="polite"></p>

      <div class="cal-view" hidden>
        <iframe class="cal-frame" title="Our shared Google Calendar" referrerpolicy="no-referrer-when-downgrade"></iframe>
        <p class="note cal-help">
          Blank or asking you to sign in? <a href="https://calendar.google.com/calendar/u/0/r" target="_blank" rel="noopener">Open it in Google Calendar</a>.
          <button class="linkish cal-change" type="button">Change calendar</button>
        </p>
      </div>

      <form class="add cal-setup" hidden novalidate>
        <h2>Connect your calendar</h2>
        <p class="status">On a computer, open Google Calendar, go to Settings, pick your shared calendar, then Integrate calendar. Copy the Embed code (or just the Calendar ID) and paste it here.</p>
        <label for="calInput">Embed code or Calendar ID</label>
        <textarea id="calInput" class="cal-input" rows="4" placeholder='<iframe src="https://calendar.google.com/calendar/embed?src=..."></iframe>'></textarea>
        <button class="save cal-save" type="submit">Show my calendar</button>
        <button class="linkish cal-cancel" type="button" hidden>Cancel</button>
        <p class="status msg cal-msg" role="status" aria-live="polite"></p>
      </form>`;

    root.querySelectorAll('.seg button').forEach((b) => {
      b.addEventListener('click', () => {
        try { localStorage.setItem(MODE_KEY, b.dataset.mode); } catch (e) { /* ignore */ }
        showCalendar();
      });
    });
    q('.cal-change').addEventListener('click', () => showSetup(true));
    q('.cal-cancel').addEventListener('click', showCalendar);
    q('.cal-setup').addEventListener('submit', saveCalendar);

    init();
  }

  App.register({ id: 'calendar', label: 'Calendar', mount });
})();
