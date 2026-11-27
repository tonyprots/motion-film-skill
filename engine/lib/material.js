// Material transitions and printed objects for motion-film WebGL films: a frame of the film becomes a sheet of paper
// that tears, folds or slams. The sheet is a plate (render.mjs --plates renders it from timeline.json "plates"), drawn
// in its own canvas over the live DOM. When the sheet lies flat it is pixel-identical to the frame it was rendered from,
// so the hand-over at either end is invisible. Same contract as lib/gl.js: f(t) only, any frame order.
//
//   import { materialCut } from './lib/gl.js';
//   await materialCut(stage, { kind: 'tear', plate: C.plate('title-end'), at: 'rip', dur: 1.6 });
//
// Timing contract (shared with scripts/sfx_world.mjs, which places the material sound at the same fractions of dur):
//   tear  0–0.06 tension · 0.06–0.55 the rip runs top → bottom · 0.55 snap · 0.55–1 the halves fall away
//   fold  creases land at 0.15, 0.32, 0.48 · 0.48–1 the folded packet flies off
//   slab  0–0.285 falls flat · 0.285 impact · 0.285–0.6 settles · from 0.6 the plate is gone (the live scene is identical)
// Which frame goes on the plate:
//   tear, fold — the LAST frame of the outgoing shot: the outgoing scene ends at `at`, the incoming is live from `at`
//   slab — the FIRST frame of the incoming shot as it lands: plate at at + 0.6·dur; the outgoing scene runs until then
import * as THREE from 'three';

export const MATERIAL_TIMING = {
  tear: { tension: 0.06, snap: 0.55 },
  fold: { creases: [0.15, 0.32, 0.48] },
  slab: { impact: 0.285, settle: 0.6 },
};

const PRE = /* glsl */ `
float mh(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float mn(float x) { float i = floor(x), f = fract(x); return mix(mh(i), mh(i + 1.0), f * f * (3.0 - 2.0 * f)); }
// the tear line: u of the rip at height v, a slow wander plus paper-fibre jitter
float tearX(float v, float seed) { return 0.5 + 0.045 * (mn(v * 3.1 + seed) - 0.5) * 2.0 + 0.018 * (mn(v * 19.0 + seed * 3.0) - 0.5) + 0.006 * (mn(v * 97.0 + seed) - 0.5); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
`;

