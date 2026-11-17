// Solara Bay — vehicles: car models, arcade driving physics, traffic AI
// that follows the road grid, and stealing. Cars are drawn top-down as
// rounded bodies with windows, wheels and headlights.

import { clamp, dist, makeRng, pick, range, turnToward, wrapAngle } from './util.js';
import { BLOCK, ROAD_W, WORLD, nearestRoadPoint, collideBuildings } from './city.js';

export const CAR_MODELS = [
  { name: 'Hatchback', color: '#c94f3d', length: 46, width: 24, accel: 420, top: 330, handling: 3.4 },
  { name: 'Sedan',     color: '#3d6fc9', length: 50, width: 25, accel: 460, top: 360, handling: 3.2 },
  { name: 'Taxi',      color: '#e8b93c', length: 50, width: 25, accel: 450, top: 350, handling: 3.2, taxi: true },
  { name: 'Pickup',    color: '#5e8a4e', length: 54, width: 26, accel: 400, top: 320, handling: 3.0 },
  { name: 'Sports',    color: '#d9d23c', length: 48, width: 24, accel: 620, top: 470, handling: 4.2 },
  { name: 'Van',       color: '#8a8f96', length: 56, width: 27, accel: 340, top: 290, handling: 2.7 },
  { name: 'Police',    color: '#22262e', length: 52, width: 26, accel: 560, top: 430, handling: 3.8, police: true },
];

export function makeCar(model, x, y, angle) {
  return {
    model, x, y, angle,
    length: model.length, width: model.width,
    speed: 0, steer: 0,
    driver: null,        // 'player' | 'traffic' | 'police' | null (parked)
    targetSpeed: 0,
    cruiseDir: 0,        // traffic heading along a road
    laneOffset: 0,       // lateral offset from the road centre (its lane)
    color: model.color,
    headlights: false,
    brakeLight: false,
    id: Math.random().toString(36).slice(2, 8),
  };
}

// Spawn a parked or traffic car on a road near (x, y).
export function spawnCarNear(rng, x, y, traffic = true) {
  const model = pick(rng, CAR_MODELS.filter(m => !m.police));
  const rp = nearestRoadPoint(x + range(rng, -260, 260), y + range(rng, -260, 260));
  const angle = rp.vertical ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
  const offset = range(rng, -10, 10);
  const car = makeCar(model,
    rp.vertical ? rp.x + offset : rp.x,
    rp.vertical ? rp.y : rp.y + offset,
    angle);
  car.driver = traffic ? 'traffic' : null;
  car.cruiseDir = angle;
  car.laneOffset = offset * 0.8;
  car.targetSpeed = range(rng, 90, 150);
  return car;
}

// --- Driving physics (arcade, top-down) ---------------------------------
// input: { throttle: -1..1, steer: -1..1 } ; dt seconds.
export function driveCar(car, input, dt) {
  const m = car.model;
  const accel = input.throttle * m.accel;
  car.speed += accel * dt;
  // Rolling drag and braking.
  car.speed -= car.speed * 0.55 * dt;
  if (input.throttle === 0) car.speed -= car.speed * 1.4 * dt;
  car.speed = clamp(car.speed, -m.top * 0.45, m.top);
  // Steering only bites while moving; sharper at low speed.
  const speedFactor = clamp(Math.abs(car.speed) / 120, 0.25, 1);
  const steerTarget = input.steer * m.handling * speedFactor * (car.speed >= 0 ? 1 : -1);
  car.steer = clamp(car.steer + (steerTarget - car.steer) * Math.min(1, dt * 8), -m.handling, m.handling);
  car.angle += car.steer * dt * clamp(Math.abs(car.speed) / 90, 0, 1.1) * (car.speed >= 0 ? 1 : -1);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  car.x = nx; car.y = ny;
  car.brakeLight = input.throttle < 0 && car.speed > 20;
  // Stay inside the world.
  car.x = clamp(car.x, 30, WORLD - 30);
  car.y = clamp(car.y, 30, WORLD - 30);
  return car;
}

