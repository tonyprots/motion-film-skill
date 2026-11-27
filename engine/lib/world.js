// World kit for motion-film WebGL layers: sky, sun, haze, volumetric clouds, sea, procedural full-frame passes.
// Everything is a function of t and of the parameters set for this frame: no accumulation, no temporal filters, no
// clock. Same contract as lib/gl.js (any frame, any order, any worker).
//
//   import { layer, world, sea, THREE } from './lib/gl.js';
//   const L = await layer(root, { tone: 'agx', fov: 40 });                // bg null: the world paints the whole frame
//   const W = await world(L, { sun: { elev: 14, az: 20 }, clouds: { bottom: 300, top: 900, cover: 0.5 } });
//   const S = sea(L, W, { waves: 'swell' });                              // optional
//   L.frame((t) => { W.set({ sun: { elev: C.lerp(14, 4, C.seg(t, 'dusk', 'night')) } }); L.camera.position.y = …; });
//
// Units are scene units; think of them as metres (world.metres converts for the sky's altitude). A good scale for a
// flight over a cloud deck: deck 300–900 units, camera 1 000–1 500 up, fog falloff ~1/800.
import * as THREE from 'three';
import { Effect, EffectPass, EffectAttribute, BlendFunction } from 'postprocessing';

// ---------------------------------------------------------------- GLSL prelude (shared by every pass and material)
export const GLSL = /* glsl */ `
#ifndef PI
#define PI 3.141592653589793
#endif
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 h22(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
float vnoise3(vec3 p) { vec3 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), u.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), u.x), u.y),
             mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), u.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), u.x), u.y), u.z); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; mat2 r = mat2(0.8, -0.6, 0.6, 0.8); for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = r * p * 2.03; a *= 0.5; } return s; }
float fbm3(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise3(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float ign(vec2 px) { return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715)))); }   // interleaved gradient noise
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 toLin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
vec3 softClip(vec3 c) { return 1.0 - exp(-c); }                                     // HDR → 0..1, keeps hue
// colour of a black body at k kelvin, normalised (candle 1900, sun 5800, sky 10000)
vec3 blackbody(float k) { float t = k / 100.0; vec3 c;
  c.r = t <= 66.0 ? 1.0 : clamp(1.292936 * pow(t - 60.0, -0.1332), 0.0, 1.0);
  c.g = t <= 66.0 ? clamp(0.3900816 * log(t) - 0.6318414, 0.0, 1.0) : clamp(1.1298909 * pow(t - 60.0, -0.0755), 0.0, 1.0);
  c.b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.5432068 * log(t - 10.0) - 1.1962541, 0.0, 1.0)); return toLin(c); }
float hg(float mu, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5)); }
vec2 dirToEqui(vec3 d) { return vec2(atan(d.z, d.x) * (0.5 / PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5); }
vec3 equiToDir(vec2 uv) { float phi = (uv.x - 0.5) * 2.0 * PI, th = (uv.y - 0.5) * PI; return vec3(cos(th) * cos(phi), sin(th), cos(th) * sin(phi)); }
`;

// Single-scattering atmosphere (Rayleigh + Mie), metres. Rendered into a small sky texture whenever the sun, haze or
// altitude change; everything else (sky pixels, fog colour, sea reflections, cloud ambient, env map) reads that texture.
const ATMO = /* glsl */ `
const float A_RE = 6371e3, A_RA = 6471e3, A_HR = 8e3, A_HM = 1.2e3;
const vec3 A_BR = vec3(5.5e-6, 13.0e-6, 22.4e-6);
float aRay(vec3 o, vec3 d, float r) { float b = dot(o, d), c = dot(o, o) - r * r, h = b * b - c; return h < 0.0 ? -1.0 : -b + sqrt(h); }
vec3 atmSky(vec3 d, float alt, vec3 s, float haze, float sunI, float g, out vec3 trans, out float hitGround) {
  vec3 o = vec3(0.0, A_RE + max(alt, 1.0), 0.0);
  float tMax = aRay(o, d, A_RA);
  float b = dot(o, d), hg2 = b * b - (dot(o, o) - A_RE * A_RE);
  hitGround = 0.0;
  if (hg2 > 0.0 && b < 0.0) { tMax = min(tMax, -b - sqrt(hg2)); hitGround = 1.0; }
  float odR = 0.0, odM = 0.0; vec3 sR = vec3(0.0), sM = vec3(0.0); float bM = 21e-6 * haze;
  // samples crowd near the eye (t ∝ u²): the dense, hazy first kilometres decide the horizon colour
  for (int i = 0; i < 32; i++) {
    float u0 = float(i) / 32.0, u1 = float(i + 1) / 32.0, um = (u0 + u1) * 0.5, ds = tMax * (u1 * u1 - u0 * u0);
    vec3 p = o + d * tMax * um * um; float hh = length(p) - A_RE;
    float hr = exp(-hh / A_HR) * ds, hm = exp(-hh / A_HM) * ds; odR += hr; odM += hm;
    float tl = aRay(p, s, A_RA), dl = tl / 8.0, lR = 0.0, lM = 0.0; bool lit = true;
    for (int j = 0; j < 8; j++) { vec3 q = p + s * dl * (float(j) + 0.5); float hq = length(q) - A_RE; if (hq < 0.0) { lit = false; break; }
      lR += exp(-hq / A_HR) * dl; lM += exp(-hq / A_HM) * dl; }
    if (!lit) continue;
    vec3 a = exp(-(A_BR * (odR - 0.5 * hr + lR) + bM * 1.1 * (odM - 0.5 * hm + lM)));   // transmittance to the segment's middle
    sR += a * hr; sM += a * hm;
  }
  trans = exp(-(A_BR * odR + bM * 1.1 * odM));
  float mu = dot(d, s), g2 = g * g;
  float pR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float pM = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));
  return sunI * (sR * A_BR * pR + sM * bM * pM);
}`;

