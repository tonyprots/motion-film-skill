// Fixed-template tracks from scripts/track.py. Classic script after core.js; opt-in.
// TRACKING.follow(label, 'assets/tracks.json', {offset:0, box:{x,y,w,h}, focus:[.5,.5], dx:0, dy:-40})
// Coordinates are STAGE pixels: attach label directly to C.stage, without an animated ancestor.
// Fixed cover mapping only; do not combine with CAM.rig or a transformed recording layer.
(() => {
  const validate = (track) => {
    const source = track?.source;
    if (track?.version !== 1 || !source || !Number.isFinite(source.fps) || source.fps <= 0
      || !Number.isFinite(source.width) || source.width <= 0 || !Number.isFinite(source.height) || source.height <= 0
      || !Number.isInteger(source.frames) || source.frames <= 0 || !Array.isArray(track.samples) || track.samples.length !== source.frames) {
      throw new Error('TRACKING: invalid track metadata');
    }
    for (const point of track.samples) {
      const absent = point.x === null && point.y === null;
      if (!absent && (!Number.isFinite(point.x) || !Number.isFinite(point.y)
        || point.x < 0 || point.y < 0 || point.x > source.width || point.y > source.height)) {
        throw new Error('TRACKING: invalid sample coordinates');
      }
      if (!absent && point.status !== 'tracked') throw new Error('TRACKING: non-tracked samples must have null coordinates');
    }
    return track;
  };
  // Pure, discrete source-frame sample. Never smooth across a loss or beyond the clip.
  const sample = (track, time, offset = 0) => {
    if (!Number.isFinite(time) || !Number.isFinite(offset)) return null;
    const index = Math.floor((time - offset) * track.source.fps + 1e-6);
    if (time < offset || index < 0 || index >= track.samples.length) return null;
    const point = track.samples[index];
    return point.x === null || point.y === null || point.status !== 'tracked' ? null : { ...point, frame: index };
  };
  const project = (track, point, box, focus = [.5, .5]) => {
    if (!point) return null;
    if (![box.x, box.y, box.w, box.h, ...focus].every(Number.isFinite) || box.w <= 0 || box.h <= 0
      || focus.length !== 2 || focus.some((value) => value < 0 || value > 1)) throw new Error('TRACKING: invalid cover box/focus');
    const scale = Math.max(box.w / track.source.width, box.h / track.source.height);
    const x = box.x + (box.w - track.source.width * scale) * focus[0] + point.x * scale;
    const y = box.y + (box.h - track.source.height * scale) * focus[1] + point.y * scale;
    // Hide cropped-away subjects rather than pinning their label to the edge.
    return x < box.x || x > box.x + box.w || y < box.y || y > box.y + box.h ? null : { x, y };
  };
  const follow = (label, input, options = {}) => {
    let track = null;
    if (typeof input === 'string') {
      const ready = fetch(input).then((response) => {
        if (!response.ok) throw new Error('TRACKING: failed to load track');
        return response.json();
      }).then((value) => { track = validate(value); });
      C.gates.push(ready);
    } else track = validate(input);
    C.reg(label, { o: 0 });
    let active = true;
    const hook = (time) => {
      const box = options.box || C.REC;
      if (!box) throw new Error('TRACKING: provide a cover box or use a recording');
      const recording = !options.box || options.box === C.REC ? C.TL?.recording : null;
      const offset = options.offset ?? recording?.offset ?? 0;
      const focus = options.focus ?? recording?.layout?.[C.FMT]?.focus ?? [.5, .5];
      const point = active && track ? project(track, sample(track, window.FRAME_T ?? time, offset), box, focus) : null;
      C.put(label, point ? { x: point.x + (options.dx ?? 0), y: point.y + (options.dy ?? 0), o: 1 } : { o: 0 });
    };
    C.hooks.before.push(hook);
    return { stop: () => { active = false; }, start: () => { active = true; } };
  };
  window.TRACKING = { validate, sample, project, follow };
})();