// ------------------------------------------------------------------ vertex shaders: position in px, sheet centred at 0
const VERT = {
  tear: /* glsl */ `
uniform float uP, uSide, uW, uH, uSeed, uShadow; varying vec2 vUv; varying vec3 vN; varying float vLift;
${PRE}
void main() {
  vUv = uv; vec3 p = vec3((uv.x - 0.5) * uW, (uv.y - 0.5) * uH, 0.0); vec3 n = vec3(0.0, 0.0, 1.0);
  float rip = clamp((uP - 0.06) / 0.49, 0.0, 1.0); rip = rip * rip * (3.0 - 2.0 * rip) * 0.7 + rip * 0.3;
  float front = 1.0 - rip * 1.02;                                            // v of the rip front (runs top → bottom)
  float tension = smoothstep(0.0, 0.06, uP) * (1.0 - smoothstep(0.06, 0.2, uP));
  float above = max(uv.y - front, 0.0);                                      // torn length above this point
  float near = 1.0 - smoothstep(0.0, 0.35, abs(uv.x - tearX(uv.y, uSeed)));  // near the tear the paper curls most
  vec2 piv = vec2((tearX(front, uSeed) - 0.5) * uW, (front - 0.5) * uH);
  // opening: the torn part swings away from the line around the rip front and its edge curls toward the lens
  float open = uSide * (0.22 * above + 0.05 * above * above);
  vec2 q = p.xy - piv; float ca = cos(-open), sa = sin(-open);
  p.xy = piv + vec2(ca * q.x - sa * q.y, sa * q.x + ca * q.y);
  float curl = above * above * near * 0.55 * uH * (0.6 + 0.4 * rip);
  p.z += curl; p.x += uSide * curl * 0.25;
  p.z += tension * near * 3.0 * sin(uv.y * 37.0 + uSeed);                    // the pull before the rip: a ripple, no gap yet
  vLift = clamp(curl / (0.1 * uH), 0.0, 1.0);
  // after the snap both halves fall away: gravity, a spin, a turn away from the lens
  float f = clamp((uP - 0.55) / 0.45, 0.0, 1.0), g = f * f;
  if (f > 0.0) {
    vec3 c = vec3(uSide * 0.25 * uW, -0.1 * uH, 0.0);
    p = rotY(uSide * 1.1 * g) * rotZ(-uSide * 0.55 * g) * (p - c) + c;
    n = rotY(uSide * 1.1 * g) * rotZ(-uSide * 0.55 * g) * n;
    p += vec3(uSide * 0.55 * uW * g, -1.15 * uH * g, 0.25 * uH * f);
    vLift = max(vLift, f);
  }
  // normal from the curl slope (finite difference along v)
  n = normalize(n + vec3(-uSide * near * above * 0.8, -above * near * 1.2, 0.0));
  vN = n;
  vec3 sp = p; if (uShadow > 0.5) { sp.xy += vec2(0.3, -0.5) * max(p.z, 0.0) * 0.6 + vec2(6.0, -10.0) * vLift; sp.z = 0.0; }
  gl_Position = projectionMatrix * viewMatrix * vec4(sp, 1.0);
}`,
  fold: /* glsl */ `
uniform float uP, uW, uH, uShadow; varying vec2 vUv; varying vec3 vN; varying float vLift; varying float vCrease;
${PRE}
float k(float a, float b) { float x = clamp((uP - a) / (b - a), 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
void main() {
  vUv = uv; vec3 p = vec3((uv.x - 0.5) * uW, (uv.y - 0.5) * uH, 0.0); vec3 n = vec3(0.0, 0.0, 1.0);
  float a1 = 3.1416 * k(0.02, 0.15), a2 = 3.1416 * k(0.17, 0.32), a3 = 3.1416 * k(0.34, 0.48);
  vCrease = 0.0;
  // 1: the right half over the left (axis x = 0), lifted a hair so it never fights the left half
  if (uv.x > 0.5) { float d = p.x; p.x = d * cos(a1); p.z = d * sin(a1) + 0.6 * sin(a1 * 0.5); n = rotY(-a1) * n; }
  vCrease += exp(-abs(uv.x - 0.5) * 120.0) * sin(a1 * 0.5);
  // 2: the top half down over the bottom (axis y = 0)
  if (uv.y > 0.5) { vec3 q = p; p.y = q.y * cos(a2) - q.z * sin(a2); p.z = q.y * sin(a2) + q.z * cos(a2) + 2.0 * sin(a2 * 0.5); n = rotX(a2) * n; }
  vCrease += exp(-abs(uv.y - 0.5) * 120.0) * sin(a2 * 0.5);
  // 3: the left quarter over (axis x = -W/4)
  float ax = -0.25 * uW;
  if (p.x < ax - 0.01) { vec3 q = p; float d = q.x - ax; p.x = ax + d * cos(a3) + q.z * sin(a3); p.z = -d * sin(a3) + q.z * cos(a3) + 4.4 * sin(a3 * 0.5); n = rotY(a3) * n; }
  // 4: the packet flies off, up and away, turning
  float f = k(0.48, 1.0), g = f * f;
  vec3 c = vec3(-0.125 * uW, -0.25 * uH, 0.0);
  p = rotZ(0.5 * g) * rotX(-0.6 * f) * (p - c) + c;
  n = rotZ(0.5 * g) * rotX(-0.6 * f) * n;
  p += vec3(0.75 * uW * g, 0.9 * uH * g, 0.5 * uH * f);
  vLift = clamp(max(max(sin(a1), sin(a2)), sin(a3)) * 0.5 + f, 0.0, 1.0);
  vN = n;
  vec3 sp = p; if (uShadow > 0.5) { sp.xy += vec2(0.3, -0.5) * max(p.z, 0.0) * 0.6 + vec2(5.0, -8.0) * vLift; sp.z = 0.0; }
  gl_Position = projectionMatrix * viewMatrix * vec4(sp, 1.0);
}`,
  slab: /* glsl */ `
uniform float uP, uW, uH, uShadow; varying vec2 vUv; varying vec3 vN; varying float vLift;
${PRE}
void main() {
  vUv = uv; vec3 p = vec3((uv.x - 0.5) * uW, (uv.y - 0.5) * uH, 0.0);
  // hinged on its bottom edge, the slab stands up toward the lens and falls onto the screen: gravity (t²) until the impact
  float fall = clamp(uP / 0.285, 0.0, 1.0), ang = 1.5708 * (1.0 - fall * fall);   // from edge-on (out of frame, no pop) to flat
  float s = clamp((uP - 0.285) / 0.315, 0.0, 1.0);
  ang += (uP > 0.285 ? 0.03 * max(sin(s * 3.1416 * 2.0), 0.0) * exp(-s * 4.0) : 0.0);   // a small bounce and settle
  vec3 hinge = vec3(0.0, -0.5 * uH, 0.0);
  p = rotX(ang) * (p - hinge) + hinge;
  float squash = uP > 0.285 ? 1.0 + 0.012 * sin(s * 3.1416 * 3.0) * exp(-s * 5.0) : 1.0;
  p.xy *= squash;
  vN = rotX(ang) * vec3(0.0, 0.0, 1.0); vLift = clamp(ang / 1.2, 0.0, 1.0);
  vec3 sp = p; if (uShadow > 0.5) { sp.xy += vec2(0.3, -0.5) * max(p.z, 0.0) * 0.7; sp.z = 0.0; }
  gl_Position = projectionMatrix * viewMatrix * vec4(sp, 1.0);
}`,
};

