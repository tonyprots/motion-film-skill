// WebGL layer for motion-film: three.js + pmndrs/postprocessing, driven only by seek(t).
// Load it from a module next to film.js (film/gl.js), never from film.js itself:
//
//   <script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js",
//     "three/addons/":"/node_modules/three/examples/jsm/","postprocessing":"/node_modules/postprocessing/build/index.js"}}</script>
//   <script type="module" src="gl.js"></script>                 (after film.js; timeline.json "webgl": true)
//
//   // film/gl.js
//   import { layer, THREE } from './lib/gl.js';
//   const L = await layer(document.querySelector('[data-scene="hero"]'), { bloom: 0.5, dof: {} });   // dof: autofocus on the origin
//   const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.3, 256, 48), L.physical({ color: '#2d5bff' }));
//   L.scene.add(knot);
//   L.frame((t, b) => { knot.rotation.y = C.sp(t, 'hero') * Math.PI; L.camera.position.z = 6 - C.seg(t, 'hero', 'hero_end') });
//   C.glDone();                                                   // frame 0 waits for this
//
// Contract (lab 2026-10-06, M1): the same t gives the same pixels in any order, after any other frame, and across
// parallel workers, on ANGLE Metal and on SwiftShader. What keeps it so:
// - every frame is rendered whole from t: composer.render(0), effect time = t, no clock, no accumulation buffers;
// - preserveDrawingBuffer so the screenshot reads this frame; no TAA, no temporal effects, no Math.random without a seed;
// - render with --gpu (timeline "webgl": true does it): ~95 ms a frame on Metal vs ~1.4 s on SwiftShader.
//   Metal and SwiftShader pixels differ, so one backend for the whole film.
// Grain is not here: use timeline "finish".grain (absolute-frame grain after motion blur).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer, RenderPass, EffectPass, Effect, BlendFunction, KawaseBlurPass, KernelSize, BloomEffect, VignetteEffect, ToneMappingEffect, ToneMappingMode, DepthOfFieldEffect } from 'postprocessing';

export { THREE };

/**
 * A full-frame WebGL layer inside `parent` (a scene root or any element). Options:
 *   fov 35 · bg null (transparent: the DOM shows through) or a colour · env 'room' | 'assets/3d/x.hdr' · envIntensity 1
 *   tone 'neutral' (lit 3D: soft highlights) | 'none' (flat 2D and exact brand colours: neutral maps white to 240/255 and
 *     dulls the accent) | 'agx' | 'aces'
 *   bloom 0 (additive, threshold 0.85: light on a DARK ground; on a light ground it washes the frame out — use glow)
 *   glow 0 | { strength 0.8, size 'large', color } — a soft halo of the layer's own content laid UNDER it, for a light ground:
 *     the DOM seen through a transparent layer (bg null) or the layer's own bg colour; it never brightens the ground.
 *     A number = strength. color (e.g. the accent) tints the halo by coverage instead of blurring the
 *     content's own colours — dark ink blurred over a light ground reads as grey haze. Draw the ground with bg, not with a full-frame mesh: the halo goes between the two.
 *   vignette 0 (darkness 0.2–0.4)
 *   dof null | { focus, target, range 1, bokeh 2.5 } — world units, like the scene: focus = distance from the camera;
 *     target = a THREE.Vector3 to keep sharp as the camera moves; neither → autofocus on the origin. Per frame:
 *     L.dof.target.set(…) or L.dof.cocMaterial.focusDistance = d (a focus pull).
 *   msaa 4 · z (CSS z-index inside parent; 0 = under the scene's DOM children, raise it to draw over them)
 * Returns { scene, camera, renderer, composer, dof, frame(fn), physical(props), gltf(url), texture(url), render(t, b) }.
 */