// ---------------------------------------------------------------- CPU twin of the atmosphere (lights, ambient)
const RE = 6371e3, RA = 6471e3, HR = 8e3, HM = 1.2e3, BR = [5.5e-6, 13.0e-6, 22.4e-6];
function ray(o, d, r) { const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2], c = o[0] ** 2 + o[1] ** 2 + o[2] ** 2 - r * r, h = b * b - c; return h < 0 ? -1 : -b + Math.sqrt(h); }
function transmittance(alt, s, haze) {   // sunlight reaching altitude alt (m) from direction s, RGB 0..1
  const o = [0, RE + Math.max(alt, 1), 0];
  const b = o[1] * s[1], hgr = b * b - (o[1] ** 2 - RE * RE);
  if (hgr > 0 && b < 0) return [0, 0, 0];             // the planet is in the way: night
  const tl = ray(o, s, RA), n = 24, dl = tl / n; let r = 0, m = 0;
  for (let j = 0; j < n; j++) { const q = [s[0] * dl * (j + 0.5), o[1] + s[1] * dl * (j + 0.5), s[2] * dl * (j + 0.5)];
    const hq = Math.hypot(q[0], q[1], q[2]) - RE; r += Math.exp(-hq / HR) * dl; m += Math.exp(-hq / HM) * dl; }
  return BR.map((br) => Math.exp(-(br * r + 21e-6 * haze * 1.1 * m)));
}

// ---------------------------------------------------------------- tileable 3D noise for clouds (seeded, built once)
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function cloudNoise(N = 64, seed = 7) {   // exported for tests
  const rnd = mulberry(seed);
  const worley = (cells) => {
    const pts = new Float32Array(cells ** 3 * 3);
    for (let i = 0; i < pts.length; i++) pts[i] = rnd();
    return (x, y, z) => {   // x,y,z in [0,1): inverted distance to the nearest feature point, wrapped
      const X = x * cells, Y = y * cells, Z = z * cells, cx = Math.floor(X), cy = Math.floor(Y), cz = Math.floor(Z); let d2 = 9;
      for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const ix = cx + i, iy = cy + j, iz = cz + k;
        const wx = ((ix % cells) + cells) % cells, wy = ((iy % cells) + cells) % cells, wz = ((iz % cells) + cells) % cells;
        const p = (wx + cells * (wy + cells * wz)) * 3;
        const dx = ix + pts[p] - X, dy = iy + pts[p + 1] - Y, dz = iz + pts[p + 2] - Z, q = dx * dx + dy * dy + dz * dz;
        if (q < d2) d2 = q;
      }
      return 1 - Math.min(1, Math.sqrt(d2));
    };
  };
  const perlin = (P) => {
    const g = new Float32Array(P ** 3 * 3);
    for (let i = 0; i < P ** 3; i++) { let a = rnd() * 2 - 1, b = rnd() * 2 - 1, c = rnd() * 2 - 1; const l = Math.hypot(a, b, c) || 1; g[i * 3] = a / l; g[i * 3 + 1] = b / l; g[i * 3 + 2] = c / l; }
    const f = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    return (x, y, z) => {
      const X = x * P, Y = y * P, Z = z * P, x0 = Math.floor(X), y0 = Math.floor(Y), z0 = Math.floor(Z), fx = X - x0, fy = Y - y0, fz = Z - z0;
      const dot = (i, j, k) => { const p = (((x0 + i) % P) + P * (((y0 + j) % P) + P * ((z0 + k) % P))) * 3; return g[p] * (fx - i) + g[p + 1] * (fy - j) + g[p + 2] * (fz - k); };
      const u = f(fx), v = f(fy), w = f(fz), l = (a, b, t) => a + (b - a) * t;
      return l(l(l(dot(0, 0, 0), dot(1, 0, 0), u), l(dot(0, 1, 0), dot(1, 1, 0), u), v), l(l(dot(0, 0, 1), dot(1, 0, 1), u), l(dot(0, 1, 1), dot(1, 1, 1), u), v), w);
    };
  };
  const p4 = perlin(4), p8 = perlin(8), p16 = perlin(16);
  const w4 = worley(4), w8 = worley(8), w16 = worley(16), w6 = worley(6), w12 = worley(12), w24 = worley(24);
  const raw = new Float32Array(N ** 3 * 4);
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, w = z / N;
    const pf = 0.55 * p4(u, v, w) + 0.3 * p8(u, v, w) + 0.15 * p16(u, v, w);
    const wf = 0.625 * w4(u, v, w) + 0.25 * w8(u, v, w) + 0.125 * w16(u, v, w);
    const i = (x + N * (y + N * z)) * 4;
    raw[i] = 0.55 * pf + 0.6 * wf;   // Perlin-Worley: billows from Worley, spread from Perlin
    raw[i + 1] = w6(u, v, w); raw[i + 2] = w12(u, v, w); raw[i + 3] = w24(u, v, w);
  }
  // stretch every channel to its own 1st–99th percentile: a cover of 0.4 then means about 40 % of the deck
  const data = new Uint8Array(raw.length);
  for (let ch = 0; ch < 4; ch++) {
    const vals = []; for (let i = ch; i < raw.length; i += 4 * 7) vals.push(raw[i]);
    vals.sort((a, b) => a - b);
    const lo = vals[Math.floor(vals.length * 0.01)], hi = vals[Math.floor(vals.length * 0.99)];
    for (let i = ch; i < raw.length; i += 4) data[i] = Math.round(255 * Math.min(1, Math.max(0, (raw[i] - lo) / (hi - lo))));
  }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1; tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------- the world effect (sky + fog + clouds over the scene)