const FRAG = /* glsl */ `
uniform sampler2D uMap; uniform vec3 uPaper; uniform float uP, uSide, uShadow, uShadowA, uKind, uSeed; varying vec2 vUv; varying vec3 vN; varying float vLift;
#ifdef FOLD
varying float vCrease;
#endif
${PRE}
void main() {
  float edge = 0.0;
  if (uKind < 0.5) {   // tear: each half owns its side of the line; torn edges show the white core and loose fibres
    float rip = clamp((uP - 0.06) / 0.49, 0.0, 1.0); rip = rip * rip * (3.0 - 2.0 * rip) * 0.7 + rip * 0.3;
    float front = 1.0 - rip * 1.02, dx = (vUv.x - tearX(vUv.y, uSeed)) * uSide;   // > 0 inside this half
    bool torn = vUv.y > front || uP >= 0.55;
    if (!torn) { if (dx < 0.0) discard; }
    else {
      float fib = mh(floor(vUv.y * 1400.0) + uSide * 17.0);
      float hair = step(0.72, fib) * (0.0016 + 0.0026 * mh(floor(vUv.y * 1400.0) * 1.3));
      if (dx < -hair) discard;
      edge = 1.0 - smoothstep(0.0006, 0.0032 + 0.002 * mn(vUv.y * 300.0), dx);
    }
  }
  if (uShadow > 0.5) {
    float soft = smoothstep(0.0, 0.035, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
    // the shadow belongs to the frame as a surface: it fades once the paper leaves it (fly-off), and before a slab lands
    float gone = uKind < 0.5 ? smoothstep(0.55, 0.85, uP) : uKind < 1.5 ? smoothstep(0.48, 0.75, uP) : smoothstep(0.24, 0.3, uP);
    gl_FragColor = vec4(0.0, 0.0, 0.0, uShadowA * soft * (0.35 + 0.65 * vLift) * (1.0 - gone));
    return;
  }
  vec3 c = gl_FrontFacing ? texture2D(uMap, vUv).rgb : mix(uPaper, texture2D(uMap, vUv).rgb, 0.05);   // the back: the print shows through, mirrored by the geometry itself
  c = mix(c, uPaper * 1.02, edge);
  // shading: exactly 1 when the sheet faces the lens flat, so the hand-over is invisible
  vec3 n = normalize(gl_FrontFacing ? vN : -vN);
  float tilt = 1.0 - clamp(n.z, 0.0, 1.0);
  float lam = dot(n, normalize(vec3(-0.35, 0.55, 0.76))) / 0.76;
  float shade = mix(1.0, 0.7 + 0.33 * clamp(lam, 0.0, 1.1), clamp(tilt * 2.5, 0.0, 1.0));   // paper: soft, never dirty grey
#ifdef FOLD
  shade *= 1.0 - 0.18 * clamp(vCrease, 0.0, 1.0);
#endif
  gl_FragColor = vec4(c * shade, 1.0);
}`;

/**
 * materialCut(parent, { kind, plate, at, dur, z, paper, shadow, seed }) — the frame on `plate` tears, folds or slams.
 *   kind 'tear' | 'fold' | 'slab' (timing contract at the top of this file) · plate: a C.plate(name) path (sRGB PNG)
 *   at: seconds or a mark · dur 2.4 s (tear), 2.2 (fold), 1.6 (slab), the same defaults as the sound · z 50 (over every scene) · paper '#f4f2ee' (the
 *   back and the torn core: match the film's paper) · shadow 0.28 (opacity of the cast shadow on the scene below) · seed
 * Works with or without layer(): it is its own canvas. Pair it in timeline.json with a "material" sound cue at the
 * same `at` and `dur` (sync.mjs) and with a "plates" entry for the frame. Returns { canvas, at, dur, p(t) }.
 */
