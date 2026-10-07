// WebGL layer for motion-film: three.js + pmndrs/postprocessing, driven only by seek(t).
// Load it from a module next to film.js (film/gl.js), never from film.js itself:
//
//   <script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js",
//     "three/addons/":"/node_modules/three/examples/jsm/","postprocessing":"/node_modules/postprocessing/build/index.js"}}</script>
//   <script type="module" src="gl.js"></script>                 (after film.js; timeline.json "webgl": true)
//
//   // film/gl.js
//   import { layer, THREE } from './lib/gl.js';
//   const L = await layer(document.querySelector('[data-scene="hero"]'), { bloom: 0.5, dof: { focus: 0.02 } });
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
import { EffectComposer, RenderPass, EffectPass, BloomEffect, VignetteEffect, ToneMappingEffect, ToneMappingMode, DepthOfFieldEffect } from 'postprocessing';

export { THREE };

/**
 * A full-frame WebGL layer inside `parent` (a scene root or any element). Options:
 *   fov 35 · bg null (transparent: the DOM shows through) or a colour · env 'room' | 'assets/3d/x.hdr' · envIntensity 1
 *   tone 'neutral' (keeps brand colours) | 'agx' | 'aces' · bloom 0 (intensity; threshold 0.85) · vignette 0 (darkness 0.2–0.4) · dof null | { focus, range, bokeh }
 *   msaa 4 · z (CSS z-index inside parent)
 * Returns { scene, camera, renderer, frame(fn), physical(props), gltf(url), texture(url), render(t, b) }.
 */
export async function layer(parent, o = {}) {
  const W = C.W, H = C.H;
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: o.bg == null, preserveDrawingBuffer: true, powerPreference: 'high-performance', stencil: false, depth: false });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  Object.assign(renderer.domElement.style, { position: 'absolute', left: 0, top: 0, width: W + 'px', height: H + 'px', zIndex: o.z ?? 0, pointerEvents: 'none' });
  parent.prepend(renderer.domElement);
  renderer.setClearColor(o.bg == null ? 0x000000 : new THREE.Color(o.bg), o.bg == null ? 0 : 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(o.fov ?? 35, W / H, 0.1, 200);
  camera.position.set(0, 0, 6);
  const pmrem = new THREE.PMREMGenerator(renderer);
  if (!o.env || o.env === 'room') scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  else { const hdr = await new RGBELoader().loadAsync('../' + o.env); scene.environment = pmrem.fromEquirectangular(hdr).texture; hdr.dispose(); }
  scene.environmentIntensity = o.envIntensity ?? 1;

  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: o.msaa ?? 4, alpha: o.bg == null });
  composer.addPass(new RenderPass(scene, camera));
  const fx = [];
  let dof = null;
  if (o.dof) { dof = new DepthOfFieldEffect(camera, { focusDistance: o.dof.focus ?? 0.02, focusRange: o.dof.range ?? 0.05, bokehScale: o.dof.bokeh ?? 2.5 }); fx.push(dof); }
  if (o.bloom) fx.push(new BloomEffect({ intensity: o.bloom, luminanceThreshold: o.bloomThreshold ?? 0.85, mipmapBlur: true }));
  if (o.vignette) fx.push(new VignetteEffect({ darkness: o.vignette }));
  fx.push(new ToneMappingEffect({ mode: { agx: ToneMappingMode.AGX, aces: ToneMappingMode.ACES_FILMIC, neutral: ToneMappingMode.NEUTRAL }[o.tone || 'neutral'] }));
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
