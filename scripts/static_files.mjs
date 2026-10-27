// Which project file a local server (render.mjs, player.mjs) may hand to a browser. One policy for both:
// - only a localhost Host on the server's own port (DNS rebinding);
// - only a known film resource type;
// - no hidden segment (.env, .git, .venv, '..') in the requested path, nor in the real path after symlinks;
// - the real path lies inside the project, or inside its node_modules link for /node_modules/… requests.
import fs from 'node:fs';
import path from 'node:path';

export const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.hdr': 'application/octet-stream', '.ktx2': 'image/ktx2', '.wasm': 'application/wasm' };

export const mimeOf = (f) => MIME[path.extname(f).toLowerCase()];
export const hostOk = (req, port) => req.headers.host === `127.0.0.1:${port}` || req.headers.host === `localhost:${port}`;

const real = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
const within = (f, dir) => f === dir || f.startsWith(dir + path.sep);
const hidden = (s) => s.startsWith('.') || s.includes('\0');

// The absolute path to serve for a request URL, or null (answer 404).
export function filmFile(root, rawUrl) {
  let url;
  try { url = decodeURIComponent(String(rawUrl).split('?')[0]); } catch { return null; }
  const parts = url.split(/[\\/]+/).filter(Boolean);
  if (!parts.length || parts.some(hidden) || !mimeOf(url)) return null;
  const f = real(path.join(root, ...parts));
  if (!f) return null;
  const bases = [real(root), parts[0] === 'node_modules' ? real(path.join(root, 'node_modules')) : null].filter(Boolean);
  const base = bases.find((b) => within(f, b));
  if (!base || path.relative(base, f).split(path.sep).some(hidden)) return null;
  return fs.statSync(f).isFile() ? f : null;
}
