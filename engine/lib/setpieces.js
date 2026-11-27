// Setpiece kits for motion-film WebGL films: a growing tree and a flight through a universe. Same contract as lib/gl.js:
// every value is f(t), built once from a seed, any frame order. Recipes and when to use them: reference/SETPIECES.md.
//
//   import { layer, tree, starfield } from './lib/gl.js';
//   const T = tree(L, { seed: 4, depth: 7 });            L.frame((t) => T.grow(C.clamp((t - 2) / 6)));
//   const U = starfield(L, { count: 80000, seed: 2 });    // then fly the camera with C.path(t, keys)
import * as THREE from 'three';

const rng = (seed) => {   // mulberry32: the same tree and the same sky in every worker
  let a = (seed * 2654435761) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
};

/**
 * tree(L, { seed, depth, height, spread, twist, leaves, bark, leaf, position }) — a branching tree that grows with
 * grow(g), g 0 → 1: the trunk first, each branch starts when its parent is done, leaves open at the tips last.
 *   depth 7 (levels; 2^depth tips, keep ≤ 9) · height 10 (trunk + crown, scene units: layer()'s camera sees 0.1–200) · spread 0.55 (branch angle,
 *   radians) · twist 2.4 (turn between siblings) · leaves true · bark '#5b4a3c' · leaf '#7fae5a' · position [0, 0, 0]
 * The shape is a decision tree as much as a plant: label tips (T.tips[i] = world position at g = 1) and it is the
 * «one choice branches into many» shot. Returns { group, grow(g), tips, count }.
 */
export function tree(L, o = {}) {
  const R = rng(o.seed ?? 1), depth = Math.min(o.depth ?? 7, 10), H = o.height ?? 10, spread = o.spread ?? 0.55, twist = o.twist ?? 2.4;
  const B = [];   // { from: Vector3, dir: Vector3, len, rad, s, e, level }
  const trunk = H * 0.34;
  // time budget: level k grows inside [k/(depth+1.4), (k+1)/(depth+1.4)] (+ jitter); leaves take the last 0.4 share
  const slot = 1 / (depth + 1.4);
  const add = (from, dir, len, rad, level, s) => {
    const e = Math.min(s + slot * (0.85 + 0.3 * R()), 1 - 0.4 * slot);
    B.push({ from, dir, len, rad, s, e, level });
    if (level >= depth) return;
    const tip = from.clone().addScaledVector(dir, len);
    const n = level < 2 ? 3 : 2, base = R() * Math.PI * 2;
    // a side vector perpendicular to dir, turned around it by the sibling angle
    const side0 = new THREE.Vector3(0, 1, 0).cross(dir); if (side0.lengthSq() < 1e-6) side0.set(1, 0, 0); side0.normalize();
    for (let i = 0; i < n; i++) {
      const a = base + i * twist + (R() - 0.5) * 0.6;
      const side = side0.clone().applyAxisAngle(dir, a);
      const tilt = spread * (0.75 + 0.5 * R());
      const d = dir.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(side, Math.sin(tilt));
      d.y += 0.18; d.normalize();                                     // branches reach a little up, toward light
      add(tip, d, len * (0.68 + 0.14 * R()), rad * 0.66, level + 1, e);
    }
  };
  add(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), trunk, H * 0.035, 0, 0);

  const group = new THREE.Group();
  if (o.position) group.position.set(...o.position);
  const geo = new THREE.CylinderGeometry(0.7, 1, 1, 10, 1); geo.translate(0, 0.5, 0);   // base at 0, grows along +y
  const bark = new THREE.MeshStandardMaterial({ color: o.bark ?? '#5b4a3c', roughness: 0.85 });
  const wood = new THREE.InstancedMesh(geo, bark, B.length); wood.frustumCulled = false; group.add(wood);
  const tips = B.filter((b) => b.level === depth);
  const leafOn = o.leaves ?? true;
  const lgeo = new THREE.IcosahedronGeometry(1, 1);
  const lmat = new THREE.MeshStandardMaterial({ color: o.leaf ?? '#7fae5a', roughness: 0.7, flatShading: true });
  const crown = new THREE.InstancedMesh(lgeo, lmat, leafOn ? tips.length : 0); crown.frustumCulled = false; group.add(crown);
  const leafSize = tips.map(() => H * (0.035 + 0.025 * R())), leafT = tips.map((b) => b.e + 0.05 * R());
  L.scene.add(group);
  if (L.camera.far < H * 30) { L.camera.far = H * 30; L.camera.updateProjectionMatrix(); }

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), Z = new THREE.Matrix4().makeScale(0, 0, 0);
  const grow = (g) => {
    B.forEach((b, i) => {
      const k = THREE.MathUtils.clamp((g - b.s) / (b.e - b.s), 0, 1), e = 1 - (1 - k) * (1 - k);   // ease out: a shoot slows as it matures
      if (k <= 0) { wood.setMatrixAt(i, Z); return; }
      q.setFromUnitVectors(up, b.dir);
      const r = b.rad * (0.35 + 0.65 * e);                                   // thickens as it grows
      m.compose(b.from, q, sc.set(r, b.len * e, r)); wood.setMatrixAt(i, m);
    });
    wood.instanceMatrix.needsUpdate = true;
    if (!leafOn) return;
    tips.forEach((b, i) => {
      const k = THREE.MathUtils.clamp((g - leafT[i]) / (0.4 * slot), 0, 1), e = k * k * (3 - 2 * k);
      const p = b.from.clone().addScaledVector(b.dir, b.len);
      m.compose(p, q.identity(), sc.setScalar(leafSize[i] * e)); crown.setMatrixAt(i, e > 0 ? m : Z);
    });
    crown.instanceMatrix.needsUpdate = true;
  };
  grow(0);
  return { group, grow, tips: tips.map((b) => b.from.clone().addScaledVector(b.dir, b.len).add(group.position)), count: B.length };
}

