// Scores tab: head-to-head daily puzzle scores.
(() => {
  'use strict';

  const { el, pad, fromIso, todayIso, shiftDay } = App.util;

  const CORE = {
    connections: { label: 'Connections', placeholder: 'Mistakes (0-4), or X if missed' },
    strands:     { label: 'Strands',     placeholder: 'Hints used' },
    mini:        { label: 'The Mini',    placeholder: 'Time, like 0:45' },
  };
  const CORE_LABELS = Object.values(CORE).map((g) => g.label);

  let ctx = null;
  let root = null;
  let rows = [];
  let viewDate = todayIso();
  let timer = null;

  const q = (sel) => root.querySelector(sel);

  function coreKey(name) {
    const n = (name || '').trim().toLowerCase();
    if (n === 'connections') return 'connections';
    if (n === 'strands') return 'strands';
    if (n === 'the mini' || n === 'mini' || n === 'mini crossword') return 'mini';
    return null;
  }

  // ---------- parsing ----------
  function fmtTime(sec) { return `${Math.floor(sec / 60)}:${pad(sec % 60)}`; }

  function parseTime(s) {
    const m = s.match(/^\s*(\d+):(\d{2})\s*$/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    const n = s.match(/^\s*(\d+)\s*(s|sec|secs|seconds)?\s*$/i);
    return n ? Number(n[1]) : NaN;
  }

  function numFromText(s) {
    const t = s.match(/(\d+):(\d{2})/);
    if (t) return Number(t[1]) * 60 + Number(t[2]);
    const n = s.match(/-?\d+(\.\d+)?/);
    return n ? Number(n[0]) : NaN;
  }

  function knownGames() {
    const names = new Set(CORE_LABELS);
    rows.forEach((r) => names.add(r.game));
    return [...names];
  }

  function detect(text) {
    const t = (text || '').trim();
    if (!t) return null;
    const squares = ['🟨', '🟩', '🟦', '🟪'];

    if (/connections/i.test(t)) {
      const grid = t.split(/\r?\n/)
        .map((line) => Array.from(line.trim()).filter((c) => squares.includes(c)))
        .filter((r) => r.length === 4);
      if (grid.length) {
        const solved = grid.filter((r) => r.every((c) => c === r[0])).length;
        return { game: 'Connections', score: solved < 4 ? 'X' : String(grid.length - solved) };
      }
    }
    if (/strands/i.test(t)) {
      return { game: 'Strands', score: String((t.match(/💡/g) || []).length) };
    }
    if (/mini/i.test(t)) {
      const m = t.match(/(\d+):(\d{2})/);
      if (m) return { game: 'The Mini', score: `${Number(m[1])}:${m[2]}` };
    }
    return null;
  }

  function normalize(gameName, scoreText, betterChoice) {
    const name = (gameName || '').trim();
    const s = (scoreText || '').trim();
    if (!name) throw new Error('Add the game name.');
    if (!s) throw new Error('Add your score.');
    const key = coreKey(name);

    if (key === 'connections') {
      if (/^(x|fail|failed|missed|lost|dnf)$/i.test(s)) {
        return { game: 'Connections', display: 'Missed it', value: 5, better: 'lower' };
      }
      const n = parseInt(s, 10);
      if (!(n >= 0 && n <= 4)) throw new Error('Connections mistakes should be 0 to 4, or X if you missed it.');
      return { game: 'Connections', display: n === 0 ? 'Perfect' : `${n} mistake${n === 1 ? '' : 's'}`, value: n, better: 'lower' };
    }
    if (key === 'strands') {
      const n = parseInt(s, 10);
      if (!(n >= 0)) throw new Error('Strands hints should be a number, like 0 or 2.');
      return { game: 'Strands', display: n === 0 ? 'No hints' : `${n} hint${n === 1 ? '' : 's'}`, value: n, better: 'lower' };
    }
    if (key === 'mini') {
      const sec = parseTime(s);
      if (Number.isNaN(sec)) throw new Error('Enter the Mini time like 0:45.');
      return { game: 'The Mini', display: fmtTime(sec), value: sec, better: 'lower' };
    }

    const seen = knownGames().find((g) => g.toLowerCase() === name.toLowerCase());
    const better = betterChoice || 'lower';
    let value = null;
    if (better !== 'none') {
      value = numFromText(s);
      if (Number.isNaN(value)) throw new Error('Add a number so we can see who won, or choose "No winner".');
    }
    return { game: seen || name, display: s, value, better };
  }

  // ---------- data ----------
  async function load() {
    const { data, error } = await ctx.sb.from('scores').select('*')
      .order('play_date', { ascending: false }).limit(5000);
    if (error) { flash(`Couldn't load scores: ${error.message}`, true); return; }
    rows = data.map((r) => ({ ...r, value: r.value == null ? null : Number(r.value) }));
    render();
  }

  async function saveScore(n, raw) {
    const row = {
      player_id: ctx.uid, game: n.game, play_date: viewDate,
      display: n.display, value: n.value, better: n.better, raw: raw || null,
    };
    const { error } = await ctx.sb.from('scores').upsert(row, { onConflict: 'player_id,game,play_date' });
    if (error) throw new Error(error.message);
    await load();
  }

  async function removeScore(row) {
    const { error } = await ctx.sb.from('scores').delete().eq('id', row.id);
    if (error) { flash(`Couldn't remove that score: ${error.message}`, true); return; }
    rows = rows.filter((r) => r.id !== row.id);
    render();
  }

  // ---------- who won ----------
  function winnerIndex(a, b) {
    if (!a || !b) return null;
    if (a.better === 'none' || a.value == null || b.value == null || a.value === b.value) return 'tie';
    const aWins = a.better === 'higher' ? a.value > b.value : a.value < b.value;
    return aWins ? 0 : 1;
  }

  function allTimeWins() {
    const [p0, p1] = ctx.people;
    const byKey = new Map();
    rows.forEach((r) => {
      const k = `${r.play_date}|${r.game}`;
      if (!byKey.has(k)) byKey.set(k, {});
      byKey.get(k)[r.player_id] = r;
    });
    const wins = [0, 0];
    byKey.forEach((v) => {
      const w = winnerIndex(v[p0.id], v[p1.id]);
      if (w === 0 || w === 1) wins[w] += 1;
    });
    return wins;
  }

  // ---------- rendering ----------
  function gamesForDay(date) {
    const extra = new Set();
    rows.filter((r) => r.play_date === date && !CORE_LABELS.includes(r.game)).forEach((r) => extra.add(r.game));
    return [...CORE_LABELS, ...[...extra].sort((a, b) => a.localeCompare(b))];
  }

  const find = (date, game, pid) => rows.find((r) => r.play_date === date && r.game === game && r.player_id === pid);

  function buildTile(row, idx, outcome) {
    const t = el('div', `tile p${idx}`);
    if (!row) {
      t.classList.add('empty');
      t.append(el('span', 'val', '\u2014'), el('span', 'sub', 'not yet'));
      return t;
    }
    t.append(el('span', 'val', row.display));
    if (outcome === idx) { t.classList.add('win'); t.append(el('span', 'sub', 'ahead')); }
    else if (outcome === 'tie') { t.append(el('span', 'sub', 'tied')); }
    if (row.player_id === ctx.uid) {
      const rm = el('button', 'rm', 'Remove');
      rm.type = 'button';
      rm.setAttribute('aria-label', `Remove my ${row.game} score`);
      rm.addEventListener('click', () => removeScore(row));
      t.append(rm);
    }
    return t;
  }

  function longDate(d) {
    const opts = { month: 'long', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString(undefined, opts);
  }

  function render() {
    if (!root) return;
    const d = fromIso(viewDate);
    q('#weekday').textContent = d.toLocaleDateString(undefined, { weekday: 'long' });
    q('#dateText').textContent = longDate(d);
    q('#next').disabled = viewDate >= todayIso();
    q('#today').hidden = viewDate === todayIso();

    [['#nameA', 0], ['#nameB', 1]].forEach(([sel, i]) => {
      const box = q(sel);
      box.textContent = ctx.people[i].name;
      if (ctx.people[i].id === ctx.uid) box.append(el('small', null, 'you'));
    });

    const wins = allTimeWins();
    const tally = q('#tally');
    tally.textContent = '';
    tally.append(el('strong', null, `${wins[0]} \u2013 ${wins[1]}`), el('span', null, 'wins so far'));

    const rowsBox = q('#rows');
    rowsBox.textContent = '';
    gamesForDay(viewDate).forEach((game) => {
      const a = find(viewDate, game, ctx.people[0].id);
      const b = find(viewDate, game, ctx.people[1].id);
      const outcome = winnerIndex(a, b);
      const row = el('div', 'row');
      row.append(el('p', 'game', game));
      const tiles = el('div', 'tiles');
      tiles.append(buildTile(a, 0, outcome), buildTile(b, 1, outcome));
      row.append(tiles);
      rowsBox.append(row);
    });

    const list = q('#gameList');
    list.textContent = '';
    knownGames().forEach((g) => { const o = document.createElement('option'); o.value = g; list.append(o); });

    q('#saveHint').textContent = `Saving to ${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}. Saving a game again replaces your earlier score.`;
  }

  function flash(text, isErr) {
    const m = q('#msg');
    m.textContent = text;
    m.classList.toggle('err', !!isErr);
  }

  function syncGameFields() {
    const name = q('#game').value;
    const key = coreKey(name);
    q('#score').placeholder = key ? CORE[key].placeholder : 'Your score';
    const custom = name.trim() && !key;
    q('#betterWrap').hidden = !custom;
    if (custom) {
      const seen = rows.find((r) => r.game.toLowerCase() === name.trim().toLowerCase());
      if (seen) q('#better').value = seen.better;
    }
  }

  // ---------- tab ----------
  function mount(panel, context) {
    root = panel;
    ctx = context;
    viewDate = todayIso();

    root.innerHTML = `
      <section class="day" aria-label="Choose a day">
        <button class="nav" id="prev" type="button" aria-label="Previous day">&lsaquo;</button>
        <div class="day-text">
          <h1 id="weekday"></h1>
          <p id="dateText"></p>
        </div>
        <button class="nav" id="next" type="button" aria-label="Next day">&rsaquo;</button>
      </section>
      <button class="linkish today" id="today" type="button" hidden>Back to today</button>

      <section class="board" aria-label="Scores for this day">
        <div class="board-head">
          <div class="name p0" id="nameA"></div>
          <div class="tally" id="tally"></div>
          <div class="name p1" id="nameB"></div>
        </div>
        <div id="rows"></div>
      </section>

      <section class="add">
        <h2>Add your score</h2>
        <form id="form" novalidate>
          <label for="paste">Paste your share text</label>
          <textarea id="paste" rows="4" placeholder="Tap the game's Share button, then paste the result here."></textarea>
          <p class="status" id="detectStatus" aria-live="polite"></p>

          <div class="fields">
            <div>
              <label for="game">Game</label>
              <input id="game" list="gameList" autocomplete="off" placeholder="Connections">
              <datalist id="gameList"></datalist>
            </div>
            <div>
              <label for="score">Score</label>
              <input id="score" autocomplete="off" placeholder="Your score">
            </div>
          </div>

          <div id="betterWrap" hidden>
            <label for="better">Who wins this game?</label>
            <select id="better">
              <option value="lower">Lowest score</option>
              <option value="higher">Highest score</option>
              <option value="none">No winner, just share</option>
            </select>
          </div>

          <button class="save" id="save" type="submit">Save my score</button>
          <p class="status" id="saveHint"></p>
          <p class="status msg" id="msg" role="status" aria-live="polite"></p>
        </form>
      </section>`;

    q('#paste').addEventListener('input', () => {
      const text = q('#paste').value;
      const found = detect(text);
      const status = q('#detectStatus');
      if (found) {
        q('#game').value = found.game;
        q('#score').value = found.score;
        syncGameFields();
        status.textContent = `Looks like ${found.game}. Check the score below, then save.`;
      } else {
        status.textContent = text.trim() ? "Couldn't read that one. Pick a game and type your score below." : '';
      }
    });
    q('#game').addEventListener('input', syncGameFields);

    q('#form').addEventListener('submit', async (e) => {
      e.preventDefault();
      flash('');
      const btn = q('#save');
      try {
        const n = normalize(q('#game').value, q('#score').value, q('#better').value);
        btn.disabled = true;
        await saveScore(n, q('#paste').value.trim());
        flash(`Saved ${n.game}: ${n.display}.`);
        q('#paste').value = '';
        q('#game').value = '';
        q('#score').value = '';
        q('#detectStatus').textContent = '';
        syncGameFields();
      } catch (err) {
        flash(err.message, true);
      } finally {
        btn.disabled = false;
      }
    });

    q('#prev').addEventListener('click', () => { viewDate = shiftDay(viewDate, -1); render(); });
    q('#next').addEventListener('click', () => { if (viewDate < todayIso()) { viewDate = shiftDay(viewDate, 1); render(); } });
    q('#today').addEventListener('click', () => { viewDate = todayIso(); render(); });

    render();
  }

  function onShow() {
    load();
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden) load(); }, 20000);
  }

  function onHide() { clearInterval(timer); timer = null; }

  App.register({ id: 'scores', label: 'Scores', mount, onShow, onHide });
})();
