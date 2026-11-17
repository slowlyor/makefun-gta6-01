// Solara Bay — the law: a 0–5 star wanted level, police cars and foot
// cops that chase the player, roadblocks at high heat, and the busted
// and wasted outcomes. Heat cools when the player stays out of sight.

import { clamp, dist, makeRng, range, approach } from './util.js';
import { WORLD, nearestRoadPoint } from './city.js';
import { CAR_MODELS, makeCar, driveCar, drawCar } from './vehicles.js';

export const MAX_WANTED = 5;

// How many police units each wanted level fields.
export function copsForLevel(level) {
  return [0, 2, 3, 4, 6, 8][level] ?? 0;
}

// Wanted gain for common crimes.
export const HEAT = {
  stealCar: 1,
  shoot: 1,
  runOverPed: 1,
  killCop: 1,
  speedingNearCop: 0, // reserved: reckless driving near a unit is a warning
};

export class Police {
  constructor() {
    this.wanted = 0;
    this.heat = 0;            // fractional heat; 60 heat = 1 star
    this.units = [];          // { kind: 'car'|'foot', car?, x, y, angle, speed, ... }
    this.coolTimer = 0;       // seconds since last crime
    this.bustedTimer = 0;     // how long a cop has been touching the player
    this.roadblockTimer = 0;
    this.lastCrimeAt = 0;
    this.rng = makeRng(99);
  }

  addHeat(amount, now) {
    this.heat = clamp(this.heat + amount * 60, 0, MAX_WANTED * 60);
    const level = Math.floor(this.heat / 60);
    if (level > this.wanted) {
      this.wanted = level;
      this.lastCrimeAt = now;
      this.coolTimer = 0;
      return true; // level rose
    }
    this.lastCrimeAt = now;
    this.coolTimer = 0;
    return false;
  }

  // Wanted decays only after a quiet spell with no cop in sight.
  update(dt, player, cars, peds, now) {
    this.coolTimer += dt;
    if (this.wanted > 0 && this.coolTimer > 14) {
      this.heat = Math.max(0, this.heat - dt * 5);
      const level = Math.floor(this.heat / 60);
      if (level < this.wanted) this.wanted = level;
    }

    // Spawn / despawn units to match the wanted level.
    const want = copsForLevel(this.wanted);
    while (this.units.length < want) this.spawnUnit(player);
    while (this.units.length > want) this.units.pop();

    // Roadblocks at 3+ stars: a line of parked police cars ahead of the player.
    if (this.wanted >= 3) {
      this.roadblockTimer -= dt;
      if (this.roadblockTimer <= 0) {
        this.roadblockTimer = 18;
        this.spawnRoadblock(player, cars);
      }
    }

    for (const u of this.units) {
      if (u.kind === 'car') this.updateCopCar(u, dt, player);
      else this.updateFootCop(u, dt, player);
    }
    // Remove units that fell far behind.
    this.units = this.units.filter(u => {
      const d = dist(u.x, u.y, player.x, player.y);
      return d < 1600;
    });

    // Busted: a foot cop close to the player on foot, or a cop car
    // stopped against the player's car, for a sustained moment.
    let touching = false;
    for (const u of this.units) {
      const d = dist(u.x, u.y, player.x, player.y);
      if (u.kind === 'foot' && !player.inCar && d < 26) touching = true;
      if (u.kind === 'car' && player.inCar && d < 60 && Math.abs(u.speed) < 20 && Math.abs(player.car.speed) < 20) touching = true;
    }
    this.bustedTimer = touching ? this.bustedTimer + dt : 0;
    return this.bustedTimer > 2.2;
  }

  spawnUnit(player) {
    const rng = this.rng;
    const angle = range(rng, 0, Math.PI * 2);
    const d = range(rng, 520, 700);
    const x = clamp(player.x + Math.cos(angle) * d, 60, WORLD - 60);
    const y = clamp(player.y + Math.sin(angle) * d, 60, WORLD - 60);
    if (this.wanted >= 2 || rng() < 0.5) {
      const rp = nearestRoadPoint(x, y);
      const car = makeCar(CAR_MODELS[6], rp.x, rp.y, range(rng, 0, Math.PI * 2));
      car.driver = 'police';
      this.units.push({ kind: 'car', car, x: car.x, y: car.y, speed: 0 });
    } else {
      this.units.push({ kind: 'foot', x, y, angle: 0, speed: 0, walkPhase: 0 });
    }
  }

  spawnRoadblock(player, cars) {
    // Three police cars parked across the road ahead of the player's heading.
    const ahead = player.inCar ? player.car.angle : player.angle;
    const cx = player.x + Math.cos(ahead) * 420;
    const cy = player.y + Math.sin(ahead) * 420;
    const rp = nearestRoadPoint(cx, cy);
    const perp = rp.vertical ? 0 : Math.PI / 2;
    for (let i = -1; i <= 1; i++) {
      const car = makeCar(CAR_MODELS[6],
        rp.x + (rp.vertical ? 0 : i * 34),
        rp.y + (rp.vertical ? i * 34 : 0),
        perp);
      car.driver = null;
      cars.push(car);
    }
  }

  updateCopCar(u, dt, player) {
    const car = u.car;
    // Pursuit steering: aim at the player, ram when close.
    const wantAngle = Math.atan2(player.y - car.y, player.x - car.x);
    const diff = ((wantAngle - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const steer = clamp(diff * 1.6, -1, 1);
    const d = dist(car.x, car.y, player.x, player.y);
    const throttle = d > 70 ? 1 : (d < 40 ? -0.4 : 0.4);
    driveCar(car, { throttle, steer }, dt);
    u.x = car.x; u.y = car.y; u.speed = car.speed;
    car.headlights = true;
  }

  updateFootCop(u, dt, player) {
    const d = dist(u.x, u.y, player.x, player.y);
    const wantAngle = Math.atan2(player.y - u.y, player.x - u.x);
    u.angle = wantAngle;
    // Ease into a sprint when the player is near, ease out when far.
    const targetSpeed = d > 200 ? 0 : 105;
    u.speed = approach(u.speed, targetSpeed, dt * 260);
    u.x += Math.cos(u.angle) * u.speed * dt;
    u.y += Math.sin(u.angle) * u.speed * dt;
    u.walkPhase += dt * (4 + u.speed * 0.08);
  }

  clear() {
    this.wanted = 0;
    this.heat = 0;
    this.units = [];
    this.bustedTimer = 0;
  }

  draw(ctx, time) {
    for (const u of this.units) {
      if (u.kind === 'car') drawCar(ctx, u.car, time);
      else this.drawFootCop(ctx, u);
    }
  }

  drawFootCop(ctx, u) {
    const swing = Math.sin(u.walkPhase) * 3;
    ctx.save();
    ctx.translate(u.x, u.y);
    ctx.rotate(u.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(0, 2, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1c2a4a'; // navy uniform
    ctx.fillRect(-3 + swing * 0.4, -5, 6, 4);
    ctx.fillRect(-3 - swing * 0.4, 1, 6, 4);
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8c8a0';
    ctx.beginPath(); ctx.arc(5, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    // Cap brim.
    ctx.fillStyle = '#101828';
    ctx.fillRect(4, -5, 5, 10);
    ctx.restore();
  }
}