const WORLD_FRAG = /* glsl */ `
uniform mat4 uCamWorld, uProjInv; uniform vec3 uCamPos, uSun, uSunCol, uAmbTop, uAmbBot;
uniform sampler2D uSkyLut; uniform float uSunDisk, uStars, uGlare;
uniform float uFogDen, uFogFall, uFogY, uFogSun;
uniform float uClouds, uY0, uY1, uR, uCov, uDen, uFreq, uDetail, uDetailAmt, uMaxD, uSteps, uCloudGain, uShape;
uniform vec3 uWindOff; uniform highp sampler3D uNoise; uniform float uGroundY, uGroundTex;
${GLSL}
vec3 sky(vec3 d) { return texture2D(uSkyLut, dirToEqui(d)).rgb; }
float fogAmt(vec3 ro, vec3 rd, float dist) {
  float a = uFogDen * exp(-uFogFall * (ro.y - uFogY)), k = uFogFall * rd.y;
  float f = abs(k) > 1e-6 ? (1.0 - exp(-k * dist)) / k : dist;
  return 1.0 - exp(-a * max(f, 0.0));
}
vec3 fogCol(vec3 rd) {   // the horizon in this direction plus forward scatter around the sun
  vec3 h = sky(normalize(vec3(rd.x, max(rd.y, 0.0) * 0.35 + 0.02, rd.z)));
  return h + uSunCol * uFogSun * pow(max(dot(rd, uSun), 0.0), 8.0);
}
float stars(vec3 d) {
  vec3 a = abs(d); vec2 uv; float f; // cube-face cells keep stars round and evenly spread
  if (a.x >= a.y && a.x >= a.z) { uv = d.zy / a.x; f = sign(d.x); } else if (a.y >= a.z) { uv = d.xz / a.y; f = 2.0 + sign(d.y); } else { uv = d.xy / a.z; f = 4.0 + sign(d.z); }
  vec2 c = uv * 180.0, i = floor(c), fr = fract(c) - 0.5; float s = 0.0;
  float h = h21(i + f * 37.0); if (h > 0.965) { vec2 o = h22(i + f * 11.0) - 0.5; float r = length(fr - o * 0.7);
    float m = pow(h21(i * 1.7 + f), 6.0); s = smoothstep(0.09 + 0.08 * m, 0.0, r) * (0.25 + 2.5 * m); }
  return s;
}
vec2 shell(vec3 ro, vec3 rd, float r) {   // entry/exit of a sphere of radius r centred below the scene (planet curvature)
  vec3 oc = ro - vec3(0.0, -uR, 0.0); float b = dot(oc, rd), c = dot(oc, oc) - r * r, h = b * b - c;
  if (h < 0.0) return vec2(-1.0); h = sqrt(h); return vec2(-b - h, -b + h);
}
float hfrac(vec3 p) { return (length(p - vec3(0.0, -uR, 0.0)) - uR - uY0) / (uY1 - uY0); }
float cloudDen(vec3 p, bool cheap) {
  float h = hfrac(p); if (h <= 0.0 || h >= 1.0) return 0.0;
  vec3 q = (p + uWindOff) * uFreq;
  float wx = texture(uNoise, vec3(q.xz * 0.13, 0.31)).r;                      // weather: where the clouds gather
  float cov = clamp(uCov + (wx - 0.55) * 1.1, 0.0, 1.0);
  float top = mix(0.45, 1.0, cov);                                             // bigger cover, taller towers
  float prof = smoothstep(0.0, 0.08 + 0.1 * uShape, h) * smoothstep(top, top * mix(0.35, 0.75, uShape), h);
  vec4 n = texture(uNoise, q);
  float wf = n.g * 0.625 + n.b * 0.25 + n.a * 0.125;
  float base = clamp(n.r * 0.8 + wf * 0.2, 0.0, 1.0);                          // perlin-worley, sharpened by worley fbm
  float d = clamp((base * prof - (1.0 - cov)) / max(cov, 1e-3), 0.0, 1.0);
  if (!cheap && d > 0.0) {
    vec4 dn = texture(uNoise, q * uDetail + vec3(0.0, h * 0.4, 0.0) + uWindOff * uFreq * 0.5);
    float det = dn.g * 0.625 + dn.b * 0.25 + dn.a * 0.125;
    det = mix(det, 1.0 - det, clamp(h * 4.0, 0.0, 1.0));                        // wisps at the base, billows at the top
    d = clamp((d - det * uDetailAmt) / max(1.0 - det * uDetailAmt, 1e-3), 0.0, 1.0);
  }
  return d * uDen;
}
vec4 clouds(vec3 ro, vec3 rd, float sceneD, vec2 px, out float tAvg) {
  tAvg = 0.0;
  float r0 = uR + uY0, r1 = uR + uY1, cr = length(ro - vec3(0.0, -uR, 0.0));
  vec2 a = shell(ro, rd, r0), b = shell(ro, rd, r1); float t0, t1;
  if (cr < r0) { t0 = a.y; t1 = b.y; }
  else if (cr > r1) { if (b.x < 0.0) return vec4(0.0, 0.0, 0.0, 1.0); t0 = b.x; t1 = a.x > 0.0 ? a.x : b.y; }
  else { t0 = 0.0; t1 = a.x > 0.0 ? a.x : b.y; }
  t1 = min(t1, min(sceneD, uMaxD)); t0 = max(t0, 0.0);
  if (t1 <= t0) return vec4(0.0, 0.0, 0.0, 1.0);
  int N = int(uSteps); float seg = min(t1 - t0, (uY1 - uY0) * 6.0), ds = seg / uSteps;
  float mu = dot(rd, uSun), T = 1.0, wsum = 0.0; vec3 L = vec3(0.0);
  float sigma = 1.0 / ((uY1 - uY0) * 0.025);                                    // extinction for density 1
  float lstep = (uY1 - uY0) * 0.05, jit = ign(px);
  for (int i = 0; i < 160; i++) {
    if (i >= N) break;
    float t = t0 + ds * (float(i) + jit); if (t > t1) break;
    vec3 p = ro + rd * t; float d = cloudDen(p, false);
    if (d > 0.002) {
      float od = 0.0, acc = 0.0;
      for (int j = 0; j < 6; j++) { float sl = lstep * (1.0 + float(j) * 0.9); acc += sl; od += cloudDen(p + uSun * (acc - sl * 0.5), j > 1) * sl; }
      float h = clamp(hfrac(p), 0.0, 1.0);
      vec3 S = vec3(0.0); float aa = 1.0, bb = 1.0, cc = 1.0;
      for (int k = 0; k < 4; k++) { S += aa * exp(-od * sigma * bb) * mix(hg(mu, 0.75 * cc), hg(mu, -0.25 * cc), 0.35); aa *= 0.55; bb *= 0.35; cc *= 0.6; }
      float powder = 1.0 - 0.6 * exp(-d * sigma * lstep * 2.0);
      vec3 src = uSunCol * S * 4.0 * PI * powder * uCloudGain + mix(uAmbBot * 0.6, uAmbTop, h) * (0.35 + 0.4 * h);
      float Ts = exp(-d * sigma * ds);
      L += T * src * (1.0 - Ts); tAvg += t * T * (1.0 - Ts); wsum += T * (1.0 - Ts);
      T *= Ts; if (T < 0.01) break;
    }
  }
  tAvg = wsum > 0.0 ? tAvg / wsum : t0;
  return vec4(L, T);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec4 vp = uProjInv * vec4(uv * 2.0 - 1.0, 1.0, 1.0); vec3 vd = normalize(vp.xyz / vp.w);
  vec3 rd = normalize(mat3(uCamWorld) * vd), ro = uCamPos;
  bool isSky = depth >= 0.999999;
  float dist = isSky ? 1e12 : getViewZ(depth) / vd.z;
  float mu = dot(rd, uSun);
  vec3 bg = sky(rd);
  if (rd.y < 0.0 && uGroundTex > 0.0) {   // fields and water far below, with parallax: the sky texture alone sits at infinity
    float dg = (ro.y - uGroundY) / -rd.y; vec2 gp = (ro + rd * dg).xz;
    float n = fbm(gp / 2200.0) * 0.7 + fbm(gp / 380.0) * 0.3;
    bg *= mix(1.0, 0.72 + 0.6 * n, uGroundTex * exp(-dg / 40000.0) * smoothstep(0.0, 0.06, -rd.y));
  }
  if (rd.y > 0.0) bg += uSunCol * uSunDisk * smoothstep(0.99996, 0.99999, mu) * 80.0 + vec3(stars(rd)) * uStars * smoothstep(0.0, 0.15, rd.y);
  vec3 col = inputColor.rgb + (1.0 - clamp(inputColor.a, 0.0, 1.0)) * bg;      // premultiplied scene over the sky
  if (!isSky) col = mix(col, fogCol(rd), fogAmt(ro, rd, dist));
  if (uClouds > 0.5) {
    float tc; vec4 cl = clouds(ro, rd, dist, gl_FragCoord.xy, tc);
    float f = fogAmt(ro, rd, tc);
    col = col * cl.a + cl.rgb * (1.0 - f) + fogCol(rd) * (1.0 - cl.a) * f;
  }
  col += uSunCol * uGlare * (0.02 * pow(max(mu, 0.0), 24.0) + 0.06 * pow(max(mu, 0.0), 300.0));
  outputColor = vec4(col, 1.0);
}`;

