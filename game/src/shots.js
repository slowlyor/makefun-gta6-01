// Solara Bay — screenshot posing: ?shot= query params set up deterministic
// scenes for the entry's screenshots. The game itself never reads these
// outside this module; normal play ignores them entirely.
//
//   ?shot=start   title screen
//   ?shot=foot    on foot in Old Town, HUD + minimap visible
//   ?shot=drive   driving a sports car through traffic
//   ?shot=chase   police chase: 3 stars, cops closing in, mission live
//
// A &seed=N param re-seeds the city layout.

import { makeRng, range } from './util.js';
import { CAR_MODELS, makeCar, spawnCarNear } from './vehicles.js';
import { makePed, spawnPedNear } from './pedestrians.js';

export function parseShotParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    shot: q.get('shot') || '',
    seed: Number(q.get('seed') || 7),
  };
}

// Place the world into a posed scene. `game` is the live game object
// from main.js; this only touches public fields.
export function applyShot(game, shot) {
  const rng = makeRng(1234);
  const p = game.player;
  const lm = game.city.landmarks;

  if (shot === 'start') {
    game.state = 'start';
    return;
  }

  game.state = 'playing';
  game.started = true;

  if (shot === 'foot') {
    // On foot at a busy Old Town intersection, mission 1 live.
    p.x = 600; p.y = 600;
    p.angle = -Math.PI / 4;
    p.inCar = false; p.car = null;
    game.cash = 1250;
    game.missions.startMission(0);
    seedStreet(game, rng, 600, 600, 8, 7);
    return;
  }

  if (shot === 'drive') {
    // Behind the wheel of a yellow sports car, mid-traffic on the Strip.
    // Start far enough west that the cruise never reaches the world's edge.
    const car = makeCar(CAR_MODELS[4], 1200, 1500, 0);
    car.driver = 'player';
    game.cars.push(car);
    p.inCar = true; p.car = car;
    p.x = car.x; p.y = car.y; p.angle = 0;
    car.speed = 210;
    game.shotCruise = true; // keep cruising so the shot reads as driving
    game.cash = 3420;
    game.missions.startMission(3);
    seedStreet(game, rng, 1800, 1500, 6, 9);
    // A couple of cars ahead in the same lane, spaced out.
    const ahead1 = makeCar(CAR_MODELS[1], 2680, 1492, 0);
    ahead1.driver = 'traffic'; ahead1.targetSpeed = 130; ahead1.speed = 130;
    const ahead2 = makeCar(CAR_MODELS[2], 2920, 1530, 0);
    ahead2.driver = 'traffic'; ahead2.targetSpeed = 120; ahead2.speed = 120;
    game.cars.push(ahead1, ahead2);
    return;
  }

  if (shot === 'chase') {
    // Three stars, two police cars closing in, mission 5 (bank job) live.
    const car = makeCar(CAR_MODELS[4], 1800, 900, Math.PI / 2);
    car.driver = 'player';
    car.speed = 260;
    game.cars.push(car);
    p.inCar = true; p.car = car;
    p.x = car.x; p.y = car.y; p.angle = Math.PI / 2;
    game.shotCruise = true; // keep fleeing so the chase stays dynamic
    game.cash = 8750;
    game.missions.startMission(4);
    game.missions.stage = 'escape';
    game.missions.targetPos = { x: lm.marasGarage.x, y: lm.marasGarage.y };
    game.police.heat = 3 * 60 + 20;
    game.police.wanted = 3;
    game.police.coolTimer = 0;
    // Two cop cars right behind, one foot cop ahead.
    const cop1 = makeCar(CAR_MODELS[6], 1800, 620, Math.PI / 2);
    cop1.driver = 'police'; cop1.speed = 300;
    const cop2 = makeCar(CAR_MODELS[6], 1840, 700, Math.PI / 2);
    cop2.driver = 'police'; cop2.speed = 280;
    game.police.units = [
      { kind: 'car', car: cop1, x: cop1.x, y: cop1.y, speed: cop1.speed },
      { kind: 'car', car: cop2, x: cop2.x, y: cop2.y, speed: cop2.speed },
    ];
    game.cars.push(cop1, cop2);
    seedStreet(game, rng, 1800, 900, 5, 6);
    return;
  }
}

// Fill the streets around (x, y) with traffic cars and pedestrians so a
// posed scene reads as a living city. Spawns keep their distance from
// each other and from the player, so nothing piles up on the shot.
function seedStreet(game, rng, x, y, carCount, pedCount) {
  game.cars = game.cars.filter(c => c.driver === 'player' || c.driver === 'police');
  game.peds = [];
  let placed = 0, tries = 0;
  while (placed < carCount && tries < 80) {
    tries++;
    const car = spawnCarNear(rng, x + range(rng, -500, 500), y + range(rng, -400, 400), true);
    if (game.cars.some(c => Math.hypot(c.x - car.x, c.y - car.y) < 130)) continue;
    game.cars.push(car);
    placed++;
  }
  for (let i = 0; i < pedCount; i++) {
    game.peds.push(spawnPedNear(rng, x + range(rng, -420, 420), y + range(rng, -360, 360)));
  }
}
