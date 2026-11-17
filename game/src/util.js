// Solara Bay — shared math, random and collision helpers.
// Every system in the game imports these small pure functions.

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Move `value` toward `target` by at most `step` (per call).
export function approach(value, target, step) {
  if (value < target) return Math.min(target, value + step);
  return Math.max(target, value - step);
}

export function dist(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
}

// Wrap an angle to [-PI, PI].
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Turn `from` toward `to` by at most `step` radians.
export function turnToward(from, to, step) {
  const d = wrapAngle(to - from);
  if (Math.abs(d) <= step) return to;
  return from + Math.sign(d) * step;
}

// Deterministic seeded RNG (mulberry32) so the city is the same every run.
export function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function range(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

export function intRange(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// Circle vs axis-aligned rectangle: true when they overlap.
export function circleHitsRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

// Push a circle out of a rectangle; returns true when a push happened.
export function pushCircleOutOfRect(p, r, rx, ry, rw, rh) {
  const nx = clamp(p.x, rx, rx + rw);
  const ny = clamp(p.y, ry, ry + rh);
  let dx = p.x - nx, dy = p.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 === 0) {
    // Centre is inside the rectangle: push out along the nearest face.
    const left = p.x - rx, right = rx + rw - p.x;
    const top = p.y - ry, bottom = ry + rh - p.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) p.x = rx - r;
    else if (m === right) p.x = rx + rw + r;
    else if (m === top) p.y = ry - r;
    else p.y = ry + rh + r;
    return true;
  }
  const d = Math.sqrt(d2);
  dx /= d; dy /= d;
  p.x = nx + dx * r;
  p.y = ny + dy * r;
  return true;
}

// Point-in-rotated-rectangle test, for car bodies.
export function pointInCar(px, py, car) {
  const c = Math.cos(-car.angle), s = Math.sin(-car.angle);
  const dx = px - car.x, dy = py - car.y;
  const lx = dx * c - dy * s, ly = dx * s + dy * c;
  return Math.abs(lx) <= car.length / 2 && Math.abs(ly) <= car.width / 2;
}

// Format a money amount as $1,250.
export function money(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

// Format seconds as M:SS.
export function clock(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m + ':' + String(s).padStart(2, '0');
}