class WorldEffect extends Effect {
  constructor(U) {
    super('World', WORLD_FRAG, { attributes: EffectAttribute.DEPTH, blendFunction: BlendFunction.SRC, uniforms: new Map(Object.entries(U)) });
  }
}

const LUT_FRAG = /* glsl */ `
uniform vec3 uSun, uGround, uSunT; uniform float uAlt, uHaze, uSunI, uG, uExposure, uHasGround; varying vec2 vUv;
${GLSL}
${ATMO}
void main() {
  vec3 d = equiToDir(vUv), tr; float hit;
  if (uHasGround < 0.5) d.y = max(d.y, 0.0);                                  // no ground: the horizon haze goes on forever
  vec3 c = atmSky(d, uAlt, uSun, uHaze, uSunI, uG, tr, hit);
  // the ground far below: Lambert under the sun that reaches it plus a sky share, seen through the air in between
  if (hit > 0.5) c += tr * uGround / PI * uSunI * (uSunT * max(uSun.y, 0.0) + 0.12 * (0.25 + max(uSun.y, 0.0)));
  gl_FragColor = vec4(c * uExposure, 1.0); }`;

const PRESETS = {
  day:      { sun: { elev: 38, az: 30 }, haze: 1.6, clouds: { cover: 0.42 }, fog: { density: 0.00025 } },
  bright:   { sun: { elev: 55, az: 10 }, haze: 2.4, clouds: { cover: 0.35 }, fog: { density: 0.0004 } },  // high key, milky light
  golden:   { sun: { elev: 7, az: 15 }, haze: 1.8, clouds: { cover: 0.5 }, fog: { density: 0.0003 } },
  dawn:     { sun: { elev: 1.5, az: 0 }, haze: 1.4, clouds: { cover: 0.45 }, fog: { density: 0.00035 } },
  overcast: { sun: { elev: 30, az: 20 }, haze: 4, clouds: { cover: 0.85, density: 1.2 }, fog: { density: 0.0007 } },
  night:    { sun: { elev: -14, az: 0 }, haze: 1, clouds: { cover: 0.3 }, fog: { density: 0.0002 }, stars: 1 },
};