// --- Traffic AI ----------------------------------------------------------
// Traffic cars cruise along roads, keep their lane, brake for the car
// ahead, and turn at intersections.
export function updateTraffic(car, dt, city, rng, cars) {
  const m = car.model;
  const rp = nearestRoadPoint(car.x, car.y);
  const vertical = rp.vertical;
  // At an intersection, sometimes pick a new direction.
  const onIntersection = Math.abs(car.x % BLOCK) < 40 && Math.abs(car.y % BLOCK) < 40;
  if (onIntersection && rng() < dt * 0.5) {
    const options = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    car.cruiseDir = pick(rng, options);
  }
  const targetAngle = vertical
    ? (Math.sin(car.cruiseDir) >= 0 ? Math.PI / 2 : -Math.PI / 2)
    : (Math.cos(car.cruiseDir) >= 0 ? 0 : Math.PI);
  car.angle = turnToward(car.angle, targetAngle, dt * 2.2);
  // Ease toward its lane (road centre plus its own lateral offset).
  const laneX = vertical ? rp.x + car.laneOffset : car.x;
  const laneY = vertical ? car.y : rp.y + car.laneOffset;
  if (vertical) car.x += clamp(laneX - car.x, -60 * dt, 60 * dt);
  else car.y += clamp(laneY - car.y, -60 * dt, 60 * dt);
  // Brake for the car ahead: match its speed, or stop if it is close.
  let desiredSpeed = car.targetSpeed;
  if (cars) {
    const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
    let nearest = Infinity, leaderSpeed = 0;
    for (const other of cars) {
      if (other === car) continue;
      const dx = other.x - car.x, dy = other.y - car.y;
      const ahead = dx * fx + dy * fy;
      const side = Math.abs(-dx * fy + dy * fx);
      if (ahead > 0 && ahead < 110 && side < 26 && ahead < nearest) {
        nearest = ahead;
        leaderSpeed = other.speed;
      }
    }
    if (nearest < 110) {
      desiredSpeed = nearest < 62 ? 0 : Math.min(car.targetSpeed, leaderSpeed);
    }
  }
  // Cruise speed with a little wobble.
  car.speed += (desiredSpeed - car.speed) * Math.min(1, dt * 1.6);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 30, WORLD - 30);
  car.y = clamp(car.y, 30, WORLD - 30);
  // Buildings are off-road: traffic never leaves the road, but a nudge
  // keeps a car out of a corner it clipped.
  collideBuildings(car, car.width / 2, city);
}

// --- Car vs car: simple circle push-apart --------------------------------
// Positions separate fully; speeds only soften, so a nudge never stalls
// a car (and never drags the player's car into a jam).
export function separateCars(cars) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const d = dist(a.x, a.y, b.x, b.y);
      const min = (a.length + b.length) / 2 - 14;
      if (d === 0 || d >= min) continue;
      const push = (min - d) / 2 + 1;
      const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
      const aPlayer = a.driver === 'player';
      const bPlayer = b.driver === 'player';
      // The player's car holds its ground; the other car yields.
      const aMove = aPlayer ? 0.15 : bPlayer ? 1.85 : 1;
      const bMove = bPlayer ? 0.15 : aPlayer ? 1.85 : 1;
      a.x -= nx * push * aMove; a.y -= ny * push * aMove;
      b.x += nx * push * bMove; b.y += ny * push * bMove;
      if (!aPlayer && !bPlayer) {
        const slower = Math.min(a.speed, b.speed);
        a.speed = Math.max(slower, a.speed * 0.85);
        b.speed = Math.max(slower, b.speed * 0.85);
      }
    }
  }
}

// --- Drawing --------------------------------------------------------------
export function drawCar(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = car.length, W = car.width;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-L / 2 + 3, -W / 2 + 4, L, W);
  // Wheels.
  ctx.fillStyle = '#14161a';
  const wheelW = 9, wheelH = 5;
  ctx.fillRect(-L / 2 + 6, -W / 2 - 2, wheelW, wheelH);
  ctx.fillRect(L / 2 - 15, -W / 2 - 2, wheelW, wheelH);
  ctx.fillRect(-L / 2 + 6, W / 2 - 3, wheelW, wheelH);
  ctx.fillRect(L / 2 - 15, W / 2 - 3, wheelW, wheelH);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Cabin and windows.
  ctx.fillStyle = '#1c2733';
  roundRect(ctx, -L / 2 + 13, -W / 2 + 5, L - 30, W - 10, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(160, 200, 230, 0.55)';
  ctx.fillRect(-L / 2 + 16, -W / 2 + 7, 8, W - 14);
  // Taxi sign / police livery.
  if (car.model.taxi) {
    ctx.fillStyle = '#f5f0dc';
    ctx.fillRect(-6, -W / 2 + 2, 12, 5);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, -W / 2 + 6);
  }
  if (car.model.police) {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(-L / 2 + 8, -W / 2, L - 16, 4);
    ctx.fillStyle = '#1c5fd6';
    ctx.fillRect(-L / 2 + 8, W / 2 - 4, L - 16, 4);
    // Flashing light bar.
    const phase = Math.floor(time / 180) % 2 === 0;
    ctx.fillStyle = phase ? '#ff2d2d' : '#2d6bff';
    ctx.fillRect(-4, -W / 2 - 1, 8, 5);
    ctx.fillStyle = phase ? '#2d6bff' : '#ff2d2d';
    ctx.fillRect(-4, W / 2 - 4, 8, 5);
  }
  // Headlights and brake lights.
  ctx.fillStyle = 'rgba(255, 244, 180, 0.9)';
  ctx.fillRect(L / 2 - 2, -W / 2 + 4, 3, 4);
  ctx.fillRect(L / 2 - 2, W / 2 - 8, 3, 4);
  if (car.brakeLight) {
    ctx.fillStyle = '#ff2d2d';
    ctx.fillRect(-L / 2, -W / 2 + 4, 3, 4);
    ctx.fillRect(-L / 2, W / 2 - 8, 3, 4);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
