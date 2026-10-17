// Review player for a motion-film project. Served by scripts/player.mjs at /film/player.html; NOT loaded by the film.
//
// The film runs unchanged in a same-origin iframe (film/index.html?fmt=…). The player drives it through window.seek(t)
// and reads C.SCENES, C.TL.marks and window.VO for the timeline. On pause, a click on the frame picks the element under
// the cursor; the note saved for it carries t, the scene, the nearest mark and the element's address (text + CSS path).
// Knobs (palette = :root custom properties, display/UI face, element text) change the live preview only; each change is
// turned into a note "change X from A to B" — the agent applies it to the sources. With no server (file://), notes stay
// in localStorage and "Copy for Claude" is the way out.
(() => {
  const qs = new URLSearchParams(location.search);
  const LANG = (qs.get('lang') || navigator.language || 'en').toLowerCase().startsWith('ru') ? 'ru' : 'en';
  const DICT = {
    ru: {
      copy: 'Скопировать для Claude', hintPlay: 'Пробел — пуск и пауза. На паузе щёлкните по элементу кадра', hintPause: 'Щёлкните по элементу кадра, чтобы оставить заметку',
      note: 'Заметка', noSel: 'Элемент не выбран: заметка будет на время кадра. Щёлкните по кадру на паузе, чтобы привязать её к элементу.',
      notePh: 'Что не так в этом кадре (Ctrl+Enter — сохранить)', save: 'Сохранить заметку', unpick: 'Снять выбор',
      knobs: 'Ручки без перерендера', knobsHint: 'Меняют только предпросмотр. В исходники правка уходит заметкой «поменять X на Y».',
      palette: 'Палитра (:root в film/index.html)', fontDisplay: 'Акцидентный шрифт (Display)', fontUI: 'Шрифт интерфейса (UI)',
      text: 'Текст выбранного элемента', applyText: 'Показать в кадре', pending: 'Правки, ещё не записанные', saveTweaks: 'Записать правки заметками', reset: 'Сбросить',
      notes: 'Заметки', none: 'Пока нет', asIs: 'как в фильме', scene: 'сцена', mark: 'метка', el: 'элемент', time: 'время', voice: 'голос', color: 'цвет', size: 'кегль',
      saved: (n) => `Сохранено: заметка ${n}`, savedLocal: 'Сервера нет: заметка в браузере, заберите её кнопкой «Скопировать для Claude»',
      copied: 'Скопировано в буфер', copyFail: 'Буфер недоступен: текст ниже, скопируйте вручную', offline: 'без сервера: заметки в браузере', online: 'заметки → docs/notes.json',
      noText: 'У элемента нет своего текста', textDyn: 'Текст этого элемента пишет сцена на каждом кадре: правка видна до следующей перемотки',
      chColor: (v, a, b) => `поменять цвет ${v} (film/index.html :root) с ${a} на ${b}`,
      chFont: (r, a, b) => `поменять шрифт ${r} с «${a}» на «${b}»`,
      chText: (a, b) => `поменять текст «${a}» на «${b}»`,
      clipHead: (title, d, n) => `Заметки к ролику «${title}» из плеера, ${d}, всего ${n}.`,
      clipSaved: 'Уже записаны в docs/notes.json:', clipLocal: 'Не записаны — внести командами из корня проекта:', clipNone: 'Новых заметок нет.',
      loadFail: 'Фильм не загрузился: ', play: 'пуск', pause: 'пауза',
    },
    en: {
      copy: 'Copy for Claude', hintPlay: 'Space plays and pauses. Paused, click an element in the frame', hintPause: 'Click an element in the frame to leave a note',
      note: 'Note', noSel: 'Nothing picked: the note goes on the frame time. Pause and click the frame to tie it to an element.',
      notePh: 'What is wrong in this frame (Ctrl+Enter saves)', save: 'Save note', unpick: 'Clear pick',
      knobs: 'Knobs, no re-render', knobsHint: 'They change the preview only. The sources change through a note "change X to Y".',
      palette: 'Palette (:root in film/index.html)', fontDisplay: 'Display face', fontUI: 'UI face',
      text: 'Text of the picked element', applyText: 'Show in frame', pending: 'Changes not written yet', saveTweaks: 'Write changes as notes', reset: 'Reset',
      notes: 'Notes', none: 'None yet', asIs: 'as in the film', scene: 'scene', mark: 'mark', el: 'element', time: 'time', voice: 'voice', color: 'colour', size: 'size',
      saved: (n) => `Saved: note ${n}`, savedLocal: 'No server: the note is kept in the browser; take it out with "Copy for Claude"',
      copied: 'Copied to the clipboard', copyFail: 'No clipboard: the text is below, copy it by hand', offline: 'no server: notes in the browser', online: 'notes → docs/notes.json',
      noText: 'The element has no text of its own', textDyn: 'A scene writes this text every frame: the edit shows until the next seek',
      chColor: (v, a, b) => `change colour ${v} (film/index.html :root) from ${a} to ${b}`,
      chFont: (r, a, b) => `change the ${r} face from "${a}" to "${b}"`,
      chText: (a, b) => `change text "${a}" to "${b}"`,
      clipHead: (title, d, n) => `Notes on "${title}" from the player, ${d}, ${n} in total.`,
      clipSaved: 'Already in docs/notes.json:', clipLocal: 'Not saved: add them from the project root with:', clipNone: 'No new notes.',
      loadFail: 'The film failed to load: ', play: 'play', pause: 'pause',
    },
  };
  const L = DICT[LANG];
  document.documentElement.lang = LANG;
  for (const e of document.querySelectorAll('[data-i18n]')) e.textContent = L[e.dataset.i18n];
  for (const e of document.querySelectorAll('[data-i18n-ph]')) e.placeholder = L[e.dataset.i18nPh];

  const $ = (s) => document.querySelector(s);
  const frame = $('#film'), screen = $('#screen'), viewport = $('#viewport');
  const SIZES = { '16x9': [1920, 1080], '1x1': [1080, 1080], '4x5': [1080, 1350], '9x16': [1080, 1920] };
  const FONTS = ['Helvetica Neue', 'Arial', 'Avenir Next', 'Futura', 'Gill Sans', 'Georgia', 'Times New Roman', 'Charter', 'Menlo', 'Inter', 'Roboto', 'PT Sans', 'PT Serif'];
  const LS = 'motion-film-player:' + location.pathname;
  const S = {
    fmt: qs.get('fmt'), t: +(qs.get('t') || 0), playing: false, k: 1, W: 1920, H: 1080, dur: 1, fps: 60,
    w: null, doc: null, C: null, marks: [], scenes: [], vo: [], sel: null, server: false, info: {},
    notes: [], local: JSON.parse(localStorage.getItem(LS) || '[]'), session: [],
    tweaks: new Map(), base: {}, audio: null, clock: null,
  };

  // ---------------------------------------------------------------- utils
  const fmtT = (t) => t.toFixed(2);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const short = (s, n = 60) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const status = (msg, bad = false) => { const e = $('#status'); e.textContent = msg; e.classList.toggle('bad', bad); };
  const shq = (s) => '"' + String(s).replace(/[\\"$`]/g, (c) => '\\' + c) + '"';
  async function api(p, body) {
    const r = await fetch(p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`);
    return r.json();
  }
  const ownText = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  const rgbHex = (c) => {
    const m = String(c).match(/rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
    return m ? '#' + [m[1], m[2], m[3]].map((x) => Math.round(+x).toString(16).padStart(2, '0')).join('') : c;
  };

  // ---------------------------------------------------------------- film
  async function boot() {
    try { S.info = await api('/api/info'); S.server = true; } catch { S.server = false; }
    status(S.server ? L.online : L.offline, !S.server);
    if (S.server) await refreshNotes();
    loadFilm();
  }
  function loadFilm() {
    pause();
    frame.onload = async () => {
      try {
        S.w = frame.contentWindow; S.doc = frame.contentDocument;
        await S.w.READY;
        S.C = S.w.C; S.dur = S.w.DURATION; S.fps = S.w.FPS; S.fmt = S.C.FMT;
        [S.W, S.H] = [S.C.W, S.C.H];
        document.title = `${S.C.TL.title || 'motion film'} · player`;
        $('#title').textContent = S.C.TL.title || 'motion film';
        S.marks = Object.entries(S.C.TL.marks || {}).map(([name, b]) => ({ name, t: S.C.bt(b) })).sort((a, b) => a.t - b.t);
        S.scenes = S.C.SCENES.map((sc) => ({ name: sc.name, t0: S.C.bt(sc.from), t1: S.C.bt(sc.to) }));
        S.vo = (S.w.VO || []).map((p) => ({ id: p.id, text: p.text, t0: p.t0, t1: p.t1 }));
        if (!S.base.colors) S.base.colors = readVars();
        buildFormats(); buildTimeline(); buildPalette(); buildFonts(); applyTweaks(); hookFrame(); fit();
        if (S.info.audio && !S.audio) { S.audio = new Audio(S.info.audio); S.audio.preload = 'auto'; }
        seek(S.t); S.ready = true;
      } catch (e) { status(L.loadFail + e.message, true); console.error(e); }
    };
    frame.src = `index.html?fmt=${encodeURIComponent(S.fmt || '')}`;
  }
  function fit() {
    const r = viewport.getBoundingClientRect();
    S.k = Math.min((r.width - 32) / S.W, (r.height - 32) / S.H);
    frame.style.width = S.W + 'px'; frame.style.height = S.H + 'px'; frame.style.transform = `scale(${S.k})`;
    screen.style.width = S.W * S.k + 'px'; screen.style.height = S.H * S.k + 'px';
    drawPick();
  }
  addEventListener('resize', fit);

  function seek(t) {
    S.t = clamp(t, 0, S.dur - 1e-6);
    if (S.w && S.w.seek) S.w.seek(S.t);
    $('#time').textContent = `${fmtT(S.t)} / ${fmtT(S.dur)}`;
    $('#head').style.left = (S.t / S.dur) * 100 + '%';
    const live = sceneAt(S.t);
    for (const e of document.querySelectorAll('.sc')) e.classList.toggle('live', e.dataset.name === live);
    drawPick();
  }
  function play() {
    if (!S.w) return;
    if (S.t >= S.dur - 0.05) S.t = 0;
    S.playing = true; $('#play').textContent = '❚❚'; $('#play').setAttribute('aria-label', L.pause); $('#hint').textContent = L.hintPlay;
    unpick(); $('#hover').style.display = 'none';
    const start = performance.now(), t0 = S.t;
    S.clock = () => t0 + (performance.now() - start) / 1000;
    if (S.audio) {
      S.audio.currentTime = S.t;
      S.audio.play().then(() => { S.clock = () => S.audio.currentTime; }, () => {});   // no sound (autoplay policy): wall clock
    }
    const loop = () => {
      if (!S.playing) return;
      const t = S.clock();
      if (t >= S.dur) { seek(S.dur); pause(); return; }
      seek(t); requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  function pause() {
    S.playing = false; if (S.audio) S.audio.pause();
    $('#play').textContent = '▶'; $('#play').setAttribute('aria-label', L.play); $('#hint').textContent = L.hintPause;
  }
  const toggle = () => (S.playing ? pause() : play());
  $('#play').onclick = toggle;

  // ---------------------------------------------------------------- where in the film
  const sceneAt = (t) => { const live = S.scenes.filter((s) => t >= s.t0 && t < s.t1); return live.length ? live[live.length - 1].name : ''; };
  function markAt(t) {
    let m = null;
    for (const x of S.marks) if (x.t <= t + 1e-6) m = x;
    if (!m) m = S.marks[0];
    if (!m) return '';
    const d = t - m.t;
    return Math.abs(d) < 0.005 ? m.name : `${m.name}${d >= 0 ? '+' : ''}${d.toFixed(2)}s`;
  }
  const voAt = (t) => S.vo.find((p) => t >= p.t0 && t < p.t1) || null;

  // ---------------------------------------------------------------- picking an element in the frame
  function pickAt(x, y) {
    const stack = S.doc.elementsFromPoint(x, y).filter((e) => e !== S.doc.documentElement && e !== S.doc.body && e.id !== 'stage' && !e.hasAttribute('data-scene'));
    return stack.find((e) => ownText(e)) || stack.find((e) => e.tagName !== 'CANVAS') || stack[0] || null;
  }
  function cssPath(e) {
    const parts = [];
    while (e && e.nodeType === 1 && e !== S.doc.body) {
      if (e.id === 'stage') { parts.unshift('#stage'); break; }
      if (e.dataset.scene) { parts.unshift(`[data-scene="${e.dataset.scene}"]`); break; }
      if (e.id) { parts.unshift('#' + CSS.escape(e.id)); break; }
      let s = e.tagName.toLowerCase();
      const cls = [...e.classList].find((c) => c !== 'abs');
      if (cls) s += '.' + cls;
      const sib = e.parentElement ? [...e.parentElement.children].filter((c) => c.tagName === e.tagName) : [];
      if (sib.length > 1) s += `:nth-of-type(${sib.indexOf(e) + 1})`;
      parts.unshift(s); e = e.parentElement;
    }
    return parts.join(' > ');
  }
  function describe(e) {
    const text = short((ownText(e) || e.textContent || '').replace(/\s+/g, ' ').trim(), 80);
    const line = e.closest('.line, .cap');
    const lineText = line && line !== e ? short(line.textContent.replace(/\s+/g, ' ').trim(), 80) : '';
    const ui = e.closest('[data-ui]');
    const cs = S.w.getComputedStyle(e);
    const addr = [text && `text:"${text}"`, lineText && `line:"${lineText}"`, ui && `ui:${ui.dataset.ui}`, `css:${cssPath(e)}`].filter(Boolean).join(' · ');
    return { el: e, text, lineText, addr, scene: (e.closest('[data-scene]') || {}).dataset?.scene || sceneAt(S.t),
      color: rgbHex(cs.color), bg: rgbHex(cs.backgroundColor), size: cs.fontSize, family: cs.fontFamily, tag: e.tagName.toLowerCase() };
  }
  function toFilm(ev) {   // a player-page event → film px (the iframe is scaled by S.k)
    const r = frame.getBoundingClientRect();
    return [(ev.clientX - r.left) / S.k, (ev.clientY - r.top) / S.k];
  }
  function hookFrame() {
    const d = S.doc;
    d.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      if (S.playing) { pause(); return; }
      const e = pickAt(ev.clientX, ev.clientY);
      if (e) select(e);
    }, true);
    d.addEventListener('mousemove', (ev) => {
      if (S.playing) return;
      const e = pickAt(ev.clientX, ev.clientY);
      box($('#hover'), e && e !== (S.sel && S.sel.el) ? e : null);
    }, true);
    d.addEventListener('mouseleave', () => box($('#hover'), null));
    d.addEventListener('keydown', keys, true);
  }
  function box(div, e) {
    if (!e || !e.isConnected) { div.style.display = 'none'; return; }
    const r = e.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) { div.style.display = 'none'; return; }
    Object.assign(div.style, { display: 'block', left: r.left * S.k - 2 + 'px', top: r.top * S.k - 2 + 'px', width: r.width * S.k + 4 + 'px', height: r.height * S.k + 4 + 'px' });
  }
  const drawPick = () => box($('#pick'), S.sel && S.sel.el);
  function select(e) {
    S.sel = describe(e);
    const s = S.sel, vo = voAt(S.t);
    $('#selinfo').innerHTML = '';
    const kv = document.createElement('div'); kv.className = 'kv';
    const rows = [[L.time, `${fmtT(S.t)} s`], [L.scene, s.scene], [L.mark, markAt(S.t)], vo && [L.voice, short(vo.text, 70)],
      [L.el, s.text ? `«${s.text}»` : `<${s.tag}>`], [L.color, `${s.color}${s.bg !== '#000000' && !/rgba\(0, 0, 0, 0\)/.test(s.bg) ? ' / ' + s.bg : ''}`], [L.size, s.size]];
    for (const r of rows.filter(Boolean)) {
      const b = document.createElement('b'); b.textContent = r[0];
      const v = document.createElement('span'); v.textContent = r[1];
      kv.append(b, v);
    }
    const c = document.createElement('code'); c.textContent = cssPath(e);
    $('#selinfo').append(kv, c);
    const editable = !!ownText(e) && !e.children.length;
    $('#edittext').disabled = !editable; $('#applytext').disabled = !editable;
    $('#edittext').value = editable ? e.textContent : '';
    $('#textinfo').textContent = editable ? '' : L.noText;
    drawPick(); box($('#hover'), null);
    $('#notetext').focus();
  }
  function unpick() {
    S.sel = null; drawPick();
    $('#selinfo').textContent = L.noSel; $('#edittext').value = ''; $('#edittext').disabled = true; $('#applytext').disabled = true; $('#textinfo').textContent = '';
  }
  $('#unpick').onclick = unpick;

  // ---------------------------------------------------------------- notes
  function noteAt(text, extra = {}) {
    const vo = voAt(S.t);
    return { t: +S.t.toFixed(3), text, scene: (S.sel && S.sel.scene) || sceneAt(S.t), mark: markAt(S.t), fmt: S.fmt,
      ...(S.sel && { el: S.sel.addr }), ...(vo && { vo: vo.id }), ...extra };
  }
  async function saveNote(note) {
    if (S.server) {
      try {
        const saved = await api('/api/notes', note);
        S.session.push({ ...saved, saved: true }); await refreshNotes();
        return L.saved(saved.n);
      } catch (e) { console.warn(e); }
    }
    const local = { ...note, n: 'local-' + (S.local.length + 1), open: true, at: today() };
    S.local.push(local); S.session.push({ ...local, saved: false });
    localStorage.setItem(LS, JSON.stringify(S.local)); renderNotes();
    return L.savedLocal;
  }
  $('#savenote').onclick = async () => {
    const text = $('#notetext').value.trim();
    if (!text) { $('#notetext').focus(); return; }
    $('#saveinfo').textContent = await saveNote(noteAt(text));
    $('#notetext').value = '';
  };
  $('#notetext').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) $('#savenote').click(); });
  async function refreshNotes() {
    try { S.notes = await api('/api/notes'); } catch { S.notes = []; }
    renderNotes();
  }
  function renderNotes() {
    const ul = $('#notes'); ul.innerHTML = '';
    const all = [...S.notes, ...S.local.map((x) => ({ ...x, local: true }))].sort((a, b) => a.t - b.t);
    if (!all.length) { const li = document.createElement('li'); li.className = 'muted'; li.textContent = L.none; ul.append(li); }
    for (const x of all) {
      const li = document.createElement('li'); if (!x.open) li.classList.add('closed');
      const t = document.createElement('span'); t.className = 't'; t.textContent = fmtT(x.t);
      const tx = document.createElement('span'); tx.textContent = `${x.n}. ${x.text}`;
      if (x.local) { const g = document.createElement('span'); g.className = 'tag'; g.textContent = 'local'; tx.append(g); }
      li.append(t, tx);
      if (x.el) { const el = document.createElement('span'); el.className = 'el'; el.textContent = x.el; li.append(el); }
      li.onclick = () => { pause(); seek(x.t); };
      ul.append(li);
    }
    buildPins();
  }

  // "Copy for Claude": every note from this session plus the open ones from docs/notes.json; unsaved ones as notes.py commands
  function claudeText() {
    const title = (S.C && S.C.TL.title) || 'motion film';
    const saved = S.notes.filter((x) => x.open);
    const local = S.local.filter((x) => x.open);
    const line = (x) => `- ${x.n}. t=${fmtT(x.t)} · ${L.scene} ${x.scene || '—'} · ${L.mark} ${x.mark || '—'}${x.fmt ? ' · ' + x.fmt : ''}${x.el ? `\n  ${L.el}: ${x.el}` : ''}\n  ${x.text}`;
    const out = [L.clipHead(title, today(), saved.length + local.length)];
    if (saved.length) out.push('', L.clipSaved, ...saved.map(line));
    if (local.length) {
      out.push('', L.clipLocal, ...local.map(line), '');
      for (const x of local) out.push(`python3 scripts/notes.py add ${+x.t.toFixed(3)} ${shq(x.text)}${x.el ? ' --el ' + shq(x.el) : ''}`);
    }
    if (!saved.length && !local.length) out.push(L.clipNone);
    return out.join('\n');
  }
  $('#copy').onclick = async () => {
    const text = claudeText(), clip = $('#clip');
    clip.value = text;
    try { await navigator.clipboard.writeText(text); clip.style.display = 'none'; status(L.copied); }
    catch { clip.style.display = 'block'; clip.select(); status(L.copyFail, true); }
  };

  // ---------------------------------------------------------------- knobs: palette, faces, text (preview only)
  function readVars() {
    const out = {};
    for (const sh of S.doc.styleSheets) {
      let rules; try { rules = sh.cssRules; } catch { continue; }
      for (const r of rules) if (r.selectorText === ':root') for (const p of r.style) if (p.startsWith('--')) out[p] = r.style.getPropertyValue(p).trim();
    }
    return out;
  }
  const hexOf = (v) => {   // any CSS colour → #rrggbb (via the film's own parser)
    const p = S.doc.createElement('i'); p.style.color = v; S.doc.body.append(p);
    const c = rgbHex(S.w.getComputedStyle(p).color); p.remove(); return /^#[0-9a-f]{6}$/i.test(c) ? c : null;
  };
  function buildPalette() {
    const box = $('#palette'); box.innerHTML = '';
    for (const [name, base] of Object.entries(S.base.colors)) {
      const hex = hexOf(base); if (!hex) continue;
      const cur = S.tweaks.get('color:' + name)?.to || hex;
      const row = document.createElement('div'); row.className = 'swatch'; row.dataset.var = name;
      const c = document.createElement('code'); c.textContent = name;
      const pick = document.createElement('input'); pick.type = 'color'; pick.value = cur; pick.setAttribute('aria-label', name);
      const txt = document.createElement('input'); txt.type = 'text'; txt.value = cur; txt.setAttribute('aria-label', name);
      const set = (v) => {
        const h = hexOf(v); if (!h) return;
        pick.value = h; txt.value = h;
        if (h === hex) S.tweaks.delete('color:' + name);
        else S.tweaks.set('color:' + name, { kind: 'color', key: name, from: hex, to: h, text: L.chColor(name, hex, h) });
        row.classList.toggle('changed', h !== hex); applyTweaks();
      };
      pick.oninput = () => set(pick.value); txt.onchange = () => set(txt.value);
      row.classList.toggle('changed', cur !== hex);
      row.append(c, pick, txt); box.append(row);
    }
  }
  function buildFonts() {
    for (const [id, role] of [['#fontDisplay', 'Display'], ['#fontUI', 'UI']]) {
      const sel = $(id), cur = S.tweaks.get('font:' + role)?.to || '';
      sel.innerHTML = '';
      for (const f of ['', ...FONTS]) {
        const o = document.createElement('option'); o.value = f; o.textContent = f || `${L.asIs} (${role})`; sel.append(o);
      }
      sel.value = cur;
      sel.onchange = () => {
        if (!sel.value) S.tweaks.delete('font:' + role);
        else S.tweaks.set('font:' + role, { kind: 'font', key: role, from: role, to: sel.value, text: L.chFont(role, faceOf(role), sel.value) });
        applyTweaks();
      };
    }
  }
  function faceOf(role) {   // what the film loads for a face: the @font-face src, e.g. "assets/fonts/display.woff2"
    for (const sh of S.doc.styleSheets) {
      let rules; try { rules = sh.cssRules; } catch { continue; }
      for (const r of rules) if (r.type === 5 && r.style.getPropertyValue('font-family').replace(/['"]/g, '').trim() === role) {
        const src = r.style.getPropertyValue('src'); const m = src.match(/url\(["']?([^"')]+)/) || src.match(/local\(["']?([^"')]+)/);
        if (m) return `${role}: ${m[1].replace(/^\.\.\//, '')}`;
      }
    }
    return role;
  }
  // tweaks are re-applied after every film reload (format switch): colours on :root, faces as a late @font-face + class rule
  function applyTweaks() {
    if (!S.doc) return;
    const root = S.doc.documentElement;
    for (const name of Object.keys(S.base.colors || {})) root.style.removeProperty(name);
    let css = '';
    for (const x of S.tweaks.values()) {
      if (x.kind === 'color') root.style.setProperty(x.key, x.to);
      if (x.kind === 'font') {
        css += `@font-face { font-family: '${x.key}'; src: local('${x.to}'); font-weight: 100 900; }\n`;
        css += x.key === 'Display' ? `.display { font-family: '${x.to}', Display, sans-serif !important; }\n` : `#stage { font-family: '${x.to}', UI, sans-serif !important; }\n`;
      }
      if (x.kind === 'text' && x.node && x.node.isConnected) x.node.textContent = x.to;
    }
    let st = S.doc.getElementById('player-tweaks');
    if (!st) { st = S.doc.createElement('style'); st.id = 'player-tweaks'; S.doc.head.append(st); }
    st.textContent = css;
    if (S.w) seek(S.t);
    renderTweaks();
  }
  function renderTweaks() {
    const ul = $('#tweaks'); ul.innerHTML = '';
    for (const x of S.tweaks.values()) { const li = document.createElement('li'); li.textContent = x.text; ul.append(li); }
    if (!S.tweaks.size) { const li = document.createElement('li'); li.className = 'muted'; li.textContent = L.none; ul.append(li); }
    $('#savetweaks').disabled = !S.tweaks.size;
  }
  $('#applytext').onclick = () => {
    if (!S.sel || $('#edittext').disabled) return;
    const e = S.sel.el, key = 'text:' + S.sel.addr, to = $('#edittext').value;
    if (to === e.textContent) return;
    const from = S.tweaks.get(key)?.from ?? e.textContent;
    S.tweaks.set(key, { kind: 'text', key, node: e, from, to, t: S.t, el: S.sel.addr, scene: S.sel.scene, text: L.chText(from, to) });
    applyTweaks();
    $('#textinfo').textContent = e.textContent === to ? '' : L.textDyn;
    drawPick();
  };
  $('#savetweaks').onclick = async () => {
    let last = '';
    for (const [key, x] of [...S.tweaks]) {
      const note = x.kind === 'text' ? { ...noteAt(x.text), t: +x.t.toFixed(3), el: x.el, scene: x.scene, kind: 'tweak' }
        : { t: +S.t.toFixed(3), text: x.text, scene: sceneAt(S.t), mark: markAt(S.t), fmt: S.fmt, el: x.kind === 'color' ? `css:${x.key}` : `font:${x.key}`, kind: 'tweak' };
      last = await saveNote(note);
      S.tweaks.get(key).saved = true;
    }
    $('#saveinfo').textContent = last;
    renderTweaks();
  };
  $('#resettweaks').onclick = () => {
    for (const x of S.tweaks.values()) if (x.kind === 'text' && x.node && x.node.isConnected) x.node.textContent = x.from;
    S.tweaks.clear(); buildPalette(); buildFonts(); applyTweaks();
  };

  // ---------------------------------------------------------------- formats and timeline
  function buildFormats() {
    const box = $('#fmts'); box.innerHTML = '';
    for (const f of S.C.TL.formats || [S.fmt]) {
      const b = document.createElement('button'); b.textContent = f.replace('x', ':'); b.setAttribute('aria-pressed', String(f === S.fmt));
      b.onclick = () => { if (f !== S.fmt) { S.fmt = f; unpick(); loadFilm(); } };
      box.append(b);
    }
  }
  const pct = (t) => (t / S.dur) * 100 + '%';
  function buildTimeline() {
    const sc = $('#scenes'), mk = $('#marks'), vo = $('#vo');
    sc.innerHTML = mk.innerHTML = vo.innerHTML = '';
    for (const s of S.scenes) {
      const d = document.createElement('div'); d.className = 'sc'; d.dataset.name = s.name; d.textContent = s.name; d.title = `${s.name} ${fmtT(s.t0)}–${fmtT(s.t1)}`;
      d.style.left = pct(s.t0); d.style.width = `calc(${pct(Math.min(S.dur, s.t1) - s.t0)} - 2px)`; sc.append(d);
    }
    const voIds = new Set(S.vo.map((p) => p.id));
    for (const m of S.marks) {
      if (m.t < 0 || m.t > S.dur) continue;
      const d = document.createElement('div'); d.className = 'mk' + (voIds.has(m.name.split('.')[0]) ? ' vo' : ''); d.title = `${m.name} · ${fmtT(m.t)}`; d.style.left = pct(m.t); mk.append(d);
    }
    for (const p of S.vo) {
      const d = document.createElement('div'); d.className = 'ph'; d.title = `${p.id}: ${p.text}`; d.style.left = pct(p.t0); d.style.width = pct(p.t1 - p.t0); vo.append(d);
    }
    buildPins();
  }
  function buildPins() {
    const pins = $('#pins'); if (!S.dur) return; pins.innerHTML = '';
    for (const x of [...S.notes, ...S.local]) {
      const d = document.createElement('div'); d.className = 'pin' + (x.open ? '' : ' closed'); d.title = `${x.n}. ${x.text}`; d.style.left = pct(x.t); pins.append(d);
    }
  }
  const tl = $('#tl');
  const scrub = (ev) => { const r = tl.getBoundingClientRect(); seek(((ev.clientX - r.left) / r.width) * S.dur); };
  tl.addEventListener('pointerdown', (ev) => { pause(); unpick(); tl.setPointerCapture(ev.pointerId); scrub(ev); tl.onpointermove = scrub; });
  tl.addEventListener('pointerup', () => { tl.onpointermove = null; });

  function keys(ev) {
    const tag = (ev.target && ev.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if (ev.code === 'Space') { ev.preventDefault(); toggle(); }
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      ev.preventDefault(); pause();
      seek(S.t + (ev.key === 'ArrowLeft' ? -1 : 1) * (ev.shiftKey ? 1 : 1 / S.fps));
    } else if (ev.key === 'Escape') unpick();
  }
  addEventListener('keydown', keys);

  // for scripts/player.mjs --selftest and for debugging from the console
  window.PLAYER = { S, seek, play, pause, select, pickAt, claudeText, get ready() { return !!S.ready; } };
  renderTweaks(); boot();
})();