const deg = Math.PI / 180;
const sunDir = (s) => { const e = s.elev * deg, a = s.az * deg; return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)); };

/**
 * world(L, opts) — sky, sun light, haze and clouds for a layer from lib/gl.js (create the layer with bg null).
 * The world is drawn after the scene and before the layer's DOF, glow, bloom and tone mapping; scene objects are lit by
 * a sun DirectionalLight and a sky HemisphereLight matched to the sky, and reflect an environment map made from it.
 *   preset 'day' | 'bright' | 'golden' | 'dawn' | 'overcast' | 'night' — a starting point, any field below overrides
 *   sun { elev 38, az 30 } degrees; az 0 = straight ahead of a camera looking down −z, 90 = to its right
 *   haze 1.6 (1 clear deep blue … 4 milky white: a light, high-key sky is 2–3)   exposure 1   sunDisk 1   glare 1
 *   fog { density 0.00025 per unit at height base, falloff 1/700 per unit up, base 0, sun 0.6 (glow toward the sun) }
 *   clouds false | { bottom 300, top 900, cover 0.42 (0..1), density 1, scale 2600 (units per noise tile),
 *     detail 7, erode 0.35, shape 0.5 (0 flat stratus … 1 tall cumulus), wind [6, 2] units/s, curvature 40000
 *     (planet radius in units: the deck bends down to the horizon), far 30000, steps 72, gain 1 }
 *   ground '#4f5c60' — the land or sea far below, seen through gaps in the deck and hazed by the air between; null = the
 *     horizon haze goes on below the horizon (a studio-like endless floor of light)
 *   stars 'auto' (appear as the sun sets) | 0..1   metres 1 (units → metres, for the sky's altitude)   altitude 0
 *   lights true (W.sunLight, W.hemi added to L.scene) · sunIntensity 3 · ambient 1 · env true · far 40000 · near 0.5
 * Returns W: set(partial opts) for this frame (call it inside L.frame), sunDir (Vector3), sunLight, hemi, uniforms,
 * skyAt(dir) → THREE.Color (CPU sky colour, e.g. to tint DOM text over the sky).
 */
