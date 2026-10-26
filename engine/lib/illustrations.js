// Original motion-film artwork. MIT. Static geometry plus absolute, inspectable semantic state.
// Object diagrams are illustrative, not replicas of a product interface.
// Only reusable objects live here; film-specific objects belong in the film project.
// Geometry is drawn once; the skin (line, flat, mono, sketch) and palette decide how it is painted.
(() => {
  // `line` values are the original artwork colours; other inks/papers derive greys by mixing paper→ink.
  const LINE = { ink:'#202421', paper:'#fffef9', accent:'#c83d29', second:'#566851', shadow:'#202421', muted:'#a9aea5', edge:'#d8d9d0',
    metal:'#70796f', dark:'#343c35', darkEdge:'#596257', line2:'#87917f', tint:'#e6e8df', tint2:'#e8e9e1', key:'#e5e7df', tint4:'#e3e6dc' };
  const GREY = { muted:.4, edge:.17, metal:.6, dark:.87, darkEdge:.7, line2:.5, tint:.1, tint2:.1, key:.1, tint4:.12 };
  const SKINS = ['line', 'flat', 'mono', 'sketch'];
  const hex = /^#[0-9a-fA-F]{6}$/;
  const mix = (a, b, p) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - p) + parseInt(b.slice(i, i + 2), 16) * p)
    .toString(16).padStart(2, '0')).join('');
  let defaults = { skin:'line', palette:{}, extras:true };
  function colours(skin, custom) {
    for (const [k, v] of Object.entries(custom)) {
      if (!(k in LINE)) throw new Error(`unknown illustration palette colour ${k}`);
      if (!hex.test(v)) throw new Error(`illustration colour ${k} must be #rrggbb`);
    }
    const c = { ...LINE, ...custom };
    if (custom.ink || custom.paper) for (const k in GREY) if (!custom[k]) c[k] = mix(c.paper, c.ink, GREY[k]);
    // mono: two inks and the accent; light greys become paper, mid/dark greys become ink.
    if (skin === 'mono') for (const k in GREY) if (!custom[k]) c[k] = GREY[k] < .3 || k === 'darkEdge' || k === 'line2' ? c.paper : c.ink;
    if (skin === 'mono' && !custom.second) c.second = c.ink;
    if (skin === 'sketch') for (const k of ['tint', 'tint2', 'key', 'tint4', 'edge']) if (!custom[k]) c[k] = mix(c.paper, c.ink, .06);
    return c;
  }
  // Drawing kit bound to one palette/skin. In `line` the markup is byte-identical to the original artwork.
  function kit(c, skin, uid) {
    const fx = skin === 'sketch' ? ` filter="url(#${uid})"` : '';
    const paint = (fill, stroke) => (skin === 'flat' && fill !== 'none' ? [fill, 'none'] : [fill, stroke]);
    const path = (d, fill = 'none', stroke = c.ink, width = 4, extra = '') => { [fill, stroke] = paint(fill, stroke);
      return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${fx}${extra ? ' ' + extra : ''}/>`; };
    const rect = (x, y, w, h, r = 8, fill = c.paper, stroke = c.ink, sw = 3, extra = '') => { [fill, stroke] = paint(fill, stroke);
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${fx}${extra ? ' ' + extra : ''}/>`; };
    const circle = (x, y, r, fill = c.paper, stroke = c.ink, sw = 3, extra = '') => { [fill, stroke] = paint(fill, stroke);
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${fx}${extra ? ' ' + extra : ''}/>`; };
    const ellipse = (x, y, rx, ry, fill = 'none', stroke = c.ink, sw = 3) => { [fill, stroke] = paint(fill, stroke);
      return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${fx}/>`; };
    const text = (x, y, s, size = 24, fill = c.ink, extra = '') => `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-family="UI,Arial,sans-serif" ${extra}>${String(s).replace(/[&<>]/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[ch]))}</text>`;
    const label = (s) => text(200, 288, s, 17, c.ink, 'data-field="label" text-anchor="middle" letter-spacing="3"');
    const shadow = (x = 70, y = 247, w = 260) => `<ellipse cx="${x + w / 2}" cy="${y}" rx="${w / 2}" ry="10" fill="${c.shadow}" opacity=".08"/>`;
    const paperCard = (body) => shadow() + rect(74, 34, 260, 216, 14, c.edge, c.edge, 0) + rect(66, 24, 260, 216, 14) + body;
    return { c, path, rect, circle, ellipse, text, label, shadow, paperCard };
  }
  const visible = (node, on) => node.setAttribute('visibility', on ? 'inherit' : 'hidden');
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  // Coiled cord between two points: a prolate trochoid along a sagging line, split at `at`.
  function coil(a, b, cut, at = .55, loops = 11, r = 13) {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), d = [dx / len, dy / len], n = [-d[1], d[0]];
    const point = (s) => { const w = 2 * Math.PI * loops * s, sag = 18 * Math.sin(Math.PI * s);
      const gap = cut * 24 * (s < at ? -1 : 1), drop = cut * 26 * (s < at ? (s / at) ** 2 : ((1 - s) / (1 - at)) ** 2);
      return [a[0] + dx * s + n[0] * r * Math.sin(w) + d[0] * (r * .9 * Math.cos(w) - r * .9 + gap), a[1] + dy * s + sag + n[1] * r * Math.sin(w) + d[1] * (r * .9 * Math.cos(w) - r * .9 + gap) + drop]; };
    const run = (s0, s1) => { const pts = []; for (let i = 0; i <= 160; i++) pts.push(point(s0 + (s1 - s0) * i / 160)); return 'M' + pts.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join('L'); };
    return { first: run(0, at), second: run(at, 1), mid: point(at) };
  }
  const kinds = {
    server:{ svg:({ path, rect, circle, label, shadow, c }) => shadow() + path('M124 49l54-25h118l-54 25z', c.edge) + path('M242 49l54-25v195l-54 26z', c.metal) +
      rect(108, 48, 135, 195, 7, c.ink, c.ink) + [0, 1, 2].map((i) => rect(120, 65 + i * 55, 110, 42, 4, c.dark, c.darkEdge, 2) + circle(136, 86 + i * 55, 4, c.accent, c.accent, 0) + path(`M152 ${80 + i * 55}h61M152 ${90 + i * 55}h61`, 'none', c.line2, 3)).join('') +
      label('SERVER') },
    visitor:{ svg:({ path, circle, label, shadow, c }) => shadow() + circle(200, 118, 76, c.tint) + path('M134 114c-4-66 33-88 68-86 48 3 66 41 63 87l-23-25-8-29-30 18-54 1z', c.ink, c.ink) +
      path('M154 118v20c0 34 19 58 47 58s48-23 48-58v-21l-17-28-45 7-30-6z', c.paper, c.ink) +
      circle(182, 127, 4, c.ink, c.ink, 0) + circle(221, 127, 4, c.ink, c.ink, 0) + path('M187 159q15 11 28-1M203 134l-3 11h8', 'none', c.ink, 3) +
      path('M104 251v-28c2-27 36-37 67-44l29 25 29-25c44 9 67 20 67 45v27z', c.ink, c.ink) +
      path('M177 186l23 18 24-18-8 65h-32z', c.paper, c.ink) + label('VISITOR') },
    keyboard:{ svg:({ path, rect, label, shadow, c }) => shadow() + path('M56 112h282l26 124H30z', c.edge, c.ink) + path('M56 112h282l-12 101H45z', c.paper, c.ink) +
      Array.from({ length:30 }, (_, i) => { const row = Math.floor(i / 10), col = i % 10; return rect(61 + col * 26 - row * 4, 124 + row * 23, 20, 17, 3, c.key, c.ink, 1.5).replace('<rect ', `<rect data-key="${i}" `); }).join('') +
      rect(124, 192, 112, 13, 3, c.ink, c.ink, 0) + label('KEYBOARD'),
      draw:(q, s, c) => q.keys.forEach((key, i) => key.setAttribute('fill', s.key === i ? c.accent : c.key)) },
    envelope:{ svg:({ path, rect, text, label, shadow, c }) => shadow() + path('M63 123l137-94 137 94v113H63z', c.tint2) +
      `<g data-part="letter">${rect(93, 45, 214, 173, 8) + text(115, 85, 'LETTER', 20, c.ink, 'data-field="title" font-weight="700"') + path('M115 104h150M115 116h173M115 128h150M115 140h120', 'none', c.muted, 4)}</g>` +
      path('M63 123l137 76 137-76v113H63z', c.paper) + path('M63 236l109-73M337 236l-109-73', 'none', c.edge, 3) + label('EMAIL'),
      draw:(q, s) => q.part.letter.setAttribute('transform', `translate(0 ${-35 * (s.open ?? 0)})`) },
    bill:{ svg:({ path, text, label, shadow, c }) => shadow() + path('M114 27h174v219l-15-9-14 9-15-9-14 9-15-9-15 9-14-9-15 9-14-9-14 9-14-9-15 9z', c.paper) +
      text(136, 60, 'INVOICE', 13, c.ink, 'data-field="title" letter-spacing="1"') + text(135, 124, '—', 55, c.ink, 'data-field="amount" font-weight="700"') +
      path('M136 173h127M136 186h104', 'none', c.edge, 4) + path('M136 215h127', 'none', c.ink, 4) + label('RECEIPT') },
    gift:{ svg:({ path, rect, label, shadow, c }) => shadow() + rect(92, 116, 217, 126, 4, c.edge) + rect(78, 95, 246, 46, 4, c.paper) + rect(184, 95, 35, 148, 0, c.accent, c.accent, 0) +
      path('M200 94c-86 13-111-67-57-66 31 0 47 39 57 66z', c.accent, c.ink) + path('M203 94c85 13 110-67 56-66-31 0-47 39-56 66z', c.accent, c.ink) +
      path('M201 95v146', 'none', c.paper, 2) + label('GIFT') },
    shield:{ svg:({ path, label, shadow, c }) => shadow() + path('M199 28c45 29 77 32 103 35v89c0 51-44 78-103 99-60-21-103-48-103-99V63c26-3 58-6 103-35z', c.paper) +
      path('M199 47c35 21 60 25 84 29v76c0 38-34 61-84 80-49-19-83-42-83-80V76c23-4 48-8 83-29z', c.accent, c.accent) +
      path('M150 137l33 33 66-69', 'none', c.paper, 14) + label('PROTECTED') },
    gavel:{ svg:({ rect, label, shadow, c }) => shadow() + rect(125, 205, 170, 27, 8, c.ink) + rect(141, 190, 138, 19, 5, c.paper) +
      `<g transform="rotate(-35 200 120)">${rect(184, 80, 28, 116, 8, c.accent) + rect(125, 60, 146, 57, 8, c.paper) + rect(123, 53, 21, 72, 4, c.edge) + rect(252, 53, 21, 72, 4, c.edge)}</g>` + label('VERDICT') },
    globe:{ svg:({ path, circle, ellipse, label, shadow, c }) => shadow() + circle(200, 132, 103, c.paper) + ellipse(200, 132, 46, 103) +
      path('M98 132h204M113 80q87 40 174 0M113 184q87-40 174 0M200 29v206', 'none', c.ink, 3) + circle(262, 87, 15, c.accent, c.paper, 4) + label('INTERNET') },
    image:{ svg:({ path, rect, circle, label, paperCard, c }) => paperCard(rect(86, 48, 220, 159, 7, c.tint4, c.ink, 2) + circle(254, 90, 23, c.accent, c.accent, 0) + path('M87 185l61-75 55 55 36-30 66 72H87z', c.second, c.ink, 2)) + label('IMAGE') },
    document:{ svg:({ path, rect, text, label, paperCard, c }) => paperCard(text(90, 61, 'CHECKLIST', 15, c.accent, 'data-field="title" letter-spacing="2"') +
      [0, 1, 2, 3].map((i) => rect(91, 81 + i * 33, 17, 17, 3, c.paper, c.ink, 2) + `<path data-check="${i}" d="M94 ${90 + i * 33}l4 4 8-10" fill="none" stroke="${c.accent}" stroke-width="3"/>` + path(`M119 ${90 + i * 33}h${i === 3 ? 100 : 166}`, 'none', i === 3 ? c.accent : c.ink, 4)).join('')) + label('DOCUMENT'),
      draw:(q, s) => q.checks.forEach((check, i) => visible(check, i < (s.checked ?? 0))) },

    // Handset with a coiled cord. cut 0–1 parts the cord; ring 0–1 is a phase that rattles the handset; tag labels the cut.
    phone:{ svg:({ path, rect, text, label, shadow, c }) => shadow(60, 247, 290) +
      `<path data-part="cord-a" d="" fill="none" stroke="${c.ink}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path data-part="cord-b" d="" fill="none" stroke="${c.ink}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>` +
      rect(352, 200, 34, 20, 4, c.dark, c.ink, 3) +
      `<g data-part="handset">${path('M-74 6C-42-34 42-34 74 6L64 18C34-14-34-14-64 18Z', c.paper) + rect(-118, -6, 56, 42, 14, c.paper) + rect(62, -6, 56, 42, 14, c.paper) +
        path('M-108 26h36M72 26h36', 'none', c.edge, 4) + path('M-58 10C-30-14 30-14 58 10', 'none', c.edge, 3)}</g>` +
      `<g data-part="ring">${path('M30 96q-14 16 0 32M14 102q-8 10 0 20M212 6q18 4 22 22M220-8q26 6 30 32', 'none', c.accent, 4)}</g>` +
      `<g data-part="snip">${path('M-14-14l28 28M14-14l-28 28', 'none', c.accent, 5)}</g>` +
      `<g data-part="tag"><path data-part="tag-line" d="" fill="none" stroke="${c.ink}" stroke-width="2" stroke-dasharray="5 5"/>${rect(36, 196, 160, 44, 10, c.ink, c.ink, 0) +
        text(116, 225, '', 20, c.paper, 'data-field="tag" text-anchor="middle" font-weight="700" letter-spacing="1"')}</g>` + label('PHONE'),
      draw:(q, s) => {
        const ring = clamp(s.ring ?? 0), shake = ring > 0 && ring < 1 ? 7 * Math.sin(ring * Math.PI * 14) : 0, angle = (-16 + shake) * Math.PI / 180, ox = 124, oy = 66;
        q.part.handset.setAttribute('transform', `translate(${ox} ${oy}) rotate(${(-16 + shake).toFixed(2)})`);
        const start = [ox + 92 * Math.cos(angle) - 36 * Math.sin(angle), oy + 92 * Math.sin(angle) + 36 * Math.cos(angle)];
        const cord = coil(start, [356, 210], clamp(s.cut ?? 0), .5, 14);
        q.part['cord-a'].setAttribute('d', cord.first); q.part['cord-b'].setAttribute('d', cord.second);
        visible(q.part.ring, ring > 0 && ring < 1);
        visible(q.part.snip, (s.cut ?? 0) > 0); q.part.snip.setAttribute('transform', `translate(${cord.mid[0].toFixed(1)} ${cord.mid[1].toFixed(1)})`);
        visible(q.part.tag, q.field.tag.textContent !== '');
        q.part['tag-line'].setAttribute('d', `M150 196L${(cord.mid[0] - 10).toFixed(1)} ${(cord.mid[1] + 14).toFixed(1)}`);
      } },
    // Month grid. day highlights one cell (−1 none); marks rings the first N repeating cells (opts.start, opts.every).
    calendar:{ svg:({ rect, text, label, shadow, c }) => shadow() + rect(80, 40, 240, 202, 12, c.paper) + rect(80, 40, 240, 46, 12, c.accent, c.ink) + rect(81.5, 66, 237, 20, 0, c.accent, c.accent, 0) +
      rect(128, 24, 12, 32, 6, c.ink, c.ink, 0) + rect(260, 24, 12, 32, 6, c.ink, c.ink, 0) +
      text(200, 72, 'MONTH', 20, c.paper, 'data-field="title" text-anchor="middle" font-weight="700" letter-spacing="3"') +
      `<circle data-part="day" cx="0" cy="0" r="13" fill="${c.accent}" opacity=".3"/>` +
      Array.from({ length:35 }, (_, i) => { const d = i - 1, x = 110 + (i % 7) * 30, y = 113 + Math.floor(i / 7) * 26;
        return (d >= 1 && d <= 31 ? text(x, y, d, 13, c.ink, 'text-anchor="middle"') : '') + `<circle data-mark="${i}" cx="${x}" cy="${y - 5}" r="12" fill="none" stroke="${c.accent}" stroke-width="3"/>`; }).join('') + label('CALENDAR'),
      draw:(q, s, c, o) => {
        const day = s.day ?? -1, every = o.every ?? 7, start = o.start ?? 4, marks = s.marks ?? 0, chosen = [];
        for (let i = start; i < 35; i += every) chosen.push(i);
        visible(q.part.day, day >= 0 && day < 35);
        if (day >= 0 && day < 35) q.part.day.setAttribute('transform', `translate(${110 + (day % 7) * 30} ${108 + Math.floor(day / 7) * 26})`);
        q.marks.forEach((m) => visible(m, chosen.indexOf(+m.dataset.mark) > -1 && chosen.indexOf(+m.dataset.mark) < marks));
      } },
    // Payment card. chip 0–1 slides the amount pill out from behind the card; declined 0–1 crosses the card.
    card:{ svg:({ path, rect, text, label, shadow, c }) => shadow() +
      `<g data-part="chip">${rect(-64, -24, 128, 48, 24, c.accent, c.ink, 3) + text(0, 9, '—', 24, c.paper, 'data-field="amount" text-anchor="middle" font-weight="700"')}</g>` +
      rect(70, 46, 260, 166, 16, c.second, c.ink, 3) + rect(96, 98, 42, 32, 6, c.tint4, c.ink, 2) + path('M96 114h42M117 98v32', 'none', c.ink, 2) +
      path('M290 98q8 12 0 24M302 92q12 18 0 36', 'none', c.paper, 3) +
      text(96, 80, 'BANK', 16, c.paper, 'data-field="title" font-weight="700" letter-spacing="3"') +
      text(96, 176, '•••• 0000', 22, c.paper, 'data-field="number" letter-spacing="2"') +
      `<g data-part="declined">${path('M150 80l100 100M250 80l-100 100', 'none', c.paper, 22) + path('M150 80l100 100M250 80l-100 100', 'none', c.accent, 14)}</g>` + label('CARD'),
      draw:(q, s) => { const p = clamp(s.chip ?? 0), d = clamp(s.declined ?? 0);
        visible(q.part.chip, p > 0); q.part.chip.setAttribute('transform', `translate(262 ${(150 + 86 * p).toFixed(2)})`);
        visible(q.part.declined, d > 0); q.part.declined.setAttribute('transform', `translate(200 130) scale(${(1.4 - .4 * d).toFixed(3)}) translate(-200 -130)`); } },
    // Coin stack: count 0–8 coins; amount is the sum beside it.
    coins:{ svg:({ path, ellipse, text, label, shadow, c }) => shadow() +
      Array.from({ length:8 }, (_, i) => { const y = 218 - i * 19;
        return `<g data-coin="${i}">${path(`M70 ${y}v13a62 19 0 0 0 124 0v-13`, c.edge, c.ink, 3) + ellipse(132, y, 62, 19, c.paper, c.ink, 3) + ellipse(132, y, 42, 12, 'none', c.edge, 3)}</g>`; }).join('') +
      text(290, 160, '—', 40, c.ink, 'data-field="amount" text-anchor="middle" font-weight="700"') + label('MONEY'),
      draw:(q, s) => q.coins.forEach((n, i) => visible(n, i < (s.count ?? 8))) },
    // Chat window. shown 0–3 bubbles (m0 in, m1 out, m2 in); typing 0–1 phase of the dots; input text with caret 0/1.
    chat:{ svg:({ path, rect, circle, text, label, shadow, c }) => shadow() + rect(58, 18, 284, 234, 14, c.paper) +
      path('M58 32a14 14 0 0 1 14-14h256a14 14 0 0 1 14 14v22H58z', c.tint, c.ink, 3) + text(78, 42, 'CHAT', 15, c.ink, 'data-field="title" font-weight="700" letter-spacing="2"') +
      [0, 1, 2].map((i) => circle(296 + i * 14, 36, 4, c.muted, c.muted, 0)).join('') +
      [[74, 66, c.tint, c.ink, c.muted], [146, 112, c.accent, c.accent, c.paper], [74, 158, c.tint, c.ink, c.muted]].map(([x, y, fill, ink, bar], i) =>
        `<g data-bubble="${i}">${rect(x, y, 180, 38, 14, fill, i === 1 ? c.accent : c.ink, 2) + path(`M${x + 16} ${y + 19}h${i === 1 ? 110 : 130}`, 'none', bar, 7).replace('<path ', `<path data-bar="${i}" `) +
          text(x + 16, y + 25, '', 16, ink === c.accent ? c.paper : c.ink, `data-field="m${i}" font-weight="600"`)}</g>`).join('') +
      `<g data-part="typing">${rect(74, 158, 70, 34, 14, c.tint, c.ink, 2) + [0, 1, 2].map((i) => circle(94 + i * 15, 175, 4.5, c.ink, c.ink, 0).replace('<circle ', `<circle data-dot="${i}" `)).join('')}</g>` +
      rect(74, 208, 252, 30, 15, c.paper, c.ink, 2) + text(90, 228, '', 15, c.ink, 'data-field="input"') +
      `<text data-part="caret" x="90" y="228" font-size="17" font-family="UI,Arial,sans-serif" fill="${c.ink}"><tspan data-part="ghost" font-size="15" fill-opacity="0"></tspan>|</text>` +
      circle(306, 223, 10, c.accent, c.accent, 0) + label('CHAT'),
      draw:(q, s) => { const shown = s.shown ?? 3, typing = s.typing ?? 0;
        q.bubbles.forEach((b, i) => { visible(b, i < shown); visible(q.bars[i], q.field['m' + i].textContent === ''); });
        visible(q.part.typing, typing > 0 && shown < 3);
        q.dots.forEach((d, i) => d.setAttribute('transform', `translate(0 ${(-5 * Math.max(0, Math.sin(2 * Math.PI * (typing * 3 - i * .2)))).toFixed(2)})`));
        visible(q.part.caret, (s.caret ?? 0) >= .5); q.part.ghost.textContent = q.field.input.textContent; } },
    // Form with three rows. filled 0–3 shows values; missing marks one row (−1 none); sent 0/1 turns the button.
    form:{ svg:({ path, rect, circle, text, label, shadow, c }) => shadow() + rect(70, 16, 260, 236, 14, c.paper) +
      text(92, 44, 'FORM', 14, c.accent, 'data-field="title" font-weight="700" letter-spacing="3"') +
      ['NAME', 'EMAIL', 'DATE'].map((f, i) => text(92, 72 + i * 50, f, 12, c.ink, `data-field="f${i}" letter-spacing="2"`) +
        rect(92, 78 + i * 50, 200, 30, 6, c.paper, c.ink, 2, `data-box="${i}"`) + text(104, 99 + i * 50, '', 16, c.ink, `data-field="v${i}" font-weight="600"`) +
        `<g data-flag="${i}">${circle(310, 93 + i * 50, 11, c.accent, c.accent, 0) + text(310, 99 + i * 50, '!', 17, c.paper, 'text-anchor="middle" font-weight="800"')}</g>`).join('') +
      rect(92, 224, 108, 24, 12, c.accent, c.accent, 0, 'data-part="button"') + text(146, 241, 'SUBMIT', 12, c.paper, 'data-field="button" text-anchor="middle" font-weight="700" letter-spacing="2"') + label('FORM'),
      draw:(q, s, c) => { const filled = s.filled ?? 3, missing = s.missing ?? -1, sent = (s.sent ?? 0) >= .5;
        [0, 1, 2].forEach((i) => { visible(q.field['v' + i], i < filled); visible(q.flags[i], i === missing);
          q.boxes[i].setAttribute('stroke', i === missing ? c.accent : c.ink); q.boxes[i].setAttribute('stroke-dasharray', i === missing ? '6 5' : 'none'); });
        q.part.button.setAttribute('fill', sent ? c.second : c.accent); } },
    // Rubber-stamp impression: press 0–1 lands it (1 = resting). Overlay it on any object with C.put.
    stamp:{ svg:({ rect, text, label, c }) => `<g data-part="stamp">${rect(-132, -50, 264, 100, 14, 'none', c.accent, 8) + rect(-118, -36, 236, 72, 8, 'none', c.accent, 2) +
      text(0, 14, 'APPROVED', 40, c.accent, 'data-field="text" text-anchor="middle" font-weight="800" letter-spacing="4"')}</g>` + label(''),
      draw:(q, s) => { const p = clamp(s.press ?? 1); visible(q.part.stamp, p > 0);
        q.part.stamp.setAttribute('transform', `translate(200 140) rotate(-12) scale(${(1.6 - .6 * p).toFixed(3)})`); q.part.stamp.setAttribute('opacity', Math.min(1, p * 2.5).toFixed(3)); } },
    // Official paper: title/subtitle, signed 0–1 draws the signature, sealed 0–1 presses the seal.
    decision:{ svg:({ path, circle, text, label, shadow, c }) => shadow(90, 247, 220) + path('M104 16h150l42 42v192H104z', c.paper) + path('M254 16v42h42', c.edge, c.ink, 3) +
      text(200, 66, 'DECISION', 19, c.ink, 'data-field="title" text-anchor="middle" font-weight="800" letter-spacing="2"') +
      text(200, 88, '', 13, c.ink, 'data-field="subtitle" text-anchor="middle" letter-spacing="1"') +
      path('M126 110h148M126 126h148M126 142h120M126 158h140', 'none', c.edge, 5) + path('M126 218h90', 'none', c.muted, 2) +
      path('M130 208c8-24 18-26 15-4-2 14 12-16 20-6 6 8 8 6 26-6', 'none', c.ink, 3, 'data-part="sign" pathLength="1" stroke-dasharray="1 1"') +
      `<g data-part="seal">${path('M-14 18l-8 34 12-8 10 10 4-36M10 18l8 34-12-8', c.accent, c.ink, 2) + circle(0, 0, 30, c.accent, c.ink, 3) + circle(0, 0, 21, 'none', c.paper, 2) +
        path('M0-11l3.2 6.8 7.3.8-5.4 5 1.5 7.3L0 5.2l-6.6 3.7 1.5-7.3-5.4-5 7.3-.8z', c.paper, c.paper, 1)}</g>` + label('DOCUMENT'),
      draw:(q, s) => { const sg = clamp(s.signed ?? 1), se = clamp(s.sealed ?? 1);
        q.part.sign.setAttribute('stroke-dashoffset', (1 - sg).toFixed(3)); visible(q.part.sign, sg > 0);
        visible(q.part.seal, se > 0); q.part.seal.setAttribute('transform', `translate(258 196) scale(${(1.5 - .5 * se).toFixed(3)}) rotate(${(-20 * (1 - se)).toFixed(2)})`); } },
    // Padlock: open 0–1 lifts and swings the shackle.
    lock:{ svg:({ path, rect, circle, label, shadow, c }) => shadow() +
      `<g data-part="shackle">${path('M160 132V92a40 40 0 0 1 80 0v40', 'none', c.ink, 26) + path('M160 132V92a40 40 0 0 1 80 0v40', 'none', c.metal, 16)}</g>` +
      rect(118, 124, 164, 114, 16, c.paper) + rect(130, 136, 140, 90, 10, 'none', c.edge, 3) + circle(200, 170, 13, c.ink, c.ink, 0) + path('M200 176v28', 'none', c.ink, 11) + label('LOCK'),
      draw:(q, s) => { const o = clamp(s.open ?? 0); q.part.shackle.setAttribute('transform', `translate(0 ${(-30 * o).toFixed(2)}) rotate(${(-28 * o).toFixed(2)} 160 132)`); } },
    // Balance: tilt −1…1 (positive drops the right pan); left/right label the pans.
    scales:{ svg:({ path, rect, circle, text, label, shadow, c }) => shadow() + path('M146 244h108l-16-24h-76z', c.dark, c.ink, 3) + rect(194, 66, 12, 160, 4, c.metal, c.ink, 3) +
      `<g data-part="beam">${rect(72, 58, 256, 12, 6, c.ink, c.ink, 0)}</g>` + circle(200, 64, 10, c.paper) +
      ['left', 'right'].map((side) => `<g data-pan="${side}">${path('M0 0L-40 66M0 0L40 66', 'none', c.ink, 2) + path('M-56 66h112a56 28 0 0 1-112 0z', c.paper) +
        text(0, 88, '', 17, c.ink, `data-field="${side}" text-anchor="middle" font-weight="700"`)}</g>`).join('') + label('BALANCE'),
      draw:(q, s) => { const tilt = clamp(s.tilt ?? 0, -1, 1), a = tilt * 12 * Math.PI / 180;
        q.part.beam.setAttribute('transform', `rotate(${(tilt * 12).toFixed(2)} 200 64)`);
        q.pans.forEach((p) => { const k = p.dataset.pan === 'left' ? -1 : 1; p.setAttribute('transform', `translate(${(200 + k * 124 * Math.cos(a)).toFixed(2)} ${(64 + k * 124 * Math.sin(a)).toFixed(2)})`); }); } },
    // Grid of recorded sessions/clips: count 0–12 tiles; rec 0/1 lights the dot.
    recordings:{ svg:({ path, rect, circle, text, label, shadow, c }) => shadow(50, 247, 300) +
      text(64, 40, 'SESSIONS', 14, c.ink, 'data-field="title" font-weight="700" letter-spacing="3"') + rect(270, 21, 66, 26, 13, c.ink, c.ink, 0) +
      circle(287, 34, 6, c.accent, c.accent, 0, 'data-part="rec"') + text(298, 40, 'REC', 13, c.paper, 'font-weight="700" letter-spacing="1"') +
      Array.from({ length:12 }, (_, i) => { const x = 64 + (i % 4) * 70, y = 56 + Math.floor(i / 4) * 52;
        return `<g data-tile="${i}">${rect(x, y, 62, 44, 6, c.tint4, c.ink, 2) + path(`M${x + 25} ${y + 12}l14 9-14 9z`, c.ink, c.ink, 2) + path(`M${x + 8} ${y + 38}h${18 + (i * 7) % 30}`, 'none', c.accent, 3)}</g>`; }).join('') + label('RECORDINGS'),
      draw:(q, s) => { q.tiles.forEach((t, i) => visible(t, i < (s.count ?? 12))); visible(q.part.rec, (s.rec ?? 1) >= .5); } },
    // Wall camera: pan −1…1 swings it; rec 0/1 lights the dot; view 0–1 shows its field of view.
    camera:{ svg:({ path, rect, circle, label, shadow, c }) => shadow() + rect(304, 54, 30, 104, 6, c.edge) + path('M304 106h-48', 'none', c.ink, 12) + path('M304 106h-48', 'none', c.metal, 6) +
      `<g data-part="body"><path data-part="view" d="M92 106L-30 30V182Z" fill="${c.accent}" opacity="0"/>${rect(118, 76, 140, 60, 12, c.paper) + rect(92, 82, 32, 48, 7, c.dark, c.ink, 3) +
        circle(98, 106, 15, c.ink, c.ink, 0) + circle(98, 106, 7, c.metal, c.metal, 0) + path('M140 136h96', 'none', c.edge, 4) + circle(236, 94, 6, c.accent, c.accent, 0, 'data-part="rec"')}</g>` +
      circle(256, 106, 9, c.paper) + label('CAMERA'),
      draw:(q, s) => { const pan = clamp(s.pan ?? 0, -1, 1), view = clamp(s.view ?? 0);
        q.part.body.setAttribute('transform', `rotate(${(14 + 18 * pan).toFixed(2)} 256 106)`); q.part.view.setAttribute('opacity', (.2 * view).toFixed(3));
        visible(q.part.view, view > 0); visible(q.part.rec, (s.rec ?? 1) >= .5); } },
    // AI agent: a faceless tile with a spark. work is a phase (any value) that spins the ring and pulses the spark;
    // sleep 0–1 dims the spark and lifts the Zz; done 0–1 pops the check badge; status fills the pill (empty hides it).
    agent:{ svg:({ path, rect, circle, text, label, shadow, c }) => shadow() +
      `<g data-part="ring"><circle cx="200" cy="132" r="104" fill="none" stroke="${c.accent}" stroke-width="5" stroke-linecap="round" stroke-dasharray="52 26"/></g>` +
      path('M200 56V38', 'none', c.ink, 5) + circle(200, 32, 9, c.accent, c.ink, 3) +
      rect(108, 110, 18, 46, 7, c.metal, c.ink, 3) + rect(274, 110, 18, 46, 7, c.metal, c.ink, 3) +
      rect(124, 56, 152, 152, 40, c.paper, c.ink, 4) + rect(142, 74, 116, 116, 28, c.dark, c.ink, 3) +
      `<g data-part="spark">${path('M200 98C203 122 210 129 234 132C210 135 203 142 200 166C197 142 190 135 166 132C190 129 197 122 200 98Z', c.paper, c.paper, 2) +
        path('M236 90C237 98 239 100 247 101C239 102 237 104 236 112C235 104 233 102 225 101C233 100 235 98 236 90Z', c.accent, c.accent, 1)}</g>` +
      `<g data-part="zz">${text(270, 64, 'z', 30, c.ink, 'font-weight="700"') + text(292, 40, 'z', 22, c.ink, 'font-weight="700"')}</g>` +
      `<g data-part="done">${circle(262, 188, 26, c.second, c.ink, 3) + path('M249 188l9 9 17-18', 'none', c.paper, 6)}</g>` +
      `<g data-part="pill">${rect(126, 226, 148, 32, 16, c.ink, c.ink, 0) + text(200, 248, '', 15, c.paper, 'data-field="status" text-anchor="middle" font-weight="700" letter-spacing="2"')}</g>` +
      label('AGENT'),
      draw:(q, s) => { const work = s.work ?? 0, sleep = clamp(s.sleep ?? 0), done = clamp(s.done ?? 0), on = work > 0 && sleep < 1;
        visible(q.part.ring, on); q.part.ring.setAttribute('transform', `rotate(${(360 * work).toFixed(2)} 200 132)`);
        const pulse = on ? 1 + .08 * Math.sin(4 * Math.PI * work) : 1;
        q.part.spark.setAttribute('transform', `translate(200 132) scale(${pulse.toFixed(3)}) translate(-200 -132)`); q.part.spark.setAttribute('opacity', (1 - .65 * sleep).toFixed(3));
        visible(q.part.zz, sleep > 0); q.part.zz.setAttribute('opacity', sleep.toFixed(3)); q.part.zz.setAttribute('transform', `translate(0 ${(14 * (1 - sleep)).toFixed(2)})`);
        visible(q.part.done, done > 0); q.part.done.setAttribute('transform', `translate(262 188) scale(${(done * (1 + .25 * Math.sin(Math.PI * done))).toFixed(3)}) translate(-262 -188)`);
        visible(q.part.pill, q.field.status.textContent !== ''); } },
    // Token balance: level 0–1.5 fills the tank (1 = the plan's base; above it is overage in accent); chips 0–3 tokens; amount text.
    tokens:{ svg:({ path, rect, text, label, shadow, c }) => shadow() +
      [0, 1, 2].map((i) => { const x = 112, y = 212 - i * 30;
        return `<g data-coin="${i}">${path(`M${x - 52} ${y}v12l26 18h52l26-18v-12`, c.edge, c.ink, 3) + path(`M${x - 52} ${y}l26-18h52l26 18-26 18h-52z`, c.paper, c.ink, 3) +
          path(`M${x} ${y - 11}C${x + 1} ${y - 3} ${x + 4} ${y - 1} ${x + 14} ${y}C${x + 4} ${y + 1} ${x + 1} ${y + 3} ${x} ${y + 11}C${x - 1} ${y + 3} ${x - 4} ${y + 1} ${x - 14} ${y}C${x - 4} ${y - 1} ${x - 1} ${y - 3} ${x} ${y - 11}Z`, c.accent, c.accent, 1)}</g>`; }).join('') +
      text(112, 110, '—', 30, c.ink, 'data-field="amount" text-anchor="middle" font-weight="700"') +
      rect(214, 34, 96, 200, 14, c.paper, c.ink, 4) +
      `<rect data-part="base" x="221" y="228" width="82" height="0" rx="7" fill="${c.metal}"/><rect data-part="over" x="221" y="228" width="82" height="0" rx="7" fill="${c.accent}"/>` +
      path('M204 103h116', 'none', c.ink, 3, 'stroke-dasharray="8 7"') + text(326, 109, 'BASE', 14, c.ink, 'data-field="base" font-weight="700" letter-spacing="1"') + label('TOKENS'),
      draw:(q, s) => { const l = clamp(s.level ?? 0, 0, 1.5), base = 188 * Math.min(l, 1) / 1.5, over = 188 * Math.max(0, l - 1) / 1.5;
        q.part.base.setAttribute('y', (228 - base).toFixed(2)); q.part.base.setAttribute('height', base.toFixed(2)); visible(q.part.base, base > 0);
        q.part.over.setAttribute('y', (228 - base - over).toFixed(2)); q.part.over.setAttribute('height', over.toFixed(2)); visible(q.part.over, over > 0);
        q.coins.forEach((n, i) => visible(n, i < (s.chips ?? 3))); } },
    // Price ladder: three steps; active −1…2 lights one step and moves the marker (fractions slide it); l0–l2 label the steps.
    steps:{ svg:({ rect, circle, text, label, shadow, c }) => shadow(50, 247, 300) +
      [0, 1, 2].map((i) => { const x = 60 + i * 96, h = 56 + i * 56, y = 236 - h;
        return rect(x, y, 92, h, 8, c.tint, c.ink, 3) + `<g data-flag="${i}">${rect(x, y, 92, h, 8, c.accent, c.ink, 3)}</g>` +
          text(x + 46, y + 32, '', 18, c.ink, `data-field="l${i}" text-anchor="middle" font-weight="700"`); }).join('') +
      `<g data-part="marker">${circle(0, 0, 14, c.paper, c.ink, 4) + circle(0, 0, 5, c.accent, c.accent, 0)}</g>` + label('PLANS'),
      draw:(q, s, c) => { const a = clamp(s.active ?? -1, -1, 2), lit = a >= 0 ? Math.round(a) : -1;
        q.flags.forEach((f, i) => visible(f, i === lit)); [0, 1, 2].forEach((i) => q.field['l' + i].setAttribute('fill', i === lit ? c.paper : c.ink));
        const m = Math.max(0, a); visible(q.part.marker, a >= 0); q.part.marker.setAttribute('transform', `translate(${(106 + 96 * m).toFixed(2)} ${(158 - 56 * m).toFixed(2)})`); } },
    // Slide deck: count 0–3 slides (front first); cursors 0–3 co-editing pointers on the front slide; title text.
    slides:{ svg:({ path, rect, text, label, shadow, c }) => shadow() +
      [2, 1, 0].map((i) => { const x = 114 - i * 22, y = 100 - i * 30;
        return `<g data-box="${i}">${rect(x, y, 220, 124, 10, c.paper, c.ink, 3) + path(`M${x + 18} ${y + 22}h${i ? 110 : 0}`, 'none', c.edge, 7) +
          [0, 1, 2].map((j) => rect(x + 120 + j * 26, y + 104 - [30, 52, 40][j], 18, [30, 52, 40][j], 3, j === 1 ? c.accent : c.muted, c.ink, 2)).join('') +
          path(`M${x + 18} ${y + 58}h80M${x + 18} ${y + 76}h64M${x + 18} ${y + 94}h72`, 'none', c.edge, 6) +
          (i ? '' : text(x + 18, y + 30, 'SLIDES', 16, c.ink, 'data-field="title" font-weight="700" letter-spacing="2"'))}</g>`; }).join('') +
      [[176, 150, c.accent], [268, 132, c.second], [222, 196, c.ink]].map(([x, y, fill], i) =>
        `<g data-tile="${i}" transform="translate(${x} ${y})">${path('M0 0v28l8-7 7 14 7-3-7-14h11z', fill, c.paper, 2)}</g>`).join('') + label('SLIDES'),
      draw:(q, s) => { q.boxes.forEach((b) => visible(b, +b.dataset.box < (s.count ?? 3))); q.tiles.forEach((t, i) => visible(t, i < (s.cursors ?? 0) && (s.count ?? 3) > 0)); } },
    // Funnel: flow is a phase (any value) that drops many dots in and lets few out; top/bottom label the counts.
    funnel:{ svg:({ path, ellipse, circle, text, label, shadow, c }) => shadow(130, 247, 140) +
      Array.from({ length:12 }, (_, i) => circle(0, 0, 6, c.ink, c.ink, 0).replace('<circle ', `<circle data-dot="${i}" `)).join('') +
      path('M80 72L182 186V228H218V186L320 72', c.tint, c.ink, 4) + ellipse(200, 72, 120, 22, c.edge, c.ink, 4) +
      Array.from({ length:3 }, (_, i) => circle(200, 236, 8, c.accent, c.ink, 2).replace('<circle ', `<circle data-dot="${12 + i}" `)).join('') +
      text(326, 62, '', 20, c.ink, 'data-field="top" font-weight="700"') + text(232, 222, '', 22, c.accent, 'data-field="bottom" font-weight="700"') + label('FUNNEL'),
      draw:(q, s) => { const f = s.flow ?? 0;
        q.dots.forEach((d, i) => { if (i < 12) { const p = ((f + i / 12) % 1 + 1) % 1, x = 200 + (((i * 37) % 11) - 5) * 19 * (1 - .5 * p), y = 8 + 70 * p;
            d.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`); d.setAttribute('opacity', (p < .8 ? 1 : (1 - p) * 5).toFixed(3)); }
          else { const p = ((f + (i - 12) / 3) % 1 + 1) % 1; d.setAttribute('transform', `translate(0 ${(22 * p).toFixed(2)})`); d.setAttribute('opacity', (1 - p).toFixed(3)); } }); } },
    // Team: count 0–5 people (front row first); lead −1…4 marks one person in accent; helmet 0/1 puts a hard hat on the lead.
    team:{ svg:({ path, circle, label, shadow, c }) => shadow() +
      [[3, 165, 96], [4, 235, 96], [1, 128, 138], [2, 272, 138], [0, 200, 146]].map(([i, x, y]) => {
        const body = (fill) => path(`M${x - 46} ${y + 92}v-20c0-24 20-40 46-40s46 16 46 40v20z`, fill, c.ink, 3);
        return `<g data-tile="${i}">${body(i > 2 ? c.muted : c.metal)}<g data-flag="${i}">${body(c.accent)}</g>${circle(x, y, 25, c.tint, c.ink, 3)}` +
          `<g data-mark="${i}">${path(`M${x - 25} ${y - 9}a25 23 0 0 1 50 0z`, c.second, c.ink, 3) + path(`M${x - 32} ${y - 9}h64`, 'none', c.ink, 6)}</g></g>`; }).join('') + label('TEAM'),
      draw:(q, s) => { const n = s.count ?? 5, lead = s.lead ?? -1, hat = (s.helmet ?? 0) >= .5;
        q.tiles.forEach((t) => visible(t, +t.dataset.tile < n)); q.flags.forEach((f) => visible(f, +f.dataset.flag === Math.round(lead)));
        q.marks.forEach((m) => visible(m, hat && +m.dataset.mark === Math.round(lead))); } },
    // Model chip with a switch: pick 0–2 slides the knob (fractions animate); model is the chip text; m0–m2 label the options.
    chip:{ svg:({ path, rect, text, label, shadow, c }) => shadow() +
      [0, 1, 2, 3].map((i) => path(`M${158 + i * 28} 30v-14M${158 + i * 28} 150v14M140 ${48 + i * 28}h-14M260 ${48 + i * 28}h14`, 'none', c.ink, 5)).join('') +
      rect(140, 30, 120, 120, 14, c.dark, c.ink, 4) + rect(160, 50, 80, 80, 8, 'none', c.darkEdge, 3) +
      text(200, 101, 'AI', 30, c.paper, 'data-field="model" text-anchor="middle" font-weight="700"') + path('M200 168v14', 'none', c.ink, 4) +
      rect(70, 182, 260, 44, 22, c.tint, c.ink, 3) + `<g data-part="knob">${rect(-42, -18, 84, 36, 18, c.accent, c.ink, 3)}</g>` +
      ['A', 'B', 'C'].map((m, i) => text(113 + i * 87, 210, m, 16, c.ink, `data-field="m${i}" text-anchor="middle" font-weight="700"`)).join('') + label('MODEL'),
      draw:(q, s, c) => { const p = clamp(s.pick ?? 0, 0, 2), on = Math.round(p);
        q.part.knob.setAttribute('transform', `translate(${(113 + 87 * p).toFixed(2)} 204)`);
        [0, 1, 2].forEach((i) => q.field['m' + i].setAttribute('fill', i === on ? c.paper : c.ink)); } }
  };
  // Numeric state per kind; anything else in draw() is a text field.
  const STATES = { keyboard:['key'], envelope:['open'], document:['checked'], phone:['cut', 'ring'], calendar:['day', 'marks'], card:['chip', 'declined'],
    coins:['count'], chat:['shown', 'typing', 'caret'], form:['filled', 'missing', 'sent'], stamp:['press'], decision:['signed', 'sealed'], lock:['open'],
    scales:['tilt'], recordings:['count', 'rec'], camera:['pan', 'rec', 'view'],
    agent:['work', 'sleep', 'done'], tokens:['level', 'chips'], steps:['active'], slides:['count', 'cursors'], funnel:['flow'], team:['count', 'lead', 'helmet'], chip:['pick'] };
  const NUMERIC = new Set(Object.values(STATES).flat());
  let serial = 0;
  function object(parent, kind, o = {}) {
    if (!kinds[kind]) throw new Error(`unknown illustration ${kind}`);
    if ([o.x ?? 0, o.y ?? 0, o.w ?? 400].some((x) => !Number.isFinite(x)) || (o.w ?? 400) <= 0) throw new Error('illustration needs finite position and positive width');
    const skin = o.skin ?? defaults.skin;
    if (!SKINS.includes(skin)) throw new Error(`unknown illustration skin ${skin}`);
    for (const k of ['every', 'start']) if (o[k] != null && !(Number.isInteger(o[k]) && o[k] >= (k === 'every' ? 1 : 0) && o[k] < 35)) throw new Error(`illustration ${k} must be an integer cell index`);
    const c = colours(skin, { ...defaults.palette, ...(o.palette || {}) });
    const uid = `mf-sketch-${++serial}`, k = kit(c, skin, uid);
    const w = o.w ?? 400, h = w * .75;
    const root = C.reg(C.el('div', { class:'abs', 'data-illustration':kind, style:`width:${w}px;height:${h}px` }, parent), { x:o.x ?? 0, y:o.y ?? 0 });
    const defs = skin === 'sketch' ? `<defs><filter id="${uid}" filterUnits="userSpaceOnUse" x="-60" y="-60" width="520" height="420"><feTurbulence type="fractalNoise" baseFrequency=".04" numOctaves="2" seed="${7 + Object.keys(kinds).indexOf(kind)}"/><feDisplacementMap in="SourceGraphic" scale="4.5" xChannelSelector="R" yChannelSelector="G"/></filter></defs>` : '';
    root.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 400 300" overflow="visible">${defs}${kinds[kind].svg(k)}</svg>`;
    if (skin !== 'line') root.dataset.skin = skin;
    const all = (sel) => [...root.querySelectorAll(sel)];
    const q = { part:Object.fromEntries(all('[data-part]').map((n) => [n.dataset.part, n])), keys:all('[data-key]'), checks:all('[data-check]'), marks:all('[data-mark]'),
      coins:all('[data-coin]'), bubbles:all('[data-bubble]'), bars:all('[data-bar]'), dots:all('[data-dot]'), boxes:all('[data-box]'), flags:all('[data-flag]'),
      pans:all('[data-pan]'), tiles:all('[data-tile]'), field:{} };
    const fields = all('[data-field]').map((n) => ({ node:n, key:n.dataset.field, base:o[n.dataset.field] ?? n.textContent }));
    for (const f of fields) q.field[f.key] = f.node;
    function draw(state = {}) {
      for (const [key, v] of Object.entries(state)) if ((NUMERIC.has(key) || key === 'checked') && v != null && !Number.isFinite(v)) throw new Error('illustration state must be finite');
      fields.forEach((f) => { f.node.textContent = state[f.key] ?? f.base; });
      kinds[kind].draw?.(q, state, c, o);
      const svg = root.firstElementChild; svg.style.display = 'none'; svg.getBoundingClientRect(); svg.style.display = '';
    }
    draw(); return { root, draw, skin, palette:c };
  }
  // Extras (secondary objects): licensed SVGs from assets/extras (window.EXTRA_ASSETS, bundled by sync.mjs), repainted in the
  // film's skin. Greys follow lightness, clear reds become the accent, the silhouette gets the ink outline.
  const NAMED = { black:'#000000', white:'#ffffff', none:null, transparent:null };
  const toHex = (v) => {
    if (!v) return null; v = v.trim().toLowerCase();
    if (v in NAMED) return NAMED[v];
    let m = v.match(/^#([0-9a-f]{3})$/); if (m) return '#' + [...m[1]].map((x) => x + x).join('');
    if (/^#[0-9a-f]{6}$/.test(v)) return v;
    m = v.match(/^rgba?\(([^)]+)\)/); if (m) return '#' + m[1].split(/[ ,]+/).slice(0, 3).map((x) => Math.round(parseFloat(x)).toString(16).padStart(2, '0')).join('');
    return undefined;   // url(#…), currentColor, inherit: handled by the caller or left alone
  };
  function tone(hex, skin, c) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const y = .2126 * r + .7152 * g + .0722 * b, ch = mx - mn;
    let h = 0; if (ch) h = (mx === r ? ((g - b) / ch) % 6 : mx === g ? (b - r) / ch + 2 : (r - g) / ch + 4) * 60; h = (h + 360) % 360;
    if (ch > .55 && y > .1 && y < .7 && (h < 22 || h > 335)) return c.accent;   // clear red only: browns, oranges, blues stay grey
    if (skin === 'mono') return y > .5 ? c.paper : c.ink;
    return y > .86 ? c.paper : y > .7 ? c.tint : y > .52 ? c.edge : y > .36 ? c.muted : y > .2 ? c.metal : y > .1 ? c.dark : c.ink;
  }
  const SHAPES = 'path,rect,circle,ellipse,polygon,polyline,line,use';
  function extra(parent, id, o = {}) {
    const source = (window.EXTRA_ASSETS || {})[id];
    if (!source) throw new Error(`unknown extra ${id}: write the id literally in film code (e.g. 'noto:mobile-phone') and run sync.mjs`);
    const w = o.w ?? 160;
    if (![o.x ?? 0, o.y ?? 0, w].every(Number.isFinite) || w <= 0) throw new Error('extra needs finite position and positive width');
    const skin = o.skin ?? defaults.skin;
    if (!SKINS.includes(skin)) throw new Error(`unknown illustration skin ${skin}`);
    const c = colours(skin, { ...defaults.palette, ...(o.palette || {}) }), uid = `mf-extra-${++serial}`;
    // style({extras:false}) switches the layer off film-wide: an empty node keeps film code and put()/hide working.
    if (!defaults.extras) return { root:C.reg(C.el('div', { class:'abs', 'data-extra':id, 'data-off':'' }, parent), { x:o.x ?? 0, y:o.y ?? 0 }), draw:() => {}, skin, palette:c, off:true };
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml'), src = doc.documentElement;
    if (src.localName !== 'svg' || doc.querySelector('parsererror,script,style,foreignObject,iframe,image')) throw new Error(`invalid or active extra SVG: ${id}`);
    for (const n of [src, ...src.querySelectorAll('*')]) for (const a of n.attributes) {
      if (/^on/i.test(a.name) || a.localName === 'src' || (a.localName === 'href' && a.value[0] !== '#') || /url\(\s*['"]?(?!#)|@import/i.test(a.value)) throw new Error(`external or active extra reference: ${id}`);
    }
    const vb = (src.getAttribute('viewBox') || '0 0 128 128').split(/[ ,]+/).map(Number), size = Math.max(vb[2], vb[3]);
    const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g'); while (src.firstChild) g.appendChild(src.firstChild);
    const ids = {}; g.querySelectorAll('[id]').forEach((n) => { ids[n.id] = `${uid}-${n.id}`; n.id = ids[n.id]; });
    for (const n of g.querySelectorAll('*')) for (const a of [...n.attributes]) {
      let v = a.value.replace(/url\(\s*['"]?#([^)'"]+)['"]?\s*\)/g, (m, k) => ids[k] ? `url(#${ids[k]})` : m);
      if (a.localName === 'href' && ids[v.slice(1)]) v = '#' + ids[v.slice(1)];
      if (v !== a.value) n.setAttributeNS(a.namespaceURI, a.name, v);
    }
    for (const n of g.querySelectorAll('*')) for (const p of ['fill', 'stroke', 'stop-color']) {
      const v = n.style?.getPropertyValue(p) || n.getAttribute(p), hx = toHex(v);
      if (hx === undefined) { if (/currentcolor/i.test(v || '')) n.setAttribute(p, c.ink); continue; }
      n.style?.removeProperty(p); n.setAttribute(p, hx ? tone(hx, skin, c) : 'none');
    }
    g.setAttribute('fill', c.ink);
    const ser = new XMLSerializer();
    let body = ser.serializeToString(g);
    if (skin !== 'flat') {   // outline: an ink copy of the silhouette behind the drawing
      const back = g.cloneNode(true);
      back.querySelectorAll('defs,linearGradient,radialGradient,clipPath,mask').forEach((n) => n.remove());
      back.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
      for (const n of back.querySelectorAll(SHAPES)) {
        for (const k of ['opacity', 'fill-opacity', 'stroke-opacity']) { n.removeAttribute(k); n.style?.removeProperty(k); }
        n.setAttribute('fill', c.ink); n.setAttribute('stroke', c.ink); n.setAttribute('stroke-width', (size * .05).toFixed(2)); n.setAttribute('stroke-linejoin', 'round');
      }
      body = ser.serializeToString(back) + body;
    }
    let seed = 7; for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) % 997;
    const fx = skin === 'sketch' ? `<defs><filter id="${uid}-fx" filterUnits="userSpaceOnUse" x="${vb[0] - size * .2}" y="${vb[1] - size * .2}" width="${size * 1.4}" height="${size * 1.4}"><feTurbulence type="fractalNoise" baseFrequency="${(12 / size).toFixed(4)}" numOctaves="2" seed="${seed}"/><feDisplacementMap in="SourceGraphic" scale="${(size * .015).toFixed(2)}" xChannelSelector="R" yChannelSelector="G"/></filter></defs>` : '';
    const pad = size * .06;
    const root = C.reg(C.el('div', { class:'abs', 'data-extra':id, style:`width:${w}px;height:${w}px` }, parent), { x:o.x ?? 0, y:o.y ?? 0 });
    root.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="${vb[0] - pad} ${vb[1] - pad} ${vb[2] + 2 * pad} ${vb[3] + 2 * pad}">${fx}<g${fx ? ` filter="url(#${uid}-fx)"` : ''}>${body}</g></svg>`;
    if (skin !== 'line') root.dataset.skin = skin;
    return { root, draw:() => {}, skin, palette:c };
  }
  // Film-wide look: call once before C.start(); objects may still override skin/palette per call.
  function style(o = {}) {
    if (o.skin != null && !SKINS.includes(o.skin)) throw new Error(`unknown illustration skin ${o.skin}`);
    if (o.extras != null && typeof o.extras !== 'boolean') throw new Error('style extras must be true or false');
    colours(o.skin ?? 'line', o.palette || {});
    defaults = { skin:o.skin ?? defaults.skin, palette:{ ...(o.palette || defaults.palette) }, extras:o.extras ?? defaults.extras };
    return { ...defaults };
  }
  window.ILLUSTRATIONS = { object, extra, extras:() => Object.keys(window.EXTRA_ASSETS || {}).sort(), style, kinds:Object.keys(kinds), skins:SKINS, states:STATES };
})();