export async function layer(parent, o = {}) {
  const W = C.W, H = C.H;
  const groundFx = o.glow && o.bg != null;   // glow over an opaque bg: render transparent, lay the bg in after the halo
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: o.bg == null || groundFx, preserveDrawingBuffer: true, powerPreference: 'high-performance', stencil: false, depth: false });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  Object.assign(renderer.domElement.style, { position: 'absolute', left: 0, top: 0, width: W + 'px', height: H + 'px', zIndex: o.z ?? 0, pointerEvents: 'none' });
  parent.prepend(renderer.domElement);
  renderer.setClearColor(o.bg == null || groundFx ? 0x000000 : new THREE.Color(o.bg), o.bg == null || groundFx ? 0 : 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(o.fov ?? 35, W / H, 0.1, 200);
  camera.position.set(0, 0, 6);
  const pmrem = new THREE.PMREMGenerator(renderer);
  if (!o.env || o.env === 'room') scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  else { const hdr = await new RGBELoader().loadAsync('../' + o.env); scene.environment = pmrem.fromEquirectangular(hdr).texture; hdr.dispose(); }
  scene.environmentIntensity = o.envIntensity ?? 1;

  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: o.msaa ?? 4, alpha: o.bg == null || groundFx });
  composer.addPass(new RenderPass(scene, camera));
  const fx = [];
  let dof = null;
  if (o.dof) {
    // postprocessing 6.x takes focusDistance / focusRange in WORLD units (a 0..1 depth value would focus 2 cm from the lens)
    dof = new DepthOfFieldEffect(camera, { focusDistance: o.dof.focus ?? camera.position.length(), focusRange: o.dof.range ?? 1, bokehScale: o.dof.bokeh ?? 2.5 });
    if (o.dof.focus == null) dof.target = o.dof.target || new THREE.Vector3(0, 0, 0);
    fx.push(dof);
  }
  if (o.glow) fx.push(new GlowUnder({ ...(typeof o.glow === 'number' ? { strength: o.glow } : o.glow), ground: groundFx ? o.bg : null }));
  if (o.bloom) fx.push(new BloomEffect({ intensity: o.bloom, luminanceThreshold: o.bloomThreshold ?? 0.85, mipmapBlur: true }));
  if (o.vignette) fx.push(new VignetteEffect({ darkness: o.vignette }));
  const tone = o.tone || 'neutral';
  if (tone !== 'none') fx.push(new ToneMappingEffect({ mode: { agx: ToneMappingMode.AGX, aces: ToneMappingMode.ACES_FILMIC, neutral: ToneMappingMode.NEUTRAL }[tone] }));
  const pass = new EffectPass(camera, ...fx);
  composer.addPass(pass);

  const fns = [];
  const L = {
    scene, camera, renderer, composer, dof,
    /** per-frame update: fn(t, beat) sets every animated value from t. Return false to skip rendering (layer hidden). */
    frame: (fn) => fns.push(fn),
    physical: (p) => new THREE.MeshPhysicalMaterial({ roughness: 0.25, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.1, ...p }),
    gltf: async (url) => (await new GLTFLoader().loadAsync('../' + url)).scene,
    /** a real screenshot as a texture (device screens, floating UI cards) */
    texture: async (url) => { const tx = await new THREE.TextureLoader().loadAsync('../' + url); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8; return tx; },
    render(t, b) {
      if (fns.map((fn) => fn(t, b)).includes(false)) return;
      if (pass.fullscreenMaterial && 'time' in pass.fullscreenMaterial) pass.fullscreenMaterial.time = t;   // f(t), never accumulated
      composer.render(0);
    },
  };
  C.hooks.after.push((t, b) => L.render(t, b));
  return L;
}

// Halo for a light ground: a blur of the layer itself, composited UNDER it in premultiplied space
// (out = in + (1 − in.a) · blur), so the halo only fills transparent pixels and the DOM ground stays its own colour.
// With ground (the layer's bg colour) the result is then laid over that colour and comes out opaque.
class GlowUnder extends Effect {
  constructor({ strength = 0.8, size = 'large', ground = null, color = null } = {}) {
    const G = ground == null ? null : new THREE.Color(ground);   // linear, like the buffer
    const T = color == null ? null : new THREE.Color(color);
    super('GlowUnder', `uniform sampler2D glowMap; uniform float strength; uniform vec3 ground, tint; uniform float hasGround, hasTint;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec4 g = min(texture2D(glowMap, uv) * strength, vec4(1.0));
        if (hasTint > 0.5) g = vec4(tint * g.a, g.a);
        vec4 c = inputColor + (1.0 - inputColor.a) * g;
        outputColor = hasGround > 0.5 ? vec4(c.rgb + (1.0 - c.a) * ground, 1.0) : c; }`,
    { blendFunction: BlendFunction.SRC, uniforms: new Map([['glowMap', new THREE.Uniform(null)], ['strength', new THREE.Uniform(strength)],
      ['ground', new THREE.Uniform(G || new THREE.Color(0))], ['hasGround', new THREE.Uniform(G ? 1 : 0)],
      ['tint', new THREE.Uniform(T || new THREE.Color(0))], ['hasTint', new THREE.Uniform(T ? 1 : 0)]]) });
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.blur = new KawaseBlurPass({ kernelSize: KernelSize[String(size).toUpperCase()] ?? KernelSize.LARGE });
    this.uniforms.get('glowMap').value = this.rt.texture;
  }
  update(renderer, inputBuffer) { this.blur.render(renderer, inputBuffer, this.rt); }
  setSize(w, h) { this.rt.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1)); this.blur.setSize(w, h); }
}

