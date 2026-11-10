// Stage themes (motion-film): palette, fonts, a hand and a motion grammar for the whole film. scripts/theme_pick.py
// chooses one from the brief (genre, tone, format; light unless the brief asks for dark) into timeline.json "theme";
// THEMES.auto() in film.js applies it. A brand keeps its own palette and type and takes the theme's hand only.
// Each theme is a full set — palette, light on the stage, fonts, object colours — chosen so the film does not look like
// every other dark reel (purple-orange haze + wide grotesque caps; that one is kept as `reference`, for comparison only).
//
//   const T = THEMES.use('newsroom');            // first lines of film.js: sets --bg/--ink/--ink-2/--accent and adds
//   C.fonts = [`${T.dw} 100px ${T.D}`, `600 40px ${T.U}`, `800 100px ${T.N}`];   // @font-face for the theme's fonts
//   (font files: sh scripts/fonts.sh <theme> → assets/fonts/v/<file>-cyrillic|latin.woff2, OFL, from Fontsource)
//
// Fields: bg ink ink2 acc (numbers) acc2 (units) · D U N font families (display, UI, numbers), dw display weight, caps,
// ls tracking, size (display scale: a condensed face can go bigger) · stage: glow | pool (a lamp pool with falloff) |
// spot (light cyclorama) | blueprint (drafting grid) | riso (paper grain, misregistered type: misreg) · mood [calm,
// alarm, good] light colours, glowA strength · floor/floorA (ISO.floor), dust, vign (vignette) · money band goog googWin
// cai caiWin plinth p1 p2 tileOff tileOn tileGlow: object colours [r,g,b] (rename for your film's objects) · card
// cardLine skel: DOM cards · chip chipInk labelPlate labelInk edge: plates and box edges.
// Caption plate for CAPTIONS.karaoke({ current: true }): light stages use ink/bg, dark ones chip/chipInk.
// Handwriting: H hand family, hw its weight, hand its ink — one short note per frame, the theme's tool colour (a red pen,
// a red pencil on the drawing). T.write(parent, text, at, o) = HAND.write in that font (lib/hand.js must be loaded).
// The paper themes (notebook draft card yard stationery school) come from the 2026-11-01 handwriting board: a hand,
// a main face and a palette chosen together; their object colours are derived from the palette (paper() below).
// The `reference` theme uses the project's own Display/UI faces (film/index.html), no files from fonts.sh.
//
// Motion: a theme is also a motion grammar (MOTION below; the words — signature beat and the "never" list — live in
// ENGINE.md «Темы: движение»). use() applies its roles (enter, text, accent, camera: TYPE.rise and C.sp(…, 'enter') pick
// them up) and its stagger; timeline.json "motion" still wins, key by key. Helpers on the returned theme:
//   T.q(t)                     the paper/print layer's clock: t quantised to T.motion.step fps (riso: 12, «on twos»);
//                              identity when step is 0. Use it for that layer only — the camera stays smooth.
//   T.drawing(t)               index of the current drawing (integer): seed per-drawing grain / jitter with it.
//   T.enter(t, at, o)          props for C.put() of the theme's entrance verb, landing on mark/beat `at`:
//                              rise  — y from o.d (px, default 60) up, theme overshoot (put it inside a mask: TYPE.line)
//                              stamp — lands big (o.from 1.14) and tilted (o.tilt −3°), undershoots ~9 %, settles; on twos
//                              snap  — pushed out of the margin: x from −o.d (default 80), ~8 % overshoot, locks
//                              draw  — { css: { strokeDashoffset } } for a path with pathLength="1", o.dur s (0.6), ease
//                                      in-out like a hand; returns the progress as .u too
//                              o.verb picks another verb than the theme's own.
//   T.slip(t, at, o)           riso registration slip: px offset for the second plate, kicks o.d (24) px apart and springs
//                              back past register. Add it to the misregistered copy (colour T.misreg).
(() => {
  const MOTION = {
    // the comparison theme: no grammar of its own
    reference: null,
    // «Ночная редакция»: heavy cards with a tilt that sways past rest, a slow dolly; one accent, only after the event
    newsroom: { step: 0, enter: 'rise', stagger: 0.08,
      roles: { enter: { response: 0.55, damping: 0.7 }, text: { response: 0.5, damping: 0.72 }, camera: { response: 1.1, damping: 1, soft: 0.35 } } },
    // «Студия на свету»: one-take light keynote — rise with ~10 % overshoot, contents trail their container by ~3 frames
    studio: { step: 0, enter: 'rise', stagger: 0.05,
      roles: { enter: { response: 0.42, damping: 0.6 }, text: { response: 0.45, damping: 0.62 }, accent: { response: 0.3, damping: 0.6 } } },
    // «Синька»: everything is drawn — construction first, lines grow along their path, numbers tick up last
    blueprint: { step: 0, enter: 'draw', stagger: 0.07,
      roles: { enter: { response: 0.5, damping: 0.9 }, text: { response: 0.45, damping: 0.75 } } },
    // «Ризограф»: a stack of prints on twos; each element stamps or slides in reading order, 4–6 frames apart
    riso: { step: 12, enter: 'stamp', stagger: 0.17, cascade: 'even',
      roles: { enter: { response: 0.3, damping: 0.58 }, text: { response: 0.32, damping: 0.58 } } },
    // «Графит и сигнал»: calm and exact; the one chartreuse accent arrives with the event it stands for
    graphite: { step: 0, enter: 'rise', stagger: 0.06,
      roles: { enter: { response: 0.4, damping: 0.86 }, text: { response: 0.45, damping: 0.9 }, camera: { response: 0.9, damping: 1, soft: 0.25 } } },
    // «Лента»: fast and confident — rows pushed out of the margin, scale jumps, short holds between beats
    feed: { step: 0, enter: 'snap', stagger: 0.04,
      roles: { enter: { response: 0.3, damping: 0.63 }, text: { response: 0.32, damping: 0.63 }, accent: { response: 0.22, damping: 0.6 } } },
    // «Тетрадь стратега»: notes on a clean argument — calm rise, the pen note comes after the line it comments on
    notebook: { step: 0, enter: 'rise', stagger: 0.06,
      roles: { enter: { response: 0.45, damping: 0.72 }, text: { response: 0.45, damping: 0.74 } } },
    // «Калька»: the light drawing — built like blueprint, the pencil note last
    draft: { step: 0, enter: 'draw', stagger: 0.07,
      roles: { enter: { response: 0.5, damping: 0.9 }, text: { response: 0.45, damping: 0.75 } } },
    // «Открытка»: slow and soft, no overshoot; the calligraphy is the event
    card: { step: 0, enter: 'rise', stagger: 0.1,
      roles: { enter: { response: 0.7, damping: 0.92 }, text: { response: 0.7, damping: 0.95 } } },
    // «Двор»: loud — words slapped on like stencils, short holds
    yard: { step: 0, enter: 'stamp', stagger: 0.06,
      roles: { enter: { response: 0.28, damping: 0.6 }, text: { response: 0.3, damping: 0.6 } } },
    // «Канцелярия»: light and bouncy, list items pop in one by one
    stationery: { step: 0, enter: 'rise', stagger: 0.07,
      roles: { enter: { response: 0.4, damping: 0.56 }, text: { response: 0.4, damping: 0.6 } } },
    // «Школьная тетрадь»: unhurried, line by line, the red mark lands last
    school: { step: 0, enter: 'rise', stagger: 0.08,
      roles: { enter: { response: 0.55, damping: 0.85 }, text: { response: 0.5, damping: 0.85 } } },
  };
  const STAMP_IN = { response: 0.16, damping: 0.75 }, STAMP_SET = { response: 0.3, damping: 0.8 };
  const SNAP = { response: 0.32, damping: 0.63 }, SLIP = { response: 0.34, damping: 0.42 };
  const ioEase = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  function helpers(m) {
    const step = (m && m.step) || 0;
    const q = (t) => (step ? Math.floor(t * step + 1e-6) / step : t);
    const drawing = (t) => (step ? Math.floor(t * step + 1e-6) : Math.floor(t * (C.FPS || 60)));
    const enter = (t, at, o = {}) => {
      const verb = o.verb || (m && m.enter) || 'rise', T0 = C.bt(at);
      if (verb === 'stamp') {   // big → under → settle: two springs, so the dip is ~9 % whatever the size
        const tq = q(t), from = o.from ?? 1.14, under = 1 - 0.09 * (from - 1) / 0.14;
        const s = Motion.track(tq, [[T0, from], [T0, under, STAMP_IN], [T0 + 0.1, 1, STAMP_SET]]);
        const r = (o.tilt ?? -3) * (1 - Motion.step(tq - T0, STAMP_SET));
        return { s, r, hide: tq < T0 };
      }
      if (verb === 'snap') return { x: -(o.d ?? 80) * (1 - Motion.step(q(t) - T0, SNAP)), hide: q(t) < T0 };
      if (verb === 'draw') {
        const u = ioEase(C.clamp((q(t) - T0) / (o.dur ?? 0.6)));
        return { css: { strokeDashoffset: String(1 - u) }, u };
      }
      return { y: (o.d ?? 60) * (1 - C.sp(q(t), at, 'enter')), hide: q(t) < T0 };
    };
    const slip = (t, at, o = {}) => {   // out on a fast spring, back on a bouncy one: passes register once, then locks
      const tq = q(t), T0 = C.bt(at), d = o.d ?? 24, back = T0 + (o.hold ?? 0.25);
      return d * (Motion.step(tq - T0, STAMP_IN) - Motion.step(tq - back, SLIP));
    };
    return { q, drawing, enter, slip };
  }
  function applyMotion(m) {
    if (!m) return;
    const own = (C.TL.motion ||= {});   // timeline.json wins key by key: re-apply it after the theme
    Motion.configure({ roles: m.roles });
    Motion.configure({ roles: own.roles || {}, presets: own.presets || {} });
    if (own.stagger == null) own.stagger = m.stagger;
    if (own.cascade == null && m.cascade) own.cascade = m.cascade;   // riso: prints on twos stay mechanical
  }
  const FONTS = {
    sofia: ['Sofia', 'sofia-sans-extra-condensed'], literata: ['Literata', 'literata'], tektur: ['Tektur', 'tektur'],
    martian: ['Martian', 'martian-mono'], geologica: ['Geologica', 'geologica'], commissioner: ['Commissioner', 'commissioner'],
    dela: ['Dela', 'dela-gothic-one', '400'], unbounded: ['Unbounded', 'unbounded'], inter: ['Inter', 'inter'],
    manrope: ['Manrope', 'manrope'],
    // handwriting (scripts/fonts.sh fetches them with the theme; a static face carries its one weight)
    caveat: ['Caveat', 'caveat'], badscript: ['BadScript', 'bad-script', '400'], neucha: ['Neucha', 'neucha', '400'],
    wenkai: ['WenKai', 'lxgw-wenkai-tc:700', '700'], pangolin: ['Pangolin', 'pangolin', '400'], shantell: ['Shantell', 'shantell-sans'],
    greatvibes: ['GreatVibes', 'great-vibes', '400'], wetpaint: ['WetPaint', 'rubik-wet-paint', '400'],
    playpen: ['Playpen', 'playpen-sans'], marck: ['Marck', 'marck-script', '400'],
  };
  // object colours of a paper theme from its palette: ink objects, accent highlights, tints of the paper for the rest
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, u) => a.map((v, i) => Math.round(v + (b[i] - v) * u));
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  const rgba = (c, a) => `rgba(${c.join(',')},${a})`;
  function paper(t) {
    const bg = rgb(t.bg), ink = rgb(t.ink), acc = rgb(t.acc), acc2 = rgb(t.acc2 || t.acc), W = [255, 255, 255];
    return { size: 1, stage: 'spot', mood: [W, mix(W, acc, 0.08), mix(W, acc2, 0.08)], glowA: 0.8, floor: ink, floorA: 0.12, dust: null, vign: 0.1,
      money: acc2, band: mix(bg, W, 0.5), goog: mix(bg, ink, 0.25), googWin: mix(bg, W, 0.6), cai: acc, caiWin: mix(acc, W, 0.7),
      plinth: mix(bg, ink, 0.1), p1: ink, p2: acc, tileOff: mix(bg, ink, 0.12), tileOn: acc, tileGlow: false,
      card: hex(mix(bg, W, 0.6)), cardLine: rgba(ink, 0.1), skel: [0.12, 0.08, 0.35, 0.18].map((u) => hex(mix(bg, ink, u))),
      chip: t.ink, chipInk: t.bg, labelPlate: rgba(ink, 0.92), labelInk: t.bg, edge: 'rgba(255,255,255,0.55)', light: true, ...t };
  }
  const THEMES = {
    reference: { bg: '#0b0a10', ink: '#f4f2ee', ink2: '#8d8a99', acc: '#ff5222', acc2: '#3ddc84', D: 'Display', U: 'UI', N: 'Display', H: 'Caveat', hw: 700, hand: '#f4f2ee',
         dw: 800, caps: true, ls: '0', size: 1, stage: 'glow', mood: [[112, 84, 255], [255, 74, 30], [40, 200, 110]], glowA: 0.42,
         floor: [150, 140, 200], floorA: 0.16, dust: [220, 214, 255], vign: 0.6,
         money: [118, 206, 132], band: [246, 240, 224], goog: [58, 56, 66], googWin: [255, 244, 214], cai: [96, 72, 230], caiWin: [196, 184, 255],
         plinth: [30, 28, 38], p1: [70, 112, 255], p2: [255, 72, 92], tileOff: [40, 37, 52], tileOn: [255, 74, 30], tileGlow: true,
         card: 'linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.03))', cardLine: 'rgba(255,255,255,.10)', skel: ['#34303e', '#2c2935', '#4a4656', '#2a2733'],
         chip: '#f4f2ee', chipInk: '#16141c', labelPlate: 'rgba(244,242,238,0.95)', labelInk: '#16141c', edge: 'rgba(255,255,255,0.30)' },
    newsroom: { bg: '#0c1411', ink: '#eef0e6', ink2: '#86948b', acc: '#ffb21e', acc2: '#3fd6c2', D: 'Sofia', U: 'Commissioner', N: 'Sofia', H: 'Caveat', hw: 600, hand: '#3fd6c2',
         dw: 900, caps: true, ls: '0.01em', size: 1.42, stage: 'pool', mood: [[63, 214, 194], [255, 140, 30], [120, 230, 150]], glowA: 0.30,
         floor: [130, 200, 175], floorA: 0.14, dust: [230, 240, 220], vign: 0.7,
         money: [120, 196, 120], band: [240, 232, 200], goog: [52, 64, 60], googWin: [255, 214, 140], cai: [26, 130, 118], caiWin: [180, 255, 236],
         plinth: [22, 32, 29], p1: [63, 214, 194], p2: [255, 178, 30], tileOff: [30, 44, 40], tileOn: [255, 178, 30], tileGlow: true,
         card: 'linear-gradient(180deg,rgba(220,255,240,.07),rgba(220,255,240,.025))', cardLine: 'rgba(220,255,240,.10)', skel: ['#25352f', '#1f2d28', '#3b4b45', '#1c2925'],
         chip: '#ffb21e', chipInk: '#0c1411', labelPlate: 'rgba(238,240,230,0.95)', labelInk: '#0c1411', edge: 'rgba(230,255,240,0.26)' },
    studio: { bg: '#dfe3e8', ink: '#121418', ink2: '#5c636d', acc: '#d8261a', acc2: '#1f7a46', D: 'Literata', U: 'Commissioner', N: 'Literata', H: 'BadScript', hw: 400, hand: '#d8261a',
         dw: 800, caps: false, ls: '-0.02em', size: 1.08, stage: 'spot', mood: [[255, 255, 255], [255, 236, 228], [236, 255, 240]], glowA: 0.9,
         floor: [90, 100, 115], floorA: 0.18, dust: null, vign: 0.16,
         money: [86, 176, 110], band: [250, 248, 240], goog: [176, 182, 192], googWin: [255, 230, 160], cai: [36, 62, 210], caiWin: [210, 224, 255],
         plinth: [196, 201, 209], p1: [36, 62, 210], p2: [216, 38, 26], tileOff: [196, 202, 210], tileOn: [216, 38, 26], tileGlow: false,
         card: '#f6f7f9', cardLine: 'rgba(18,20,24,.08)', skel: ['#dde1e6', '#e6e9ed', '#9aa1ab', '#c9ced5'],
         chip: '#121418', chipInk: '#f6f7f9', labelPlate: 'rgba(18,20,24,0.92)', labelInk: '#f6f7f9', edge: 'rgba(255,255,255,0.55)' },
    blueprint: { bg: '#1238a8', ink: '#f2f5ff', ink2: '#a9bcff', acc: '#ffd23f', acc2: '#ffd23f', D: 'Tektur', U: 'Commissioner', N: 'Martian', H: 'WenKai', hw: 700, hand: '#ffd23f',
         dw: 800, caps: true, ls: '0.02em', size: 1.0, stage: 'blueprint', mood: null, glowA: 0,
         floor: [220, 230, 255], floorA: 0.26, dust: null, vign: 0.35,
         money: [255, 210, 63], band: [18, 56, 168], goog: [40, 86, 200], googWin: [242, 245, 255], cai: [58, 110, 235], caiWin: [255, 210, 63],
         plinth: [24, 66, 180], p1: [242, 245, 255], p2: [255, 210, 63], tileOff: [34, 78, 196], tileOn: [255, 210, 63], tileGlow: false,
         card: 'rgba(242,245,255,.06)', cardLine: 'rgba(242,245,255,.55)', skel: ['rgba(242,245,255,.25)', 'rgba(242,245,255,.18)', 'rgba(242,245,255,.35)', 'rgba(242,245,255,.10)'],
         chip: '#ffd23f', chipInk: '#1238a8', labelPlate: 'rgba(242,245,255,0.95)', labelInk: '#1238a8', edge: 'rgba(242,245,255,0.9)' },
    riso: { bg: '#ffffff', ink: '#0d5fb0', ink2: '#5b84b8', acc: '#ff3fa4', acc2: '#ff3fa4', D: 'Dela', U: 'Commissioner', N: 'Dela', H: 'Neucha', hw: 400, hand: '#0d5fb0',
         dw: 400, caps: true, ls: '0', size: 0.9, stage: 'riso', mood: null, glowA: 0, misreg: '#ff3fa4',
         floor: [13, 95, 176], floorA: 0.22, dust: null, vign: 0,
         money: [0, 169, 92], band: [255, 63, 164], goog: [13, 95, 176], googWin: [0, 169, 92], cai: [255, 63, 164], caiWin: [150, 220, 180],
         plinth: [190, 200, 214], p1: [13, 95, 176], p2: [255, 63, 164], tileOff: [205, 212, 222], tileOn: [255, 63, 164], tileGlow: false,
         card: '#ffffff', cardLine: 'rgba(13,95,176,.25)', skel: ['#d9e2ee', '#e4eaf2', '#8fb0d6', '#c4d3e6'],
         chip: '#0d5fb0', chipInk: '#ffffff', labelPlate: 'rgba(255,255,255,0.96)', labelInk: '#0d5fb0', edge: 'rgba(255,255,255,0.5)' },
    graphite: { bg: '#1a1917', ink: '#ecebe4', ink2: '#8f8b83', acc: '#c9f031', acc2: '#c9f031', D: 'Geologica', U: 'Geologica', N: 'Geologica', H: 'Pangolin', hw: 400, hand: '#ecebe4',
         dw: 800, caps: false, ls: '-0.035em', size: 1.1, stage: 'pool', mood: [[255, 248, 236], [255, 248, 236], [255, 248, 236]], glowA: 0.13,
         floor: [236, 235, 228], floorA: 0.08, dust: null, vign: 0.55,
         money: [201, 240, 49], band: [26, 25, 23], goog: [70, 68, 64], googWin: [236, 235, 228], cai: [118, 115, 108], caiWin: [201, 240, 49],
         plinth: [40, 39, 36], p1: [236, 235, 228], p2: [201, 240, 49], tileOff: [48, 47, 44], tileOn: [201, 240, 49], tileGlow: false,
         card: 'rgba(236,235,228,.05)', cardLine: 'rgba(236,235,228,.10)', skel: ['#34332f', '#2c2b28', '#55534d', '#262522'],
         chip: '#c9f031', chipInk: '#1a1917', labelPlate: 'rgba(236,235,228,0.95)', labelInk: '#1a1917', edge: 'rgba(255,255,255,0.22)' },
    // «Лента»: the faces Reels makers reach for that have Cyrillic and an open licence. Instagram Sans is Meta's own and
    // not licensed outside the app; Inter is its nearest open twin. Display: Manrope — Unbounded had become the reel
    // cliché (2026-11-01); the hand is Shantell Sans, readable small on a phone.
    feed: { bg: '#ffffff', ink: '#0f1012', ink2: '#6b6f76', acc: '#3d5afe', acc2: '#ff4d2e', D: 'Manrope', U: 'Inter', N: 'Manrope', H: 'Shantell', hw: 700, hand: '#e5401f',
         dw: 800, caps: false, ls: '-0.02em', size: 0.92, stage: 'spot', mood: [[255, 255, 255], [255, 240, 236], [240, 244, 255]], glowA: 0.9,
         floor: [60, 70, 90], floorA: 0.10, dust: null, vign: 0.08,
         money: [120, 214, 140], band: [255, 255, 255], goog: [222, 226, 234], googWin: [255, 232, 160], cai: [61, 90, 254], caiWin: [214, 222, 255],
         plinth: [232, 235, 240], p1: [61, 90, 254], p2: [255, 77, 46], tileOff: [226, 230, 238], tileOn: [61, 90, 254], tileGlow: false,
         card: '#ffffff', cardLine: 'rgba(15,16,18,.08)', skel: ['#eceef2', '#f2f3f6', '#a6abb4', '#d7dbe2'],
         chip: '#0f1012', chipInk: '#ffffff', labelPlate: 'rgba(15,16,18,0.92)', labelInk: '#ffffff', edge: 'rgba(255,255,255,0.7)' },
    // «Тетрадь стратега»: a margin note in red pen over a strict argument; marker for PAPER.marker
    notebook: paper({ bg: '#f2f6ef', ink: '#17221c', ink2: '#4f5d55', acc: '#c63b27', acc2: '#3f8f5e', marker: '#d4f53c',
         D: 'Commissioner', U: 'Commissioner', N: 'Commissioner', H: 'Caveat', hw: 700, hand: '#c63b27', dw: 800, caps: false, ls: '-0.02em' }),
    // «Калька»: the light blueprint — tracing paper, ink lines, a red pencil note
    draft: paper({ bg: '#edf3fb', ink: '#12357a', ink2: '#3d5b98', acc: '#c4213a', acc2: '#3d5b98', stage: 'blueprint', rule: '#9fb5da',
         D: 'Tektur', U: 'Commissioner', N: 'Martian', H: 'WenKai', hw: 700, hand: '#c4213a', dw: 700, caps: true, ls: '0.01em' }),
    // «Открытка»: calligraphy in the middle, a quiet serif under it; peony and leaf
    card: paper({ bg: '#ffe6ec', ink: '#0f4d3a', ink2: '#2b6551', acc: '#d6336c', acc2: '#0f4d3a',
         D: 'Literata', U: 'Literata', N: 'Literata', H: 'GreatVibes', hw: 400, hand: '#0f4d3a', dw: 600, caps: false, ls: '0', size: 0.95 }),
    // «Двор»: the whole frame signal orange, a huge condensed word, paint lettering in white
    yard: paper({ bg: '#ff5b14', ink: '#141414', ink2: '#3a1a0a', acc: '#ffffff', acc2: '#141414', vign: 0,
         D: 'Sofia', U: 'Commissioner', N: 'Sofia', H: 'WetPaint', hw: 400, hand: '#ffffff', dw: 800, caps: true, ls: '-0.01em', size: 1.5 }),
    // «Канцелярия»: a felt-tip list, cranberry and mint
    stationery: paper({ bg: '#fff0f3', ink: '#2b1d22', ink2: '#8c7f84', acc: '#cc2a49', acc2: '#9fdcc4',
         D: 'Playpen', U: 'Commissioner', N: 'Playpen', H: 'Playpen', hw: 500, hand: '#2b1d22', dw: 700, caps: false, ls: '-0.01em' }),
    // «Школьная тетрадь»: Russian copybook script in blue pen on ruled paper, the teacher's red pen
    school: paper({ bg: '#fbfdff', ink: '#1e3a8a', ink2: '#4a5f8a', acc: '#c41e3a', acc2: '#1e3a8a', rule: '#c2d7ef', margin: '#ef9a9a',
         D: 'Commissioner', U: 'Commissioner', N: 'Commissioner', H: 'Marck', hw: 400, hand: '#1e3a8a', dw: 600, caps: false, ls: '0' }),
  };
  function use(name, o = {}) {
    const T = THEMES[name];
    if (!T) throw new Error(`unknown theme: ${name} (${Object.keys(THEMES).join(', ')})`);
    const only = o.only === 'hand', css = [];
    for (const [fam, id, wt = '100 900'] of Object.values(FONTS)) if ((only ? [T.H] : [T.D, T.U, T.N, T.H]).includes(fam))
      for (const [sub, range] of [['cyrillic', 'U+0400-04FF, U+2010-2027'], ['latin', 'U+0000-03FF, U+2000-200F, U+2028-206F, U+20A0-20CF']])
        css.push(`@font-face{font-family:'${fam}';src:url(../assets/fonts/v/${id.split(':')[0]}-${sub}.woff2) format('woff2');unicode-range:${range};font-weight:${wt}}`);
    document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css.join('\n') }));
    const write = (parent, text, at, o = {}) => HAND.write(parent, text, at, { font: T.H, weight: T.hw, color: T.hand, ...o });
    if (only) return { name, only: 'hand', H: T.H, hw: T.hw, hand: T.hand, write };   // a brand keeps its palette and type
    const rs = document.documentElement.style;
    rs.setProperty('--bg', T.bg); rs.setProperty('--ink', T.ink); rs.setProperty('--ink-2', T.ink2); rs.setProperty('--accent', T.acc);
    const motion = MOTION[name] || null;
    applyMotion(motion);
    return { name, light: T.stage === 'spot' || T.stage === 'riso', ...T, motion, ...helpers(motion), write };
  }
  // The theme scripts/theme_pick.py chose for this film (timeline.json "theme"), or null. Beyond use(), it points the
  // starter's faces at the theme: #stage gets the UI face, .display the display face, its weight, caps and tracking.
  function auto() {
    const th = (window.TL || {}).theme;
    if (!th || !THEMES[th.name]) return null;
    const T = use(th.name, { only: th.only });
    if (T.only) return T;
    document.head.appendChild(Object.assign(document.createElement('style'), { textContent:
      `#stage{font-family:'${T.U}',sans-serif}.display{font-family:'${T.D}',sans-serif;font-weight:${T.dw};letter-spacing:${T.ls};` +
      `text-transform:${T.caps ? 'uppercase' : 'none'}}` }));
    return T;
  }
  window.THEMES = { ...THEMES, use, auto, names: Object.keys(THEMES), fonts: FONTS, motion: MOTION };
})();
