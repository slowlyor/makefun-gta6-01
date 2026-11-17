// Solara Bay — pedestrians: city folk who stroll the sidewalks, cross
// roads, flee from gunfire and speeding cars, and occasionally drive.
// A ped is a small top-down figure with a shirt colour and a walk cycle.

import { clamp, dist, makeRng, pick, range, turnToward, wrapAngle } from './util.js';
import { BLOCK, ROAD_W, WORLD, nearestRoadPoint, collideBuildings } from './city.js';

const SHIRTS = ['#d94f3d', '#3d7fc9', '#e8b93c', '#5e8a4e', '#8a5fc9', '#e8e8e8', '#c96a9a', '#3d9a8a'];
const SKINS = ['#e8b88a', '#c98a5e', '#8a5a3b', '#f0c8a0'];
const PANTS = ['#2c3a4a', '#4a3a2c', '#3a3a3a', '#5a6a7a'];

export function makePed(rng, x, y) {
  return {
    x, y,
    angle: range(rng, 0, Math.PI * 2),
    speed: range(rng, 26, 46),
    state: 'walk',          // walk | idle | flee | dead | driving
    target: null,           // {x, y} stroll destination
    idleTimer: 0,
    shirt: pick(rng, SHIRTS),
    skin: pick(rng, SKINS),
    pants: pick(rng, PANTS),
    walkPhase: range(rng, 0, Math.PI * 2),
    fleeTimer: 0,
    car: null,              // car this ped is driving, if any
    id: Math.random().toString(36).slice(2, 8),
  };
}

export function spawnPedNear(rng, x, y) {
  // Peds prefer sidewalks: pick a point just off a road.
  const rp = nearestRoadPoint(x + range(rng, -200, 200), y + range(rng, -200, 200));
  const px = rp.vertical ? rp.x + (rng() < 0.5 ? -46 : 46) : rp.x;
  const py = rp.vertical ? rp.y : rp.y + (rng() < 0.5 ? -46 : 46);
  return makePed(rng, clamp(px, 40, WORLD - 40), clamp(py, 40, WORLD - 40));
}

function pickStrollTarget(rng, ped) {
  // Walk to a nearby point on the sidewalk network.
  const rp = nearestRoadPoint(ped.x + range(rng, -320, 320), ped.y + range(rng, -320, 320));
  const side = rng() < 0.5 ? -46 : 46;
  return {
    x: clamp(rp.vertical ? rp.x + side : rp.x, 40, WORLD - 40),
    y: clamp(rp.vertical ? rp.y : rp.y + side, 40, WORLD - 40),
  };
}

export function updatePed(ped, dt, city, rng, danger) {
  if (ped.state === 'dead' || ped.state === 'driving') return;
  ped.walkPhase += dt * (ped.state === 'flee' ? 14 : 7);

  if (ped.state === 'idle') {
    ped.idleTimer -= dt;
    if (ped.idleTimer <= 0) ped.state = 'walk';
  } else if (ped.state === 'flee') {
    ped.fleeTimer -= dt;
    // Run away from the danger point.
    const away = Math.atan2(ped.y - danger.y, ped.x - danger.x);
    ped.angle = turnToward(ped.angle, away, dt * 6);
    ped.x += Math.cos(ped.angle) * 95 * dt;
    ped.y += Math.sin(ped.angle) * 95 * dt;
    if (ped.fleeTimer <= 0) ped.state = 'walk';
  } else {
    if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 12) {
      ped.target = pickStrollTarget(rng, ped);
      // Sometimes a ped stops to look at a shop window or check a phone.
      if (rng() < 0.14) {
        ped.state = 'idle';
        ped.idleTimer = 1 + rng() * 2.5;
        return;
      }
    }
    const want = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
    ped.angle = turnToward(ped.angle, want, dt * 4);
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
  }

  ped.x = clamp(ped.x, 30, WORLD - 30);
  ped.y = clamp(ped.y, 30, WORLD - 30);
  collideBuildings(ped, 10, city);
}

// A ped that just saw a crime or a speeding car starts fleeing.
export function scarePed(ped, x, y) {
  if (ped.state === 'dead' || ped.state === 'driving') return;
  ped.state = 'flee';
  ped.fleeTimer = 2.5 + Math.random() * 2;
}

export function drawPed(ctx, ped, time) {
  if (ped.state === 'dead') {
    // Lying flat, a dark outline on the ground.
    ctx.save();
    ctx.translate(ped.x, ped.y);
    ctx.rotate(ped.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  const bob = Math.sin(ped.walkPhase) * 1.5;
  const swing = Math.sin(ped.walkPhase) * 3;
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.rotate(ped.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(0, 2, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
  // Legs (two feet stepping).
  ctx.fillStyle = ped.pants;
  ctx.fillRect(-3 + swing * 0.4, -5, 6, 4);
  ctx.fillRect(-3 - swing * 0.4, 1, 6, 4);
  // Body.
  ctx.fillStyle = ped.shirt;
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
  // Head.
  ctx.fillStyle = ped.skin;
  ctx.beginPath(); ctx.arc(5 + bob * 0.2, 0, 4.5, 0, Math.PI * 2); ctx.fill();
  // Facing direction: a small nose marker.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.arc(9, 0, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