const STAR_VERT = /* glsl */ `
attribute float aSize; attribute vec3 aColor; varying vec3 vColor; varying float vFade;
uniform float uPx, uNear, uFar;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = -mv.z;
  gl_PointSize = clamp(aSize * uPx / max(d, 1.0), 1.0, 28.0);
  vFade = smoothstep(uNear * 0.3, uNear, d) * (1.0 - smoothstep(uFar * 0.7, uFar, d));   // no pop at either end
  vColor = aColor * min(aSize * uPx / max(d, 1.0), 1.0);                                   // a sub-pixel star dims instead of shimmering
  gl_Position = projectionMatrix * mv;
}`;
const STAR_FRAG = /* glsl */ `
varying vec3 vColor; varying float vFade;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0; float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 9.0), halo = exp(-r2 * 2.2) * 0.25;
  gl_FragColor = vec4(vColor * (core + halo) * vFade, 1.0);
}`;
// star colour from temperature (K): a fit to the blackbody curve, sRGB 0..1
const kelvin = (K) => {
  const t = K / 100; let r, g, b;
  r = t <= 66 ? 1 : Math.min(1, 1.2929 * Math.pow(t - 60, -0.1332));
  g = t <= 66 ? Math.min(1, 0.39 * Math.log(t) - 0.6318) : Math.min(1, 1.1299 * Math.pow(t - 60, -0.0755));
  b = t >= 66 ? 1 : t <= 19 ? 0 : Math.min(1, 0.5432 * Math.log(t - 10) - 1.1963);
  return [r, g, b].map((x) => Math.max(0, x));
};

/**
 * starfield(L, { count, radius, seed, galaxies, size, near, far, bg }) — a universe to fly through: stars coloured by
 * temperature, plus spiral galaxies (each a disc of points with arms), additive, on a black or deep-blue ground.
 *   count 60000 · radius 20000 (stars fill a sphere; fly the camera inside it with C.path) · galaxies 10 · size 1
 *   (star size multiplier) · near 40 / far 30000 (fade-in and fade-out distances: nothing pops) · bg '#03040a'
 * A universe is dark: it is one of the few places a light film goes dark on purpose (RULES: themes) — a shot, not a
 * theme. Returns { points, galaxies: [{ center, radius }] } — fly to a galaxy, land on a planet, cut on its glow.
 */
export function starfield(L, o = {}) {
  const R = rng(o.seed ?? 3), N = o.count ?? 60000, RAD = o.radius ?? 20000, G = o.galaxies ?? 10, k = o.size ?? 1;
  const pos = [], col = [], size = [], gal = [];
  for (let i = 0; i < N; i++) {
    const u = R() * 2 - 1, a = R() * Math.PI * 2, r = RAD * Math.cbrt(R()), s = Math.sqrt(1 - u * u);
    pos.push(r * s * Math.cos(a), r * u, r * s * Math.sin(a));
    const K = 2800 + Math.pow(R(), 2.2) * 12000, c = kelvin(K), b = 0.35 + 0.65 * Math.pow(R(), 3);
    col.push(c[0] * b, c[1] * b, c[2] * b); size.push(k * RAD * (0.0004 + 0.002 * Math.pow(R(), 6)));   // world units
  }
  for (let g = 0; g < G; g++) {
    const center = new THREE.Vector3((R() * 2 - 1) * RAD * 0.8, (R() * 2 - 1) * RAD * 0.4, (R() * 2 - 1) * RAD * 0.8);
    const gr = RAD * (0.04 + 0.05 * R()), arms = 2 + Math.floor(R() * 3), wind = 2.5 + 2 * R();
    const n = Math.round(N * 0.06), axis = new THREE.Vector3(R() - 0.5, 1, R() - 0.5).normalize(), qa = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    const hue = R(), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const rr = gr * Math.pow(R(), 1.6), arm = Math.floor(R() * arms), th = (arm / arms) * Math.PI * 2 + (rr / gr) * wind + (R() - 0.5) * 0.5;
      v.set(Math.cos(th) * rr, (R() - 0.5) * gr * 0.06 * (1 - rr / gr), Math.sin(th) * rr).applyQuaternion(qa).add(center);
      pos.push(v.x, v.y, v.z);
      const coreW = Math.exp(-rr / (gr * 0.15)), c = coreW > 0.3 ? [1, 0.86, 0.66] : hue < 0.5 ? [0.62, 0.74, 1] : [0.95, 0.7, 0.9];
      const b = 0.25 + 0.75 * coreW + 0.25 * R();
      col.push(c[0] * b, c[1] * b, c[2] * b); size.push(k * RAD * (0.0005 + 0.0012 * coreW));
    }
    gal.push({ center, radius: gr });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    // uPx: the focal length in px, so aSize (world units) projects like real geometry; set at build time from the fov
    uniforms: { uPx: { value: C.H / 2 / Math.tan(THREE.MathUtils.degToRad(L.camera.fov) / 2) }, uNear: { value: o.near ?? 40 }, uFar: { value: o.far ?? 30000 } },
    vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false;
  L.scene.add(points);
  if (o.bg !== false) L.scene.background = new THREE.Color(o.bg ?? '#03040a');
  L.camera.far = Math.max(L.camera.far, (o.far ?? 30000) * 1.05); L.camera.updateProjectionMatrix();
  return { points, galaxies: gal };
}