export async function world(L, opts = {}) {
  const { renderer, scene, camera, composer } = L;
  const base = PRESETS[opts.preset || 'day'] || PRESETS.day;
  const P = {
    sun: { ...base.sun }, haze: base.haze, exposure: 1, ground: '#4f5c60', sunDisk: 1, glare: 1, stars: base.stars ?? 'auto', metres: 1, altitude: 0,
    fog: { density: 0.00025, falloff: 1 / 700, base: 0, sun: 0.6, ...base.fog },
    clouds: { bottom: 300, top: 900, cover: 0.42, density: 1, scale: 2600, detail: 7, erode: 0.35, shape: 0.5, wind: [6, 2], curvature: 40000, far: 30000, steps: 72, gain: 1, ...base.clouds },
    sunIntensity: 3, ambient: 1,
  };
  const merge = (o) => {
    for (const [k, v] of Object.entries(o || {})) {
      if (k === 'clouds' && v === false) P.clouds = { ...P.clouds, off: true };
      else if (v && typeof v === 'object' && !Array.isArray(v) && P[k] && typeof P[k] === 'object') Object.assign(P[k], v, k === 'clouds' ? { off: false } : {});
      else P[k] = v;
    }
  };
  merge(opts);
  camera.far = opts.far ?? 40000; camera.near = opts.near ?? Math.max(camera.near, 0.5); camera.updateProjectionMatrix();

  const U = {
    uCamWorld: new THREE.Uniform(new THREE.Matrix4()), uProjInv: new THREE.Uniform(new THREE.Matrix4()), uCamPos: new THREE.Uniform(new THREE.Vector3()),
    uSun: new THREE.Uniform(new THREE.Vector3(0, 1, 0)), uSunCol: new THREE.Uniform(new THREE.Vector3(1, 1, 1)),
    uAmbTop: new THREE.Uniform(new THREE.Vector3()), uAmbBot: new THREE.Uniform(new THREE.Vector3()),
    uSkyLut: new THREE.Uniform(null), uSunDisk: new THREE.Uniform(1), uStars: new THREE.Uniform(0), uGlare: new THREE.Uniform(1),
    uFogDen: new THREE.Uniform(0), uFogFall: new THREE.Uniform(0), uFogY: new THREE.Uniform(0), uFogSun: new THREE.Uniform(0.6),
    uClouds: new THREE.Uniform(1), uY0: new THREE.Uniform(300), uY1: new THREE.Uniform(900), uR: new THREE.Uniform(40000),
    uCov: new THREE.Uniform(0.4), uDen: new THREE.Uniform(1), uFreq: new THREE.Uniform(1 / 2600), uDetail: new THREE.Uniform(7),
    uDetailAmt: new THREE.Uniform(0.35), uMaxD: new THREE.Uniform(30000), uSteps: new THREE.Uniform(72), uCloudGain: new THREE.Uniform(1),
    uShape: new THREE.Uniform(0.5), uWindOff: new THREE.Uniform(new THREE.Vector3()), uNoise: new THREE.Uniform(cloudNoise(64, opts.seed ?? 7)),
    uTime: new THREE.Uniform(0), uGroundY: new THREE.Uniform(0), uGroundTex: new THREE.Uniform(1),
  };

  // sky texture: equirect, rendered on change
  const lut = new THREE.WebGLRenderTarget(512, 256, { type: THREE.HalfFloatType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, generateMipmaps: false });
  lut.texture.wrapS = THREE.RepeatWrapping; lut.texture.wrapT = THREE.ClampToEdgeWrapping;
  lut.texture.mapping = THREE.EquirectangularReflectionMapping;
  U.uSkyLut.value = lut.texture;
  const lutMat = new THREE.ShaderMaterial({
    uniforms: { uSun: U.uSun, uAlt: { value: 0 }, uHaze: { value: 1 }, uSunI: { value: 22 }, uG: { value: 0.76 }, uExposure: { value: 1 },
      uGround: { value: new THREE.Color() }, uSunT: { value: new THREE.Vector3() }, uHasGround: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: LUT_FRAG,
    depthTest: false, depthWrite: false,
  });
  const lutScene = new THREE.Scene(), lutCam = new THREE.Camera();
  lutScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), lutMat));
  // a 32×16 copy read back on change: the sky's own light for the hemisphere light and the clouds' ambient
  const small = new THREE.WebGLRenderTarget(32, 16, { type: THREE.HalfFloatType, depthBuffer: false });
  const px = new Uint16Array(32 * 16 * 4), amb = { up: [0, 0, 0], side: [0, 0, 0] };
  function readAmbient() {
    renderer.readRenderTargetPixels(small, 0, 0, 32, 16, px);
    const up = [0, 0, 0], side = [0, 0, 0]; let wu = 0, ws = 0;
    for (let y = 0; y < 16; y++) {
      const el = ((y + 0.5) / 16 - 0.5) * Math.PI, cy = Math.cos(el), sy = Math.sin(el);
      for (let x = 0; x < 32; x++) {
        const i = (y * 32 + x) * 4, c = [0, 1, 2].map((k) => THREE.DataUtils.fromHalfFloat(px[i + k]));
        if (sy > 0) { const w = sy * cy; for (let k = 0; k < 3; k++) up[k] += c[k] * w; wu += w; }    // irradiance on an upward face
        if (Math.abs(sy) < 0.35) { for (let k = 0; k < 3; k++) side[k] += c[k] * cy; ws += cy; }      // the horizon ring
      }
    }
    amb.up = up.map((v) => v / Math.max(wu, 1e-6)); amb.side = side.map((v) => v / Math.max(ws, 1e-6));
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null, lastKey = '';

  const sunLight = new THREE.DirectionalLight(0xffffff, 3), hemi = new THREE.HemisphereLight(0xbfd4ff, 0x8090a0, 1);
  if (opts.lights !== false) { scene.add(sunLight, sunLight.target, hemi); }

  const effect = new WorldEffect(U);
  const pass = new EffectPass(camera, effect);
  composer.addPass(pass, 1);   // right after the scene: DOF, glow, bloom and tone mapping see the finished world

  const SKY_K = 3.2;   // sky radiance → layer units: a noon horizon of ~0.9 before tone mapping
  const W = {
    uniforms: U, sunLight, hemi, params: P, sunDir: new THREE.Vector3(0, 1, 0), lut: lut.texture,
    set(o) { merge(o); },
    skyAt(dir) {   // CPU estimate: horizon/zenith blend from the lights (cheap; for DOM tinting, not for pixels)
      const y = Math.max(0, dir.y), c = new THREE.Color().setRGB(...U.uAmbBot.value.toArray()).lerp(new THREE.Color().setRGB(...U.uAmbTop.value.toArray()), y);
      return c;
    },
  };

  L.late((t) => {
    const s = sunDir(P.sun); W.sunDir.copy(s); U.uSun.value.copy(s);
    camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    U.uCamWorld.value.copy(camera.matrixWorld); U.uProjInv.value.copy(camera.projectionMatrixInverse);
    camera.getWorldPosition(U.uCamPos.value);
    const alt = P.altitude + Math.max(0, U.uCamPos.value.y) * P.metres;
    const tr = transmittance(alt, [s.x, s.y, s.z], P.haze);
    const sunK = P.sunIntensity * P.exposure;
    U.uSunCol.value.set(tr[0] * sunK, tr[1] * sunK, tr[2] * sunK);
    // sky lut + env when anything that shapes the sky changed (a pure function of these values: order-independent)
    const key = [s.x, s.y, s.z, alt, P.haze, P.exposure].map((v) => v.toFixed(6)).join(',') + String(P.ground);
    if (key !== lastKey) {
      lastKey = key;
      const lu = lutMat.uniforms;
      lu.uAlt.value = alt; lu.uHaze.value = P.haze; lu.uExposure.value = SKY_K * P.exposure;
      lu.uHasGround.value = P.ground == null ? 0 : 1; if (P.ground != null) lu.uGround.value.set(P.ground);
      lu.uSunT.value.set(...transmittance(0, [s.x, s.y, s.z], P.haze));
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(lut); renderer.render(lutScene, lutCam);
      renderer.setRenderTarget(small); renderer.render(lutScene, lutCam); renderer.setRenderTarget(prev);
      readAmbient();
      if (opts.env !== false) { envRT = pmrem.fromEquirectangular(lut.texture, envRT || undefined); scene.environment = envRT.texture; }
    }
    // ambient from the sky itself: up = what lights a face turned to the sky; bottom = bounce from the ground or the deck
    const A = P.ambient, sunE = Math.max(0, s.y);
    U.uAmbTop.value.set(amb.up[0] * A, amb.up[1] * A, amb.up[2] * A);
    const bounce = 0.35;   // albedo of what lies below (sea, a cloud deck lit from above)
    U.uAmbBot.value.set(...[0, 1, 2].map((k) => (amb.side[k] * 0.5 + bounce * (tr[k] * sunK * sunE / Math.PI + amb.up[k] * 0.5)) * A));
    sunLight.position.copy(U.uCamPos.value).addScaledVector(s, 1000); sunLight.target.position.copy(U.uCamPos.value);
    sunLight.color.setRGB(tr[0], tr[1], tr[2]); sunLight.intensity = sunK;
    // three's hemisphere light: radiance-like colours; ×π makes a white face under a uniform sky L come out at L
    hemi.color.setRGB(...U.uAmbTop.value.toArray().map((v) => v)); hemi.groundColor.setRGB(...U.uAmbBot.value.toArray().map((v) => v));
    hemi.intensity = opts.env === false ? Math.PI : 0;   // with the env map the sky already lights diffuse faces: never both
    U.uSunDisk.value = P.sunDisk; U.uGlare.value = P.glare; U.uGroundTex.value = P.ground == null ? 0 : 1;
    U.uStars.value = P.stars === 'auto' ? THREE.MathUtils.smoothstep(-s.y, 0.02, 0.2) : P.stars;
    U.uFogDen.value = P.fog.density; U.uFogFall.value = P.fog.falloff; U.uFogY.value = P.fog.base; U.uFogSun.value = P.fog.sun;
    const c = P.clouds;
    U.uClouds.value = c.off ? 0 : 1; U.uY0.value = c.bottom; U.uY1.value = c.top; U.uR.value = c.curvature; U.uCov.value = c.cover;
    U.uDen.value = c.density; U.uFreq.value = 1 / c.scale; U.uDetail.value = c.detail; U.uDetailAmt.value = c.erode; U.uShape.value = c.shape;
    U.uMaxD.value = c.far; U.uSteps.value = Math.min(160, c.steps); U.uCloudGain.value = c.gain;
    U.uWindOff.value.set(-c.wind[0] * t, 0, -c.wind[1] * t);   // f(t): the deck drifts, never accumulates
    U.uTime.value = t;
  });
  return W;
}

