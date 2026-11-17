// Photos tab: a private shared gallery for the two of you.
// Files go in the private "photos" storage bucket; details go in the photos table.
(() => {
  'use strict';

  const { el, iso, fromIso } = App.util;
  const BUCKET = 'photos';
  const MAX_FULL = 2000;   // longest edge of the stored photo, in pixels
  const MAX_THUMB = 480;   // longest edge of the grid thumbnail

  let ctx = null;
  let root = null;
  let photos = [];
  let current = -1;                 // index of the photo open in the viewer
  let lastFocus = null;
  const urlCache = new Map();       // storage path -> { url, exp }

  const q = (sel) => root.querySelector(sel);

  // ---------- image prep (runs in the browser before upload) ----------
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("this browser can't open that image type")); };
      img.src = url;
    });
  }

  function toJpeg(img, maxEdge, quality) {
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("couldn't process that image"))), 'image/jpeg', quality);
    });
  }

  // ---------- signed links (the bucket is private) ----------
  async function signMany(paths) {
    const now = Date.now();
    const need = paths.filter((p) => !urlCache.has(p) || urlCache.get(p).exp < now + 60000);
    if (!need.length) return;
    const { data, error } = await ctx.sb.storage.from(BUCKET).createSignedUrls(need, 3600);
    if (error) throw error;
    data.forEach((d) => {
      if (d.signedUrl) urlCache.set(d.path, { url: d.signedUrl, exp: now + 3500 * 1000 });
    });
  }

  async function signOne(path) {
    await signMany([path]);
    return urlCache.has(path) ? urlCache.get(path).url : '';
  }

  const cachedUrl = (path) => (urlCache.has(path) ? urlCache.get(path).url : '');

  // ---------- data ----------
  async function load() {
    const { data, error } = await ctx.sb.from('photos').select('*')
      .order('taken_on', { ascending: false }).order('created_at', { ascending: false });
    if (error) { setStatus(`Couldn't load photos: ${error.message}`, true); return; }
    photos = data;
    try { await signMany(photos.map((p) => p.thumb_path)); }
    catch (err) { setStatus(`Couldn't load photo links: ${err.message}`, true); }
    render();
  }

  async function uploadOne(file) {
    const img = await loadImage(file);
    const full = await toJpeg(img, MAX_FULL, 0.82);
    const thumb = await toJpeg(img, MAX_THUMB, 0.75);

    const base = `${ctx.uid}/${crypto.randomUUID()}`;
    const path = `${base}.jpg`;
    const thumbPath = `${base}-thumb.jpg`;
    const store = ctx.sb.storage.from(BUCKET);

    let r = await store.upload(path, full, { contentType: 'image/jpeg' });
    if (r.error) throw new Error(r.error.message);
    r = await store.upload(thumbPath, thumb, { contentType: 'image/jpeg' });
    if (r.error) { await store.remove([path]); throw new Error(r.error.message); }

    const takenOn = file.lastModified ? iso(new Date(file.lastModified)) : iso(new Date());
    const ins = await ctx.sb.from('photos').insert({ path, thumb_path: thumbPath, taken_on: takenOn });
    if (ins.error) { await store.remove([path, thumbPath]); throw new Error(ins.error.message); }
  }

  async function handleFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    const addBtn = q('.ph-add');
    addBtn.disabled = true;
    let added = 0;
    const failed = [];
    for (let i = 0; i < files.length; i += 1) {
      setStatus(`Uploading ${i + 1} of ${files.length}...`);
      try { await uploadOne(files[i]); added += 1; }
      catch (err) { failed.push(`${files[i].name || 'a photo'} (${err.message})`); }
    }
    await load();
    addBtn.disabled = false;
    if (failed.length) {
      setStatus(`Added ${added}. Couldn't add ${failed.length}: ${failed[0]}`, true);
    } else {
      setStatus(`Added ${added} photo${added === 1 ? '' : 's'}.`);
    }
  }

  // ---------- gallery ----------
  function setStatus(text, isErr) {
    const s = q('.ph-status');
    s.textContent = text;
    s.classList.toggle('err', !!isErr);
  }

  function monthLabel(dateStr) {
    return fromIso(dateStr).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  function render() {
    q('.ph-count').textContent = photos.length
      ? `${photos.length} photo${photos.length === 1 ? '' : 's'}`
      : '';
    const list = q('.ph-list');
    list.textContent = '';

    if (!photos.length) {
      list.append(el('p', 'empty-note', 'No photos yet. Tap "Add photos" to put the first one here.'));
      return;
    }

    let grid = null;
    let lastMonth = '';
    photos.forEach((p, i) => {
      const month = monthLabel(p.taken_on);
      if (month !== lastMonth) {
        lastMonth = month;
        list.append(el('h2', 'ph-month', month));
        grid = el('div', 'ph-grid');
        list.append(grid);
      }
      const btn = el('button', 'ph-thumb');
      btn.type = 'button';
      const label = p.caption || `Photo from ${fromIso(p.taken_on).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`;
      btn.setAttribute('aria-label', `Open: ${label}`);
      const img = document.createElement('img');
      img.src = cachedUrl(p.thumb_path);
      img.alt = '';
      img.loading = 'lazy';
      btn.append(img);
      btn.addEventListener('click', () => openViewer(i, btn));
      grid.append(btn);
    });
  }

  // ---------- viewer ----------
  const viewer = () => q('.lightbox');

  function showPhoto(i) {
    current = i;
    const p = photos[i];
    const img = q('.lb-img');
    img.alt = p.caption || '';
    img.src = cachedUrl(p.thumb_path);       // instant, then swap to the full-size one
    signOne(p.path).then((url) => { if (current === i && url) img.src = url; }).catch(() => {});

    q('.lb-caption').value = p.caption || '';
    q('.lb-date').value = p.taken_on;
    const who = ctx.people.find((x) => x.id === p.uploaded_by);
    q('.lb-meta').textContent = who ? `Added by ${who.name}` : '';
    q('.lb-msg').textContent = '';
    q('.lb-prev').hidden = i === 0;
    q('.lb-next').hidden = i === photos.length - 1;
  }

  function openViewer(i, opener) {
    lastFocus = opener || null;
    showPhoto(i);
    viewer().hidden = false;
    document.body.style.overflow = 'hidden';
    q('.lb-close').focus();
  }

  function closeViewer() {
    viewer().hidden = true;
    document.body.style.overflow = '';
    current = -1;
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }

  async function saveDetails() {
    const p = photos[current];
    const caption = q('.lb-caption').value.trim() || null;
    const takenOn = q('.lb-date').value || p.taken_on;
    const { error } = await ctx.sb.from('photos').update({ caption, taken_on: takenOn }).eq('id', p.id);
    if (error) { q('.lb-msg').textContent = `Couldn't save: ${error.message}`; return; }
    const id = p.id;
    p.caption = caption;
    p.taken_on = takenOn;
    photos.sort((a, b) => (a.taken_on === b.taken_on ? b.created_at.localeCompare(a.created_at) : b.taken_on.localeCompare(a.taken_on)));
    render();
    current = photos.findIndex((x) => x.id === id);
    showPhoto(current);
    q('.lb-msg').textContent = 'Saved.';
  }

  async function deletePhoto() {
    const p = photos[current];
    if (!window.confirm('Delete this photo for both of you? This can\'t be undone.')) return;
    const del = await ctx.sb.from('photos').delete().eq('id', p.id);
    if (del.error) { q('.lb-msg').textContent = `Couldn't delete: ${del.error.message}`; return; }
    await ctx.sb.storage.from(BUCKET).remove([p.path, p.thumb_path]);
    closeViewer();
    await load();
    setStatus('Photo deleted.');
  }

  // ---------- tab ----------
  function mount(panel, context) {
    root = panel;
    ctx = context;

    root.innerHTML = `
      <section class="ph-top">
        <div>
          <h1 class="page-title">Photos</h1>
          <p class="ph-count"></p>
        </div>
        <button class="ph-add" type="button">Add photos</button>
        <input class="ph-file" type="file" accept="image/*" multiple hidden>
      </section>
      <p class="note ph-status" role="status" aria-live="polite"></p>
      <div class="ph-list"></div>

      <div class="overlay lightbox" hidden role="dialog" aria-modal="true" aria-label="Photo viewer">
        <div class="lb-box">
          <div class="lb-stage">
            <button class="lb-nav lb-prev" type="button" aria-label="Previous photo">&lsaquo;</button>
            <img class="lb-img" alt="">
            <button class="lb-nav lb-next" type="button" aria-label="Next photo">&rsaquo;</button>
          </div>
          <div class="lb-info">
            <label for="lbCaption">Caption</label>
            <input id="lbCaption" class="lb-caption" maxlength="200" placeholder="Add a caption">
            <label for="lbDate">Date</label>
            <input id="lbDate" class="lb-date" type="date">
            <p class="lb-meta"></p>
            <div class="lb-actions">
              <button class="lb-save" type="button">Save</button>
              <button class="lb-del" type="button">Delete</button>
              <button class="lb-close" type="button">Close</button>
            </div>
            <p class="lb-msg" role="status" aria-live="polite"></p>
          </div>
        </div>
      </div>`;

    const input = q('.ph-file');
    q('.ph-add').addEventListener('click', () => input.click());
    input.addEventListener('change', () => { handleFiles(input.files).finally(() => { input.value = ''; }); });

    q('.lb-close').addEventListener('click', closeViewer);
    q('.lb-save').addEventListener('click', saveDetails);
    q('.lb-del').addEventListener('click', deletePhoto);
    q('.lb-prev').addEventListener('click', () => { if (current > 0) showPhoto(current - 1); });
    q('.lb-next').addEventListener('click', () => { if (current < photos.length - 1) showPhoto(current + 1); });
    viewer().addEventListener('click', (e) => { if (e.target === viewer()) closeViewer(); });

    document.addEventListener('keydown', (e) => {
      if (!root || viewer().hidden) return;
      if (e.key === 'Escape') closeViewer();
      const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement && document.activeElement.tagName);
      if (typing) return;
      if (e.key === 'ArrowLeft' && current > 0) showPhoto(current - 1);
      if (e.key === 'ArrowRight' && current < photos.length - 1) showPhoto(current + 1);
    });
  }

  function onShow() { load(); }
  function onHide() { if (root && !viewer().hidden) closeViewer(); }

  App.register({ id: 'photos', label: 'Photos', mount, onShow, onHide });
})();
