// Designer-made Lottie (lottie-web, SVG renderer) as MEDIA in a scene, like a real screenshot: the frame is a pure
// function of t (goToAndStop on every frame), frame 0 waits for the file. For brand or character motion someone made in
// After Effects; never to author motion that the engine's springs can do (time and colour are baked into the file).
// Load lottie-web before film.js:  <script src="/node_modules/lottie-web/build/player/lottie_svg.min.js"></script>
//                                  <script src="lib/lottie.js"></script>
// In a scene:  build: (root, S) => { S.ok = LOTTIE.play(root, 'assets/lottie/ok.json', { x: 760, y: 340, w: 400, h: 400, from: 's3a.2', hold: 78 }) }
//              run: (t, b, S) => S.ok.at(t)
// Options: x y w h (px in the parent), crop [x, y, w, h] (the part of the comp, in comp px, that fills the box: designer
// files often keep the subject small inside a large comp — scripts/lottie.py colors prints the comp size), from (mark/beat where frame 0 plays), loop (repeat the comp), hold (last comp frame
// to show — stop before a built-in fade-out), speed 1. The SVG renderer stays vector under a camera zoom; the canvas one
// blurs (measured: sharpness 73 vs 32 at 2×), so it is the only one here.
(() => {
  function play(parent, src, o = {}) {
    const box = C.el('div', { class: 'abs', style: `left:${o.x || 0}px;top:${o.y || 0}px;width:${o.w}px;height:${o.h}px${o.crop ? ';overflow:hidden' : ''}` }, parent);
    const inner = o.crop ? C.el('div', { class: 'abs' }, box) : box;
    const a = lottie.loadAnimation({ container: inner, renderer: 'svg', loop: false, autoplay: false, path: '../' + src,
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet' } });
    C.gates.push(new Promise((ok, no) => {
      a.addEventListener('DOMLoaded', () => {
        if (o.crop) {   // static layout, set once before frame 0: the crop region scaled to the box width
          const [cx, cy, cw] = o.crop, k = o.w / cw, d = a.animationData;
          Object.assign(inner.style, { left: -cx * k + 'px', top: -cy * k + 'px', width: d.w * k + 'px', height: d.h * k + 'px' });
        }
        ok();
      });
      a.addEventListener('data_failed', () => no(new Error(`lottie: cannot load ${src}`)));
    }));
    return {
      anim: a, box,
      at(t) {
        if (!a.isLoaded) return;
        const n = a.totalFrames, last = Math.min(o.hold ?? n - 1, n - 1);
        let f = (t - C.bt(o.from ?? 0)) * a.frameRate * (o.speed ?? 1);
        f = o.loop ? ((f % n) + n) % n : C.clamp(f, 0, last);
        a.goToAndStop(f, true);
      },
    };
  }
  window.LOTTIE = { play };
})();