// ---------------------------------------------------------------- sea
const WAVES = {
  calm:   [[1, 0.2, 60, 0.12], [0.7, -0.6, 31, 0.08], [-0.3, 1, 17, 0.05], [0.9, 0.5, 9, 0.03]],
  swell:  [[1, 0.15, 120, 0.5], [0.8, -0.5, 61, 0.3], [0.2, 1, 33, 0.16], [-0.7, 0.6, 19, 0.09], [0.95, 0.4, 11, 0.05], [0.3, -0.9, 7, 0.03]],
  choppy: [[1, 0.3, 70, 0.6], [0.6, -0.8, 37, 0.45], [-0.2, 1, 21, 0.3], [0.9, 0.6, 12, 0.16], [-0.8, -0.3, 8, 0.1], [0.4, 0.9, 5, 0.06]],
};
const SEA_VERT = /* glsl */ `
uniform float uTime, uScale, uFade; uniform vec4 uW[6]; uniform vec3 uCam; varying vec3 vWorld; varying vec2 vXZ; varying float vCrest;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0); vec2 xz = wp.xz; vec3 d = vec3(0.0); float crest = 0.0;
  float fade = 1.0 - smoothstep(uFade * 0.3, uFade, distance(xz, uCam.xz));
  for (int i = 0; i < 6; i++) { vec4 w = uW[i]; if (w.z <= 0.0) continue; vec2 D = normalize(w.xy); float k = 6.2831853 / (w.z * uScale);
    float c = sqrt(9.81 * k), f = k * dot(D, xz) - c * uTime, A = w.w * uScale; float Q = 0.6 / (k * A * 6.0 + 1e-4);
    d.xz += Q * A * D * cos(f) * fade; d.y += A * sin(f) * fade; crest += sin(f) * w.w; }
  wp.xyz += d; vWorld = wp.xyz; vXZ = xz; vCrest = crest;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const SEA_FRAG = /* glsl */ `
