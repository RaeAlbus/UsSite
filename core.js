// Core: sign-in, tabs, and the shared helpers every tab can use.
// Tabs register themselves with App.register({...}); see README, "Adding more".
(() => {
  'use strict';

  const C = window.CONFIG || {};
  const $ = (sel, root = document) => root.querySelector(sel);

  // ---------- shared helpers ----------
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayIso = () => iso(new Date());
  const shiftDay = (s, n) => { const d = fromIso(s); d.setDate(d.getDate() + n); return iso(d); };
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // ---------- state ----------
  const tabs = [];
  let sb = null;
  let ctx = null;          // { sb, uid, me, people, util } handed to every tab
  let activeId = null;
  let currentUid;          // undefined until the first session check

  function register(tab) { tabs.push({ mounted: false, ...tab }); }

  function showNotice(text) { const n = $('#notice'); n.textContent = text; n.hidden = false; }
  function hideNotice() { $('#notice').hidden = true; }

  // ---------- shell ----------
  function buildShell() {
    const nav = $('#tabs');
    const app = $('#app');
    tabs.forEach((t) => {
      const a = el('a', null, t.label);
      a.href = `#${t.id}`;
      a.id = `nav-${t.id}`;
      nav.append(a);
      const panel = el('section', 'panel');
      panel.id = `tab-${t.id}`;
      panel.hidden = true;
      app.append(panel);
    });
  }

  function route() {
    if (!ctx) return;
    const id = (location.hash || '').slice(1);
    const tab = tabs.find((t) => t.id === id) || tabs[0];
    if (!tab || activeId === tab.id) return;

    const prev = tabs.find((t) => t.id === activeId);
    if (prev && prev.onHide) prev.onHide();
    activeId = tab.id;

    tabs.forEach((t) => {
      $(`#tab-${t.id}`).hidden = t !== tab;
      const a = $(`#nav-${t.id}`);
      if (t === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });

    const panel = $(`#tab-${tab.id}`);
    if (!tab.mounted) {
      tab.mounted = true;
      try { tab.mount(panel, ctx); }
      catch (err) { panel.textContent = `This tab couldn't load: ${err.message}`; return; }
    }
    if (tab.onShow) tab.onShow();
    window.scrollTo(0, 0);
  }

  function resetTabs() {
    const prev = tabs.find((t) => t.id === activeId);
    if (prev && prev.onHide) prev.onHide();
    tabs.forEach((t) => { t.mounted = false; $(`#tab-${t.id}`).textContent = ''; });
    activeId = null;
    ctx = null;
  }

  // ---------- sign-in ----------
  // Supabase logs in with an email, so a username is quietly turned into username@LOGIN_DOMAIN.
  // Typing a full email still works too.
  function toLoginEmail(input) {
    const v = (input || '').trim().toLowerCase();
    if (v.includes('@')) return v;
    return `${v}@${C.LOGIN_DOMAIN || 'example.com'}`;
  }

  function showLogin() {
    resetTabs();
    $('#app').hidden = true;
    $('#tabs').hidden = true;
    $('#userBox').hidden = true;
    $('#login').hidden = false;
    $('#loginMsg').textContent = '';
    $('#password').value = '';
  }

  async function enterApp(session) {
    const uid = session.user.id;
    const { data, error } = await sb.from('profiles').select('id,name,slot').order('slot');
    if (error) { showNotice(`Couldn't load your profile: ${error.message}`); return; }
    const me = (data || []).find((p) => p.id === uid);

    $('#login').hidden = true;
    $('#userBox').hidden = false;

    if (!me || data.length < 2) {
      $('#userName').textContent = session.user.email || '';
      showNotice("You're signed in, but the two profiles aren't set up yet. Run supabase-2-people.sql (see the README).");
      return;
    }
    hideNotice();
    $('#userName').textContent = me.name;
    ctx = { sb, uid, me, people: data, util: App.util };
    $('#tabs').hidden = false;
    $('#app').hidden = false;
    route();
  }

  async function onSession(session) {
    const uid = session ? session.user.id : null;
    if (uid === currentUid) return;
    currentUid = uid;
    if (!session) { hideNotice(); showLogin(); return; }
    await enterApp(session);
  }

  // ---------- start ----------
  async function start() {
    document.title = C.TITLE || 'Us';
    $('#siteTitle').textContent = C.TITLE || 'Us';
    buildShell();

    const ok = C.SUPABASE_URL && C.SUPABASE_ANON_KEY &&
      !/YOUR-/.test(C.SUPABASE_URL + C.SUPABASE_ANON_KEY) && window.supabase;
    if (!ok) {
      showNotice('Setup needed: add your Supabase details to config.js (steps are in the README).');
      return;
    }
    sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);

    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#loginBtn');
      btn.disabled = true;
      $('#loginMsg').textContent = '';
      const { error } = await sb.auth.signInWithPassword({
        email: toLoginEmail($('#username').value),
        password: $('#password').value,
      });
      btn.disabled = false;
      if (error) $('#loginMsg').textContent = "That username and password didn't match. Try again.";
    });

    $('#signOut').addEventListener('click', () => sb.auth.signOut());
    window.addEventListener('hashchange', route);
    sb.auth.onAuthStateChange((_event, session) => { onSession(session); });

    const { data } = await sb.auth.getSession();
    await onSession(data.session);
  }

  window.App = {
    register,
    start,
    util: { el, pad, iso, fromIso, todayIso, shiftDay },
  };
})();