/**
 * A living background: a soft mesh gradient from brand colours, slowly warped by seeded noise, f(t) only.
 * colors: 3–5 CSS colours; the first is the ground, the rest are soft lights over it (keep them tonal: one accent +
 * neutrals; blue-to-purple washes read as stock). Options: radius 0.45 (light size, frame heights), seed.
 * More options: speed 0.05 (very slow), scale 1.4, z -1. Grain comes from timeline "finish".grain, not from here.
 */
export function meshBackground(parent, colors, o = {}) {
  const W = C.W, H = C.H;
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, alpha: false, depth: false, stencil: false });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  Object.assign(renderer.domElement.style, { position: 'absolute', left: 0, top: 0, width: W + 'px', height: H + 'px', zIndex: o.z ?? -1, pointerEvents: 'none' });
  parent.prepend(renderer.domElement);
  const cols = colors.map((c) => new THREE.Color(c));
  while (cols.length < 5) cols.push(cols[cols.length % colors.length].clone());
  const rnd = C.mulberry32(o.seed ?? 3);
  const pts = cols.map((_, i) => new THREE.Vector2((i % 2 ? 0.2 : 0.65) + 0.25 * rnd(), (i < 3 ? 0.2 : 0.6) + 0.25 * rnd()));   // spread over the frame
  const mat = new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 }, aspect: { value: W / H }, cols: { value: cols }, pts: { value: pts }, scale: { value: o.scale ?? 1.4 }, radius: { value: o.radius ?? 0.45 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      precision highp float; varying vec2 vUv; uniform float t, aspect, scale, radius; uniform vec3 cols[5]; uniform vec2 pts[5];
      vec2 hash(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return -1.0 + 2.0 * fract(sin(p) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
        return mix(mix(dot(hash(i), f), dot(hash(i + vec2(1, 0)), f - vec2(1, 0)), u.x), mix(dot(hash(i + vec2(0, 1)), f - vec2(0, 1)), dot(hash(i + vec2(1, 1)), f - vec2(1, 1)), u.x), u.y); }
      void main(){
        vec2 p = vUv; p.x *= aspect;
        vec2 w = p + 0.18 * vec2(noise(p * scale + t), noise(p * scale - t + 7.0));
        vec3 c = cols[0];                                   // the first colour is the ground, the others are soft lights over it
        for (int i = 1; i < 5; i++) { vec2 q = pts[i] + 0.12 * vec2(sin(t * 0.9 + float(i) * 1.7), cos(t * 0.7 + float(i) * 2.3)); q.x *= aspect;
          float d = distance(w, q); c = mix(c, cols[i], 0.8 * exp(-d * d / (radius * radius))); }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  mat.toneMapped = false;
  const scene = new THREE.Scene(), cam = new THREE.Camera();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  const speed = o.speed ?? 0.05;
  C.hooks.after.push((t) => { mat.uniforms.t.value = t * speed * 6.2832; renderer.render(scene, cam); });
  return { renderer, material: mat };
}

/**
 * A still PHOTO with 2.5D depth: pixels shift by their depth as the camera moves (scripts/vision.py depth makes the map).
 * Photos of people, products, places only — on a UI screenshot or text, parallax tears straight edges (vision.py refuses them).
 *   await depthPhoto(parent, 'assets/shots/cup.jpg', 'assets/shots/cup.depth.png', { move: (t) => ({ z: C.seg(t, 'end', 'done') }) })
 * move(t) → {x, y, z}: sideways drift and push-in, each −1..1 (z 1 = the full push). Options: amount 0.02 (the largest shift,
 * as a share of the frame — keep ≤ 0.03), focus 0.5 (the depth that stays put: 1 = nearest), overscan 1.06, box {x, y, w, h}
 * in parent px (default the full frame), z (CSS z-index). Cover-fits the photo into the box. f(t) only.
 */
export async function depthPhoto(parent, src, depthSrc, o = {}) {
  const box = o.box || { x: 0, y: 0, w: C.W, h: C.H };
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, alpha: true, depth: false, stencil: false });
  renderer.setPixelRatio(1); renderer.setSize(box.w, box.h, false);
  Object.assign(renderer.domElement.style, { position: 'absolute', left: box.x + 'px', top: box.y + 'px', width: box.w + 'px', height: box.h + 'px', zIndex: o.z ?? 0, pointerEvents: 'none' });
  parent.prepend(renderer.domElement);
  const load = async (u, srgb) => { const t = await new THREE.TextureLoader().loadAsync('../' + u); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; return t; };
  const [img, dep] = await Promise.all([load(src, true), load(depthSrc, false)]);
  const ia = img.image.width / img.image.height, ba = box.w / box.h;
  const cover = ia > ba ? new THREE.Vector2(ba / ia, 1) : new THREE.Vector2(1, ia / ba);   // share of the photo the box shows
  const mat = new THREE.ShaderMaterial({
    uniforms: { img: { value: img }, dep: { value: dep }, cover: { value: cover }, move: { value: new THREE.Vector3() },
      amount: { value: o.amount ?? 0.02 }, focus: { value: o.focus ?? 0.5 }, over: { value: o.overscan ?? 1.06 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      precision highp float; varying vec2 vUv; uniform sampler2D img, dep; uniform vec2 cover; uniform vec3 move; uniform float amount, focus, over;
      vec2 at(vec2 uv, float d){ vec2 c = (uv - 0.5) / over; c /= 1.0 + move.z * amount * 4.0 * (d - focus + 0.5);   // near grows faster on a push
        return 0.5 + c * cover - move.xy * amount * (d - focus); }
      void main(){
        float d = texture2D(dep, 0.5 + (vUv - 0.5) * cover).r; vec2 uv = at(vUv, d);
        for (int i = 0; i < 3; i++) { d = texture2D(dep, uv).r; uv = at(vUv, d); }   // refine: look the depth up where we land
        gl_FragColor = texture2D(img, clamp(uv, 0.001, 0.999));
        #include <colorspace_fragment>
      }`,
  });
  const scene = new THREE.Scene(), cam = new THREE.Camera();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  C.hooks.after.push((t) => { const m = (o.move || (() => ({})))(t) || {}; mat.uniforms.move.value.set(m.x ?? 0, m.y ?? 0, m.z ?? 0); renderer.render(scene, cam); });
  return { renderer, material: mat };
}

/**
 * A real UI screenshot as a plane in 3D: an oblique camera travels over it and depth of field follows the page.
 * For ONE or two shots per film where a big real screen is the subject and the voice names its detail (RULES.md
 * "A screen in 3D"). Not for every screenshot; not for text that must be read whole.
 *
 *   const U = await uiShot(sceneRoot, [{ id: 'page', src: 'assets/shots/app.png', w: 1600 }], {
 *     keys: [['s3', { x: 300, y: 180, d: 900, yaw: -26, pitch: 12 }],     // look at (x, y) of the page from d px away
 *            ['s3b', { x: 300, y: 700 }]],                                 // rail: only the target moves → camera travels
 *     dof: { strength: 40, max: 8 } });
 *
 * planes: [{ id, src, w (px in world; height from the image), x, y, z (top-left of the plane, world px; +z towards the
 *   camera), yaw, pitch (deg, around the plane's own centre), radius 24 (rounded corners, image px), shadow true,
 *   move(t, b) → {x, y, z, yaw, pitch, o} per frame (lift a WHOLE card; never a cut-out piece) }].
 * Coordinates are the first plane's pixels: x right, y down. The camera:
 *   keys [[mark, {x, y, d, yaw, pitch, roll, focus}], …] — target point, distance, angles (deg; yaw < 0 = the left edge is
 *     near); missing fields keep the previous key. Springs keep velocity (C.trkObj), preset 'camera', each key starts
 *     `lead` s (0.4) before its mark like CAM.rig. cam(t, b) → the same object replaces keys for hand-made paths.
 *   persp 1200 — CSS-like perspective: at d = persp a plane at yaw 0 shows 1:1.
 * Depth of field — thin lens, per pixel: blur = min(max, strength · |1 − s / d|), s = focus distance (default d: the
 *   target is sharp), d = this pixel's distance along the camera axis. strength folds f² / (N·(s − f)) into one number:
 *   40 = gentle, 80 = shallow. A focus pull: put `focus` into a key. dof: null → everything sharp.
 * Background is transparent: the scene's DOM ground (light presets) shows through. Needs "webgl": true. f(t) only.
 */
export async function uiShot(parent, planes, o = {}) {
  const box = o.box || { x: 0, y: 0, w: C.W, h: C.H };
  const persp = o.persp ?? 1200, dof = o.dof === null ? null : { strength: 40, max: 8, ...(o.dof || {}) };
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, alpha: true, depth: true, stencil: false });
  renderer.setPixelRatio(1); renderer.setSize(box.w, box.h, false); renderer.setClearColor(0x000000, 0);
  Object.assign(renderer.domElement.style, { position: 'absolute', left: box.x + 'px', top: box.y + 'px', width: box.w + 'px', height: box.h + 'px', zIndex: o.z ?? 0, pointerEvents: 'none' });
  parent.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(2 * Math.atan(box.h / 2 / persp) * 180 / Math.PI, box.w / box.h, 1, 20000);
  const blurU = { strength: { value: dof ? dof.strength : 0 }, maxBlur: { value: dof ? dof.max : 0 }, focus: { value: persp } };

  // one golden-angle disc, shared by every plane: 48 taps cover an 8–12 px blur without visible rings
  const TAPS = 48;
  const disc = Array.from({ length: TAPS }, (_, i) => { const r = Math.sqrt((i + 0.5) / TAPS), a = i * 2.39996323; return new THREE.Vector2(r * Math.cos(a), r * Math.sin(a)); });
  const vert = `varying vec2 vUv; varying float vDepth;
    void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
  // uv runs over the padded quad; the image sits in [pad, 1 - pad]. Samples outside the rounded rect are transparent,
  // so a blurred edge fades instead of smearing the border colour.
  const frag = `precision highp float; varying vec2 vUv; varying float vDepth;
    uniform sampler2D img; uniform vec2 pad, size; uniform float radius, strength, maxBlur, focus, opacity; uniform vec2 disc[${TAPS}];
    vec4 tap(vec2 uv, float px, vec2 gx, vec2 gy){ vec2 q = (uv - pad) / (1.0 - 2.0 * pad); vec2 p = (q - 0.5) * size;
      vec2 e = abs(p) - (0.5 * size - radius); float dist = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - radius;
      float a = clamp(0.5 - dist / max(px, 1e-3), 0.0, 1.0);                               // 1-screen-px antialiased edge
      vec4 c = textureGrad(img, clamp(q, 0.0, 1.0), gx, gy); return vec4(c.rgb * a, a); }   // explicit gradients: no implicit derivatives inside the branch
    void main(){
      // derivatives once, in uniform control flow: uv per screen px and image px per screen px
      vec2 dx = dFdx(vUv), dy = dFdy(vUv), S = size / (1.0 - 2.0 * pad);
      float px = 0.7071 * length(vec2(length(dx * S), length(dy * S)));
      vec2 gx = dx / (1.0 - 2.0 * pad), gy = dy / (1.0 - 2.0 * pad);                        // image uv per screen px
      float r = strength > 0.0 ? min(maxBlur, strength * abs(1.0 - focus / vDepth)) : 0.0;   // blur radius, screen px
      vec4 acc = tap(vUv, px, gx, gy);
      if (r > 0.35) { acc = vec4(0.0);
        for (int i = 0; i < ${TAPS}; i++) acc += tap(vUv + (dx * disc[i].x + dy * disc[i].y) * r, px, gx, gy);
        acc /= float(${TAPS}); }
      if (acc.a < 0.002) discard;
      gl_FragColor = vec4(acc.rgb / acc.a, acc.a * opacity);
      #include <colorspace_fragment>
    }`;
  // soft contact shadow under a lifted plane: an analytic blurred rectangle, no texture
  const shadowFrag = `precision highp float; varying vec2 vUv; varying float vDepth; uniform vec2 size; uniform float soft, opacity;
    void main(){ vec2 p = (vUv - 0.5) * (size + 4.0 * soft); vec2 h = 0.5 * size;
      vec2 s = smoothstep(-h - soft, -h + soft, p) * (1.0 - smoothstep(h - soft, h + soft, p));
      gl_FragColor = vec4(0.0, 0.0, 0.0, s.x * s.y * opacity); }`;

  const loader = new THREE.TextureLoader();
  const P = await Promise.all(planes.map(async (pl) => {
    const tx = await loader.loadAsync('../' + pl.src);
    tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8; tx.generateMipmaps = true; tx.minFilter = THREE.LinearMipmapLinearFilter;
    const iw = tx.image.width, ih = tx.image.height, w = pl.w ?? iw, h = w * ih / iw, k = w / iw;
    const padPx = 64;                                                                     // world px of transparent margin for the blur
    const geo = new THREE.PlaneGeometry(w + 2 * padPx, h + 2 * padPx);
    const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
      uniforms: { img: { value: tx }, pad: { value: new THREE.Vector2(padPx / (w + 2 * padPx), padPx / (h + 2 * padPx)) },
        size: { value: new THREE.Vector2(iw, ih) }, radius: { value: pl.radius ?? 24 }, opacity: { value: 1 }, disc: { value: disc }, ...blurU } });
    const g = new THREE.Group(), mesh = new THREE.Mesh(geo, mat);
    g.add(mesh);
    let sh = null;
    if (pl.shadow !== false) {
      const soft = Math.max(20, 0.04 * w);
      sh = new THREE.Mesh(new THREE.PlaneGeometry(w + 4 * soft, h + 4 * soft), new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: shadowFrag,
        transparent: true, depthWrite: false, uniforms: { size: { value: new THREE.Vector2(w, h) }, soft: { value: soft }, opacity: { value: 0.16 } } }));
      sh.position.set(0, 0.02 * h, -2); g.add(sh);
    }
    scene.add(g);
    return { pl, g, mesh, sh, w, h, k };
  }));
  // camera targets are in the first plane's image px, from its top-left corner
  const k0 = P[0].k, x0 = P[0].pl.x ?? 0, y0 = P[0].pl.y ?? 0;

  const deg = Math.PI / 180;
  const place = (p, m) => {
    const x = m.x ?? p.pl.x ?? 0, y = m.y ?? p.pl.y ?? 0, z = m.z ?? p.pl.z ?? 0;
    p.g.position.set(x + p.w / 2, -(y + p.h / 2), z);                                     // world: y up, plane centre
    p.g.rotation.set((m.pitch ?? p.pl.pitch ?? 0) * deg, (m.yaw ?? p.pl.yaw ?? 0) * deg, 0, 'YXZ');
    const op = m.o ?? 1; p.mesh.material.uniforms.opacity.value = op; if (p.sh) p.sh.material.uniforms.opacity.value = 0.16 * op;
    p.g.visible = op > 0.001;
  };
  const first = (o.keys || [[0, {}]])[0][1];
  const FULL = { x: 0, y: 0, d: persp, yaw: 0, pitch: 0, roll: 0, focus: null, ...first };
  const keys = (o.keys || []).map(([m, v, pr]) => [m, v, pr]);
  // fill missing fields from the previous key so a key may say only what changes
  for (let i = 0; i < keys.length; i++) keys[i][1] = { ...(i ? keys[i - 1][1] : FULL), ...keys[i][1] };
  const camAt = (t, b) => {
    if (o.cam) return { ...FULL, ...o.cam(t, b) };
    const v = C.trkObj(t + (o.lead ?? 0.4), keys.map(([m, v, pr]) => [m, { ...v, focus: v.focus ?? v.d }, pr]), o.preset || 'camera');
    return v;
  };
  const vec = new THREE.Vector3(), q = new THREE.Quaternion(), eul = new THREE.Euler();
  C.hooks.after.push((t, b) => {
    for (const p of P) place(p, (p.pl.move && p.pl.move(t, b)) || {});
    const v = camAt(t, b);
    // the camera sits on a sphere around the target: yaw turns it around the page's vertical, pitch tilts it
    const tx = x0 + v.x * k0, ty = -(y0 + v.y * k0);
    eul.set(-v.pitch * deg, v.yaw * deg, v.roll * deg, 'YXZ'); q.setFromEuler(eul);
    vec.set(0, 0, v.d).applyQuaternion(q);
    camera.position.set(tx + vec.x, ty + vec.y, vec.z); camera.quaternion.copy(q);
    blurU.focus.value = v.focus ?? v.d;
    // explicit back-to-front order: the far plane first, and each shadow right before its own plane. Left to three's
    // transparent sort, an oblique camera can put a shadow "nearer" than its page and darken it.
    const far = P.map((p) => [p, p.g.position.distanceToSquared(camera.position)]).sort((a, c) => c[1] - a[1]);
    far.forEach(([p], i) => { if (p.sh) p.sh.renderOrder = 2 * i; p.mesh.renderOrder = 2 * i + 1; });
    renderer.render(scene, camera);
  });
  return { renderer, scene, camera, planes: P };
}
