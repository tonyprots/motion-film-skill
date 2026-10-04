// Part of motion-film render.mjs. Bit-exact with the generic decoder it replaced (checked on Chromium, PIL and RGBA PNGs).
import zlib from 'node:zlib';
// Fast PNG decoder for Chromium screenshots (8-bit RGB/RGBA, non-interlaced) → packed RGB Uint8Array.
// Filters 0 (None) and 2 (Up) — what Chromium emits with optimizeForSpeed — run as tight typed-array loops;
// 1/3/4 fall back to the generic path.
export function decodePNG(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8 || data[12] !== 0) throw new Error('unsupported PNG'); }
    else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break;
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : (() => { throw new Error('PNG colour type ' + ct); })();
  const raw = zlib.inflateSync(idat.length === 1 ? idat[0] : Buffer.concat(idat));
  const stride = w * bpp;
  const rows = bpp === 3 ? new Uint8Array(w * h * 3) : new Uint8Array(stride * 2);   // RGB: unfilter straight into the output
  let prevOff = -1;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1;
    const curOff = bpp === 3 ? y * stride : (y & 1) * stride;
    const cur = rows, hasPrev = prevOff >= 0;
    if (f === 0 || (f === 2 && !hasPrev)) cur.set(raw.subarray(src, src + stride), curOff);
    else if (f === 2) {
      if (bpp === 3 && (stride & 3) === 0) {   // SWAR: four lane-wise byte adds per 32-bit word, no carries between lanes
        cur.set(raw.subarray(src, src + stride), curOff);
        const c32 = new Uint32Array(cur.buffer, cur.byteOffset + curOff, stride >> 2), p32 = new Uint32Array(cur.buffer, cur.byteOffset + prevOff, stride >> 2);
        for (let x = 0; x < c32.length; x++) { const a = c32[x], b = p32[x]; c32[x] = ((a & 0x7f7f7f7f) + (b & 0x7f7f7f7f)) ^ ((a ^ b) & 0x80808080); }
      } else for (let x = 0; x < stride; x++) cur[curOff + x] = raw[src + x] + cur[prevOff + x];
    }
    else {
      for (let x = 0; x < stride; x++) {
        const A = x >= bpp ? cur[curOff + x - bpp] : 0, B = hasPrev ? cur[prevOff + x] : 0, C = x >= bpp && hasPrev ? cur[prevOff + x - bpp] : 0;
        let v = raw[src + x];
        if (f === 1) v += A; else if (f === 3) v += (A + B) >> 1;
        else if (f === 4) { const pp = A + B - C, pa = Math.abs(pp - A), pb = Math.abs(pp - B), pc = Math.abs(pp - C); v += pa <= pb && pa <= pc ? A : pb <= pc ? B : C; }
        cur[curOff + x] = v;
      }
    }
    if (bpp === 4) {   // RGBA: repack this row into the RGB output
      if (!rows.out) rows.out = new Uint8Array(w * h * 3);
      for (let x = 0, o = y * w * 3, q = curOff; x < w; x++, o += 3, q += 4) { rows.out[o] = cur[q]; rows.out[o + 1] = cur[q + 1]; rows.out[o + 2] = cur[q + 2]; }
    }
    prevOff = curOff;
  }
  return bpp === 3 ? rows : rows.out;
}