uniform float uTime, uScale, uRough, uExposure; uniform vec4 uW[6]; uniform vec3 uSun, uSunCol, uDeep, uShallow, uAmbTop;
uniform sampler2D uSkyLut; varying vec3 vWorld; varying vec2 vXZ; varying float vCrest;
${GLSL}
vec3 sky(vec3 d) { return texture2D(uSkyLut, dirToEqui(d)).rgb; }
void main() {
  vec3 n = vec3(0.0, 1.0, 0.0); float dist = distance(cameraPosition, vWorld);
  for (int i = 0; i < 6; i++) { vec4 w = uW[i]; if (w.z <= 0.0) continue; vec2 D = normalize(w.xy); float k = 6.2831853 / (w.z * uScale);
    float c = sqrt(9.81 * k), f = k * dot(D, vXZ) - c * uTime, A = w.w * uScale;
    float keep = 1.0 - smoothstep(w.z * uScale * 25.0, w.z * uScale * 120.0, dist);   // a wave smaller than a pixel stops tilting the normal
    n.xz -= D * k * A * cos(f) * keep; }
  // fine ripples: two scrolling noise octaves, faded with distance so the far sea stays calm instead of shimmering
  float rf = 1.0 - smoothstep(40.0 * uScale, 600.0 * uScale, dist);
  vec2 q = vXZ / (3.0 * uScale); float e = 0.08;
  float h0 = fbm(q + uTime * 0.12), hx = fbm(q + vec2(e, 0.0) + uTime * 0.12), hz = fbm(q + vec2(0.0, e) + uTime * 0.12);
  n.xz -= vec2(hx - h0, hz - h0) / e * 0.12 * rf;
  n = normalize(n);
  vec3 V = normalize(cameraPosition - vWorld), R = reflect(-V, n); R.y = abs(R.y);
  float F = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 refl = sky(R);
  float rough = uRough + 0.12 * smoothstep(100.0 * uScale, 3000.0 * uScale, dist);
  float sh = 2.0 / (rough * rough) - 2.0, spec = pow(max(dot(R, uSun), 0.0), sh) * (sh + 2.0) / 8.0;
  float lit = max(uSun.y, 0.0);
  vec3 body = mix(uDeep, uShallow, clamp(vCrest * 0.6 + 0.3, 0.0, 1.0)) * (uSunCol * lit * 0.12 + uAmbTop * 0.5);
  float sss = pow(max(dot(-V, uSun) * 0.5 + 0.5, 0.0), 6.0) * clamp(vCrest, 0.0, 1.0) * 0.4;
  vec3 col = mix(body + uShallow * uSunCol * sss * 0.2, refl, F) + uSunCol * spec * 0.6;
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * sea(L, W, opts) — an endless sea under a world: Gerstner swell moving with t, ripples, sky reflection, sun glint.
 *   level 0 · waves 'calm' | 'swell' | 'choppy' | [[dirX, dirZ, wavelength, amplitude], …] (≤ 6) · scale 1 (multiplies
 *   wavelengths and heights: 0.1 = a pond for a small object; below ~0.5 with the camera near the water the ripples read
 *   as a regular grid) · deep '#0b2a3a' · shallow '#2f7f8a' · rough 0.08 · fade 1500
 *   (distance at which the swell flattens into the reflection) · radius 30000
 * The grid follows the camera (snapped, so the waves stay put); returns the mesh.
 */
export function sea(L, W, o = {}) {
  const rings = 120, segs = 256, r0 = 0.6 * (o.scale ?? 1), R = o.radius ?? 30000;
  const pos = [], idx = [];
  const k = Math.pow(R / r0, 1 / (rings - 1));
  pos.push(0, 0, 0);
  for (let i = 0; i < rings; i++) { const r = r0 * Math.pow(k, i); for (let j = 0; j < segs; j++) { const a = (j / segs) * Math.PI * 2; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); } }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < segs; j++) {
    const a = 1 + i * segs + j, b = 1 + i * segs + ((j + 1) % segs), c = a + segs, d = b + segs;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const waves = typeof (o.waves ?? 'swell') === 'string' ? WAVES[o.waves ?? 'swell'] : o.waves;
  const uW = Array.from({ length: 6 }, (_, i) => new THREE.Vector4(...(waves[i] || [1, 0, 0, 0])));
  const lin = (c) => new THREE.Color(c);   // THREE.Color converts sRGB hex to linear
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: o.scale ?? 1 }, uFade: { value: o.fade ?? 1500 }, uW: { value: uW }, uCam: { value: new THREE.Vector3() },
      uRough: { value: o.rough ?? 0.08 }, uSun: W.uniforms.uSun, uSunCol: W.uniforms.uSunCol, uAmbTop: W.uniforms.uAmbTop, uSkyLut: W.uniforms.uSkyLut,
      uDeep: { value: lin(o.deep ?? '#0b2a3a') }, uShallow: { value: lin(o.shallow ?? '#2f7f8a') }, uExposure: { value: 1 } },
    vertexShader: SEA_VERT, fragmentShader: SEA_FRAG,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.position.y = o.level ?? 0;
  L.scene.add(mesh);
  const snap = r0 * 4;
  L.late((t) => {
    const c = W.uniforms.uCamPos.value;
    mesh.position.x = Math.round(c.x / snap) * snap; mesh.position.z = Math.round(c.z / snap) * snap;
    m.uniforms.uTime.value = t; m.uniforms.uCam.value.copy(c);
  });
  return mesh;
}

// ---------------------------------------------------------------- procedural full-frame pass
/**
 * pass(parent, glsl, opts) — a full-frame fragment shader in its own canvas, f(t) only: a procedural background
 * (light, a gradient field, a paper texture, a starfield), or an overlay with z above the DOM. The prelude GLSL above
 * (hash, vnoise, fbm, fbm3, ign, luma, toLin, toSrgb, blackbody, hg, dirToEqui) is included; write main():
 *   pass(root, `void main(){ vec2 p = vUv * uRes / uRes.y; float n = fbm(p * 3.0 + uTime * 0.05);
 *     gl_FragColor = vec4(toSrgb(mix(toLin(vec3(0.96, 0.95, 0.93)), toLin(vec3(0.85, 0.88, 0.95)), n)), 1.0); }`)
 * Uniforms: uTime (film seconds), uRes (px), plus opts.uniforms { name: value } — numbers, THREE.Vector2/3/4, THREE.Color,
 * textures. opts.frame(t, u) sets them per frame (u.name.value = …). z -1 (under the DOM) · alpha false.
 * Output is written as is (no tone mapping, no colour conversion): do the sRGB step yourself (toSrgb) when mixing in linear.
 */
export function pass(parent, glsl, o = {}) {
  const W = C.W, H = C.H;
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, alpha: !!o.alpha, depth: false, stencil: false });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  Object.assign(renderer.domElement.style, { position: 'absolute', left: 0, top: 0, width: W + 'px', height: H + 'px', zIndex: o.z ?? -1, pointerEvents: 'none' });
  parent.prepend(renderer.domElement);
  const u = { uTime: { value: 0 }, uRes: { value: new THREE.Vector2(W, H) } };
  const decl = [];
  for (const [k, v] of Object.entries(o.uniforms || {})) {
    u[k] = { value: v };
    const type = typeof v === 'number' ? 'float' : v.isVector2 ? 'vec2' : v.isVector3 || v.isColor ? 'vec3' : v.isVector4 ? 'vec4' : v.isTexture ? 'sampler2D' : null;
    if (!type) throw new Error(`pass: uniform ${k} has an unsupported type`);
    decl.push(`uniform ${type} ${k};`);
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: u, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `precision highp float; varying vec2 vUv; uniform float uTime; uniform vec2 uRes; ${decl.join(' ')}\n${GLSL}\n${glsl}`,
  });
  mat.toneMapped = false;
  const scene = new THREE.Scene(), cam = new THREE.Camera();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  C.hooks.after.push((t, b) => {
    u.uTime.value = t;
    if (o.frame && o.frame(t, u, b) === false) { renderer.domElement.style.visibility = 'hidden'; return; }
    renderer.domElement.style.visibility = '';
    renderer.render(scene, cam);
  });
  return { renderer, material: mat, uniforms: u };
}