export async function materialCut(parent, o = {}) {
  const kind = o.kind || 'tear';
  if (!VERT[kind]) throw new Error(`materialCut: kind must be tear, fold or slab, not ${kind}`);
  const W = C.W, H = C.H;
  const at = typeof o.at === 'string' ? C.bt(o.at) : o.at ?? 0;
  const dur = o.dur ?? { tear: 2.4, fold: 2.2, slab: 1.6 }[kind];   // = MATERIAL in scripts/sfx_world.mjs: keep in step
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, depth: true, stencil: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.setClearColor(0x000000, 0);
  Object.assign(renderer.domElement.style, { position: 'absolute', left: 0, top: 0, width: W + 'px', height: H + 'px', zIndex: o.z ?? 50, pointerEvents: 'none', visibility: 'hidden' });
  parent.append(renderer.domElement);
  // a missing plate (first run with --no-plates, a typo in the name) must not hang the film: a loud magenta sheet instead
  const tex = await new THREE.TextureLoader().loadAsync('../' + o.plate).catch(() => {
    console.error(`materialCut: plate ${o.plate} is missing — add it to timeline.json "plates" and render with --plates`);
    const t = new THREE.DataTexture(new Uint8Array([255, 0, 255, 255]), 1, 1); t.needsUpdate = true; return t;
  });
  tex.colorSpace = THREE.NoColorSpace;   // bytes in, bytes out: no sRGB round trip, so the flat sheet matches the frame exactly
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const fov = 30, dist = H / 2 / Math.tan((fov * Math.PI) / 360);
  const camera = new THREE.PerspectiveCamera(fov, W / H, dist * 0.05, dist * 4);
  camera.position.set(0, 0, dist);
  const scene = new THREE.Scene();
  const geo = new THREE.PlaneGeometry(1, 1, kind === 'fold' ? 64 : 120, kind === 'fold' ? 36 : 90);
  const paper = new THREE.Color(o.paper ?? '#f4f2ee'); paper.convertLinearToSRGB();   // THREE.Color is linear; the shader works in sRGB bytes
  const mk = (side, shadow) => {
    const m = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex }, uPaper: { value: new THREE.Vector3(paper.r, paper.g, paper.b) }, uP: { value: 0 }, uSide: { value: side },
        uW: { value: W }, uH: { value: H }, uSeed: { value: o.seed ?? 3.7 }, uShadow: { value: shadow ? 1 : 0 }, uShadowA: { value: o.shadow ?? 0.28 },
        uKind: { value: { tear: 0, fold: 1, slab: 2 }[kind] } },
      // both transparent: three draws every opaque object before any transparent one, whatever renderOrder says, so an
      // opaque sheet would get its own shadow drawn over it (a flat sheet 10% darker than the frame)
      vertexShader: VERT[kind], fragmentShader: FRAG, side: THREE.DoubleSide, transparent: true, depthWrite: !shadow, depthTest: !shadow,
      defines: kind === 'fold' ? { FOLD: '' } : {},
    });
    m.toneMapped = false;
    // a folded packet is 8 layers and a torn half overlaps itself: each shadow pixel is darkened once (stencil), not 8×
    if (shadow) Object.assign(m, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
    const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.renderOrder = shadow ? 0 : 1;
    scene.add(mesh); return m;
  };
  const mats = [];
  for (const side of kind === 'tear' ? [-1, 1] : [1]) { mats.push(mk(side, true)); }
  for (const side of kind === 'tear' ? [-1, 1] : [1]) { mats.push(mk(side, false)); }
  const p = (t) => (t - at) / dur;
  C.hooks.after.push((t) => {
    const x = p(t), on = kind === 'slab' ? x >= 0 && x < 0.6 : x >= 0 && x < 1;
    renderer.domElement.style.visibility = on ? '' : 'hidden';
    if (!on) return;
    for (const m of mats) m.uniforms.uP.value = x;
    renderer.render(scene, camera);
  });
  return { canvas: renderer.domElement, at, dur, p };
}

/**
 * card(texture, { w, h, depth, paper, rough, lit }) — a printed card with thickness: the texture on the front, paper on
 * the back and the edges. For frames of the film as objects in a 3D world (a flight past them, a stack, a wall of shots).
 * w in scene units (h from the texture's aspect unless given). lit false (default): the front shows the frame in its own
 * colours whatever the sun does — a world lit for clouds blows a paper-white slide out to cream; lit true: a physical
 * print (rough). The edges and the back are always lit. Returns a THREE.Mesh; add it to L.scene.
 */
export function card(texture, o = {}) {
  const img = texture.image || {}, aspect = img.width && img.height ? img.height / img.width : 9 / 16;
  const w = o.w ?? 16, h = o.h ?? w * aspect, d = o.depth ?? w * 0.006;
  const paper = new THREE.MeshStandardMaterial({ color: o.paper ?? '#f4f2ee', roughness: 0.9 });
  const front = o.lit ? new THREE.MeshStandardMaterial({ map: texture, roughness: o.rough ?? 0.55 }) : new THREE.MeshBasicMaterial({ map: texture });
  if (!o.lit) front.toneMapped = false;
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [paper, paper, paper, paper, front, paper]);
}
